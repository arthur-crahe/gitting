# ADR 0002 — Update & distribution strategy

- **Status:** Accepted
- **Date:** 2026-06-18
- **Deciders:** project owner
- **Scope:** how installed copies of Gitting receive new versions, and the operational rules that keep that channel alive.

## Context

Gitting ships as GitHub Release assets built by a `tauri-action` matrix (`ubuntu-22.04` → `.deb`/`.rpm`/`.AppImage`; `windows-latest` → NSIS `.exe` + MSI), cut by the `/release` command on `app-v*` tags. Until now there was **no in-app update mechanism**: moving from one version to the next meant manually re-downloading and reinstalling.

We want a professional, fully-local, no-backend, no-account app to update itself. Tauri 2 ships an official updater plugin that works against a static manifest hosted on GitHub Releases — no server required. (Research and fact-checking summarized in the team notes; key sources below.)

## Decision drivers

- **No backend.** The update endpoint must be static infrastructure we already have (GitHub Releases).
- **Big jumps must work.** A user on v1 may jump straight to v6 — the mechanism must deliver that in one step, and our local-state migrations must tolerate skipped versions.
- **Trust.** Updates must be cryptographically verified; the signing key is a permanent, irreplaceable asset.
- **Radix-/desktop-native UX.** The update prompt is part of the app, sober and opt-in.
- **Linux + Windows only**, professional distribution.

## Decision

Adopt the **Tauri 2 updater plugin** with a **static `latest.json` served from GitHub Releases**, signed with a **minisign keypair we control**.

### Endpoint & manifest
- Endpoint baked into the app: `https://github.com/arthur-crahe/gitting/releases/latest/download/latest.json` (the `latest/download` permalink always resolves to the newest **published, non-prerelease** Release).
- `tauri-action` generates and uploads `latest.json` + the per-artifact `.sig` files (`uploadUpdaterJson`/`uploadUpdaterSignatures`, default on). `bundle.createUpdaterArtifacts: true` is enabled.
- The existing **draft → review → publish** flow is the release gate: clients see an update only once the draft is published.

### Update channels per OS
- **Linux:** the **AppImage** is the updatable channel (in-place binary swap, no privileges). `.deb`/`.rpm` remain install-only convenience downloads; those users update via their package manager. (Newer plugin versions can update `.deb`/`.rpm` too, but they need elevation and a matching served artifact — the AppImage is the clean default.)
- **Windows:** **NSIS** is the updater channel (`updaterJsonPreferNsis: true`). MSI is kept only for enterprise/GPO deployment. The app is force-exited by the installer on update, then relaunched. `windows.installMode: "passive"`.

### Signing & keys (the load-bearing operational fact)
- One **minisign/Ed25519 keypair**, password-protected. Public key in `tauri.conf.json` (`plugins.updater.pubkey`); private key + password are GitHub Actions secrets `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, injected only in the release job.
- This is **separate from OS code-signing** (Windows Authenticode). The updater works unsigned-by-the-OS; absent an EV cert, Windows shows a one-time SmartScreen "unknown publisher" prompt. OS code-signing is an optional, independent layer.
- The pubkey and the endpoint URL are a **permanent contract** with every shipped binary.

### Client behaviour
- One check on app launch (`src/lib/updater.ts` → `src/stores/use-update-store.ts` → `src/components/update-notice.tsx`), **opt-in** install + relaunch. Inert outside the Tauri WebView (`pnpm dev` in a plain browser).
- Rust side registers `tauri-plugin-updater` (desktop-gated) and `tauri-plugin-process`; capability grants `updater:default` + `process:allow-restart`.

### Cross-version jumps & local state
- The updater compares SemVer and **jumps straight to the advertised version in one full-bundle install — no sequential stepping, no delta/patch**. So nothing in vN may assume v(N−1) ran.
- Therefore local-state migrations (when persistence is introduced) must key off an **internal monotonic `schema_version`** stored inside the data — decoupled from the app version — and run as a **cumulative, idempotent, crash-safe** chain (backup → transform → bump version atomically), with an upper-bound guard against newer-than-known schemas.
- **Deferred:** the app persists no state yet, so the migration engine is **not** built now (it would be dead code). It is introduced together with the first persisted store; this ADR fixes the pattern.

## Consequences

**Positive**
- Self-updating on Linux + Windows with zero backend; CI owns manifest + signatures.
- Big jumps (v1→v6) deliver in one signed download.
- Verified, tamper-evident updates.

**Negative / risks**
- The signing private key is irreplaceable: **lose it and every installed client is permanently stranded** (manual reinstall only). Mitigated by off-site, multi-store backups.
- Endpoint/pubkey immutability: the repo must stay **public** and never be renamed.
- Key rotation needs a **3-version bridge** (ship a transition version *signed with the old key* that carries the new pubkey) because Tauri trusts a single pubkey at a time.
- A version shipped **without** the updater can never auto-update — the channel only begins working from the first updater-enabled release.

## Operational runbook

- **Backups:** private key + password in two independent durable stores. More important than source — source is reproducible, the key is not.
- **Secrets:** `TAURI_SIGNING_PRIVATE_KEY` (key file content), `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
- **Never:** rename/make-private the repo; change the endpoint string in a way old clients can't reach; rotate the key without the bridge.
- **Test before trusting a release:** after an `app-v*` build, confirm the draft Release carries the AppImage `.tar.gz` + `.sig`, NSIS `setup.exe` + `.sig`, and `latest.json`; test the live endpoint with `curl -L`.

## What a user does to go from v5 to v6

Essentially nothing. On launch (from the first updater-enabled release onward) the app checks `latest.json`, sees v6, and shows a notice with the changelog. The user clicks **Mettre à jour et redémarrer**: the signed v6 bundle is downloaded, verified against the embedded pubkey, installed, and the app relaunches.
- **Windows (NSIS):** a brief passive installer runs; the app is exited and relaunched (a SmartScreen prompt may appear if unsigned by the OS).
- **Linux (AppImage):** the running binary is swapped in place and relaunched, no privileges.
- **Linux `.deb`/`.rpm` installs:** update through the system package manager instead.
- No manual re-download. The jump is direct (no v5.x stepping); any local data is migrated on first launch of v6.

## References

- Tauri 2 updater: <https://v2.tauri.app/plugin/updater/>
- tauri-action (manifest + signatures): <https://github.com/tauri-apps/tauri-action>
- Key rotation discussion: <https://github.com/tauri-apps/tauri/issues/7585>
- envPrefix key-leak advisory: <https://github.com/tauri-apps/tauri/security/advisories/GHSA-2rcp-jvr4-r259>
- Windows signing / SmartScreen: <https://v2.tauri.app/distribute/sign/windows/>
- Store plugin (no built-in migrations) / SQL plugin (ordered migrations): <https://v2.tauri.app/plugin/store/>, <https://v2.tauri.app/plugin/sql/>
