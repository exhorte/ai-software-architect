# Handoff

> **Rôle** : Journal de passation vivant entre sessions de travail. Là où `project_state.md` garde l'état durable du build (phases, décisions, historique), ce fichier capture le *fil de la discussion en cours* : ce qu'on vient de faire, ce qui est en vol, la prochaine action immédiate, et le contexte qu'une nouvelle session doit connaître pour reprendre sans friction.
> **Utilisé** : Lu au début de chaque session (juste après `project_state.md`) ; mis à jour en continu pendant la session et obligatoirement avant de la clore.
> **Lu par** : Claude Code et le développeur.
> **Écrit par** : Claude Code et le développeur, au fil des discussions.
> **Conventions** : En français (document de travail avec l'utilisateur ; les fichiers système restent en anglais). Toujours daté. On remplace les sections — pas d'accumulation infinie : l'historique durable part dans `project_state.md`, le détail dans git. Max ~1 page.

---

## Session en cours

- **Date** : 2026-07-06
- **Objectif** : Phase 1 — Shared Memory runtime (processus complet : compréhension → TDD → validation utilisateur → implémentation → clôture).
- **Statut** : ✅ Terminée et clôturée. Phase courante : **Phase 2 — Orchestrator runtime**.

## Ce qui vient d'être fait

1. TDD Phase 1 validé par l'utilisateur (décisions D1–D7, consignées dans `project_state.md` § Decisions Log).
2. `lib/memory/` livré : registre Ajv 2020 sur les schémas canoniques (import build-time), validation niveaux 1–2, ownership (+ exception REQ-S testée), cycle de vie des statuts, carte d'invalidation, `MemoryStore` (init / lectures scopées / commit atomique avec verrou optimiste / markStale / reconstruction par version), port de persistance + adaptateurs Prisma et in-memory. **33/33 tests** (templates canoniques en golden tests), `tsc` 0 erreur, build OK.
3. Modèles `ProjectMemory` + `MemoryRevision` ; migration `20260706120000_add_project_memory` générée **hors-ligne** (pas de `.env` sur ce poste) ; client Prisma régénéré.
4. Contrats synchronisés : carte d'invalidation étendue dans `coordinator/planner.md` (security/engineering/backlog) ; précision `runState.history` ↔ `MemoryRevision` dans `shared_memory.md`.
5. Hygiène : `app/generated/**` et `.trigger/**` exclus d'ESLint (549 fausses erreurs éliminées).
6. Commits T1→T7 poussés sur `origin/main`.

## En vol / non terminé

- Rien en vol. Deux différés (aussi dans `project_state.md` § Open Questions) :
  - **Migration non appliquée** — faire `npx prisma migrate deploy` + smoke test `PrismaPersistence` dès que `DATABASE_URL` existe (indispensable avant les runs réels de la Phase 3 ; la Phase 2 teste sur l'adaptateur in-memory).
  - 4 erreurs lint **préexistantes** (canvas/liveblocks) — unité de nettoyage dédiée.

## Prochaine action immédiate

- **Phase 2 — Orchestrator runtime** : cahier des charges `../project/phases/phase-02-orchestrator.md`. Premier pas (checkpoint 1) : note technique d'une page (topologie des tâches Trigger.dev, croquis du modèle `Run`) à faire valider avant tout code. Décisions d'ouverture : bundling des `.md` agents dans le worker, couture provider LLM.

## Décisions récentes à connaître (détail : project_state.md § Decisions Log)

- La couche mémoire est **la seule voie d'écriture** vers la Shared Memory ; l'orchestrateur (Phase 2) la consomme via le port `MemoryPersistence`.
- Les schémas JSON de `.claude/context/schemas/` sont importés au build — jamais copiés.
- Les cartes ownership/invalidation du code **miroitent les contrats** (`consistency.md`, `planner.md`) : contrat d'abord, code ensuite.

## Pièges connus

- Pas de `.env` sur ce poste : ni DB, ni clés Clerk/Liveblocks/Trigger — le dev end-to-end local attend la config d'environnement.
- Next.js 16 : vérifier `node_modules/next/dist/docs/` avant tout code framework ; `proxy.ts` remplace `middleware.ts`.
- Prisma 7 : client généré dans `app/generated/prisma/`, constructeur exige `{ adapter }` ; ne pas linter les artefacts générés.
- Trigger.dev v4 : jamais `Promise.all` avec `triggerAndWait`/`wait.*` ; toujours vérifier `result.ok` (skills `.claude/skills/trigger-*`).
