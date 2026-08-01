# Fused Point Labels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When labeled points coincide within snap tolerance, show one fused label `Name1·Name2(x, y)` and hide the others (display-only).

**Architecture:** Pure clustering/formatting in `point-label-fusion.js`; graph registers board callbacks; `ensurePointGeomHook` sync-refreshes after intersect ticks; CRUD/viewport/visibility use `createFrameTask`.

**Tech Stack:** Vanilla ESM math modules, JSXGraph labels, Node test runner.

**Spec:** `docs/superpowers/specs/2026-08-02-fused-point-labels-design.md`

---

## File map

| File | Role |
|------|------|
| Create `apps/web/src/math/shared/point-label-fusion.js` | classify, cluster (union-find), format, apply |
| Modify `apps/web/src/math/shared/board-label.js` | export `setLabelContent`; suppress short-circuit; fusion call in geom hook |
| Modify `apps/web/src/math/graph/index.js` | list candidates, register refresh/schedule, feature mark flag, wire onChanged/dispose/viewport |
| Modify `apps/web/src/math/graph/user-points.js` | schedule fusion after setShowCoords / create / delete |
| Modify `apps/web/src/math/graph/construction/intersection-lifecycle.js` or `intersections.js` | schedule after visibility refresh |
| Modify `apps/web/src/math/AGENTS.md` | one-line fusion contract |
| Create `test/web/math-point-label-fusion.test.cjs` | pure + wiring assertions |

### Task 1: Pure fusion module (TDD)

**Files:** Create fusion module + test

- [ ] Write failing tests for classify, connected-component cluster, format, apply
- [ ] Implement `point-label-fusion.js`
- [ ] Tests pass
- [ ] Commit

### Task 2: board-label hook

- [ ] Export `setLabelContent`; suppress short-circuit in tick path
- [ ] Insert fusion between intersect ticks and updateText
- [ ] Structure test asserts order
- [ ] Commit

### Task 3: Graph wiring

- [ ] `listLabeledPointElements`, register `_mathRefreshPointLabelFusion` / schedule task
- [ ] `_mathFeatureMark` on marks; onChanged + dispose; boundingbox/viewport schedule
- [ ] user-points + intersect visibility schedule
- [ ] AGENTS.md note
- [ ] Wiring tests pass; full `math-*.test.cjs` green
- [ ] Commit
