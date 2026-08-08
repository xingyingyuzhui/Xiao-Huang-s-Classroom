# Product philosophy & owner judgment

This file encodes **how the project owner decides quality**. When agent taste conflicts with this file, **this file wins**.

Source: long hub/bookshelf/theme sessions + repo `AGENTS.md` learned preferences.

## North star

Build a **boutique multi-subject classroom**—game-asset-level hub and careful motion—not a prototype dashboard with floating boxes.

Chemistry proved the lab depth; the **hall is the brand face**. Math and other subjects extend the same shell language.

## Visual quality bar

| Do | Don't |
|----|--------|
| Game-asset covers, coherent spines/edges, real thickness, page striation | Flat boxes, random OPEN badges, muddy gray glass |
| Theme-complete systems (art + light + env + hub bg + UI tokens) | “Change hex and ship” |
| Bright, readable covers under classroom light; controlled specular | Blob shadows that read as shadow walls; dusty env that milks covers |
| Research real demos/repos when a pass fails | Thin re-tweak loops that never fix root look |
| Boutique motion (springs, staged fan, dissolve sampled from cover) | Stacking every effect (open + flip + dive + dissolve) |

**Perf**: defer micro-optimization of hub glass/books until fidelity is right, unless something is unusable.

## Hub / science hall rules

1. **Full-bleed hall**: no top subject TAB strip on hub; keep top-right settings only; no empty chrome gap where tabs used to be.
2. **Brand**:「小黄的教室」—not「科学」. No redundant corner brand/TAB chrome. Brand type follows each theme’s palette; **no specular/glow** on brand text.
3. **Books = subjects**: distinct books; only intended subjects clickable as product rules evolve. Enterability follows `apps/web/src/subjects/manifest.js`, not `catalog.status` alone.
4. **Click book → intro page**, never direct classroom jump.
5. **Intro chrome**: no center close X; secondary「返回大厅」; avoid generic「N 个模块」meta copy.
6. **Floaters**: **subject-specific** motifs (chem element symbols, math numerals, biology leaf-like, physics-themed). One shared leaf effect for all is wrong.

## Reference alignment (bookshelf)

Primary reference: [thebuggeddev/books](https://github.com/thebuggeddev/books) / live [books-sigma-ashen.vercel.app](https://books-sigma-ashen.vercel.app/).

Keep close:

- **Outward-fanning** hero poses (not inward-top convergence).
- Book lighting character of the reference.
- Intro focus timing: other books fully sink, then selected book rotates with short lead (~0.1s class), no long awkward pause.
- Detail pose: near-front, slight open (cover micro-angle), grounded composition—not diagonal “flyer” unless product revises.

## Enter / exit cinema

Spec: `docs/superpowers/specs/2026-07-30-cinematic-subject-transition-design.md`.

| Step | Correct | Wrong |
|------|---------|-------|
| Enter classroom | Book **closed**; cover-dissolve (etch/particles from cover art); shell switch on **opaque** | 3D cover-open + page-flip + dive + dissolve all at once; switch shell while transparent (empty lab flash) |
| Exit to hub | Reverse dissolve onto **closed** book; reveal hub under veil; then shelf return | Instant cut; reveal hub before veil; book stuck open during dissolve |
| Session safety | `transitionSeq` / tid guards; `onRevealHub` not shadowed by local opts | Stale timers firing mid-return |

## Theme philosophy

Five themes are **five classrooms**, not five accent colors:

- Cover packs v1–v5 ↔ themes (`cover-urls.js`).
- Hub backgrounds per theme.
- Book feel (roughness/clearcoat/cloth spine) + light positions per theme (`theme-feel.js`).
- UI tokens under `shared/styles/themes/`.

When theme “doesn’t apply”: fix pipeline (event, repaint, cache bust, server settings)—don’t paint one-off CSS on a single mesh and call it done.

## Experiment / classroom content philosophy

- **State-driven** engines; **chemistry/math logic separated from rendering**.
- Labs/experiments **configuration-driven**, not one-off page stacks per activity when a schema exists.
- Math: honor `math/AGENTS.md` (theme + board lifecycle; no border-soft-as-grid hacks; shared `@xiaohuang/math-expr`).

## Interaction & copy tone

- Calm, student-facing Chinese UI; precise labels (开放 / 即将推出 / 返回大厅 / 互动教室).
- Cursor affordances: pointer on hero books, grab on detail orbit—avoid noisy “open slip” gimmicks that were removed.
- Reduced motion: respect `prefers-reduced-motion` paths already in stage/FX.

## Iteration method the owner expects

1. Implement against **reference + written rules**.
2. If owner rejects look: **find open-source/demo reference**, then redo—don’t only nudge numbers.
3. Prefer **revert bad experiments** (e.g. liquid-glass UI detour) over leaving half-styles.
4. Composition passes: restore known-good detail sizes when “more drama” breaks balance.
5. Structure work is welcome **after** visual language stabilizes; split modules without changing pose/timing unless asked.

## Anti-patterns (owner rejected in practice)

- Prototype liquid-glass on everything / metal UI fashion trends without fit.
- Fancy floaters that fight the brand (revert to subject motif system).
- Shadow planes that read as black walls in bright classroom.
- Cover load races leaving wrong theme art (need gen tokens + cache bust).
- Committing feature work straight to main after main is established—**use branches**.

## How agent should talk about quality

- Say when something is still prototype-grade.
- Separate **structure-only** vs **behavior/visual** changes.
- Propose the **smallest path that preserves cinema contracts**.
