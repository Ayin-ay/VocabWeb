import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/** 版本号只认 package.json 一处，APK 那边由 App.getInfo() 对上 */
const version = (JSON.parse(readFileSync('./package.json', 'utf8')) as { version: string }).version

export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(version) },
  server: { host: '127.0.0.1', port: 5174, strictPort: true },
  build: { outDir: 'dist', target: 'es2022' }
})
