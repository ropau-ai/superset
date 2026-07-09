# Mobile · Live Session View

Session detail (`screens/(authenticated)/(tabs)/(sessions)/[id]`) is now the hero
"watch your agent code live from your phone" screen — dark, premium, screenshot-ready.

**Screen:** `LiveSessionHeader` (title, workspace + host online/offline, live-ticking duration,
animated `AgentStatusBadge`: Working / Waiting for you / Idle / Host offline with a reanimated
pulsing dot) + two tabs — **Terminal** (default) and **Activity**.

**Terminal stream (the WOW) — relay WebSocket:** `TerminalStreamConnection` is a React-Native
port of the web `TerminalConnection`. Opens `wss://{relay}/hosts/{orgId:machineId}/terminal/
{terminalId}?workspaceId&token`, exponential backoff + max-attempts, recovers on **`AppState`
foreground** + **`expo-network`** (RN has no `visibilitychange`). Terminal discovered via relay
HTTP `terminal.listSessions`. Raw PTY bytes → streaming UTF-8 decode → ANSI-strip + CRLF/`\r`
fold → bounded 2000-line buffer (`terminalOutput.ts`), 60ms flush, auto-scroll tail.

**Agent activity — relay tRPC:** `useAgentActivity` polls `terminalAgents.listByWorkspace`
(4s); `agentStatus.ts` maps host lifecycle events (`Start`/`PermissionRequest`/`Stop`/`Attached`,
with staleness fold) to the status pill + `ActivityFeed` timeline rows.

**Real vs stub:** Real via Electric — session, workspace, host online, duration. Real via relay
(when configured + host online) — live terminal + agent status. Relay URL is a **new optional
`EXPO_PUBLIC_RELAY_URL`** (mobile had none); unset → clean "Relay not configured" state, no crash.
Routing key inlined (no new dep on `@superset/shared`). Zero backend/schema change, no new deps.

**Left for 100% live:** (1) no `messages`/`agentCommands` synced to mobile, so rich per-tool
cards (bash/diffs/commits via `ai-elements`) can't render — needs an Electric-synced session-
message table or a relay activity-stream endpoint; today we attach to the workspace's active
terminal (mobile has no per-session terminalId). (2) Ship `EXPO_PUBLIC_RELAY_URL` to mobile env.
(3) No simulator (Xcode downloading) → verified by typecheck + lint + review; visual/gesture QA
(nested scroll, arraybuffer frames) pending post-Xcode.

**Edges:** relay unset · host offline · no terminal · reconnecting · WS error (+retry) · empty
activity · background/foreground · CRLF & progress `\r` · multibyte UTF-8 split across frames.
