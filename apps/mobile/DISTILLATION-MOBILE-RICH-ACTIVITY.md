# Mobile · Rich Agent Activity

The Activity tab is now a live, dark, screenshot-worthy timeline of the agent's
**real actions** — bash commands, file diffs/writes, reads, web tools, tool-use —
rendered with the existing `components/ai-elements/*` cards.

**Data source found:** rich per-tool activity is NOT a synced DB table — it lives in
the host's mastracode harness thread, exposed by host-service tRPC
`chat.listMessages({sessionId, workspaceId})` → `{id, role, content:[{type,…}]}[]`,
parts `text | thinking | tool_call | tool_result | image | file`. (`agent_commands` —
the Electric table that sounds right, already allowlisted in electric-proxy — is a
device command-dispatch queue with no session link, so it can't feed the timeline.)

**Sync path chosen — relay tRPC, not Electric.** `chat.listMessages` rides the SAME
relay path mobile already uses (`/hosts/{org:machineId}/trpc/…`); `sessionId`=
`chat_sessions.id`, `workspaceId`=`session.v2WorkspaceId` (= host workspace id under
the host-owned model; the id the terminal/agent calls already pass). **Zero backend/
schema change — no electric-proxy or collections edits.** `relay.ts#listSessionMessages`
+ `useSessionActivity` poll it every 3s (AppState-gated, gated to the Activity tab).

**ai-elements mapping** (mirrors apps/desktop ToolCallBlock via `normalizeToolName`):
execute_command→BashTool · write_file→FileDiffTool(write) · edit_file/ast_smart_edit→
FileDiffTool(diff+structuredPatch) · read/list/search→ReadFileTool · web_search→
WebSearchTool · web_fetch→WebFetchTool · thinking→Reasoning · text→MessageResponse ·
else→ToolCallRow. tool_call paired to tool_result by id; result envelopes parsed
tolerantly (`{content:[{text}]}`, nested output/result).

**Real vs remaining.** Real: full history + cards when relay configured + host online.
Backend gaps: (1) `listMessages` runs `getOrCreateRuntime` → may throw "No model
credentials"/"Workspace not found" → shown as an error state, not a crash; (2) no
commit tool — git commits render as bash cards (`commit.tsx` unused; a real commit
feed needs a git endpoint); (3) ship `EXPO_PUBLIC_RELAY_URL`; (4) no simulator →
verified by typecheck + lint. **Edges:** relay unset · offline · loading · unreachable
(+retry) · empty · unknown/`om_*`→quiet fallback · orphan tool_result.
