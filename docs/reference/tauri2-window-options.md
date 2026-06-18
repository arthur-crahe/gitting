# Reference — Tauri 2 window & webview options

- **Status:** Reference (living document)
- **Compiled:** 2026-06-18
- **Verified against:** Tauri **2.x** — `@tauri-apps/api` 2.11, config schema `https://schema.tauri.app/config/2`, `docs.rs/tauri` latest, official v2 docs.
- **Scope:** Everything configurable about a Tauri window/webview — where each option lives (config / Rust / JS), its default, and **per-platform support**. Distilled for this app's targets (**Linux + Windows**) but kept general: macOS- and mobile-only rows are retained and clearly tagged so the document is reusable in other projects.

> Why this exists: an exhaustive, fact-checked survey (config `WindowConfig` schema, `WebviewWindowBuilder`/`WindowBuilder`, the JS `window`/`webviewWindow`/`webview` namespaces, the ACL core permissions) was run once. This is the frozen result — consult it instead of re-researching. **How to refresh:** re-read the four sources in §17.

Legend for **Platforms**: **All** = Linux + Windows + macOS (desktop). **Win** / **Linux** / **macOS** = that OS only. Mobile (iOS/Android) is noted only where relevant. `—` = not available on that surface.

---

## 1. The three configuration surfaces

Every option is set at one or more of these. This is the most important mental model.

| Surface | Where | When | ACL-gated? |
|---|---|---|---|
| **Static config** | `tauri.conf.json` → `app.windows[]` (`WindowConfig`) | at creation, on startup | **No** — author-trusted |
| **Rust builder** | `WebviewWindowBuilder` / `WindowBuilder` (+ runtime methods on `Window`/`WebviewWindow`) | at creation or runtime | **No** — Rust is trusted |
| **JS runtime** | `@tauri-apps/api/window` + `webviewWindow` + `webview` | any time after creation | **Yes** — each setter needs a `core:window:allow-*` / `core:webview:allow-*` permission |

**Consequences**
- Config is the **only** place to declare windows that exist before any JS runs, and the only home of a few create-time options (`parent`, `proxyUrl`, `incognito`, `additionalBrowserArgs`, …) that have **no runtime setter**.
- If all window setup happens in **Rust at startup**, you need **no extra window permissions**. You only add `core:window:allow-*` for commands invoked from the **frontend**.
- `core:default` already bundles `core:window:default` + `core:webview:default` (all getters + `internal-toggle-maximize`); it does **not** include the mutating setters.

---

## 2. Pixel model (logical vs physical)

- **Config values are logical pixels.** Actual size = `logical × scaleFactor`.
- **Runtime getters return physical pixels** (`innerSize`, `outerSize`, `innerPosition`, `outerPosition`, `cursorPosition`).
- Convert with `scaleFactor()` or `PhysicalX.toLogical(scaleFactor)`.
- Types: `LogicalSize`/`PhysicalSize`, `LogicalPosition`/`PhysicalPosition`.
- `scaleFactor` is **per-monitor on Windows** (changes when a window moves between mixed-DPI monitors → `onScaleChanged`). Usually `1.0` on X11; fractional under Wayland/GTK.

---

## 3. Geometry & position

| Option | Config | Rust builder | JS runtime | Default | Platforms |
|---|---|---|---|---|---|
| Inner size | `width`, `height` | `inner_size(w, h)` | `setSize(LogicalSize\|PhysicalSize)` | `800` × `600` | All |
| Min size | `minWidth`, `minHeight` | `min_inner_size(w, h)` | `setMinSize(size?)` | none | All |
| Max size | `maxWidth`, `maxHeight` | `max_inner_size(w, h)` | `setMaxSize(size?)` | none | All |
| Position (outer) | `x`, `y` | `position(x, y)` | `setPosition(LogicalPosition\|PhysicalPosition)` | none | All |
| Center | `center` | `center()` | `center()` | `false` | All (desktop) |
| All 4 constraints at once | — | `inner_size_constraints(WindowSizeConstraints)` | `setSizeConstraints(...)` | — | All |
| Clamp to work area at creation | `preventOverflow` (bool or `{width,height}` margin) | `prevent_overflow()` / `prevent_overflow_with_margin(m)` | — | off | desktop |
| Read inner/outer size | — | `inner_size()` / `outer_size()` | `innerSize()` / `outerSize()` → **physical** | — | All |
| Read inner/outer position | — | `inner_position()` / `outer_position()` | `innerPosition()` / `outerPosition()` → **physical** | — | All |
| Set size/position (runtime) | — | `set_size()` / `set_position()` | `setSize()` / `setPosition()` | — | All |
| DPI scale | — | `scale_factor()` | `scaleFactor()` | — | All |
| Monitors | — | `current_monitor()`, `primary_monitor()`, `available_monitors()`, `monitor_from_point()`, `cursor_position()` | same names | — | All |

Notes: Rust pairs min/max as `(w, h)`; `setMinSize()/setMaxSize()` with no arg **clears** the constraint. `center` overrides `x/y`. `preventOverflow` is enforced **only at creation**, not on later resizes. A `Monitor` exposes `name`, `size` (physical), `position` (physical), `scaleFactor`.

---

## 4. State, visibility & behavior

| Option | Config | Rust builder | JS runtime | Default | Platforms |
|---|---|---|---|---|---|
| Visible | `visible` | `visible(bool)` | `show()` / `hide()` / `isVisible()` | `true` | All |
| Initial focus | `focus` | `focused(bool)` | `setFocus()` / `isFocused()` | `true` | All (desktop) |
| Can ever focus | `focusable` | `focusable(bool)` | `setFocusable(bool)` | `true` | All |
| Maximized | `maximized` | `maximized(bool)` | `maximize()` / `unmaximize()` / `toggleMaximize()` / `isMaximized()` | `false` | All (desktop) |
| Minimized | **— (no config key)** | — | `minimize()` / `unminimize()` / `isMinimized()` | — | All (desktop) |
| Fullscreen | `fullscreen` | `fullscreen(bool)` | `setFullscreen(bool)` / `isFullscreen()` | `false` | All (desktop) |
| Simple fullscreen (no new Space) | — | `set_simple_fullscreen()` | `setSimpleFullscreen()` | — | **macOS** |
| Resizable | `resizable` | `resizable(bool)` | `setResizable(bool)` / `isResizable()` | `true` | All |
| Maximize button | `maximizable` | `maximizable(bool)` | `setMaximizable(bool)` / `isMaximizable()` | `true` | **Win + macOS** (Linux no-op) |
| Minimize button | `minimizable` | `minimizable(bool)` | `setMinimizable(bool)` / `isMinimizable()` | `true` | **Win + macOS** (Linux no-op) |
| Close button | `closable` | `closable(bool)` | `setClosable(bool)` / `isClosable()` | `true` | **Win + macOS** (Linux best-effort) |
| Always on top | `alwaysOnTop` | `always_on_top(bool)` | `setAlwaysOnTop(bool)` | `false` | All (desktop) |
| Always on bottom | `alwaysOnBottom` | `always_on_bottom(bool)` | `setAlwaysOnBottom(bool)` | `false` | All (desktop) |
| Skip taskbar | `skipTaskbar` | `skip_taskbar(bool)` | `setSkipTaskbar(bool)` | `false` | **Win + Linux** (macOS no) |
| Content protection (anti-capture) | `contentProtected` | `content_protected(bool)` | `setContentProtected(bool)` | `false` | **Win + macOS** (Linux no-op) |
| Visible on all workspaces | `visibleOnAllWorkspaces` | `visible_on_all_workspaces(bool)` | `setVisibleOnAllWorkspaces(bool)` | `false` | **Linux + macOS** (Win no) |
| Enable/disable input | — | `set_enabled()` / `is_enabled()` | `setEnabled(bool)` / `isEnabled()` | `true` | All (desktop) |
| Flash for attention | — | `request_user_attention(Option<UserAttentionType>)` | `requestUserAttention(type\|null)` | — | **Win + Linux** |
| Taskbar progress | — | `set_progress_bar(ProgressBarState)` | `setProgressBar({status, progress})` | — | **Win + macOS + Linux\*** |
| Taskbar/dock badge count | — | `set_badge_count(Option<i64>)` | `setBadgeCount(n?)` | — | **Linux + macOS** |
| Dock badge label | — | `set_badge_label(Option<String>)` | `setBadgeLabel(s?)` | — | **macOS** |
| Taskbar overlay icon | — | `set_overlay_icon(...)` | `setOverlayIcon(icon?)` | — | **Win** |
| Drop shadow | `shadow` | `shadow(bool)` | `setShadow(bool)` | `true` | **Win + macOS** (Linux no-op) |

Notes: **`minimized` has no config key** — it is runtime-only. `resizable: false` also disables the maximize button cross-platform. `*` Linux progress bar works only on desktops with **libunity** (e.g. GNOME) and is app-wide; `ProgressBarStatus` `paused`/`error` are effectively Windows-only. On Windows an **undecorated** window keeps its shadow even with `shadow:false`, and `shadow:true` adds a 1px border + rounded corners on Win11.

---

## 5. Appearance & decoration

| Option | Config | Rust builder | JS runtime | Default | Platforms |
|---|---|---|---|---|---|
| Native frame | `decorations` | `decorations(bool)` | `setDecorations(bool)` / `isDecorated()` | `true` | All |
| Transparent background | `transparent` | `transparent(bool)` | — (creation only) | `false` | All\* |
| Title | `title` | `title(s)` | `setTitle(s)` / `title()` | `"Tauri App"` | All |
| Forced theme | `theme` | `theme(Option<Theme>)` | `setTheme('light'\|'dark'\|null)` / `theme()` | `null` (system) | All |
| Background color | `backgroundColor` | `background_color(Color)` | `setBackgroundColor(color\|null)` | platform | All\*\* |
| Window icon | — (app icon via `bundle.icon`) | `icon(Image)` | `setIcon(...)` | bundle icon | **Win + Linux** |
| Window effects | `windowEffects` | `effects(WindowEffectsConfig)` (via `EffectsBuilder`) | `setEffects(...)` / `clearEffects()` | none | **Win + macOS** (see §6) |
| Win32 class name | `windowClassname` | `window_classname(s)` | — | Tauri default | **Win** |
| Scrollbar style | — | `scroll_bar_style(ScrollBarStyle)` | — | `Default` | **Win** (WebView2 ≥125) |
| Title bar style | `titleBarStyle` | `title_bar_style(TitleBarStyle)` | `setTitleBarStyle(style)` | `Visible` | **macOS** |
| Hidden title | `hiddenTitle` | `hidden_title(bool)` | — | `false` | **macOS** |
| Traffic-light position | `trafficLightPosition` | `traffic_light_position(impl Into<Position>)` | — | none | **macOS** |
| Native window tabs | `tabbingIdentifier` | `tabbing_identifier(s)` | — | none | **macOS** |

Notes: `*` Transparency on **macOS** requires the `macos-private-api` Cargo feature **and** `app.macOSPrivateApi: true` (and disqualifies App Store); not needed on Win/Linux. The webview CSS background must also be transparent. `**` `backgroundColor`: **Windows ignores the alpha channel** (opaque only); macOS/iOS don't apply it to the webview layer. Use `transparent` + `backgroundColor` to avoid a white flash. Window icon: macOS has **no per-window icon** (uses the bundle/dock icon).

---

## 6. Window effects (blur / mica / acrylic / vibrancy)

`WindowEffectsConfig` = `{ effects: Effect[], state?, radius?, color? }`. Requires a **transparent** window. **First applicable effect in the list wins.** **Unsupported on Linux entirely (no-op).**

| Effect value | Rust / JS | Platform | Notes |
|---|---|---|---|
| `mica`, `micaDark`, `micaLight` | `Effect::Mica…` | **Win 11** | Wallpaper-tinted opaque backdrop |
| `tabbed`, `tabbedDark`, `tabbedLight` | `Effect::Tabbed…` | **Win 11** | Mica-Alt |
| `acrylic` | `Effect::Acrylic` | **Win 10 1809+/11** | Honors `color`; **drag-lag regression** on Win10 1903+/Win11 22000 |
| `blur` | `Effect::Blur` | **Win 7/10/11 ≤22H1** | Honors `color`; perf regression Win11 22621+ |
| `sidebar`, `hudWindow`, `popover`, `menu`, `titlebar`, `selection`, `headerView`, `sheet`, `windowBackground`, `fullScreenUI`, `tooltip`, `contentBackground`, `underWindowBackground`, `underPageBackground` | `Effect::*` (vibrancy) | **macOS** | NSVisualEffectView materials; min macOS 10.10–10.14 by material |
| `appearanceBased`, `light`, `dark`, `mediumLight`, `ultraDark` | `Effect::*` | **macOS** | **Deprecated** since 10.14 — avoid |

Sub-fields: `color` (tint — **Windows** Blur/Acrylic); `state` (`EffectState`: `followsWindowActiveState`/`active`/`inactive`) and `radius` are **macOS-only**.

---

## 7. Webview options

| Option | Config | Rust builder | JS runtime | Default | Platforms |
|---|---|---|---|---|---|
| Content URL | `url` | `WebviewWindowBuilder::new(app, label, WebviewUrl)` (constructor arg) | `new WebviewWindow(label, { url })` | `index.html` | All |
| User agent | `userAgent` | `user_agent(s)` | option | none | All |
| DevTools | `devtools` | `devtools(bool)` | option + `openDevtools()` / `closeDevtools()` | debug on; release needs `devtools` feature | All |
| Incognito | `incognito` | `incognito(bool)` | option | `false` | Win + Linux + macOS |
| OS drag-drop handler | `dragDropEnabled` | **`disable_drag_drop_handler()`** (no-arg!) | option | `true` | All (set **false** for HTML5 DnD on **Windows**) |
| Zoom hotkeys | `zoomHotkeysEnabled` | `zoom_hotkeys_enabled(bool)` | option | `false` | All |
| Set zoom (runtime) | — | `set_zoom(f64)` | `setZoom(n)` | `1.0` | Win + Linux |
| Proxy | `proxyUrl` | `proxy_url(Url)` | option | none | All (macOS needs `macos-proxy` feature, 14+) |
| Extra WebView2 args | `additionalBrowserArgs` | `additional_browser_args(s)` | option | wry default | **Win** |
| Browser extensions | `browserExtensionsEnabled` | `browser_extensions_enabled(bool)` | option | `false` | **Win** |
| Extensions path | — | `extensions_path(p)` | — | — | **Win + Linux** |
| HTTPS custom-protocol scheme | `useHttpsScheme` | `use_https_scheme(bool)` | option | `false` | **Win** (+Android) |
| Webview data dir | — | `data_directory(p)` | — | per-app | **Win** (Linux limited) |
| Init script (main frame) | — | `initialization_script(s)` | — | — | Win + Linux |
| Init script (all frames) | — | `initialization_script_for_all_frames(s)` | — | — | Win + Linux |
| Clipboard access | — | `enable_clipboard_access()` | — | off (Win/Linux); on (macOS) | Win + Linux |
| Disable JS | `javascriptDisabled` | `disable_javascript()` (no-arg) | option | `false` | All |
| General autofill | — | `general_autofill_enabled(bool)` | — | `true` | **Win** |
| Clear browsing data | — | `clear_all_browsing_data()` | `clearAllBrowsingData()` | — | Win + Linux |
| Print | — | `print()` | `print()` | — | All |
| Navigation guard | — | `on_navigation(Fn(&Url)->bool)` | — | — | Win + Linux |
| New-window guard | — | `on_new_window(...)` / `window_features(...)` | — | — | Win + Linux |
| Download / page-load / title / resource hooks | — | `on_download`, `on_page_load`, `on_document_title_changed`, `on_web_resource_request` | — | — | Win + Linux |
| **macOS/mobile-only webview opts** | `acceptFirstMouse`, `dataStoreIdentifier`, `backgroundThrottling`, `allowLinkPreview` | matching builders | options | — | **macOS** (no-op on Win/Linux) |

**Multi-webview** (a window hosting several webviews): `Window::add_child(builder, position, size)`, `auto_resize()`, `reparent(window)` / JS `Webview.reparent()`. `Webview` position/size getters/setters exist at runtime.

---

## 8. Events & lifecycle

Rust: one entry point `on_window_event(|e| match e { … })` (builder + runtime). JS: per-event `onX` helpers on a `Window`/`WebviewWindow`, or raw `listen(name)`.

| Rust `WindowEvent::` | JS helper | Native name | Cancellable |
|---|---|---|---|
| `CloseRequested { api }` | `onCloseRequested(cb)` | `tauri://close-requested` | **Yes** (`api.prevent_close()` / `event.preventDefault()`) |
| `Resized(PhysicalSize)` | `onResized(cb)` | `tauri://resize` | — |
| `Moved(PhysicalPosition)` | `onMoved(cb)` | `tauri://move` | — |
| `Focused(bool)` | `onFocusChanged(cb)` | `tauri://focus` / `blur` | — |
| `ScaleFactorChanged{…}` | `onScaleChanged(cb)` | `tauri://scale-change` | — |
| `ThemeChanged(Theme)` | `onThemeChanged(cb)` | `tauri://theme-changed` | — |
| `DragDrop(DragDropEvent)` | `onDragDropEvent(cb)` | `tauri://drag-enter`/`-over`/`-drop`/`-leave` | — |
| `Destroyed` | (raw `listen`) | `tauri://destroyed` | No |

**Lifecycle methods** (JS + Rust): `close()` (runs cancellable flow), `destroy()` (force, no veto), `show()`/`hide()`, `setFocus()`. **Runtime creation** (`new WebviewWindow(label, opts)`) returns immediately → listen for `tauri://created` / `tauri://error`. Other built-ins: `WINDOW_CREATED`, `WEBVIEW_CREATED`, `WINDOW_SUSPENDED`/`RESUMED`.

> **Windows pitfall:** never build a window inside a **synchronous** command/event handler (WebView2 deadlock, wry #583). Use an `async` command or `run_on_main_thread`.

---

## 9. Multi-window, parenting & menu

| Concept | Config | Rust | JS | Platforms |
|---|---|---|---|---|
| Label (identity) | `label` (default `"main"`) | constructor arg; `app.get_webview_window(label)` | `new WebviewWindow(label)`, `WebviewWindow.getByLabel(label)`, `getCurrentWindow()`, `getAllWindows()`, `getFocusedWindow()` | All |
| Parent / owner | `parent` (label) | `parent(&win) -> Result` | constructor option (**creation only**) | All (per-OS semantics) |
| GTK transient parent | — | `transient_for(&win)` / `transient_for_raw(...)` | — | **Linux** |
| Auto-create at startup | `create` (default `true`) | — (`from_config` to defer) | — | All |
| Event scoping | — | `emit` / `emit_to` / `emit_filter`; `listen`/`once`/`unlisten` | `emit` / `emitTo(target, …)`; instance `listen` | All |
| `EventTarget` | — | `Any \| AnyLabel \| App \| Window \| Webview \| WebviewWindow` | same | All |
| Window menu | — | `menu(Menu)` builder; `on_menu_event(f)`; runtime `show_menu`/`hide_menu`/`is_menu_visible`/`remove_menu`/`popup_menu` | `setMenu`/`menu`/`removeMenu` | desktop (Win/Linux: per-window bar; macOS: global bar) |

`parent` semantics differ: **Windows** = owner (owned window stays above, hidden when owner minimizes, destroyed with owner); **Linux** = transient-for; **macOS** = child window. **No `setParent()` at runtime — parent is creation-only.** Labels allow `a-zA-Z0-9` and `- / : _ .`; a duplicate label fails; immutable.

---

## 10. Custom titlebar & resize (frameless)

When `decorations: false`, the native frame, move and resize are gone — re-add them:

- **Move:** put `data-tauri-drag-region` on the bar/handle element (double-click on it = maximize, via `internal-toggle-maximize`). Interactive children (buttons) must **not** carry the attribute; make non-interactive children `pointer-events: none` so the handle stays the event target. Imperative alternative: `startDragging()`.
- **Resize:** `startResizeDragging(ResizeDirection)` from 8 invisible edge/corner grips (`North`…`SouthWest`). Essential on Windows/Linux (no native resize border).
- **Permissions** needed from the frontend: `core:window:allow-start-dragging`, `allow-start-resize-dragging`, plus whichever of `allow-minimize` / `allow-toggle-maximize` / `allow-close` / `allow-show` the custom controls call. Getters + `internal-toggle-maximize` are already in `core:window:default`.

See §16 for the full recipe.

---

## 11. Cursor (runtime methods, JS + Rust)

| Method | Rust | JS | Permission |
|---|---|---|---|
| Confine cursor | `set_cursor_grab(bool)` | `setCursorGrab(bool)` | `allow-set-cursor-grab` |
| Show/hide cursor | `set_cursor_visible(bool)` | `setCursorVisible(bool)` | `allow-set-cursor-visible` |
| Cursor icon | `set_cursor_icon(CursorIcon)` | `setCursorIcon(icon)` | `allow-set-cursor-icon` |
| Move cursor | `set_cursor_position(Position)` | `setCursorPosition(pos)` | `allow-set-cursor-position` |
| Click-through | `set_ignore_cursor_events(bool)` | `setIgnoreCursorEvents(bool)` | `allow-set-ignore-cursor-events` |

`CursorIcon` enum: `default`, `pointer`, `crosshair`, `text`, `move`, `grab`, `grabbing`, `notAllowed`, `wait`, `help`, resize variants, etc.

---

## 12. Permissions & capabilities (ACL)

Capability files live in `src-tauri/capabilities/*.json`, auto-collected at build (`generate_context!`). Shape:

```jsonc
{
  "identifier": "default",
  "windows": ["main", "editor-*"],   // glob match on window label
  "webviews": ["..."],               // optional, per-webview
  "permissions": ["core:default", "core:window:allow-set-title", /* … */],
  "platforms": ["linux", "windows"], // optional: restrict to OSes
  "local": true,                      // applies to bundled app URLs (default)
  "remote": { "urls": ["https://*.example.com"] } // optional, security-sensitive
}
```

- **Naming:** `${plugin}:${permission}`. Built-ins are `core:*` → `core:window:*`, `core:webview:*`. `<plugin>:default` = a default set; `allow-*`/`deny-*` = a single command gate.
- **Resolution:** default-deny (no `allow-*` ⇒ blocked); **`deny-*` always wins** over any `allow-*`.
- **Targeting is by window label** — a window whose label matches no capability gets zero command access.
- Use `platforms` to scope OS-specific perms (e.g. `set-overlay-icon` on Windows) without leaking elsewhere.

Common window setters and their permission: `allow-set-title`, `allow-set-decorations`, `allow-set-resizable`, `allow-set-size`, `allow-set-position`, `allow-set-fullscreen`, `allow-set-focus`, `allow-set-always-on-top`, `allow-set-skip-taskbar`, `allow-set-content-protected`, `allow-set-effects`, `allow-set-theme`, `allow-set-icon`, `allow-set-progress-bar`, `allow-minimize`, `allow-maximize`/`allow-unmaximize`/`allow-toggle-maximize`, `allow-close`/`allow-destroy`, `allow-show`/`allow-hide`, `allow-start-dragging`, `allow-start-resize-dragging`, `allow-request-user-attention`, `allow-set-cursor-*`, `allow-set-badge-count`/`-label`, `allow-set-overlay-icon`. Webview: `core:webview:allow-create-webview-window`, `-set-webview-zoom`, `-print`, `-reparent`, `-clear-all-browsing-data`, `-set-webview-background-color`, `-internal-toggle-devtools`, …

---

## 13. Platform cheat-sheet — the **non-portable** bits

Cross-platform unless listed here. Most valuable at-a-glance section.

**Windows-only:** window effects (`mica`/`acrylic`/`blur`), `additionalBrowserArgs`, `browserExtensionsEnabled`, `useHttpsScheme`, `windowClassname`, `scrollBarStyle`, `general_autofill_enabled`, `data_directory`, `setOverlayIcon`. `set-progress-bar` `paused`/`error` states.

**Linux quirks / unsupported:** **window effects = no-op**, **`shadow` = no-op**, `maximizable`/`minimizable` = no-op, `closable` = best-effort, `contentProtected` = no-op, progress bar only with **libunity** (GNOME) and app-wide. Escape hatches: `transient_for`, `gtk_window()`, `default_vbox()`.

**Linux + Windows (not macOS):** `skipTaskbar`.

**Linux + macOS (not Windows):** `visibleOnAllWorkspaces`, `setBadgeCount`.

**macOS-only (no effect on Linux/Windows):** `titleBarStyle`, `hiddenTitle`, `trafficLightPosition`, `tabbingIdentifier`, `acceptFirstMouse`, `allowLinkPreview`, `dataStoreIdentifier`, `backgroundThrottling`, `setSimpleFullscreen`, `setBadgeLabel`, `app.macOSPrivateApi`, vibrancy materials + effect `state`/`radius`. Window icon is a no-op (uses bundle icon). `transparent` needs the private-API feature.

**Mobile-only config:** `disableInputAccessoryView` (iOS), `activityName` / `createdByActivityName` (Android), `requestedBySceneIdentifier` (iOS).

---

## 14. Verified pitfalls (don't trust the obvious)

These were **wrong in the first-pass survey and corrected against source** — the highest-value gotchas:

1. **`minimized` is NOT a `WindowConfig` key.** Only runtime `minimize()`/`unminimize()`/`isMinimized()` exist. (Only `minimizable` is a config key.)
2. **Drag-drop Rust builder is `disable_drag_drop_handler()` — no boolean.** There is no `drag_and_drop(bool)`. Config key `dragDropEnabled` (default `true`) and the JS option are correct; calling the Rust method disables the OS handler (needed for HTML5 DnD on Windows).
3. **`parent` is creation-only — there is no `setParent()` runtime method** in the JS API.
4. **`extensionsPath` is Windows _and_ Linux** (Win: unpacked Chrome ext; Linux: compiled `.so`), not Windows-only.
5. **`proxyUrl` is all platforms** (macOS feature-gated via `macos-proxy`, 14+), not just Win+Linux.
6. **`set-progress-bar` is Win + macOS + Linux** (macOS = dock); only iOS/Android are unsupported.
7. **`traffic_light_position` takes the generic `Position`** (`impl Into<Position>`), and is macOS-only anyway.

---

## 15. Enums & value types (quick index)

- **`Theme`**: `light` | `dark` (config also `null`/auto).
- **`TitleBarStyle`** (macOS): `Visible` | `Transparent` | `Overlay`.
- **`Effect`** / **`EffectState`**: see §6.
- **`ResizeDirection`**: `East`|`North`|`NorthEast`|`NorthWest`|`South`|`SouthEast`|`SouthWest`|`West`.
- **`CursorIcon`**: see §11.
- **`ProgressBarStatus`**: `none`|`normal`|`indeterminate`|`paused`|`error`. **`ProgressBarState`** = `{ status?, progress? 0–100 }`.
- **`UserAttentionType`**: `Critical` (1) | `Informational` (2).
- **`ScrollBarStyle`** (Win): `Default` | `FluentOverlay`.
- **`BackgroundThrottlingPolicy`** (macOS): `disabled` | `suspend` | `throttle`.
- **`WebviewUrl`**: `App(path)` | `External(url)` | `CustomProtocol(url)`.
- **`Color`**: `"#RGB"`/`"#RRGGBB"`/`"#RRGGBBAA"` or `[r,g,b,a]` / `{r,g,b,a}`.

---

## 16. Recipes

### A. Frameless, fully-integrated window (the modern "app is the window" look)

```jsonc
// tauri.conf.json → app.windows[0]
{
  "label": "main", "title": "App",
  "width": 1200, "height": 800, "minWidth": 720, "minHeight": 480,
  "center": true,
  "decorations": false,      // custom titlebar
  "transparent": false,      // opaque = robust on Linux (no shadow) + Windows
  "shadow": true,            // Win11: rounded corners + shadow; Linux: ignored
  "visible": false,          // reveal after first paint (see B)
  "backgroundColor": "#111113" // match your dark theme → no white flash
}
```

```jsonc
// capabilities/<file>.json → permissions (frontend window control)
"core:window:allow-start-dragging",
"core:window:allow-start-resize-dragging",
"core:window:allow-minimize",
"core:window:allow-toggle-maximize",
"core:window:allow-close",
"core:window:allow-show"
```

- Titlebar element: `data-tauri-drag-region` on the bar + non-interactive children `pointer-events:none`; controls (min/max/close) in a separate non-drag cluster on the **right** (Win/Linux convention).
- 8 invisible resize grips calling `getCurrentWindow().startResizeDragging('North'|…)`.
- Seamless look: no border under the bar, same background as content.

### B. Flash-free launch
`visible:false` in config → call `getCurrentWindow().show()` in a root `useEffect` (runs after first commit/paint). `backgroundColor` covers the gap before paint. Guard all window calls with an `isTauriRuntime()` check so they no-op in a plain browser (`pnpm dev`).

### C. Translucent backdrop
Windows: `transparent:true` + `windowEffects:{ effects:["mica"] }` (Win11) or `["acrylic"]`. **Provide an opaque fallback for Linux** (no effects). macOS: vibrancy material + `macos-private-api`.

### D. Cancel close (unsaved work)
`onCloseRequested((e)=>{ if (dirty) e.preventDefault() })` (JS) or `api.prevent_close()` in `on_window_event` (Rust). `destroy()` bypasses it.

### This project's choice (Gitting, Linux + Windows)
Frameless + opaque + `shadow:true` + anti-flash, custom seamless VSCode-style action bar (left identity/breadcrumb + center drag + right actions + window controls). Implementation: `src/app/titlebar.tsx`, `window-controls.tsx`, `window-resizers.tsx`, bindings in `src/lib/window.ts`, styles in `src/styles/global.css`.

---

## 17. Sources & how to refresh

1. **Config (`WindowConfig`) schema** — <https://schema.tauri.app/config/2> and <https://v2.tauri.app/reference/config/>
2. **Rust builders** — `docs.rs/tauri`: `webview/struct.WebviewWindowBuilder`, `window/struct.WindowBuilder`, `window/struct.Window`, `window/enum.Effect`, `tauri-utils/config/struct.WindowConfig`, `tauri-runtime/window/enum.WindowEvent`
3. **JS API** — <https://v2.tauri.app/reference/javascript/api/> namespaces `window`, `webviewWindow`, `webview`, `event`
4. **Permissions / ACL** — <https://v2.tauri.app/reference/acl/core-permissions/>, `…/security/capabilities/`, `…/security/permissions/`

When bumping Tauri, re-verify §4–§7 platform columns and §14 pitfalls against these; defaults and platform notes drift between minors.
