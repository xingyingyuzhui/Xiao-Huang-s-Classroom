# Public HTTP routes (nginx)

Public web data plane is **only** `apps/cloud-server`. Lab Express (`apps/server` on `:3001`) stays for Electron / `127.0.0.1` and must not be reachable from the public edge.

Authority: `deploy/nginx/xiaohuang.conf`. Contract: `test/deploy/public-api-allowlist.test.cjs` (also loaded from `test/shared`).

| Path                                                                                     | Public                                                    | Upstream                                |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------- | --------------------------------------- |
| `/api/cloud/`                                                                            | yes                                                       | `127.0.0.1:3000` (cloud-server)         |
| `/livez`                                                                                 | yes                                                       | cloud-server liveness                   |
| `/readyz`                                                                                | **loopback only** (`allow 127.0.0.1` / `::1`; `deny all`) | cloud-server readiness (schema version) |
| `/api/settings`, `/api/students`, `/api/ai`, `/api/mastery`, `/api/labs`, other `/api/*` | **404**                                                   | must not proxy to lab `:3001`           |
| `/`                                                                                      | SPA `try_files`                                           | static web                              |

When `accountCloudProgram` is on, the web client must not require anonymous lab `/api/settings`; theme and unmigrated subject settings persist on-device (`xh-theme-id` / `xh-local-settings`) with hint「此数据当前仅保存在本机」.
