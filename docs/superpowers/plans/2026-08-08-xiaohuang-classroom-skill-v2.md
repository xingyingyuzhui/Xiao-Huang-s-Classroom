# Xiaohuang Classroom Skill v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `.grok/skills/xiaohuang-classroom/` 升级为本仓库所有非琐碎任务可使用的精简项目 OS，并用机械合同与 Agent 前向场景防止它再次落后于代码。

**Architecture:** `SKILL.md` 只负责触发、进入步骤、事实证据规则和任务路由；每类事实只有一个直接 reference owner，子树精确合同继续由对应 `AGENTS.md` 拥有。结构测试从真实 workspace、scripts 和 Markdown 链接动态校验可发现性，行为场景用无 skill baseline 与新版 skill GREEN 对比。

**Tech Stack:** Markdown skill、Node.js `node:test`、npm workspaces、Turbo、Python `quick_validate.py`、Git。

**Implementation Status:** 2026-08-08 已由主 Agent 实施完成；按用户要求停止多 Agent 行为回放，以机械合同、主 Agent 逐项审查和全仓门禁收口。

---

## 文件职责

- Modify: `.grok/skills/xiaohuang-classroom/SKILL.md` — 低上下文入口、任务路由、通用工作流。
- Modify: `.grok/skills/xiaohuang-classroom/references/architecture.md` — 仅拥有分层与依赖方向。
- Create: `.grok/skills/xiaohuang-classroom/references/frontend-shell.md` — shell、两种 manifest、FeatureLoader 与生命周期。
- Modify: `.grok/skills/xiaohuang-classroom/references/product-philosophy.md` — 保留有效产品红线，去除工程事实重复。
- Modify: `.grok/skills/xiaohuang-classroom/references/hub-bookshelf.md` — Hub/书架视觉与交互 owner。
- Create: `.grok/skills/xiaohuang-classroom/references/math-canvas.md` — 数学画布跨层路由；精确合同指向 math `AGENTS.md`。
- Create: `.grok/skills/xiaohuang-classroom/references/chemistry-features.md` — 化学 feature、实验状态与渲染边界。
- Create: `.grok/skills/xiaohuang-classroom/references/server-data.md` — API、Schema、DB、设置、AI 与迁移状态。
- Create: `.grok/skills/xiaohuang-classroom/references/desktop-release.md` — Electron 三层发布证据。
- Create: `.grok/skills/xiaohuang-classroom/references/engineering-quality.md` — 质量命令、测试归属、cache/fresh 证据。
- Modify: `.grok/skills/xiaohuang-classroom/references/add-feature.md` — 只做流程清单并链接事实 owner。
- Modify: `.grok/skills/xiaohuang-classroom/references/debug-playbook.md` — 症状到 owning layer 的排障路由。
- Modify: `.grok/skills/xiaohuang-classroom/references/maintenance.md` — Git、用户数据、生成物与同步触发器。
- Modify: `AGENTS.md` — 修正“仅化学可进入”的漂移，并保持项目 skill 直接发现入口。
- Create: `test/shared/xiaohuang-classroom-skill.test.cjs` — skill 结构、防漂移和事实可发现性合同。

### Task 1: 锁定设计与当前事实

**Files:**
- Modify: `docs/superpowers/specs/2026-08-08-xiaohuang-classroom-skill-v2-design.md`
- Modify: `AGENTS.md`

- [ ] **Step 1: 修正设计评审问题**

将“工程体系已完成”改为“基座已落地、应用仍迁移中”；拆开指令优先级与事实证据；新增 chemistry reference、事实 owner 表、Electron 三层证据与可执行行为评分。

- [ ] **Step 2: 运行文档静态检查**

Run: `git diff --check`

Expected: PASS，无空白错误。

- [ ] **Step 3: 独立审查设计**

要求 reviewer 只读取设计、根 `AGENTS.md`、真实代码和测试，返回 `APPROVED` 或具体冲突。若有问题，修订后完整重审，最多三轮。

- [ ] **Step 4: 修正文档漂移**

删除根 `AGENTS.md` 中“仅化学可进入”的硬编码列表，改为要求从 `apps/web/src/subjects/manifest.js` 查询当前 ready/locked 状态，避免每增加学科就再次漂移。

- [ ] **Step 5: 提交设计修订**

```bash
git add AGENTS.md docs/superpowers/specs/2026-08-08-xiaohuang-classroom-skill-v2-design.md
git commit -m "docs(skill): correct project OS v2 evidence model"
```

### Task 2: 建立 RED 防漂移合同

**Files:**
- Create: `test/shared/xiaohuang-classroom-skill.test.cjs`

- [ ] **Step 1: 写失败测试**

使用 `node:test`、`node:assert/strict`、`fs`、`path`：

```js
test('skill frontmatter and direct references form a valid router', () => {
  const skill = read('SKILL.md');
  const frontmatter = parseFrontmatter(skill);
  assert.equal(frontmatter.name, 'xiaohuang-classroom');
  assert.match(frontmatter.description, /^Use when\b/);
  assert.deepEqual(Object.keys(frontmatter).sort(), ['description', 'name']);
  for (const link of directReferenceLinks(skill)) {
    assert.ok(exists(link), `missing direct reference: ${link}`);
  }
});
```

同文件继续覆盖：

- 根 `AGENTS.md` 直接提及 `.grok/skills/xiaohuang-classroom/`，且不硬编码“仅某学科可进入”；
- 设计规定的 12 个 reference 均由 `SKILL.md` 直接链接；
- 由根 `package.json.workspaces` 展开得到的每个 `package.json` 名称可从 architecture/quality 路由发现；
- 根 `quality`、`lint:baseline`、`verify:electron-package`、`dist:mac`、`dist:win` 在对应 reference 可发现；
- `math-canvas.md` 直接链接 `apps/web/src/math/AGENTS.md`，且描述 GraphDocument 到 renderer 的方向与 JSXGraph runtime 边界；
- 生成目录只出现在排除/证据语境，不列为源码目录；
- references 内 Markdown 相对链接都能解析到现有文件。

- [ ] **Step 2: 运行测试并确认预期失败**

Run: `node --test test/shared/xiaohuang-classroom-skill.test.cjs`

Expected: FAIL，首个失败来自缺少新版 references 或 description 未以 `Use when` 开头，而不是测试语法错误。

- [ ] **Step 3: 提交 RED 测试**

```bash
git add test/shared/xiaohuang-classroom-skill.test.cjs
git commit -m "test(skill): add project OS drift contract"
```

### Task 3: 重写精简入口与工程 references

**Files:**
- Modify: `.grok/skills/xiaohuang-classroom/SKILL.md`
- Modify: `.grok/skills/xiaohuang-classroom/references/architecture.md`
- Create: `.grok/skills/xiaohuang-classroom/references/engineering-quality.md`
- Modify: `.grok/skills/xiaohuang-classroom/references/maintenance.md`

- [ ] **Step 1: 将 SKILL frontmatter 改成纯触发描述**

`description` 以 `Use when` 开始，只描述“在小黄的教室仓库内做非琐碎审查、实现、排障、重构、视觉、测试或发布任务时使用”，不塞工作流摘要。

- [ ] **Step 2: 实现入口路由**

入口只保留：先读适用 `AGENTS.md`；检查分支/工作树；按任务加载 1–3 个直接 references；区分操作约束和当前事实证据；声明 owning layer、外部边界、用户数据/生成物和验证层级；附任务路由表、四类工作流与完成标准。

- [ ] **Step 3: 重写 architecture**

只写 `apps/web`、`apps/server`、`apps/desktop`、`packages/*`、`test/*`、`tooling/*`、`docs/*` 的职责和 `apps → packages` 方向。列出当前 package 名称用于发现，但明确真实 `package.json` 为当前事实。

- [ ] **Step 4: 新增 engineering-quality**

从当前根 `package.json` 与 `turbo.json` 写真实命令映射：相关测试、`npm test`、`npm run quality`、coverage、budget、lint baseline；说明 Turbo cache 不证明 fresh execution，`git diff --check` 不证明工作树干净，应用层 TS/coverage 仍在迁移。

- [ ] **Step 5: 收窄 maintenance**

只保留分支、脏工作树保护、`apps/server/data` 用户数据、生成目录、根安装、提交边界、文档/skill 同步触发器；不重复质量命令或发布证据。

- [ ] **Step 6: 运行 RED 测试观察失败收敛**

Run: `node --test test/shared/xiaohuang-classroom-skill.test.cjs`

Expected: frontmatter/核心路由 PASS；仍因领域 references 未完成而 FAIL。

- [ ] **Step 7: 提交入口与工程地图**

```bash
git add .grok/skills/xiaohuang-classroom/SKILL.md \
  .grok/skills/xiaohuang-classroom/references/architecture.md \
  .grok/skills/xiaohuang-classroom/references/engineering-quality.md \
  .grok/skills/xiaohuang-classroom/references/maintenance.md
git commit -m "docs(skill): rebuild project OS router and engineering map"
```

### Task 4: 增加领域与运行时 references

**Files:**
- Create: `.grok/skills/xiaohuang-classroom/references/frontend-shell.md`
- Create: `.grok/skills/xiaohuang-classroom/references/math-canvas.md`
- Create: `.grok/skills/xiaohuang-classroom/references/chemistry-features.md`
- Create: `.grok/skills/xiaohuang-classroom/references/server-data.md`
- Create: `.grok/skills/xiaohuang-classroom/references/desktop-release.md`

- [ ] **Step 1: 写 frontend-shell**

区分 `packages/contracts/src/subject.ts` 的可序列化边界 manifest 与 `packages/subject-kit/src/types.ts` 的 runtime manifest；说明 `apps/web/src/subjects/manifest.js` 当前只负责 runtime 装配，ready/locked 以它为准，contracts 到 runtime 的转换/校验仍未生产接线；记录 FeatureLoader 与 mount/show/hide/relayout/syncTheme/dispose。

- [ ] **Step 2: 写 math-canvas**

只写跨层数据流 `GraphDocumentV2 → reducer/store/history → runtime registry → incremental renderer → JSXGraph`、事务失败恢复、frame batching、工具瞬态归属和验证路由；精确不变量直接链接 `apps/web/src/math/AGENTS.md`，不复制整份合同。

- [ ] **Step 3: 写 chemistry-features**

列出 `apps/web/src/chemistry/*`、`subjects/classrooms` 与 Server chemistry 路由；声明化学状态为唯一真值、实验配置驱动、视觉不回写化学结果、AI 输出属外部边界。

- [ ] **Step 4: 写 server-data**

分别列出“当前已接线 / 合同或骨架 / 尚待迁移”；覆盖 v1/v2、settings policy、migration/seed、AI adapter、用户 DB 与 TS 产物。不得宣称全部路由已经 Schema/稳定错误码化。

- [ ] **Step 5: 写 desktop-release**

按 stage smoke → `electron-builder --dir` packaged Resources → DMG/NSIS/portable 与目标机三层写证据；明确 `verify:electron-package` 只覆盖第二层，不能据此声称跨平台最终可发布。

- [ ] **Step 6: 运行结构测试**

Run: `node --test test/shared/xiaohuang-classroom-skill.test.cjs`

Expected: 新 reference 存在、路径和关键合同测试 PASS；若产品/流程 refs 尚需同步，只剩对应断言失败。

- [ ] **Step 7: 提交领域地图**

```bash
git add .grok/skills/xiaohuang-classroom/references/frontend-shell.md \
  .grok/skills/xiaohuang-classroom/references/math-canvas.md \
  .grok/skills/xiaohuang-classroom/references/chemistry-features.md \
  .grok/skills/xiaohuang-classroom/references/server-data.md \
  .grok/skills/xiaohuang-classroom/references/desktop-release.md
git commit -m "docs(skill): add domain and release routing guides"
```

### Task 5: 收敛产品、功能与排障 references

**Files:**
- Modify: `.grok/skills/xiaohuang-classroom/references/product-philosophy.md`
- Modify: `.grok/skills/xiaohuang-classroom/references/hub-bookshelf.md`
- Modify: `.grok/skills/xiaohuang-classroom/references/add-feature.md`
- Modify: `.grok/skills/xiaohuang-classroom/references/debug-playbook.md`

- [ ] **Step 1: 保留产品 owner 内容**

保留 full-bleed hall、品牌、主题完整资产、书本 intro、closed-book dissolve、学科 floater、精品视觉和失败后先研究参考等用户红线；移除工程命令重复。

- [ ] **Step 2: 更新 Hub owner 路径与状态**

保留书架模块、主题封面 v1–v5、转场与模式状态机；学科可进入性改为从 runtime manifest 读取。

- [ ] **Step 3: 将 add-feature 改成链接式清单**

每类功能只列“读取哪个 owner → 修改哪些装配点 → 必须保护什么公开合同 → 去哪里验证”，不复制领域规则。

- [ ] **Step 4: 将 debug-playbook 改成证据路由**

对 Hub/主题、math store/renderer、Server schema/DB、Electron stage/package、Turbo/cache 设置 symptom → first evidence → owner reference；禁止看到结果就直接改渲染层或生成目录。

- [ ] **Step 5: 运行结构与 Markdown 链接测试**

Run: `node --test test/shared/xiaohuang-classroom-skill.test.cjs`

Expected: PASS。

- [ ] **Step 6: 提交产品与流程 references**

```bash
git add .grok/skills/xiaohuang-classroom/references/product-philosophy.md \
  .grok/skills/xiaohuang-classroom/references/hub-bookshelf.md \
  .grok/skills/xiaohuang-classroom/references/add-feature.md \
  .grok/skills/xiaohuang-classroom/references/debug-playbook.md
git commit -m "docs(skill): align product and workflow references"
```

### Task 6: Agent 行为 RED/GREEN 验证

**Files:**
- Modify: `docs/superpowers/plans/2026-08-08-xiaohuang-classroom-skill-v2.md`（只追加验证结果）

- [ ] **Step 1: 固定五类任务文本**

使用设计中的 Electron、math canvas、新学科、quality/cache、视觉任务原文；baseline 使用 `git archive` 快照并移除整个 skill 目录，GREEN 使用包含新版 skill 的另一份快照。每次任务均要求只读审查，避免实现差异污染评分。

- [ ] **Step 2: 记录 baseline**

按 0–2 rubric 记录是否找到 owner、关键不变量和正确证据层级。已观察到：根/子树 `AGENTS.md` 能提供大量事实，因此新版 skill 的增益重点是路由、事实状态分层和证据边界，而不是复制已有合同。

- [ ] **Step 3: 使用新版 skill 重跑**

每个新 Agent 只收到任务、仓库路径和“使用 `$xiaohuang-classroom`”；不得提前给预期结论。每类必须 2 分且不低于 baseline，不稳定场景重复一次。

- [ ] **Step 4: 记录结果与修正**

在本计划末尾追加表格：场景、baseline、GREEN、关键观察。若 Agent 仍误判，先缩短/加强 SKILL 路由或 reference 的 when-to-read 提示，再重跑。

- [ ] **Step 5: 提交行为验证记录**

```bash
git add docs/superpowers/plans/2026-08-08-xiaohuang-classroom-skill-v2.md
git commit -m "test(skill): record project OS forward scenarios"
```

### Task 7: 最终验证与收口

**Files:**
- Verify only: all files above

- [ ] **Step 1: 运行 skill validator**

Run: `python /Users/qin/.codex/skills/.system/skill-creator/scripts/quick_validate.py .grok/skills/xiaohuang-classroom`

Expected: `Skill is valid!`

- [ ] **Step 2: 运行直接合同**

Run: `node --test test/shared/xiaohuang-classroom-skill.test.cjs`

Expected: PASS。

- [ ] **Step 3: 证明根测试入口包含合同**

Run: `npm test`

Expected: workspace tests 与 `test/shared/*.cjs` 全部 PASS，输出包含 xiaohuang classroom skill contract。

- [ ] **Step 4: 运行全质量门禁**

Run: `npx turbo run build test typecheck coverage --force && npm run quality`

Expected: fresh Turbo 执行与常规 quality 均 PASS；如失败来自并行无关改动，记录证据并只修本轮引入问题。

- [ ] **Step 5: 检查工作树与生成物**

Run: `git diff --check && git status --short`

Expected: 无空白错误；只剩明确属于本轮且待提交的文件，不包含用户数据或生成目录。

- [ ] **Step 6: 最终提交**

```bash
git add AGENTS.md .grok/skills/xiaohuang-classroom test/shared/xiaohuang-classroom-skill.test.cjs \
  docs/superpowers/specs/2026-08-08-xiaohuang-classroom-skill-v2-design.md \
  docs/superpowers/plans/2026-08-08-xiaohuang-classroom-skill-v2.md
git commit -m "docs(skill): complete xiaohuang classroom project OS v2"
```

## 行为验证结果

| 验证 | 结果 | 证据 |
| --- | --- | --- |
| 旧 skill RED | 0/7 | frontmatter、直接路由、workspace、Electron、math、生成物合同均按预期失败 |
| 新 skill GREEN | 7/7 | `node --test test/shared/xiaohuang-classroom-skill.test.cjs` |
| Skill 格式 | PASS | `quick_validate.py` 输出 `Skill is valid!` |
| 根测试入口 | PASS | Web 425、shared 57，全部 workspace test 通过 |
| Electron 相邻回归 | 6/6 | `test/desktop/electron-packaged-layout.test.cjs` |
| 全质量门禁 | PASS | `npm run quality`，含 lint baseline 393 未增长、typecheck、arch、assets、build、budget、coverage |

手工逐场景核对结果：Electron reference 明确 stage/packaged/platform 三层；math reference 保护 GraphDocument 与 runtime 原子性；新学科路径以 runtime manifest 为可进入权威并披露两套 lifecycle 的迁移状态；quality reference 区分 cache、工作树和 fresh evidence；视觉路径保留产品红线及浏览器验收边界。未再启动新 Agent 重放这些场景。
