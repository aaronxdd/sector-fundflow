import { jsonp } from './eastmoney';
import type { Quote } from './rankings';

export let historyDate = '';
export function setHistoryDate(date: string): void { historyDate = date; }
export function chinaDate(): string { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date()); }
interface KlineResponse { data?: { klines?: string[] } | null }
interface Day { date: string; price: number | null; change: number | null; volume: number | null; amount: number | null }
const number = (s: string | undefined): number | null => s && s !== '-' && Number.isFinite(Number(s)) ? Number(s) : null;
const cache = new Map<string, { at: number; value: string[] }>();
const pending = new Map<string, Promise<string[]>>();
const universes = new Map<string,{at:number;quotes:Quote[]}>();
export async function historicalUniverse(key:string, load:()=>Promise<Quote[]>):Promise<Quote[]> {
  const entry=universes.get(key);
  if(entry && Date.now()-entry.at<5*60000)return entry.quotes;
  const quotes=await load();universes.set(key,{at:Date.now(),quotes});return quotes;
}
export function clearHistoryCache(): void { cache.clear(); universes.clear(); }
async function lines(secid: string, flow = false): Promise<string[]> {
  const key = `${secid}:${flow}:${chinaDate()}`;
  const cached = cache.get(key);
  if (cached && Date.now()-cached.at < 10*60000) return cached.value;
  const running = pending.get(key); if (running) return running;
  const promise = (async () => {
    const params = new URLSearchParams({ secid, klt:'101', fqt:'0', lmt:'40', end:'20500101', fields1:flow?'f1,f2,f3,f7':'f1,f2,f3,f4,f5,f6', fields2:flow?'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f62,f63,f64,f65':'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61' });
    const path=`/api/qt/stock/${flow?'fflow/daykline':'kline'}/get?${params.toString().replace(/%2C/g, ',')}`;
    let data:KlineResponse;
    if(import.meta.env.DEV){
      const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),20000);
      try{const response=await fetch('/api/history'+path,{signal:controller.signal});if(!response.ok)throw new Error('历史接口 HTTP '+response.status);data=await response.json() as KlineResponse;}catch{data=await jsonp<KlineResponse>('https://push2his.eastmoney.com'+path);}finally{clearTimeout(timer);}
    }else data=await jsonp<KlineResponse>('https://push2his.eastmoney.com'+path);
    if (!Array.isArray(data.data?.klines)) throw new Error('历史行情不可用');
    const value = data.data.klines;
    cache.set(key, {at:Date.now(),value});
    return value;
  })();
  pending.set(key,promise);
  try { return await promise; } finally { pending.delete(key); }
}
export async function daily(secid: string): Promise<Day[]> {
  return (await lines(secid)).map(line => { const p=line.split(',');return {date:p[0],price:number(p[2]),volume:number(p[5]),amount:number(p[6]),change:number(p[8])}; }).filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d.date));
}
export async function dailyFlow(secid: string): Promise<[string,number][]> {
  return (await lines(secid,true)).map(line=>line.split(',')).filter(p=>/^\d{4}-\d{2}-\d{2}$/.test(p[0]) && number(p[1])!==null).map(p=>[p[0],Number(p[1])/1e8]);
}
export async function tradingDates(): Promise<string[]> {
  const dates=[...new Set((await daily('1.000001')).map(d=>d.date).filter(d=>d<chinaDate()))].sort().reverse().slice(0,30);
  if (!dates.length) throw new Error('未取得历史交易日期');
  return dates;
}
export interface HistoricalResult { quotes: Quote[]; prices: number; flows: number; total: number }
export async function historicalQuotes(universe: Quote[], date: string, sectors: boolean, progress: (done:number,total:number)=>void = ()=>{}, cancelled:()=>boolean = ()=>false): Promise<HistoricalResult> {
  let cursor=0,done=0,prices=0,flows=0;
  const quotes: Quote[]=new Array(universe.length);
  await Promise.all(Array.from({length:Math.min(4,universe.length)},async()=>{
    while(cursor<universe.length && !cancelled()){
      const i=cursor++, q=universe[i];
      const secid=sectors?`90.${q.code}`:q.market!==undefined?`${q.market}.${q.code}`:'';
      const historical:Quote={...q,price:null,change:null,volume:null,amount:null,flow:null};
      if(secid){
        try { const day=(await daily(secid)).find(d=>d.date===date);if(day){Object.assign(historical,{price:day.price,change:day.change,volume:day.volume,amount:day.amount});if(day.volume!==null)prices++;} } catch { /* keep missing, never use current quotes */ }
        if(sectors && !cancelled())try {const point=(await dailyFlow(secid)).find(p=>p[0]===date);if(point){historical.flow=point[1]*1e8;flows++;}}catch{/* unavailable */}
      }
      quotes[i]=historical;progress(++done,universe.length);
    }
  }));
  if(cancelled())throw new Error('历史查询已取消');
  if(universe.length && !prices && !flows)throw new Error('所选日期历史数据全部缺失');
  return {quotes,prices,flows,total:universe.length};
}
export async function historicalMarket(date:string):Promise<Quote[]> {
  return Promise.all([['1','000001','上证指数'],['0','399001','深证成指'],['0','399006','创业板指']].map(async([market,code,name])=>{
    const d=(await daily(`${market}.${code}`)).find(d=>d.date===date);
    if(!d)throw new Error('指数历史数据缺失');
    return {code,name,market:Number(market),price:d.price,change:d.change,volume:d.volume,amount:d.amount,flow:null};
  }));
}
