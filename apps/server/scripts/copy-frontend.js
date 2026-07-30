/**
 * 将 Web 构建产物复制到 server/public
 */
const fs = require('fs');
const path = require('path');

const webDist = path.join(__dirname, '..', '..', 'web', 'dist');
const dest = path.join(__dirname, '..', 'public');

function rimraf(dir) {
  if (!fs.existsSync(dir)) return;
  fs.rmSync(dir, { recursive: true, force: true });
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const name of fs.readdirSync(from)) {
    const a = path.join(from, name);
    const b = path.join(to, name);
    if (fs.statSync(a).isDirectory()) copyDir(a, b);
    else fs.copyFileSync(a, b);
  }
}

if (!fs.existsSync(path.join(webDist, 'index.html'))) {
  console.error('未找到 apps/web/dist/index.html，请先执行 npm run build');
  process.exit(1);
}

rimraf(dest);
copyDir(webDist, dest);
console.log(`前端已复制到 ${dest}`);
