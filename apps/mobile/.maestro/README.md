# Maestro E2E harness — Superset mobile

Authored during the 2026-07-09 E2E QA (`apps/mobile/docs/qa-e2e-2026-07-09.md`). These flows are **runnable on demand** but were **not executed** in that audit run — Maestro wasn't installed and the only booted simulator was a protected device (see below).

## ⚠️ Hard isolation rules (read before running)

There is a live dev session on this machine. **Do not touch it.**

- **NEVER** target the booted **iPhone 17 Pro `1266AB0E-06B5-47A0-B3D3-366649B6C16C`** — that is Paul's device.
- **NEVER** use Metro on port **`8090`** — that is Paul's packager.
- Always run against **your own** simulator and **your own** Metro port.

## One-time setup

```bash
# 1. Install Maestro
curl -Ls "https://get.maestro.mobile.dev" | bash

# 2. Create + boot a DEDICATED simulator (NOT Paul's UDID)
xcrun simctl create "qa-e2e-iphone" "iPhone 16 Pro"      # prints a NEW udid
QA_SIM=<that-new-udid>
xcrun simctl boot "$QA_SIM"

# 3. Build the dev-client onto YOUR sim, on YOUR Metro port (not 8090)
cd apps/mobile
RCT_METRO_PORT=8091 bunx expo run:ios --device "$QA_SIM"
#   (native modules compiled: expo-speech-recognition, expo-notifications, tab-bar)
```

The app needs a reachable backend to pass sign-in. Point the repo-root `.env` at a dev
`EXPO_PUBLIC_API_URL` / `EXPO_PUBLIC_ELECTRIC_URL` / `EXPO_PUBLIC_RELAY_URL` before building.

## Run

```bash
cd apps/mobile
maestro --udid "$QA_SIM" test .maestro                    # whole suite
maestro --udid "$QA_SIM" test .maestro/flows/cockpit.yaml # one flow
maestro --udid "$QA_SIM" test --include-tags=smoke .maestro
```

## What the flows encode

| Flow | Tags | Asserts |
|---|---|---|
| `smoke-launch` | smoke | app boots to sign-in **or** cockpit |
| `auth-dev-signin` | auth | `__DEV__` dev sign-in reaches the cockpit |
| `cockpit` | smoke | Emilien card + Fleet section render |
| `nav-tabs` | smoke | Emilien/Fleet/Search/More tabs + Settings back button |
| `emilien-chat-backbutton` | regression | tap Emilien card → **can navigate back** (FAILS until P0-1 fixed) |
| `new-session` | smoke | new-session entry (alert when 0 workspaces) |

## Hardening TODO

Selectors use visible text + accessibility labels (e.g. "Log out", "Send message"). Add
stable `testID`s to the cockpit card, tab triggers, and the (missing) chat back button so
these flows don't depend on copy. The `emilien-chat-backbutton` regression flow is
intentionally red — it turns green when `ChatThreadScreen` gets a back affordance.
