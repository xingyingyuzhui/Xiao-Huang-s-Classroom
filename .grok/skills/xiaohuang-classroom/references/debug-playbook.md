# Debug playbook

先复现、定位证据层，再改 owning layer。不要从表面症状直接改生成物或渲染对象。

| 症状 | 第一证据 | Owner |
| --- | --- | --- |
| Hub 空白、书不可点、主题封面错误 | console、runtime manifest、stage mode、theme event/asset URL | `hub-bookshelf.md`、`frontend-shell.md` |
| 进入/返回白屏或迟到页面 | transition id、opaque 回调、stale async mount、classroom state | `hub-bookshelf.md`、`frontend-shell.md` |
| 数学工具状态错、undo 错、卡顿 | GraphDocument/Store action、transaction、render plan、create/update/detach 计数 | `math-canvas.md` |
| Server 400/500、设置或 AI 异常 | requestId、Schema parse、route→service、DB/adapter cause | `server-data.md` |
| migration/seed 异常 | 临时 DB version、pre/postcondition、backup/restore、checksum | `server-data.md` |
| Electron dev 好、stage/包内坏 | 分别跑 stage、packaged Resources、平台发行物 | `desktop-release.md` |
| quality 偶发绿/红 | 当前脚本、Turbo cache、生成残留、workspace 输出、干净检出 | `engineering-quality.md` |

## 系统化步骤

1. 写出最小复现和期望/实际差异。
2. 判断失败发生在领域状态、controller、renderer、外部边界、构建还是最终产物。
3. 找到该层的唯一真值和最后一个成功边界；注入失败时保留 cause。
4. 先补能稳定复现的测试，再修 owner；不要用 delay、全量重建或 silent catch 掩盖竞态。
5. 运行最小回归，然后检查相邻生命周期、历史、主题、数据或发布路径。

## 常见假绿

- Turbo cache 命中不代表 fresh execution。
- `git diff --check` 不代表工作树干净。
- stage require 成功不代表 electron-builder Resources 正确。
- `electron-builder --dir` 成功不代表 DMG/NSIS/portable 在目标机可用。
- package 中存在 Schema/类型不代表应用已 import 并生产接线。
- 构建通过不代表交互、视觉或资源释放正确。
