# Pépinière agroforesterie : guide de déploiement

## 1. Google Sheets + Apps Script
1. Créez un Google Sheets vide, puis **Extensions > Apps Script**.
2. Créez `Code.gs` et `InitSheets.gs` et collez le contenu des fichiers du dossier `apps-script/`.
3. Affichez `appsscript.json` (Paramètres du projet > « Afficher le fichier manifeste ») et remplacez son contenu.
4. Exécutez `initSheets` (autorisez l'accès). Le **token** s'affiche. Le menu « Pépinière » apparaît ensuite dans le Sheets.
5. **Déployer > Nouveau déploiement > Application web** : exécuter en tant que *Moi*, accès *Tout le monde*. Copiez l'URL `.../exec`.
   Après chaque modification du code, faites **Gérer les déploiements > Modifier > Nouvelle version**.

## 2. GitHub Pages
1. Déposez `index.html, style.css, app.js, db.js, sw.js, manifest.json, icons/` à la racine d'un dépôt.
2. **Settings > Pages** : branche `main`, dossier `/ (root)`.
3. Ouvrez `https://<compte>.github.io/<depot>/` sur le téléphone.

## 3. Première utilisation
- **Réglages** : collez l'URL et le token, puis « Enregistrer et actualiser ».
- Android / Chrome : menu ⋮ > **Installer l'application**.
- Hors ligne : les saisies sont gardées dans le téléphone et envoyées dès le retour du réseau.
- Après une mise à jour du site, changez `V` dans `sw.js`.

## 4. Règles de gestion
- Libellés : Entrée, Sortie, Transfert, Mortalité. Les planches se modifient dans la feuille `Sites`.
- Stock FIFO par lot (date d'entrée). Un transfert conserve la date d'entrée d'origine.
- Une saisie est refusée si le stock de la planche est insuffisant (elle reste visible dans Historique avec le motif).
- Doublons : UUID unique par saisie, vérifié par le serveur, avec verrou d'écriture.
- Ne modifiez pas la feuille `Stock` : elle est recalculée automatiquement.

## 5. Semis et saisie directe dans Sheets
- **Semis** : feuille et onglet dédiés. Le semis est saisi d'abord. Quand la levée est connue, on enregistre le nombre de plants levés : ils entrent alors au stock, avec la date du semis comme date de départ (FIFO).
- **Entrée** (feuille Mouvements) : réservée aux achats et dons de plants.
- **Saisie directe dans Google Sheets** : Espèce, Sites, Responsable et Libellé ont des listes déroulantes tirées des feuilles de référence. L'ID, la source et l'horodatage se remplissent seuls (déclencheur `onEdit`, uniquement si le script est créé depuis Extensions > Apps Script). Le contrôle de stock ne s'applique qu'aux saisies de l'application.
- **Mise à jour** : relancez `initSheets` (nouvelle feuille Semis et listes), créez une nouvelle version du déploiement, puis rechargez l'application après mise à jour des fichiers GitHub.
