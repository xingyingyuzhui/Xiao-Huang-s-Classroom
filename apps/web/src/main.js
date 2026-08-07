/**
 * Vite 入口：加载全局样式并启动应用壳
 */
import { initApp } from './app/shell.js';

// 开发态 UI catalog：不进正式导航；dev 构建 + #dev-catalog hash 才挂载
if (import.meta.env.DEV && window.location.hash === '#dev-catalog') {
  import('./dev/catalog/main.js').then(({ mountCatalog }) => {
    const root = document.getElementById('app') || document.body;
    mountCatalog(root);
  });
} else {
  initApp().catch((err) => {
    console.error(err);
    document.documentElement.classList.remove('app-booting');
    document.documentElement.classList.add('app-ready');
  });
}
