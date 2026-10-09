import { historyDate, dailyFlow } from '../services/history';
import { initStocks, showStocks, hideStocks } from './constituents';
import type { Quote } from '../services/rankings';
import { fetchIntraday } from '../services/eastmoney';
import { buildLineChart } from '../charts/svgLineChart';
import type { ChartMeta, SeriesItem } from '../types';
import { blocked, whitelist, addBlocked, removeBlocked, addWhitelist, removeWhitelist, settings, updateSettings } from '../core/store';
import { BASKET_KEYWORDS, INDUSTRY_WHITELIST } from '../config';
import { tradingNow, statusText } from '../core/schedule';

const esc = (s: string): string => s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]!);
const money = (n: number | null): string => n === null ? '—' : `${n > 0 ? '+' : ''}${(n / 1e8).toFixed(2)}亿`;
const $ = (id: string): HTMLElement => document.getElementById(id)!;
const name = (s: string): string => s.replace(/[ⅡⅢ]+$/, '');
const has = (set: Set<string>, s: string): boolean => set.has(s) || set.has(name(s));
let all: Quote[] = [];
let industry = true;
let onChange = (): void => {};
let revision = 0;
let active = 'ranking';
let chartToken = 0;
let chartKey = '';
let selected: string | null = null;
let filterBaskets = false;
let filterIndustry = false;
let samples: { at: number; session: string; values: Map<string, number> }[] = [];
let meta: ChartMeta | null = null;
try { const p = JSON.parse(localStorage.getItem('sf_filters') || '{}'); filterBaskets = p.baskets === true; filterIndustry = p.industry === true; } catch { /* defaults */ }
const clamp = (n: number, min: number, max: number, fallback: number): number => Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
settings.top = Math.round(clamp(settings.top, 3, 50, 8));
settings.anomalyWin = clamp(settings.anomalyWin, 1, 30, 5);
settings.anomalyFloor = clamp(settings.anomalyFloor, .1, 100, 2);
settings.anomalyRank = Math.round(clamp(settings.anomalyRank, 1, 20, 3));
settings.intervalSec = clamp(settings.intervalSec, 30, 600, 60);
export function refreshSeconds(): number { return settings.intervalSec; }
export function visibleQuotes(rows: Quote[]): Quote[] {
  return rows.filter(q => !has(blocked, q.name) && !(filterBaskets && !industry && BASKET_KEYWORDS.some(k => q.name.includes(k))) && !(filterIndustry && industry && !INDUSTRY_WHITELIST.has(q.name)));
}
function chinaNow(): Date { return new Date(new Date().toLocaleString('en-US', {timeZone:'Asia/Shanghai'})); }
function sample(): void {
  const now = chinaNow();
  const session = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours() < 12 ? 'am' : 'pm'}`;
  if (historyDate || !tradingNow(now)) { samples = []; return; }
  samples = samples.filter(s => s.session === session && now.getTime() - s.at <= 40 * 60000);
  samples.push({at:now.getTime(), session, values:new Map(all.filter(q => q.flow !== null).map(q => [q.code, q.flow!]))});
}
export function updateInsights(rows: Quote[], isIndustry: boolean, fresh = false): void {
  if (industry !== isIndustry || !rows.length) { samples = []; selected = null; hideStocks(); }
  industry = isIndustry; all = rows;
  if (fresh) { revision++; sample(); }
  render();
}
function actions(q: Quote): string {
  return `<button data-watch="${esc(q.name)}" aria-label="${has(whitelist,q.name) ? '取消自选' : '加入自选'} ${esc(q.name)}">${has(whitelist,q.name) ? '★ 已自选' : '☆ 自选'}</button><button data-block="${esc(q.name)}" aria-label="屏蔽 ${esc(q.name)}">屏蔽</button>`;
}
export function rowActions(q: Quote): string { return `<button class="sector-open" data-detail="${esc(q.code)}">${esc(q.name)} <span>↗</span></button><span class="quick-actions">${actions(q)}</span>`; }
function miniList(rows: Quote[]): string {
  return rows.length ? rows.map((q,i) => `<div class="mini-row"><span>${i+1}</span><button data-detail="${esc(q.code)}">${esc(q.name)}</button><strong class="${q.flow! > 0 ? 'positive':'negative'}">${money(q.flow)}</strong></div>`).join('') : '<p class="muted">暂无符合条件的数据</p>';
}
function render(): void {
  const quotes = visibleQuotes(all);
  const flows = quotes.filter(q => q.flow !== null).sort((a,b) => b.flow! - a.flow!);
  const ins = flows.filter(q => q.flow! > 0), outs = flows.filter(q => q.flow! < 0).reverse();
  $('insight-summary').innerHTML = `<article><span>最强流入</span><strong class="positive">${esc(ins[0]?.name ?? '—')}</strong><small>${money(ins[0]?.flow ?? null)}</small></article><article><span>最强流出</span><strong class="negative">${esc(outs[0]?.name ?? '—')}</strong><small>${money(outs[0]?.flow ?? null)}</small></article><article><span>资金广度 · 流入 / 流出</span><strong>${all.length ? `${ins.length} / ${outs.length}` : '—'}</strong><small>${flows.length} 个有效板块 · ${flows.filter(q=>q.flow===0).length} 个持平</small></article><article><span>交易时段 · 北京时间</span><strong class="session-label">${historyDate || esc(statusText(chinaNow()).replace('盘中实时','盘中 · 延时行情'))}</strong><small>${historyDate ? '历史日行情 · 不提供分钟异动回放' : '异动仅盘中采集，不跨午休累计'}</small></article>`;
  $('in-leaders').innerHTML = miniList(ins.slice(0,settings.top));
  $('out-leaders').innerHTML = miniList(outs.slice(0,settings.top));
  $('leader-count').textContent = `各 Top ${settings.top} · 当前分类与筛选范围`;
  $('watch-chips').innerHTML = [...whitelist].map(n => `<button class="chip" data-watch="${esc(n)}">★ ${esc(n)} ×</button>`).join('') || '<p class="muted">还没有自选板块。在排行榜点击「☆ 自选」，或在下方输入名称添加。</p>';
  $('blocked-chips').innerHTML = [...blocked].map(n => `<button class="chip" data-unblock="${esc(n)}">${esc(n)} ×</button>`).join('') || '<p class="muted">暂无屏蔽板块</p>';
  $('sector-options').innerHTML = all.map(q=>`<option value="${esc(q.name)}"></option>`).join('');
  const watched = all.filter(q=>has(whitelist,q.name) && !has(blocked,q.name));
  $('watch-rows').innerHTML = watched.map(q=>`<div class="watch-row"><button data-detail="${esc(q.code)}">${esc(q.name)}</button><span>净流入 <strong class="${(q.flow??0)>=0?'positive':'negative'}">${money(q.flow)}</strong></span>${actions(q)}</div>`).join('');
  $('watch-status').textContent = `当前${industry?'行业':'概念'}分类匹配 ${watched.length} 个自选 · 自选绕过自动筛选，但仍受手动屏蔽影响`;
  $('refresh-cadence').textContent = historyDate ? '历史模式 · 自动刷新暂停' : `每 ${settings.intervalSec} 秒自动更新`;
  renderAnomalies(quotes);
  if (active === 'flow' || active === 'watch') void loadChart();
}
function renderAnomalies(quotes: Quote[]): void {
  if(historyDate){$('anomalies').innerHTML='<p class="muted">历史模式不提供分钟异动，日级数据不能还原盘中异动。</p>';return;}
  const latest = samples.at(-1);
  const target = (latest?.at ?? 0) - settings.anomalyWin * 60000;
  const prev = samples.filter(s => s.at <= target && target - s.at <= settings.intervalSec * 1500).at(-1);
  $('anomaly-title').textContent = `近 ${settings.anomalyWin} 分钟异动`;
  if (!tradingNow(chinaNow())) { $('anomalies').innerHTML = '<p class="muted">非盘中，不计算资金异动。</p>'; return; }
  if (!latest || !prev) { $('anomalies').innerHTML = `<p class="muted">正在积累快照，需连续观察约 ${settings.anomalyWin} 分钟。网络中断或切换分类后重新积累。</p>`; return; }
  const deltas = quotes.filter(q => latest.values.has(q.code) && prev.values.has(q.code)).map(q=>({...q,delta:latest.values.get(q.code)! - prev.values.get(q.code)!}));
  const incoming = deltas.filter(q=>q.delta>=settings.anomalyFloor*1e8).sort((a,b)=>b.delta-a.delta).slice(0,settings.anomalyRank);
  const outgoing = deltas.filter(q=>q.delta<=-settings.anomalyFloor*1e8).sort((a,b)=>a.delta-b.delta).slice(0,settings.anomalyRank);
  $('anomalies').innerHTML = `<p class="muted">阈值 ${settings.anomalyFloor} 亿 · 急流入 ${incoming.length} / 急流出 ${outgoing.length} · 快照间隔 ${((latest.at-prev.at)/60000).toFixed(1)} 分钟</p>` + ([...incoming,...outgoing].map(q=>`<div class="mini-row"><button data-detail="${esc(q.code)}">${esc(q.name)}</button><strong class="${q.delta>0?'positive':'negative'}">Δ ${money(q.delta)}</strong><small>累计 ${money(q.flow)}</small></div>`).join('') || '<p class="muted">近期无超阈值异动。</p>');
}
async function loadChart(force = false): Promise<void> {
  const base = active === 'watch' ? all.filter(q=>has(whitelist,q.name) && !has(blocked,q.name)) : visibleQuotes(all);
  const flows = base.filter(q=>q.flow !== null).sort((a,b)=>b.flow!-a.flow!);
  const chosen = selected ? all.filter(q=>q.code===selected && !has(blocked,q.name)) : active === 'watch' ? base : [...flows.filter(q=>q.flow!>0).slice(0,settings.top), ...flows.filter(q=>q.flow!<0).reverse().slice(0,settings.top)];
  const key = `${historyDate}:${active}:${revision}:${chosen.map(q=>q.code).join(',')}`;
  if (!force && key===chartKey) return;
  chartKey=key; const token=++chartToken; meta=null;
  $('chart-time').hidden=true; $('chart-values').innerHTML='';
  $('chart-title').textContent = selected ? `${chosen[0]?.name ?? '板块'} · 累计主力资金` : active==='watch' ? '自选板块 · 资金分时对比' : '流入 / 流出领跑板块 · 资金分时';
  if(historyDate)$('chart-title').textContent=(selected ? chosen[0]?.name ?? '板块' : '板块对比') + ' · 最多 30 个交易日日资金流（截至 '+historyDate+'）';
  $('chart-reset').hidden=!selected;
  if (!chosen.length) { $('flow-chart').innerHTML='<p class="empty">暂无可绘制的板块，请等待榜单数据或添加自选。</p>'; $('chart-status').textContent=''; return; }
  $('flow-chart').innerHTML='<p class="empty">正在读取分时数据…</p>';
  $('chart-status').textContent=`正在加载 ${chosen.length} 个板块`;
  const series: SeriesItem[]=[]; let failed=0; let cursor=0;
  await Promise.all(Array.from({length:Math.min(4,chosen.length)},async()=>{
    while(cursor<chosen.length && token===chartToken){
      const q=chosen[cursor++];
      try { const points=historyDate ? (await dailyFlow('90.'+q.code)).filter(p=>p[0]<=historyDate).slice(-30) : await fetchIntraday(q.code); if(points.length) series.push([q.name,points,points.at(-1)![1]]); else failed++; } catch { failed++; }
    }
  }));
  if(token!==chartToken)return;
  const chart=buildLineChart(series.sort((a,b)=>b[2]-a[2]),historyDate ? '每日主力净流入 / 亿元（非累计）' : '累计主力净流入 / 亿元'); meta=chart.meta;
  $('flow-chart').innerHTML=chart.svg;
  $('chart-status').textContent=`成功 ${series.length} / ${chosen.length} 个板块${failed?' · 部分数据不可用，点击重试':''} · 桌面悬停，手机拖动时间条`;
  const slider=$('chart-time') as HTMLInputElement; slider.hidden=!meta; slider.max=String(Math.max(0,(meta?.axis.length??1)-1)); slider.value=slider.max; showTime(Number(slider.value));
}
function showTime(index:number):void {
  if(!meta)return; const t=meta.axis[index];
  $('chart-values').innerHTML=`<strong>${esc(t)}</strong>`+meta.series.map(s=>`<span><i style="background:${s.color}"></i>${esc(s.name)} <b>${s.map[t]===undefined?'—':money(s.map[t]!*1e8)}</b></span>`).join('');
}
function switchView(view:string):void {
  active=view; selected=null; hideStocks();
  document.querySelectorAll<HTMLElement>('[data-view-panel]').forEach(p=>p.hidden=p.dataset.viewPanel!==view);
  document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===view)));
  $('chart-panel').hidden=view!=='flow'&&view!=='watch';
  if(view==='flow'||view==='watch')void loadChart();else { chartToken++;chartKey=''; }
}
export function initInsights(change:()=>void):void {
  onChange=change;
  const nav=document.createElement('nav'); nav.className='workspace-nav';nav.setAttribute('aria-label','市场功能');
  nav.innerHTML=[['ranking','板块排行'],['flow','资金动向'],['watch','自选追踪'],['settings','筛选设置']].map(([v,l])=>`<button data-view="${v}" aria-pressed="${v==='ranking'}">${l}</button>`).join('');
  const ranking=document.querySelector<HTMLElement>('.ranking-panel')!; ranking.dataset.viewPanel='ranking';ranking.before(nav);
  const scope=document.createElement('div');scope.className='scope-bar';scope.innerHTML='<span>当前数据范围 · 各页面共用</span>';scope.append($('category'));nav.before(scope);
  const host=document.createElement('div');host.id='insights';
  host.innerHTML=`<div id="insight-summary" class="insight-summary"></div>
  <section data-view-panel="flow" hidden><div class="insight-heading"><h2>资金动向</h2><span id="leader-count" class="muted"></span></div><div class="dual-panels"><article class="insight-card"><h3>主力净流入榜</h3><div id="in-leaders"></div></article><article class="insight-card"><h3>主力净流出榜</h3><div id="out-leaders"></div></article></div><article class="insight-card"><h3 id="anomaly-title">资金异动</h3><div id="anomalies"></div></article></section>
  <section data-view-panel="watch" class="insight-card" hidden><h2>自选追踪</h2><p id="watch-status" class="muted"></p><div id="watch-chips" class="chips"></div><form id="watch-form" class="manage-form"><input id="watch-input" list="sector-options" placeholder="输入板块名称" aria-label="自选板块名称" required><button>添加自选</button></form><div id="watch-rows"></div></section>
  <section data-view-panel="settings" class="insight-card" hidden><h2>筛选与设置</h2><p class="muted">设置保存在当前浏览器，沿用原有自选和屏蔽名单。</p><div class="settings-grid"><label><input id="filter-baskets" type="checkbox" ${filterBaskets?'checked':''}>过滤概念中的风格 / 指数 / 业绩篮子</label><label><input id="filter-industry" type="checkbox" ${filterIndustry?'checked':''}>启用旧版行业近似名单</label><label>流入 / 流出各 Top N<input data-setting="top" type="number" min="3" max="50" value="${settings.top}"></label><label>刷新间隔（秒）<input data-setting="intervalSec" type="number" min="30" max="600" value="${settings.intervalSec}"></label><label>异动窗口（分钟）<input data-setting="anomalyWin" type="number" min="1" max="30" value="${settings.anomalyWin}"></label><label>异动阈值（亿元）<input data-setting="anomalyFloor" type="number" min="0.1" max="100" step="0.1" value="${settings.anomalyFloor}"></label><label>每侧异动条数<input data-setting="anomalyRank" type="number" min="1" max="20" value="${settings.anomalyRank}"></label></div><h3>屏蔽名单</h3><div id="blocked-chips" class="chips"></div><form id="block-form" class="manage-form"><input id="block-input" list="sector-options" placeholder="输入要屏蔽的板块" aria-label="屏蔽板块名称" required><button>屏蔽板块</button></form><p id="preference-status" class="muted" role="status"></p></section>
  <section id="chart-panel" class="insight-card" hidden><div class="insight-heading"><h3 id="chart-title">资金分时</h3><div><button id="chart-reset" hidden>返回多板块对比</button><button id="chart-retry">重试分时</button></div></div><p id="chart-status" class="muted" role="status"></p><div class="chart-scroll"><div id="flow-chart"></div></div><input id="chart-time" type="range" min="0" max="0" value="0" aria-label="分时查看时刻" hidden><div id="chart-values" class="chart-values"></div></section><datalist id="sector-options"></datalist>`;
  ranking.after(host); nav.after($('insight-summary')); nav.before($('rank-status')); initStocks();
  document.addEventListener('click',event=>{
    const b=(event.target as HTMLElement).closest<HTMLButtonElement>('button');if(!b)return;
    if(b.dataset.view){switchView(b.dataset.view);return;}
    const watch=b.dataset.watch,block=b.dataset.block,unblock=b.dataset.unblock;
    if(watch!==undefined){ if(has(whitelist,watch)){removeWhitelist(watch);removeWhitelist(name(watch));}else addWhitelist(watch); }
    else if(block!==undefined)addBlocked(block);
    else if(unblock!==undefined)removeBlocked(unblock);
    else if(b.dataset.detail){ switchView('flow'); selected=b.dataset.detail; void loadChart();const sector=all.find(q=>q.code===selected);if(sector)showStocks(sector);return; }
    else return;
    chartKey='';onChange();render();
  });
  for(const kind of ['watch','block'])$(kind+'-form').addEventListener('submit',e=>{e.preventDefault();const input=$(kind+'-input') as HTMLInputElement; if(!input.value.trim())return; (kind==='watch'?addWhitelist:addBlocked)(input.value.trim());input.value='';chartKey='';onChange();render();});
  for(const id of ['filter-baskets','filter-industry'])$(id).addEventListener('change',()=>{filterBaskets=($('filter-baskets') as HTMLInputElement).checked;filterIndustry=($('filter-industry') as HTMLInputElement).checked;try{localStorage.setItem('sf_filters',JSON.stringify({baskets:filterBaskets,industry:filterIndustry}));}catch{$('preference-status').textContent='无法保存设置，本次会话仍有效。';}chartKey='';onChange();render();});
  document.querySelectorAll<HTMLInputElement>('[data-setting]').forEach(input=>input.addEventListener('change',()=>{if(!input.checkValidity()||!input.value){input.reportValidity();return;}updateSettings({[input.dataset.setting!]:Number(input.value)});chartKey='';render();$('preference-status').textContent='设置已更新';}));
  $('chart-retry').addEventListener('click',()=>void loadChart(true));
  $('chart-reset').addEventListener('click',()=>{selected=null;hideStocks();void loadChart();});
  $('chart-time').addEventListener('input',e=>showTime(Number((e.target as HTMLInputElement).value)));
  $('flow-chart').addEventListener('pointermove',e=>{if(!meta)return;const svg=$('flow-chart').querySelector('svg');if(!svg)return;const r=svg.getBoundingClientRect();const i=Math.max(0,Math.min(meta.axis.length-1,Math.round((((e.clientX-r.left)/r.width)*meta.W-meta.ML)/meta.pw*meta.nx)));($('chart-time') as HTMLInputElement).value=String(i);showTime(i);});
  render();
}
