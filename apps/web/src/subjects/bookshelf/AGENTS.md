# Bookshelf（学科大厅书场）

Three.js 书架舞台：点书进简介、溶解进教室、归架返回。视觉参考 [thebuggeddev/books](https://github.com/thebuggeddev/books)。

## 模块边界

| 文件 | 职责 |
|------|------|
| `stage.js` | **编排**：WebGL 场景、灯光、输入、状态机、公开 API（`createBookshelfStage`） |
| `spring.js` | 弹簧与 `clamp` |
| `cover-urls.js` | 主题封面路径（`THEME_COVER_VERSION` / `coverUrlForTheme`） |
| `theme-feel.js` | 主题材质手感 + 灯光表 + `applyBookFeel` / `snapshotFeelBase` |
| `classroom-env.js` | equirect 教室环境 → PMREM |
| `book-geometry.js` | 书本尺寸常量、圆角封面/微弧书脊几何 |
| `book-textures.js` | 共享程序纹理（层理、布纹、环衬、印刷瑕疵） |
| `build-book.js` | 单本书 mesh / 材质 / 溶解 / `repaint` |
| `slots.js` | hero / detail 槽位布局 |
| `motion.js` | 进出架 Y 轴关键帧、`setTargets` |
| `covers.js` | 2D 封面/封底/书脊绘制（已独立） |
| `dissolve.js` | 材质溶解 uniforms |
| `enter-fx.js` | DOM 帷幕 + 封面碎屑转场 |
| `floaters.js` | 简介页学科漂浮物 |
| `transition-*.js` | 转场状态机（可选编排，与 enter-fx 协作） |

## 公开契约

- **入口**：`createBookshelfStage(opts)` from `stage.js`（hub 唯一调用点）
- **返回**：`{ show, hide, dispose, relayout, syncTheme, playReturnFromLab, transitionId }`
- **主题**：监听 `chem-theme-change`；封面图在 `public/assets/subject-covers/*-cover-v{1-5}.png`
- **HTTP / monorepo 契约不变**；本包仅前端 `apps/web`

## 改动原则

1. **行为优先**：拆文件不改 pose / timing / dissolve 语义，除非任务明确要求。
2. **纯逻辑进模块**：无 DOM/场景副作用的表与几何放独立文件；`stage.js` 只接线。
3. **build-book 依赖注入**：共享 geo/tex/灯光上下文由 stage 创建后传入，避免循环 import。
4. **测试**：`test/web/subject-hub.test.cjs` + `bookshelf-structure.test.cjs` 守契约与目录结构。
