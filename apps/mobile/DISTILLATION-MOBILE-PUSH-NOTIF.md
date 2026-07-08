# Mobile · Agent Push Notifications

"A notif on your iPhone the moment your agent needs approval." **Local** now; remote/APNs scaffolded, not wired.

**What fires a notif:** `AgentNotificationWatcher` (root-mounted, renders nothing) reuses the Live Session state *read-only* — Electric sessions/workspaces/hosts pick which online-host workspaces to poll, then the relay's `terminalAgents.listByWorkspace` (same call `useAgentActivity` makes) reads each lifecycle. `diffAgentEvents` reuses the Live Session's `agentStatus.ts` mapping and emits on transitions: **→ waiting** (`PermissionRequest`, "{label} needs you") and **active → settled** ("{label} finished"). Label = session title ↦ workspace; body = workspace. First-seen states seed silently (no cold-start burst).

**Local vs remote:** local only — `expo-notifications` scheduled from JS, so delivery is while foregrounded (polls pause in background like `useAgentActivity`; a transition that happened away fires on next foreground poll). Handler shows banner+sound in-foreground; Android channel `agent-activity` (HIGH). Permission is asked **only** on the Settings opt-in — never at cold start; denial degrades.

**Settings:** `(more)/settings` → "Agent notifications" toggle, persisted in `expo-secure-store`, default off.

**Deep-link:** notif `data.sessionId` (+ `expo-linking` `createURL`); tap → `expo-router` `router.push('/(authenticated)/(tabs)/(sessions)/{id}')`, incl. cold start via `getLastNotificationResponse`. Wired at app root `RootLayout` (`<NotificationsProvider>`).

**Left for remote APNs (needs Apple Developer account):** `registerForPushNotificationsAsync()` is ready (device/Expo push token) but never called — TODO: EAS push credentials, POST token to backend, emit pushes from host-service reusing the same `sessionId` payload → true background/killed-app delivery.

**Guardrails:** only new dep `expo-notifications@56.0.19`; zero backend/schema change; Live Session screen consumed, not modified. `typecheck` + `lint` green.

**Edges:** toggle off · signed-out/no-org · relay unset · host offline · permission denied / "don't ask again" · native module absent (JS-only) → all no-op. Org switch resets the baseline. No simulator (Xcode downloading) → verified by typecheck + lint + review only; runtime/gesture QA pending.
