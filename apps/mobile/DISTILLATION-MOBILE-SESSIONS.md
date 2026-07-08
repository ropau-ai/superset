# Mobile Sessions Screen — Phase 1

## Fichiers créés / modifiés
- `app/(authenticated)/(tabs)/_layout.tsx` — trigger onglet `(tasks)` → `(sessions)` (label « Sessions », icône SF `bubble.left.and.bubble.right`).
- `app/(authenticated)/(tabs)/(sessions)/{_layout,index,[id]}.tsx` — routing (re-export des screens).
- `screens/(authenticated)/(tabs)/(sessions)/sessions/SessionsScreen.tsx` — liste groupée.
- `screens/.../(sessions)/sessions/components/SessionRow/` — row réutilisable (titre + temps relatif).
- `screens/.../(sessions)/[id]/SessionDetailScreen.tsx` — détail (titre + méta + stub).

## Consommation de `chatSessions`
`useLiveQuery` sur `collections.chatSessions` (+ `v2Workspaces`, `v2Hosts`) via `useCollections()`, comme `WorkspacesScreen`. Join en mémoire : Map `workspaceId→workspace` et `machineId→host`. Groupé par `v2WorkspaceId` (sessions sans workspace → section « No workspace », en dernier), trié par `lastActiveAt` desc (fallback `updatedAt`/`createdAt`). Header de section = nom workspace + état host (`v2Hosts.isOnline` → Cloud/CloudOff/Circle). Rendu cache-first (règle 9) : `isReady` ne gate que l'empty state.

## Décision onglet
Reconverti l'onglet `(tasks)` (mock TODO non branché) en onglet `(sessions)` plutôt qu'ajouter un 5e onglet : garde 4 onglets, remplace du code mort, et le pattern `[id]` de détail se mappe directement.

## Détail session
Tap → `/(authenticated)/(tabs)/(sessions)/[id]` : titre + workspace + host online/offline + « last active »/« created ». Pas de collection de messages synced → stub propre `ConversationEmptyState` « Live tracking coming soon » (Phase 2 branchera l'état agent).

## Reste pour QA visuelle (post-Xcode)
- Rendu réel iOS : icône native de l'onglet, sticky headers, insets/safe-area du détail, empty states.
- Vérifier la nav vers `[id]` (href avec groupes) et le retour via header natif sur device.
- Edges : sessions sans `v2WorkspaceId`, host absent/offline, titres nuls/longs, org vide.

## Garde-fous
`bun --filter @superset/mobile typecheck` → exit 0 ; `lint` → exit 0. Zéro dep ajoutée, zéro changement backend/schema/API (lecture des collections existantes uniquement).
