# Patch backend design (planned)

Status: **not implemented in v0.1.0**. The launcher backend is the default and tested path. The patch backend is for users who explicitly want the official icon to run a modified `app.asar`, similar to how Vencord patches Discord.

## Why it is optional

TradingView Desktop on Linux is commonly installed as:

- an AUR/repackaged Snap under `/usr/lib/tradingview` (root-owned), or
- the official Snap (read-only mount), or
- a tarball under `/opt/TradingView` (root-owned).

The AUR package is replaced on every package update. The official Snap cannot be modified at all. Patching therefore requires root, is wiped by updates, and must be repaired. The launcher avoids all three problems.

## Planned patch point

1. Locate `resources/app.asar`.
2. Back it up to `~/.local/share/tvmod/backups/`.
3. Add `preload/tvmod-preload.js` to the ASAR.
4. Prepend a require to the existing host preload:

   ```js
   require('./tvmod-preload.js');
   ```

   The file name (`preload/target-tvd-host-preload.js`) should be discovered from the ASAR rather than hard-coded. A fallback is to change `package.json` `"main"` to a wrapper that patches `Session.prototype.setPreloads` before `require('./index.js')`.

5. Write the modified ASAR atomically, preserving permissions and unpacked native modules.
6. Record `{ appVersion, originalHash, patchedHash, backupPath }` in `~/.config/tvmod/state.json`.

## Repair and uninstall

- `tvmod repair`: if the current ASAR hash no longer matches `patchedHash`, the app updated; reapply the patch to the new ASAR after a compatibility check.
- `tvmod unpatch`: restore the backup only if the current ASAR still matches `patchedHash`. Otherwise offer to reinstall the app rather than clobbering a newer version.
- Never silently elevate. `tvmod patch` must show the target path and ask before using `pkexec`/`sudo`.
- Snap installs are rejected with an explanation: the snap mount is read-only.

## Test plan

- Synthetic ASAR fixtures for read/write/offset behavior.
- Patch a copy of the real `app.asar`; verify `unpatch` is byte-identical.
- Launch the patched copy in a disposable profile and assert the panel appears.
- Test repair across two synthetic versions.
- Test permission-denied, read-only, and Snap paths.

## Risks

- ASAR layout changes between desktop releases.
- macOS app signature invalidation (not in Linux v1).
- Package-manager updates overwrite the patch.
- A broken patch can prevent the app from starting; backups and a `tvmod repair` path are mandatory.
