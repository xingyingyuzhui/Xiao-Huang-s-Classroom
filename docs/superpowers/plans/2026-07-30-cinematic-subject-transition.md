# Cinematic Subject Transition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the subject-hub’s competing timer-driven animations with a cancellable cinematic enter/return flow that never exposes a blank frame or overlapping shells, and make theme refresh last-request-wins.

**Architecture:** `transition-machine.js` is a pure, clock-injected state machine that issues phase commands tagged with a transition id. `transition-controller.js` owns DOM shell visibility, focus and request cancellation; `stage.js` only animates the 3D book in response to commands, while `enter-fx.js` only paints and reports a full-viewport page-cover lifecycle. Theme refresh is prepared off the visible textures and committed only when the hub is idle.

**Tech Stack:** ES modules, Node built-in test runner, Three.js, Canvas 2D, CSS animations, Vite, Browser plugin QA.

---

## File Map

| File | Role |
| --- | --- |
| Create `src/subjects/bookshelf/transition-machine.js` | Pure phase/transition-id state machine with injected clock. |
| Create `src/subjects/bookshelf/transition-controller.js` | DOM shell adapter, semantic fallback focus, lifecycle orchestration. |
| Create `test/subject-transition-machine.test.cjs` | Unit tests for order, cancellation, failure and theme last-request-wins. |
| Modify `src/subjects/bookshelf/enter-fx.js` | Render one opaque double-page cover and report lifecycle events; no shell callbacks. |
| Modify `src/subjects/bookshelf/stage.js` | Replace ready-subject hard-coded timers with command methods and deferred theme asset preparation. |
| Modify `src/subjects/hub.js` | Expose stage commands/events rather than directly switching the application shell. |
| Modify `src/main.js` | Install controller; make controller the only owner of lab/hub visibility. |
| Modify `src/settings.js` and `src/theme/apply.js` | Route user theme requests through the controller; retain direct initial boot application only. |
| Modify `src/subjects/chrome.js` | Provide non-owning topbar visibility and focus adapter for the controller. |
| Modify `index.html` and `src/styles/_subject-hub.css` | Add semantic subject fallback, inert shell hooks and viewport-cover styling. |
| Modify `test/subject-hub.test.cjs` | Assert the controller/fallback wiring contracts. |

### Task 1: Pure transition machine

**Files:**
- Create: `test/subject-transition-machine.test.cjs`
- Create: `src/subjects/bookshelf/transition-machine.js`

- [ ] **Step 1: Write the transition event table before code**

Document this executable ordering beside the tests: `requestEnter → enter-focus (0ms) → enter-book (380ms) → enter-page (1080ms) → reportPageOpaque + reportLabReady → lab-visible → lab-interactive → settled`; `requestReturn → exiting-cover → reportPageOpaque → reportHubPrepared → exiting-book → reportPageCleared → hub-visible → hub-interactive → settled`; `reverse request → neutral-cover → reportNeutralCoverOpaque → new-direction first phase`. Each scheduled emission must receive the active id and return without effect when stale. The machine constructor receives `{ clock: { setTimeout, clearTimeout } }`; tests must advance that fake clock explicitly.

- [ ] **Step 2: Write the failing phase-order test**

```js
test('enter waits for both opaque page and ready lab before lab-visible', async () => {
  const { createTransitionMachine } = await import(machineUrl);
  const events = [];
  const clock = createFakeClock();
  const machine = createTransitionMachine({ clock, emit: (e) => events.push(e) });
  const id = machine.requestEnter('chemistry');
  clock.advance(1080);
  machine.reportPageOpaque(id);
  assert.deepEqual(events.map((e) => e.type), ['enter-focus', 'enter-book', 'enter-page']);
  machine.reportLabReady(id);
  assert.equal(events.at(-1).type, 'lab-visible');
});
```

- [ ] **Step 3: Run the targeted test and verify it fails**

Run: `node --test test/subject-transition-machine.test.cjs`

Expected: FAIL because `transition-machine.js` does not exist.

- [ ] **Step 4: Implement the smallest machine API**

```js
export function createTransitionMachine({ emit = () => {} } = {}) {
  let id = 0;
  let phase = 'hub-idle';
  let pageOpaque = false;
  let labReady = false;
  const begin = (next, payload = {}) => {
    phase = next;
    emit({ type: next, id, ...payload });
  };
  return {
    requestEnter(subjectId) { id += 1; pageOpaque = false; labReady = false; begin('enter-focus', { subjectId }); schedule(id, 380, () => begin('enter-book', { subjectId })); schedule(id, 1080, () => begin('enter-page', { subjectId })); return id; },
    reportPageOpaque(candidate) { if (candidate !== id || phase !== 'enter-page') return; pageOpaque = true; if (labReady) begin('lab-visible'); },
    reportLabReady(candidate) { if (candidate !== id || phase !== 'enter-page') return; labReady = true; if (pageOpaque) begin('lab-visible'); },
  };
}
```

- [ ] **Step 5: Run the targeted test and verify it passes**

Run: `node --test test/subject-transition-machine.test.cjs`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add test/subject-transition-machine.test.cjs src/subjects/bookshelf/transition-machine.js
git commit -m "feat: add subject transition machine"
```

### Task 2: Cancellation, failure, and deferred theme contract

**Files:**
- Modify: `test/subject-transition-machine.test.cjs`
- Modify: `src/subjects/bookshelf/transition-machine.js`

- [ ] **Step 1: Write failing cancellation/theme tests**

```js
test('return during enter invalidates stale enter reports', async () => {
  const machine = createTransitionMachine({ emit: events.push.bind(events) });
  const enterId = machine.requestEnter('chemistry');
  const returnId = machine.requestReturn();
  machine.reportLabReady(enterId);
  machine.reportPageOpaque(enterId);
  assert.equal(returnId, enterId + 1);
  assert.equal(events.some((event) => event.type === 'lab-visible' && event.id === enterId), false);
});

test('only commits the latest queued theme after settled', () => {
  machine.requestEnter('chemistry');
  machine.requestTheme('stationery');
  machine.requestTheme('blackboard');
  machine.reportSettled(machine.id());
  assert.equal(events.at(-1).themeId, 'blackboard');
});
```

- [ ] **Step 2: Run and verify RED**

Run: `node --test test/subject-transition-machine.test.cjs`

Expected: FAIL because return, settle and theme methods are absent.

- [ ] **Step 3: Implement the complete public contract**

Implement `requestReturn`, `requestTheme`, `reportNeutralCoverOpaque`, `reportHubPrepared`, `reportPageCleared`, `reportSettled`, `reportFailed`, `id`, and `phase`. Store one queued theme id. On reverse request, increment the id, emit `neutral-cover`, then emit the new direction’s first phase only after `reportNeutralCoverOpaque(id)`; test that this report is rejected outside `neutral-cover`. On failure emit `failed-cover`, never emit a shell-interactive event, and accept only a new `requestReturn` recovery request.

- [ ] **Step 4: Add reduced-motion and timeout tests**

Use injected `setTimeout` / `clearTimeout` functions and a fake clock. Assert that an 8-second lab-ready timeout emits `failed-cover`, reduced-motion still emits `page-opaque` before `lab-visible`, and `exiting-book` is impossible until the active id has accepted `reportHubPrepared(id)`.

- [ ] **Step 5: Verify all machine tests pass**

Run: `node --test test/subject-transition-machine.test.cjs`

Expected: PASS with all phase-order, cancellation, timeout and theme cases.

- [ ] **Step 6: Commit**

```bash
git add test/subject-transition-machine.test.cjs src/subjects/bookshelf/transition-machine.js
git commit -m "feat: make subject transitions cancellable"
```

### Task 3: Full-viewport page-cover renderer

**Files:**
- Modify: `src/subjects/bookshelf/enter-fx.js`
- Modify: `src/styles/_subject-hub.css`
- Modify: `test/subject-hub.test.cjs`

- [ ] **Step 1: Write failing structural tests**

```js
test('page effect uses one semantic viewport cover rather than a stack of pages', () => {
  const fx = read('src/subjects/bookshelf/enter-fx.js');
  assert.match(fx, /className = 'bookshelf-page-cover'/);
  assert.doesNotMatch(fx, /PAGE_COUNT\s*=\s*6/);
  assert.match(read('src/styles/_subject-hub.css'), /\.bookshelf-page-cover[\s\S]*inset:\s*0/);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `node --test test/subject-hub.test.cjs`

Expected: FAIL because the current effect creates six page nodes.

- [ ] **Step 3: Implement the cover lifecycle**

Replace `createEnterPageFx` callbacks with `{ onOpaque, onCleared, onSettled, onNeutralOpaque }`. `ensure()` creates one `bookshelf-page-cover` and one full-viewport canvas. `playEnter({ id, subjectName, origin })` paints before applying visible classes, reports opaque only after CSS opacity reaches one, and never invokes `main.js`. `playExit({ id, subjectName })` follows the same lifecycle in reverse. Add `holdNeutral({ id, subjectName })`, which paints a non-directional double page, makes it fully opaque, emits `onNeutralOpaque(id)`, and holds it without clearing. Add `promoteNeutralToEnter({ id, ... })` and `promoteNeutralToExit({ id, ... })`, which reuse the held cover for the new direction rather than exposing a frame. Every callback verifies its supplied id; `cancel(id)` clears only its matching lifecycle. Add `resize()` that repaints a replacement canvas at the current viewport/DPR before swapping it in.

- [ ] **Step 4: Implement CSS coverage and reduced-motion behavior**

Make the cover canvas fill `100vw × 100vh` and use a double-page painted composition. Remove centered 420px page sizing and all multi-page z-index arithmetic. In reduced-motion, show the painted cover for one animation frame, then report opaque/cleared in order.

- [ ] **Step 4a: Write neutral-cover tests**

Assert `holdNeutral` emits exactly one opaque report and does not clear itself; promoting the same id keeps the cover continuously visible; stale `cancel`, `onOpaque` and `onCleared` calls do not alter the active cover.

- [ ] **Step 5: Verify targeted tests pass**

Run: `node --test test/subject-hub.test.cjs`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/subjects/bookshelf/enter-fx.js src/styles/_subject-hub.css test/subject-hub.test.cjs
git commit -m "feat: render full viewport subject page cover"
```

### Task 4: Stage commands and atomic theme assets

**Files:**
- Modify: `src/subjects/bookshelf/stage.js`
- Modify: `src/subjects/bookshelf/covers.js`
- Modify: `test/subject-hub.test.cjs`

- [ ] **Step 1: Write failing stage-boundary tests**

```js
test('stage accepts transition commands and does not directly enter the lab', () => {
  const stage = read('src/subjects/bookshelf/stage.js');
  assert.match(stage, /beginEnter\(/);
  assert.match(stage, /beginReturn\(/);
  assert.doesNotMatch(stage, /onEnterSubject\(book\.cfg\.id\)/);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `node --test test/subject-hub.test.cjs`

Expected: FAIL against the current direct `onEnterSubject` timer path.

- [ ] **Step 3: Replace ready-book timer path with stage commands**

Expose `beginEnter({ id, subjectId, onCoverRequested })`, `beginReturn({ id, subjectId })`, `cancelTransition(id)`, and `prepareHub({ id, subjectId }): Promise<void>`. Preserve non-ready `open/close` detail behavior. `prepareHub` resolves only after the matching book and hero transforms are reset; controller resolution calls `machine.reportHubPrepared(id)`. Test stale, cancelled and duplicate preparation completions. The stage must only position the book and ask the controller to start the page cover; it must not hide panels or invoke subject entry directly.

- [ ] **Step 4: Make theme refresh transactional**

Split `repaint()` into `prepareThemeAssets(themeId, palette)` and `commitThemeAssets(prepared)`. Extract palette construction from DOM reads into a pure function keyed by `themeId`; pass it to cover/front/back/spine/page painters so offscreen preparation cannot paint a new id with the old `html[data-theme]` values. Build new offscreen front/back/spine canvases and new `CanvasTexture`s, bind all four books’ maps in one rAF, force one renderer frame, then let the controller commit CSS; dispose old textures only after that frame. Do not draw into currently mapped `fc` / `bc` / `sc` canvases. Include `coverURL` load success/failure in the prepared result. Coalesce stage theme requests to their last id; if non-idle, retain only the latest request until `settled`. On preparation failure retain current maps and report failure to the controller.

- [ ] **Step 4a: Add transactional texture tests**

Inject a fake renderer, texture factory and palette. Assert all new maps bind before one render; CSS commit occurs after render; old textures dispose afterward; a `coverURL` failure preserves old maps; and a late obsolete request cannot commit.

- [ ] **Step 5: Verify focused tests pass**

Run: `node --test test/subject-hub.test.cjs test/subject-transition-machine.test.cjs`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/subjects/bookshelf/stage.js src/subjects/bookshelf/covers.js test/subject-hub.test.cjs
git commit -m "feat: coordinate subject stage transitions"
```

### Task 5: Controller integration, shell roots, and semantic fallback

**Files:**
- Modify: `src/subjects/hub.js`
- Modify: `src/main.js`
- Modify: `src/subjects/chrome.js`
- Modify: `src/settings.js`
- Modify: `index.html`
- Modify: `src/styles/_subject-hub.css`
- Modify: `test/subject-hub.test.cjs`
- Create: `src/subjects/bookshelf/transition-controller.js`

- [ ] **Step 1: Write failing integration wiring tests**

```js
test('subject hub exposes semantic chemistry fallback and controller wiring', () => {
  const html = read('index.html');
  assert.match(html, /id="subjectHubFallback"/);
  assert.match(read('src/main.js'), /createTransitionController/);
  assert.match(read('src/subjects/hub.js'), /requestEnter/);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `node --test test/subject-hub.test.cjs`

Expected: FAIL because neither controller nor fallback exists.

- [ ] **Step 3: Implement the controller**

Create explicit `#hubShell` and `#labShell` siblings under a new `#subjectShells` container; keep topbar, settings drawer and page cover as separate siblings. Create `createTransitionController({ select, hub, stage, pageFx, settingsApi, chrome, enterLab, hideLabPanels })`. It owns `html.dataset.shell`, both shell roots’ `hidden` / `aria-hidden` / `inert`, topbar/settings interactivity, and the recovery cover. `chrome` exposes `setTransitionMode` / `focusSubjectFallback` but never writes shell state; `settingsApi` exposes `closeDrawer` / `setTransitionLocked` and must close an open drawer at transition start. It calls `enterLab(id)` as soon as `enter-page` begins so the target panel can load hidden/inert; `enterLab` resolves to `reportLabReady(id)`. It reveals and activates lab only after `pageOpaque && labReady`. On return it calls `stage.prepareHub({ id, subjectId })`; only that matching Promise resolution calls `reportHubPrepared(id)` before `exiting-book`. It restores the chemistry fallback button only after `hub-interactive`. On `failed-cover`, the recovery button lives in the page cover and is the only focusable control.

Implement this exact command mapping in one switch over accepted machine events:

| Machine event | Controller command | Completion report |
| --- | --- | --- |
| `enter-focus` / `enter-book` | `stage.beginEnter({ id, subjectId })` | none; stage callbacks are id-guarded |
| `enter-page` | start hidden/inert `enterLab(id)` and `pageFx.playEnter({ id })` | `reportLabReady(id)` / `reportPageOpaque(id)` |
| `exiting-cover` | `pageFx.playExit({ id })`, then `stage.prepareHub({ id, subjectId })` after opaque | `reportPageOpaque(id)` / `reportHubPrepared(id)` |
| `exiting-book` | `stage.beginReturn({ id, subjectId })` | page effect may emit `reportPageCleared(id)` only after book motion has begun |
| `neutral-cover` | `stage.cancelTransition(oldId)`, `pageFx.holdNeutral({ id })` | `reportNeutralCoverOpaque(id)` |
| new direction after neutral opaque | `pageFx.promoteNeutralToEnter/Exit({ id })`, then the matching stage command | standard reports for the new id only |
| `page-cleared` / `settled` | reveal the appropriate shell and clear matching temporary resources | no further report |

`stage.cancelTransition(oldId)` must clear all stage timers, rAF-owned transition callbacks and transition CSS classes before the neutral cover starts. The controller must not remove the cover until the active id has reached `page-cleared`; every page/stage callback with an old id is ignored.

- [ ] **Step 4: Wire current shell code through the controller**

Remove direct `showHub`, `returnToHubAnimated`, `subjectHub.setRevealHubHandler`, and direct stage subject-entry callbacks as shell writers. Keep feature loading/default tab selection inside `enterLab`; it must resolve a readiness promise while the target panel remains hidden/inert. Make both subject chip and settings “学科大厅” invoke `controller.requestReturn()`. Apply `data-transition-id`, `data-transition-phase`, and `data-transition-event` markers only from the controller so browser QA can observe accepted token-protected reports. Add a DEV-only `window.__subjectTransitionDebug` delay hook for controlled late-ready and timeout browser tests.

- [ ] **Step 5: Add accessible fallback markup/styles**

Add a visually hidden `#subjectHubFallback` containing a chemistry button and disabled descriptions for future subjects. It becomes the focus target after return and remains available to keyboard/screen-reader users; canvas remains an enhancement. During transitions, apply `inert` to both app shells and expose only the recovery control when failed.

- [ ] **Step 6: Verify integration tests pass**

Run: `node --test test/subject-hub.test.cjs test/subject-transition-machine.test.cjs`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/subjects/bookshelf/transition-controller.js src/subjects/hub.js src/main.js index.html src/styles/_subject-hub.css test/subject-hub.test.cjs
git commit -m "feat: control subject shell transitions"
```

### Task 6: Route settings themes through the controller

**Files:**
- Modify: `src/settings.js`
- Modify: `src/theme/apply.js`
- Modify: `src/main.js`
- Modify: `test/subject-hub.test.cjs`

- [ ] **Step 1: Write a failing route test**

```js
test('interactive theme picks request a subject transition theme commit', () => {
  const settings = read('src/settings.js');
  assert.match(settings, /onThemeRequest\(nextId\)/);
  assert.doesNotMatch(settings, /applyTheme\(\{ id: nextId \}\);/);
});
```

- [ ] **Step 2: Run and verify RED**

Run: `node --test test/subject-hub.test.cjs`

Expected: FAIL because settings applies the theme immediately.

- [ ] **Step 3: Implement request/commit split**

Make `initSettingsUI` expose `setThemeRequestHandler(handler)` and let `onThemePick` await that handler’s result. Register it from `main.js` only after the controller and stage exist. Keep `applyTheme(settings.theme)` only for startup before the bookshelf stage mounts. Persist settings and update the picker only after the controller’s `commitTheme(themeId)` has atomically succeeded; on failure retain the old persisted/selected id and show a settings error without partial CSS.

- [ ] **Step 4: Verify and commit**

Run: `node --test test/subject-hub.test.cjs test/subject-transition-machine.test.cjs`

Expected: PASS.

```bash
git add src/settings.js src/theme/apply.js src/main.js test/subject-hub.test.cjs
git commit -m "feat: queue subject hub theme commits"
```

### Task 7: Full verification and visual QA

**Files:**
- Modify only if required by failures from the checks below.

- [ ] **Step 1: Run all automated tests**

Run: `npm test`

Expected: exit 0 with no failing Node tests.

- [ ] **Step 2: Run production build**

Run: `npm run build`

Expected: exit 0 and Vite output in ignored `dist/`.

- [ ] **Step 3: Browser QA at desktop baseline**

Use the Browser plugin at 1280×720 DPR 2. Exercise chemistry enter, wait for each `data-transition-id`, `data-transition-phase`, and accepted event value, and capture focus/page-opaque/reveal screenshots. Verify the page cover spans the viewport, no more than one stable shell is interactive (zero is permitted while covered), and no gray/white blank frame appears.

- [ ] **Step 4: Browser return and interruption QA**

Exercise topbar return and settings return. Trigger return during entry and entry during return; assert stale ids do not alter the final shell. Capture return-cover, hub-prepared, and page-cleared screenshots. Exercise cover recovery using the DEV delay hook to force a `labReady` timeout, then assert focus returns to the chemistry fallback button.

- [ ] **Step 5: Browser theme QA**

Rapidly click three themes, ending on Stationery. Verify the book shelf never disappears, final CSS and all book textures match Stationery, and no obsolete theme commits after the final one. Repeat across a resize/DPR change and verify the opaque cover has no margin gap.

- [ ] **Step 6: Commit any verification-driven correction**

```bash
git add <only files changed by the verified correction>
git commit -m "fix: polish subject transition timing"
```
