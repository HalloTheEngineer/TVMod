# Platform support

TVMod is developed and tested on Linux. macOS and Windows builds are experimental. The Microsoft Store Windows build is detected but not supported.

| Platform | Package | Status | Launcher | Patch |
| --- | --- | --- | --- | --- |
| Linux x64 | AUR, tarball | Tested | Yes | Yes |
| Linux arm64 | tarball | Built, untested | Expected | Expected |
| macOS arm64/x64 | `.app` | Experimental | Yes | Experimental |
| Windows x64 | legacy standalone | Experimental | Yes | Experimental |
| Windows x64 | Microsoft Store MSIX | Unsupported | No | No |
| Linux | Snap | Experimental | Yes | No (read-only) |

There is no code signing or notarization for the macOS/Windows binaries. Release archives are Sigstore-signed and carry GitHub provenance, but the executables themselves are unsigned.

## Linux

Tested baseline.

- App detection: `/usr/bin/tradingview`, `/opt/TradingView/tradingview`, `/snap/bin/tradingview`, `PATH`, or `--app`.
- Config: `$XDG_CONFIG_HOME/tvmod` (default `~/.config/tvmod`).
- Data: `$XDG_DATA_HOME/tvmod` (default `~/.local/share/tvmod`).
- State/logs: `$XDG_STATE_HOME/tvmod` (default `~/.local/state/tvmod`).
- Wrapper: `~/.local/bin/tvmod`.
- Launcher: `~/.local/share/applications/tradingview.desktop`.
- Elevation: `sudo` or `pkexec` for `app.asar` only.
- Snap: preload is placed under `~/snap/tradingview/common/tvmod/`. Confinement validation is still pending.

## macOS (experimental)

- App detection: `/Applications/TradingView.app`, `~/Applications/TradingView.app`,
  `/Applications/TradingView Desktop.app`, or `--app`.
- Config/data/state: `~/Library/Application Support/tvmod`.
- Logs: `~/Library/Logs/tvmod`.
- Wrapper: `~/.local/bin/tvmod`.
- Launchers: `~/Applications/TradingView (TVMod).command` and
  `TradingView (Vanilla).command`.
- Elevation: the standard macOS administrator prompt (`osascript`), for `app.asar` only.

Install and launch:

```sh
tar -xzf tvmod-<version>-darwin-arm64.tar.gz
cd tvmod-<version>-darwin-arm64
xattr -dr com.apple.quarantine ./tvmod   # only for a downloaded, unsigned binary
./tvmod install
./tvmod launch
```

Add `~/.local/bin` to `PATH` to use `tvmod` directly. The `.command` launcher opens a Terminal window; it is a simple launcher, not a signed app bundle.

Patch mode and the registry are expected to work because the Electron layout is the same, but they have not been verified on real macOS hardware. After patching, TVMod attempts an ad-hoc `codesign --force --deep --sign -` of the app bundle because modifying `app.asar` invalidates the original signature. Report results if you try it.

## Windows legacy standalone (experimental)

The current official Windows download is usually an MSIX package. TVMod only supports an older/legacy unpacked standalone build where `TradingView.exe` is directly launchable.

- App detection: `%LOCALAPPDATA%\Programs\TradingView`, `%LOCALAPPDATA%\TradingView`,
  `%PROGRAMFILES%\TradingView`, `PATH`, or `--app`.
- Config: `%APPDATA%\tvmod`.
- Data/state: `%LOCALAPPDATA%\tvmod`.
- Logs: `%LOCALAPPDATA%\tvmod\state\logs`.
- Wrapper: `%LOCALAPPDATA%\tvmod\bin\tvmod.cmd`.
- Launchers: `TradingView (TVMod).lnk` and `TradingView (Vanilla).lnk` in the Start Menu.
- Elevation: Windows UAC (`Start-Process -Verb RunAs`) for `app.asar` only.

Install and launch from PowerShell or Command Prompt:

```bat
tvmod.exe install
tvmod.exe launch
```

Add `%LOCALAPPDATA%\tvmod\bin` to `PATH` to use `tvmod` directly. The Start Menu shortcut uses the wrapper path, so it works without changing `PATH`.

## Windows Microsoft Store MSIX (unsupported)

Modern Store builds place the app under `C:\Program Files\WindowsApps\...` with package identity. Reports from other TradingView desktop projects show that:

- direct execution from `WindowsApps` fails or loses package identity;
- inspector/devtools flags are filtered by the packaged runtime;
- copying the package elsewhere may be rejected or unstable across app versions;
- the install directory is read-only for patching.

TVMod detects the MSIX package with `Get-AppxPackage` and stops with an explicit error instead of launching TradingView unmodified and timing out. There is no MSIX launcher or patch backend. Use a legacy standalone build if available, or run TVMod on Linux.

## Release artifacts

| Target | Archive | Binary |
| --- | --- | --- |
| `linux-x64` | `tvmod-<version>-linux-x64.tar.gz` | `tvmod` |
| `linux-arm64` | `tvmod-<version>-linux-arm64.tar.gz` | `tvmod` |
| `darwin-x64` | `tvmod-<version>-darwin-x64.tar.gz` | `tvmod` |
| `darwin-arm64` | `tvmod-<version>-darwin-arm64.tar.gz` | `tvmod` |
| `windows-x64` | `tvmod-<version>-windows-x64.zip` | `tvmod.exe`, `tvmod.cmd` |

All archives include `preload.cjs`, docs, and examples. The release job cross-compiles every target on Linux, combines checksums, signs every archive with Sigstore, attests provenance, and publishes them together.

## Reporting platform results

Include the output of:

```sh
tvmod doctor
```

and the relevant `~/.local/state/tvmod/logs/launch.log` (Linux), `~/Library/Logs/tvmod/launch.log` (macOS), or `%LOCALAPPDATA%\tvmod\state\logs\launch.log` (Windows). Remove account identifiers before posting logs.
