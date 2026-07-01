# Plan d'implémentation — Staging par hunk / ligne

> Référence durable pour la feature **P0 #1** de [`ROADMAP.md`](../../ROADMAP.md) : valider/dévalider
> une *partie* d'un fichier (hunk puis ligne) au lieu du staging fichier-seul actuel.
> Issu d'une analyse multi-agents (compréhension du code + recherche web + conception
> concurrente + critique adversariale). À transformer en ADR une fois les questions ouvertes tranchées.

## TL;DR — approche retenue

Synthétiser un patch unifié côté Rust et le passer à un **unique** `git apply --cached [--reverse]`
atomique, en restant dans le shell-out déjà isolé de `index_write.rs` (conforme à CLAUDE.md /
ADR 0001). Livraison **hunk d'abord** (≈ 80 % de la valeur, granularité aimée de gitui), puis
**ligne** en v2. Un fichier partiellement stagé est accepté **dans les deux sections à la fois**
(aucun changement de schéma).

Pourquoi pas le natif gix : `gix-index` add/remove est toujours `[ ]` dans `crate-status.md`
(seulement le `dangerously_push_entry` non coché, écriture V2/V3 qui *perd* les extensions
UNTR/FSMN/split-index), sans filet `git apply`. On reste sur le shell-out jusqu'à ce que gitoxide
bénisse cette API.

## ⚠️ Découverte critique — d'où viennent les octets du patch

**On ne peut pas synthétiser le patch depuis le diff gix.** `diff.rs` appelle
`prep.interned_input()` (gix-diff 0.60) qui utilise `intern_source_strip_newline_separators()` →
imara-diff `byte_lines` avec `INCLUDE_LINE_TERMINATOR=false` : chaque ligne est tronquée de son
`\n` **et** d'un éventuel `\r` précédent. Les octets du *sink* (et le `content` envoyé en IPC) ne
sont donc **pas** identiques au blob : le statut CRLF et la présence/absence de newline finale sont
perdus.

**Conséquence** : tout patch dérivé du diff casserait CRLF (Windows) et no-newline-at-EOF.
**Correctif** : chaque octet émis vient des **flux bruts** —
- *staging* : ancien = blob d'index, nouveau = fichier worktree ;
- *unstaging* : ancien = blob HEAD, nouveau = blob d'index.

Découpés par un splitter **préservant les terminateurs**, indexés par les `old_no`/`new_no` du hunk
fraîchement re-diffé. CRLF, no-newline, et non-UTF-8 transitent alors à l'octet près.

## Modèle de données — l'overlap est accepté

Un fichier partiel est **présent simultanément** dans `RepoStatus.unstaged` (À reviewer, hunks
restants) et `RepoStatus.staged` (Validé, hunks validés). **Zéro changement backend/wire** :
`status.rs` pilote les deux sections depuis les deux itérateurs gix (`index_worktree`,
`tree_index`), et un fichier partiel diffère réellement worktree↔index ET index↔HEAD → gix l'émet
des deux côtés. La disjonction actuelle est un effet de bord du staging fichier-seul, pas un
invariant. Pas de nouveau champ `StatusEntry`, pas de tri-state.

La couche **contenu** est déjà prête : `use-diff-store.ts` `sectionCache` est keyée par section,
`diffFor`/`select` résolvent par `{section, path}`, `RowEnd` lit `counts[section][path]` — donc un
fichier des deux côtés affiche déjà uniquement ses hunks restants en À reviewer et ses hunks validés
en Validé, avec des `+N/−N` indépendants. `partial` est **dérivé côté client** (`path ∈ unstaged ∩
staged`), jamais stocké.

Seule addition wire (entrante) : **`HunkSelection`**
```
{ hunk, oldStart, oldLines, newStart, newLines, fingerprint, lines: number[] | null }
```
- `fingerprint` = hash de contenu (FNV-1a hex sur `${sign}${content}\n` par ligne, calculé à
  l'identique front et back). C'est le **vrai garde-fou de péremption** : le tuple de 4 entiers seul
  ne détecte pas une ré-édition à compte égal, qui staggerait du contenu non vu et casserait
  l'invariant *montré == stagé* d'ADR 0001.
- `lines: null` = hunk entier (v1) ; `lines: [...]` = indices dans `Hunk.lines` (v2).

`DiffFile`/`Hunk`/`Line` restent Serialize-only : les octets fidèles sont sourcés backend, ils ne
traversent jamais l'IPC.

## Backend (Rust)

| Fichier | Changement |
|---|---|
| `git/index_write.rs` | Factoriser la queue d'`exec` en `map_spawn_err` + `map_exit` (anti-duplication). Ajouter `exec_stdin(root, args, patch)` : stdin/stdout/stderr piped, écriture du patch depuis un **thread dédié** qui avale `BrokenPipe` (pour remonter le vrai stderr de git, pas « broken pipe »), puis `wait_with_output`. Ajouter `apply_partial(root, patch, reverse)` : **un seul** `git -C <root> -c core.autocrlf=false -c core.safecrlf=false apply --cached --whitespace=nowarn --recount [--reverse] -` (pas de `--check` séparé — apply est atomique, donc pas de demi-staging). Exposer `apply_partial_patch(...)`. Passer `reject_unsafe_str` en `pub(super)` **et** lui faire rejeter les octets de contrôle (NUL/`\n`/`\r`) — le chemin est écrit dans les en-têtes `a/`,`b/`, un `\n` injecterait des lignes de patch. |
| `git/hunk_patch.rs` *(nouveau, pur)* | `raw_lines(&[u8])` (split préservant les terminateurs, règle de frontière exacte d'imara) ; `quote_path` (quoting c-style de git) ; `hunk_fingerprint(&Hunk)` (hash canonique ↔ TS) ; `build_patch(file, hunk, raw_old, raw_new, selection, reverse)` : préambule par fichier (`diff --git`, `old/new mode` **quand** delta de mode présent pour que le mode soit stagé AVEC le hunk, `index <o>..<n>` si les deux OIDs existent, `---`/`+++` quotés) + **un** hunk reproduisant l'en-tête `@@` **verbatim** de gix (v1, aucune arithmétique) ; chaque ligne = slice brut à son `old_no`/`new_no` ; `\ No newline at end of file` ssi le dernier slice émis d'un côté n'a pas de `\n` final. v2 ajoute la transformation paramétrée par `reverse` + recompute des **comptes** seulement. |
| `git/diff.rs` | `pub(super) fn diff_one(repo, path, section)` : trouve l'entrée, lance l'`assemble` **existant** pour ce seul fichier (hunks byte-for-byte identiques à l'affichage) et renvoie le `DiffFile` frais + les deux côtés `(ObjectId, EntryMode)`. Court-circuit dès le match (le blob-diff coûteux ne tourne que pour 1 fichier). Pas de duplication de la logique de walk dans `partial.rs`. |
| `git/partial.rs` *(nouveau, orchestration)* | `stage_partial`/`unstage_partial` : valide `file`, découvre le repo, appelle `diff_one`, **rejette → dégrade en fichier entier** tout non-`Modified` en v1 (binaire/submodule/conflit/type-change/rename ; untracked/intent-to-add/added/deleted). Pour chaque `HunkSelection` : vérifie tuple **ET** `hunk_fingerprint == fingerprint`, sinon `GitError::Index("le diff a changé, rechargez")`. Lit les octets bruts (index/worktree/HEAD via `repo.objects.find`), construit le patch, applique. v2 ajoute les patches `/dev/null` création/suppression. |
| `git/mod.rs` | `mod hunk_patch; mod partial;` + re-export ; ajouter le `#[derive(Deserialize)] struct HunkSelection` (camelCase). |
| `commands/mod.rs` | Deux wrappers `spawn_blocking` `stage_partial`/`unstage_partial(path, file, selection: Vec<HunkSelection>)`. |
| `lib.rs` | Enregistrer les 2 commandes dans `generate_handler!`. |

## IPC

```rust
async fn stage_partial(path: String, file: String, selection: Vec<HunkSelection>) -> Result<(), GitError>
async fn unstage_partial(path: String, file: String, selection: Vec<HunkSelection>) -> Result<(), GitError>
```
`unstage_partial` construit le patch depuis le diff stagé (HEAD→index) en octets bruts HEAD/index et
fait `git apply --cached --reverse`. En-tête gix verbatim **correct pour le reverse** car
`after_hunk_start` est déjà la position côté index. Sur mismatch fingerprint → erreur, le store
rafraîchit toujours (le hunk périmé disparaît).

## Frontend (React/TS)

| Fichier | Changement |
|---|---|
| `lib/git.ts` | Interface `HunkSelection` (readonly, camelCase, `fingerprint`) + wrappers `stagePartial`/`unstagePartial`. |
| `lib/hunk-fingerprint.ts` *(nouveau)* | `hunkFingerprint(hunk): string`, hash canonique identique au Rust (test colocalisé qui épingle la sérialisation pour interdire toute dérive front/back). |
| `features/review/diff/flatten-hunks.ts` | Identité de ligne : `hunkIndex` + tuple d'en-tête sur `HunkHeaderRow` ; `hunkIndex` + `lineIndex` sur `LineRow`. |
| `features/review/diff/hunk-context.tsx` *(nouveau)* | Contexte `HunkActions { stageHunk, unstageHunk }` (miroir de `row-context.tsx`), fourni par `DiffPanel`, réutilise le pattern optimiste + `pendingPaths`. |
| `features/review/diff/diff-view.tsx` | Dans la branche en-tête : `IconButton` Radix révélé au survol **uniquement si `changeKind === 'modified'`** (le court-circuit `isBinary \|\| hunks.length===0` ne couvre pas untracked/added/rename qui ont des hunks) — `CheckIcon` « Valider ce hunk » (unstaged) / `UndoIcon` « Renvoyer en review » (staged) + `+N−N` par hunk. **Ne pas** toucher `ROW_HEIGHT=20` ni la largeur de gouttière. |
| `features/review/diff/diff-panel.tsx` | Fournit `HunkActions` et passe `selected.section` à `<DiffView>`. |
| `stores/use-repo-store.ts` | `stagePartial`/`unstagePartial` via une variante de `mutateIndex` qui **rafraîchit toujours, succès OU échec** (un rejet « diff périmé » DOIT recharger). `stagePartial` arme `reviewedHere` (validated=true) ; `unstagePartial` non. |
| `features/review/review-stats.ts` | Corriger le double-comptage : `remaining = unstaged.length` ; `reviewed = |staged \ unstaged|` (fichiers **entièrement** validés seulement) ; `total = |unstaged ∪ staged|` ; `complete = total>0 && remaining===0 && reviewedHere`. |
| `features/review/sidebar.tsx` | Dériver le Set `partial = unstaged ∩ staged`, le passer aux deux `StatusSection`. |
| `features/review/file-row.tsx` + `tree-view.tsx` | Prop `partial?`, l'ajouter aux comparateurs memo ; badge discret « partiel » (pas de tri-state). |
| `features/review/diff/diff-line.tsx` *(v2)* | Sélection = teinte de fond + fin liseré gauche (**pas** de colonne de gouttière) ; clavier mode-visuel local au panneau (`v`, `j/k`, Enter), distinct de `use-sidebar-keyboard.ts`. |

## Matrice des cas limites

| Cas | Traitement |
|---|---|
| **CRLF / autocrlf / gitattributes eol** | Cause vérifiée : gix strippe `\r`. Synthèse depuis octets bruts + `-c core.autocrlf=false -c core.safecrlf=false --whitespace=nowarn`. Le blob d'index garde `\r\n` à l'octet près. |
| **No-newline-at-EOF** | Marqueur dérivé directement du slice brut (pas de lecture de queue de blob séparée). Marche en v1. |
| **Ligne EOF de contexte au statut newline divergent** | gix mappe les deux au même token → aucun hunk (invisible, hérité de l'affichage). Le contexte vient toujours du côté index → la pré-image matche toujours, jamais de faux marqueur. |
| **Whitespace-only** | `--whitespace=nowarn`, pas d'`--ignore-whitespace` → contexte byte-for-byte. |
| **Binaire / submodule / conflit / type-change / rename non-stagé** | Sans hunk ; bouton gaté `changeKind==='modified'` ; `partial.rs` rejette → fichier entier. |
| **Rename stagé AVEC édits** | A de vrais hunks en Validé ; le gate front les supprime ; `partial.rs` rejette → unstage fichier entier. |
| **Untracked / intent-to-add (Added) / new file** | v1 dégrade en fichier entier (pas de vraie baseline) ; v2 : patch création `/dev/null` avec les lignes choisies. |
| **Fichier supprimé** | v1 : le hunk unique == le fichier → routé vers `stage_file` (vraie suppression, pas un fichier vide). v2 : patch suppression `/dev/null`. |
| **Changement contenu + mode** | `build_patch` émet `old/new mode` au 1ᵉʳ hunk → le mode est stagé avec lui, pas de delta de mode orphelin qui épingle le fichier. |
| **Diff périmé / TOCTOU (même tuple, contenu différent)** | Fingerprint de contenu + re-diff frais → rejet « le diff a changé, rechargez » ; apply atomique → pas de demi-staging. Résiduel accepté : deux lignes non-UTF-8 distinctes collidant en U+FFFD. |
| **Chemin avec espace/tab/quote/non-ASCII** | `quote_path` (c-style), validé contre `git apply` réel. |
| **Chemin avec NUL/newline/contrôle** | `reject_unsafe_str` étendu, avant synthèse. |
| **Gros hunk / gros patch** | Streamé sur stdin depuis un thread dédié (jamais argv) ; pas de limite. |
| **git absent** | `map_spawn_err` partagé → « git introuvable… » au spawn. |
| **Fichier partiel des deux côtés (comptage)** | Overlap accepté ; les en-têtes de section peuvent sommer au-dessus du total (modèle VS Code), épinglé par test comme contrat conscient. |
| **`reconcile` au dernier hunk** | Stage dernier hunk → suit le fichier vers staged si d'autres fichiers restent, sinon ferme sur burn-down. Unstage dernier hunk stagé → la sélection saute en unstaged. Branches existantes, désormais testées. |
| **gitattributes clean-filter** | `git apply --cached` écrit les octets littéraux ; le blob stagé == octets relus (peut différer de ce que `git add` re-filtré stockerait). Limite connue de tout staging partiel par patch. *(Question ouverte.)* |
| **« Tout valider/dévalider » sur un fichier partiel** | Granularité fichier intentionnelle : effondre l'état partiel. Documenté. |

## Phasage

- **Phase 0 — cœur backend pur** : `index_write` (helpers, `exec_stdin`, `apply_partial`,
  `reject_unsafe_str`), `hunk_patch` (raw_lines, quote_path, fingerprint, `build_patch` hunk-entier).
  Tests Rust en table. *Non visible ; primitive de synthèse + apply atomique testée.*
- **Phase 1 — orchestration + IPC** : `diff_one`, `partial.rs` (gardes + routage dégradé),
  `HunkSelection`, commandes + handler, bindings TS + `hunk-fingerprint.ts` + actions store
  (always-refresh-on-failure). *Bout-en-bout invocable (sans UI) ; tests TempRepo prouvant la
  fidélité octet (CRLF/no-newline/non-UTF-8), l'overlap, le miroir unstage, les dégradés.*
- **Phase 2 — comptage overlap** : `review-stats` union/diff, Set `partial`, badge « partiel »,
  tests `reconcile`. *Burn-down correct même avant l'UI hunk (ex. fichier pré-stagé par un agent).*
- **Phase 3 — UI hunk (le 80 %, v1)** : identité de ligne `flatten-hunks`, `hunk-context`, bouton
  gaté + `+N−N` dans `diff-view`, section via `DiffPanel`. *→ ROADMAP P0 #1 fermé à la granularité hunk.*
- **Phase 4 — ligne (v2)** : transformation paramétrée `reverse` + recount + côté 0-start ; patches
  `/dev/null` création/suppression ; sélection `diff-line` (teinte + liseré) + clavier mode-visuel.
- **Phase 5 — polish + docs** : vérif CRLF/whitespace/gitattributes ; MAJ ADR 0001 (granularité
  livrée, rationale shell-out, le finding imara strip-newline), `src-tauri/CLAUDE.md`, ROADMAP P0 #1.

## Tests (extraits clés)

- **Rust `hunk_patch` (pur)** : en-tête `@@` verbatim forward+reverse ; `raw_lines` ↔ frontières
  imara (ligne finale sans `\n`, ligne CRLF `\r` préservé) ; marqueur no-newline correct ; lignes
  `old/new mode` seulement si delta ; sélection vide → `None`.
- **Rust `partial.rs` fidélité octet (TempRepo, vrai `git apply`)** : après staging d'un hunk d'un
  fichier CRLF, `git cat-file blob :<path>` **byte-identique** au worktree ; no-newline préservé ;
  non-UTF-8 sans dégât U+FFFD.
- **Rust gardes** : édition entre capture et apply qui **préserve le tuple** mais change le contenu →
  rejetée par le fingerprint (prouve l'insuffisance du tuple seul) ; non-`Modified` rejetés ; chemin
  avec contrôle rejeté ; chemin espace/non-ASCII round-trip.
- **Rust `index_write`** : patch non-applicable → exit non-zéro en `GitError::Index`, index
  **intact** (atomique), stderr de git (pas « broken pipe ») ; binaire manquant → « git introuvable… ».
- **Vitest** : `flatten-hunks` (identité de ligne) ; `hunk-fingerprint` (sérialisation épinglée) ;
  `review-stats` (partiel compté une fois en total, exclu de reviewed, `complete` reste faux) ;
  `use-diff-store reconcile` (transitions dernier hunk) ; `use-repo-store` (refresh sur échec,
  `reviewedHere`, anti-double-apply) ; `diff-view` (bouton présent ssi `modified`).

## Décisions arrêtées (2026-07-01)

Les 8 questions ouvertes sont tranchées (Q2/Q3 confirmées par l'utilisateur ; Q1/Q4/Q5/Q7 adoptées
sur recommandation ; Q6/Q8 confirmées). Base pour passer à l'ADR.

1. **gitattributes clean-filter / eol** → **octets littéraux (WYSIWYG)**. On stage exactement les
   octets relus, comme tout GUI par patch ; pour un outil de relecture, valider ce qu'on a vu prime.
   Divergence rare avec un `git add` re-filtré acceptée ; `autocrlf`/`safecrlf` forcés off.
2. **Granularité de la progression** → **niveau fichier**. Un fichier partiel compte comme non-relu
   tant qu'il a des hunks en À reviewer ; « À reviewer vide = fini » reste littéralement vrai.
3. **Fichiers tout-ajout/tout-suppression (untracked, added, deleted) en v1** → **dégrader en fichier
   entier**. Les patches `/dev/null` création/suppression arrivent en v2.
4. **Visuel sélection de lignes (v2)** → **teinte + liseré gauche**, pas de colonne de gouttière
   (préserve `ROW_HEIGHT=20` et la math de largeur/gouttière).
5. **Clavier burn-down local au panneau** (`j/k`, Enter = valider+avancer) → **différé en v2**, livré
   avec la sélection de lignes. v1 reste souris/bouton.
6. **Rejeter/discard un hunk** (ROADMAP P0 #2, écriture destructive) → **hors scope**. Effort séparé,
   confirm-gardé, réutilisant ce moteur en `git apply --reverse` (sans `--cached`) sur le worktree.
7. **`--3way`** → **non, apply atomique déterministe**. Le re-diff frais + garde fingerprint juste
   avant l'apply garantit déjà un patch propre ; pas de marqueurs de conflit possibles.
8. **`stage_file`/`unstage_file` entier** → **gardés tels quels** à côté du chemin partiel (« tout
   valider », fichiers non-`Modified`). Consolidation seulement si gix bénit index add/remove natif.

## Sources principales

git-apply / git-add docs · git `add-patch.c` · lazygit `patch/transform.go`,`hunk.go` · Magit
`magit-apply.el` + issue #3182 (recompute new_start) · git-cola `diffparse.py` · thoughtbot
intent-to-add · gitoxide `crate-status.md` (index add/remove toujours `[ ]` ; **repo épinglé** gix
0.80 / gix-diff 0.60 / gix-index 0.48 par `Cargo.lock`, pas les dernières publiées) ·
VS Code / Sublime Merge / GitKraken / GitHub Desktop partial-commit · difit / diffity.

> **Note versions (2026-07-01)** — `gix-diff 0.60` tire **à la fois** `imara-diff 0.1.8` et `0.2.0`
> dans le `Cargo.lock`. Le finding « octets bruts » ne dépend PAS de savoir laquelle est utilisée :
> il est prouvé en repo par `diff.rs:298` (`to_str_lossy` → lossy non-UTF-8) et un test existant
> assérant `content == "line16"` (sans `\n` → terminateur retiré). Le strip du `\r` (CRLF) est le
> seul détail lié à la version d'imara — à épingler en Phase 0, sans impact sur la décision.
