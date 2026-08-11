# 同步资源登记表（14 类）

> 未登记资源 **不得上传**。Wave 启用前 feature flag 独立控制。

| resourceType | Wave | Schema 来源 | Scope | 冲突策略 | Tombstone | 当前 owner |
|--------------|------|-------------|-------|----------|-----------|------------|
| **teacher-settings** | 1 | `@xiaohuang/contracts` settings（非 AI） | account | field merge（有限） | 否 | `subject-settings` / settings route |
| **class-settings** | 1 | contracts class settings | classSubjectWorkspace | keepLocal / keepCloud | 是 | 新建 class adapter |
| **student-roster** | 1 | displayName, order, enabled | classSubjectWorkspace | keepLocal / keepCloud | 是 | `students.ts` / `studentApi` |
| **rollcall-records** | 2 | 记录实体 | classSubjectWorkspace | duplicateLocal | 是 | chemistry rollcall |
| **teaching-progress** | 2 | 进度快照 | classSubjectWorkspace | duplicateLocal | 是 | lab/balance progress |
| **mastery-wrong-book** | 2 | quiz wrong book | classSubjectWorkspace | duplicateLocal | 是 | `quiz_wrong_book` |
| **chem-custom-labs** | 3 | lab_experiments JSON | classSubjectWorkspace | duplicateLocal | 是 | `labsApi` |
| **chem-custom-molecules** | 3 | molecules | classSubjectWorkspace | duplicateLocal | 是 | `moleculeApi` |
| **chem-custom-reactions** | 3 | chem_reactions | classSubjectWorkspace | duplicateLocal | 是 | `reactionApi` |
| **math-problems** | 3 | 题目 bank | classSubjectWorkspace | duplicateLocal | 是 | math classroom（待建） |
| **physics-sim-config** | 3 | 仿真配置 | classSubjectWorkspace | duplicateLocal | 是 | 预留 |
| **math-graph-document** | 4 | `GraphDocumentV2` | classSubjectWorkspace / personal | duplicateLocal | 是 | `graph-persistence.js` |
| **ai-conversation-history** | 4 | 分页消息（无 key） | classSubjectWorkspace | duplicateLocal | 是 | AI routes |
| **classroom-drafts** | 4 | 草稿 blob | classSubjectWorkspace | duplicateLocal | 是 | board notes 等 |

## 每类必填字段（adapter 合同）

- `resourceType` / `resourceId` / `schemaVersion`
- `maxPayloadBytes`
- `export()` / `import()` / `migrateFromLegacy()`
- `conflictStrategies[]`
- `supportsTombstone: boolean`
- `localOnlyUntilMigrated: boolean`

## Class copy 矩阵（默认）

| 资源 | 默认复制 | 备注 |
|------|----------|------|
| student-roster | 是 | |
| class-settings | 是 | |
| rollcall-records | 否 | |
| ai-conversation-history | 否 | |
| teaching-progress | 可选 | 文档化默认否 |

## Wave 启用顺序

Wave 1 → 2 → 3 → 4；每 wave 更新「未隔离功能清单」；`accountCloudProgram` 总 flag 仅在清单归零后由 Supervisor 开启。
