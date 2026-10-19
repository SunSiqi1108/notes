import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite 配置：渲染进程打包。base 用相对路径，保证打包后 file:// 加载资源正常
export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    // 显式绑定 IPv4：默认 localhost 只监听 [::1]，会导致 wait-on tcp:127.0.0.1 一直等不到
    host: '127.0.0.1',
    port: 5173,
    strictPort: true
  },
  build: {
    // 产物放到 dist/renderer，避免与 electron-builder 的 dist 目录冲突
    outDir: 'dist/renderer',
    emptyOutDir: true
  }
});
