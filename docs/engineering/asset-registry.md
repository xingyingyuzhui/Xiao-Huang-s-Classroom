# 资源清单（Asset Registry）

> Program 7 Task 7.6 / R3.3 产物。机器可读清单：`docs/engineering/assets-manifest.json`
> （由 `node tooling/architecture/check-assets.mjs --manifest` 生成，可重复、仅相对路径）。

## 清单字段

| 字段 | 说明 |
|---|---|
| id / path | 相对 `apps/web/public/` 的路径（唯一） |
| format | 扩展名（png/webp/svg/…） |
| size / hash | 字节数与 sha256 前 16 位（重复/变更检测） |
| owner | 目录推断（subject-covers/hub-backgrounds/… 的归属学科） |
| themeVariants | 主题封面变体号（v1–v5） |
| source / license | 仓库内来源；license 当前登记 unknown，逐项补充 |
| preloadPolicy / fallback | 默认 lazy / null；按需登记 |

## 检查项（`npm run lint:assets`）

1. JS/TS 字符串引用与 CSS `url()` 引用的 `/assets/...` 必须存在（缺失即失败）。
2. 主题封面：chemistry/math/physics/biology × v1–v5 五套齐全（错误变体检测）。
3. 重复大文件：>800kB 图片按头尾采样 hash 查重。
4. 清单生成必须可重复：仅相对路径，无机器绝对路径/时间戳（generatedAt 只到日期）。

## 当前规模（2026-08-08）

- 25 项资源（hub-backgrounds × 5、subject-covers × 20）
- 12 处源码引用全部有效
- license 字段待逐项补充（后续 Task 不允许跳过）
