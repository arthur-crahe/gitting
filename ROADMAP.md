# Roadmap — Gitting

> Source de vérité unique des features à venir. Les décisions d'architecture actées vivent
> dans `docs/adr/` ; ce fichier **priorise et suit** ce qui reste à construire. Quand un item
> est livré, on coche la case et on le relaie dans `CHANGELOG.md`.

**État au 2026-06-29 (v0.6.0)** — la boucle de relecture v1 est complète : deux sections
*À reviewer* / *Validé*, staging fichier comme curseur de review, diff unifié virtualisé
(Shiki), sidebar filtrable (tree/list, navigation clavier, burn-down, `+/−`), sidebar
redimensionnable, updater in-app. Pas de commit / historique / branches / blame, par choix.

**Légende** — `[ ]` à faire · `[x]` livré. Priorités :
**P0** parité « vrai reviewer » · **P1** créneau différenciant + ergonomie · **P2** couche
locale additionnelle. La mention *Origine : ADR xxxx* signale un item déjà cadré par une
décision d'architecture.

---

## P0 — Parité « vrai reviewer »

Le minimum attendu de tout outil de relecture de diff sérieux (Sublime Merge, VS Code,
lazygit, gitui). Tant que ces points manquent, Gitting perd le face-à-face sur la review brute.

- [ ] **Staging par hunk / ligne** — valider une partie d'un fichier et laisser le reste à
  reviewer. C'est le gap n°1 : aujourd'hui le staging est fichier-seul, donc impossible
  d'accepter le bon 90 % et de rejeter le scope-creep de l'agent.
  *Origine : ADR 0001 (staging fichier livré, hunk/ligne différé). Nécessite un backend de
  staging partiel (`git apply --cached`), au-delà de `index_write.rs` actuel.*
  **Hunk livré en v0.7.0** (bouton par bloc, modèle overlap « partiel », ADR 0004). Reste la
  **sélection ligne-à-ligne (v2)** — décoché tant qu'elle n'est pas là.
  Plan détaillé : [`docs/reference/partial-staging-plan.md`](docs/reference/partial-staging-plan.md)
  (patch synthétisé depuis les octets bruts — pas le diff gix qui strippe `\r`/`\n`).
- [ ] **Rejeter un hunk / une ligne** — discard/revert ciblé sur le working tree, le pendant
  « refus » du staging ; pour relire un agent, rejeter compte autant qu'accepter.
  *Écriture destructive sur le disque : prévoir une confirmation.*
- [ ] **Recherche dans le diff** — `Ctrl-F` à travers les changements affichés (aujourd'hui :
  filtre limité à la liste de fichiers de la sidebar).
- [ ] **Auto-refresh (file watching)** — recharger automatiquement quand l'agent écrit des
  fichiers pendant que l'app est ouverte (aujourd'hui : rafraîchissement manuel via le menu).
- [ ] **Vue côte-à-côte (side-by-side)** — bascule avec le diff unifié actuel.
- [ ] **Diff intra-ligne (mot-à-mot)** — surligner le(s) token(s) réellement modifié(s) dans
  une ligne ; très utile pour les edits IA d'un seul mot.
  *Origine : ADR 0001 (diff-match-patch déjà prévu).*

## P1 — Boucle agent & ergonomie

Le créneau que personne n'occupe : prolonger l'actif propre de Gitting (staging = curseur de
review + burn-down, qu'aucun GUI ne modélise) vers la boucle de retour à l'agent.

- [ ] **Notes / commentaires** — annoter lignes et fichiers pendant la review.
  *Prérequis de l'export prompt agent ci-dessous.*
- [ ] **Commentaires → prompt agent** — sélection de lignes + commentaire → prompt structuré
  prêt à renvoyer à l'agent (Claude Code / Cursor). Le différenciateur ; signature de difit,
  là où VS Code ne suivra structurellement pas.
  *Dépend des notes / commentaires.*
- [ ] **Command palette** — palette d'actions au clavier (style Sublime Merge / VS Code), en
  complément de la navigation clavier déjà présente.
- [ ] **Persistance d'état** — mémoriser la progression de review, le dernier dépôt et les
  dépôts récents.
  *Origine : ADR 0002 (migrations versionnées, idempotentes, keyées sur `schema_version`).*

## P2 — Couche locale additionnelle

- [ ] **Détection de secrets** — repérer clés / credentials introduits dans le diff avant
  validation. 100 % local, sans modèle requis.
- [ ] **Diff image / binaire** — aperçu des images modifiées (side / swipe / onion) au lieu
  d'une simple mention « binaire ». Standard chez Fork et GitHub Desktop.

## Idées en réserve (non priorisées)

Gardées pour ne rien perdre ; à promouvoir vers P0/P1/P2 si l'on décide de s'y engager.

- [ ] **Triage par risque** — flag automatique : gros ajouts, tests / fichiers supprimés,
  secrets, fichiers hors-scope. Aide à ne pas rubber-stamper un diff de 600 lignes.
  *Recoupe partiellement « Détection de secrets » (P2).*
- [ ] **Résumé IA des changements** — TL;DR par fichier et global du diff.
  *Pour préserver le « fully local » : bring-your-own-key ou modèle local — sinon casse le
  positionnement sans backend.*
- [ ] **Création de commit** — composer un commit depuis la section *Validé*. Décision de
  périmètre à acter : Gitting reste-t-il « review-only » ou ferme-t-il la boucle jusqu'au commit ?
- [ ] **Message de commit généré (IA)** — titre + description depuis le diff validé (précédent
  Copilot / GitHub Desktop 3.5). *Dépend de la création de commit.*

## Dette technique (perf)

L'app reste fluide sur un diff d'agent typique ; ce point plafonne sur de très gros changesets.

- [ ] **Liste de fichiers virtualisée** — le diff est virtualisé, pas la sidebar : sur un très
  gros changeset chaque validation re-rend toutes les lignes (déjà mémoïsées). Virtualiser la
  liste plate lèverait ce plafond. *Note : les compteurs `+/−` et le rendu sont désormais servis
  par un seul chargement des deux sections (`use-diff-store`), au prix d'un payload IPC portant
  tous les hunks ; un diff par fichier l'allégerait, mais re-fetcherait à chaque navigation.*

---

## Veille concurrentielle (résumé)

- **Même créneau** : [difit](https://github.com/yoshiko-pg/difit) et
  [diffity](https://github.com/kamranahmedse/diffity) — relire les changements locaux d'un
  agent IA, mais centrés navigateur / CLI et sur l'export de commentaires en prompt.
- **Parité table-stakes** (Sublime Merge, VS Code, GitKraken, Fork, Tower, lazygit, gitui,
  git-cola) : staging hunk/ligne, discard/revert, side-by-side, diff intra-ligne, recherche
  dans le diff, auto-refresh.
- **Actif propre à prolonger** : staging = curseur de review + burn-down. Aucun client GUI ne
  modélise l'état de review ; le plus proche est la case « Viewed » de GitHub, web/PR seulement.
