# 数学教室 Implementation Plan

> **状态：已 supersede（2026-07-31 晚）**  
> 产品方向改为**与化学同构的多 Tab 实验室 + 课堂**，不再实现「知识地图 → 全屏舞台」替换。  
> 权威设计见：`docs/superpowers/specs/2026-07-31-math-classroom-atlas-design.md` **§0 现行结构**。  
> 下文保留为历史计划；勾选任务不作为待办。

**原 Goal（已取消）：** 用「知识地图 → 全屏舞台 + 右下操作垫」替换现有数学五 Tab 教室。

**现行 Goal：**

- 课标命名的五 lab Tab + 课堂 Tab
- 左抽屉仅参数、舞台浮层卡片、range+number+气泡键盘
- 课堂讲解/测验/点名 + lab-bridge（P1）
- 工程清理：删除 atlas/engines/router/stage/lessons 死代码；共享进 `math/shared/`

**Architecture（现行）：**

```
subjects/classrooms/math-classroom.js  → createTabbedClassroom + lazy imports
math/{graph,plane,trig,sequence,solid}/  → index + model
math/classroom/                          → entry + topics + render-rich
math/shared/                             → tex, jsx-board, param-controls,
                                           float-cards, num-keypad, lab-bridge
packages/subject-settings                → MATH_TABS
server: routes/ai/lesson + quiz (subject-aware)
```

**Tech Stack:** Vite vanilla JS、JSXGraph、KaTeX、Three.js、主题 CSS 变量、Node test runner。

---

## 历史 File Structure（地图方案，已删除）

```
apps/web/src/math/atlas/     ❌ 已删
apps/web/src/math/stage/     ❌ 已删
apps/web/src/math/engines/   ❌ 已删（二次 helpers → graph/model.js）
apps/web/src/math/lessons/   ❌ 已删
apps/web/src/math/router.js  ❌ 已删
partials/math-atlas-stage…   ❌ 已删
```

## 现行 File Structure

```
apps/web/src/math/
  graph/ plane/ trig/ sequence/ solid/
  classroom/
  shared/{tex,jsx-board,param-controls,float-cards,num-keypad,lab-bridge}.js
  index.js
apps/web/src/subjects/classrooms/
  math-classroom.js
  partials/math-panels.partial.html
test/web/math-*.test.cjs
```

## Cleanup checklist（工程收口）

- [x] 删除未挂载 atlas / engines / lessons / stage / router / atlas partial
- [x] 二次纯函数并入 `graph/model.js`；测试改指 live 路径
- [x] 共享模块迁入 `math/shared/`
- [x] 设计文档 §0 标明多 Tab 为权威
- [x] 运行 `test/web/math-*.test.cjs` 与相关契约测试
