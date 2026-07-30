/**
 * Vite 入口：加载全局样式并启动应用壳
 */
import { initApp } from './app/shell.js';

initApp().catch((err) => {
  console.error(err);
  document.documentElement.classList.remove('app-booting');
  document.documentElement.classList.add('app-ready');
});
