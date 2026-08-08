# Server, API, data, and AI

## Owning layers

- 通用 routes：`apps/server/src/routes/`；化学 routes：`routes/chemistry/`。
- 领域服务：`apps/server/src/services/` 与 `services/chemistry/`。
- DB migration：`apps/server/src/db/migrator.js`。
- Seed versioning：查看当前 `seed-versioning` 实现与同步脚本。
- Schema：`@xiaohuang/contracts`；错误：`@xiaohuang/domain-core`。

方向为 route → service → repository/DB。route 处理 HTTP 与 Schema，service 处理领域语义，DB/外部 SDK 不渗入 Web。

## 当前状态分层

### 已接线

- migration 具备 `PRAGMA user_version`、pre/postcondition、backup/restore 方向。
- settings policy 有 Server TS 产物合同；Electron stage 需要复制对应 `dist/domain`。
- API v2 规范响应为 `{success,data|error,requestId}`，settings 已有 v2 接入。

### 合同或基础设施已存在

- contracts Schema、稳定错误码、seed versioning、AI adapter 等基座可供新代码使用。

### 尚待完整迁移

- 不能假定全部 v1/v2 routes、DB/local config、AI 输出都已接入 Schema/稳定错误码。
- Server 仍有 JavaScript；typecheck 成功不表示所有旧 JS 获得严格类型覆盖。

审查时逐条追实际 import、调用方和测试，禁止把 package 存在当作生产接线完成。

## 数据安全

`apps/server/data/` 与 `apps/server/src/data/` 是用户数据。migration/seed 测试使用临时副本；失败恢复必须保留原数据，checksum/version mismatch 要明确拒绝，禁止 catch 后继续写。

## 外部边界

HTTP body/query/response、DB row、settings file、AI provider output 都先 parse/validate，再进入领域。v1/v2 应复用 service，不复制业务逻辑；新增失败使用稳定错误码并保留 requestId/cause。
