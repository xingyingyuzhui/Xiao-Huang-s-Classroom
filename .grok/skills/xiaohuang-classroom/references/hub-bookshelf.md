# Hub bookshelf — map & change guide

Package: `apps/web/src/subjects/bookshelf/`  
Also read: package `AGENTS.md`, specs `2026-07-29-subject-hub-design.md`, `2026-07-30-cinematic-subject-transition-design.md`.

## Public API

```js
// subjects/hub.js
import { createBookshelfStage } from './bookshelf/stage.js';

const stage = createBookshelfStage({
  canvas, closeBtn, detail, enterBtn, peekBtn, lockNote, pageFxRoot,
  subjects, onEnterSubject, onRevealHub,
});
// stage: show, hide, dispose, relayout, syncTheme, playReturnFromLab, transitionId
```

Do **not** re-export a second stage entry that hub forgets to use.

## Module map (post structure split)

| File | Responsibility |
|------|----------------|
| `stage.js` | Orchestrator: renderer, lights, input, mode SM, tick, public API |
| `spring.js` | `Spring`, `clamp` |
| `cover-urls.js` | `THEME_COVER_VERSION`, `coverUrlForTheme` |
| `theme-feel.js` | `THEME_BOOK_FEEL`, apply feel / lights snapshot helpers |
| `classroom-env.js` | Equirect classroom → PMREM |
| `book-geometry.js` | Dimensions, rounded cover, micro-arc spine geos |
| `book-textures.js` | Shared procedural textures + `mkCanvas` / print wear |
| `build-book.js` | Per-book meshes, materials, dissolve attach, `repaint` |
| `slots.js` | Hero fan + detail pose layout |
| `motion.js` | Y keyframes out/back, `setTargets`, `CLEAR`/`LIFT` |
| `covers.js` | 2D painters + `themeBookBoards` / transition palette |
| `dissolve.js` | Material dissolve uniforms |
| `enter-fx.js` | DOM veil + cover particle enter/exit |
| `floaters.js` | Detail-view subject motifs |
| `transition-controller.js` / `transition-machine.js` | Higher-level transition sequencing |

`stage.js` should stay an **orchestrator** (~1.5k lines max target). Fat tables/geometry belong in modules. Structure tests: `test/web/bookshelf-structure.test.cjs`.

## Modes (state.mode)

`hero` → `opening` → `detail` → `entering` → (classroom) → `returning` → `closing` → `hero`

Related body classes: `transit`, `detail-open`, `bookshelf-entering`, `bookshelf-dive-deep` (dive path largely retired for enter; don’t revive without product ask).

## Where to change what

| Want | Edit |
|------|------|
| Hero fan / detail pose numbers | `slots.js` (detail landscape currently near-front, slight ry open) |
| Exit sink / rise curves | `motion.js` (`LIFT`, `CLEAR`, easings) |
| Cover micro-open angle in detail | `stage.js` `tickBook` `coverBase` |
| Theme material/light | `theme-feel.js` (+ env packs in `classroom-env.js`) |
| Cover file mapping | `cover-urls.js` + assets under `public/assets/subject-covers/` |
| Procedural cover/spine paint | `covers.js` |
| Enter/exit veil & particles | `enter-fx.js` (+ palette from covers) |
| Floaters | `floaters.js` |
| Book mesh topology | `book-geometry.js` / `build-book.js` |
| Hub wiring / panel DOM | `subjects/hub.js` + HTML hooks + `_subject-hub.css` |
| Hub photo backgrounds | `public/assets/hub-backgrounds/` + CSS |

## Theme repaint path

1. Settings/theme apply sets `data-theme` + dispatches `chem-theme-change`.
2. `stage.syncTheme` → lights/env + each book `repaint()`.
3. `repaint`: boards + procedural canvases + `applyBookFeel` + `applyCoverMap(url, themeId)` with **load generation** and cache-bust query.

If covers “stick”: check gen race, URL bust, server settings 500, whether event fired.

## Cinema contracts (implementations)

- Enter: `enterFromDetail` — covers closed; `enterFx.playEnter`; `onOpaque` → `onEnterSubject`.
- Return: `playReturnFromLab` — `onRevealHub` via `revealHubShell` only after opaque; then `beginCloseToShelf`.
- `const onRevealHub = ...` at factory scope must **not** be shadowed by local `opts` inside return.

## Tests that guard this package

- `test/web/subject-hub.test.cjs` — hub wiring, assets, enter/return strings, floaters
- `test/web/bookshelf-structure.test.cjs` — module map, orchestrator imports, cover-urls values
- `test/web/subject-transition-*.test.cjs` — machine/controller opaque/ready ordering

When moving symbols out of `stage.js`, **update tests** that `readFileSync(stage.js)` for string presence (pattern used historically for `THEME_COVER_VERSION`—now lives in `cover-urls.js`).

## Safe refactor rules

1. Preserve pose/timing/dissolve **numbers** unless task is visual.
2. Inject shared geo/tex into `createBuildBook(ctx)`—avoid circular imports.
3. Don’t invent a second theme event name.
4. Transparent clear color must remain for hub CSS backgrounds.
