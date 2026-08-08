# 数据路径合同（D-data 收口）

> 三类运行形态的数据写位置与「历史路径只识别不写」说明（Program 5 D9）。

## 1. 三类数据位置（权威：`apps/server/src/paths.js`）

| 运行形态 | 数据目录 | 解析链 |
| --- | --- | --- |
| Web 开发（`npm run dev:server`） | `apps/server/data/` | `getWritableRoot()` → server 包根 → `getDataDir()` → `data/` |
| Electron 桌面端 | `<userData>/data/` | `main` 设 `CHEM_LAB_DATA_DIR`（userData 可写） |
| pkg 便携版（过渡产物） | exe 同目录 `data/` | `isPkg()` → `process.execPath` 目录 |

- 数据库文件：`<dataDir>/chem-lab.db`
- 只读资源（`init.sql`、内嵌 `public`）：`getSnapshotRoot()`（源码/asar 内），与数据分离
- 环境变量覆盖：`CHEM_LAB_DATA_DIR`（数据目录）、`CHEM_LAB_WRITABLE_ROOT`（可写根）、`CHEM_LAB_ELECTRON=1`

## 2. 历史路径：`apps/server/src/data/`（只识别，禁止新写入）

- 早期版本把数据库写在 `apps/server/src/data/`；该目录现存 `chem-lab.db` 属**用户数据**（git 未跟踪）。
- **代码不写入 `src/data/`**：`paths.js` 的数据解析只走 §1 三类位置；`src/seed/*` 与 `scripts/sync-*` 的数据源为 `apps/web/src/chemistry/data/`（web 模块数据），不依赖 `src/data/`。
- 遇到引用 `src/data/` 的代码一律视为历史路径：仅识别/读取已有用户数据，禁止新增写入或把新资源放该目录。
- 合同测试：`test/shared/data-paths-contract.test.cjs` 锁定 `paths.js` 无 `src/data` 写入路径。
