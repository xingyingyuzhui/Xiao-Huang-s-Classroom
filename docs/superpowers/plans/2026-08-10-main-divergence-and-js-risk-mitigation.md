# 小黄的教室 · 最大风险化解计划：本地 main 分叉 + 业务 JS 并存

| 字段 | 内容 |
| --- | --- |
| **文档类型** | 可执行风险化解计划（Agent / 人类共用） |
| **版本** | 2026-08-10 v1.0 |
| **仓库** | 小黄的教室 monorepo |
| **写计划时快照** | 本地 `main` @ `e8e5498`，约 **ahead `origin/main` 160** 提交（以 `git rev-list --count origin/main..HEAD` 为准） |
| **风险一句话** | 工程基座已强，但**权威线只在本机、业务仍大量 JS**——一次误合、误推、绕门禁或大改 JS 热点，损失面等于整段现代化成果 |
| **分支约定** | 执行切片走 `codex/risk-*`；合入**本地 main** 前须本 Track 验证绿；**推 `origin/main` 必须负责人显式指令**（本计划给决策门与清单，不授权 agent 擅自 push） |
| **权威冲突** | 以**当前代码 + `npm run quality` / CI 证据**为准，再回写本文与 `debt-registry` |
| **关联** | 见 [附录 A](#附录-a--关联文档) |

---

## 0. 执行者必读

### 0.1 你在解决什么问题

此前评估结论：工程化约 **7.5/10**，基座（monorepo / packages / quality / CI）已像产品工程；**最大风险不是缺工具**，而是：

```text
┌─────────────────────────────────────────────────────────────┐
│  R1  本地 main ≫ origin/main（百级提交未上远端）              │
│      · 单点故障：本机磁盘/误 reset/误 force-push 可丢整段工作  │
│      · 协作失真：CI / 他人 / 备份仍以旧 origin 为准           │
│      · 心理膨胀：本地「已完成」≠ 可恢复、可审计的发布真相      │
├─────────────────────────────────────────────────────────────┤
│  R2  业务层仍大量 JS + 双轨测试 + UI/DOM 债务未清零           │
│      · 改功能时类型/边界弱，易在「能跑」中绕过合同             │
│      · 测试双轨（web cjs≈48 + vitest≈40）增加漏测与假绿感     │
│      · 绕 quality / 只测子集 / 直接改 main 会放大 R1 爆炸半径 │
└─────────────────────────────────────────────────────────────┘
         R1 × R2 = 爆炸半径：整段工程现代化成果 + 产品回归
```

本计划把上述风险拆成 **可验收 Track**，目标是：

1. **权威可恢复**（R1）：本地成果有远端备份与清晰同步决策，不再「只活在一台电脑上」。  
2. **改动能守门**（R2）：业务 JS 热点有地图、有门禁、有「改这里必须怎样」的操作手册。  
3. **流程防绕过**（R1∩R2）：默认 feature 分支 + quality；push main 有清单与否决项。

### 0.2 硬纪律

1. **Agent 禁止擅自 `git push origin main` / `git push --force` 任何已共享分支。** 推送仅在负责人书面/对话明确授权后执行，并先跑完对应 Track 清单。  
2. **禁止 `git reset --hard` / `rebase -i` 改写已推送历史**（除非负责人单独授权灾难恢复）。  
3. **新功能与风险化解切片一律 `codex/*` feature 分支**；验证后再合本地 main。禁止「顺手在 main 上堆 20 个无关 commit」。  
4. **改业务 JS / 测试 / 壳层前先跑相关测**；合 main 前至少 `quality:fast`，发布/推远端前 `quality`。  
5. **不一次全仓 TS、不一次清零 web cjs、不做 D2 Win exe**（无环境则保持暂缓）。  
6. 不提交 `dist/`、`coverage/`、用户数据、`apps/server/data/*` 运行库、嵌套 lockfile、本地 agent skill。  
7. 安装只从仓库根：`npm install`。  
8. 主题色只走 CSS 变量；危险确认只走 `appConfirm` 家族；UI 组件禁止不可信 `innerHTML`。

### 0.3 标准 Task 流程

```text
1. 读本 Task + 关联文件 + §9 交接卡
2. git status 干净；从 main 开 codex/risk-<track>-<short>
3. 先写/改失败测试或检查清单（若适用）
4. 实现（尽量小 diff）
5. 跑本 Task 验证命令
6. 更新本文 §9 / §12 / 相关 debt
7. commit；合入本地 main（若 Task 要求）
8. 推远端：仅当负责人明确说「推」且对应决策门已勾
```

### 0.4 全局验证命令

```bash
# 分叉现状
git fetch origin 2>/dev/null || true
git rev-parse --short HEAD
git rev-list --count origin/main..HEAD   # 本地领先
git rev-list --count HEAD..origin/main   # 本地落后（应为 0 或已知）

# 开发中
npm run quality:fast

# 推远端 / 重大合并前
npm run quality

# 业务改动常用子集
npm run test -w @xiaohuang/web
npm run test -w @xiaohuang/server
npm run test -w @xiaohuang/ui
npm run lint:arch
npm run lint:theme-tokens
```

---

## 1. 风险诊断（完整画像）

### 1.1 风险矩阵

| ID | 风险 | 可能性 | 影响 | 当前等级 | 主责 Track |
| -- | ---- | ------ | ---- | -------- | ---------- |
| R1a | 本机丢失 / 误删工作区导致 160 提交不可恢复 | 中 | **灾难** | **P0** | A 备份同步 |
| R1b | 误 force-push / 错误覆盖 origin | 低 | **灾难** | **P0** | A / F 流程 |
| R1c | 他人或 CI 仍以旧 origin 为真相，双线漂移 | 高 | 高 | **P0** | A 决策门 |
| R1d | 本地 main 持续直接开发，历史更难审 | 高 | 中 | P1 | B 分支卫生 |
| R2a | 热点业务 JS 无类型，改坏无编译拦 | 高 | 高 | **P0** | C 热点硬化 |
| R2b | 测试双轨漏跑一半，假绿 | 中 | 高 | P1 | D 测试收敛 |
| R2c | 绕过 quality 合入（「只跑一个文件」） | 中 | 高 | P1 | E 门禁加固 |
| R2d | DOM 捕获 / innerHTML / 裸按钮回归 | 中 | 中 | P2 | C / 既有门禁 |
| R3 | 大爆炸迁移（全仓 TS）拖死产品 | 中 | 高 | 管控 | §1.3 非目标 |

### 1.2 为何是「最大」风险（相对其它债）

| 对比项 | 为何次于 R1×R2 |
| ------ | -------------- |
| D2 Win exe | 无环境，**不阻塞**日常开发与备份 |
| D7 测试双轨 | 是 R2 放大器，但单独迁测不会防止「本机丢盘」 |
| D14 全量 server TS | 长期收益；**不如先保住权威线与改动纪律** |
| UI 视觉深化 | 产品体验；丢提交则体验与工程一起没 |

**原则：先保住「可恢复的权威线」和「改业务时的护栏」，再谈继续现代化切片。**

### 1.3 现状证据（写计划时；执行前复核）

| 项 | 约值 |
| -- | ---- |
| `origin/main..HEAD` | ~160 |
| `test/web` cjs / vitest | ~48 / ~40 |
| `apps/server/test` | vitest 全量（~22 文件级） |
| `packages/*` TS 源 | ~80+ |
| `@xiaohuang/ui` 业务 import | ~10 文件 |
| pre-push hook | **无** |
| 本地 quality | 近期曾在 tip 绿（以最新 `npm run quality` 为准） |

### 1.4 爆炸场景（用来统一恐惧模型）

1. **本机重装 / 误 `rm -rf` 仓库**：origin 仍是 160 提交前 → 工程现代化整段蒸发。  
2. **agent 执行 `git push --force origin main`**：远端被旧历史或错分支覆盖（若权限在）→ 协作灾难。  
3. **在本地 main 上改 graph/大厅 JS，只跑一个测试就认为完成**：静默破坏 + 再堆 20 提交 → bisect 困难。  
4. **未 fetch 情况下「从 GitHub 新 clone」继续开发**：双主线。  

---

## 2. 计划摘要

### 2.1 目标一句话

在 **不强迫全仓 TS、不自动强推 main** 的前提下，把「本地独大 + 业务 JS」从灾难级压到**可管理的常规工程风险**。

### 2.2 六条 Track

| 序 | Track | 主题 | 压哪个风险 | 建议工期 |
| -- | ----- | ---- | ---------- | -------- |
| 1 | **A** Authority | 权威线与远端备份 / 同步决策 | R1a–c | 0.5–2 天（含人类决策） |
| 2 | **B** Branch | 本地 main 卫生与分支纪律 | R1d | 0.5 天 + 持续 |
| 3 | **C** Code hotspots | 业务 JS 热点地图与硬化切片 | R2a, R2d | 3–10 天（可分期） |
| 4 | **D** Dual-test | 测试双轨收敛（D7 续） | R2b | 2–5 天 / 批 |
| 5 | **E** Enforcement | 门禁防绕过（脚本/CI/钩子可选） | R2c | 1–2 天 |
| 6 | **F** Playbook | 改功能安全手册 + 否决清单 | 全部 | 0.5–1 天 |

**推荐顺序：** A0 备份决策 → B 纪律落文 → F 手册（可与 B 同日）→ E 轻量门禁 → C/D 交错切片。  
**A 的「是否 push origin/main」是人类决策门**；agent 可准备分支/PR/清单，不可替人做最终 push。

### 2.3 成功标准（本计划「最大风险已化解」口令）

仅当 **S1–S6 全部为真**：

| # | 标准 |
| - | ---- |
| **S1** | 存在**至少一处非本机**的完整提交备份（`origin` 上的 main **或** 明确命名的备份分支 / PR 分支，含 tip 等价提交）；路径写入 §9 |
| **S2** | 同步策略成文：本地 main 与 `origin/main` 关系、何时 push、禁止 force 的规则；负责人签字式确认（§9 勾选） |
| **S3** | 分支纪律生效：新工作默认 `codex/*`；本文后 2 周内无「无说明的 main 上巨型杂糅提交」（抽查 log） |
| **S4** | 业务 JS **热点地图**落地（§5）；Top 热点各有「改前必跑命令」；至少 **1** 个热点完成硬化样板（TS 或合同测+边界锁） |
| **S5** | D7 再收敛：web cjs 较写计划时基线 **下降 ≥10** 文件，或明确「本季度剩余清单」且无双权威 |
| **S6** | 防绕过：`quality` / `quality:fast` 说明进手册；可选 pre-push 或 CI 必绿策略二选一落地；**无** agent 擅自 push main 事件 |

### 2.4 明确不做

- Windows `.exe` / pkg 退役验收（D2，环境未就绪）  
- 全仓业务 JS → TS 大爆炸  
- 一次删光 `test/web/*.cjs`  
- 大厅 Three.js / 新学科产品大功能（可另立项）  
- Agent 自动 `git push origin main`  
- 改写已推送的 origin 历史  

---

## 3. Track A — 权威线与远端备份（P0）

**目标：** 消除「成果只活在本机」的灾难面。  
**分支建议：** 文档与清单可在 `codex/risk-a-authority`；**push 本身不是分支问题**。

### A0 · 人类决策门（必须先选一条）

负责人在 §9 勾选 **唯一** 主策略（可改，但必须显式）：

| 选项 | 含义 | 适用 |
| ---- | ---- | ---- |
| **A0-1 推 origin/main** | 本地 main tip 成为公开权威；CI 以它为准 | 独享仓库或已审阅 160 提交 |
| **A0-2 推备份分支** | 如 `backup/main-2026-08-10` 或 `integration/2026-08`，**暂不**改 origin/main | 想先备份、再开 PR 审 |
| **A0-3 开 PR 再合** | push 功能/集成分支 → PR → review → 合 origin/main | 有协作或需要审计轨迹 |
| **A0-4 仅本地 + 异机 clone 包** | 不推荐；仅当完全离线。须外置 bare 镜像路径写入 §9 | 极端 |

**默认推荐（单人、仓库私有）：A0-2 立即备份 → 再决定 A0-1 或 A0-3。**  
**绝不推荐：长期停在 A0-4。**

### A1 · 推送前只读审计（无论 A0-1/2/3）

```bash
git fetch origin
git status                    # 须干净
git log origin/main..HEAD --oneline | head -50
git diff --stat origin/main...HEAD | tail -20
# 敏感物扫描（示例）
git rev-list --objects origin/main..HEAD | git cat-file --batch-check='%(objecttype) %(objectname) %(objectsize) %(rest)' \
  | awk '/^blob/ {print}' | sort -k3 -n | tail -20
rg -n "API_KEY|BEGIN RSA|password\s*=" $(git diff --name-only origin/main...HEAD) 2>/dev/null || true
npm run quality               # tip 全绿
```

**完成定义：**

- [ ] 工作区干净  
- [ ] quality 在 tip 绿，结果记 §12  
- [ ] 无密钥/大数据误提交（抽查）  
- [ ] 变更范围负责人知情（工程现代化 + UI + 测迁，无意外二进制）

### A2 · 执行备份（按决策）

**A0-2 示例：**

```bash
git branch backup/main-$(date +%Y-%m-%d) HEAD
# 负责人授权后：
git push -u origin backup/main-YYYY-MM-DD
```

**A0-1 示例（仅授权后）：**

```bash
git push origin main
# 确认 CI quality.yml 绿
```

**A0-3 示例：**

```bash
git push -u origin HEAD:integration/eng-2026-08
gh pr create --base main --head integration/eng-2026-08 --title "..." --body "..."
```

**完成定义：**

- [ ] `git ls-remote origin` 可见备份 tip 或 main tip  
- [ ] §9 填写：远程 ref 名、SHA、日期、策略选项  

### A3 · 同步后关系冻结

写成固定句（填空）：

```text
权威开发线：________（如 origin/main 或 backup/...）
本地 main 跟踪：________
落后处理：先 fetch；禁止在未备份时 reset --hard origin
```

**完成定义：**

- [ ] 句子写入 §9 与 `docs/engineering/quality-commands.md`（或新建 `docs/engineering/branch-authority.md`）

### A4 · 回滚与灾难卡（一页）

| 场景 | 动作 |
| ---- | ---- |
| 本地损坏但远程有 backup | `git fetch` + `git checkout main` + `git reset --hard origin/<backup-ref>`（**慎用**，先另建救援分支） |
| 误推 main | **立即** `git push origin <good-sha>:main` 仅当负责人授权且团队知晓；优先 revert 提交而非 force |
| 未备份已丢 | 查 Time Machine / 其它 worktree / agent session 残留；无则接受损失 |

**完成定义：**

- [ ] 灾难卡在 `docs/engineering/branch-authority.md`  

---

## 4. Track B — 本地 main 卫生与分支纪律

**目标：** 阻止 R1d——main 继续变成「无限杂糅提交堆」。

### B1 · 规则（写入 branch-authority.md）

1. **本地 main 只接受：** merge 已验证的 `codex/*`、文档热修、紧急热修（须注明）。  
2. **禁止：** 在 main 上直接开大型功能、连环 fixup 不说明、混入生成物。  
3. **合 main 前最低：** `quality:fast`；涉及 CI 历史问题或发布：`quality`。  
4. **合 main 后：** 若已选 A0-1，定期 push；若 A0-2，定期更新 backup 分支。  

### B2 · 分支命名

```text
codex/risk-a-*     权威/文档
codex/risk-c-*     热点硬化
codex/risk-d-*     测试迁移
codex/risk-e-*     门禁
codex/feat-*       产品功能
codex/fix-*        缺陷
```

### B3 · 完成定义

- [ ] `docs/engineering/branch-authority.md` 存在且被 AGENTS.md 或 engineering 索引链接  
- [ ] §9 记录「自本计划起 main 纪律生效」日期  

---

## 5. Track C — 业务 JS 热点地图与硬化

**目标：** 降低 R2a/R2d——改功能时最容易炸的 JS 区有地图与护栏。

### C1 · 热点地图（必须产出文件）

**产出：** `docs/engineering/js-hotspots.md`

建议列（执行时用 `wc -l` / 依赖扇出 / 近期 churn 复核）：

| 热点 | 路径（示意） | 风险类型 | 改前必跑 | 硬化策略 |
| ---- | ------------ | -------- | -------- | -------- |
| 函数画布入口 | `math/graph/index.js` | 行数/编排（D5） | graph 结构测 + quality:fast | 禁止新职责回流；抽纯函数到 TS |
| 函数侧栏 | `function-panel/list/editor` | DOM 捕获（D3）、UI | function-panel 生命周期测 | dispose 样板已在；保持 |
| 板工具/笔记 | `board-tools.js` / `board-notes.js` | UI/事件 | board-notes 测 | 已库化，勿回流 innerHTML |
| 设置/弹窗 | `settings.js` / `app-dialog.js` | 全局壳、焦点 | app-dialog 全测 + settings 合同 | 保持 appConfirm；Esc 合同已修 |
| 分子列表 | `chemistry/molecule/list.js` | 列表/删除 | molecule 体验测 | 已 polish |
| AI 课壳 | `ai-classroom/*-shell.js` | 大文件/确认 | 相关 shell 测 | 编排瘦身另项 |
| 学科壳 | `subjects/classrooms/*` | 生命周期 | subject-manifest / mount 测 | 已有 TS 切片则保持 |
| Hub/书架 | `subjects/*hub*` / bookshelf | 3D/动画 | hub 结构测 | **本计划不深改 3D** |
| Server 组合根 | `apps/server/src/index.js` | 双轨入口（D1） | server vitest + clean-build | 新路由只加 TS 权威源 |

### C2 · 硬化优先级（本计划最少做完 P0）

| 优先级 | 动作 | 完成定义 |
| ------ | ---- | -------- |
| **P0** | 地图 + 每热点「改前必跑」 | `js-hotspots.md` 合并 |
| **P0** | 任选 **1** 个纯逻辑热点抽到 TS 或补强合同测（如 graph 纯函数、chem 数据） | 测绿 + allowlist 更新 |
| **P1** | graph 入口继续守 &lt;700；新增逻辑禁止进 index | 大文件/结构测绿 |
| **P1** | 新 UI 只走 `@xiaohuang/ui` + app-dialog（违者合同测红） | 既有门禁保持 |
| **P2** | 更多 dispose 样板推广（D3） | 按模块列清单 |

### C3 · 改业务 JS 的强制清单（贴进 F 手册）

```text
[ ] 落在 js-hotspots 哪一行？
[ ] 改前必跑命令已执行
[ ] 无新增 window.confirm / 裸危险按钮 / 主题硬编码色
[ ] 无不可信 innerHTML
[ ] 有测：新增或更新
[ ] quality:fast 绿再合 main
```

### C4 · Track C 完成定义

- [ ] `js-hotspots.md` 落地并链接  
- [ ] ≥1 硬化样板合入  
- [ ] allowlist / debt D3/D4/D5 状态无矛盾  

---

## 6. Track D — 测试双轨收敛（D7 续）

**目标：** 降低 R2b 假绿；与 handoff Track T 衔接，不重复已迁 24 文件。

### D1 · 基线（执行日重测）

```bash
ls test/web/*.cjs | wc -l
ls test/web/*.vitest.ts | wc -l
```

记入 §9：`cjs_base` / `vitest_base`。

### D2 · 下一批队列原则

| 优先迁 | 暂缓 |
| ------ | ---- |
| 纯逻辑、无 JSXGraph/Three 真 DOM | hub/bookshelf 3D、完整 mount E2E |
| 已有 vitest 风格可复制的 math/* | desktop / release 打包测 |
| 单文件可删 cjs 达单权威 | 故意拆分的 settings-toast（cjs 静态 + vitest 运行时）——**保留但文档化** |

**本计划数量门禁：** 至少再迁 **≥10** 个 web cjs（可分多 PR），或在 §9 写明「本季度目标 10、本周完成 N」且 N≥5 并有剩余清单。

### D3 · 单文件步骤（同 handoff）

见 `2026-08-08-handoff-stabilize-d7-ui-polish.md` §5.3；迁后删旧 cjs。

### D4 · 完成定义

- [ ] cjs 数下降达门禁  
- [ ] 无同名双权威（settings-toast 类除外且文档注明）  
- [ ] debt D7 备注更新  
- [ ] `npm run test -w @xiaohuang/web` 绿  

---

## 7. Track E — 门禁防绕过

**目标：** 降低 R2c；不靠「自觉」 alone。

### E1 · 文档层（必做）

在 `docs/engineering/quality-commands.md` 或 branch-authority 中写清：

| 动作 | 最低命令 |
| ---- | -------- |
| 日常切片合本地 main | `quality:fast` |
| 推 origin / 发版 / 大合并 | `quality` |
| 只改 packages/ui | ui test + theme-tokens + 相关 web 合同 |
| 只改 server | `npm run test -w @xiaohuang/server` + typecheck |

### E2 · 可选自动化（负责人选 0–N 项）

| 选项 | 做法 | 注意 |
| ---- | ---- | ---- |
| **E2-a** pre-push hook | 对 `main` 推送跑 `quality:fast` 或 `quality` | 勿提交密钥；可用 simple husky 或 `core.hooksPath` |
| **E2-b** 仅 CI 权威 | push 后必须 quality.yml 绿才算同步成功 | 适合 A0-1/A0-3 |
| **E2-c** CODEOWNERS / 分支保护 | GitHub 保护 main：禁 force、要 PR | 需仓库权限 |
| **E2-d** 不装 hook | 仅手册 + 抽查 | 单人可暂用，**不能**当长期唯一手段 |

**推荐：** A0-1 或 A0-3 时至少 **E2-b + E2-c（若可）**；单人可先 **E2-a 轻量**。

### E3 · Agent 约束（写进 AGENTS.md 短节或本文附录 B）

```text
- 禁止 push origin main，除非用户本轮明确说「推 main/推远端」
- 禁止 --force 推共享分支
- 合本地 main 前跑 quality:fast（用户要求跳过须记录）
```

### E4 · 完成定义

- [ ] E1 文档落地  
- [ ] E2 至少选定并记录；若选 hook/保护则配置生效  
- [ ] AGENTS 或 engineering 有 agent 禁推句  

---

## 8. Track F — 改功能安全手册（Playbook）

**目标：** 把 R1×R2 变成日常 checklist，而不是靠记忆。

### F1 · 产出文件

**`docs/engineering/safe-change-playbook.md`**，至少含：

1. 开分支 → 改 → 测 → quality:fast → 合本地 main →（可选）更新 backup / push  
2. 热点表链接 `js-hotspots.md`  
3. 否决项（见下）  
4. 与 UI / dialog / 主题红线交叉链接  

### F2 · 否决项（任一命中则禁止合 main / 禁止推远端）

- [ ] `git status` 不干净且含 coverage/dist/用户库  
- [ ] quality / quality:fast 红且「先合后修」  
- [ ] 新增 `window.confirm` / 主题硬编码色 / 无豁免裸危险按钮  
- [ ] 同名测试双权威（无文档说明）  
- [ ] graph/index 超行数门禁  
- [ ] 未授权 push main / force  

### F3 · 完成定义

- [ ] playbook 落地并被链接  
- [ ] 新 agent 只读 playbook + §0 能开干  

---

## 9. 交接卡（执行中更新）

| 字段 | 值 |
| ---- | -- |
| 写计划时 tip | `e8e5498`（复核以 HEAD 为准） |
| 分叉 | origin/main..HEAD ≈ **160**（复核） |
| A0 策略 | **A0-1 推 origin/main**（负责人 2026-08-10 选定） |
| 远程备份 ref | — |
| 远程备份 SHA | — |
| quality 证据 | — |
| cjs/vitest 基线 | cjs≈48 / vitest≈40 |
| C 热点地图 | 未 / 已 |
| C 硬化样板 | — |
| D 本批迁徙数 | 0 |
| E2 选项 | 未选 |
| 下一刀 | **A0 人类决策 + A1 审计** |

---

## 10. 详细 Task 勾选总表

### Track A

- [x] A0 策略选定并写入 §9（A0-1，负责人 2026-08-10）  
- [ ] A1 推送前审计 + quality  
- [ ] A2 远程备份或 PR/main 同步执行  
- [ ] A3 权威关系成文（branch-authority.md）  
- [ ] A4 灾难卡  

### Track B

- [ ] B1–B2 纪律写入 branch-authority  
- [ ] B3 链接 AGENTS / engineering  

### Track C

- [ ] C1 js-hotspots.md  
- [ ] C2 ≥1 硬化样板  
- [ ] C3 清单进 playbook  
- [ ] C4 debt/allowlist 一致  

### Track D

- [ ] D1 基线登记  
- [ ] D2–D3 迁 ≥10（或分期达标）  
- [ ] D4 D7 备注更新  

### Track E

- [ ] E1 命令矩阵  
- [ ] E2 选项落地  
- [ ] E3 agent 禁推句  

### Track F

- [ ] F1 playbook  
- [ ] F2 否决项  
- [ ] F3 链接  

### 收官

- [ ] S1–S6 全真  
- [ ] §12 日志完整  
- [ ] 无未授权 push / force  

---

## 11. 排期建议

```text
Day 0     负责人选 A0；A1 quality
Day 0–1   A2 备份推送（强烈建议当天完成，消除灾难面）
Day 1     B + F 文档；E1；E3
Day 1–2   E2 可选自动化
Day 2–4   C1 地图 + C2 一样板
Day 3–7   D 批迁 web 测（可与 C 交错）
Day 7+    若 A0-2：再开 PR/决定是否升格 origin/main（A0-1/3）
```

**并行：** C 与 D 可双 agent，分目录；A2 push 只一人执行。

---

## 12. 状态日志

| 日期 | Track | 变更 | 分支/Commit | 验证 |
| ---- | ----- | ---- | ----------- | ---- |
| 2026-08-10 | — | 计划 v1.0 创建 | 文档 | — |
| 2026-08-10 | A0 | 策略选定：A0-1 推 origin/main（负责人） | 文档 | — |

---

## 13. 任务卡片模板

```markdown
### Task ID: （如 A2-backup-push）
- 分支：codex/risk-
- 是否需要人类授权 push：是 / 否
- 完成定义：
  - [ ]
- 验证命令：
- 风险：
- 完成后：
  - [ ] 更新 §9 / §12
  - [ ] 未擅自 push main
```

---

## 附录 A · 关联文档

```text
docs/superpowers/plans/2026-08-08-engineering-optimization-roadmap.md
docs/superpowers/plans/2026-08-08-ui-library-adoption-plan.md
docs/superpowers/plans/2026-08-08-handoff-stabilize-d7-ui-polish.md
docs/engineering/debt-registry.md
docs/engineering/js-allowlist.md
docs/engineering/quality-commands.md
docs/engineering/ui-library.md
docs/engineering/ui-dialog-audit.md
docs/engineering/pkg-retirement-gate.md   # D2 暂缓

.github/workflows/quality.yml
.github/workflows/electron-package.yml
AGENTS.md
```

**本计划新增（执行时创建）：**

```text
docs/engineering/branch-authority.md      # A3/A4/B
docs/engineering/js-hotspots.md           # C1
docs/engineering/safe-change-playbook.md  # F1
```

---

## 附录 B · 给 Agent 的一分钟版

1. 最大风险 = **本机独大 × 业务 JS**，不是缺 ESLint。  
2. 先问负责人：**A0 选哪条？** 没选之前只做审计与文档，**不 push main**。  
3. 默认顺序：A 备份 → B/F 纪律手册 → E 门禁 → C 热点 → D 测迁。  
4. 合本地 main 可以；**推 origin/main 必须用户本轮明确说。**  
5. 成功口令看 **§2.3 S1–S6**，不是「又迁了几个文件」。  

---

## 附录 C · 与旧计划关系

| 旧计划 | 关系 |
| ------ | ---- |
| 工程优化路线图 | 本计划 **不替代** 90 天图；专治 R1×R2 |
| Handoff stabilize | D7/UI 已收官；本计划 **D 续迁**、**C 用其 UI 红线** |
| UI 采用计划 | 红线复用；本计划不重复 P0–P7 |
| Skill v2 | 不在范围 |

---

## 附录 D · 风险残留（计划完成后仍接受）

即使 S1–S6 全满足，以下为**可接受残留**（须知情）：

| 残留 | 为何接受 | 后续 |
| ---- | -------- | ---- |
| 业务仍有大量 JS | 全量 TS 成本高于收益曲线 | 热点继续切片 |
| web 仍有部分 cjs | 3D/重 DOM 难迁 | D 持续项 |
| D2 无 Win 包 | 无环境 | 环境就绪另开 |
| 单人无 CODEOWNERS | 仓库权限/习惯 | E2-c 可选 |

**不可接受残留：** 无任何远端/异机备份；main 可 force；改热点零测试合入。

---

**文档结束。**  
执行从 **Track A0（人类决策）+ A1 审计** 开始；**默认先做 A0-2 备份推送以消除灾难面**，再决定是否升格 `origin/main`。  
**Agent 不得擅自 `git push origin main` 或 `--force`。**
