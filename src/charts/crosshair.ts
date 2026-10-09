/**
 * 图表十字线 + 悬浮数值框：主图和白名单图共用同一份实现。
 * 通过 getMeta() 惰性取最新的图表元数据，刷新后无需重新绑定事件。
 */
import { esc } from '../ui/dom';
import type { ChartMeta } from '../types';

export interface CrosshairOptions {
  /** 承载图表的定位容器 */
  container: HTMLElement;
  /** 放 SVG 的宿主元素 */
  svgHost: HTMLElement;
  /** 竖线元素 */
  crosshair: HTMLElement;
  /** 悬浮数值框 */
  tooltip: HTMLElement;
  /** 惰性读取当前图表元数据（刷新后会换新对象） */
  getMeta: () => ChartMeta | null;
}

export interface CrosshairHandle {
  hide: () => void;
}

interface HoverRow {
  name: string;
  color: string;
  v: number;
}

export function attachCrosshair(
  { container, svgHost, crosshair, tooltip, getMeta }: CrosshairOptions,
): CrosshairHandle {
  function hide(): void {
    crosshair.style.display = 'none';
    tooltip.style.display = 'none';
  }

  container.addEventListener('mousemove', (e: MouseEvent) => {
    const meta = getMeta();
    if (!meta || !meta.series.length) { hide(); return; }

    const svg = svgHost.querySelector('svg');
    if (!svg) { hide(); return; }

    const sr = svg.getBoundingClientRect();
    const cr = container.getBoundingClientRect();

    // 鼠标 x → viewBox x → 时间轴下标
    const vbX = ((e.clientX - sr.left) / sr.width) * meta.W;
    let i = Math.round(((vbX - meta.ML) / meta.pw) * meta.nx);
    i = Math.max(0, Math.min(meta.nx, i));

    const t = meta.axis[i];
    if (!t) { hide(); return; }

    const rows: HoverRow[] = meta.series
      .map((s) => ({ name: s.name, color: s.color, v: s.map[t] }))
      .filter((x): x is HoverRow => x.v != null)
      .sort((a, b) => b.v - a.v);
    if (!rows.length) { hide(); return; }

    const chartX = ((meta.ML + (meta.pw * i) / meta.nx) / meta.W) * sr.width;
    crosshair.style.left = (sr.left - cr.left + chartX) + 'px';
    crosshair.style.display = 'block';

    tooltip.innerHTML =
      '<div class="t">' + esc(t) + '</div>' +
      rows.map((x) =>
        '<div class="row"><span class="nm"><i style="background:' + x.color + '"></i>' + esc(x.name) +
        '</span><span>' + (x.v >= 0 ? '+' : '') + x.v.toFixed(1) + '亿</span></div>',
      ).join('');
    tooltip.style.display = 'block';

    let tx = e.clientX - cr.left + 14;
    let ty = e.clientY - cr.top + 12;
    if (tx + tooltip.offsetWidth > cr.width) tx = Math.max(4, e.clientX - cr.left - tooltip.offsetWidth - 14);
    if (ty + tooltip.offsetHeight > cr.height) ty = Math.max(4, cr.height - tooltip.offsetHeight - 4);
    tooltip.style.left = tx + 'px';
    tooltip.style.top = ty + 'px';
  });

  container.addEventListener('mouseleave', hide);
  return { hide };
}
