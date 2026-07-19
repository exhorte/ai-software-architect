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

- **Démo exécutée et verte** (détails ci-dessus). Run réel `run_cmrp915fbp41h0vok44ymfl2s`.
- **Nettoyage fait** : `trigger/_demo_waitpoint.ts` et `scripts/_run-demo.ts` supprimés ; redéploiement Trigger propre (retour à 4 tâches). 151 tests toujours verts, typage propre.
- **Documentation synchronisée** : `phase-03-business-team.md` (change log V3 + robustesse + démo), `project_state.md` (décisions + dette), `handoff.md` (prochaine étape V4).

### État actuel

- Socle live opérationnel ; **Phase 3 V1+V2+V3 livrés et validés** (151 tests + démo cloud verte). **Reste V4-V9** : onglet Pipeline (V4), onglet Mémoire (V5), temps réel (V6), vérification (V7), prompts réels des agents business (V8), clôture (V9).
- **Dette / blocages connus** :
  - `deepseek-v4-pro` échoue sur la grosse enveloppe de l'analyst → la démo *full-pipeline* (idée → question bloquante → réponse → requirements) dépend de **V8**.
  - `design-agent` génère des nœuds mais **0 edge** et jamais `finalizeDesign` (identique Gemini/DeepSeek → prompt, pas LLM).
  - 4 erreurs lint préexistantes dans `components/editor/canvas/*` et `liveblocks.config.ts`.

### Méthode de travail observée dans cette session

L'utilisateur impose un protocole strict à chaque unité : **compréhension → analyse d'impact → TDD → plan → validation explicite → implémentation → vérification (tsc/lint/tests/build) → documentation**. En cas d'échec : s'arrêter au point précis, fournir étape/composant/message/cause/correction minimale **recommandée** (sans l'implémenter sans accord). Secrets : jamais affichés, jamais commités ; vérification systématique avant chaque commit.
