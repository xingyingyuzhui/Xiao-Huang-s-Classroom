# 账户与云同步威胁模型（STRIDE）

> Owner: Task 1 · 审查: Agent J（每个 milestone）

## 1. 资产

- 教师账户凭据（password、refresh token、device session）
- 班级 / workspace 业务数据（14 类 sync resource）
- AI Provider Key（cloudSecret）
- PostgreSQL 备份与 KEK
- Electron 更新 feed 与签名包

## 2. STRIDE 分析

### Spoofing（伪装）

| 威胁 | 缓解 |
|------|------|
| 伪造 cloud API / 钓鱼登录页 | 固定 `/api/cloud/v1`；Electron Main 独占 cloud origin allowlist；`redirect:'error'` |
| 公共电脑残留 refresh cookie | Web 单 HttpOnly 会话；切换账户需重新认证 |
| 设备 ID 伪造 | 服务端签发 device session；refresh 存 hash |

### Tampering（篡改）

| 威胁 | 缓解 |
|------|------|
| 离线 outbox 重放 / 乱序 | `operationId` 幂等；服务端 change sequence |
| 同步覆盖（last-write-wins） | `baseRevision` 冲突 → `SYNC_CONFLICT`；用户选择 |
| 恶意 import chunk | manifestHash + chunk contentHash 校验 |
| 迁移中间态删源 | 迁移 postcondition 成功才删旧 key |

### Repudiation（抵赖）

| 威胁 | 缓解 |
|------|------|
| 否认删除班级/Key 变更 | audit 表（无 secret body）；requestId 贯穿 |

### Information disclosure（信息泄露）

| 威胁 | 缓解 |
|------|------|
| IDOR 跨账户/班级/学科 | 所有查询带 `account_id`；PG RLS |
| refresh / AI Key 进 localStorage | 禁止；合同测试 + 客户端扫描 |
| 日志打印 password/token | JSON 日志脱敏 middleware |
| 备份与 KEK 同位置 | KEK 离线包裹；分位置存储 |

### Denial of service（拒绝服务）

| 威胁 | 缓解 |
|------|------|
| 登录暴力 | IP + identity 限流；统一错误文案 |
| body bomb / 超大 sync batch | body limit；拆批 |
| 同步冲突风暴 | 手动同步；有界退避 |

### Elevation of privilege（权限提升）

| 威胁 | 缓解 |
|------|------|
| refresh reuse 未检测 | rotation + family 撤销 |
| pending-deletion 账户访问班级 | 限权 `account:restore` 会话 |
| renderer 调 IPC 读 vault | preload allowlist；无 getRefreshToken |
| 直接暴露 `apps/server` 公网 | **否决**；仅 cloud-server |

## 3. 场景专项

| 场景 | 风险 | 控制 |
|------|------|------|
| 公共电脑多账户 | 串用上一账户缓存 | WorkspaceContext generation；切换清 cache |
| 离线重放 | 旧设备复活已删资源 | tombstone 参与 pull |
| AI Key 泄漏 | 导出/IndexedDB/抓包 | 仅 cloud 代理；metadata only |
| 备份泄漏 | pg_dump 含 ciphertext | KEK 不在备份同路径 |
| 更新劫持 | 非签名 feed | HTTPS + checksum + 签名（Win 发布） |

## 4. 测试阶段约束

- 无域名/HTTPS：**禁止**公网 HTTP 真实密码/refresh/AI Key 测试  
- 真实认证仅 **SSH tunnel** 或 staging HTTPS  
- 公开注册默认 **closed**
