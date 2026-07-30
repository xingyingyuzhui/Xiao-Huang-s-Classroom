# 小黄的教室

本仓库由「小黄的化学实验室」整仓迁移而来，当前以化学为第一个学科模块运行。

后续任务（多学科切换壳、其它学科内容）在独立计划中展开。化学功能改动仍按原图层边界（browser / Express / Electron）处理。

**当前壳层：** 启动进入学科大厅；仅「化学」可进入现有实验室 Tab。顶栏学科标签与设置中的「学科大厅」可返回大厅。设计见 `docs/superpowers/specs/2026-07-29-subject-hub-design.md`。

Treat `server/data/` as user data. Treat `dist/`, `server/public/`, `.electron-stage/`, `dist-electron/`, `dist-exe/`, and dependency folders as generated or runtime paths unless the task explicitly targets them. Do not include them in source changes.

## Learned User Preferences

- Science hall should be full-bleed: no top subject TAB strip (keep only top-right settings); avoid leftover empty chrome where the tab bar was.
- Hub hero branding should read「小黄的教室」(not「科学」); do not put redundant corner brand/TAB chrome on the hall; hall background and brand typography must match each theme’s palette/style, personalized per theme, with no specular/glow highlights on the brand text.
- Clicking a subject book opens the simple intro page (not a direct classroom jump); classroom entry from the intro CTA uses a refined cover-dissolve transition with the book kept closed—do not also play 3D cover-open, page-flip, or dive; exit reverses the dissolve onto a closed book.
- Book covers must fully follow theme changes with carefully designed thematic elements (game-asset quality), not superficial text/color swaps; spines/side materials should match the cover art; modeling, collision, and brighter spotlight/specular feel matter; skip redundant OPEN badges.
- Hub bookshelf should stay close to the books reference: outward-fanning poses (not inward-top convergence) and similar book lighting; intro focus timing should match the reference (other books fully sink, then selected book rotates with ~0.1s lead and no long pause).
- Only chemistry is enterable for now; other subject books may be visible but not clickable.
- Prefer boutique visual fidelity for hub books, glass/liquid, and motion over early performance tuning; reject muddy/gray glass and prototype-looking UI.
- When a visual pass fails, research open-source references (GitHub repos/demos) before another thin iteration.
- Feature work after establishing main should land on branches rather than committing straight to main.
- Intro-page cursor floaters should be subject-specific (chemistry element symbols, math numerals, biology leaf-like, physics-themed)—not one shared leaf effect for all.
- Subject intro chrome: no center close X; secondary action labeled「返回大厅」; avoid generic「N 个模块」meta wording.

## Learned Workspace Facts

- Science-hall bookshelf UX is inspired by https://github.com/thebuggeddev/books (live demo https://books-sigma-ashen.vercel.app/); subjects map to distinct books; keep pose/lighting/intro-open choreography close to that reference.
- Theme cover art lives under `public/assets/subject-covers/` as five ordered sets (v1–v5) mapped to the five app themes.
- App shell starts at the subject hub; chemistry opens the existing laboratory tabs; hub design lives at `docs/superpowers/specs/2026-07-29-subject-hub-design.md`.
- Classroom enter/exit from the subject intro uses cover-dissolve (etch/particles sampled from cover art), not multi-page flip or stacked 3D cover-open.
- Chemistry lab work prioritizes a state-driven engine with chemistry logic separated from rendering; experiments should be configuration-driven rather than one-off page stacks.
