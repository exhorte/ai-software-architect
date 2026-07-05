# Handoff

> **Rôle** : Journal de passation vivant entre sessions de travail. Là où `project_state.md` garde l'état durable du build (phases, décisions, historique), ce fichier capture le *fil de la discussion en cours* : ce qu'on vient de faire, ce qui est en vol, la prochaine action immédiate, et le contexte qu'une nouvelle session doit connaître pour reprendre sans friction.
> **Utilisé** : Lu au début de chaque session (juste après `project_state.md`) ; mis à jour en continu pendant la session et obligatoirement avant de la clore.
> **Lu par** : Claude Code et le développeur.
> **Écrit par** : Claude Code et le développeur, au fil des discussions.
> **Conventions** : En français (document de travail avec l'utilisateur ; les fichiers système restent en anglais). Toujours daté. On remplace les sections — pas d'accumulation infinie : l'historique durable part dans `project_state.md`, le détail dans git. Max ~1 page.

---

## Session en cours

- **Date** : 2026-07-05
- **Objectif** : Phase 0 — refonte des fondations (`.claude/context/`, points d'entrée, permissions) + nettoyage des artefacts hérités + consolidation totale du savoir dans `.claude/context/`.
- **Statut** : ✅ Terminée et clôturée. Phase 0 complète ; le cerveau est désormais l'unique base de connaissances (46 fichiers).

## Ce qui vient d'être fait

1. Analyse complète du dépôt Ghost AI (code applicatif conservé intégralement — c'est le véhicule de livraison).
2. Cerveau `.claude/context/` créé : 41 fichiers (coordinator ×4, memory ×4, agents ×18, prompts ×3, schemas ×4, templates ×5, rules ×3). Tous les JSON parsent.
3. `CLAUDE.md` racine réécrit en point d'entrée léger ; `AGENTS.md` aligné ; docs Trigger.dev déplacées vers `docs/vendor/trigger-v4-rules.md`.
4. `context/` racine mis à jour : `project-overview.md` réécrit pour la nouvelle vision, `progress-tracker.md` archivé (remplacé par `project_state.md`), liens corrigés.
5. `.claude/settings.json` : allowlist ajoutée (lint, build, tsc --noEmit, prisma validate/format) — validée explicitement par l'utilisateur.
6. **Git initialisé** (le dossier n'était pas un dépôt) ; commit de sauvegarde `4a0365d` pris avant nettoyage.
7. **Nettoyage validé par l'utilisateur** : supprimés `context/feature-specs/` (29 specs historiques), `context/screenshots/`, `docs/superpowers/`, `public/readme/` + `public/thumbnails/` (assets marketing JSM). README réécrit pour le produit AI Software Architect. Commit `17ef040`.
8. Ce fichier handoff créé et intégré au chargement systématique de session (`CLAUDE.md` § Context Loading) ; `project_state.md` synchronisé (Phase 0 close, décisions et questions ouvertes à jour).
9. **Consolidation finale** : `context/` racine absorbé dans `.claude/context/platform/` (overview, architecture, ui, code_standards, dev_workflow — adaptés aux conventions du cerveau) ; `context/progress-tracker.md` supprimé (historique complet : `git show 4a0365d:context/progress-tracker.md`) ; `docs/vendor/trigger-v4-rules.md` supprimé (redondant avec les skills `.agents/skills/trigger-*`). Dossiers racine `context/` et `docs/` supprimés ; toutes les références (CLAUDE.md, AGENTS.md, cerveau, README) mises à jour.

## En vol / non terminé

- Rien de bloquant. Aucune modification du code applicatif (voulu — Phase 0 = documentation/fondations uniquement).

## Prochaine action immédiate

- **Phase 1 — Shared Memory runtime** : concevoir le modèle Prisma du document de mémoire partagée (1 document par projet, statuts de section, versionnage) + module de validation contre `schemas/project.schema.json`. Commencer par une proposition de schéma Prisma avant tout code.

## Décisions récentes à connaître (détail : project_state.md § Decisions Log)

- `CLAUDE.md` reste à la racine (auto-chargé par Claude Code) ; le savoir vit dans `.claude/context/`.
- Fiches agents = source de vérité des prompts runtime (chargées par le futur orchestrateur Trigger.dev).
- Échanges inter-agents : JSON validé par schéma uniquement ; un propriétaire par section mémoire.
- Conventions canvas du design-agent promues en grammaire visuelle système (`prompts/output_formats.md`).

## Questions ouvertes pour l'utilisateur

- Nom définitif du produit (placeholder : **AI Software Architect**) — le `package.json` s'appelle encore `ghost-ai`, à renommer en même temps.
- Formats d'export au-delà du bundle Markdown (PDF ? OpenAPI ?) — à trancher avant Phase 5.
- Créer un dépôt distant (GitHub) pour pousser l'historique git local ?

## Pièges connus

- Next.js 16 : breaking changes — vérifier `node_modules/next/dist/docs/` avant tout code framework ; `proxy.ts` remplace `middleware.ts`.
- Prisma 7 : client généré dans `app/generated/prisma/`, constructeur exige `{ adapter }`.
- Ne pas toucher `components/ui/*` (shadcn) ni les internals tiers.
