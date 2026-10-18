# Night Browser 1.0.5 — Windows et Linux

Night Browser est un navigateur Electron avec une vraie zone de navigation intégrée (pas d'iframe), plusieurs onglets, recherche web, favoris locaux, onglets privés, historique et gestionnaire de téléchargements.

Site de présentation et téléchargement : https://jujulian1607h.github.io/nova-browser/

## Prérequis

- Windows 10/11 64 bits ou Linux x86_64
- Node.js LTS : https://nodejs.org/
- Connexion Internet pour installer les dépendances

## Lancer en mode développement

1. Ouvrez le dossier `nova-browser-pc` dans Visual Studio Code.
2. Dans le menu **Terminal → Nouveau terminal**, exécutez :

   ```sh
   npm install
   npm start
   ```

## Générer un installateur

Sur Windows :

```powershell
npm run dist
```

Sur Linux :

```sh
npm run dist:linux
```

Les paquets AppImage et Debian x86_64 sont créés dans `release`.

### Lancer l’AppImage

```sh
chmod +x Night-Browser-1.0.5-x64.AppImage
./Night-Browser-1.0.5-x64.AppImage
```

### Installer sur Debian ou Ubuntu

```sh
sudo apt install ./Night-Browser-1.0.5-x64.deb
```

## Publication et mises à jour

Le workflow GitHub Actions construit les versions Windows et Linux, lance les tests et vérifie les dépendances avant la publication. Une signature Windows est facultative : configurez ensemble `NOVA_WINDOWS_CERT_BASE64` et `NOVA_WINDOWS_CERT_PASSWORD` pour signer l’installateur. Sans ces deux secrets, l’installateur Windows est publié sans signature numérique.

L’application vérifie les mises à jour au démarrage. L’AppImage Linux prend en charge le mécanisme de mise à jour intégré. Le paquet `.deb` est installé et mis à jour séparément en téléchargeant le nouveau paquet.

## Fonctionnalités

- Navigation HTTP/HTTPS dans une vraie vue web Electron
- Onglets multiples, création/fermeture et raccourcis Ctrl+T, Ctrl+W
- Barre d'adresse : saisissez une URL ou une recherche
- Retour, suivant, actualisation et accueil
- Historique local des 1 000 dernières visites, consultable avec le bouton d’historique ou Ctrl+H et effaçable à la demande
- Gestionnaire de téléchargements intégré à la barre d’outils (Ctrl+J), avec progression, annulation et accès aux fichiers terminés
- Barre de navigation, fenêtre et onglets compacts
- Favoris enregistrés localement sur cet ordinateur
- Onglets privés isolés dans des partitions non persistantes
- Bouton pour ouvrir la page dans le navigateur système

## Notes importantes

- Le mode privé isole les cookies et le stockage de la session normale ; il ne rend pas anonyme sur Internet et ne protège pas contre les sites, le réseau ou le fournisseur d'accès.
- Les favoris et l’historique sont enregistrés localement sur cet ordinateur. L’historique est limité aux 1 000 visites récentes ; les onglets privés n’y figurent pas.
- L’AppImage et l’installateur Windows ne sont pas signés numériquement. Vérifiez l’empreinte SHA-256 publiée avec chaque version et n’installez les fichiers que si vous faites confiance à leur provenance.
- Le paquet `.deb` n’est pris en charge que sur les distributions Debian et Ubuntu en 64 bits.
- La synchronisation et les extensions ne sont pas encore implémentées.
- Les sites peuvent refuser l'accès ou demander une authentification. Night Browser ne contourne pas les protections des sites.
- Une signature valide confirme l’identité du signataire et l’intégrité du fichier depuis sa signature ; elle ne garantit pas l’absence de vulnérabilités.
- Ne désactivez pas `contextIsolation`, ne réactivez pas `nodeIntegration` et n'ajoutez pas de pont IPC généraliste exposant toutes les API Node au contenu web.

## Dépannage

- **`npm` n'est pas reconnu** : installez Node.js LTS, puis redémarrez votre terminal.
- **L’AppImage ne se lance pas** : vérifiez qu’il est exécutable avec `chmod +x`.
- **Le paquet `.deb` ne s’installe pas** : utilisez une distribution Debian/Ubuntu 64 bits et `sudo apt install ./nom-du-paquet.deb`.
- **Le workflow refuse de publier** : vérifiez que le tag correspond à la version dans `package.json`, que les tests passent et que les deux secrets Windows sont soit configurés ensemble, soit tous deux absents.
- **Windows SmartScreen affiche un avertissement** : l’installateur non signé ne permet pas à Windows de vérifier l’identité de l’éditeur.
