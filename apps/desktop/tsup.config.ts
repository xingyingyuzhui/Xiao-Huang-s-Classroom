/**
 * Desktop tsup 构建（C4）：Electron main 迁 TS 单产物。
 * 产物 CJS 到 dist/main.js（external electron，运行时由 Electron 提供）；
 * startup-state-machine.js 被 bundle 进产物——app.asar 不再依赖 src/ 目录。
 * 薄转发 main.cjs（electron-builder 入口）require 本产物。
 */
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    main: 'src/main.ts',
    'preload-account': 'src/preload-account.ts',
    'account-ipc-core': 'src/account-ipc-core.ts',
  },
  format: ['cjs'],
  dts: false,
  clean: true,
  target: 'es2022',
  outDir: 'dist',
  external: ['electron'],
});
