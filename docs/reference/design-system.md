# Gitting — Design System

Durable design direction for the app's visual language, grounded in a 2026
best-practices survey (premium desktop dev tools: Linear, Zed, Raycast, Graphite,
GitButler, Vercel/Geist, GitHub Primer) and adapted to Gitting's locked stack
(Radix Themes + Radix CSS vars, Zustand, self-hosted fonts, WebKitGTK/WebView2).
This is the source of truth for tokens and component treatment — consult it before
touching `global.css`, `theme-provider.tsx`, or any review surface so nobody (human
or agent) drifts back to Radix defaults.

## 1. Thesis

**Gitting is a quiet workbench for burning down a review queue of agent diffs — a
single, dark, edge-to-edge surface where the diff is the only thing that glows,
staging is the cursor, and an empty queue is the reward.** Linear and Raycast raised
on `git`: dense, instant, monospace-literate, almost entirely grayscale at rest,
color appearing only where it carries meaning. The signature is **restraint applied
uniformly** plus one authentic flourish — **monospace as identity**, because the
content is code and the tool should look like it knows that.

Four principles that decide everything:

1. **The diff is the brightest surface; everything else recedes.** Chrome (titlebar,
   sidebar, footer) sits on the window tint at lower contrast.
2. **Elevation by value-step + 1px alpha hairline, never by shadow.** Shadows exist
   only on things that genuinely float (menus, dialogs, a future command bar). Docked
   panes are flat, separated by one seam — a tint shift *or* a hairline, never both.
3. **Color is a scalpel, ~3% of pixels.** One runtime accent for focus/selection/
   primary action; desaturated green/red/amber strictly for diff semantics. No
   gradients, no glows, no glass, no purple-as-default.
4. **Fast and optimistic, never bouncy.** No animation exceeds 200ms except the single
   "queue cleared" completion beat. No springs, no bounce.

## 2. Tokens

All tokens layer **on top of** Radix Themes. Keep `grayColor="slate"`, set
`radius="small"`, `scaling="95%"`. Do **not** hand-roll a custom `--gray-1..12` ramp —
Radix slate is already OKLCH-grade and APCA-sane, and overriding it breaks the
runtime-accent alpha pairing.

### Color

- **Gray:** `slate` (fixed, no gray picker). Cool near-neutral, harmonizes with the
  cool default accent.
- **Accent:** runtime-selectable (keep the picker), **default `blue`** (was `iris` —
  iris/violet is the #1 AI-slop tell). Applied ONLY to: focus-visible outline
  (`--accent-8`), selected file-row fill (`--accent-a3`), the primary *Valider* button
  (`--accent-9`/`--accent-10`), the brand dot, the resize-handle hover (`--accent-a7`),
  the active toggle segment, the completion mark. **Never** a panel fill or gradient.

Surface / elevation ladder — override the semantic vars, not raw gray steps:

```css
.radix-themes {                    /* DARK (default) */
  --gtg-canvas:  var(--gray-1);    /* window bg, titlebar, footer — recedes  */
  --gtg-sidebar: var(--gray-1);    /* file list pane — same tint, recedes    */
  --gtg-surface: var(--gray-2);    /* diff pane — the BRIGHTEST docked tier   */
  --gtg-raised:  var(--gray-3);    /* hunk header band, sticky elements       */
  --gtg-overlay: var(--color-panel-solid); /* menus, dialogs, command bar     */

  --gtg-hairline:        var(--gray-a4);  /* default seam (~0.06 alpha)        */
  --gtg-hairline-strong: var(--gray-a6);  /* interactive / overlay border      */
  --gtg-divider:         var(--gray-a3);  /* in-list dividers, lower contrast  */
}
```

Key structural move: **sidebar = `gray-1`, diff = `gray-2`.** That one value-step
makes the diff the brightest surface with no shadow and at most one hairline seam
(the resize handle already provides it). Light mode: `--gtg-surface` → `var(--gray-1)`,
`--gtg-sidebar` → `var(--gray-2)`, so the diff still reads brightest.

Text by role: primary `--gray-12` (never pure `#fff`); secondary/dir-prefix
`--gray-a10`; muted/labels `--gray-11`; disabled `--gray-9`; gutter `--gray-a8`.

Semantic diff tints — two-layer (faint line wash + bright fill on changed tokens only):

| Role | Token | Notes |
|---|---|---|
| Add — line wash | `--green-a3` | drop to `a2` if heavy |
| Add — word highlight | `--green-a5` | layered on top of the wash |
| Add — sign / rail | `--green-11` / `--green-9` | quiet, never a color block |
| Delete — line wash | `--red-a3` | |
| Delete — word highlight | `--red-a5` | |
| Delete — sign / rail | `--red-11` / `--red-9` | |
| Hunk header | `--accent-a2` bg + `--accent-a11` text | |

### Typography

- **UI sans:** Geist Variable (OFL, self-hosted via `@fontsource-variable/geist`).
- **Code mono:** Commit Mono (OFL, ligatures off, via `@fontsource/commit-mono`) —
  renders SHAs, paths in the sidebar, and diff bodies. The same mono is the identity
  anchor (lowercase wordmark `gitting`).

```css
.radix-themes {
  --font-sans: 'Geist Variable', system-ui, -apple-system, sans-serif;
  --default-font-family: var(--font-sans);
  --code-font-family: 'Commit Mono', ui-monospace, 'SF Mono', monospace;
  --default-font-feature-settings: 'tnum' 1, 'calt' 1;
}
```

Dense 13px base (`scaling="95%"`). Three weights only — 400 body / 500 labels & buttons
/ 600 titles & wordmark.

| Token | Role | Font | px / lh | Weight | Tracking | Features |
|---|---|---|---|---|---|---|
| wordmark | titlebar `gitting` | Commit Mono | 13 / 1 | 500 | 0 | lowercase, `liga 0` |
| title | welcome / completion | Geist | 15 / 20 | 600 | -0.006em | normal-case |
| subhead | pane headers | Geist | 13 / 18 | 600 | 0 | |
| body | primary labels | Geist | 13 / 18 | 400 | 0 | |
| label | active item / buttons | Geist | 13 / 1 | 500 | 0 | |
| meta | hints, version, counts | Geist | 11 / 16 | 400 | +0.006em | `tnum` |
| filename | sidebar file name | Geist | 13 / 18 | 500 | -0.003em | normal |
| filedir | sidebar dir prefix | Geist | 13 / 18 | 400 | 0 | normal, left-truncated |
| path | diff header path / SHAs | Commit Mono | 12.5 / 18 | 400 | 0 | `tnum`, `liga 0` |
| diff | diff code lines | Commit Mono | 13 / 20 | 400 | 0 | `tnum`, `liga 0` `calt 0` |
| gutter | diff line numbers | Commit Mono | 12 / 20 | 400 | 0 | `tnum`, right-align |

Diff/code cells MUST disable ligatures so `=>`/`!=` render literally and columns stay
stable. **Sidebar file names are navigation chrome, not code → Geist sans** (basename
13/500 `--gray-12`, directory prefix 13/400 `--gray-a10`, **left-truncated** so the
immediate parent survives, with a `--gray-a7` `/` separator). Commit Mono is retained for
the diff body, the gutter, SHAs, and the wordmark only.

> Decision (2026-06-20): sidebar file names are Geist sans for legibility; the diff
> body remains the sole place columnar mono alignment is load-bearing. Sidebar section
> titles use the `subhead` token (13/600), not `title` (15/600) — 15px is oversized for a
> docked pane head.

### Space / radius / border / shadow / z-index

- **Space** (Radix `--space-*`): `4 / 8 / 12 / 16 / 24`, dense; reserve `24+` for
  top-level region padding. File-row block padding `4px` (~28px row).
- **Radius** (`radius="small"` → `2/3/4/6/10/12`): controls/rows/chips `--radius-2/3`;
  panes `--radius-3`; floating overlays `--radius-5`. Never 0, never >12.
- **Border:** one seam per boundary. Default `1px solid var(--gtg-hairline)`; emphasis
  `--gtg-hairline-strong`; in-list `--gtg-divider`. Always alpha gray. No solid
  `--gray-6` borders.
- **Shadow:** banned in docked chrome. One overlay token:
  `0 0 0 1px var(--gtg-hairline-strong), 0 1px 2px rgba(0,0,0,.16), 0 8px 24px rgba(0,0,0,.28)`.
- **Z-index:** content `0`; sticky hunk header `1`; resize handle `2`; window grips
  `50`; overlay `100`; menus `110`; toasts `120`.

### Motion

```css
.radix-themes {
  --dur-hover: 90ms;  --dur-press: 100ms;  --dur-selection: 120ms;
  --dur-disclosure: 160ms; --dur-enter: 200ms; --dur-leave: 150ms;
  --dur-validate: 260ms; --dur-celebrate: 420ms;

  --ease-out: cubic-bezier(0.2, 0, 0, 1);              /* house curve         */
  --ease-out-expo: cubic-bezier(0.19, 1, 0.22, 1);     /* validate fly-out    */
  --ease-in-out: cubic-bezier(0.645, 0.045, 0.355, 1); /* FLIP movement       */
}
```

Animate only `transform`/`opacity`; `will-change` added during the animation and
removed on `transitionend`, never permanent, never inside the virtualized diff.
Global `@media (prefers-reduced-motion: reduce)` neutralizes transforms, keeps hover
bg, swaps the validate slide for an instant color flash.

## 3. Components & screens

- **Titlebar (32px):** brand dot (`--accent-9`, 6px) + lowercase monospace wordmark
  `gitting` + breadcrumb `repo · branch` (meta, `--gray-a10`). Right: accent picker,
  light/dark, updates, window controls (30×24). Fuses to canvas, no border.
- **Footer (24px):** canvas, top hairline. Right version (meta, `tnum`). Left
  **review-progress pill** `N / M relus` + 3px micro-bar (`--accent-a8`)
  filling to the staged ratio — the burn-down at a glance.
- **Welcome:** the one centered moment, but no marketing feel. Monochrome `+ / −`
  brand glyph (~28px, `--gray-12`), wordmark, one muted line, primary *Ouvrir un
  dépôt…*. No card, no illustration, no gradient.
- **Review shell:** drop the outer `border + border-radius` card on `.review-split`.
  Sidebar `gray-1` (recedes), diff `gray-2` (brightest). Seam = the resize handle
  alone. Sidebar default 320px, clamp 240–560. Dissolve the separate toolbar band.
- **Sidebar:** header = an instant **filter** input + the list/tree toggle + the repo
  kebab (no separate file count — the section badges carry it). Sticky section headers gain
  a hairline seam only once stuck (an IntersectionObserver sentinel — scroll-driven CSS is
  banned on WebKitGTK). Sections *À reviewer* (top, the active queue: full-strength title,
  accent count **badge**, non-collapsible) / *Validé* (below, the archive: recessed title
  `--gray-11`, plain count, collapsible & collapsed by default, basename recedes). Titles
  normal-case (never ALL-CAPS). Rows are **condensed ~22px** (VSCode-like): a colored
  **file-type icon** on the left (`@react-symbols/icons`, `file-type-icon.tsx`), the **name
  in Geist sans** (13/500) + muted left-truncated directory, and a trailing cluster of the
  **change magnitude** `+N −N` (`--green-11`/`--red-11`, mono `tnum`, from the gix diffs —
  `lib/diff-stats.ts` + `use-stats-store`) then the **git status letter** (A/M/D/R/T/U/!,
  `status-glyph.tsx`, kind colour). Hover `--gray-a3`, selected `--accent-a3` (no
  left-stripe), keyboard focus a `--accent-8` inset outline (keyboard-only). The validate
  action overlays the trailing cluster on hover/selection/while pending (it fades, no
  layout shift); the **whole row** is a click target (stretched `::after`, the cluster is
  click-through). Tree adds a folder icon next to the chevron. Keyboard: ↑/↓·Home/End
  move + open, Enter validates & advances (the burn-down), Backspace un-validates, `/`
  focuses the filter.

  > Decision (2026-06-20): the sidebar deliberately moved toward a **rich git-client
  > (VSCode/GitButler)** language — colored file-type icons, a single-letter git status, a
  > `+N −N` magnitude, condensed 22px rows. This relaxes, **for the sidebar only**, the
  > "color is a scalpel" / "no single letters" / "custom one-stroke glyph" rules above: the
  > file list is now information-rich on purpose. The diff stays the hero and the rest of the
  > chrome stays sober.

- **Diff (hero):** surface `gray-2`; Shiki `github-dark-dimmed` + `github-light` (token
  colors only, no theme bg). Gutter: two right-aligned number cols + 1px `--gtg-divider`
  separator + quiet sign + content. Two-layer add/delete (faint wash + word highlight on
  changed runs). Sticky hunk headers (`--gtg-raised`, `--accent-a11`). Icon-led
  empty/binary/rename states. Optional: intra-line word diff, collapse-unchanged bands,
  change-density ruler.
- **Completion state:** when *À reviewer* empties, one earned beat — monochrome mark
  completing once, « Tout est relu », the validated count. No confetti, no emoji.

## 4. Anti-slop checklist

**DO:** explicit `slate` / `radius=small` / `scaling=95%` / default accent `blue`;
self-host Geist + Commit Mono; elevate by value-step + 1px alpha hairline (one seam per
boundary); keep line wash faint (`a3`), bright fill (`a5`) for changed tokens only;
optimistic/instant staging; `tnum` on aligned numbers.

**DON'T:** `iris`/`violet`/`purple` as default or `renamed` color; drop shadows on
docked panes; border **and** shadow on one element; colored-left-border cards; oversized
floating rounded cards; gradients/glows/glassmorphism (one command-bar overlay aside);
default untuned Inter; ligatures in the diff; ALL-CAPS section labels; centered hero
inside the working tool; spinners for local git ops; 300ms+ uniform fades; bouncy
springs; re-running a diff algorithm in JS over gix's authoritative hunks (word-highlight
only *within* already-paired lines).

## WebKitGTK caveats (Linux is the lagging floor; WebView2 is fine)

- `backdrop-filter` — feature-detect, degrade to solid `--gtg-overlay`.
- **No View Transitions / `@starting-style` / scroll-driven animations** on Ubuntu LTS
  WebKitGTK — build any move on FLIP + transform/opacity only.
- `grid-template-rows: 0fr↔1fr` transition — verify; fall back to clip/transform.
- `:has()` — usable but not load-bearing; prefer explicit `data-` attributes (the
  codebase already does this).
- `direction: rtl` left-ellipsis for the sidebar directory prefix: keep the basename in a
  separate element and the full path in `title`; verify leading-dot / `@scope` paths render
  acceptably (the neutral `/` can misplace), degrading to the title tooltip.
</content>
</invoke>
