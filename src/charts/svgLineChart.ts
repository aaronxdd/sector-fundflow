/**
 * 纯 SVG 折线图（无第三方图表库）：主力资金净流入累计分时曲线。
 * 输出 { svg, meta }：svg 是可直接插入 DOM 的字符串，meta 供十字线悬停定位。
 *
 * 配色跟随页面「墨板」体系（见 styles/tokens.css 的 --plate-*）：
 * 板内一律无彩色，颜色只用来表达资金方向。
 */
import { esc } from '../ui/dom';
import type { ChartMeta, IntradayPoint, LineChartResult, SeriesItem } from '../types';

/* ---------- 图表配色（对应 styles/tokens.css 的 --plate-*，白底浅网格）---------- */

const PLATE_TEXT = '#0f172a';
const PLATE_LABEL = '#94a3b8';
const RULE = '#e9eef5';
const RULE_ZERO = '#cbd5e1';
const FONT_SANS = '-apple-system, Segoe UI, Roboto, PingFang SC, sans-serif';
const FONT_MONO = 'SF Mono, JetBrains Mono, Menlo, PingFang SC, monospace';

const EMPTY_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="120" viewBox="0 0 1024 120">' +
  '<text x="18" y="62" fill="' + PLATE_LABEL + '" font-size="13" font-family="' + FONT_SANS + '">' +
  '暂无分时数据（非交易时段或数据未就绪）</text></svg>';

/* ---------- 颜色 / 刻度 ---------- */

/** HSL → #rrggbb（h ∈ [0,360)，s/l ∈ [0,1]） */
function hslHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;
  let r: number, g: number, b: number;
  if (h < 60) { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }
  const H = (v: number): string => ('0' + Math.round((v + m) * 255).toString(16)).slice(-2);
  return '#' + H(r) + H(g) + H(b);
}

/** 找一个「好看」的刻度步长，使刻度数量接近 target */
function niceStep(span: number, target = 6): number {
  if (span <= 0) return 1;
  const raw = span / target;
  const mag = raw >= 1 ? Math.pow(10, String(Math.floor(raw)).length - 1) : 0.1;
  for (const mm of [1, 2, 2.5, 5, 10]) if (raw <= mm * mag) return mm * mag;
  return 10 * mag;
}

/**
 * 折线配色：颜色表达资金方向而非排名。
 * 红 = 净流入、绿 = 净流出（A 股约定）；白底上同方向内按排名由深到浅，
 * 越靠前越深越突出——浅底需要的是加饱和，不是加亮度。
 */
export function seriesColor(side: 'in' | 'out', index: number, count: number): string {
  const t = count <= 1 ? 0 : index / (count - 1);
  return side === 'in'
    ? hslHex(355, 0.82 - 0.22 * t, 0.46 + 0.14 * t)
    : hslHex(152, 0.66 - 0.14 * t, 0.36 + 0.14 * t);
}

/* ---------- 主入口 ---------- */

/**
 * @param seriesList [名称, 时序, 末端值(亿)]，需已按末端值降序
 * @param title      图表左上角标题
 */
export function buildLineChart(seriesList: readonly SeriesItem[], title: string): LineChartResult {
  const W = 1024, H = 520, ML = 54, MR = 206, MT = 34, MB = 40;
  const pw = W - ML - MR;
  const ph = H - MT - MB;

  // 时间轴 = 所有序列时刻的并集（按出现顺序）
  const axis: string[] = [];
  const seen = new Set<string>();
  for (const [, s] of seriesList) {
    for (const [t] of s) if (!seen.has(t)) { seen.add(t); axis.push(t); }
  }
  axis.sort();
  if (!axis.length) return { svg: EMPTY_SVG, meta: null };

  const xidx: Record<string, number> = {};
  axis.forEach((t, i) => { xidx[t] = i; });
  const nx = Math.max(axis.length - 1, 1);

  const vals: number[] = [];
  for (const [, s] of seriesList) for (const [, v] of s) vals.push(v);
  let vmin = Math.min(...vals);
  let vmax = Math.max(...vals);
  const pad = (vmax - vmin) * 0.06 || 1;
  vmin -= pad;
  vmax += pad;

  const X = (i: number): number => ML + (pw * i) / nx;
  const Y = (v: number): number => MT + (ph * (vmax - v)) / (vmax - vmin);

  const P: string[] = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H +
    '" font-family="' + FONT_SANS + '">',
  ];

  // 横向刻度：数字保持裸值，单位交给标题，避免每格重复「亿」
  const step = niceStep(vmax - vmin);
  let g = (Math.floor(vmin / step) - 1) * step;
  while (g <= vmax) {
    if (g >= vmin && g <= vmax) {
      const y = Y(g);
      const zero = Math.abs(g) < 1e-9;
      P.push('<line x1="' + ML + '" y1="' + y.toFixed(1) + '" x2="' + (ML + pw) + '" y2="' + y.toFixed(1) +
        '" stroke="' + (zero ? RULE_ZERO : RULE) + '" stroke-width="1"/>');
      const lbl = zero ? '0' : (g > 0 ? '+' : '') + g.toFixed(1);
      P.push('<text x="' + (ML - 8) + '" y="' + (y + 4).toFixed(1) + '" font-size="11" fill="' + PLATE_LABEL +
        '" text-anchor="end">' + lbl + '</text>');
    }
    g += step;
  }

  // 纵向时间刻度（每 15 分钟一个）
  axis.forEach((t, i) => {
    const mm = t.split(':');
    if ((mm.length === 2 && ['00', '15', '30', '45'].includes(mm[1])) || (t.includes('-') && (i % Math.max(1,Math.ceil(axis.length/6)) === 0 || i===axis.length-1))) {
      const x = X(i);
      P.push('<line x1="' + x.toFixed(1) + '" y1="' + MT + '" x2="' + x.toFixed(1) + '" y2="' + (MT + ph) +
        '" stroke="' + RULE + '" stroke-width="1"/>');
      P.push('<text x="' + x.toFixed(1) + '" y="' + (MT + ph + 16) + '" font-size="11" fill="' + PLATE_LABEL +
        '" text-anchor="middle">' + (t.includes('-') ? t.slice(5) : t) + '</text>');
    }
  });

  // 折线 + 末端点
  const n = seriesList.length;
  const inCount = seriesList.filter((row) => row[2] >= 0).length;
  const outCount = n - inCount;
  // seriesList 已按末端值降序，故前 inCount 条必为流入端
  const colorOf = (rank: number, final: number): string =>
    final >= 0 ? seriesColor('in', rank, inCount) : seriesColor('out', rank - inCount, outCount);

  const labels: Array<[y: number, name: string, final: number, color: string]> = [];
  seriesList.forEach((row, rank) => {
    const [name, s, final] = row;
    const color = colorOf(rank, final);
    const pts = s.filter(([t]) => t in xidx)
      .map(([t, v]) => X(xidx[t]).toFixed(1) + ',' + Y(v).toFixed(1))
      .join(' ');
    if (!pts) return;
    P.push('<polyline points="' + pts + '" fill="none" stroke="' + color +
      '" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>');
    const [lt, lv] = s[s.length - 1];
    const ex = X(xidx[lt]);
    const ey = Y(lv);
    P.push('<circle cx="' + ex.toFixed(1) + '" cy="' + ey.toFixed(1) + '" r="2.4" fill="' + color + '"/>');
    labels.push([ey, name, final, color]);
  });

  // 右侧末端标签（防重叠 + 防溢出）
  labels.sort((a, b) => a[0] - b[0]);
  for (let i = 1; i < labels.length; i++) {
    if (labels[i][0] - labels[i - 1][0] < 15) labels[i][0] = labels[i - 1][0] + 15;
  }
  const overflow = labels.length ? labels[labels.length - 1][0] - (H - 6) : 0;
  if (overflow > 0) labels.forEach((r) => { r[0] -= overflow; });
  const lx = ML + pw + 12;
  for (const [y, name, final, color] of labels) {
    P.push('<text x="' + lx + '" y="' + (y + 4).toFixed(1) + '" font-size="12" fill="' + color + '">' +
      esc(name) + ' ' + (final >= 0 ? '+' : '') + final.toFixed(2) + '亿</text>');
  }

  P.push('<text x="' + ML + '" y="20" font-size="13" fill="' + PLATE_TEXT +
    '" font-family="' + FONT_MONO + '">' + esc(title) + '</text>');
  P.push('</svg>');

  const meta: ChartMeta = {
    W, ML, pw, nx, axis,
    series: seriesList.map((row, rank) => {
      const map: Record<string, number> = {};
      row[1].forEach((p: IntradayPoint) => { map[p[0]] = p[1]; });
      return { name: row[0], color: colorOf(rank, row[2]), map };
    }),
  };

  return { svg: P.join('\n'), meta };
}
