/**
 * 东方财富数据接口。
 *
 * 两种取数通道：
 *  1) JSONP（默认）—— 浏览器 <script> 天然跨域，build 后静态部署也能跑；
 *  2) Vite dev 代理 —— .env 里设 VITE_EM_PROXY=1，走 /api/em 转发，用 fetch，报错更清晰。
 */
import { API } from '../config';
import type { IntradayPoint, SectorRow } from '../types';

/* ---------- 传输层 ---------- */

let jsonpSeq = 0;

/** JSONP 回调挂在 window 上，这里用宽松索引签名访问 */
type CallbackHost = Record<string, unknown>;

/**
 * JSONP：东财接口支持 cb 回调参数。
 * 通过注入 <script> 绕开跨域限制，代价是只能拿 JSONP 格式且无法读到错误细节。
 */
export function jsonp<T>(url: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const cb = `__emcb${++jsonpSeq}_${Date.now()}`;
    const host = window as unknown as CallbackHost;
    const script = document.createElement('script');
    let done = false;
    let timer: ReturnType<typeof setTimeout>;

    const clean = (): void => {
      done = true;
      clearTimeout(timer);
      try {
        delete host[cb];
      } catch {
        host[cb] = undefined;
      }
      script.remove();
    };

    host[cb] = (data: T): void => {
      done = true;
      clean();
      resolve(data);
    };
    script.onerror = (): void => {
      if (!done) {
        clean();
        reject(new Error('网络/跨域失败'));
      }
    };
    script.src = url + (url.includes('?') ? '&' : '?') + 'cb=' + cb;

    timer = setTimeout(() => {
      if (!done) {
        clean();
        reject(new Error('请求超时'));
      }
    }, API.timeoutMs);
    document.body.appendChild(script);
  });
}

function buildUrl(path: string, params: Record<string, string>): string {
  const qs = new URLSearchParams(params).toString();
  const base = API.useProxy ? API.proxyPrefix + path : API.host + path;
  return base + (qs ? '?' + qs : '');
}

/** 统一的请求入口，返回解析后的 JSON */
export async function request<T>(path: string, params: Record<string, string>): Promise<T> {
  if (API.useProxy) {
    const url = buildUrl(path, params);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), API.timeoutMs);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return (await res.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }
  return jsonp<T>(buildUrl(path, params));
}

/* ---------- 数据源响应形状 ---------- */

/** 板块列表单行：f12=代码、f14=名称、f62=主力净流入 */
interface ClistRow {
  f12: string;
  f14: string;
  f62: string | number;
}

interface ClistResponse {
  data?: { diff?: ClistRow[] };
}

interface KlineResponse {
  data?: { klines?: string[] };
}

/* ---------- 业务接口 ---------- */

/**
 * 拉取板块列表（当日主力净流入降序）。
 * @param industry true = 行业板块(m:90+t:2)，false = 概念板块(m:90+t:3)
 * @returns [code, name, 主力净流入(元)]，已按净流入降序
 */
export async function fetchAllSectors(industry: boolean): Promise<SectorRow[]> {
  const fs = industry ? 'm:90+t:2' : 'm:90+t:3';
  const merged: Record<string, SectorRow> = {};

  for (let pn = 1; pn <= API.maxPage; pn++) {
    const params: Record<string, string> = {
      fid: 'f62', po: '1', pz: String(API.pageSize), pn: String(pn),
      np: '1', fltt: '2', invt: '2', fs, fields: 'f12,f14,f62',
    };
    let data: ClistResponse;
    try {
      data = await request<ClistResponse>('/api/qt/clist/get', params);
    } catch (e) {
      console.warn('[eastmoney] 板块列表第 ' + pn + ' 页失败', e);
      break;
    }
    const diff = data.data?.diff ?? [];
    if (!diff.length) break;
    for (const x of diff) merged[x.f12] = [x.f12, x.f14, +x.f62];
    if (diff.length < API.pageSize) break;
  }

  return Object.values(merged).sort((a, b) => b[2] - a[2]);
}

/**
 * 拉取单个板块的当日分时资金流。
 * @param code 板块代码
 * @returns [["09:30", 净流入(亿)], ...]
 */
export async function fetchIntraday(code: string): Promise<IntradayPoint[]> {
  const params: Record<string, string> = {
    lmt: '0', klt: '1',
    fields1: 'f1,f2,f3,f7',
    fields2: 'f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f62,f63,f64,f65',
    secid: '90.' + code,
  };
  const data = await request<KlineResponse>('/api/qt/stock/fflow/kline/get', params);
  const klines = data.data?.klines ?? [];

  const series: IntradayPoint[] = [];
  for (const line of klines) {
    const p = line.split(',');
    if (p.length < 2) continue;
    const ts = p[0];
    const hhmm = ts.includes(' ') ? ts.split(' ').pop()!.slice(0, 5) : ts.slice(0, 5);
    const v = parseFloat(p[1]);
    if (!Number.isNaN(v)) series.push([hhmm, v / 1e8]);
  }
  return series;
}
