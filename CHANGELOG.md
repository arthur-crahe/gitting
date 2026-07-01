# Changelog

Notes de version de Gitting, de la plus récente à la plus ancienne, à destination des utilisateurs. Le format suit [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) et le projet respecte le [versionnage sémantique](https://semver.org/spec/v2.0.0.html). Chaque section est générée par la commande `/release` comme un résumé orienté utilisateur des changements depuis la version précédente, et devient la description de la Release GitHub correspondante.

<!-- release:anchor — /release inserts the new version section directly below this line -->

## [0.7.0] - 2026-07-01

### Nouveautés
- Validation par bloc : valider — ou renvoyer en review — un bloc de modifications (hunk) précis d'un fichier, sans traiter tout le fichier d'un coup. L'action apparaît au survol de l'en-tête d'un bloc dans le diff.
- Un fichier partiellement validé apparaît désormais dans les deux sections à la fois, marqué « partiel » ; la progression le compte comme restant à reviewer tant qu'il lui reste des blocs.

## [0.6.1] - 2026-06-30

### Corrections
- Sous Windows, plus de fenêtre console qui apparaît brièvement pendant les opérations git.
- Le redimensionnement de la barre latérale par glissement fonctionne de nouveau.

### Autres améliorations
- Refactorisation interne.

## [0.6.0] - 2026-06-29

### Nouveautés
- Validation en lot : un bouton « Tout valider » / « Tout dévalider » par section traite d'un coup tous les fichiers affichés, en tenant compte du filtre actif.
- Navigation au clavier fluidifiée : maintenir une flèche pour parcourir la liste reste réactif, même sur de gros diffs.
- Numéros de ligne épinglés : la colonne des numéros et la plage du hunk restent visibles lors du défilement horizontal du code.
- Fichiers non suivis détaillés : un nouveau dossier est présenté fichier par fichier — chacun relisible séparément avec son propre diff — au lieu d'une seule ligne de dossier opaque.
- Défilement à la molette plus fluide sous Linux.

## [0.5.0] - 2026-06-20

### Nouveautés
- Visualiseur de diff complet avec coloration syntaxique, parcouru fichier par fichier dans un panneau maître-détail.
- Review au niveau du fichier : validez un fichier (stage) ou renvoyez-le à reviewer (unstage) d'un geste.
- Barre latérale repensée : filtre, statistiques par fichier, suivi d'avancement (burn-down), navigation au clavier et largeur ajustable.

### Corrections
- Le diff reste affiché dans les cas limites (changements de type, entrées non suivies, sous-modules, erreurs de statut).
- L'état du diff est correctement réinitialisé au changement de dépôt.

### Autres améliorations
- Améliorations de performance.
- Améliorations de sécurité.
