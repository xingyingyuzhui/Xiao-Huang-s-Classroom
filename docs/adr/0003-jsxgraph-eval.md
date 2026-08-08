# ADR-0003：JSXGraph 内部 eval 的接受与使用面限制

- **日期：** 2026-08-08
- **状态：** 已接受（D-jessie / D8 评估完成）

## 背景

- `jsxgraph@1.13.1` 的 `src/parser/jessiecode.js` 用 `eval(str)` 执行解析后的表达式（JessieCode 语言特性，`board.js` 另有 `JXG.evaluate` 内置函数）。
- 本项目**不使用 JessieCode**：函数/公式表达式由 `@xiaohuang/math-expr` + `compileMathExpr`（`shared/expr-safe.js`）解析求值；JSXGraph 仅承担几何渲染（坐标变换、曲线绘制），渲染路径不把用户表达式字符串交给 JSXGraph 解析。

## 决策

**接受**（不更换渲染器 / 不屏蔽警告 / 不引入全局 CSP 先例），同时**锁定使用面**：

1. 渲染路径禁止把用户/导入的表达式字符串直接交给 JSXGraph 解析或求值（不启用 JessieCode 入口，不调用 `JXG.evaluate` 系列接口）。
2. 结构测试锁定：`apps/web/src` 生产代码不得出现 `JXG.evaluate` / `board.jc` 等 JessieCode 求值入口调用；B2 已锁定 graph 纯逻辑层不 import jsxgraph。
3. 升级 jsxgraph 时复查 eval 使用面（版本跟踪）。

## 理由

- eval 存在于**第三方包内部**，且仅在调用方传入 JessieCode 字符串时触发；本项目调用面为零，风险 = 静态审计噪音 + 未来误用面。
- 替换/升级 JSXGraph 的成本远大于当前风险（B7 adapter 隔离仍按计划推进，届时再评估隔离边界）。
- 屏蔽警告会掩盖未来真实变更（违反「不关 warning 假装解决」）。

## 后果

- `check-dependencies` / 结构测试持续拦截 JessieCode 求值入口（防误用回归）。
- D8 关闭为「已评估 + 使用面锁定」；B7（adapter 隔离）落地后可按需收窄 jsxgraph 依赖面。
