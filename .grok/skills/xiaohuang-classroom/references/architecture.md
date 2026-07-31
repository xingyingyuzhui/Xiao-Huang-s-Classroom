# Architecture — 小黄的教室

## Product shape

App is a **multi-subject classroom shell**:

```
Boot → Subject Hub (bookshelf hall)
         │ click book
         ▼
      Subject intro (detail card + 3D focus)
         │ CTA「进入教室」(ready subjects)
         ▼
      Cover dissolve (closed book) → Classroom shell
         │ tabs / feature panels
         ▼
      Return → reverse dissolve → hub shelf
```

Historical name:「小黄的化学实验室」migrated whole-repo; chemistry was first full subject. Math has multi-lab classroom. Physics/biology may open classroom **homes** with content still filling in—check `subjects/catalog.js` + `classrooms/*` for current `status` / intro.

## Monorepo layers

| Layer | Path | Role |
|-------|------|------|
| Web UI | `apps/web` | Vite SPA: hub, classrooms, features, themes |
| API | `apps/server` | Express + SQLite; chemistry domain + AI + settings |
| Desktop | `apps/desktop` | Electron shell over staged server/web |
| Packages | `packages/*` | Shared pure contracts (`subject-settings`, `math-expr`) |
| Tests | `test/{web,server,shared}` | Node test runner; `test/helpers/repo-root.js` |
| Specs | `docs/superpowers/specs/` | Design docs for hub, transitions, math atlas |

**Install**: always `npm install` at **repo root**. Do not maintain `apps/server/package-lock.json`.

## Frontend layering (inside `apps/web/src`)

```
main.js
  └─ app/shell.js          # app chrome, route between hub / classroom
       ├─ subjects/hub.js  # mounts bookshelf stage + detail UI
       ├─ subjects/catalog.js
       ├─ subjects/session.js / chrome.js
       └─ subjects/classrooms/*
            ├─ registry.js           # subjectId → classroom factory
            ├─ chemistry-classroom.js
            ├─ math-classroom.js
            ├─ *-classroom.js        # physics/biology homes
            ├─ tabbed-classroom.js / panel-mount.js
            └─ partials/*.html       # panel DOM shells

features (domain packages):
  chemistry/{periodic-table,molecule,molar,electron,battle,ai-classroom,chem,shared,data}/
  math/{graph,plane,trig,sequence,solid,classroom,shared}/
  biology/, physics/                 # placeholders / thin entries

cross-cutting:
  shared/{api,theme,ui,styles}/
  app/{feature-loader,panel-loading}.js
```

### Ownership rules

| Change type | Own here | Do not scatter into |
|-------------|----------|---------------------|
| Hall UX / 3D books | `subjects/bookshelf/*`, hub CSS | chemistry feature packs |
| Classroom chrome/tabs | `subjects/classrooms/*` | random feature index |
| Chem experiment logic | `chemistry/<feature>/` (+ server if persisted) | hub stage |
| Math board contract | `math/shared/*`, `math/AGENTS.md` | copying expr whitelist |
| Theme tokens/skins | `shared/styles/themes/` + `theme/` | hardcoding one theme in mesh code only |
| Settings persistence | server `routes/settings` + `packages/subject-settings` | ad-hoc localStorage-only for cross-device prefs if product uses API |

## Backend layering (`apps/server/src`)

```
index.js
  routes/
    settings.js              # shared
    ai.js + ai/*             # shared AI + subject-specific
    chemistry/*              # domain HTTP
  services/
    ai/*
    chemistry/*
  db/  seed/  utils/
```

- **HTTP prefixes stay `/api/...`** for compatibility (even after chemistry folder namespace).
- SQLite paths: treat `apps/server/data/` and `apps/server/src/data/` as **user data**—not source to rewrite casually.
- Seed/import scripts under `seed/` and `scripts/` at app/repo level.

## Desktop

- `apps/desktop` packages Electron; staging scripts at repo `scripts/stage-electron-server.js`.
- Generated: `.electron-stage/`, `dist-electron/`, `dist-exe/` — not hand-edit targets.

## Theme system

Five themes: `default` · `stationery` · `reagent` · `blackboard` · `pixel`.

| Surface | Location |
|---------|----------|
| CSS tokens/skins | `apps/web/src/shared/styles/themes/<id>/` |
| Apply + event | `shared/theme/apply.js` → document `data-theme`; event **`chem-theme-change`** (name historical) |
| Hub classroom backgrounds | `apps/web/public/assets/hub-backgrounds/<id>.png` + `_subject-hub.css` |
| Subject cover art packs | `public/assets/subject-covers/*-cover-v{1-5}.png` via `bookshelf/cover-urls.js` |
| Book PBR feel / lights | `bookshelf/theme-feel.js` + `classroom-env.js` |
| Math board theme | `math/shared/math-theme.js` (see math AGENTS) |

Hub canvas is **transparent** so CSS hub backgrounds show through (`setClearColor` alpha 0).

## Data / control flow (hub enter classroom)

1. User opens book → `stage.open` → detail mode + panel copy from catalog.
2. Enter CTA → `enterFromDetail` → closed covers → `enterFx.playEnter` with dissolve.
3. **`onOpaque`** → `onEnterSubject(id)` → shell shows classroom (never switch shell while transparent).
4. Return → `playReturnFromLab` → exit FX → **`onRevealHub` only after opaque** → shelf close choreography.

Session/transition helpers: `transition-controller.js`, `transition-machine.js` (tests under `test/web/subject-transition-*.test.cjs`).

## Public contracts agents must preserve

| Contract | Stable surface |
|----------|----------------|
| Hub stage factory | `createBookshelfStage` in `bookshelf/stage.js` |
| Stage return API | `show, hide, dispose, relayout, syncTheme, playReturnFromLab, transitionId` |
| Cover URL map | `coverUrlForTheme` / `THEME_COVER_VERSION` in `cover-urls.js` |
| Subject list | `SUBJECTS` / `getSubject` in `catalog.js` |
| Classroom registry | `classrooms/registry.js` |
| Settings package | `@xiaohuang/subject-settings` (or workspace name in package.json) |
| Math expressions | `@xiaohuang/math-expr` — do not fork whitelist into random files |
| Theme event | `chem-theme-change` on `window` |

## Generated / forbidden as “source”

Do not treat as primary edit targets unless task says so:

- `apps/web/dist/`, `apps/server/public/` (often copied build)
- `node_modules/`, lockfiles except root `package-lock.json` intentionally
- `apps/server/data/*.db`, `apps/server/src/data/*.db`
- `.electron-stage/`, `dist-electron/`, `dist-exe/`

## Specs to open before redesign

- Hub: `docs/superpowers/specs/2026-07-29-subject-hub-design.md`
- Cinematic transition: `2026-07-30-cinematic-subject-transition-design.md`
- Math classroom atlas: `2026-07-31-math-classroom-atlas-design.md`
