# 小黄的教室

本地多学科学习壳（演进中）。**当前可运行主体**仍来自「小黄的化学实验室」：周期表、3D 分子、计算、电子排布、课堂与元素对战等。

本目录由化学实验室仓库做**基础迁移**得到：表层产品名改为「小黄的教室」，化学业务代码路径暂未重排。学科切换壳尚未加入。

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

## 与化学实验室的关系

| 项 | 说明 |
| --- | --- |
| 来源 | `/Users/qin/Desktop/teacher`（小黄的化学实验室）快照 |
| Git | 新仓库，不继承原历史 |
| 已改 | 包名、窗口/品牌默认文案、Electron `productName` / `appId` 表层 |
| 未改 | 化学功能模块路径、学科切换、发布安装包流程 |

数据目录（Electron）：Windows `%AppData%\xiaohuang-classroom\data\`；macOS `~/Library/Application Support/xiaohuang-classroom/data/`（随新 `name` / `appId`）。

---

## 后续计划（未做）

1. 顶层「学科」切换壳（化学为默认学科）
2. 其它学科模块逐步迁入
3. README / 发布物与多学科信息架构对齐
