# 小黄的教室

本地多学科学习壳（演进中）。启动进入 **3D 学科大厅**；当前可进入 **化学** 教室（周期表、3D 分子、计算、电子排布、课堂、元素对战等）。物理 / 生物 / 数学书可见，暂未开放。

**当前版本：v3.0.6** · 许可证 [MIT](./LICENSE)

---

## 开发运行

```bash
# 根目录与 server 各装一次依赖
npm install
npm --prefix server install

# 终端 1：后端（默认 3000）
npm --prefix server run dev

# 终端 2：前端
npm run dev
```

浏览器打开控制台打印的地址（通常是 http://localhost:5173/ ；`/api` 代理到后端）。

```bash
npm test
```

---

## 架构要点

| 层 | 说明 |
| --- | --- |
| 壳层 | 学科大厅 ↔ 化学实验室；设计见 `docs/superpowers/specs/` |
| 前端 | Vite + ES modules + Three.js |
| 后端 | Express + SQLite（`server/`） |
| 桌面 | Electron（Win / Mac 打包脚本见 `package.json`） |

数据目录（Electron）：Windows `%AppData%\xiaohuang-classroom\data\`；macOS `~/Library/Application Support/xiaohuang-classroom/data/`。

`server/data/`、`dist/`、`server/public/` 等为运行/生成路径，勿当业务源码改。

---

## 文档

- `AGENTS.md` — 协作约定与当前产品偏好
- `docs/superpowers/specs/` — 学科大厅与电影式进出场设计

---

## 后续（未做）

1. 其它学科内容模块
2. 后端按学科隔离
3. 发布物与多学科信息架构对齐
