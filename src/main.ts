import { historyDate, setHistoryDate, tradingDates, historicalQuotes, historicalMarket, historicalUniverse, clearHistoryCache } from './services/history';
import { initInsights, updateInsights, visibleQuotes, rowActions, refreshSeconds } from './ui/insights';
import './styles/dashboard.css';
import { fetchMarket, fetchRanking } from './services/rankings';
import type { Quote } from './services/rankings';

const el = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
let industry = true;
let metric: 'volume' | 'flow' = 'volume';
let descending = true;
let query = '';
let limit = 30;
let rows: Quote[] = [];
let generation = 0;
let loading = false;
const money = (v: number | null, signed = false): string => v === null ? '—' : `${signed && v > 0 ? '+' : ''}${(v / (Math.abs(v) >= 1e12 ? 1e12 : 1e8)).toFixed(2)}${Math.abs(v) >= 1e12 ? '万亿' : '亿'}`;
const volume = (v: number | null): string => v === null ? '—' : v >= 1e8 ? `${(v / 1e8).toFixed(2)}亿手` : v >= 1e4 ? `${(v / 1e4).toFixed(2)}万手` : `${v.toLocaleString('zh-CN')}手`;
const tone = (v: number | null): string => v === null || v === 0 ? 'neutral' : v > 0 ? 'positive' : 'negative';
const percent = (v: number | null): string => v === null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(2)}%`;
const escape = (v: string): string => v.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const time = (): string => new Date().toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
function render(): void {
  const sorted = visibleQuotes(rows).sort((a, b) => {
    const av = a[metric], bv = b[metric];
    if (av === null) return bv === null ? a.code.localeCompare(b.code) : 1;
    if (bv === null) return -1;
    return (descending ? bv - av : av - bv) || a.code.localeCompare(b.code);
  });
  const filtered = sorted.map((row, index) => ({ row, rank: index + 1 })).filter(({ row }) => `${row.name}${row.code}`.toLowerCase().includes(query.toLowerCase()));
  const max = Math.max(...rows.map(row => Math.abs(row[metric] ?? 0)), 1);
  el('rows').innerHTML = filtered.slice(0, limit).map(({ row, rank }) => `<tr><td><span class="rank ${rank <= 3 ? 'top-rank' : ''}">${String(rank).padStart(2, '0')}</span></td><td><div class="sector-name">${rowActions(row)}</div><span class="sector-code">${escape(row.code)}</span><div class="activity-track"><i class="${metric === 'flow' ? tone(row.flow) : ''}" style="width:${Math.abs(row[metric] ?? 0) / max * 100}%"></i></div></td><td class="number ${metric === 'volume' ? 'selected-number' : ''}">${volume(row.volume)}</td><td class="number ${tone(row.flow)} ${metric === 'flow' ? 'selected-number' : ''}">${money(row.flow, true)}</td><td><span class="change ${tone(row.change)}">${percent(row.change)}</span></td></tr>`).join('');
  el('empty').hidden = filtered.length > 0 || loading || rows.length === 0;
  el('count').textContent = `展示 ${Math.min(limit, filtered.length)} / ${filtered.length} 个板块`;
  el('more').hidden = filtered.length <= limit;
  el('direction').textContent = descending ? '降序 ↓' : '升序 ↑';
  el('rank-description').textContent = `按${historyDate || '当日'}${metric === 'volume' ? '累计成交量' : '主力净流入'}由${descending ? '高到低' : '低到高'}排列`;
  document.querySelectorAll<HTMLButtonElement>('[data-metric]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.metric === metric)));
  document.querySelectorAll<HTMLButtonElement>('[data-industry]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.industry === String(industry))));
  el('amount-heading').setAttribute('aria-sort', metric === 'volume' ? descending ? 'descending' : 'ascending' : 'none');
  el('flow-heading').setAttribute('aria-sort', metric === 'flow' ? descending ? 'descending' : 'ascending' : 'none');
}
async function loadRanking(): Promise<void> {
  const current = ++generation;
  loading = true;
  el('rank-status').textContent = rows.length ? '正在更新，当前显示上次成功获取的数据…' : `正在加载${industry ? '行业' : '概念'}板块…`;
  el('rank-status').classList.remove('error');
  render();
  try {
    const kind=industry;
    const universe = historyDate ? await historicalUniverse('sectors:'+kind,()=>fetchRanking(kind)) : await fetchRanking(kind);
    if(current !== generation)return;
    const historical = historyDate ? await historicalQuotes(universe, historyDate, true, (done,total)=>{if(current===generation)el('rank-status').textContent=`${historyDate} · 正在获取 ${done} / ${total} 个板块历史数据…`;},()=>current!==generation) : null;
    const result = historical?.quotes ?? universe;
    if (current !== generation) return;
    rows = result;
    updateInsights(rows, industry, true);
    el('rank-status').textContent = historical ? `${historyDate} · 成交量覆盖 ${historical.prices}/${historical.total} · 资金流覆盖 ${historical.flows}/${historical.total} · 缺失项显示 —，排名仅覆盖有效数据` : `● 最近获取 ${time()} · 当日累计行情（非实时）`;
  } catch (error) {
    console.warn('[rankings]', error);
    if (current !== generation) return;
    el('rank-status').textContent = rows.length ? '更新失败，保留上次数据。点击「刷新数据」重试。' : '板块数据暂不可用，请检查网络后点击「刷新数据」重试。';
    el('rank-status').classList.add('error');
  } finally {
    if (current === generation) { loading = false; render(); }
  }
}
let marketGeneration = 0;
async function loadMarket(): Promise<void> {
  const current = ++marketGeneration;
  const date = historyDate;
  try {
    const quotes = date ? await historicalMarket(date) : await fetchMarket();
    if(current !== marketGeneration)return;
    const sh = quotes.find(q => q.code === '000001')?.amount ?? null;
    const sz = quotes.find(q => q.code === '399001')?.amount ?? null;
    el('total-amount').textContent = money(sh !== null && sz !== null ? sh + sz : null);
    el('indices').innerHTML = quotes.map(q => `<article class="index-card"><div class="card-label">${escape(q.name)}<span class="index-code">${escape(q.code)}</span></div><div class="index-price ${tone(q.change)}">${q.price?.toFixed(2) ?? '—'}</div><div class="index-bottom"><span class="${tone(q.change)}">${percent(q.change)}</span><span>成交 ${money(q.amount)}</span></div></article>`).join('');
    el('market-status').textContent = `${date || '最新行情'} · 最近获取 ${time()} · 创业板成交额已包含在深证成交额中`;
    el('market-status').classList.remove('error');
  } catch {
    if(current !== marketGeneration)return;
    el('market-status').textContent = '大盘更新失败 · 已有数据保留，请点击刷新重试';
    el('market-status').classList.add('error');
  }
}
el('indices').innerHTML = ['上证指数', '深证成指', '创业板指'].map(name => `<article class="index-card"><div class="card-label">${name}</div><div class="index-price">—</div><div class="index-bottom">等待数据</div></article>`).join('');
el('category').addEventListener('click', event => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-industry]');
  if (!button || industry === (button.dataset.industry === 'true')) return;
  industry = button.dataset.industry === 'true'; rows = []; limit = 30; updateInsights(rows, industry); void loadRanking();
});
el('metrics').addEventListener('click', event => {
  const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-metric]');
  if (!button) return;
  metric = button.dataset.metric as 'volume' | 'flow'; descending = true; limit = 30; render();
});
el<HTMLInputElement>('search').addEventListener('input', event => { query = (event.target as HTMLInputElement).value.trim(); limit = 30; render(); });
el('direction').addEventListener('click', () => { descending = !descending; render(); });
el('more').addEventListener('click', () => { limit += 30; render(); });
el('refresh').addEventListener('click', () => { if (!loading) { if(historyDate)clearHistoryCache(); void loadRanking(); } void loadMarket(); });
let lastAuto = Date.now();
setInterval(() => { if (!historyDate && !document.hidden && Date.now() - lastAuto >= refreshSeconds() * 1000) { lastAuto = Date.now(); if (!loading) void loadRanking(); void loadMarket(); } }, 1000);
initInsights(() => { render(); updateInsights(rows, industry); });
const dateBar=document.createElement('section');dateBar.className='date-bar';
dateBar.innerHTML='<label for="history-date">查看交易日</label><select id="history-date" aria-label="查看交易日"><option value="">最新行情</option></select><button id="dates-retry">加载历史日期</button><span id="date-status" role="status">正在读取最近 30 个已结束交易日…</span>';
document.querySelector('.intro')!.after(dateBar);
async function loadDates():Promise<void>{
  const button=el<HTMLButtonElement>('dates-retry');button.disabled=true;
  try{const dates=await tradingDates();const select=el<HTMLSelectElement>('history-date');select.innerHTML='<option value="">最新行情</option>'+dates.map(d=>`<option value="${d}">${d}</option>`).join('');select.value=historyDate;el('date-status').textContent=`可回看 ${dates.length} 个交易日 · 历史个股按当前成分名单查询`;button.textContent='更新日期';}
  catch{el('date-status').textContent='历史日期加载失败，请重试；不会使用推算日期替代真实交易日。';button.textContent='重试历史日期';}
  finally{button.disabled=false;}
}
el('dates-retry').addEventListener('click',()=>void loadDates());
el('history-date').addEventListener('change',event=>{
  setHistoryDate((event.target as HTMLSelectElement).value);generation++;marketGeneration++;rows=[];limit=30;
  updateInsights(rows,industry);render();
  el('total-amount').textContent='—';el('indices').innerHTML='';el('market-status').textContent='正在读取所选日期的大盘数据…';
  const badge=document.querySelector('.total-card .card-label span');if(badge)badge.textContent=historyDate || '当日累计';
  void loadMarket();void loadRanking();
});
void loadDates();void loadMarket();void loadRanking();
