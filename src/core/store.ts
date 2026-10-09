/**
 * 运行时状态：设置 / 屏蔽名单 / 白名单 / 异动历史 / 图表元数据。
 * 需要持久化的写 localStorage，带 onChange 订阅，UI 只订阅不直接摸存储。
 */
import { DEFAULT_SETTINGS, STORAGE_KEYS } from '../config';
import type { ChartMeta, Settings, Snapshot } from '../types';

/* ---------- 小工具 ---------- */
function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch (e) {
    console.warn('[store] 读取本地存储失败', key, e);
    return fallback;
  }
}

function writeJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn('[store] 写入本地存储失败', key, e);
  }
}

/* ---------- 极简事件总线 ---------- */

export const EVENTS = {
  settings: 'settings',
  blocked: 'blocked',
  whitelist: 'whitelist',
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];

/** 事件名 → 载荷类型 */
export interface EventPayloads {
  settings: Settings;
  blocked: Set<string>;
  whitelist: Set<string>;
}

export type Listener<K extends EventName> = (payload: EventPayloads[K]) => void;

/** 订阅者统一按键存成 unknown 载荷，出栈时由 emit 保证类型正确 */
type RawListener = (payload: unknown) => void;

const listeners = new Map<EventName, Set<RawListener>>();

/** 返回取消订阅函数 */
export function on<K extends EventName>(event: K, fn: Listener<K>): () => void {
  let set = listeners.get(event);
  if (!set) {
    set = new Set();
    listeners.set(event, set);
  }
  const target = set;
  const raw = fn as RawListener;
  target.add(raw);
  return () => {
    target.delete(raw);
  };
}

function emit<K extends EventName>(event: K, payload: EventPayloads[K]): void {
  const set = listeners.get(event);
  if (set) set.forEach((fn) => fn(payload));
}

/* ---------- 设置 ---------- */
export const settings: Settings = {
  ...DEFAULT_SETTINGS,
  ...readJSON<Partial<Settings>>(STORAGE_KEYS.settings, {}),
};

export function updateSettings(patch: Partial<Settings>): void {
  Object.assign(settings, patch);
  writeJSON(STORAGE_KEYS.settings, settings);
  emit(EVENTS.settings, settings);
}

/* ---------- 屏蔽名单 ---------- */
export const blocked: Set<string> = new Set(readJSON<string[]>(STORAGE_KEYS.blocked, []));

export function addBlocked(name: string): boolean {
  const n = (name || '').trim();
  if (!n || blocked.has(n)) return false;
  blocked.add(n);
  writeJSON(STORAGE_KEYS.blocked, [...blocked]);
  emit(EVENTS.blocked, blocked);
  return true;
}

export function removeBlocked(name: string): boolean {
  const n = (name || '').trim();
  if (!blocked.delete(n)) return false;
  writeJSON(STORAGE_KEYS.blocked, [...blocked]);
  emit(EVENTS.blocked, blocked);
  return true;
}

/* ---------- 白名单 ---------- */
export const whitelist: Set<string> = new Set(readJSON<string[]>(STORAGE_KEYS.whitelist, []));

export function addWhitelist(name: string): boolean {
  const n = (name || '').trim();
  if (!n || whitelist.has(n)) return false;
  whitelist.add(n);
  writeJSON(STORAGE_KEYS.whitelist, [...whitelist]);
  emit(EVENTS.whitelist, whitelist);
  return true;
}

export function removeWhitelist(name: string): boolean {
  const n = (name || '').trim();
  if (!whitelist.delete(n)) return false;
  writeJSON(STORAGE_KEYS.whitelist, [...whitelist]);
  emit(EVENTS.whitelist, whitelist);
  return true;
}

/* ---------- 异动历史快照（内存，不持久化）---------- */

export interface SnapshotEntry {
  t: Date;
  snap: Snapshot;
}

export const history: SnapshotEntry[] = [];

export function pushSnapshot(snapshot: Snapshot, now: Date = new Date()): void {
  history.push({ t: now, snap: snapshot });
  const cutoff = now.getTime() - Math.max(40, settings.anomalyWin * 4) * 60000;
  while (history.length && history[0].t.getTime() < cutoff) history.shift();
}

export function clearHistory(): void {
  history.length = 0;
}

/** 取「now 往前 winMin 分钟」处最接近且不晚于该时刻的快照 */
export function pickSnapshot(now: Date, winMin: number): Snapshot | null {
  const target = now.getTime() - winMin * 60000;
  let best: Snapshot | null = null;
  for (const h of history) {
    if (h.t.getTime() <= target) best = h.snap;
  }
  return best;
}

/* ---------- 图表元数据（供十字线悬停使用）---------- */

export interface ChartsState {
  main: ChartMeta | null;
  whitelist: ChartMeta | null;
}

export const charts: ChartsState = { main: null, whitelist: null };
