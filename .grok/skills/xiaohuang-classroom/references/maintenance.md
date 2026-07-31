# Maintenance & engineering practice

## Git / branches

- **Feature and structure work**: branch off `main` (e.g. `refactor/...`, `feat/...`).
- Merge to `main` after verify; push when user wants remote updated.
- Delete local feature branches after merge if user doesn’t need them.
- No force-push to `main`. No commit secrets or user DB files.

## What belongs in commits

| Include | Exclude |
|---------|---------|
| Source under `apps/*/src`, `packages/*`, `test/*`, `docs/*` | `node_modules/` |
| Root lockfile when deps change intentionally | `apps/web/dist/`, copied `apps/server/public/` assets from build (unless task is release packaging) |
| `public/` **source** assets (covers, hub-backgrounds) | `*.db`, `*.db.lock` user data |
| `.grok/skills/` project skills | `.electron-stage/`, `dist-electron/`, `dist-exe/` |

## Install & run (typical)

- Root: `npm install`
- Web dev / server: root package scripts (`npm run dev`, `dev:server`, workspace `-w`—read root `package.json`).
- Tests: `node --test test/web/...` or broader globs; helper root via `test/helpers/repo-root.js` (exports **path string**, not a function).

## Tests map

| Area | Location |
|------|----------|
| Hub / bookshelf | `test/web/subject-hub.test.cjs`, `bookshelf-structure.test.cjs` |
| Transitions | `test/web/subject-transition-*.test.cjs` |
| Math contracts | `test/web/math-*.test.cjs` |
| Chem features | `test/web/*` + server chemistry tests |
| API / DB | `test/server/*` |
| Packages / boundaries | `test/shared/*` |

Prefer **contract/structure tests** for hub cinema and module maps—they catch silent breakages from refactors.

## Refactor policy

1. **Behavior-preserving** by default (especially hub timing/pose/dissolve).
2. Extract pure modules; keep orchestrators thin; update package `AGENTS.md`.
3. Public exports (`createBookshelfStage`, packages APIs) stay stable or all call sites + tests update in same change.
4. Don’t rename `chem-theme-change` casually—historical, widely listened.
5. Chemistry server folder moves already namespaced; don’t break `/api` paths.

## Thick-file heuristic

If a UI/WebGL file exceeds ~1.5–2k lines and mixes tables + geometry + input + FX:

- Split pure data/math/geo first.
- Then factories with injected context.
- Leave mode SM + input loop in orchestrator.
- Add structure tests so the split can’t silently re-inflate without notice.

## Docs

- Living agent prefs: root `AGENTS.md` (short, operational).
- Design intent: `docs/superpowers/specs/`.
- Package maps: `**/AGENTS.md` under math, bookshelf.
- This skill (`.grok/skills/xiaohuang-classroom/`) for full OS—**update skill references when architecture or owner rules change**.

## When to update this skill

- New subject pipeline steps
- New hard product red lines from the owner
- Bookshelf module map changes
- Theme count / asset layout changes
- Major monorepo boundary moves

## Agent hygiene

- Don’t edit dist as source of truth.
- Don’t add nested lockfiles under apps.
- Don’t commit “just in case” debug overlays into hub.
- Ask before destructive git or production publish.
- Chinese product UI copy; code/comments may be CN/EN mix as existing files do—match local file style.
