#!/bin/sh
set -eu

if ! command -v snap >/dev/null 2>&1; then
  echo "snapd is not installed. Install snapd and the TradingView Snap first." >&2
  exit 1
fi

if ! snap list tradingview >/dev/null 2>&1; then
  echo "The TradingView Snap is not installed." >&2
  echo "Run: sudo snap install tradingview" >&2
  exit 1
fi

if ! command -v tvmod >/dev/null 2>&1; then
  echo "tvmod is not on PATH. Install the release artifact first." >&2
  exit 1
fi

echo "== tvmod install (Snap-aware) =="
tvmod install

echo
echo "== tvmod doctor =="
tvmod doctor

echo
echo "== launch probe with an isolated profile =="
echo "The probe app is left running so you can inspect the TVMod gear modal."
tvmod launch --user-data-dir /tmp/tvmod-snap-probe --verbose --print-pid

echo
echo "Probe log: ~/.local/state/tvmod/logs/launch.log"
echo "Close the probe TradingView window when finished."
