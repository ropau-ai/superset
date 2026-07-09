# Distillation — Mobile: create a session from the app

**Files touched**
- `screens/(authenticated)/hooks/useNewSession/{useNewSession.ts,index.ts}` — shared handler (list + 1-vs-N + create + nav).
- `screens/(authenticated)/components/NewSessionSheet/{NewSessionSheet.tsx,index.ts}` — workspace picker sheet.
- `screens/(authenticated)/(tabs)/(sessions)/sessions/SessionsScreen.tsx` — `Stack.Toolbar` compose button + sheet.
- `screens/(authenticated)/(tabs)/(home)/workspaces/WorkspacesScreen.tsx` — replaced stub `onPress={() => {}}` + sheet.

**Exact signature** (`packages/trpc/src/router/chat/chat.ts`): `chat.createSession({ sessionId: uuid, v2WorkspaceId: uuid })` → `{ sessionId, txid }`. Brief said only `v2WorkspaceId`; it **also requires a client-minted `sessionId`** (no title). We generate it with `randomUUID()` (`expo-crypto`) so we know the id before the mutation resolves.

**Where wired**: Sessions header (required) **and** Home header (ideal), both via `useNewSession().open`.

**Picker (1 vs N)**: 0 workspaces → Alert; exactly 1 → create immediately; >1 → open `NewSessionSheet` (flat `v2Workspaces` list sorted by `updatedAt`, name + branch rows, mirrors existing sheets).

**Nav post-create**: `router.push('/(authenticated)/(tabs)/(sessions)/<sessionId>')`. `isCreating` guard blocks double-taps; failures show an Alert (no crash). Live Session handles the loading/not-found window while Electric `chatSessions` syncs.

**Left for visual QA**: render on device (Sessions + Home), dark theme, long lists (scroll capped 320pt), and the create→navigate flow end-to-end.

**Edges**: tap before first `v2Workspaces` sync → "No workspaces" alert (acceptable, no crash). No i18n framework in app → strings hardcoded like the rest.

Guardrails: `bun --filter @superset/mobile typecheck` + `lint` exit 0. Zero new deps, zero backend/schema changes. Untouched: `(sessions)/[id]/**`, `lib/relay/**`, `lib/collections/**`, notifications.
