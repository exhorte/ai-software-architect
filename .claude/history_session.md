# Historique de session — AI Software Architect

> **Rôle** : journal chronologique de la discussion et du travail de cette session, tenu à jour au fil des échanges. Complémentaire de `.claude/context/memory/project_state.md` (état durable du build) et `handoff.md` (fil de passation resserré) : ici on garde la **trace narrative** des demandes de l'utilisateur et de ce qui a été livré, dans l'ordre.
> **Langue** : français (document de travail avec l'utilisateur).
> **Mise à jour** : après chaque unité de travail significative.

---

## Vue d'ensemble

Transformation du dépôt **Ghost AI** en **AI Software Architect** : une plateforme SaaS où une usine logicielle multi-agents transforme une idée en livrable d'ingénierie complet. Fondations posées (le « cerveau » `.claude/context/`), socle applicatif hérité déployé en production (Prisma Compute + Clerk + Liveblocks + Trigger.dev + Gemini/DeepSeek + Vercel Blob), puis construction du pipeline agentique phase par phase.

Dépôt Git : <https://github.com/exhorte/ai-software-architect> (branche `main`).

---

## 1. Phase 0 — Fondations du système d'agents (2026-07-05)

- **Demande** : analyser Ghost AI, puis refondre `.claude/` en cerveau du projet (coordinator, agents, memory, prompts, schemas, templates, rules).
- **Réalisé** : 41 fichiers créés — 4 coordinator, 4 memory (dont le contrat de Shared Memory), 18 agents (4 équipes), 3 prompts transversaux, 4 JSON Schemas, 5 templates, 3 rules. `CLAUDE.md` réécrit en point d'entrée léger ; `AGENTS.md` aligné.
- **Décisions clés** : `.claude/context/` = unique base de connaissances ; les fiches agents `.md` = **source de vérité des prompts runtime** ; échanges inter-agents = JSON validé par schéma ; un propriétaire par section mémoire.
- **Suites** : nettoyage validé des artefacts tutoriel (feature-specs, assets JSM), README réécrit, `context/` racine absorbé dans `platform/`, manifeste de dev câblé. Git initialisé (snapshot `4a0365d`), poussé sur GitHub.
- **Roadmap par phases** : `project/roadmap.md` (index maître) + `project/phases/phase-01…06.md` (mini-cahiers des charges), chargement scopé (une phase à la fois).

## 2. Phase 1 — Shared Memory runtime (2026-07-06)

- **Livré** : `lib/memory/` — registre Ajv 2020 sur les schémas canoniques, validation niveaux 1-2, ownership (+ exception REQ-S), cycle de vie des statuts, carte d'invalidation, `MemoryStore` (init / lectures scopées / commit atomique avec verrou optimiste / markStale / reconstruction par version), port de persistance + adaptateurs Prisma & in-memory.
- **Modèles** : `ProjectMemory` + `MemoryRevision`. **33 tests.**

## 3. Phase 2 — Orchestrator runtime (2026-07-06)

- **Livré** : `lib/orchestrator/` — table de routage + planner (plan NEW_PROJECT 18 étapes), enveloppe (5ᵉ schéma canonique `envelope.schema.json`), prompts 4 couches déterministes, couture LLM, **engine** (machine à états, groupes parallèles, retry sémantique, blocked-and-continue, gates structurels) derrière les ports `AgentInvoker`/`RunRecorder`.
- **Infra** : `trigger/orchestrator.ts` + `agent-runner.ts` (wrappers minces), modèle `Run`, module de prompts généré depuis les `.md` (`npm run prompts:build`). **60 tests.**

## 4. Déploiement Prisma Compute (2026-07-10)

- **Demande** : déployer sur Prisma Compute via `@prisma/cli`.
- **Découvertes** : le projet cible fourni n'existait pas → création d'un nouveau projet **`software_architect`** (`proj_cmrf5nufq10mbwfdv0gxmgbff`) + base `production` (eu-central-1). Schéma **consolidé en fichier unique**, historique de migration remis à neuf, stack Prisma réinstallée (elle avait été retirée de `package.json`). `next.config.ts` → `output: "standalone"`.
- **Résultat** : app live à **https://bdm8rc1y6wusqz15cjh1972a.fra.prisma.build** (au départ 500, faute de clés de services).
- **Garde-fou respecté** : instantané Git de sauvegarde avant toute suppression ; secrets uniquement dans `.env`/`.env.production` (gitignorés).

## 5. Configuration des services (2026-07-11 → 07-12)

- **Clerk** (2026-07-11) : câblé via Clerk CLI (`clerk init` + `env pull`), app « Nyx ai ». `ClerkProvider` dans `<body>`, matcher `/__clerk/:path*`. Vérifié en local (sign-in 200, redirection 307).
- **Liveblocks / Vercel Blob / Google Gemini** : clés câblées et **testées par vrai appel API**. **Bug trouvé** : `gemini-2.5-flash` déprécié → bascule vers **`gemini-flash-latest`** (env-overridable) aux 3 call sites.
- **Trigger.dev** : clés testées (`runs.list`), `NEXT_PUBLIC_TRIGGER_PUBLIC_API_KEY` confirmé inutile (tokens publics générés côté serveur).
- **Suppression de valeurs vides** dans `.env.production` (Compute les refuse) ; les variables applicatives poussées dans l'env **prod de Trigger** (les tâches déployées ne lisent pas `.env.production`).

## 6. Socle live validé + provider DeepSeek (2026-07-16 → 07-17)

- **Smoke tests live** (Gemini) : `agent-runner`, `design-agent`, `generate-spec` tous COMPLETED en prod ; chaîne complète prouvée : **Clerk → Prisma → Liveblocks → Trigger prod → LLM → Blob**.
- **DeepSeek** ajouté comme **provider LLM sélectionnable** (`LLM_PROVIDER`, Gemini reste le défaut), via `@ai-sdk/openai-compatible` (épinglé **2.x** — la 3.x émet `LanguageModelV4` incompatible avec `ai@6`). Fallback restreint aux erreurs de capacité, jamais sur validation/contrat ; provider/modèle tracés en métadonnées.
- **Capability `supportsForcedToolChoice`** : `design-agent` choisit `toolChoice: "required"` (Gemini) ou `"auto"` (DeepSeek, « thinking mode ») **selon la capability, jamais le nom du provider** ; prompt renforcé + garde-fous (échec explicite si design vide). Smoke tests **verts sur les deux providers**.
- **Dette connue** : `design-agent` produit des nœuds mais **0 edge** et n'appelle jamais `finalizeDesign` — identique sur les deux providers → faiblesse de prompt/schéma, pas du LLM.

## 7. Phase 3 — Business Team, en cours (2026-07-17)

Méthode imposée par l'utilisateur : compréhension → analyse d'impact → TDD → plan → validation → implémentation par sous-unités V1…V9, avec validation à chaque étape.

- **V1 (moteur)** `d0b7aec` : port `ClarificationGate` + boucle de clarification (1 tour, non-répondu → hypothèses `project.assumptions`), `consistency.ts` (CON-01/02) + gate correctif (re-run de l'agent propriétaire, groupé par agent), `preserveStatus` sur `commitSection`. Défauts réels attrapés par les tests et corrigés. **108 tests.**
- **V2 (adaptateur waitpoint)** `baf604c` : pause/reprise = **waitpoint tokens Trigger.dev v4** (API vérifiée sur le SDK 4.5.3 installé : `createToken`/`forToken`/`completeToken`/`retrieveToken`). `trigger/clarification-gate.ts` implémente le port, **zéro logique métier** ; le moteur reste sans dépendance Trigger. Statut **`RESUMING`** ajouté (COMPLETED→DONE existant ; pas de BLOCKED run). `Run.stepId` + `Run.clarification`. Idempotence native (1 token/run), expiration **24 h** (timeout = « personne n'a répondu → hypothèses », erreur technique relancée). **126 tests.**
- **V3 (routes API)** `211295d` : `POST /api/ai/run` (lancement), route de **token public** scopé au run, `POST /api/ai/run/answers` (ordre 1-11, codes 400/401/403/404/409/410/500, 410 expiré ≠ 409 déjà consommé). La route **ne commite jamais** — elle complète le waitpoint, le moteur reprend et commite (commit unique structurellement garanti). Helpers purs déplacés dans `lib/orchestrator/clarification.ts`. **148 tests.**
- **Robustesse moteur** `8ee01c2` : découvert par le 1ᵉʳ run live (l'analyst a échoué avec `AI_APICallError` et **tout le run avait échoué**). Correctif : une exception d'invocation d'agent est retentée une fois puis **bloque sa section** au lieu d'avorter le run ; un échec de batch dégrade en exécution par étape. **151 tests.**
- **Démo cloud contrôlée V2+V3** (waitpoint réel, indépendante de l'analyst LLM) : run suspendu en `WAITING_CLARIFICATION` (token réel, **aucun compute consommé**), réponse via `wait.completeToken` (l'appel exact de la route à l'étape 10), reprise `RESUMING → COMPLETED`, **commit unique** vérifié en mémoire (1/1). ✅
  - *Nuance honnête* : le raw `wait.completeToken` est idempotent (une 2ᵉ complétion « réussit » côté SDK) ; la garantie de **consommation unique** est portée par la **route** (409 sur `retrieveToken().status === COMPLETED`, testé unitairement), non par le token lui-même.

### Clôture V3 (2026-07-19)

- **Démo exécutée et verte** (détails ci-dessus). Run réel `run_cmrp915fbp41h0vok44ymfl2s`, waitpoint `waitpoint_cmrp91cahp3220jokbwczecgo`.
- **Nettoyage fait** : `trigger/_demo_waitpoint.ts` et `scripts/_run-demo.ts` supprimés ; **redéploiement Trigger propre `20260719.1`, 4 tâches** (plus de `demo-waitpoint`). 151 tests toujours verts, typage propre.
- **Documentation synchronisée** : `phase-03-business-team.md` (change log V3 + robustesse + démo), `project_state.md` (décisions + dette), `handoff.md` (prochaine étape V4).
- **Commit de clôture** `32e02c1` — poussé sur `origin/main`. Historique des commits Phase 3 : `d0b7aec` (V1) → `baf604c` (V2) → `211295d` (V3) → `8ee01c2` (robustesse) → `32e02c1` (clôture).
- **Écueils rencontrés et résolus au passage** :
  - CLI Trigger à **épingler sur la version du SDK** (`npx trigger.dev@4.5.3`) — `@latest` avorte avec « Version mismatch … in CI » quand il n'y a pas de TTY.
  - Cold start Trigger > 2 min après un déploiement : le 1ᵉʳ essai de démo a échoué sur une **course de nettoyage** (le script supprimait le projet avant que la tâche ne démarre). Driver rendu patient (8 min) + nettoyage uniquement en fin.
  - Indisponibilités ponctuelles du classifieur de sécurité et erreurs transitoires (`ENOMEM`, `spawn UNKNOWN`) → simples reprises.

### Point de décision en cours (fin de session)

V1-V3 étant actés, deux ordres possibles :

- **V4 d'abord** (recommandé) — onglet Pipeline : lancement + stepper de phases + questions de clarification. Indépendant du blocage LLM ; une fois livré, la démo full-pipeline pourra être pilotée depuis le navigateur dès que V8 fiabilisera l'analyst. Premier pas imposé par le cahier des charges : **croquis UX à faire valider avant tout code**.
- **V8 d'abord** — traiter le blocage DeepSeek/analyst pour débloquer la démo full-pipeline, puis revenir à l'UI.

*En attente du feu vert de l'utilisateur ; V4 n'est pas démarré.*

### État actuel

- Socle live opérationnel ; **Phase 3 V1 à V6 livrés et validés** (179 tests + cloud demo verte). **Reste V7-V9** : vérification & test multi-session (V7), prompts réels des agents business (V8), clôture (V9).
- **Dette / blocages connus** :
  - 🔄 **DeepSeek viable** : sondes reproductibles du 2026-07-26 montrent que `deepseek-v4-pro` fonctionne avec `generateText` + parsing manuel (le vrai chemin agent-runner). L'échec antérieur (`AI_APICallError`) concernait probablement `generateObject` (non supporté par DeepSeek), un chemin que le pipeline n'emprunte pas. DeepSeek est viable pour la démo full-pipeline. Deux réserves : latence ~3× Gemini (37s vs 13s pour l'analyst) et robustesse en runs répétés non encore prouvée.
  - `design-agent` génère des nœuds mais **0 edge** et jamais `finalizeDesign` (identique Gemini/DeepSeek → prompt, pas LLM).
  - 1 erreur lint préexistante dans `ai-sidebar.tsx` (set-state-in-effect, ligne 166).

### V4 — Onglet Pipeline (2026-07-25)

- **Demande** : onglet Pipeline dans la sidebar AI (mode auto-approve).
- **Réalisé** :
  - `ClarificationRunState.questions` enrichi avec le texte complet des questions (plus juste les IDs) — duplication pragmatique pour éviter un round-trip mémoire dans l'UI.
  - `GET /api/ai/run/state?runId=<triggerRunId>` — nouvel endpoint de consultation : phase, step, status, plan (stepper), questions de clarification, blockages. Auth/accès identiques au endpoint answers.
  - `components/editor/pipeline-tab.tsx` — composant autonome :
    - **Idle** : formulaire de lancement (textarea + bouton Launch + chips d'idées)
    - **Running** : stepper de phases (INTAKE → CLARIFICATION → REQUIREMENTS) avec badges de statut et icônes de progression, tracking temps réel via `useRealtimeRun`
    - **WAITING_CLARIFICATION** : cartes de questions interactives (inputs pré-remplis avec `suggestedDefault`), bouton Submit Answers → `POST /api/ai/run/answers`
    - **Terminal** : résumé DONE (succès) ou FAILED (avec blockages détaillés), bouton New Pipeline Run
  - Intégré comme 4ᵉ onglet (défaut `defaultValue="pipeline"`) dans `ai-sidebar.tsx`.
  - **157 tests** (6 nouveaux : route state). tsc, lint, build verts.
- **Écueils** : règles de lint React strictes (`react-hooks/refs` + `react-hooks/set-state-in-effect`) → refactor du guard de fetch (ref lue dans l'effet, pas pendant le render).

### V5 — Onglet Memory (2026-07-26)

- **Demande** : continuer le projet après analyse du `history_session.md`.
- **Réalisé** :
  - `GET /api/projects/[projectId]/memory` — endpoint de lecture mémoire (auth Clerk → accès projet → MemoryStore + PrismaPersistence → sections business + statuts). Codes 401/403/404/200.
  - `components/editor/memory-tab.tsx` — visualiseur de sections mémoire avec cartes expansibles :
    - **Project Brief** : nom, description, goals (GOAL-xx), scope IN/OUT, contraintes, assumptions (ASM-xxx)
    - **Actors** : cartes avec ID, nom, kind (human/system), rôle, description, goals
    - **Clarifications** : questions répondues (vert) / en attente (ambre), badge "Blocking" si bloquant
    - **Requirements** : ID, priorité (couleurs), kind, titre, description
    - **User Stories** : ID, epic, points, scénarios GIVEN/WHEN/THEN
    - **Business Rules** : ID, énoncé, appliesTo
    - **Entities** : cartes avec ID, nom, kind, description
    - Chaque section a un badge de statut : Valid (émeraude), Draft (bleu), Stale (ambre), Blocked (rouge), Missing (gris)
    - Bouton refresh + empty state + loading state + error state avec retry
  - Intégré comme 5ᵉ onglet "Memory" dans `ai-sidebar.tsx`.
  - **163 tests** (6 nouveaux : route mémoire). tsc, lint, build verts.

### V6 — Temps réel (2026-07-26)

- **Demande** : synchronisation temps réel pipeline + mémoire via Liveblocks, sans refresh manuel.
- **Réalisé** :
  - **Types & taxonomy** (`lib/realtime/types.ts`, `liveblocks.config.ts`) : 10 nouveaux types d'événements `RoomEvent` (run.started, run.status_changed, run.step_changed, run.waiting_clarification, run.resumed, run.completed, run.failed, memory.section_updated, memory.section_status_changed, clarification.updated). Payload minimal (projectId, runId, timestamp, sequence), jamais de secrets.
  - **Broadcaster serveur** (`lib/realtime/broadcaster.ts`) : `LiveblocksRealtimeEmitter` — adapter best-effort, échec = log + continue, jamais de throw. Size guard (1 KB cap).
  - **Guards purs** (`lib/realtime/guards.ts`) : fonctions de validation testables sans React (room guard, run guard, déduplication, ordre, clock skew).
  - **Engine modifié** (`lib/orchestrator/engine.ts`) : `emitter` optionnel dans `EngineDeps`, `sequence` counter, émission après chaque transition clé (start, step, waiting, resumed, completed/failed, memory.section_updated, memory.section_status_changed).
  - **Trigger orchestrator** (`trigger/orchestrator.ts`) : `LiveblocksRealtimeEmitter(projectId)` passé à l'engine.
  - **Answers route** (`app/api/ai/run/answers/route.ts`) : émission `clarification.updated` après soumission.
  - **Hook client** (`components/editor/use-pipeline-events.ts`) : écoute `useEventListener`, 6 garde-fous (room/run/dedup/order/timestamp skew/no loops), `mountKey` pour détection reconnexion, cleanup automatique.
  - **Pipeline tab** (`components/editor/pipeline-tab.tsx`) : refetch automatique sur événements run.*, reconnexion → refetch canonique.
  - **Memory tab** (`components/editor/memory-tab.tsx`) : refetch automatique sur événements memory.* + clarification.updated + run.completed.
  - **Tests** : guards.test.ts (7 tests, garde-fous purs), broadcaster.test.ts (4 tests, échec non-fatal + size guard + no-Liveblocks), engine-realtime.test.ts (5 tests, progression + clarification gate + memory updated + status changed + no-emitter). **16 nouveaux tests.**
  - **179 tests** (19 fichiers). tsc, lint, build verts.

### V7 — Vérification & sondes LLM (2026-07-26)

- **Demande** : vérifier le fonctionnement de l'API, des modèles LLM et du traitement des entrées utilisateur, puis exécuter le test multi-session.
- **Réalisé — vérifications automatisées** :
  - **Suite complète** : 179/179 tests, tsc 0 erreur, lint 0 erreur, build OK.
  - **Sondes LLM reproductibles** (scripts jetables exécutés puis supprimés) :
    - **Gemini** : `generateText` + parsing JSON manuel → ✅ 13s, enveloppe analyst valide (4 acteurs, 3 clarifications non-bloquantes).
    - **DeepSeek** : `generateText` + parsing JSON manuel → ✅ 37s, enveloppe analyst valide (4 acteurs, **2 clarifications bloquantes**).
    - `generateObject` (schéma natif) : Gemini échoue (schéma Zod incompatible avec `response_schema`), DeepSeek fonctionne mais avec warning (« responseFormat not supported »). Ce chemin n'est **pas** utilisé par le pipeline → non consigné comme dette.
  - **Endpoints API** : les 5 routes (memory, run, state, answers, liveblocks-auth) répondent 307 → Clerk. Tous les endpoints sont correctement protégés.
  - **Build production** : Next.js 16.2.4 OK, toutes les routes listées.
- **Corrections apportées** :
  - **Dette DeepSeek mise à jour** dans `project_state.md`, `handoff.md` et ce fichier : l'ancienne assertion « DeepSeek échoue sur les grosses enveloppes » est contredite par les sondes reproductibles. Le vrai flux (`generateText` + parsing) fonctionne. Deux réserves documentées : latence et robustesse en runs répétés.
  - **`.gitignore`** : ajout de `.trigger/dev.lock` et `.trigger/active-runs.json` (artefacts Trigger.dev dev).
  - **`ACT-1` → `ACT-User`** dans le test `engine-realtime.test.ts` (l'ID ne matchait pas le pattern `^ACT-[A-Za-z]`).
- **Non exécuté — test multi-session manuel** :
  - Trigger.dev `dev` nécessite un TTY pour le build du worker local → indisponible dans cet environnement headless.
  - Le test exige deux navigateurs avec des sessions Clerk distinctes (propriétaire + collaborateur).
  - **Plan de test fourni** : 6 scénarios (chargement initial, lancement pipeline, clarification, mémoire, reconnexion, état terminal), grille PASS/FAIL, consignes d'observabilité, critères de succès.
  - Scénarios documentés dans le corps de la réponse V7 ; prêts à être exécutés par l'utilisateur.
- **État V7** : ⬜ en attente du test multi-session. Tous les contrôles automatisables sont passés. Le passage à V8 est conditionné au succès du test manuel ou à la documentation explicite de la limite humaine.

### Méthode de travail observée dans cette session

L'utilisateur impose un protocole strict à chaque unité : **compréhension → analyse d'impact → TDD → plan → validation explicite → implémentation → vérification (tsc/lint/tests/build) → documentation**. En cas d'échec : s'arrêter au point précis, fournir étape/composant/message/cause/correction minimale **recommandée** (sans l'implémenter sans accord). Secrets : jamais affichés, jamais commités ; vérification systématique avant chaque commit.
