# Maintenance and repository hygiene

本页只拥有 Git、工作树、用户数据、生成物和文档同步规则。测试命令见 `engineering-quality.md`，Electron 证据见 `desktop-release.md`。

## 开始前

- 非琐碎功能或结构工作使用 `codex/` feature branch；不要无意覆盖他人的脏工作树。
- 先看 `git status --short` 和最近提交，只 stage 本任务文件。
- 从仓库根安装依赖；不要维护 `apps/server/package-lock.json`。

## 用户数据

- `apps/server/data/` 与 `apps/server/src/data/` 按用户数据处理。
- 未获明确授权，不改、不删、不迁移真实 DB、lock、备份或用户配置。
- 数据迁移代码可以修改，但验证应使用临时目录/fake DB，不触碰生产数据。

## 生成与运行时路径

以下是生成或运行时路径，不作为源代码提交：

- `apps/web/dist/`
- `apps/server/public/`
- `.electron-stage/`
- `dist-electron/`
- `dist-exe/`
- `coverage/`、各 workspace `dist/`、dependency folders

只有任务明确针对发布产物时才读取它们作为证据；仍应修改生成它们的源码、配置或脚本。

## 提交边界

- 保留无关改动；不要用 destructive reset/checkout 清理别人的内容。
- 结构重构默认保持行为和公开入口，拆分与调用方/合同测试同一提交。
- `git diff --check` 只检查空白错误；工作树是否干净必须另看 `git status --short`。
- 删除、覆盖、发布、push、合并等扩大影响的动作遵守当前用户授权。

## 文档 owner

- 运行约束与高频入口：根/子树 `AGENTS.md`。
- 已批准设计：`docs/superpowers/specs/`。
- 可执行计划：`docs/superpowers/plans/`。
- Agent 路由：本 skill；事实冲突仍回到代码和新鲜验证。

出现新 workspace、学科接入协议、GraphDocument/renderer 合同、Server 数据边界、Electron 布局、质量脚本或明确产品红线时，同步更新对应 reference 和 `test/shared/xiaohuang-classroom-skill.test.cjs`。
