# Electron and release evidence

## 运行时边界

- Main：`apps/desktop/main.cjs`；启动状态机读取实际 `apps/desktop` 实现。
- BrowserWindow 保持 `contextIsolation: true`、`nodeIntegration: false`，新增 IPC 必须走 allowlist/Schema。
- Electron 打包嵌入 Web 和 staged Server；不要把 dev 环境的仓库相对路径当最终 Resources 路径。

## 三层证据

### 1. Stage smoke

`npm run stage:electron` 验证 `.electron-stage` 的源布局、manifest 和 staged Server 可加载。它不能证明 electron-builder 最终复制正确。

### 2. Packaged app / Resources

`npm run verify:electron-package` 先执行 `electron-builder --dir`，再由 `test/release/electron-packaged.test.cjs` 检查 unpacked app 的真实 Resources 布局和可加载性。它证明本机 packaged app 结构，不证明安装器或跨平台目标机。

关键布局包括 staged `server/` 与 Server TS `dist/domain/`；以 `electron-builder.yml`、stage 脚本和真实产物共同确认，不能只看注释。

### 3. 平台发行物与目标机

- `npm run dist:mac` 生成 macOS DMG。
- `npm run dist:win` 生成 Windows NSIS。
- portable/等价性按 `docs/engineering/pkg-retirement-gate.md` 的 E1–E5 和当前发布计划验收。

只有实际平台发行物完成安装/启动、内置 Server、数据写入、退出恢复等目标机验收，才能声称对应平台“可发布”。macOS `--dir` 成功不能证明 Windows；无签名/公证/目标机证据时要明确未验证。

## 修改检查

- Main/Preload、IPC、安全选项：Desktop 测试与 allowlist。
- Server 产物：先 Server build，再 stage，再 packaged Resources。
- 布局路径：同时检查 stage manifest、`electron-builder.yml` extraResources 与最终包。
- 不提交 `.electron-stage/`、`dist-electron/`、`dist-exe/`。
