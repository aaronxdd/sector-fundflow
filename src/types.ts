/**
 * 全局共享类型：数据记录、时序、图表元数据、渲染入参。
 * 本文件只有类型、没有运行时逻辑（引用它的地方一律用 `import type`）。
 */

/* ================= 运行参数 ================= */

/** 用户可调运行参数（持久化在 localStorage） */
export interface Settings {
  /** false = 概念板块，true = 行业板块 */
  industry: boolean;
  /** 曲线 / 榜单各取流入、流出前 N 个 */
  top: number;
  /** 自动刷新间隔（秒） */
  intervalSec: number;
  /** 异动窗口（分钟） */
  anomalyWin: number;
  /** 异动榜各取前 N 个 */
  anomalyRank: number;
  /** 异动阈值（亿元） */
  anomalyFloor: number;
}

/* ================= 数据源 ================= */

/** 板块原始记录：[代码, 原始名, 主力净流入(元)] */
export type SectorRow = [code: string, rawName: string, netFlowYuan: number];

/** 板块引用（显示名已清洗）：[代码, 显示名] */
export type SectorRef = [code: string, displayName: string];

/** 分时点：["09:30", 累计净流入(亿)] */
export type IntradayPoint = [time: string, cumYi: number];

/** 折线项：[名称, 分时序列, 末端值(亿)]，末端值用于排序与末端标注 */
export type SeriesItem = [name: string, points: IntradayPoint[], finalYi: number];

/** 单次快照：板块代码 → [显示名, 累计净流入(亿)] */
export type Snapshot = Record<string, [name: string, cumYi: number]>;

/* ================= 异动 ================= */

/** 异动行：[名称, Δ净流入(亿), 累计值(亿)] */
export type AnomalyRow = [name: string, delta: number, total: number];

/** 异动扫描结果 */
export interface AnomalyResult {
  inflow: AnomalyRow[];
  outflow: AnomalyRow[];
}

/* ================= 图表 ================= */

/** 折线的悬停元数据：一条线一个 */
export interface ChartSeriesMeta {
  name: string;
  color: string;
  /** 时刻 → 该时刻累计值(亿)，缺失即为 undefined */
  map: Record<string, number | undefined>;
}

/** 图表元数据：十字线靠它把鼠标 x 换算回时间轴下标 */
export interface ChartMeta {
  /** viewBox 宽度 */
  W: number;
  /** 左边距 */
  ML: number;
  /** 绘图区宽度 */
  pw: number;
  /** 时间轴最大下标 */
  nx: number;
  /** 时间轴（所有序列时刻的并集） */
  axis: string[];
  series: ChartSeriesMeta[];
}

/** buildLineChart 的返回值：svg 直接塞 innerHTML，meta 供电给十字线 */
export interface LineChartResult {
  svg: string;
  meta: ChartMeta | null;
}
