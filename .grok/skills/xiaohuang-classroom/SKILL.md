---
name: xiaohuang-classroom
description: >
  Project operating system for 小黄的教室 (Xiao-Huang Classroom monorepo):
  architecture map, layer contracts, product/aesthetic judgment, hub bookshelf,
  add-feature paths, debug playbooks, and maintenance rules. Use whenever working
  in this repo — feature work, bugfix, visual polish, refactor, hub/bookshelf,
  chemistry/math classroom, themes, settings, Express API, Electron, or when the
  user mentions 大厅/书场/转场/主题/教室/化学/数学/架构/工程化. Also use for
  /xiaohuang-classroom. Read this skill before large changes so edits match
  product philosophy and monorepo boundaries.
---

# 小黄的教室 — Agent Operating Skill

This skill is the **project OS**. Prefer it over improvising architecture or visual quality bars.

## Mandatory first steps

1. Read **repo root** `AGENTS.md` (live constraints + learned prefs).
2. Open the reference that matches the task (below). Do **not** skim only this page for deep work.
3. State which **layer** you will touch before editing: shell · hub · classroom · feature · shared · server · desktop · packages.

## Task → reference map

| Task | Load |
|------|------|
| Where does X live? Layer ownership? | `references/architecture.md` |
| Is this “good enough” for the product owner? Visual/UX judgment | `references/product-philosophy.md` |
| Hub books, dissolve enter/exit, covers, floaters | `references/hub-bookshelf.md` |
| New subject / classroom / lab / theme / API | `references/add-feature.md` |
| Bug: blank hub, theme stuck, 500, empty transition | `references/debug-playbook.md` |
| Branch, test, refactor, forbidden paths | `references/maintenance.md` |
| Math board theme/lifecycle | `apps/web/src/math/AGENTS.md` |
| Bookshelf module map | `apps/web/src/subjects/bookshelf/AGENTS.md` |
| Specs (when changing hub/transition/math atlas) | `docs/superpowers/specs/` |

## Decision tree (always)

```
User request
  ├─ Visual / motion / hub book feel  → product-philosophy + hub-bookshelf
  ├─ “It broke” / regression           → debug-playbook (symptom first)
  ├─ New capability                    → add-feature checklist
  ├─ Split files / structure only      → maintenance + keep public APIs
  └─ Domain logic (chem/math)          → feature package + server chemistry/* if data
```

## Non-negotiable product rules (summary)

Full detail: `references/product-philosophy.md`.

- **Boutique fidelity > early perf** for hub books, glass/liquid, motion. Reject muddy/gray glass and prototype UI.
- **Theme = full asset system** (covers, spines, materials, hub bg, lights)—not text/color swaps.
- **Hub UX**: full-bleed hall; brand「小黄的教室」; click book → **intro**, not jump into lab; enter classroom = **closed book + cover dissolve** (no 3D open/flip/dive stack); exit is reverse dissolve onto closed book.
- **Reference-first visuals**: books demo (thebuggeddev/books); if a visual pass fails, research open-source demos **before** another thin iteration.
- **Subject-specific floaters** (chem elements, math numerals, …)—not one shared leaf effect.
- **Feature work on branches**; merge to main when verified.

## Non-negotiable engineering rules (summary)

Full detail: `references/architecture.md` + `maintenance.md`.

- Monorepo: `apps/web` · `apps/server` · `apps/desktop` · `packages/*`. Install **from repo root**.
- Never commit user DB / dist / electron stage / nested server lockfile as “source work”.
- Chemistry server under `routes/chemistry` + `services/chemistry`; HTTP stays `/api/...`.
- Hub public API: `createBookshelfStage` from `bookshelf/stage.js` only (hub imports that).
- Prefer **config-driven** labs/experiments; separate **logic vs rendering**.
- Structure refactors must **preserve behavior** (pose, timing, dissolve semantics) unless the task says otherwise.

## Working style expected by the owner

- Ship **judgment**, not just diffs: match reference, then refine; call out when something looks prototype-grade.
- Prefer **one coherent pass** over stacked hacks (e.g. do not layer dive + open + dissolve).
- When stuck on look/feel: stop, find a real reference, then implement.
- After visual/theme work: verify **enter, exit, theme switch, return hub** paths—not only the happy enter path.
- Confirm before destructive git / shared remote actions; feature branches are default.

## Quick path cheat sheet

| Concern | Start here |
|---------|------------|
| App boot / shell | `apps/web/src/main.js`, `app/shell.js` |
| Subject hub | `subjects/hub.js`, `subjects/catalog.js` |
| 3D bookshelf | `subjects/bookshelf/*` (see package AGENTS) |
| Classroom mount | `subjects/classrooms/registry.js` |
| Chemistry features | `apps/web/src/chemistry/{feature}/` |
| Math labs | `apps/web/src/math/{lab}/` + `math/AGENTS.md` |
| Themes CSS | `shared/styles/themes/{id}/` |
| Hub CSS | `shared/styles/_subject-hub.css` |
| Settings UI | `shared/ui/settings.js` |
| API client | `shared/api/client.js` |
| Express entry | `apps/server/src/index.js` |
| Shared settings pkg | `packages/subject-settings` |
| Math expr pkg | `packages/math-expr` |
| Hub tests | `test/web/subject-hub.test.cjs`, `bookshelf-structure.test.cjs` |

## After non-trivial work

1. Run the **smallest relevant tests** (`node --test test/web/...` or server tests).
2. If hub/bookshelf/theme touched: mentally walk enter/exit/theme + check structure tests.
3. Feature branch → verify → merge main; do not leave half-migrated module splits.

## Slash / auto invoke

- Explicit: `/xiaohuang-classroom`
- Auto: any non-trivial task in this repository should load this skill.
