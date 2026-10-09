import { historyDate, historicalQuotes, historicalUniverse } from '../services/history';
import { fetchSectorStocks } from '../services/rankings';
import type { Quote } from '../services/rankings';
const $ = (id:string):HTMLElement => document.getElementById(id)!;
const esc = (s:string):string => s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]!);
let code = '', token = 0, rows: Quote[] = [], query = '', limit = 30, busy = false;
let direction = -1;
const volume = (v:number|null):string => v===null?'—':v>=1e8?`${(v/1e8).toFixed(2)}亿手`:v>=1e4?`${(v/1e4).toFixed(2)}万手`:`${v.toLocaleString('zh-CN')}手`;
function render():void {
  const sorted=[...rows].sort((a,b)=>a.volume===null ? b.volume===null?0:1 : b.volume===null?-1:direction*(a.volume-b.volume));
  const filtered=sorted.map((q,i)=>({q,rank:i+1})).filter(({q})=>(q.name+q.code).toLowerCase().includes(query.toLowerCase()));
  $('stock-rows').innerHTML=filtered.slice(0,limit).map(({q,rank})=>`<tr><td>${rank}</td><td><strong>${esc(q.name)}</strong><small>${esc(q.code)}</small></td><td class="selected-number">${volume(q.volume)}</td><td>${q.price?.toFixed(2)??'—'}</td><td class="${q.change===null?'neutral':q.change>=0?'positive':'negative'}">${q.change===null?'—':`${q.change>0?'+':''}${q.change.toFixed(2)}%`}</td></tr>`).join('');
  $('stock-count').textContent=`展示 ${Math.min(limit,filtered.length)} / ${filtered.length} 只 · 板块共 ${rows.length} 只`;
  $('stock-more').hidden=limit>=filtered.length;
  $('stock-empty').hidden=busy||filtered.length>0||!rows.length;
  $('stock-order').textContent=direction===-1?'成交量降序 ↓':'成交量升序 ↑';
  $('stock-volume-heading').setAttribute('aria-sort',direction===-1?'descending':'ascending');
}
async function load():Promise<void>{
  const current=++token;busy=true;
  $('stock-status').textContent=rows.length?'正在刷新，暂时保留上次数据…':'正在加载板块成分股…';
  $('stock-status').classList.remove('error');render();
  try{
    const sectorCode=code;
    const universe=historyDate ? await historicalUniverse('stocks:'+sectorCode,()=>fetchSectorStocks(sectorCode)) : await fetchSectorStocks(sectorCode);
    if(current!==token)return;
    const historical=historyDate?await historicalQuotes(universe,historyDate,false,(done,total)=>{if(current===token)$('stock-status').textContent=`正在获取 ${done}/${total} 只股票历史行情…`;},()=>current!==token):null;
    const result=historical?.quotes??universe;
    if(current!==token)return;
    rows=result;
    $('stock-status').textContent=historical?`${historyDate} · 当前成分名单 · 历史成交量覆盖 ${historical.prices}/${historical.total} · 缺失不作零处理`:result.length?`最近获取 ${new Date().toLocaleTimeString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})} · 当日累计成交量，行情可能延迟`:'该板块暂未返回成分股。';
  }catch{
    if(current!==token)return;
    $('stock-status').textContent=rows.length?'刷新失败，显示上次股票数据。可点击「刷新股票」。':'成分股接口暂不可用，请点击「刷新股票」重试。';
    $('stock-status').classList.add('error');
  }finally{if(current===token){busy=false;render();}}
}
export function hideStocks():void {token++;code='';busy=false;rows=[];if($('stock-panel'))$('stock-panel').hidden=true;}
export function showStocks(sector:Quote):void {
  code=sector.code;rows=[];query='';limit=30;direction=-1;
  ($('stock-search') as HTMLInputElement).value='';
  $('stock-price-heading').textContent=historyDate?'收盘价（元）':'现价（元）';
  $('stock-context').textContent=historyDate?`${historyDate} · 按当前成分名单回看历史，不代表当时成分名单。未上市、无行情或请求失败显示 —。成交量单位为手。`:'成交量以手计，1 手 = 100 股。按当日累计成交量排名，下方为板块资金分时。';
  $('stock-title').textContent=`${sector.name} · 成分股成交量排行`;
  $('stock-panel').hidden=false;
  void load();
  $('stock-panel').scrollIntoView?.({behavior:'smooth',block:'start'});
  $('stock-title').focus({preventScroll:true});
}
export function initStocks():void {
  const panel=document.createElement('section');panel.id='stock-panel';panel.className='insight-card';panel.hidden=true;
  panel.innerHTML=`<div class="insight-heading"><div><div class="eyebrow">CONSTITUENTS</div><h2 id="stock-title" tabindex="-1">板块成分股</h2></div><button id="stock-refresh">刷新股票</button></div><p id="stock-status" class="muted" role="status"></p><div class="stock-tools"><label class="search"><input id="stock-search" type="search" aria-label="搜索板块内股票" placeholder="搜索股票名称或代码"></label><button id="stock-order">成交量降序 ↓</button></div><div class="stock-table"><table><thead><tr><th>排名</th><th>股票 / 代码</th><th id="stock-volume-heading" aria-sort="descending">成交量（手）</th><th id="stock-price-heading">现价（元）</th><th>涨跌幅</th></tr></thead><tbody id="stock-rows"></tbody></table></div><p id="stock-empty" class="empty" hidden>没有匹配的股票。</p><div class="panel-footer"><span id="stock-count"></span><button id="stock-more" hidden>显示更多股票 ↓</button></div><p id="stock-context" class="muted">成交量以手计，1 手 = 100 股。排名按当日累计成交量计算，缺失数据排在末尾。下方保留本板块资金分时。</p>`;
  $('chart-panel').before(panel);
  $('stock-refresh').addEventListener('click',()=>{if(code&&!busy)void load();});
  $('stock-order').addEventListener('click',()=>{direction*=-1;render();});
  $('stock-search').addEventListener('input',e=>{query=(e.target as HTMLInputElement).value.trim();limit=30;render();});
  $('stock-more').addEventListener('click',()=>{limit+=30;render();});
}
