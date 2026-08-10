# 改功能安全手册（Safe Change Playbook）· 工程文档

> 对应风险计划：`docs/superpowers/plans/2026-08-10-main-divergence-and-js-risk-mitigation.md`（Track F + C3）。
> 目标：把「本地 main 独大 × 业务 JS 并存」的风险变成**日常 checklist**，不靠记忆。
> 新 agent 只读本文 + 风险计划 §0 即可开干。

## 1. 标准流程

```text
1. git status 干净；从本地 main 开 codex/* 分支（命名见 branch-authority.md §4）
2. 改（尽量小 diff；落在热点先读 js-hotspots.md 的「改前必跑」）
3. 测：先写/更新失败测试或检查清单；热点执行「改前必跑」命令
4. quality:fast 绿
5. 合本地 main
6. （可选）更新 backup / push —— push 需负责人显式授权，推前跑完整 quality
```

**命令矩阵（最低门禁）：**

| 动作                      | 最低命令                                                  |
| ------------------------- | --------------------------------------------------------- |
| 日常切片合本地 main       | `npm run quality:fast`                                    |
| 推 origin / 发版 / 大合并 | `npm run quality`                                         |
| 只改 `packages/ui`        | ui test + `lint:theme-tokens` + 相关 web 合同测           |
| 只改 server               | `npm run test -w @xiaohuang/server` + `npm run typecheck` |

## 2. 业务 JS 热点

改业务 JS 前先查热点地图 **[js-hotspots.md](js-hotspots.md)**（Track C 并行建设中；若文件暂未存在，
先按 `debt-registry.md` 的 D3/D4/D5 条目与本文 §4 红线处理）。

**改业务 JS 的强制清单（C3）：**

```text
[ ] 落在 js-hotspots 哪一行？
[ ] 改前必跑命令已执行
[ ] 无新增 window.confirm / 裸危险按钮 / 主题硬编码色
[ ] 无不可信 innerHTML
[ ] 有测：新增或更新
[ ] quality:fast 绿再合 main
```

## 3. 否决项（F2 · 任一命中 → 禁止合 main / 禁止推远端）

| #   | 否决项                                                  | 说明                                                              |
| --- | ------------------------------------------------------- | ----------------------------------------------------------------- |
| 1   | `git status` 不干净且含 `coverage/` / `dist/` / 用户库  | 生成物与用户数据不是源码，禁止混入提交                            |
| 2   | quality / quality:fast 红且「先合后修」                 | 红即修复，不做「先合再修」                                        |
| 3   | 新增 `window.confirm` / 主题硬编码色 / 无豁免裸危险按钮 | 危险确认走 `appConfirm` 家族；颜色走 CSS 变量；裸按钮须有豁免登记 |
| 4   | 同名测试双权威（无文档说明）                            | 同名 cjs + vitest 并存须文档注明（如 settings-toast 类）          |
| 5   | graph/index 超行数门禁                                  | `apps/web/src/math/graph/index.js` 行数红线，违规即否决           |
| 6   | 未授权 push main / force                                | push 仅负责人显式授权；force 推共享分支一律禁止                   |

## 4. 红线交叉链接（UI / Dialog / 主题）

- **UI 库采用与禁止事项：** [ui-library.md](ui-library.md)（`@xiaohuang/ui` 采用指南、dispose 合同、危险模式门禁）
- **危险确认路径：** [ui-dialog-audit.md](ui-dialog-audit.md)（`window.confirm/alert/prompt` 为 0 残留；
  一律走 `app-dialog.js` 的 `appConfirm / appAlert / appPrompt`）
- **豁免登记表：** [ui-legacy-allowlist.md](ui-legacy-allowlist.md)（裸危险按钮豁免，`test/shared/ui-no-raw-button-contract.test.cjs` 锁定）
- **主题色红线：** `npm run lint:theme-tokens`（主题分支禁硬编码颜色，只用语义令牌）

## 5. 相关

- 分支纪律 / 权威关系 / 灾难卡：[branch-authority.md](branch-authority.md)
- 质量命令速查：[quality-commands.md](quality-commands.md)
