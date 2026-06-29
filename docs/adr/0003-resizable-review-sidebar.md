# ADR 0003 — Resizable review sidebar

- **Status:** Accepted
- **Date:** 2026-06-19
- **Deciders:** project owner
- **Scope:** how the review surface's left pane (`features/review`, the file-list pane `.review-split__list`) becomes user-resizable with a persisted width, and — alongside — where the list/tree toggle (`ViewModeToggle`) belongs.

## Context

The review surface is a master-detail layout (`review-view.tsx`): a left pane `.review-split__list` (the two sections *Validé* / *À reviewer*) at a fixed `flex: 0 0 320px; min-width: 240px`, and a right pane `.review-split__diff` (`flex: 1 1 auto; min-width: 0`) carrying the diff viewer. Two pieces of user feedback motivate this decision:

1. **Fixed width.** The sidebar must be resizable by a vertical handle between the list and the diff, its width persisted across sessions, within min/max bounds, styled strictly from Radix tokens, accessible, and unit-testable under Vitest/jsdom. This is the central decision.
2. **Toggle placement.** `ViewModeToggle` (a Radix `SegmentedControl` list/tree, bound to `useViewStore`) lives in the global toolbar (`.review__toolbar`), yet it only re-lays-out the **left pane's** file lists — `mode` is consumed by `StatusSection`, never by `.review-split__diff`. That is a control/target mismatch.

**Framing fact — the platform offers nothing.** Verified: neither `@radix-ui/themes` 3 nor the `@radix-ui/react-*` primitives ship a splitter/resizable; their `Separator` is purely decorative (not focusable, not resizable). Only Radix **Vue** has a `Splitter` (irrelevant in React). So the choice is a third-party library or custom.

**Precedent (ADR 0001).** For diff rendering we chose to **own the interaction that defines the product** and to **delegate only the genuinely hard generic parts** (virtualization, syntax highlighting) to maintained primitives, avoiding a single-maintainer / 0.x runtime dependency on the critical path; low lock-in. That philosophy is the deciding driver here.

## Decision drivers

- **Sober / Radix-native.** No foreign styling system fighting Radix tokens (`--gray-*`, `--accent-*`, `--radius-*`). We own the markup and its appearance.
- **Low lock-in / maintenance.** No single-maintainer or 0.x dependency on a path that wraps the diff viewer (the product core). Trivial to remove.
- **WAI-ARIA accessibility.** The *Window Splitter* pattern (focusable separator, `aria-valuenow/min/max`, arrow/Home/End keyboard) is expected, not optional, for the professional bar.
- **Performance during drag.** The right pane is (eventually) a virtualized diff: it must not re-render — and ideally not even restyle — while dragging.
- **Persistence consistent with what exists.** Reuse the `storage.ts` + single-concern Zustand store pattern (like `use-view-store.ts`), `gitting.*`-namespaced key.
- **Vitest/jsdom testability.** jsdom has no layout engine (geometry is 0): the logic must live in pure functions, testable without real pixels.
- **Tauri WebView compatibility.** Works on WebKitGTK (Linux) and WebView2/Chromium (Windows).

## The central trade-off: "simple to own" or "genuinely hard generic"?

A single-handle, single-axis splitter splits into two slices of opposite nature with respect to ADR 0001:

- **The drag mechanic** — `pointermove` → `clamp(min, max)` → persist — is the simple interaction, specific to our layout: **the slice to own.** ~3 pure functions + a thin handler.
- **The range-aware ARIA contract** — `role="separator"` with computed `aria-valuenow/min/max`, plus the keyboard matrix (arrows/Home/End) — is the part that is generic but easy to get subtly wrong.

A first synthesis proposed delegating the second slice to `react-aria` (`useMove` + `useSeparator`). Adversarial review refuted that on verified facts:

- `useSeparator` is **decorative**: it emits `role="separator"` + `aria-orientation` only — **no** `aria-valuenow/min/max`, **no** `aria-controls`, **no** `tabIndex`, **no** keyboard. The range-aware ARIA model is hand-written either way.
- `useMove` **handles arrow keys itself** with a fixed ~50px delta, which would **double-handle** our `STEP`-based keyboard or force us to disable it — a conflict, not a delegation.
- `@react-aria/separator` + `@react-aria/interactions` both depend on `react-aria ^3.48`, pulling the **whole umbrella** — the "lighter than a splitter library" claim collapses.
- The app is **desktop, non-touch**: `useMove`'s main value (normalizing touch/emulated-mouse events) is moot here.

So for **this** case — one handle, horizontal, LTR, fixed-px bounds, no touch — there is **no genuinely hard generic slice** left to delegate once the ARIA model is hand-owned regardless. The drag mechanic reduces to ~15 lines of Pointer Events.

## Options considered

### A. `react-resizable-panels` (bvaughn) — reference splitter library
- **+** Strong maturity (~35M dl/wk, MIT, active), headless, best-in-class keyboard a11y, injectable persistence, direct-mutation perf, robust in WebKitGTK/WebView2.
- **−** **Single-maintainer** — exactly the risk profile ADR 0001 flags on the critical path, here wrapping the diff pane; its public API was rewritten between majors; ~8–10 KB gzip for our simplest-possible case (one group, two panels, one handle).
- **Verdict.** Excellent safe fallback, but it makes a single-maintainer dependency wrap the product core to save ~100 lines — poor ratio against ADR 0001.

### B. Custom on `react-aria` (`useMove` + `useSeparator`)
- **−** Refuted above: `useSeparator` is decorative (no range ARIA), `useMove`'s keyboard conflicts with ours and its touch benefit is moot on desktop, and the two packages pull the full `react-aria` umbrella. It delegates almost nothing that we don't write anyway, for a non-trivial dependency on the critical path.

### C. Custom on native Pointer Events — **chosen**
- **+** Zero dependency, total control, lightest. The drag mechanic is `pointerdown` → `setPointerCapture?.()` → `pointermove` (clamp) → `pointerup` (commit). The range-aware ARIA + keyboard are owned and **fully covered by pure-function unit tests** — the slice ADR 0001 says to own once it is done correctly.
- **−** We write the ARIA model and keyboard ourselves. Mitigated by specifying them exactly below and asserting them in tests (a render test that fails if an attribute is missing), so we do not ship the silently-inferior hand-rolled handle (`role`+`tabIndex` and nothing more) that the lib exists to prevent.

### D. Native CSS `resize: horizontal` — rejected
Unstylable native grabber (fights the sober/Radix direction), **no** a11y semantics, no reliable min/max or persistence, uneven across WebKitGTK/Chromium, resizes a box rather than a shared split. Out on nearly every driver.

### Dismissed without detail
`allotment` (ships `allotment/dist/style.css` → foreign CSS; IDE-sized), `react-split-pane` (legacy), `react-split`/`split.js` (imperative DOM mutation, a11y to redo, friction with React 19 strict), `react-resizable` (box resize, not a two-pane split), `@column-resizer/react` (niche, weaker a11y), Base UI/MUI (no Splitter shipped + Emotion = foreign styling).

## Decision

**Option C — a custom `SidebarResizer` built on native Pointer Events, with a hand-owned WAI-ARIA Window Splitter contract and all geometry in pure functions.** `react-resizable-panels` (A) is the documented fallback if we ever need multi-handle / ratio / rich collapse layouts.

**Related decision — toggle placement.** Move `ViewModeToggle` out of `.review__toolbar` into a non-scrolling **sidebar header** at the top of `.review-split__list`, by control/target contiguity: it re-lays-out only the left pane's lists. The global toolbar keeps the repo-scoped actions (Rafraîchir, RepoPicker) and the hint text.

## Implementation details

### State & persistence

New single-concern store `src/stores/use-sidebar-store.ts`, mirroring `use-view-store.ts`:

- Key `gitting.sidebarWidth`, read/written via `readStorage`/`writeStorage` (best-effort; tolerates jsdom / hardened WebView / private mode).
- `width: number`, `setWidth(px)` which **clamps**, persists, then `set`; `reset()` sets the width to `DEFAULT_WIDTH` and persists it (the clamp is a no-op on the in-bounds default).
- `initialWidth()`: read storage, `Number.parseInt`, keep only `Number.isFinite`, **clamp on load** (a corrupt/out-of-range stored value can never produce an invalid pane), else fall back to the default — same shape as `initialMode()`.

Bounds live as exported constants in `src/features/review/resize-utils.ts` (single source, reused by the drag math, the keyboard, the store, and the tests — no magic numbers): `MIN_WIDTH = 240`, `MAX_WIDTH = 560`, `DEFAULT_WIDTH = 320`, `STEP = 16`. **MAX is a fixed px**, not a ratio: a ratio needs the live container width (ResizeObserver), is untestable in jsdom, and the diff pane is the priority — a hard cap protects it without coupling to the viewport. The clamp (applied on every mutation and on load) is the single source of truth for the value; CSS carries **no** competing `min-width`/`max-width` on the pane (no duplicated bounds).

### ARIA & keyboard (WAI-ARIA APG — Window Splitter, variable)

The handle is a `<div>` we own (no Radix component exists), carrying — all set by hand, so there is one source and no attribute conflict:

- `role="separator"`, `tabIndex={0}`.
- `aria-orientation="vertical"` — the separator is vertical (it runs top-to-bottom and moves horizontally); a vertical separator moves with **Left/Right** arrows (APG arrow mapping).
- `aria-controls` → the `id` of the primary pane (`id="review-sidebar"` on `.review-split__list`); the handle and that element render/unmount together (never an orphan `aria-controls`).
- `aria-valuenow` (current width, **integer** via `Math.round`), `aria-valuemin={MIN_WIDTH}`, `aria-valuemax={MAX_WIDTH}` — homogeneous px units; `aria-valuetext={`${w} pixels`}` for an intelligible reading.
- `aria-label="Largeur de la liste des fichiers"` (French, like the app).

`aria-valuenow` reflects the **committed** state (low-frequency React render), never written per frame.

Keyboard — a **single source**, the hand-rolled `onKeyDown` (`useMove`'s competing arrow handling is not used): `ArrowLeft` → `-STEP`, `ArrowRight` → `+STEP` (clamped); `Home` → `MIN_WIDTH`, `End` → `MAX_WIDTH`; `preventDefault` only on consumed keys; `ArrowUp/Down` ignored (vertical separator); `F6` omitted (two panes — documented). `onDoubleClick` (pointer, outside ARIA) → reset to `DEFAULT_WIDTH`. Every mutation goes through the same pure `clamp → commit` path. **Collapse-on-Enter is out of scope for v1** (it needs a distinct collapsed ARIA state and a sub-MIN target that breaks the clamp invariant — deferred, not faked).

### Performance (CSS variable + ref, zero React re-render mid-drag)

Width lives at two cadences:

1. A custom property `--sidebar-width` set inline on **`.review-split__list` itself** (not the shared `.review-split` parent — so style invalidation stays confined to the left pane and never touches the virtualized diff subtree). The pane reads `flex: 0 0 var(--sidebar-width, 320px)`; during a drag the property is mutated by direct DOM write (high frequency) → the browser relayouts the left pane **without** React.
2. The store + storage, written **once** on `pointerup` (and on each discrete keyboard step).

Mechanics: `onPointerDown` (guard `e.button === 0`) records `startX` (`clientX`) and `startWidth` (read from the store, **never measured** — no `getBoundingClientRect`/`offsetWidth` anywhere) in a ref, adds `.is-resizing` to the container synchronously via `classList`, calls `setPointerCapture?.(e.pointerId)` (guarded — absent in jsdom). `onPointerMove` (if resizing): `next = clampWidth(startWidth + e.clientX - startX)`, writes `--sidebar-width` to the pane via ref, stores `next` in a ref — **no** `setState`. `onPointerUp`/`onPointerCancel` (same handler): remove the class, `releasePointerCapture?.()`, commit `setWidth(latest)` **once** → one render, one storage write, `aria-valuenow` current at that render. The keyboard path skips the variable dance and commits straight to the store. `contain: layout` on `.review-split__diff` isolates its relayout from the neighbour's resize.

### Toggle placement & box model

`.review-split__list` becomes a flex column (padding 0, **border-right removed** — the handle is now the sole visual boundary, no double line), `flex: 0 0 var(--sidebar-width, 320px)`:

- `.review-split__list-head` — `flex: 0 0 auto`, padding `8px 12px`, `border-bottom: 1px solid var(--gray-a4)`; holds `<ViewModeToggle />` (its `SegmentedControl` is fixed at `size="1"`) and the file total (`status.staged.length + status.unstaged.length`).
- `.review-split__scroll` — `flex: 1 1 auto; min-height: 0; overflow: auto`, padding `8px 12px`, carrying the thin scrollbar tokens (moved off `.review-split__list`); wraps the two `StatusSection`.

DOM order inside `.review-split`: list, handle, diff (direct siblings). `.review-split__diff` stays `flex: 1 1 auto; min-width: 0` (the flex floor the future virtualizer relies on). The handle `.review-split__handle`: `flex: 0 0 6px` with an enlarged hit area (~8–10px, WebKitGTK 1px hit-testing is unreliable), `cursor: col-resize`, `touch-action: none`, permanent `user-select: none`, background `var(--gray-a4)`, hover/active `var(--accent-a7)`/`--accent-8`, a clearly visible `:focus-visible` outline (≥2px, offset, contrast on both themes). `.review-split.is-resizing` sets `cursor: col-resize; user-select: none`, and `.is-resizing .review-split__diff { pointer-events: none }` — a belt-and-suspenders against the scrollable diff container swallowing `pointermove` if capture ever fails (the diff is a virtualized DOM list, not an iframe).

### Files

- **Create** `src/features/review/resize-utils.ts` — pure, JSDoc'd: bounds constants, `clampWidth(px)`, `widthFromDrag(startWidth, startX, currentX)`, `nextWidthForKey(key, current)` returning `{ width, handled }` (drives the targeted `preventDefault`).
- **Create** `src/stores/use-sidebar-store.ts` (+ test) — store + `initialWidth`.
- **Create** `src/features/review/sidebar-resizer.tsx` (+ test) — the handle: ARIA props, pointer/keyboard handlers, writes the var to the pane via a passed ref.
- **Modify** `src/features/review/review-view.tsx` — sidebar header (move `ViewModeToggle` in) + inner scroller; `id="review-sidebar"` + width ref + inline `--sidebar-width` on the list; render the handle between list and diff; drop `ViewModeToggle` from the toolbar.
- **Modify** `src/styles/global.css` — the box-model and handle rules above.

### Tests (Vitest, unit only, colocated)

jsdom has the `PointerEvent` constructor (so `fireEvent.pointer*` dispatches) but **not** `setPointerCapture`/`releasePointerCapture` → the calls are guarded (`?.`). jsdom does no layout → never assert pixel geometry, only the written variable and committed state.

1. `resize-utils.test.ts` (the bulk, pure, zero DOM): `clampWidth` (below-min / above-max / in-range), `widthFromDrag` (±delta, clamped both ends), `nextWidthForKey` (Arrow ±`STEP` + clamp, Home→MIN, End→MAX, unknown key → `handled:false`).
2. `use-sidebar-store.test.ts`: `initialWidth` (valid, out-of-range → clamped, corrupt → default, absent → default); `setWidth` clamps + writes `gitting.sidebarWidth`. Reset store + `localStorage` in `beforeEach`.
3. `sidebar-resizer.test.tsx` (light render): asserts the exact ARIA set (`role`, `aria-orientation`, `aria-valuemin/max/now`, `aria-controls`, `aria-label`) and that the `aria-controls` target exists; `{ArrowRight}` → `aria-valuenow += STEP` and `setWidth` called **once**; `pointerDown/Move/Up` → the pane's `--sidebar-width` reflects the dragged px and `setWidth` called **exactly once** (spy proves no per-frame commit); double-click → `DEFAULT_WIDTH`.

## Consequences

**Positive**
- Key interaction owned, 100% Radix tokens, near-zero lock-in: removing the resizable sidebar is a small-surface change that never touches the diff viewer.
- APG-level a11y (range-aware separator + keyboard resize) without a single-maintainer dependency on the critical path.
- Zero React re-render of the diff pane during drag, with style invalidation confined to the left pane and `contain: layout` on the diff → the future virtualizer is protected.
- Persistence and store homogeneous with `use-view-store.ts`; broad, deterministic Vitest coverage via pure functions.
- The toggle sits next to its target: self-evident scope, shorter eye/pointer travel.

**Negative & mitigations**
- *We write the ARIA contract.* Fully specified above and asserted by a render test that fails on a missing attribute — the slice ADR 0001 accepts owning once done correctly.
- *WebView/jsdom pitfalls.* Guarded pointer-capture calls; `onPointerCancel` shares the `pointerUp` handler (else `.is-resizing` sticks); `pointer-events:none` on the diff during drag; permanent `user-select:none` on the handle + `.is-resizing`; synchronous `classList`/cursor mutation in the down handler (no `setState`); delta-only math (no `getBoundingClientRect`, legitimizing the jsdom drag test).
- *Narrow window.* `MAX_WIDTH=560` keeps the sidebar from dominating; on an extremely narrow window the diff pane gets small (user-controlled). Accepted for v1; a runtime floor on the diff can be added later without changing the px clamp.
- *RTL.* The app is LTR-only: assumption documented and isolated in `widthFromDrag` (negating the delta is a one-line change if an RTL locale ever appears).

## Confirmation

- **Tests**: the three Vitest suites pass; the spy proves a single commit per gesture and per keystroke; the Biome / strict-TS gate passes.
- **Manual (`pnpm tauri dev`)** on both target WebViews: mouse drag within `[240, 560]`; persistence across restart; `Tab` to the handle then arrows/Home/End; double-click → reset to 320; **the diff does not flicker or re-render** during drag; `:focus-visible` and hover/active render correctly under the real Radix theme on light **and** dark; `ViewModeToggle` appears pinned in the sidebar header (does not scroll) and is gone from the toolbar.

## Update (2026-06-29) — WebView2 drag reliability

The decision (Option C — owned Pointer-Events splitter) stands; only the **event-target mechanism** is revised. The original drag depended on `setPointerCapture(pointerId)` on the handle to keep `pointermove` flowing once the cursor left the few-pixel strip. That holds on WebKitGTK (Linux) but **not on WebView2 (Windows)**: WebView2 does not reliably retain mouse pointer capture, so the captured `pointermove` stopped firing the moment the cursor left the handle (and the `.is-resizing .review-split__diff { pointer-events: none }` guard routes moves *away from*, not back to, the handle). Net effect: the sidebar did not resize at all on Windows.

**Revised mechanic.** On `pointerdown` the gesture now attaches `pointermove` / `pointerup` / `pointercancel` / `blur` listeners to **`window`** (removed on end), instead of relying on pointer capture on the handle. Window listeners receive every move regardless of the element under the cursor and regardless of `pointer-events: none` on the diff — the pattern every production splitter uses, reliable on both WebViews. `setPointerCapture`/`releasePointerCapture` are dropped (no longer load-bearing); the `--sidebar-width` direct-write perf path, the once-per-gesture commit, the ARIA/keyboard model, and the `.is-resizing` guards are unchanged. An unmount mid-drag settles the gesture via a ref so no listener leaks. The Vitest drag tests now dispatch move/up/cancel on `window` (matching the real target).

**Companion config fix.** `app.windows[].dragDropEnabled` is set to `false` in `tauri.conf.json`. Its Tauri 2 default is `true`, which installs a WebView2 OS-level (OLE) drag-drop handler that can hijack click-drag gestures on Windows. Gitting uses no HTML5 drag-and-drop or file-drop (repos open via the dialog plugin), so disabling it is risk-free and removes a documented class of Windows-only drag interference. Re-enable it only if a future "drop a folder to open it" feature is added.

## References

- WAI-ARIA APG — Window Splitter: <https://www.w3.org/WAI/ARIA/apg/patterns/windowsplitter/>
- MDN — `setPointerCapture`: <https://developer.mozilla.org/en-US/docs/Web/API/Element/setPointerCapture>
- MDN — Pointer events: <https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events>
- `react-resizable-panels` (documented fallback): <https://github.com/bvaughn/react-resizable-panels>
- Radix Themes Separator (confirmation: no splitter): <https://www.radix-ui.com/themes/docs/components/separator>
- `react-aria` `useMove` / `useSeparator` (evaluated, not adopted): <https://react-spectrum.adobe.com/react-aria/useMove.html> · <https://react-spectrum.adobe.com/react-aria/useSeparator.html>
