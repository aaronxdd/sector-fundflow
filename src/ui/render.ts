/**
 * 纯渲染函数：只负责把数据画到 DOM 上，不含取数与业务判断。
 */
import { clear, h } from './dom';
import { fmtYi, formatClock, statusText } from '../core/schedule';
import { settings } from '../core/store';
import type { AnomalyResult, AnomalyRow, SeriesItem } from '../types';

/* ---------- 屏蔽 / 白名单 chips ---------- */

export interface ChipsOptions {
  onRemove: (name: string) => void;
  emptyText: string;
  /** chip 上记录名字用的属性名，便于测试 / 调试定位 */
  removeAttr: string;
}

export function renderChips(
  container: HTMLElement,
  names: Iterable<string>,
  { onRemove, emptyText, removeAttr }: ChipsOptions,
): void {
  clear(container);
  const sorted = [...names].sort();
  if (!sorted.length) {
    container.appendChild(h('span', { class: 'empty', style: 'padding:0', text: emptyText }));
    return;
  }
  for (const name of sorted) {
    const b = h('b', { title: '移除', text: '✕' });
    b.setAttribute(removeAttr, name);
    b.addEventListener('click', () => onRemove(name));
    container.appendChild(h('span', { class: 'chip' }, [name, b]));
  }
}

/* ---------- 白名单输入框下拉 ---------- */
export function renderDatalist(datalist: HTMLElement, names: readonly string[]): void {
  clear(datalist);
  for (const name of names) datalist.appendChild(h('option', { value: name }));
}

/* ---------- 累计净流入榜 ---------- */

export interface LeaderboardHandlers {
  onWhitelist: (name: string) => void;
  onBlock: (name: string) => void;
}

export function renderLeaderboard(
  tbody: HTMLElement,
  seriesList: readonly SeriesItem[],
  handlers: LeaderboardHandlers,
): void {
  clear(tbody);
  const { top } = settings;
  const inflow = seriesList.filter((r) => r[2] >= 0).slice(0, top);
  const outflow = seriesList.filter((r) => r[2] < 0).slice(-top).reverse();

  if (!inflow.length && !outflow.length) {
    tbody.appendChild(h('tr', {}, h('td', { class: 'empty', text: '暂无' })));
    return;
  }

  const row = ([name, , value]: SeriesItem, dir: 'in' | 'out'): HTMLTableRowElement => {
    const plus = h('span', { class: 'b', title: '加入白名单', text: '+' });
    plus.addEventListener('click', () => handlers.onWhitelist(name));
    const ban = h('span', { class: 'b', title: '屏蔽此板块', text: '✕' });
    ban.addEventListener('click', () => handlers.onBlock(name));
    return h('tr', {}, [
      h('td', { class: dir, text: (dir === 'in' ? '▲ ' : '▼ ') + name }),
      h('td', { class: 'v ' + dir, text: fmtYi(value) }),
      h('td', { class: 'x' }, [plus, ban]),
    ]);
  };

  inflow.forEach((r) => tbody.appendChild(row(r, 'in')));
  outflow.forEach((r) => tbody.appendChild(row(r, 'out')));
}

/* ---------- 异动面板 ---------- */
export function renderAnomaly(container: HTMLElement, { inflow, outflow }: AnomalyResult, isTrading: boolean): void {
  clear(container);

  if (!inflow.length && !outflow.length) {
    container.appendChild(h('div', {
      class: 'empty',
      text: isTrading ? '暂无板块超过异动阈值' : '非盘中时段，不计算异动',
    }));
    return;
  }

  const build = (rows: readonly AnomalyRow[], dir: 'in' | 'out'): HTMLTableElement => {
    const tbody = h('tbody');
    const table = h('table', {}, tbody);
    for (const [name, delta, total] of rows) {
      tbody.appendChild(h('tr', {}, [
        h('td', { class: dir, text: (dir === 'in' ? '▲ ' : '▼ ') + name }),
        h('td', { class: 'v ' + dir, text: (dir === 'in' ? '+' : '') + delta.toFixed(1) + '亿' }),
        h('td', { class: 'v empty', text: '累计 ' + fmtYi(total) }),
      ]));
    }
    return table;
  };

  if (inflow.length) container.appendChild(build(inflow, 'in'));
  if (outflow.length) container.appendChild(build(outflow, 'out'));
}

/* ---------- 概览卡片 ---------- */

/** 概览卡片用到的元素 */
export interface CardEls {
  cardIn: HTMLElement;
  cardInMeta: HTMLElement;
  cardOut: HTMLElement;
  cardOutMeta: HTMLElement;
  cardAnom: HTMLElement;
  cardAnomMeta: HTMLElement;
  cardBreadth: HTMLElement;
  cardBreadthMeta: HTMLElement;
}

export interface CardsData {
  seriesList: readonly SeriesItem[];
  /** 净流入板块数 */
  nin: number;
  /** 净流出板块数 */
  nout: number;
  anomalies: AnomalyResult;
  isTrading: boolean;
}

export function renderCards(
  els: CardEls,
  { seriesList, nin, nout, anomalies, isTrading }: CardsData,
): void {
  const topIn = seriesList.find((r) => r[2] >= 0);
  const topOut = [...seriesList].reverse().find((r) => r[2] < 0);
  const { inflow, outflow } = anomalies;

  els.cardIn.textContent = topIn ? topIn[0] : '—';
  els.cardInMeta.textContent = topIn ? fmtYi(topIn[2]) : '—';

  els.cardOut.textContent = topOut ? topOut[0] : '—';
  els.cardOutMeta.textContent = topOut ? fmtYi(topOut[2]) : '—';

  els.cardAnom.textContent = inflow.length + outflow.length + ' 个';
  els.cardAnomMeta.textContent = isTrading
    ? '急流入 ' + inflow.length + '　急流出 ' + outflow.length
    : '盘中才计';

  els.cardBreadth.textContent = nin + ' / ' + nout;
  els.cardBreadthMeta.textContent = '净流入 ' + nin + '　净流出 ' + nout + '（共 ' + (nin + nout) + ' 板块）';
}

/* ---------- 头部状态 ---------- */

export interface StatusEls {
  status: HTMLElement;
  kindBadge: HTMLElement;
  updated: HTMLElement;
  lastt: HTMLElement;
  modTime: HTMLElement;
}

export interface StatusData {
  now: Date;
  /** 曲线最后一个时刻 */
  lastTime: string;
  /** 「概念」/「行业」 */
  kind: string;
}

export function renderStatus(els: StatusEls, { now, lastTime, kind }: StatusData): void {
  const st = statusText(now);
  els.status.textContent = st;
  els.kindBadge.textContent = kind + '板块';
  els.updated.textContent = formatClock(now);
  els.lastt.textContent = lastTime;
  els.modTime.innerHTML = '更新 ' + formatClock(now) + '<br>数据截至 ' + lastTime;
}
