/**
 * 异动扫描：对比当前快照与 N 分钟前的快照，找出 Δ净流入超过阈值的板块。
 */
import type { AnomalyResult, AnomalyRow, Snapshot } from '../types';
import { settings } from './store';

/**
 * @param curr 当前快照
 * @param prev N 分钟前的快照，可为 null（历史不足）
 * @returns 按 Δ 绝对值排序的流入 / 流出榜，各取前 anomalyRank 个
 */
export function scanAnomalies(curr: Snapshot, prev: Snapshot | null): AnomalyResult {
  const { anomalyRank: rank, anomalyFloor: floor } = settings;
  if (!prev) return { inflow: [], outflow: [] };

  const deltas: AnomalyRow[] = [];
  for (const code in curr) {
    if (!(code in prev)) continue;
    const [name, cum] = curr[code];
    deltas.push([name, cum - prev[code][1], cum]);
  }

  return {
    inflow: deltas.filter((x) => x[1] >= floor).sort((a, b) => b[1] - a[1]).slice(0, rank),
    outflow: deltas.filter((x) => x[1] <= -floor).sort((a, b) => a[1] - b[1]).slice(0, rank),
  };
}
