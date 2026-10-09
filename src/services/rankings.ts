import { request, jsonp } from './eastmoney';

export interface Quote {
  code: string;
  market?: number;
  name: string;
  price: number | null;
  change: number | null;
  amount: number | null;
  volume: number | null;
  flow: number | null;
}
interface Response { data?: { total?: number; diff?: Record<string, unknown>[] } }
const numeric = (v: unknown): number | null => v === null || v === undefined || v === '' || v === '-' || !Number.isFinite(Number(v)) ? null : Number(v);
function parse(row: Record<string, unknown>): Quote {
  return { market: numeric(row.f13) ?? undefined, code: String(row.f12), name: String(row.f14), price: numeric(row.f2), change: numeric(row.f3), amount: numeric(row.f6), volume: numeric(row.f5), flow: numeric(row.f62) };
}
export async function fetchRanking(industry: boolean): Promise<Quote[]> {
  return fetchList(industry ? 'm:90 t:2' : 'm:90 t:3', 'f62');
}

export async function fetchSectorStocks(code: string): Promise<Quote[]> {
  if (!/^BK[0-9]+$/.test(code)) throw new Error('无效板块代码');
  return fetchList('b:' + code, 'f5');
}

async function fetchList(fs: string, fid: string): Promise<Quote[]> {
  const rows = new Map<string, Quote>();
  for (let pn = 1; pn <= 30; pn++) {
    const params = {
      fs, fields: 'f12,f13,f14,f2,f3,f5,f6,f62',
      fid, po: '1', pz: '100', pn: String(pn), np: '1', fltt: '2', invt: '2',
    };
    let result: Response;
    try {
      result = await request<Response>('/api/qt/clist/get', params);
    } catch {
      result = await jsonp<Response>('https://push2.eastmoney.com/api/qt/clist/get?' + new URLSearchParams(params));
    }
    if (result.data?.total === 0) return [];
    if (!result.data || !Array.isArray(result.data.diff)) throw new Error('板块接口未返回有效数据：' + JSON.stringify(result).slice(0, 300));
    const diff = result.data.diff;
    const before = rows.size;
    diff.forEach(row => rows.set(String(row.f13 ?? '') + '.' + String(row.f12), parse(row)));
    if (!diff.length && result.data.total !== undefined && rows.size < result.data.total) throw new Error('行情分页数据不完整');
    if (!diff.length || (result.data.total !== undefined && rows.size >= result.data.total) || (result.data.total === undefined && diff.length < 100)) return [...rows.values()];
    if (rows.size === before) throw new Error('板块分页数据不完整，请重试');
  }
  throw new Error('板块数据超过分页上限');
}
export async function fetchMarket(): Promise<Quote[]> {
  const result = await request<Response>('/api/qt/ulist.np/get', {
    secids: '1.000001,0.399001,0.399006', fields: 'f12,f14,f2,f3,f6', fltt: '2', invt: '2',
  });
  if (!Array.isArray(result.data?.diff) || result.data.diff.length !== 3) throw new Error('大盘接口暂不可用');
  return result.data.diff.map(parse);
}
