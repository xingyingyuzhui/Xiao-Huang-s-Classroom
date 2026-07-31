# Adding features — compliant paths

Use this as a checklist. Skip steps only when the task is explicitly partial.

## 0. Branch

Feature work lands on a **named branch**, not straight to `main` (after main is established). Merge when verified.

## A. New subject (or open an existing shell subject)

1. **`subjects/catalog.js`**
   - `SUBJECTS` entry: id, name, en, desc, blurb, modules, status, book colors, optional `classroomIntro`.
2. **Cover art** (if book shows)
   - Five theme images: `apps/web/public/assets/subject-covers/<stem>-cover-v{1-5}.png`
   - Register stem in `bookshelf/cover-urls.js` `COVER_ASSET_STEM`.
3. **Classroom runtime**
   - `subjects/classrooms/<id>-classroom.js`
   - Register in `classrooms/registry.js`.
4. **Feature package** (if content)
   - `apps/web/src/<subject>/...` with clear entry.
5. **Hub behavior**
   - Click still opens intro; enter only if product says ready.
6. **Floaters**
   - Subject motif in `bookshelf/floaters.js`.
7. **Tests**
   - Extend `subject-hub.test.cjs` / catalog assertions as needed.
8. **Server** only if subject needs API—prefer namespaced routes; keep `/api` prefixes.

## B. New chemistry lab / classroom panel

1. Prefer **config + model + shell + views** (see `ai-classroom/*` patterns: `lab-model` / `lab-shell` / `lab-views`).
2. Mount via chemistry classroom tabs / `panel-mount` / partials HTML—not a one-off route outside shell.
3. Data: `chemistry/data/*` or server seed + `routes/chemistry/*` if persisted.
4. Validate with existing schema utils when present (`lab-schema`, quiz schema, etc.).
5. Logic ≠ canvas/DOM rendering split.

## C. New math lab / board tool

1. Read **`apps/web/src/math/AGENTS.md` first**.
2. Lab folder under `math/<lab>/` with model + index; shared board helpers in `math/shared/`.
3. Theme via `math-theme.js`; lifecycle via `board-lifecycle.js`; listen `chem-theme-change`.
4. Expressions: **`packages/math-expr` only**.
5. Wire classroom entry/topics in `math/classroom/*` + math classroom shell.
6. Tests under `test/web/math-*.test.cjs` for contracts.

## D. New theme

1. CSS: `shared/styles/themes/<id>/{tokens,skin}.css` + catalog registration in `shared/theme/catalog.js`.
2. Hub background: `public/assets/hub-backgrounds/<id>.png` + `_subject-hub.css`.
3. Cover version slot: extend `THEME_COVER_VERSION` + ship four subject cover images.
4. Book feel/lights: `theme-feel.js` + env pack in `classroom-env.js`.
5. Math board tokens if math surfaces need them (`math-theme.js`).
6. Verify: switch theme in settings → hub bg + book repaint + classroom chrome.

## E. New API endpoint

1. Put chemistry domain under `apps/server/src/routes/chemistry/` (+ service if non-trivial).
2. Shared/settings/AI under existing `routes/settings.js` / `routes/ai*`.
3. Register in `index.js` router composition.
4. Response helpers: `utils/response.js` patterns.
5. Contract tests: `test/server/*` especially `server-api-contracts.test.cjs`.
6. Frontend: `shared/api/client.js` (or subject api helper)—no raw fetch scatter without reason.

## F. Shared package change

- `packages/subject-settings`: tab catalogs / settings shape—update `test/shared/subject-settings-contract.test.cjs`.
- `packages/math-expr`: keep pure; update expr tests; **no** copy-paste of parser into apps.

## G. Visual-only hub polish

1. Load `product-philosophy.md` + `hub-bookshelf.md`.
2. Change the **owning module** (slots/theme-feel/enter-fx/…)—avoid dumping magic numbers only in unrelated CSS.
3. Do not break dissolve enter/exit.
4. Run hub + structure tests; manually path enter/return/theme if possible.

## H. Engineering structure only

1. Extract pure modules; keep public exports stable.
2. Update string-based tests that pointed at old file.
3. No behavior change unless listed in the task.
4. Document map in package `AGENTS.md` when adding a folder of modules.

## Definition of done (features)

- [ ] Correct layer(s) only
- [ ] Theme event / subject catalog / registry still coherent
- [ ] No user-data or dist junk in commit
- [ ] Relevant tests green
- [ ] Hub cinema contracts intact if those files touched
- [ ] Branch → review → main (not drive-by main commits)
