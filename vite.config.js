import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    open: false
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false
  },
  // PUBLIC_MODE 切替用: 環境変数で制御
  define: {
    __PUBLIC_MODE__: JSON.stringify(process.env.PUBLIC_MODE !== 'false')
  }
});
