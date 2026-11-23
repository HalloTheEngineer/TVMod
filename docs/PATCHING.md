# Patch backend

Status: **implemented in v0.4.0 for user-writable installs/copies**. It is optional; the launcher remains the default and the only mode tested against the root-owned AUR install.

## Why it is optional

TradingView Desktop on Linux is commonly installed as:

- an AUR/repackaged Snap under `/usr/lib/tradingview` (root-owned), or
- the official Snap (read-only mount), or
- a tarball under `/opt/TradingView` (root-owned).

The AUR package is replaced on every package update. The official Snap cannot be modified at all. Patching therefore needs write access, is wiped by updates, and must be repaired. The launcher avoids all three problems.

v0.4.0 deliberately refuses root-owned installs instead of silently elevating. The one-command path copies the app into a user-owned directory and patches it:

```sh
tvmod install --copy --patch --yes
```

The manual equivalent:

```sh
cp -a /usr/lib/tradingview ~/.local/opt/tradingview
tvmod install --app ~/.local/opt/tradingview/tradingview
tvmod patch --yes
```

## Mechanism

1. Locate `resources/app.asar`.
2. Back it up to `~/.local/share/tvmod/backups/app-<version>-<hash>.asar` and verify the hash.
3. Extract the ASAR with `@electron/asar`.
4. Append the built preload bundle to `preload/target-tvd-host-preload.js`, wrapped in an IIFE and marked with `TVMOD_PRELOAD_START` / `TVMOD_PRELOAD_END`.
5. Repack with `unpack: '**/*.node'` and verify:
   - `package.json` still parses and the version is unchanged;
   - the marker is present;
   - generated native modules exist in the installed `app.asar.unpacked`.
6. Replace `app.asar` atomically after a write-permission check.
7. Record `{ appVersion, originalHash, patchedHash, backupPath, patchedAt }` in `~/.config/tvmod/state.json`.

The preload is embedded rather than `require()`d from a second file because the host preload runs sandboxed and cannot load arbitrary relative files.

## Repair and uninstall

- `tvmod repair --yes`: if the current ASAR hash no longer matches `patchedHash`, the app updated; back up the current ASAR and re-apply the patch.
- `tvmod unpatch --yes`: restore the backup only if the current ASAR still matches `patchedHash`. If the app updated and no patch is detected, clear the stale state. If the file changed but still contains the marker, refuse and ask for a reinstall.
- Patch/repair/unpatch require `--yes` and stop the target install first (`--restart` is explicit).

Local plugins are embedded into the installed preload. If you add, remove, or refresh plugins after patching, run `tvmod repair --yes` so the patched ASAR receives the new preload snapshot.

## Test plan

- Synthetic ASAR fixture: patch, verify, install, restore, verify byte-identical. This runs in CI.
- Copy of the real 3.5.0 app: patch, launch, verify `window.__TVMOD_ACTIVE__`, panel, and promo filters; then unpatch and verify the original hash. This was validated manually on 3.5.0.
- Repair across a simulated update: restore the original ASAR, run `repair`, verify the new patched hash.
- Permission-denied and Snap paths are refused.

## Limitations and future work

- Root-owned `/usr/lib` installs are refused in v0.4.0. A future release can offer explicit `sudo`/`pkexec` elevation with ownership-safe path handling.
- The patch is lost when a package manager replaces the app; `tvmod repair --yes` is required.
- macOS is not supported; modifying a signed app bundle can invalidate its signature.
- Official Snap installs are read-only.
- A broken patch can prevent the app from starting; backups and `tvmod unpatch` are mandatory.
