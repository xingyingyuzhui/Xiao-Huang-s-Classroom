# 书场学科大厅 Implementation Plan

> **For agentic workers:** implement task-by-task; checkboxes track progress.

**Goal:** 把朴素卡片大厅换成参考 Books 示例的 3D 书场；点书经开合/飞转动画进入对应学科教室。

**Architecture:** 现有 `hub ↔ lab` 壳层不变。`src/subjects/bookshelf/` 持有 Three.js 书场引擎；`hub.js` 挂载 canvas/UI 并回调 `onEnterSubject`。封面元数据挂在 `catalog.js`。

**Tech Stack:** Three.js（仓库已有）、Vite ESM、现有 subjects 模块。

---

### File map

| File | Role |
| --- | --- |
| `src/subjects/catalog.js` | 学科 + 书皮配色 |
| `src/subjects/bookshelf/covers.js` | 程序封面绘制 |
| `src/subjects/bookshelf/stage.js` | 引擎：场景/书几何/hero↔open/输入 |
| `src/subjects/hub.js` | 挂载书场、显隐、进教室 |
| `index.html` / `_subject-hub.css` | 全屏书场 DOM + 样式 |
| `test/subject-hub.test.cjs` | 契约测试 |

### Tasks

- [x] Catalog 书皮字段 + 封面 painters
- [x] Port/adapt Books 引擎为 `createBookshelfStage`
- [x] Hub 接线：ready → 开场动画后进 lab；soon → 详情锁定
- [x] 样式 + 测试 + 本地试跑
