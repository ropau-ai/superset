# Mobile — Sub-agents panel in the Live Session

**Composant créé** : `screens/(authenticated)/(tabs)/(sessions)/[id]/components/SubAgentsPanel/`
(`SubAgentsPanel.tsx` + `index.ts`). Vue en lecture seule sur `useAgentActivity.bindings` :
une carte par agent (avatar teinté par statut, nom, badge de statut par agent, "active X ago"),
titre de section "Agents" + compteur `{n} agents`, triée par `lastEventAt` desc.

**Insertion** : `SessionDetailScreen.tsx` — rendu **sous `LiveSessionHeader`, au-dessus des `Tabs`**
Terminal/Activity (seul fichier existant modifié : 1 import + 1 bloc `<SubAgentsPanel ... />`).
Comportement des tabs inchangé.

**Statut par agent** : réutilise `statusForBinding(binding, now)` de `agentStatus.ts`
(mapping `lastEventType` → `Start`=working, `PermissionRequest`=waiting, `Stop`/`Attached`=idle,
`Detached`=ended, +fold de staleness `working`→`idle` après 2 min). Badge = `AgentStatusBadge`
existant ; teinte avatar alignée sur la même palette (amber/sky/emerald/muted).

**Fallback de nom** : `definitionId` (trim) sinon `agentId` court (`slice(0,8)…`, rendu en mono),
sinon `"agent"`.

**États défensifs** : 0 binding + `phase==="loading"` → skeleton discret (2 lignes) ;
0 binding sinon → ne rend rien (`null`) ; cache-first (agents affichés même en re-poll) ;
champs optionnels gardés (`lastEventAt` typé, `definitionId?`).

**Garde-fous** : `bun --filter @superset/mobile typecheck` exit 0 ; `lint` exit 0 ; zéro nouvelle dep ;
aucun changement `lib/relay`, `lib/collections`, hooks, notifications.

**QA visuelle restante (post-tap simulateur)** : lisibilité largeur du badge "Waiting for you" à côté
d'un nom long ; densité de la liste avec 5+ agents ; rendu dark réel des teintes ; pulse reanimated.
**Edges** : agents multiples partageant un `definitionId` (clé = `terminalId:agentId`) ; horloges
host/mobile désynchronisées → "active in X seconds" possible (borné par le fold de staleness).
