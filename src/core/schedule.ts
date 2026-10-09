/**
 * 交易日历 / 交易时段判断 + 时间格式化。
 */
import { SESSIONS, TRADE_DAYS_2026, TRADE_YEAR } from '../config';

export function pad2(n: number): string {
  return (n < 10 ? '0' : '') + n;
}

export function isTradingDay(d: Date): boolean {
  return d.getFullYear() === TRADE_YEAR && TRADE_DAYS_2026.has(pad2(d.getMonth() + 1) + pad2(d.getDate()));
}

export function tradingNow(d: Date = new Date()): boolean {
  if (!isTradingDay(d)) return false;
  const t = d.getHours() * 60 + d.getMinutes();
  return SESSIONS.some(([a, b]) => t >= a && t <= b);
}

export function statusText(d: Date = new Date()): string {
  if (!isTradingDay(d)) return '⚪ 非交易日（最近收盘）';
  if (tradingNow(d)) return '🟢 盘中实时';
  const t = d.getHours() * 60 + d.getMinutes();
  if (t > SESSIONS[0][1] && t < SESSIONS[1][0]) return '🟡 午间休市';
  return '🔵 盘前/已收盘';
}

/** 剩余秒数 → "4分59秒" */
export function formatCountdown(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return Math.floor(s / 60) + '分' + pad2(s % 60) + '秒';
}

export function formatClock(d: Date): string {
  return d.toLocaleTimeString('zh-CN');
}

/** 金额（亿元）→ "+12.3亿" */
export function fmtYi(v: number): string {
  return (v >= 0 ? '+' : '') + v.toFixed(1) + '亿';
}
