# Snap support

Status: **Snap-aware, awaiting validation on a confined snapd host**. TVMod currently detects the official Snap launcher, uses `snap run`, and places the preload in a path the confined app can read. Strict AppArmor behavior and inspector binding have not been validated in this development environment because snapd is not installed.

## How Snap is handled

- Detection: `/snap/bin/tradingview`
- Launch command: `snap run tradingview --inspect=127.0.0.1:0`
- app.asar: `/snap/tradingview/current/resources/app.asar` (when present)
- Preload: `~/snap/tradingview/common/tvmod/preload.js`
- Patch mode: **not supported**; the Snap mount is read-only.
- Plugins: embedded into the Snap preload like the normal launcher.

The normal preload path `~/.local/share/tvmod/preload.js` is not used for Snap installs because a strictly confined app may not be able to read hidden directories in the home tree.

## Probe

On a machine with snapd:

```sh
sudo snap install tradingview
git clone https://github.com/HalloTheEngineer/TVMod.git
cd TVMod
npm ci
npm run build
./tools/snap/probe.sh
```

Or with an installed release:

```sh
tvmod install
tvmod doctor
tvmod launch --user-data-dir /tmp/tvmod-snap-probe --verbose
```

Expected:

- `tvmod doctor` reports the Snap flavor and the Snap preload path.
- `tvmod launch` reports an inspector URL, a spawned PID, `preload active`, and **Settings → TVMod** appears in the desktop Settings window.
- `~/.local/state/tvmod/logs/launch.log` contains `Debugger listening on ws://...`.

## Failure modes to report

1. **No `Debugger listening` line**
   - The Snap confinement/AppArmor policy may block the local inspector socket or the `--inspect` argument may not pass through `snap run`.

2. **`preload confirmed` never appears**
   - The app may not be allowed to read `~/snap/tradingview/common/tvmod/preload.js`, or the Snap in-use revision has a different layout.

3. **Preload confirmed but no TVMod settings tab**
   - `target-tvd-host-preload.js` may not be loading in the chart or dialog frame, or the supported-page scope rejected the URL.

4. **A second instance exits immediately**
   - Snap/TradingView single-instance locking may cross profiles; close the normal app before probing.

Attach `~/.local/state/tvmod/logs/launch.log`, `tvmod doctor`, `snap list tradingview`, and the app version when reporting.

## Why patch mode is not supported

The official Snap is a read-only squashfs. TVMod can inject through the launcher path but cannot replace `app.asar` inside the mount. Use the launcher backend for Snap installs.
