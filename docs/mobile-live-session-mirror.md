# Mobile Live Session Mirror — how a session becomes visible

_Scope: how a "session" surfaces in the mobile app's Sessions tab / Live Session
UI, and whether a Claude Code **CLI** session launched inside a Superset
workspace (e.g. Emilien's own `Zuno-Emilien/main` `claude` session) mirrors there
automatically. All paths verified on branch `docs/mobile-mirror-analysis`
(forked from `feat/mobile-live-session`). File/line references are to that tree._

---

## (a) The data path, in prose

The mobile Live Session feature is fed by **two independent data planes** that
meet at exactly one row: the `chat_sessions` record.

### Plane 1 — the Sessions list (Electric / TanStack DB, cache-first)

```
Postgres  chat_sessions
   │  (Electric shape: params { table: "chat_sessions", organizationId })
   ▼
mobile "chatSessions" collection            lib/collections/collections.ts:257-270
   │  (electricCollectionOptions, getKey = item.id, snake→camel mapper)
   ▼
useLiveQuery(q.from({ chatSessions }))       SessionsScreen.tsx:33-36
   │  grouped by v2Workspaces (join for name + hostId)
   ▼
SectionList → SessionRow                     SessionsScreen.tsx:86-96
```

The Sessions tab is a live query over the `chatSessions` Electric collection,
which is a shape subscription on the **`chat_sessions`** Postgres table scoped to
the active `organizationId` (`collections.ts:262`). Companion collections
`v2_workspaces` (`collections.ts:212`) and `v2_hosts` (`collections.ts:227`)
supply the workspace name and the host online/offline dot.

> **Invariant:** a row appears in the mobile Sessions tab **iff** there is a
> `chat_sessions` row for the active org synced through Electric. There is no
> other source — no relay call feeds the list, only the detail screen.

### Plane 2 — the Live Session detail (relay poll, live)

Route `/(tabs)/(sessions)/[id]` → `SessionDetailScreen.tsx`. It locates the
`chat_sessions` row by id inside the same collection (`SessionDetailScreen.tsx:54`),
then derives the two keys every host call needs:

- `workspaceId = session.v2WorkspaceId` (`SessionDetailScreen.tsx:67`)
- `routingKey  = buildHostRoutingKey(organizationId, workspace.hostId)` =
  `"{orgId}:{machineId}"` (`SessionDetailScreen.tsx:68-71`, `relay/relay.ts:62-67`)

Three live feeds then run over the relay → host-service tRPC (`relay/relay.ts`):

| Detail surface | Hook | Relay procedure | **Keyed by** |
|---|---|---|---|
| Terminal tab | `useTerminalStream` | `terminal.listSessions` → PTY WS stream | **workspaceId** (`useTerminalStream.ts:85-99`) |
| Sub-agents panel + status | `useAgentActivity` → `listWorkspaceAgents` | `terminalAgents.listByWorkspace` | **workspaceId** (`useAgentActivity.ts:57`) |
| Activity tab | `useSessionActivity` → `listSessionMessages` | `chat.listMessages` | **sessionId** + workspaceId (`useSessionActivity.ts:63`) |

Note the asymmetry that turns out to be central to the answer below:

- **Terminal + Sub-agents feeds are workspace-keyed.** They show whatever live
  PTY / agent bindings exist in the workspace, discovered fresh from the host
  (`useTerminalStream` picks the first non-exited terminal, `useTerminalStream.ts:87`).
- **The Activity feed is session-keyed** and reads a **Mastra/mastracode runtime
  harness thread** the host lazily (re)creates per `sessionId`
  (`host-service runtime/chat/chat.ts:635-644`, `getOrCreateRuntime(sessionId, …)`).
  That thread only exists for the Superset chat agent.

The two planes meet only at the `chat_sessions` row: it is both the **list
entry** and the **carrier of `v2WorkspaceId`** the detail screen needs to open
the relay feeds. **No `chat_sessions` row ⇒ the session is neither listed nor
openable on mobile.**

### What actually writes a `chat_sessions` row

Exhaustive (`rg "insert(chatSessions" + "chat.createSession"`):

1. **`chat.createSession` tRPC** — `packages/trpc/src/router/chat/chat.ts:25-66`
   (`INSERT … onConflictDoNothing`). Its only three callers:
   - mobile compose button → `useNewSession.ts:53`
   - desktop chat pane → `useWorkspaceChatController.ts:46`
   - host-service `runChatAgent` — **only when `agent === "superset"`** →
     `packages/host-service/src/trpc/router/agents/agents.ts:202`
2. **Web AI-chat streaming route** inserts on demand —
   `apps/api/src/app/api/chat/[sessionId]/route.ts:78,102`.

Every one of these is the **Superset / mastracode chat** agent (the Mastra
runtime harness). **None fire for a terminal / CLI agent.**

---

## (b) KEY QUESTION — does a Claude Code CLI session appear on mobile? **NO.**

A `claude` session launched inside a Superset workspace does **not** create a
`chat_sessions` row, so it never appears in the mobile Sessions tab and cannot be
opened as a Live Session. Evidence chain:

1. **`claude` is a _terminal_ agent, not the chat agent.** It's a builtin
   terminal-agent preset with `command: "claude --dangerously-skip-permissions"`
   — `packages/shared/src/builtin-terminal-agents.ts:61-66`. The only agent that
   maps to the chat runtime is `superset` (`packages/shared/src/agent-catalog.ts:42`).

2. **Agent dispatch forks on that id.** `runAgentInWorkspace` sends
   `agent === "superset"` to `runChatAgent`, and **everything else to
   `runTerminalAgent`** — `agents.ts:285-293`.

3. **`runChatAgent` creates a session; `runTerminalAgent` does not.**
   - `runChatAgent` mints a `sessionId` and calls
     `ctx.api.chat.createSession.mutate({ sessionId, v2WorkspaceId })` — `agents.ts:199-205`.
   - `runTerminalAgent` builds a shell command and spawns a **PTY** via
     `createTerminalSessionInternal`, returning `{ kind: "terminal" }`. It
     **never calls `chat.createSession`** — `agents.ts:229-283`.

4. **CLI/terminal liveness lives in a host-local store, not the cloud DB.**
   Terminal agents are tracked in the in-process/host-SQLite `TerminalAgentStore`
   (`packages/host-service/src/terminal-agents/store.ts`), populated by the
   notification-hook receiver (`notifications.ts:85`,
   `ctx.terminalAgentStore.recordEvent(...)`). A grep of the entire
   `terminal-agents/` tree for `chat_sessions | createSession | ctx.api.chat`
   returns **nothing** — terminal agents never touch the synced `chat_sessions`
   table.

5. **The mobile list is that table and nothing else.** The `chatSessions`
   collection is an Electric shape over `chat_sessions` (`collections.ts:262`). No
   row ⇒ no list entry ⇒ no route to the detail screen.

So Emilien's `Zuno-Emilien/main` `claude` session — whether started via
`agents.run` with `agent="claude"` **or** by typing `claude` into a workspace
terminal — produces a **PTY + a `TerminalAgentBinding`**, but **no synced
`chat_sessions` row**. It is invisible to the mobile Sessions tab.

> Secondary confirmation: even if you could force-navigate to a detail screen for
> such a session, its **Activity tab would fail** — `chat.listMessages` reads a
> Mastra harness thread keyed by `sessionId` (`runtime/chat/chat.ts:635-644`),
> and a terminal agent has no such thread. `useSessionActivity` already handles
> this by surfacing an `error`/`disabled` state rather than crashing
> (`useSessionActivity.ts:29-36, 72-76`).

---

## (c) Minimal missing wiring to make CLI sessions mirror

The single missing link is: **insert a synced `chat_sessions` row (org +
`v2WorkspaceId` + `createdBy`) when a terminal/CLI agent starts.** Everything
downstream already works with zero mobile changes:

- The mobile Sessions list picks up the new row automatically via Electric.
- The detail screen's **Terminal tab, Sub-agents panel, and status are
  workspace-keyed** (`useTerminalStream` / `useAgentActivity` take only
  `workspaceId` + `routingKey`), so they render the workspace's live PTY and
  agent bindings the moment a row carrying the right `v2WorkspaceId` exists.
- Only the **Activity tab** (session-keyed `chat.listMessages`) would degrade to
  its existing graceful error/empty state for a terminal agent.

### Where to add the one write (minimal → most robust)

1. **Symmetric to `runChatAgent`** — in `runTerminalAgent` (`agents.ts:229`),
   after the PTY is created, mint a `sessionId` and call
   `ctx.api.chat.createSession.mutate({ sessionId, v2WorkspaceId: input.workspaceId })`.
   One extra call. **Limitation:** only covers agents launched through
   `agents.run`; a user who opens a terminal and types `claude` by hand is not
   caught.

2. **Recommended — at the hook receiver** `notifications.ts:85`. Every live
   agent (Claude Code included) reports lifecycle events here, so on the first
   bind/`Start`/`Attached` event for a new `terminalId`, derive a stable
   `sessionId` from the `terminalId`, look up the terminal's
   `originWorkspaceId` (already read at `notifications.ts:64-69`), and fire
   `ctx.api.chat.createSession.mutate({ sessionId, v2WorkspaceId })` once
   (dedupe by `terminalId → sessionId`). This is the **single point that catches
   both** `agents.run`-launched CLI agents **and** manually-typed `claude`,
   because both funnel through the notification hook.

### Cleanups to make it feel right (not required for "appear")

These aren't needed for the session to show up, but avoid rough edges:

- **Discriminate chat vs. terminal sessions** so the detail screen defaults to
  the Terminal tab (not the chat poll) for CLI sessions — e.g. a
  `kind`/`agentDefinitionId` column on `chat_sessions`, or a separate synced
  table. Without it the Activity tab shows the "host has no model / never
  started" error for CLI sessions (harmless but ugly).
- **Set a title** (the agent label, e.g. "Claude") via `chat.updateSession` /
  `updateTitle` so `SessionRow` isn't "Untitled session"
  (`SessionDetailScreen.tsx:121`).
- **Map `terminalId ↔ sessionId`** so the detail screen streams the *specific*
  PTY. Today `useTerminalStream` is workspace-keyed and just picks the first live
  terminal (`useTerminalStream.ts:87`); with multiple terminals in one workspace
  you'd want to pass the bound `terminalId` through.

### One caveat on identity

`chat_sessions.createdBy` is `NOT NULL` (`packages/db/src/schema/schema.ts:677`)
and `chat.createSession` derives it from `ctx.session.user.id`
(`chat.ts:48`). The host-service already calls this successfully from
`runChatAgent`, so its cloud API client is authenticated as a real user — the
same mechanism carries a terminal-agent-created row. Confirm the acting user for
a manually-typed CLI session is the intended owner before shipping option 2.
