# Chemistry features

用于化学课堂、实验、AI classroom 和 chemistry Server 接线。

## 模块地图

- Web features：`apps/web/src/chemistry/{periodic-table,molecule,molar,electron,battle,ai-classroom,chem,shared}/`。
- Classroom 装配：`apps/web/src/subjects/classrooms/`。
- Server routes：`apps/server/src/routes/chemistry/`。
- Server services：`apps/server/src/services/chemistry/`。
- 兼容 HTTP prefix 保持 `/api/...`；新增 v2 边界遵守 `server-data.md`。

## 核心不变量

- 化学状态是唯一真实数据源；视觉只消费状态/事件，不决定或回写化学结果。
- 实验优先配置驱动，不建立一页一个互不兼容的状态栈。
- 守恒、速率、温度、体积、事件等领域语义放纯逻辑层，可固定步长、可复现、可单测。
- 粒子、玻璃、液体、Three.js/WebGL runtime、音效和动效属于 presentation；只持有可释放的运行时资源。
- AI 输出属于不可信外部边界，先 Schema 校验和错误归一化，再进入 UI/领域。

## 生命周期与主题

feature 若注册 listener、timer、RAF、observer、worker、WebGL resource，必须由 controller 对称释放；show/hide 不等于 dispose。颜色、玻璃与材质要遵守五主题语义 token 与精品视觉红线。

## 验证

- 化学结果、守恒、迁移：纯单元测试，禁止依赖画面。
- controller：fake DOM/storage/clock/timer/RAF/fetch。
- Server/DB：临时数据目录或 fake DB，不碰 `apps/server/data`。
- 视觉：按 `product-philosophy.md`；用户排除浏览器时明确仅完成结构/逻辑验证。
