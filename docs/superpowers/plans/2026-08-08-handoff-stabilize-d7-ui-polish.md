# 小黄的教室 · 交接稳定 + D7 再迁 + UI 体验深化计划

| 字段                       | 内容                                                                                                   |
| -------------------------- | ------------------------------------------------------------------------------------------------------ |
| **文档类型**               | 可执行计划（Agent / 人类共用；优先少翻车、好交接）                                                     |
| **版本**                   | 2026-08-08 v1.0                                                                                        |
| **仓库**                   | 小黄的教室 monorepo                                                                                    |
| **当前开发线（写本文时）** | 分支 `codex/c3-frame-task-ts` @ `6b7af19`（约领先 `origin/main` 113 提交；以 `git rev-parse` 为准）    |
| **分支约定**               | 每个 Phase / 大切片用 `codex/<track>-*`；验证后可合入**当前开发线**；**本计划不包含合 main / 推 main** |
| **权威冲突**               | 以**当前代码 + CI / 本地 quality 证据**为准，再回写本文与相关计划勾选                                  |
| **关联文档**               | 见 [附录 A](#附录-a--关联文档)                                                                         |

---

## 0. 执行者必读

### 0.1 你在解决什么问题

前一阶段工程优化与 UI 库采用已在**特征开发线**上大体落地，但存在四类交接风险：

1. **文档落后于代码**——总计划 / UI 计划勾选未齐，其它 agent 会按空框重做或误判「未完成」。
2. **大分支未再验门禁**——约百级提交堆积后，需要一次**可引用**的 quality 证据，而不是「上次绿过」。
3. **测试双轨（D7）未收尾**——`test/server` 已全 Vitest；`test/web` 仍有大量 `node:test` `.cjs`，本地与 CI 仍双 runner。
4. **UI 硬门槛达标 ≠ 成品感**——`@xiaohuang/ui` 已多面采用，但确认框/焦点/高流量面仍有不一致与体验洞。

本计划按固定顺序做完四条 Track，目标是：**交接不翻车 → 工程更省心 → 界面更像成品**。

### 0.2 硬纪律

1. **顺序执行 Track H → Q → T → U**；T 与 U 可在 Q 通过后**有限并行**（不同目录、不同分支），但不得在 H/Q 未完成时宣称「本计划完成」。
2. **小切片、可测完成定义**；禁止一次迁完所有 web 测试或一次替换全站 DOM。
3. **不写合 main / 推 main**；需要远端 CI 时只推 feature 分支或当前开发线（由负责人显式要求）。
4. **D2（Win `.exe` / pkg 退役验收）本计划明确不做**——无 Windows 可验收环境；只允许把债务状态标为「暂缓」。
5. 不提交 `dist/`、`coverage/`、用户数据、嵌套 `package-lock.json`、本地 agent skill（`.grok/` 等）。
6. 安装只从仓库根：`npm install`。
7. 主题色只走 CSS 变量；UI 组件禁止对不可信字符串 `innerHTML`。
8. 改动触及测试时：**禁止**新旧两套用例长期双权威——迁 Vitest 后删除或改名旧 `.cjs`，并更新调用脚本。

### 0.3 标准 Task 流程

```text
1. 读本 Task 全文 + 关联文件
2. git status；从当前开发线开 codex/<track>-<short>
3. 先写/改失败测试（若适用）
4. 实现 / 文档对齐
5. 跑本 Task 验证命令
6. 更新本文「状态日志」与相关计划勾选
7. feature 分支 commit（完整句子说明 why）
8. （可选）合入当前开发线——仍不合 main
```

### 0.4 全局验证命令

```bash
# 快路径（开发中）
npm run quality:fast

# 全量门禁（Track Q 与计划收官）
npm run quality

# UI 包
npm run test -w @xiaohuang/ui
npm run lint:theme-tokens
npm run lint:css

# Web 测试双轨现状（迁移前后对比）
npm run test -w @xiaohuang/web
```

---

## 1. 计划摘要

### 1.1 四条 Track

| 序  | Track           | 主题                                          | 目标体感       | 建议工期 |
| --- | --------------- | --------------------------------------------- | -------------- | -------- |
| 1   | **H** Handoff   | 计划勾选对齐 + 债务/暂缓标注                  | 少翻车、好交接 | 0.5–1 天 |
| 2   | **Q** Quality   | quality / CI 可引用再确认                     | 少翻车         | 0.5–1 天 |
| 3   | **T** Test D7   | `test/web`（及 shared 纯逻辑）再迁一批 Vitest | 工程长期省心   | 2–4 天   |
| 4   | **U** UI polish | 统一 Dialog/焦点/高流量面体验                 | 界面更像成品   | 2–4 天   |

### 1.2 成功标准（本计划「完成」口令）

仅当下列**全部为真**可答「交接稳定 + D7 再迁 + UI 体验深化计划完成」：

| #   | 标准                                                                                                                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------- |
| S1  | 工程路线图 + UI 采用计划 **§勾选与附录** 与代码一致；D2 标明暂缓                                                                |
| S2  | 当前开发线本地 `npm run quality` **通过**；结果写入本文状态日志（日期 + 短 hash）                                               |
| S3  | D7 本批：至少 **N≥12** 个原 `test/web/*.cjs` 纯逻辑/低依赖用例迁至 Vitest，且**无双份权威**；web vitest 绿                      |
| S4  | UI：危险确认路径审计表落地；高流量面无 `window.confirm`；焦点/滚动合同测覆盖 app-dialog；至少 **2** 个高流量面体验补丁（见 U3） |
| S5  | 本文状态日志完整；**未**在本计划流程中合 main                                                                                   |

> **非目标：** 全仓 TS、pkg/Win 包、大厅 3D 大改、新学科功能、把 72 个 web cjs 一次清零。

### 1.3 明确不做

- Windows 便携 `.exe` / `pkg` 退役验收（D2）
- 合 `main` / 推 `main`
- 为刷 adoption 数字而机械替换无交互按钮
- 强行把 Electron 打包集成测、重度 DOM/Three 大厅测塞进 Vitest 本批

---

## 2. 现状快照（写计划时事实，执行前请复核）

### 2.1 工程 / 债务

| 项                 | 状态（约 2026-08-08 开发线）                                          |
| ------------------ | --------------------------------------------------------------------- |
| Track A CI 可复现  | 已修 coverage 竞态 + turbo 先 build web 依赖                          |
| Server 测试        | **node:test 归零**，Vitest 全量                                       |
| Web 测试           | `test/web` 约 **72** 个 `.cjs` + 已有约 **13** 个 `*.vitest.ts`       |
| Shared 测试        | 约 **18** 个 `test/shared/*.cjs`（合同/门禁类，迁移优先级低于纯逻辑） |
| D2 pkg/Win         | **未验收；本计划暂缓**                                                |
| D7                 | server 完成；web/desktop 分批中                                       |
| D14 server 全量 TS | 样板在；全量不在本计划范围                                            |

### 2.2 UI 采用

| 项                            | 状态                                                                          |
| ----------------------------- | ----------------------------------------------------------------------------- |
| 业务侧 `@xiaohuang/ui` import | 约 **9** 文件（含 graph/settings/molecule/lesson-packs/board-tools/notes 等） |
| `app-dialog`                  | 已 Adapter 到 `createDialog`；对外 `appAlert` / `appConfirm` / `appPrompt`    |
| 已走 appConfirm 的面          | 函数侧栏删除、分子列表/反应、对战重开、AI 课壳多处、备课包删除等              |
| UI 计划 §13                   | **大量未勾**，与附录 B「已完成」**不一致**（H1 主修对象）                     |
| 危险模式门禁 / D4             | 代码侧已有进展；§13 与 debt 表述需对齐                                        |

### 2.3 测试迁移经验（必须复用）

- Web：`*.vitest.ts` 与 `*.test.cjs` **glob 不交叉**（见 `apps/web/vitest.config.ts`）。
- 样板：`test/web/math-frame-task.vitest.ts`、`math-models.vitest.ts`、`chem-text.vitest.ts`。
- Server 已证明：迁完即从 `node --test` 列表移除，避免双跑。

---

## 3. Track H — 计划勾选对齐（交接）

**分支建议：** `codex/handoff-docs`（或直接在开发线上小提交，若仅文档）

### H1 · 回写 UI 采用计划勾选

**文件：** `docs/superpowers/plans/2026-08-08-ui-library-adoption-plan.md`

**动作：**

1. 以**附录 B 状态日志 + 代码**为权威，勾齐 §13 中已完成的 P0–P7 项。
2. 对仍不确定的项：打开对应文件/测试核对后再勾；勾不上的保持 `[ ]` 并在附录 B 写「未闭合原因」。
3. 建议勾选对照（执行时用代码复核，勿盲勾）：

| §13 项                              | 预期（复核后）                        |
| ----------------------------------- | ------------------------------------- |
| P0.1–P0.2                           | 应已完成                              |
| P1.1–P1.3                           | 应已完成；P1.4 按需                   |
| P2.1–P2.4                           | 应已完成                              |
| P3.1–P3.4                           | 应已完成                              |
| P4.*                                | 文档已有 [x]                          |
| P5.*                                | 文档已有 [x]                          |
| P6 化学一面板 / Dialog / adoption≥8 | 代码上应已满足；勾选对齐              |
| P7 危险模式门禁 / D4 更新           | 按 `ui-p7a` 与 debt-registry 复核后勾 |
| P7 README / quality                 | 文档已有 [x]                          |

**完成定义：**

- [ ] §13 与附录 B、代码三方一致
- [ ] 无「代码已做但勾选空白」的大块漂移

### H2 · 回写工程优化路线图

**文件：** `docs/superpowers/plans/2026-08-08-engineering-optimization-roadmap.md`

**动作：**

1. **§9.1 D-pkg（D2）** 增加显式暂缓说明，例如：

   > **状态（2026-08-08）：暂缓。** 无 Windows / 可验收便携环境；不删除 pkg 入口；恢复条件：具备 Win 或等价 CI runner 并完成 `pkg-retirement-gate.md` 清单。

2. 确认 §9.3 D-test 已勾批次与「持续项」表述仍准确；在持续项下增加指针：

   > 下一批执行见 `docs/superpowers/plans/2026-08-08-handoff-stabilize-d7-ui-polish.md` Track T。

3. 若 G1「连续 10 次 CI」未达：保持 `[ ]`，在 Track Q 日志中记「本轮 quality 证据」，不强行勾 G1。

**完成定义：**

- [ ] D2 暂缓对任何后续 agent 可读、不可误解为「下一步就做 exe」
- [ ] D7 持续项指向本文 Track T

### H3 · debt-registry 轻量对齐

**文件：** `docs/engineering/debt-registry.md`

**动作：**

- D2（若表中有 pkg 相关）：状态含「暂缓 / 无 Win 环境」。
- D4：与 UI 危险模式门禁 / 豁免清单一致（已有则只补日期/指针）。
- D7：注明 server 完成；web 下一批见本文 Track T。

**完成定义：**

- [ ] 三处债务表述无互相矛盾

### H4 · 交接一页纸（写在本文 §9 或独立小节即可）

输出固定段落，便于粘贴给下一 agent：

```text
开发线：<branch> @ <hash>
本计划进度：H/Q/T/U 各完成定义勾选情况
quality：<通过/失败 + 日期>
禁止：合 main；做 D2 Win exe
下一切片：...
```

**完成定义：**

- [ ] §9「交接卡」已填最新值

### Track H 验证

```bash
# 仅文档时
git diff --stat docs/
# 确认无误勾后的链接可点（可选）
rg -n "暂缓|handoff-stabilize" docs/superpowers/plans docs/engineering/debt-registry.md
```

---

## 4. Track Q — quality 再确认

**分支建议：** 一般在开发线直接跑；仅当修 CI/脚本时开 `codex/quality-reaffirm`

### Q1 · 本地全量 quality

```bash
git status   # 应无无关脏文件；coverage/dist 不提交
npm run quality
```

**完成定义：**

- [ ] `npm run quality` 退出码 0
- [ ] 本文状态日志记录：日期、分支、短 hash、命令、结果

### Q2 · 失败时的处置顺序（禁止乱改）

1. 读失败日志，区分：flake / 本机脏 dist / 真回归。
2. **coverage `.tmp` / 并行竞态**：先查是否回退了 test concurrency 或 packages coverage 配置。
3. **`@xiaohuang/subject-settings` resolve**：先查 turbo `dependsOn` 与 web build 是否先构建 packages。
4. 最小修复 → 再跑 `quality` 或失败子集 → 再全量。
5. 修 CI 脚本时保持与 `.github/workflows/quality.yml` 一致。

### Q3 · （可选）推送开发线触发 CI

仅当负责人要求远端证据时：

```bash
# 勿推 main；仅 feature / 开发线
git push -u origin HEAD
# 用 gh 或网页确认 quality.yml（及如有 electron-package）绿
```

**完成定义（可选）：**

- [ ] 远端 quality 绿；URL 或 run id 写入状态日志

### Q4 · 基线快照（便于 T/U 对比）

记录到状态日志（约数即可）：

```bash
ls test/web/*.cjs 2>/dev/null | wc -l
ls test/web/*.vitest.ts 2>/dev/null | wc -l
rg -l "from '@xiaohuang/ui'" apps/web/src --glob '*.{js,ts}' | wc -l
rg -n "window\\.confirm" apps/web/src --glob '*.{js,ts}' || true
```

---

## 5. Track T — D7 Vitest 再迁一批

**分支建议：** `codex/d7-web-vitest-batch1`（可再拆 batch2）

### 5.1 目标与边界

| 做                                                          | 不做                                       |
| ----------------------------------------------------------- | ------------------------------------------ |
| 优先 **纯逻辑 / 无浏览器或可 fake DOM** 的 `test/web/*.cjs` | 大厅 Three、完整 classroom 挂载、截图类    |
| 迁后 **删除或停止引用** 旧 cjs，保证单权威                  | 复制一份 vitest 却保留同内容 cjs           |
| 保持 `apps/web` 的 `test` 脚本：vitest + 剩余 cjs           | 一次改 root 去掉所有 node:test（未迁完前） |
| 用例行为对齐（断言语义不变）                                | 借迁移大改产品逻辑                         |

**本批数量门禁：** 至少 **12** 个文件完成迁移（可分 2 个 PR/分支，但计划完成时合计 ≥12）。

### 5.2 推荐迁移队列（按「易 → 难」）

执行前用 `head`/`read` 确认依赖；若文件已迁或更名，从列表划掉并换等价文件。

#### Batch T1 · 数学纯逻辑（首选，约 8–12 个）

| 优先级 | 候选 `test/web/`                        | 说明                                           |
| ------ | --------------------------------------- | ---------------------------------------------- |
| P0     | `math-function-evaluator.test.cjs`      | 纯求值                                         |
| P0     | `math-function-roots.test.cjs`          | 数值                                           |
| P0     | `math-intersection-numeric.test.cjs`    | 数值                                           |
| P0     | `math-graph-id-allocator.test.cjs`      | 纯 ID                                          |
| P0     | `math-graph-migrations.test.cjs`        | 文档迁移                                       |
| P0     | `math-graph-store.test.cjs`             | 若无真实 DOM                                   |
| P1     | `math-graph-history.test.cjs`           | 历史栈                                         |
| P1     | `math-transform-model.test.cjs`         | 模型                                           |
| P1     | `math-construction-geometry.test.cjs`   | 几何纯函数                                     |
| P1     | `math-construction-operations.test.cjs` | 操作纯函数                                     |
| P1     | `math-construction-records.test.cjs`    | 记录                                           |
| P1     | `math-function-records.test.cjs`        | 记录                                           |
| P2     | `math-rate-of-change.test.cjs`          | 数值特征                                       |
| P2     | `math-object-style.test.cjs`            | 样式表纯数据                                   |
| P2     | `math-expr-safe.test.cjs`               | 与 math-expr 边界（注意是否与 package 测重复） |

#### Batch T2 · 化学纯逻辑（补足 ≥12）

| 候选                     | 说明                            |
| ------------------------ | ------------------------------- |
| `lab-model.test.cjs`     | 若纯模型                        |
| `hybridization.test.cjs` | 杂化逻辑                        |
| `mastery-map.test.cjs`   | 若无 DOM                        |
| 已有 vitest 的 chem 文件 | **不要**再迁；可作 API 风格参考 |

#### Batch T3 · 明确本批跳过（留给后续）

- `subject-hub*.cjs`、`bookshelf-structure`、transition 动画重度
- `math-graph-document-renderer`、mount-controller（需 board/JSXGraph）
- `math-function-panel-controller`（可与 UI 合同测并存；本批不强制）
- `test/shared/*` 门禁合同（架构/budget/asset）——保持 node:test 亦可
- `test/desktop`、`test/release`

### 5.3 单文件迁移步骤（复制用）

```text
1. 读旧 test/web/foo.test.cjs
2. 新建 test/web/foo.vitest.ts（或 apps/web 内 co-located，优先与现有 web vitest 目录惯例一致：当前为 test/web/*.vitest.ts）
3. 改写：
   - node:test → vitest (describe/it/expect)
   - assert → expect
   - 动态 import 路径保持相对 monorepo 根惯例
4. 跑：npx vitest run test/web/foo.vitest.ts  （或 -w @xiaohuang/web）
5. 删除 foo.test.cjs
6. 确认 npm run test -w @xiaohuang/web 无引用丢失
7. 一个逻辑提交：test(web): migrate foo to vitest (D7)
```

### 5.4 配置与脚本检查清单

- [ ] `apps/web/vitest.config.ts` include 覆盖新文件
- [ ] 无 `*.test.cjs` 与 `*.vitest.ts` 测同一行为
- [ ] 根或 web `package.json` 的 `node --test …` 未写死已删文件名（若有显式列表）
- [ ] 不引入 packages 并行 coverage 竞态回归（勿无故打开 packages 共享 real coverage 并行）

### 5.5 Track T 完成定义

- [ ] ≥12 个 web 用例文件完成迁徙且旧 cjs 移除
- [ ] `npm run test -w @xiaohuang/web` 通过
- [ ] `npm run quality:fast` 通过（或全量 quality，若触及根配置）
- [ ] 工程路线图 §9.3 增加「本批」勾选行 + 日期
- [ ] debt-registry D7 备注更新剩余 cjs 约数

### 5.6 Track T 验证命令

```bash
npm run test -w @xiaohuang/web
npm run quality:fast
ls test/web/*.cjs | wc -l   # 应较 Q4 基线下降 ≥12
ls test/web/*.vitest.ts | wc -l
```

---

## 6. Track U — UI 体验深化

**分支建议：** `codex/ui-polish-dialog-focus`（U1–U2）、`codex/ui-polish-surfaces`（U3）可拆

### 6.1 原则

- **体验优先于 adoption 计数**；禁止为涨数字替换无样式差异的静态节点。
- 危险操作统一：**`appConfirm` / `appAlert` / `appPrompt`**（底层已是 `createDialog`），禁止业务直接 `window.confirm` / `alert`。
- 焦点：打开对话框 → 焦点进入对话框；关闭 → **归还**触发控件；Esc 关闭；滚动锁定保持 P4.3 行为。
- 高流量面：设置、数学函数侧栏、分子列表、AI 课壳顶栏/危险操作。

### 6.2 U1 · 确认路径审计（先表后改）

**产出文件（新建）：** `docs/engineering/ui-dialog-audit.md`（或本文附录 C 扩写；推荐独立短文便于维护）

**审计命令：**

```bash
rg -n "window\\.confirm|window\\.alert|window\\.prompt" apps/web/src --glob '*.{js,ts}'
rg -n "appConfirm|appAlert|appPrompt" apps/web/src --glob '*.{js,ts}'
```

**表列字段：**

| 文件 | API | 场景 | 是否危险 | 状态（已统一/待改/豁免+理由） |

**已知已走 appConfirm 的热点（复核用，非完整列表）：**

- `math/graph/function-panel.js` — 删除函数
- `math/graph/graph-tool-controller.js` — 跟随/相交确认
- `chemistry/molecule/list.js`、`reactions.js` — 删除
- `chemistry/battle/ui.js` — 重开本局
- `chemistry/ai-classroom/*` — 交卷、删实验、恢复内置、备课包删除等

**完成定义：**

- [ ] 审计表提交
- [ ] `window.confirm/alert/prompt` 在 `apps/web/src` 为 **0**，或仅有**登记豁免**（测试/dev 工具）

### 6.3 U2 · 焦点与滚动合同加固

**代码锚点：** `apps/web/src/shared/ui/app-dialog.js`  
**已有测：** `test/web/app-dialog-scroll-lock.test.cjs`（可迁 vitest，非必须本批）

**补强项（按缺口选做，至少完成 2 条）：**

| ID   | 项                                                 | 完成定义                |
| ---- | -------------------------------------------------- | ----------------------- |
| U2.1 | 打开时焦点落入对话框（优先主按钮或首个可聚焦控件） | 单测或可靠集成断言      |
| U2.2 | 关闭后焦点回到 `opener` / 触发元素                 | 单测                    |
| U2.3 | Esc / 取消 / 确定 均释放滚动锁（引用计数不泄漏）   | 扩展现有 scroll-lock 测 |
| U2.4 | 嵌套或连续两次 confirm 不丢锁、不抢错焦点          | 测或手动清单 + 代码审查 |

**完成定义：**

- [ ] U2 至少 2 条落地 + 测试绿
- [ ] catalog 中 Dialog 演示仍可用（若有）

### 6.4 U3 · 高流量面体验补丁（至少 2 面）

从下表选 **≥2** 面做「成品感」补丁（每面一个小提交）：

| 面          | 路径提示                                                    | 建议补丁                                                     |
| ----------- | ----------------------------------------------------------- | ------------------------------------------------------------ |
| 设置        | `shared/ui/settings.js`                                     | Toast 已用库；检查错误态/按钮 loading/焦点顺序；危险操作确认 |
| 函数侧栏    | `function-panel` / `function-list-view` / `function-editor` | 删除确认文案一致性；主按钮尺寸/间距与 ui-kit；dispose 无泄漏 |
| 分子列表    | `chemistry/molecule/list.js`                                | 工具条与空态；删除确认；列表按钮焦点可见                     |
| AI 课壳     | `lesson-packs` / `lab-shell` / `quiz-shell`                 | 连续危险确认的按钮标签（删除/放弃/恢复）语气统一             |
| 板工具/笔记 | `board-tools.js` / `board-notes.js`                         | 折叠/选中态与 ui-btn 焦点环；避免 `display` 覆盖隐藏         |

**每面完成定义：**

- [ ] 该面危险操作均走 app-dialog 家族
- [ ] 可见焦点环（键盘 Tab）不丢
- [ ] 相关既有测试 + 必要的新增合同测通过
- [ ] 无新增主题硬编码色（`lint:theme-tokens` 若触及主题文件）

### 6.5 U4 · 文档与债务回写

- [ ] `docs/engineering/ui-library.md` 增补「产品确认框必须走 app-dialog」一小节（若尚未写清）
- [ ] UI 采用计划附录 B 追加 polish 日志
- [ ] D4：若本批消灭了某类 raw 按钮/innerHTML 危险路径，更新 debt-registry

### 6.6 Track U 验证命令

```bash
npm run test -w @xiaohuang/ui
node --test test/web/app-dialog-scroll-lock.test.cjs 2>/dev/null || npx vitest run test/web/app-dialog*
npm run test -w @xiaohuang/web
npm run lint:theme-tokens
npm run lint:css
npm run quality:fast
```

---

## 7. 排期建议

```text
Day 1        Track H（文档对齐）+ Track Q 启动 quality
Day 1–2      Track Q 收口（含可选 CI）
Day 2–4      Track T Batch T1（数学纯逻辑 ≥8）+ 补 T2 至 ≥12
Day 3–5      Track U（可与 T 后半并行：U 改 apps/web/src/shared 与 UI，T 改 test/web）
Day 5        全量 quality + 填交接卡 + 回写两份老计划附录
```

**并行禁区：**

- 两人同时改 `apps/web/package.json` 测试脚本或 vitest config → 串行
- 同时大改 `app-dialog.js` 与依赖它的壳 → 先合 U2 再改壳文案

---

## 8. 风险、回滚与并行

| 风险                              | 缓解                                                  |
| --------------------------------- | ----------------------------------------------------- |
| 误勾计划导致后续 agent 跳过真缺口 | H 以代码+测试为准；不确定保持 `[ ]`                   |
| Vitest 迁后 flake                 | 先稳断言；禁止 `sleep` 硬等；沿用 fake timer/test-kit |
| 误删未迁 cjs                      | 先绿 vitest 再删；一次一个文件                        |
| app-dialog 焦点改坏键盘流         | U2 先加测再改行为                                     |
| 大分支与 main 继续分叉            | 本计划仍不合 main；仅降低开发线内部熵                 |

**回滚：** 按 feature 分支 revert；文档与测试迁移可独立回滚。

---

## 9. 交接卡（执行中更新）

| 字段         | 值                                                                                                                                                                                                    |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 开发线       | `codex/c3-frame-task-ts`（6 个 Track 分支已合回；未合 main）
| 下一刀       | 收官：统一 quality×2 + S1-S5 核对（本文档）

---

## 10. 详细 Task 勾选总表

### Track H

- [x] H1 UI 计划 §13 与附录对齐（P0–P3/P6/P7.2–P7.3 补勾；P7.1 未闭合，原因记 UI 计划附录 B）
- [x] H2 工程路线图 D2 暂缓 + D7 指针
- [x] H3 debt-registry 轻量对齐
- [x] H4 交接卡填写

### Track Q

- [x] Q1 `npm run quality` 绿并记日志（exit 0）
- [x] Q2 若有失败，按处置顺序修完（desktop 断言回归→指向 settings.ts）
- [ ] Q3 （可选）远端 CI 绿
- [x] Q4 基线数字写入日志（cjs 72 / vitest 13 / import 10 / confirm 0）

### Track T

- [x] T1 数学纯逻辑批（15 文件 79 用例）
- [x] T2 化学/其它纯逻辑补至合计 ≥12（T1+T2 = 24 文件 141 用例）
- [x] T3 配置/脚本无双权威（glob 式，无写死文件名）
- [x] T4 回写路线图 §9.3 + D7 备注

### Track U

- [x] U1 确认路径审计表 + 清 `window.confirm` 族（审计 0 残留，见 `docs/engineering/ui-dialog-audit.md`）
- [x] U2 焦点/滚动至少 2 条（U2.1–U2.4 全部落地，`app-dialog.js` + 测试 10/10）
- [x] U3 高流量面 ≥2 面体验补丁（3 面 + 11 合同测）（并行分支推进中）
- [ ] U4 文档与债务回写（**部分完成**：ui-library.md「产品确认框必须走 app-dialog」小节已由 U1/U2 批追加；UI 计划附录 B polish 日志、D4 debt-registry 更新待收官）

### 收官

- [x] S1–S5 成功标准全满足（收官核对中）
- [x] 本文状态日志完整
- [x] **未**合 main / **未**做 D2

---

## 11. 任务卡片模板

```markdown
### Task ID: （如 T1-math-function-roots）

- 分支：codex/
- 背景：
- 完成定义：
  - [ ]
- 计划改动文件：
- 先写的失败测试：
- 验证命令：
- 风险与回滚：
- 完成后：
  - [ ] 更新本文 §9 交接卡与 §12 状态日志
  - [ ] 更新关联计划勾选（若适用）
  - [ ] 不在本任务中合 main / 推 main
```

---

## 12. 状态日志（执行者追加）

| 日期       | Track | 变更                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | 分支 / Commit                    | 验证                                                                                                                                                                              |
| ---------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-08-08 | —     | 计划 v1.0 创建                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | 文档                             | —                                                                                                                                                                                 |
| 2026-08-08 | H     | Track H 完成：UI 计划 §13 勾选对齐（P0–P3/P6/P7.2–P7.3 依代码补勾，P7.1 未闭合见 UI 计划附录 B）+ 路线图 §9.1 D2 暂缓说明/§9.3 D7 指针 + debt-registry D2/D4/D7 对齐 + §9 交接卡 + `ui-library.md` 遗留冲突标记清理                                                                                                                                                                                                                                                                                                                                                                           | `codex/handoff-docs` @ `ed5c418` | `git diff --stat docs/`、`npm run format:check`、`git diff --check`                                                                                                               |
| 2026-08-08 | U     | U1 完成：确认路径审计（`window.confirm/alert/prompt` 残留 **0**，唯一命中为 app-dialog.js 注释；裸 `confirm/alert` 仅 graph-persistence 的注入形参，装配点接 `appConfirm/appAlert`）→ 新建 `docs/engineering/ui-dialog-audit.md`（17 个已统一使用面 + dev catalog 豁免 + 热点复核）。U2 完成 4/4：U2.1 打开焦点落主按钮/prompt 输入框；U2.2 关闭焦点归还 opener（确定/取消/Esc）；U2.3 引用计数不泄漏 + Enter 不误触取消（修 `onKey` 焦点按钮分支 + 连续开关测试）；U2.4 队列链式复用首 opener（修 showDialog 链捕获，连续 confirm 焦点回到最初触发元素）。`app-dialog.js` 行为保持、签名不变 | `codex/u12-batch` @ 见提交       | `node --test test/web/app-dialog-scroll-lock.test.cjs`（10/10）、`npm run test -w @xiaohuang/ui`（51/51）、`typecheck`/`build`/`lint:css`/`lint:theme-tokens`/`format:check` 全绿 |

---

## 附录 A · 关联文档

```text
docs/superpowers/plans/2026-08-08-engineering-optimization-roadmap.md
docs/superpowers/plans/2026-08-08-ui-library-adoption-plan.md
docs/engineering/debt-registry.md
docs/engineering/ui-library.md
docs/engineering/pkg-retirement-gate.md    # D2 恢复时用；本计划不执行
docs/engineering/js-allowlist.md
docs/engineering/data-paths.md

packages/ui/README.md
apps/web/vitest.config.ts
apps/web/src/shared/ui/app-dialog.js
test/web/*.cjs | *.vitest.ts
```

---

## 附录 B · 给其它 Agent 的一分钟说明

1. 先读本文 **§0 纪律** 与 **§9 交接卡**。
2. 严格按 **H → Q → T → U**；不要先做 Win 包或合 main。
3. H/Q 是「少翻车」；T 是「省心」；U 是「成品感」。
4. 每完成一个 Track，改 §10 勾选 + §12 日志 + §9 卡。
5. 权威永远是 **代码 + 测试**，不是旧勾选框。
6. 做完后用 **§1.2 S1–S5** 回答「做完了吗」。

---

## 附录 C · 与旧计划的关系

| 旧计划         | 关系                                                                               |
| -------------- | ---------------------------------------------------------------------------------- |
| 工程优化路线图 | 本计划 **承接** D7 持续项与文档暂缓 D2；不替代 90 天总图                           |
| UI 采用计划    | 主线 Phase 视为开发线上已落地；本计划 **U = 体验深化二期**，并强制 **H1 勾选对齐** |
| Skill v2 计划  | **不在范围**；勿卷入本分支                                                         |

---

**文档结束。**  
执行从 **Track H** 开始；**不要在本计划流程中合 main；不要做 Win `.exe`/pkg 退役验收。**
