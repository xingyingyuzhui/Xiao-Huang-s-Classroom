# Debug playbook — symptoms → places

Work **symptom-first**. Confirm layer before large rewrites.

## Hub: blank canvas / no books

| Check | Where |
|-------|--------|
| WebGL init throw | `stage.js` renderer try/catch |
| `buildBook` throw | console + `build-book.js`; subjects empty? |
| Books off-screen | entrance springs / `slots.js` / `setTargets` never called |
| Root scale/pos | `computeSlots` bookRoot |
| Env/PMREM crash | `classroom-env.js` — should warn and continue |
| Running/raf | `running`, `animate`, `show()` |

Also: CSS covering canvas; hub not mounted (`hub.js`).

## Hub: books present but “dead” click

- Mode stuck not `hero` (`state.mode`, body classes).
- Hit meshes / raycast (`hitMeshes`, `castRay`).
- Pointer capture / second finger (`ptr.id`).
- `status` / enter button only affects classroom CTA, not open-detail.

## Theme: UI theme changes, books don’t

1. Is `chem-theme-change` fired? (`shared/theme/apply.js`, settings save path).
2. Is stage listening? `syncTheme` on window.
3. `repaint` / `applyCoverMap` gen race — stale image onload.
4. Cache: URL must include theme query bust.
5. Wrong mapping: `cover-urls.js` version table.
6. Settings API 500 → theme never persisted/reloaded (`routes/settings.js`, server up?).

## Theme: hub background wrong

- `_subject-hub.css` + `hub-backgrounds/<id>.png` exist?
- `data-theme` on `<html>`?
- Canvas opaque clear color killing transparency? must stay alpha 0.

## Enter classroom: white flash / empty lab

- Shell switched **before** veil opaque → fix `onOpaque` ordering, not random delays only.
- `transitionSeq` stale callbacks.
- Classroom registry missing subject.
- Feature loader / partial HTML mount failure (`panel-mount`, partials).

## Enter: book opens / flips when it shouldn’t

- Cover springs forced non-zero during `entering` — `tickBook` should force closed for enter/return.
- Accidental reintroduction of dive/open timeline—remove; dissolve-only product rule.

## Return hub: never shows / stuck veil

- `onRevealHub` shadowed (must be factory-level const).
- `playExit` `onOpaque` / `onSettled` not firing — fallback timer in `playReturnFromLab`.
- `running` false so animate stopped — return path should restart raf.
- Hub shell hidden by app shell state (`session` / shell).

## Return: books wrong places

- Other books not pre-sunk with `CLEAR` (`motion.js` constant + return setup).
- `beginCloseToShelf` / `bringBack` delays.
- `computeSlots` before positioning.

## Covers missing / procedural only

- Asset 404 under `public/assets/subject-covers/`.
- Stem mismatch (`mathematics` vs `math` id).
- CORS/image onerror path leaves procedural—check console warns.
- Extrude material group order wrong → lids not showing map (groups 0/1/2 in build-book).

## Settings save 500

- Server process down / wrong port.
- SQLite lock (`chem-lab.db.lock`) — another process.
- Validation error in settings route/body.
- Desktop vs web API base URL mismatch.

## Math board wrong theme / grid junk

- Read `math/AGENTS.md`.
- `math-theme.js` + `chem-theme-change`.
- Forbidden: using border-soft as grid substitute.

## API / data wrong in classroom

- Hit correct `routes/chemistry/*`?
- Seed not imported?
- Frontend client base URL / Electron static vs API split.

## Performance jank (hub)

- Prefer fixing infinite throws / thrashing repaint first.
- Don’t “optimize away” shadows/aniso first if owner asked for fidelity—unless unusable FPS.

## Regression checklist after hub fixes

1. Load hub — books visible, fan pose OK  
2. Open intro — others sink, selected orbits in  
3. Theme switch — covers + bg + lights  
4. Enter ready subject — dissolve, no empty flash  
5. Return — veil, hub reveal, shelf restore  
6. `node --test test/web/subject-hub.test.cjs test/web/bookshelf-structure.test.cjs` (+ transition tests if touched)
