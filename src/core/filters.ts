/**
 * 板块名过滤与筛选：篮子关键词剔除、行业白名单、用户屏蔽、显示名清洗。
 */
import { BASKET_KEYWORDS, INDUSTRY_WHITELIST } from '../config';
import type { SectorRef, SectorRow } from '../types';
import { blocked, settings, whitelist } from './store';

/** 是否「伪板块」（风格 / 股价 / 业绩等统计篮子） */
export function isBasket(name: string): boolean {
  return BASKET_KEYWORDS.some((k) => name.includes(k));
}

/** 显示名：行业去掉申万的 Ⅱ / Ⅲ 后缀，更接近 App 习惯 */
export function cleanName(name: string): string {
  return settings.industry ? name.replace(/[ⅡⅢ]+$/, '') : name;
}

/** 是否保留该板块：概念=剔篮子；行业=白名单；再剔掉用户手动屏蔽的 */
export function accept(rawName: string): boolean {
  const ok = settings.industry ? INDUSTRY_WHITELIST.has(rawName) : !isBasket(rawName);
  return ok && !blocked.has(cleanName(rawName));
}

/**
 * 从「按净流入降序」的全量板块里挑出要画线的：头部 top 个 + 尾部 top 个，去重。
 * @param sectors [code, rawName, netFlow元]，需已按净流入降序
 */
export function selectSectors(sectors: readonly SectorRow[], top: number): SectorRef[] {
  const real = sectors.filter((r) => accept(r[1]));
  const head = real.slice(0, top);
  const tail = real.slice(-top);
  const seen = new Set<string>();
  const out: SectorRef[] = [];
  for (const r of head.concat(tail)) {
    if (!seen.has(r[0])) {
      seen.add(r[0]);
      out.push([r[0], cleanName(r[1])]);
    }
  }
  return out;
}

/**
 * 按显示名挑选白名单板块（不受篮子过滤影响，但仍受用户屏蔽限制）。
 */
export function selectWhitelist(sectors: readonly SectorRow[]): SectorRef[] {
  const picked: SectorRef[] = [];
  const seen = new Set<string>();
  for (const [code, rawName] of sectors) {
    const name = cleanName(rawName);
    if (seen.has(name)) continue;
    if (whitelist.has(name) && !blocked.has(name)) {
      seen.add(name);
      picked.push([code, name]);
    }
  }
  return picked;
}

/** 当前板块列表里所有可搜索的显示名（去重排序），用于白名单输入框下拉 */
export function allDisplayNames(sectors: readonly SectorRow[]): string[] {
  return [...new Set(sectors.map((r) => cleanName(r[1])))].sort();
}
