# 分支权威与纪律（Branch Authority）· 工程文档

> 对应风险计划：`docs/superpowers/plans/2026-08-10-main-divergence-and-js-risk-mitigation.md`
> （Track A3/A4 + Track B）。本文档回答三个问题：**权威线在哪、本地 main 怎么用、坏了怎么办**。

## 1. 定位

仓库长期 `本地 main ≫ origin/main`（写计划时 ahead ≈ 160 提交），风险是「成果只活在一台电脑上」+
「main 变成无限杂糅提交堆」。本文档固化：

- 权威关系填空句（A3，**待 A0 决策后由负责人填写**）；
- 本地 main 卫生规则与分支命名（B1/B2）；
- 灾难卡（A4，一页）。

配套日常操作见 `safe-change-playbook.md`；质量命令见 `quality-commands.md`。

## 2. 权威关系（A3 · 填空句）

> **待填**：A0 策略由负责人选定并记录在风险计划 §9 后，本句填入实际值。
> 当前状态：**未选**（agent 不做任何 push main / force 决策）。

```text
权威开发线：________（如 origin/main 或 backup/...）
本地 main 跟踪：________
落后处理：先 fetch；禁止在未备份时 reset --hard origin
```

配套铁律（风险计划 §0.2）：

- Agent **禁止擅自 `git push origin main` / `git push --force`** 任何共享分支；推送仅在负责人书面/对话明确授权后执行。
- **禁止 `git reset --hard` / `rebase -i` 改写已推送历史**（除非负责人单独授权灾难恢复）。

## 3. 本地 main 卫生（B1）

**本地 main 只接受：**

| 类别                          | 要求                                       |
| ----------------------------- | ------------------------------------------ |
| merge 已验证的 `codex/*` 分支 | 分支自开自合，合前验证绿（见下）           |
| 文档热修                      | 纯文档小改                                 |
| 紧急热修                      | **须注明**（commit message / PR 说明理由） |

**禁止：**

- 在 main 上直接开大型功能；
- 连环 `fixup` 不说明（禁止「顺手在 main 上堆 20 个无关 commit」）；
- 混入生成物（`dist/`、`coverage/`、用户数据、`apps/server/data/*` 运行库、嵌套 lockfile、本地 agent skill）。

**合 main 前最低门禁：**

| 场景                             | 最低命令                      |
| -------------------------------- | ----------------------------- |
| 日常切片合本地 main              | `npm run quality:fast`        |
| 涉及 CI 历史问题 / 发布 / 推远端 | `npm run quality`（完整链路） |

**合 main 后：** 按 A0 决策定期同步——A0-1 定期 push origin/main；A0-2 定期更新 backup 分支。
（A0 决策见风险计划 §9，本文档不假设、不代填。）

## 4. 分支命名（B2）

```text
codex/risk-a-*     权威/文档
codex/risk-c-*     热点硬化
codex/risk-d-*     测试迁移
codex/risk-e-*     门禁
codex/feat-*       产品功能
codex/fix-*        缺陷
```

> 风险计划本身的分支约定为 `codex/risk-*`；B/F 切片当前实际以 `codex/risk-b-*` / `codex/risk-f-*`
> （或合并 `codex/risk-bf-*`，如本批 `codex/risk-bf-docs`）命名。

## 5. 灾难卡（A4 · 一页）

| 场景                    | 动作                                                                                                                                                                |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 本地损坏但远程有 backup | `git fetch` → `git checkout main` → **先另建救援分支**（如 `rescue/$(date +%Y-%m-%d)`）→ `git reset --hard origin/<backup-ref>`（**慎用**；确认无未提交成果后再做） |
| 误推 main               | **立即停手**，报告负责人；仅在负责人授权且团队知晓时 `git push origin <good-sha>:main`；**优先 revert 提交而非 force**                                              |
| 未备份已丢              | 查 Time Machine / 其它 worktree / agent session 残留；无则接受损失并复盘备份策略                                                                                    |

---

**生效记录：** 自本计划（2026-08-10）起本地 main 纪律生效，首笔落地见风险计划 §12 日志。
