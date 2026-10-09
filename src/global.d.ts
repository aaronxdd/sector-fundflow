/// <reference types="vite/client" />

/**
 * 全局类型补充：Vite 环境变量 + 控制台调试对象。
 */
import type { ChartMeta, Settings, Snapshot } from './types';

export {};

declare global {
  /** 在 .env 里可配的环境变量（见 .env.example） */
  interface ImportMetaEnv {
    /** 东方财富延时行情域名 */
    readonly VITE_EM_HOST?: string;
    /** '1' 时走 Vite dev 代理取数 */
    readonly VITE_EM_PROXY?: string;
  }

  /** main.ts 启动时挂到 window.__fundflow，方便控制台查看 / 操作状态 */
  interface Window {
    __fundflow: {
      settings: Settings;
      blocked: Set<string>;
      whitelist: Set<string>;
      history: Array<{ t: Date; snap: Snapshot }>;
      charts: { main: ChartMeta | null; whitelist: ChartMeta | null };
      refresh: () => Promise<void>;
      addBlocked: (name: string) => boolean;
      removeBlocked: (name: string) => boolean;
      addWhitelist: (name: string) => boolean;
      removeWhitelist: (name: string) => boolean;
    };
  }
}
