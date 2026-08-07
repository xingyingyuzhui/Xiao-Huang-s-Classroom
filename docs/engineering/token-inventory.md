# 设计令牌清单（Token Inventory）

> Program 3 Task 3.1 产物。来源：`apps/web/src/shared/styles/themes/{default,blackboard,pixel,reagent,stationery}/tokens.css`。
> 提取日期：2026-08-07。Program 3 Task 3.2 将把本清单落为 `packages/design-tokens` 的 TS 语义定义。

## 覆盖结论

- 五主题共 **71 个语义令牌**，全部主题全覆盖（0 缺失）。
- 分类：

| 族            | 令牌                                                                                                                                                            | 说明                 |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| surface/paper | `paper` `paper-deep` `bg-body` `bg-body-deep` `card-bg` `card-elevated` `stage-3d-bg`                                                                           | 画布与卡片底         |
| text/ink      | `ink` `ink-soft` `ink-lab` `text-primary` `text-secondary` `text-muted`                                                                                         | 文字层级             |
| border        | `border` `border-soft` `border-ink` `topbar-border`                                                                                                             | 边框                 |
| accent/brand  | `stamp` `stamp-soft` `diagram` `diagram-soft` `accent` `accent-hover` `accent-soft` `flame` `flame-soft` `btn-primary` `btn-primary-hover` `btn-primary-border` | 品牌/操作色          |
| note/warn     | `note` `note-soft`                                                                                                                                              | 提示                 |
| shadow        | `shadow-sm` `shadow-md` `shadow-float` `shadow-print` `shadow-print-sm` `shadow-inset-glass`                                                                    | 层级阴影             |
| canvas (math) | `math-fn-1..8` `math-point-ring` `math-grid`                                                                                                                    | 多曲线色板/描边/网格 |
| zone (chem)   | `zone-s` `zone-p` `zone-d` `zone-ds` `zone-f` `zone-noble`                                                                                                      | 元素分区色           |
| radius        | `radius-box` `radius-card` `radius-control`                                                                                                                     | 圆角                 |
| spacing       | `gap-size` `f-gap-size`                                                                                                                                         | 间距                 |
| stroke        | `ui-stroke` `ui-stroke-strong`                                                                                                                                  | 线宽                 |
| typography    | `font-display` `font-latin` `font-cjk` `font-serif-cjk` `font-mono` `font-main`                                                                                 | 字体                 |
| chrome        | `topbar-bg` `topbar-border` `topbar-shadow` `bg-image` `body-noise-opacity` `brand-eyebrow-display`                                                             | 壳层装饰             |

## 语义映射建议（→ design-tokens 族）

- `color.surface.*` ← paper/bg-body/card-bg/card-elevated/stage-3d-bg
- `color.text.*` ← ink/text-*
- `color.border.*` ← border-*
- `color.accent.*` / `color.danger` / `color.success` ← accent/flame（danger/success 需要新增语义值：现有主题无独立 danger/success token，zone-f/zone-ds 可作近似，P3 收口时补）
- `canvas.math.*` ← math-fn-1..8/math-point-ring/math-grid
- `canvas.chem.*` ← zone-*
- `shadow.*` ← shadow-*
- `radius.*` ← radius-*
- `spacing.*` ← gap-size/f-gap-size
- `typography.*` ← font-*
- `motion.*` ← **缺失**（tokens.css 无 motion token；动画时长/缓动散落在 CSS 中，P3 收口时登记）
- `size.control.*` ← **缺失**（control 尺寸/touch target 未语义化，P3 收口时登记）

## 差异与缺口

1. 无独立 `danger`/`success` 语义色（有 zone-f/zone-ds 近似）。
2. 无 `motion` token（duration/easing）。
3. 无 `control-size`/`touch-target` token。
4. `font-display`/`font-latin` 五主题值不同但结构一致。

以上缺口在 Task 3.8（五主题收口）与 design-tokens 落地时补齐；**本次 inventory 只记录，不改 CSS**。
