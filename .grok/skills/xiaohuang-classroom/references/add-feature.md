# Add-feature checklist

本页只给实施顺序；精确规则回到各 owner reference。

## 新学科 / classroom / panel

1. 读 `frontend-shell.md`，核对 catalog、runtime manifest、subject-settings 和 registry 的不同职责。
2. 先检查现有壳：目标学科可能已有 cover、factory、home panel，只差 runtime ready 状态。
3. 文案/书封视觉改 `apps/web/src/subjects/catalog.js` 与五主题 assets；可进入性改 `apps/web/src/subjects/manifest.js`。
4. Tab/default panel/settings 改 `packages/subject-settings`；runtime factory 改 `subjects/classrooms/registry.js`。
5. 新资源型 feature 遵守标准 lifecycle；接 legacy classroom 时显式适配 dispose/relayout/theme。
6. 测 manifest、registry、settings、stale enter/leave 和共享面板串科；视觉按 `hub-bookshelf.md`。

## 新化学实验

读 `chemistry-features.md`：先纯状态/规则和 Schema，再 controller/presentation，再 classroom 装配；需要持久化或 AI 时追加 `server-data.md`。

## 新数学工具

读 `math-canvas.md` 和 `apps/web/src/math/AGENTS.md`：纯 action/model → Store/transaction → controller/frame batching → renderer layer。禁止 pointer 直接写 JSXGraph 真值，禁止裸 `export *`。

## 新 API / DB / AI

读 `server-data.md`：Schema 与稳定错误 → service → route/repository → client。v1/v2 复用 service；migration/seed 用临时 DB 验证。

## 新主题或 Hub 视觉

读 `product-philosophy.md` 与 `hub-bookshelf.md`。主题是 tokens、背景、五套 cover、书材质/光照和课堂 chrome 的完整系统，不是单点换色。

## 新共享 package

先证明至少两个消费者或稳定跨 app 合同，再建 `packages/*`；提供 strict TS、双产物/d.ts、test/typecheck/build/coverage，并保持 `apps → packages`。

## 结构重构

先锁行为/公开导出/性能计数，再按单一职责拆分。兼容入口只显式导出；更新 owning `AGENTS.md`、架构门禁和结构测试。

## 完成检查

- owner、数据源和迁移状态描述准确。
- 失败路径、生命周期、主题和高频输入合同受保护。
- 相关测试、build/typecheck 与匹配风险的 quality 通过。
- 未把浏览器、目标机或最终发行物的未验证部分说成完成。
