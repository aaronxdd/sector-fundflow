import fs from 'node:fs';
import assert from 'node:assert/strict';
import { JSDOM, VirtualConsole } from 'jsdom';
const html = fs.readFileSync('dist/index.html', 'utf8');
const bundle = fs.readFileSync('dist/' + html.match(/src="\/([^" ]+\.js)"/)[1], 'utf8');
const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', e => errors.push(e));
const dom = new JSDOM(html, { url: 'http://localhost/', runScripts: 'dangerously', virtualConsole: vc });
const { window: w } = dom;
const doc = w.document;
let testTime = Date.parse('2026-09-28T02:00:00Z');
const RealDate = w.Date;
w.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : [testTime])); } static now() { return testTime; } };
let robotFlow = 3e8;
let stockFail = false;
let stockCalls = 0;
let fail = false;
let delayedIndustry = false;
const sectors = [
  { f12: 'BK01', f14: '半导体', f5: 250000, f62: 100000000, f3: 2.1 },
  { f12: 'BK02', f14: '银行', f5: 500000, f62: -200000000, f3: -1.2 },
  { f12: 'BK03', f14: '缺失数据', f5: '-', f62: '-', f3: '-' },
];
const create = doc.createElement.bind(doc);
doc.createElement = function(tag) {
  const node = create(tag);
  if (tag !== 'script') return node;
  Object.defineProperty(node, 'src', { set(url) {
    const u = new URL(url), p = u.searchParams;
    const industry = p.get('fs')?.endsWith('t:2');
    const stockRequest = p.get('fs')?.startsWith('b:');
    if (stockRequest) { assert.equal(p.get('fs'), 'b:BK04'); assert.equal(p.get('fid'), 'f5'); stockCalls++; }
    const historyRequest = u.hostname === 'push2his.eastmoney.com';
    const historyDays = Array.from({length:42},(_,i)=>new Date(Date.UTC(2026,7,3+i)).toISOString().slice(0,10)).filter(d=>![0,6].includes(new Date(d).getUTCDay()));
    const historyRows = p.get('secid')==='0.000003' ? [] : historyDays.map(d=>u.pathname.includes('daykline') ? `${d},-500000000` : `${d},10,11,12,9,${p.get('secid')==='0.000001'?90000:20000},100000000,2,1,1,2`);
    const response = historyRequest ? {data:{klines:historyRows}} : stockRequest ? stockFail ? {} : {data:{total:3,diff:p.get('pn')==='1' ? [
      {f13:0,f12:'000001',f14:'股票甲',f5:10000,f2:10,f3:1},
      {f13:0,f12:'000002',f14:'股票乙',f5:50000,f2:20,f3:-2}
    ] : [{f13:0,f12:'000003',f14:'股票丙',f5:'-',f2:'-',f3:'-'}]}} : u.pathname.includes('kline') ? {data:{klines:['2026-09-28 09:30,100000000','2026-09-28 09:35,300000000']}} : u.pathname.includes('ulist') ? { data: { diff: [
      { f12: '000001', f14: '上证指数', f6: 1e12, f2: 3000, f3: 1 },
      { f12: '399001', f14: '深证成指', f6: 2e12, f2: 10000, f3: -1 },
      { f12: '399006', f14: '创业板指', f6: 5e11, f2: 2000, f3: 2 },
    ] } } : fail ? {} : { data: { total: industry ? 3 : 1, diff: industry ? (p.get('pn') === '1' ? sectors.slice(0,2) : sectors.slice(2)) : [{f12:'BK04',f14:'机器人',f5:12345,f62:robotFlow,f3:3}] } };
    setTimeout(() => w[p.get('cb')]?.(response), industry && delayedIndustry ? 70 : 0);
  }});
  return node;
};
w.eval(bundle);
const wait = () => new Promise(r => setTimeout(r, 160));
const q = s => doc.querySelector(s);
const names = () => [...doc.querySelectorAll('#rows .sector-open')].map(n => n.childNodes[0].textContent.trim());
await wait();
assert.deepEqual(names(), ['银行','半导体','缺失数据']);
assert.equal(q('#total-amount').textContent, '3.00万亿');
assert.match(q('#rows').textContent, /50.00万手/);
q('[data-metric="flow"]').click();
assert.deepEqual(names(), ['半导体','银行','缺失数据']);
q('#direction').click();
assert.deepEqual(names(), ['银行','半导体','缺失数据']);
q('#search').value = '半导体'; q('#search').dispatchEvent(new w.Event('input'));
assert.deepEqual(names(), ['半导体']);
q('#search').value = '不存在'; q('#search').dispatchEvent(new w.Event('input'));
assert.equal(q('#empty').hidden, false);
q('#search').value = ''; q('#search').dispatchEvent(new w.Event('input'));
fail = true; q('#refresh').click(); await wait();
assert.equal(names().length, 3);
assert.match(q('#rank-status').textContent, /更新失败/);
fail = false;
q('[data-industry="false"]').click(); await wait();
assert.deepEqual(names(), ['机器人']);
delayedIndustry = true;
q('[data-industry="true"]').click();
q('[data-industry="false"]').click();
await wait();
assert.deepEqual(names(), ['机器人']);
q('[data-view="ranking"]').click();
q('[data-watch="机器人"]').click();
assert.match(w.localStorage.getItem('sf_whitelist'), /机器人/);
q('[data-view="watch"]').click(); await wait();
assert.match(q('#watch-rows').textContent, /机器人/);
assert.ok(q('#flow-chart svg polyline'));
assert.match(q('#chart-values').textContent, /09:35/);
q('#chart-time').value='0'; q('#chart-time').dispatchEvent(new w.Event('input'));
assert.match(q('#chart-values').textContent, /09:30/);
q('[data-view="ranking"]').click();
q('#rows [data-block="机器人"]').click();
assert.equal(names().length, 0);
q('[data-view="settings"]').click();
q('[data-unblock="机器人"]').click();
assert.deepEqual(names(), ['机器人']);
q('[data-setting="top"]').value='5';q('[data-setting="top"]').dispatchEvent(new w.Event('change'));
assert.equal(JSON.parse(w.localStorage.getItem('sf_settings')).top, 5);
q('[data-view="flow"]').click(); await wait();
assert.ok(q('#flow-chart svg polyline'));
assert.match(q('#in-leaders').textContent, /机器人/);
testTime += 6 * 60000; robotFlow = 6e8; q('#refresh').click(); await wait();
assert.match(q('#anomalies').textContent, /机器人/);
assert.match(q('#anomalies').textContent, /Δ \+3.00亿/);
q('[data-view="ranking"]').click();
q('#rows [data-detail="BK04"]').click(); await wait();
assert.equal(q('#stock-panel').hidden, false);
assert.match(q('#stock-title').textContent, /机器人/);
const stockNames = () => [...doc.querySelectorAll('#stock-rows strong')].map(n=>n.textContent);
assert.deepEqual(stockNames(), ['股票乙','股票甲','股票丙']);
assert.equal(stockCalls, 2);
q('#stock-order').click();
assert.deepEqual(stockNames(), ['股票甲','股票乙','股票丙']);
q('#stock-search').value='000002';q('#stock-search').dispatchEvent(new w.Event('input'));
assert.deepEqual(stockNames(), ['股票乙']);
q('#stock-search').value='';q('#stock-search').dispatchEvent(new w.Event('input'));
stockFail=true;q('#stock-refresh').click();await wait();
assert.match(q('#stock-status').textContent, /刷新失败/);
assert.equal(stockNames().length,3);
q('[data-view="watch"]').click();
assert.equal(q('#stock-panel').hidden, true);
q('#watch-chips [data-watch="机器人"]').click();
assert.equal(q('#watch-rows').textContent, '');
stockFail=false;
const dateOptions=[...doc.querySelectorAll('#history-date option')];
assert.equal(dateOptions.length,31);
const chosenDate=dateOptions[1].value;
q('#history-date').value=chosenDate;q('#history-date').dispatchEvent(new w.Event('change'));await wait();
assert.match(q('#rank-status').textContent,/成交量覆盖 1\/1/);
assert.match(q('#rows').textContent,/2.00万手/);
assert.match(q('#rows').textContent,/-5.00亿/);
assert.match(q('#anomalies').textContent,/历史模式不提供分钟异动/);
assert.equal(q('#total-amount').textContent,'2.00亿');
q('[data-view="ranking"]').click();q('#rows [data-detail="BK04"]').click();await wait();
assert.deepEqual(stockNames(),['股票甲','股票乙','股票丙']);
assert.match(q('#stock-status').textContent,/历史成交量覆盖 2\/3/);
assert.match(q('#stock-context').textContent,/按当前成分名单回看历史/);
assert.match(q('#stock-price-heading').textContent,/收盘价/);
assert.match(q('#chart-title').textContent,/交易日日资金流/);
q('#history-date').value='';q('#history-date').dispatchEvent(new w.Event('change'));await wait();
assert.equal(q('#stock-panel').hidden,true);
assert.match(q('#rank-status').textContent,/当日累计行情/);
assert.equal(q('#total-amount').textContent,'3.00万亿');
q('#history-date').value=chosenDate;q('#history-date').dispatchEvent(new w.Event('change'));
q('#history-date').value='';q('#history-date').dispatchEvent(new w.Event('change'));await wait();
assert.match(q('#rank-status').textContent,/当日累计行情/);
assert.equal(q('#total-amount').textContent,'3.00万亿');
assert.equal(errors.length, 0);
w.close();
console.log('SMOKE PASSED: 分页、成交量排序、净流入排序、缺失值、搜索、空态、失败保留、两市去重、切换竞态、自选持久化、屏蔽恢复、分时图与时间滑块、设置、30日日期列表、历史行情隔离、覆盖率、历史个股排序、历史切换竞态');
