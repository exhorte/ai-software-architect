# Handoff

> **Rôle** : Journal de passation vivant entre sessions de travail. Là où `project_state.md` garde l'état durable du build (phases, décisions, historique), ce fichier capture le *fil de la discussion en cours* : ce qu'on vient de faire, ce qui est en vol, la prochaine action immédiate, et le contexte qu'une nouvelle session doit connaître pour reprendre sans friction.
> **Utilisé** : Lu au début de chaque session (juste après `project_state.md`) ; mis à jour en continu pendant la session et obligatoirement avant de la clore.
> **Lu par** : Claude Code et le développeur.
> **Écrit par** : Claude Code et le développeur, au fil des discussions.
> **Conventions** : En français (document de travail avec l'utilisateur ; les fichiers système restent en anglais). Toujours daté. On remplace les sections — pas d'accumulation infinie : l'historique durable part dans `project_state.md`, le détail dans git. Max ~1 page.

---

## Session en cours

- **Date** : 2026-07-10
- **Objectif** : Déploiement sur **Prisma Compute** + remise à neuf de la config Prisma/Clerk (demande utilisateur, avant d'entamer la Phase 3).
- **Statut** : ✅ **App déployée et live** sur Compute. Base Prisma Postgres neuve + migration `init` appliquée. Reste à créer les services (Clerk, etc.) pour rendre l'app fonctionnelle. Phase courante inchangée : **Phase 3 — Business Team** (l'infra live la débloque).

## Infra déployée (2026-07-10)

- **Projet Prisma** : `software_architect` (`proj_cmrf5nufq10mbwfdv0gxmgbff`, workspace « Personal »).
- **Base** : `production` (`db_cmrf5outc10obwfdviwymva8k`), Prisma Postgres, **eu-central-1**, migration `20260710163659_init` appliquée. `DATABASE_URL` (connexion Postgres directe) dans `.env` (gitignoré).
- **App Compute** : nom `ghost-ai` (hérité de `package.json name`), branche `main`, production. **URL : https://bdm8rc1y6wusqz15cjh1972a.fra.prisma.build**.
- **État runtime** : le serveur répond mais `/sign-in` renvoie **500** — normal, clés Clerk absentes.
- Schéma Prisma **consolidé en fichier unique** (`prisma/schema.prisma`) ; `prisma/models/` et l'ancien historique de migration supprimés (« historique neuf »). Stack Prisma réinstallée (elle avait été retirée de `package.json`). `next.config.ts` : `output: "standalone"`.

## Action utilisateur requise pour rendre l'app fonctionnelle

Créer les services et coller leurs clés dans `.env` (placeholders commentés déjà en place — **ne pas laisser de valeur vide, Compute les refuse**), puis **redéployer** (`bunx @prisma/cli@latest app deploy --project proj_cmrf5nufq10mbwfdv0gxmgbff --branch main --env .env --prod --yes`) :
- **Clerk** (auth) — `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` (+ URLs sign-in/up)
- **Liveblocks** — `LIVEBLOCKS_SECRET_KEY`
- **Trigger.dev** — `TRIGGER_SECRET_KEY`, `TRIGGER_PROJECT_REF`, `NEXT_PUBLIC_TRIGGER_PUBLIC_API_KEY`
- **Vercel Blob** — `BLOB_READ_WRITE_TOKEN`
- **Google Gemini** — `GOOGLE_AI_API_KEY`

## Ce qui vient d'être fait (Phases 1-2, rappel)

`lib/memory/` (Phase 1) et `lib/orchestrator/` (Phase 2) livrés et testés (93 tests au total : 33 + 60). Détail dans `project_state.md` § Decisions Log.

## Ce qui vient d'être fait (Phase 2)

1. TDD Phase 2 validé (topologie orchestrateur parent + agent-runner enfants ; croquis `Run` ; module de prompts généré committé).
2. `lib/orchestrator/` livré : table de routage + planner (plan NEW_PROJECT 18 étapes, garde anti-double-écrivain), enveloppe (5ᵉ schéma canonique `envelope.schema.json`, parsing tolérant aux fences), prompts 4 couches déterministes, couture LLM (`AgentModel`, Gemini + registre par agent), **engine** (machine à états, groupes parallèles, retry sémantique ×1 puis blocked-and-continue, CLARIFICATION auto-passée sans question bloquante, gates structurels) derrière les ports `AgentInvoker`/`RunRecorder`.
3. `trigger/orchestrator.ts` + `trigger/agent-runner.ts` : wrappers minces (`triggerAndWait`/`batchTriggerAndWait`, retry Trigger = 1 — les retries sont sémantiques). Modèle `Run` + migration hors-ligne `20260706130000_add_run`.
4. `scripts/build-agent-prompts.ts` : les 18 fiches `.md` compilées en module TS committé (`npm run prompts:build`, hooks prebuild/pretest) — les `.md` restent l'unique source.
5. Vérification : **60/60 tests**, `tsc` 0 erreur, build OK, lint propre sur le nouveau code. Commits U1→U9 poussés.

## En vol / non terminé

- Rien en vol. Différés inchangés : **`.env` absent** (migrations `add_project_memory` + `add_run` à déployer, smoke test Trigger.dev cloud) — **à lever en ouverture de Phase 3**, première phase qui tourne en réel ; 4 erreurs lint préexistantes (canvas/liveblocks).

## Prochaine action immédiate

- Court terme : créer les services (Clerk d'abord) + coller les clés dans `.env` + redéployer → app fonctionnelle. La DB live est déjà prête.
- Puis **Phase 3 — Business Team** : cahier des charges `../project/phases/phase-03-business-team.md`. Premier pas (checkpoint 1) : croquis UX de la boucle de clarification + visualiseur mémoire à faire valider. Décision d'ouverture : mécanisme pause/reprise CLARIFICATION (waitpoints Trigger vs run-par-segment).

## Décisions récentes à connaître (détail : project_state.md § Decisions Log)

- L'**engine vit dans `lib/orchestrator/`** derrière des ports — les tâches Trigger sont des wrappers minces ; tout se teste in-process.
- L'**enveloppe agent est un schéma canonique** (`envelope.schema.json`) validé avant tout commit.
- Les prompts runtime = module **généré** depuis les `.md` (`npm run prompts:build`) ; éditer un agent = éditer son `.md`.
- La couche mémoire reste la seule voie d'écriture ; l'engine la consomme via `MemoryStore`.

## Pièges connus

- `.env` (gitignoré) contient le vrai `DATABASE_URL` + placeholders **commentés** pour les autres services. Compute **rejette toute variable à valeur vide** dans `--env .env` → garder les clés inutilisées commentées.
- Déploiement Compute : `bunx @prisma/cli@latest` (pas la CLI ORM `prisma`) ; auth via `auth login` (session locale partagée). Next.js exige `output: "standalone"`.
- Schéma Prisma désormais **mono-fichier** (`prisma/schema.prisma`) — ne pas recréer `prisma/models/`.
- Next.js 16 : vérifier `node_modules/next/dist/docs/` avant tout code framework ; `proxy.ts` remplace `middleware.ts`.
- Prisma 7 : client généré dans `app/generated/prisma/`, constructeur exige `{ adapter }` ; ne pas linter les artefacts générés.
- Trigger.dev v4 : jamais `Promise.all` avec `triggerAndWait`/`wait.*` ; toujours vérifier `result.ok` (skills `.claude/skills/trigger-*`).
