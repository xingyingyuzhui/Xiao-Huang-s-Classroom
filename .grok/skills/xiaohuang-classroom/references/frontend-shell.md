# Frontend shell and subject runtime

用于 app boot、Hub→intro→classroom、学科状态、panel 与生命周期任务。

## 装配路径

- Boot：`apps/web/src/main.js` → `apps/web/src/app/shell.js`。
- 学科视觉/文案：`apps/web/src/subjects/catalog.js`。
- 当前可进入状态与 runtime manifest 装配：`apps/web/src/subjects/manifest.js`。
- Classroom factories：`apps/web/src/subjects/classrooms/registry.js`。
- Tab/default panel/settings：`packages/subject-settings`。
- 通用 runtime 能力：`packages/subject-kit` 与 `apps/web/src/app/feature-loader.js`。

`catalog.status` 不能单独决定能否进入；Hub 与 shell 的门禁以 runtime manifest 为准。

## 两种 SubjectManifest

它们目前不是同一个合同：

- `packages/contracts/src/subject.ts`：可序列化、可经 Zod 校验的边界数据；panels 是字符串。
- `packages/subject-kit/src/types.ts`：包含 loader/mount 函数的运行时合同。
- `apps/web/src/subjects/manifest.js` 当前只装配 runtime manifest，没有导入/校验 contracts Schema。contracts→runtime adapter 尚未生产接线。

不要宣称两套 manifest 已统一；修改任一结构时同时检查 adapter、调用方和合同测试。

## 当前生命周期现实

- 新标准：`mount/show/hide/relayout/syncTheme/dispose`，由 `@xiaohuang/subject-kit` 描述。
- 存量 classroom shell 仍常用 `boot/enter/leave/hidePanels/switchTab/onResize`。
- App shell 尚未全面通过 runtime `classroom.mount()` 接线。

新增有监听器、timer、RAF、WebGL/JSXGraph runtime 的模块必须提供对称 dispose；接入 legacy controller 时要明确适配点，不能假定壳会自动释放。

## 修改检查

- 新学科/面板：读取 `add-feature.md`。
- Hub/书架/转场：读取 `hub-bookshelf.md` 和 bookshelf 子树 `AGENTS.md`。
- 主题事件保持 `chem-theme-change` 兼容，视觉值来自语义 token。
- 快速进入/退出或切换必须防 stale async mount；失败时清理部分资源并保持可重试状态。
