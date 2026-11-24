# Patch backend

Status: **implemented in v0.14.0 for user-writable copies and root-owned installs with explicit elevation**. It is optional; the launcher remains the default.

## Why it is optional

TradingView Desktop on Linux is commonly installed as:

- an AUR/repackaged Snap under `/usr/lib/tradingview` (root-owned), or
- the official Snap (read-only mount), or
- a tarball under `/opt/TradingView` (root-owned).

The AUR package is replaced on every package update. The official Snap cannot be modified at all. Patching therefore needs write access, is wiped by updates, and must be repaired. The launcher avoids all three problems.

Root-owned installs are supported with explicit, minimal elevation:

```sh
tvmod patch --system --yes
```

The patch is built and backed up as the user. Only the final `app.asar` replacement runs through `sudo`/`pkexec` on Linux, the administrator prompt on macOS, or UAC on Windows; state and backups stay in the user's data directory. The app must be closed, or run with `--restart`.

Linux is the tested patch platform. macOS and legacy Windows standalone patches are experimental. Snap and Microsoft Store MSIX installs cannot be patched.

The one-command user-owned copy remains the safer default for root-owned installations:

```sh
tvmod install --copy --patch --yes
```

The manual equivalent:

```sh
# Linux example
cp -a /usr/lib/tradingview ~/.local/opt/tradingview
tvmod install --app ~/.local/opt/tradingview/tradingview
tvmod patch --yes
```

## Mechanism

1. Locate `resources/app.asar`.
2. Back it up to `<platform data dir>/backups/app-<version>-<hash>.asar` and verify the hash.
3. Extract the ASAR with `@electron/asar`.
4. Append the built preload bundle to `preload/target-tvd-host-preload.js`, wrapped in an IIFE and marked with `TVMOD_PRELOAD_START` / `TVMOD_PRELOAD_END`.
5. Repack with `unpack: '**/*.node'` and verify:
   - `package.json` still parses and the version is unchanged;
   - the marker is present;
   - generated native modules exist in the installed `app.asar.unpacked`.
6. Replace `app.asar` atomically after a write-permission check.
7. Record `{ appVersion, originalHash, patchedHash, backupPath, patchedAt }` in the platform config's `state.json`.

The preload is embedded rather than `require()`d from a second file because the host preload runs sandboxed and cannot load arbitrary relative files.

## Repair and uninstall

- `tvmod repair --yes`: if the current ASAR hash no longer matches `patchedHash`, the app updated; back up the current ASAR and re-apply the patch. Add `--system` for a root-owned install.
- `tvmod unpatch --yes`: restore the backup only if the current ASAR still matches `patchedHash`. If the app updated and no patch is detected, clear the stale state. If the file changed but still contains the marker, refuse and ask for a reinstall. Add `--system` for a root-owned install.
- Patch/repair/unpatch require `--yes` and stop the target install first (`--restart` is explicit).
- `--system` replaces a user-owned target with a root-owned `app.asar` via sudo/pkexec, macOS elevation, or UAC. The backup and state remain user-owned.

Local plugins are embedded into the installed preload. If you add, remove, or refresh plugins after patching, run `tvmod repair --yes` so the patched ASAR receives the new preload snapshot.

## Test plan

- Synthetic ASAR fixture: patch, verify, install, restore, verify byte-identical. This runs in CI.
- Elevated replacement is tested with a fake `sudo` shim against a synthetic ASAR; the real sudo/pkexec prompt is user-driven.
- Copy of the real 3.5.0 app: patch, launch, verify `window.__TVMOD_ACTIVE__`, panel, and promo filters; then unpatch and verify the original hash. This was validated manually on 3.5.0.
- Repair across a simulated update: restore the original ASAR, run `repair`, verify the new patched hash.
- Permission-denied and Snap paths are refused.

## Limitations and future work


- The patch is lost when a package manager replaces the app; `tvmod repair --yes` is required.
- macOS is not supported; modifying a signed app bundle can invalidate its signature.
- Official Snap installs are read-only.
- A broken patch can prevent the app from starting; backups and `tvmod unpatch` are mandatory.
