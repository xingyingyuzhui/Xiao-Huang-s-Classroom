# 切线锚点跟随函数顶点

**日期：** 2026-08-02  
**状态：** 已共识，待实现  
**范围：** 函数画布切线工具 + 跟随目标

## 问题

切线锚在顶点附近时，实际绑定的是「曲线上某固定 x」的跟随点。改参数后面顶点移动，切线不追顶点。

## 目标

- **仅切线工具**：创建时若落点靠近该函数当前「顶点」，锚点绑定特征跟随 `graph:fn:{id}:feature:vertex`。
- 改系数 / rebuild 后锚点 snap 到新顶点，切线随之更新。
- 用户拖离特征容差后，降级为该函数的普通曲线跟随。

## 非目标

- 普通加点 / 线段 / 垂线不自动绑特征。
- 暂不绑零点、截距等其它特征。

## 设计

1. `follow-target.js` 增加 `makeFeaturePointTarget`（`kind: 'feature'`，`el: null`，`snap`/`distance` 读当前特征坐标）。
2. `listFollowTargets` 为每条有顶点的可见函数注册特征目标。
3. `user-points`：`kind === 'feature'` 时创建自由点（非 glider）；restore/create 时按 follow id snap。
4. 切线工具：解析到 `fn` 后，若点击/锚点距顶点 ≤ follow/snap 容差，则 `followTargetId` 用特征 id，否则用曲线 id。
5. `resolveTangentAnchor` 识别 `…:feature:vertex` 并解析回 `fn`。
6. 锚点 `up`/snap 后若距顶点超出容差，将 `followTargetId` 改为对应曲线 id。

## 测试

- `makeFeaturePointTarget` snap/distance
- 切线路径选择特征 follow id 的纯逻辑（或结构断言 + 辅助函数）
- resolveTangentAnchor 识别 feature id
- math 全量相关测试保持绿
