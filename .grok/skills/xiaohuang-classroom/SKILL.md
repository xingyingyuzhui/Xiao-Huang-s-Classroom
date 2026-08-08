---
name: xiaohuang-classroom
description: Use when doing any non-trivial audit, implementation, refactor, debugging, visual, test, data, packaging, or release work inside the 小黄的教室 repository.
---

# 小黄的教室 Project OS

本页只负责导航。领域精确规则由对应 reference、适用的 `AGENTS.md` 和真实代码拥有。

## 进入仓库

1. 确认仓库根、当前分支和 `git status --short`，保护已有改动。
2. 读根 `AGENTS.md`；再读目标子树内适用的 `AGENTS.md`。
3. 按下表只加载与任务有关的 1–3 个 references。
4. 动手前说明 owning layer、公开合同、外部边界、用户数据/生成物和验证层级。

## 指令与事实

- 操作约束：当前用户请求 > 适用 `AGENTS.md` > 已批准 spec/ADR > 本 skill > 历史计划/报告。
- 当前实现事实：以真实代码、package scripts、自动化测试和新鲜产物为准。
- `AGENTS.md` 的约束必须遵守；其中 workspace facts 若与代码冲突，按代码和验证确认，并同步报告文档漂移。
- “计划已完成”“某次构建通过”和 Turbo cache 都不能单独证明当前状态。

## 任务路由

| 任务 | 必读 | 按需追加 |
| --- | --- | --- |
| 项目了解、结构或依赖审查 | `references/architecture.md` | `references/engineering-quality.md` |
| 产品判断、视觉、主题 | `references/product-philosophy.md` | `references/hub-bookshelf.md` |
| Hub、书架、封面、转场 | `references/hub-bookshelf.md` | `references/frontend-shell.md` |
| Shell、学科、classroom、panel | `references/frontend-shell.md` | `references/add-feature.md` |
| 新功能或结构重构 | `references/add-feature.md` | 对应领域 reference |
| 数学画布、工具、性能 | `references/math-canvas.md` | `references/engineering-quality.md` |
| 化学实验、AI classroom | `references/chemistry-features.md` | `references/server-data.md` |
| Server、API、设置、DB、AI | `references/server-data.md` | `references/architecture.md` |
| Electron、stage、安装包 | `references/desktop-release.md` | `references/engineering-quality.md` |
| 测试、门禁、coverage、cache | `references/engineering-quality.md` | `references/debug-playbook.md` |
| Bug、构建或运行失败 | `references/debug-playbook.md` | 症状对应领域 reference |
| Git、生成物、用户数据、交接 | `references/maintenance.md` | `references/engineering-quality.md` |

## 新增和改动代码的不变量

- 新依赖保持 `apps → packages` 单向；Server 不导入 Web。
- 新增或修改的 HTTP、localStorage、DB、IPC、AI 输出经 Schema 校验。
- 领域状态只保存可序列化业务数据，不持久化 DOM、Canvas、JSXGraph、Three.js 或监听器。
- 有资源的模块实现对称生命周期；disposer 逆序、容错、幂等。
- 高频输入按帧合并，不让 pointer/input 频率直接驱动重渲染。
- 新失败路径使用稳定错误码并保留上下文；禁止静默 catch。
- 禁止裸 `export *`；主题分支使用语义令牌。
- 用户数据和生成目录不是源码；测试不得依赖未声明的本机残留。

这些是不继续扩散旧债的规则，不代表全部存量 JS 已完成迁移。

## 四类工作流

### 只读了解或审查

限定范围 → 排除用户数据/生成物 → 读代码、测试、脚本 → 对照合同 → 给出证据、风险和未验证项。未经授权不写代码。

### 功能或重构

定位 owner → 确认数据源/公开合同 → 先写失败测试或复现 → 修改正确层 → 相关验证 → 全局门禁 → 工作树检查。结构重构默认保持行为。

### 视觉与交互

先读产品与参考 → 检查五主题、响应式、动效和生命周期 → 实现 → 结构/单元验证 → 浏览器交互验证。用户明确排除浏览器时，改用 fake DOM/board/storage/timer/RAF 与构建，并明确未做真实视觉验收。

### 工程与发布

分别陈述源码门禁、当前工作区、干净检出、packaged app 和平台发行物证据。stage smoke 不等于最终发行包；`electron-builder --dir` 不等于目标机上的 DMG/NSIS/portable 验收。

## 完成标准

- 修改发生在正确 owner，公开合同与用户数据受保护。
- 最小相关测试和匹配风险的全局门禁通过。
- 结论区分已验证、推断和未验证；不把 cache、stage 或历史报告说成最终证据。
- `git diff --check` 只证明无空白错误；另用 `git status --short` 检查工作树。
- 架构、脚本、接入协议或产品红线变化时，同步更新对应 reference 与防漂移测试。
