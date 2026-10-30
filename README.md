# Christian Cailleau — les tableaux

Site vitrine statique : une page, trois vues (la galerie, la fiche d'un tableau, À propos).
Vue 3 chargé depuis un CDN, pas de build.

## Après une modification du CSS ou du JS

Changer le numéro `?v=` des deux lignes `styles.css?v=…` et `app.js?v=…` dans `index.html` (par exemple la date du jour). Sans ça, les téléphones peuvent garder l'ancienne version en cache et afficher la page à moitié stylée.

## Lancer le site en local

Le site charge `data/paintings.json`, donc il faut un petit serveur (un double-clic sur `index.html` ne suffit pas) :

```sh
cd Vitrine_Cailleau_Christian
python3 -m http.server 8080
```

Puis ouvrir http://localhost:8080.

## Ajouter ou modifier un tableau

1. Déposer deux versions de la photo du tableau dans `assets/img/tableaux/` :
   `mon-tableau.jpg` (≈ 1600 px de côté) et `mon-tableau-800.jpg` (≈ 800 px).
2. Ajouter un objet dans `data/paintings.json` (l'ordre du fichier est l'ordre de la galerie) :

```json
{
  "slug": "mon-tableau",
  "title": "Mon tableau",
  "description": "Deux ou trois lignes, pas plus.",
  "tags": ["portraits"],
  "image": "mon-tableau",
  "w": 1200, "h": 1600,
  "insitu": "mon-tableau"
}
```

- `tags` : la ou les catégories du tableau (voir ci-dessous). Un dessin au crayon d'un visage a par exemple `["portraits", "dessins"]`.
- `insitu` : le nom d'une image de mise en situation dans `assets/img/insitu/` (deux versions : `nom.jpg` ≈ 2000 px et `nom-1000.jpg`). Mettre `null` tant qu'il n'y en a pas : un mur neutre est affiché à la place.

## Catégories (le tri de la page d'accueil)

La liste `categories` en tête de `data/paintings.json` définit les boutons de tri, dans l'ordre d'affichage :

```json
"categories": [
  { "id": "portraits", "label": "Portraits" },
  { "id": "bord-de-mer", "label": "Bord de mer" }
]
```

- `id` est la valeur à mettre dans les `tags` des tableaux, `label` le texte affiché. Le bouton « Tous » est ajouté automatiquement, avec le nombre de tableaux à côté de chaque catégorie.
- Une catégorie sans aucun tableau n'apparaît pas. Renommer une catégorie = changer son `label` ; la supprimer = l'enlever de la liste (les tags orphelins sont ignorés).
- Sur la fiche d'un tableau, « Précédent / Suivant » restent dans la catégorie choisie, et la catégorie est rappelée au-dessus du titre. Le choix est gardé tant que l'onglet est ouvert.

## Naviguer sur la fiche d'un tableau

- Grand écran : lien « ← Les tableaux » en haut, « Précédent / Suivant » et compteur en bas de la colonne de gauche, flèches ← → du clavier.
- Petit écran (moins de 900 px) : toute la navigation est dans une barre fixe en bas, comme dans une app : trois boutons icône + libellé (Tableaux, Précédent, Suivant) et le compteur entre les deux flèches. On peut aussi balayer la page vers la gauche (suivant) ou la droite (précédent) ; un balayage vertical fait défiler normalement, et les bords de l'écran restent au geste « retour » du téléphone.
- Sur la page d'accueil en petit écran, la rangée des catégories reste collée en haut quand on descend dans la liste ; choisir une catégorie ramène la liste juste sous cette rangée.
- Un tap sur le tableau l'ouvre en plein écran (Échap ou « Fermer » pour sortir).

## Photos à prendre

Pour les tableaux : de face, à la lumière du jour, sans flash, si possible hors du cadre (le verre fait des reflets). Pour la mise en situation : le tableau accroché, avec un bout de la pièce autour. Pour À propos : Christian à la table de l'atelier, les mains, les pinceaux, un tableau en cours.

## Fichiers

- `index.html` : les quatre gabarits (en-tête, galerie, fiche, à propos).
- `assets/styles.css` : toute la direction artistique.
- `js/app.js` : navigation, défilement horizontal, transitions.
- `data/paintings.json` : les tableaux.
- `assets/photo/` : les photos d'origine (HEIC), non utilisées par le site.

## Images générées par IA (Fal, modèle Nano Banana 2.1 Edit)

- `assets/img/tableaux/` : reproductions « propres » des 37 tableaux, générées à partir des photos de téléphone (reflets, verre, passe-partout et bords de cadre supprimés, lumière neutralisée, signatures conservées). Les 12 premiers viennent des photos du 26 octobre (recadrages gardés dans `assets/photo/recadrages/`), 18 autres et les nouvelles versions des trois baigneuses et du turban vert viennent des 77 photos du 29 octobre au matin, 5 des 7 photos du 29 octobre après-midi, et les 2 derniers (Les rythmes, Le banc rouge) des 2 photos du 30 octobre (tri des doublons dans `assets/photo/TRI.md`, photos retenues dans `assets/photo/tableaux-sources/`).
- `assets/img/insitu/` : mises en situation générées (tableau encadré dans un intérieur ou une salle de musée), une par tableau.
- Pour un tableau photographié très de biais, redresser d'abord la photo (perspective) avant de l'envoyer au modèle, sinon il peut inverser ou réinterpréter la composition (cas des « Ombrelles »).
- Pour régénérer : envoyer la photo du tableau au modèle avec la consigne « reproduction fidèle, uniquement les défauts photographiques retirés, garder la signature, ne pas inverser », puis « tableau encadré, cadre blanc fin et passe-partout, intérieur lumineux de magazine, 3:2 » en donnant la reproduction propre comme référence.
