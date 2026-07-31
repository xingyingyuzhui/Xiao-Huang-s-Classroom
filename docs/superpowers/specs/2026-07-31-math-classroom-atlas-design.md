# 小黄的教室 · 数学教室设计

**日期：** 2026-07-31  
**状态：** **现行实现以多 Tab 实验室为准**（见 §0）  
**历史：** 同日曾共识「知识地图 + 全屏舞台」方案 A；产品评审后改为与化学同构的课标命名多 Tab，地图/样板引擎路径已退役并从代码库清理。

---

## 0. 现行结构（权威）

### 0.1 信息架构

与化学教室同构：

```
数学教室（顶栏 showTabBar: true）
├── 函数画布   panel-math-graph
├── 直线与圆   panel-math-plane
├── 三角函数   panel-math-trig
├── 数列       panel-math-sequence
├── 立体几何   panel-math-solid
└── 课堂       panel-math-ai（讲解 / 测验 / 点名 + lab 桥）
```

- 元数据唯一源：`packages/subject-settings` → `MATH_TABS`
- 挂载：`apps/web/src/subjects/classrooms/math-classroom.js` + `partials/math-panels.partial.html`
- 懒加载：`createTabbedClassroom` + `feature-loader` 动态 `import` 各 lab 包

### 0.2 前端目录

```
apps/web/src/math/
  graph/ plane/ trig/ sequence/ solid/   # 各 Tab：index.js（UI）+ model.js（纯逻辑）
  classroom/                             # 课堂 Tab
  shared/                                # tex / jsx-board / param-controls /
                                         # float-cards / num-keypad / lab-bridge
  index.js                               # SUBJECT_ID
```

布局约定：

- 左栏 `side-drawer`：**仅参数**（滑条 + 数字输入 + 气泡数字键盘）
- 舞台：画板 / 3D + **浮层卡片**（公式 / 特征 / 表，可折叠，对标分子 `mol-info`）
- 不设「探究任务」链（任务壳已移除）

### 0.3 服务端

- 无独立 `routes/math/`（数学无专属持久化域时不必造空命名空间）
- 共享 AI：`routes/ai/lesson.js`、`services/ai/lesson-service.js`；quiz 经 `subjectId` + 可选 `labContext`
- HTTP 前缀仍为 `/api/ai/...`

### 0.4 明确不在现行范围

| 已退役 | 说明 |
| --- | --- |
| 知识地图默认入口 | `math/atlas/*`、`math-atlas-stage.partial` 已删除 |
| 课型 engines 双轨 | `math/engines/*` 已删除；二次纯函数并入 `graph/model.js` |
| 地图 router / stage 壳 | `router.js`、`stage/*`、`lessons/*` 已删除 |
| 随机/骰子样板 Tab | 无对应顶栏 Tab；逻辑未进 live 路径 |

### 0.5 历史决策摘要（地图方案，仅供对照）

曾选定：横切四课型样板 + 全量课标地图；顶栏不注册多功能 Tab；舞台满屏 + 右下操作垫。  
**已被「化学同构多 Tab + 课标命名 + 课堂 Tab」替代，下列 §1 起为归档原文。**

---

## 1. 目标与非目标（归档：地图 v1）

### 目标

1. 以教育部《普通高中数学课程标准（2017 年版 2020 年修订）》知识逻辑为目录，呈现完整高中数学知识地图。
2. 交互气质对齐化学实验室：舞台几乎满屏、公式/读数可收起、右下角操作垫。
3. 先落地 4 种可复用课型引擎（图象 / 空间 / 随机 / 数列），再以剧本配置扩章节。
4. 给用户足够的直接操作空间：优先拖点、捏手柄、截面、投掷、生长动画。

### 非目标（地图 v1）

- 刷题、试卷、错题本、高考评分
- AI 自动讲题
- 一次做完全部 22 板块的深度互动
- 保留现有「解析几何 / 函数 / 三角 / 数列 / 立体」五 Tab 框架 ← **现行实现已恢复并强化该框架**

---

## 2. 已定决策（归档）

| 议题 | 地图 v1 选择 | 现行 |
| --- | --- | --- |
| 交付策略 | 横切四课型 + 全量地图 | 五 lab Tab + 课堂 |
| 信息架构 | 方案 A：地图默认入口 | 方案：化学同构多 Tab |
| 顶栏 Tab | showTabBar: false | showTabBar: true + MATH_TABS |
| 旧代码 | 五面板整页替换 | 五面板为主线，清理地图残骸 |

---

## 3～6. 地图壳层 / 课型 / 目录表

> 地图 UI、操作垫 3×3、22 板块元数据表等细节见 git 历史中本文件的早期版本与  
> `docs/superpowers/plans/2026-07-31-math-classroom-atlas.md`（计划同样标注为已 supersede）。  
> **实现与测试请以 §0 与代码为准。**

### 现行验收要点（替代地图验收）

- [x] 顶栏六 Tab 课标命名，无「二次一族 / 知识地图」文案
- [x] 各 lab：左参数栏 + 舞台 + 浮层卡；数字输入与气泡键盘
- [x] 课堂：讲解 / 测验 / 点名；P1 lab-bridge 快照与示范动作
- [x] 无 atlas/engines/router 生产引用；共享模块在 `math/shared/`
- [x] 测试：`test/web/math-*.test.cjs` 指向 live model / shared 路径
