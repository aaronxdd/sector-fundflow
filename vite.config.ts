import { defineConfig } from 'vite';

/**
 * 开发代理：把 /api/em/* 转发到东方财富延时行情域名。
 * 只有在 .env 中设置 VITE_EM_PROXY=1 时数据层才会走这个代理；
 * 默认走 JSONP，静态部署（build 后直接打开 / 托管到任意静态服务器）也能取数。
 */
export default defineConfig({
  server: {
    port: 5173,
    open: false,
    proxy: {
      '/api/history': {
        target: 'https://push2his.eastmoney.com',
        changeOrigin: true,
        secure: true,
        rewrite: (path: string) => path.replace(/^\/api\/history/, ''),
      },
      '/api/em': {
        target: 'https://push2delay.eastmoney.com',
        changeOrigin: true,
        secure: true,
        rewrite: (path: string) => path.replace(/^\/api\/em/, ''),
      },
    },
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
});
