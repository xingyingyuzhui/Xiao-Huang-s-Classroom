# 行为兼容清单与用户数据备份策略

> Program 0 Task 0.2 产物。本清单是工程迁移的不可变行为面：任何 Task 破坏以下行为即视为回归。
> 公开 API v1 的兼容政策见统一工程体系设计 spec §11.2（本计划不删除 v1）。

## 1. 不可变行为清单

### 1.1 大厅与转场（shell/hub）

- 学科大厅全出血，无顶部学科 tab 条（仅右上设置）；不残留 tab 条空 chrome。
- 品牌读「小黄的教室」；大厅背景与品牌字体按主题色板个性化；品牌文字无 specular/glow。
- 点击学科书 → 打开 intro 页（不是直接进课堂）；intro CTA 进入课堂用 cover-dissolve（书保持合上），不叠加 3D 翻书/页翻/俯冲；退出反向 dissolve 到合上书。
- 书脊/侧面材质与封面一致；无冗余 OPEN 徽标。
- intro 聚焦时序：其它书先完全沉下，选中书 ~0.1s 领先旋转，无长停顿。
- 仅化学可进入；物理/生物书可见但不可点（placeholder）。
- intro 光标浮标按学科区分（化学元素符号/数学数字/生物叶/物理主题）。
- intro chrome：无中心关闭 X；次要操作「返回大厅」；无「N 个模块」表述。

### 1.2 主题

- 五主题（tokens.css）完整覆盖；换肤监听历史事件名 `chem-theme-change` 必须保留（可通过兼容桥，但事件名不变）。
- 曲线颜色经 `resolveFunctionColor`（colorSlot/explicitColor）解析；换肤不修改 GraphDocument、不进历史、不落盘。

### 1.3 化学

- 化学实验、反应同步、周期表、摩尔、电子云、对决、AI 课堂等既有行为。
- 服务端 `/api/...` 路径、状态码与既有响应字段保持兼容。

### 1.4 数学（函数画布合同，最强约束集）

- GraphDocumentV2 单一真值；`Document → Store/History → Renderer → runtime` 单向流。
- 多函数/活动函数/显隐/复制/重命名/独立定义域；预设（一次/二次/幂/指数/对数/绝对值/反比例/正弦/余弦）。
- 自定义表达式只用 `@xiaohuang/math-expr` 白名单。
- 点/线段/直线/切线/垂线/交点/割线/删除/探针/罗盘/批注。
- 切线近顶点 feature-follow，拖离降级曲线跟随。
- 全量重建保留 viewport；图例 refresh 不重置 bbox。
- 批注历史独立；全局 undo 在批注模式路由 notes undo。
- import 成功清空历史、失败不动文档/历史；reset 是可撤销 replace；pagehide/dispose flush。
- 高频输入每帧最多一次 apply、一次手势一条 history；dispose 资源归零（listener/timer/frame/observer/URL）。

### 1.5 Electron / 发布

- Electron 用户数据位于 `userData/data`；pkg 便携版邻近 `data`。
- 内嵌 Server 端口与数据目录显式传递；`electron-builder.yml` 产物结构。

## 2. 用户数据备份与恢复策略

### 2.1 原则（spec §11.3）

- 任何数据迁移前：在同一目录创建带原 schema 版本、时间戳、checksum 的可恢复备份。
- 启动时 DB 版本高于应用最大支持版本 → 只读失败并提示升级，禁止降级/写入。
- 回滚优先依赖 expand 阶段向后可读；标记不可向后读的 migration 必须经受测 restore 恢复 pre-migration backup。
- restore = 复制到临时文件 → 完整性校验 → 原子 rename；失败保留原 DB 与备份，不做原地覆盖。
- rollback 后备份之后产生的新数据可能丢失——必须在命令输出与发布说明中明确，禁止声称无损。

### 2.2 三类位置备份流程

| 位置                         | 备份命令/方式                  | 校验          |
| ---------------------------- | ------------------------------ | ------------- |
| Web 开发 `apps/server/data/` | 迁移前复制目录 + `sha256` 清单 | checksum 比对 |
| Electron `userData/data`     | 同上（路径由 main 提供）       | checksum 比对 |
| pkg 邻近 `data`              | 同上                           | checksum 比对 |

### 2.3 恢复测试要求

- 每个 migration 的 restore 路径必须有自动化测试（临时目录模拟），验证：恢复成功、失败保留原物、不覆盖现有 DB。

## 3. 兼容桥清单（行为面）

| 桥                         | 保持                       | 删除条件                                    |
| -------------------------- | -------------------------- | ------------------------------------------- |
| API v1 adapter             | URL/状态码/字段不变        | 独立 breaking-release 计划（spec §11.2）    |
| `chem-theme-change` 事件名 | 历史名称不变               | 新内部中性命名就绪后仍保留桥（外部兼容）    |
| `pkg` 便携版               | Node 18 可执行子集 + smoke | Electron portable 等价验收完成（Program 6） |
