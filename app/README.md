# Night Browser 1.0.3 — application Windows

Night Browser est un navigateur Electron avec une vraie zone de navigation intégrée (pas d'iframe), plusieurs onglets, recherche web, favoris locaux et onglets privés.

Site de présentation et téléchargement : https://jujulian1607h.github.io/nova-browser/

## Prérequis

- Windows 10 ou Windows 11 en 64 bits
- Node.js LTS : https://nodejs.org/
- Connexion Internet pour installer les dépendances

## Lancer en mode développement

1. Décompressez le dossier `nova-browser-pc`.
2. Ouvrez ce dossier dans Visual Studio Code.
3. Dans le menu **Terminal → Nouveau terminal**, exécutez :

   ```powershell
   npm install
   npm start
   ```

La fenêtre Night Browser doit s'ouvrir. Si PowerShell ne reconnaît pas `npm`, fermez puis rouvrez le terminal après l'installation de Node.js.

## Générer un installateur Windows (.exe)

Dans le même terminal :

```powershell
npm run dist
```

Quand la compilation se termine, cherchez le dossier `release`. Il contiendra un installateur du type `Night-Browser-Setup-1.0.3.exe`. Sans certificat de signature, l’installateur de développement sera non signé et Windows pourra afficher un avertissement.

## Publication signée et mises à jour

La version 1.0.2 publiée actuellement est non signée. Pour les prochaines versions signées, le workflow GitHub Actions exige deux secrets dans **Settings → Secrets and variables → Actions** :

- `NOVA_WINDOWS_CERT_BASE64` : contenu Base64 d’un certificat `.pfx` de signature de code.
- `NOVA_WINDOWS_CERT_PASSWORD` : mot de passe du certificat.

Utilisez un certificat délivré par une autorité de certification reconnue. Ne placez jamais le certificat ni son mot de passe dans le dépôt. Pour préparer la valeur Base64 dans PowerShell :

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\path\to\code-signing.pfx"))
```

Incrémentez `version` dans `package.json`, poussez les modifications, puis créez un tag correspondant exactement à cette version (par exemple `v1.0.4`). Le workflow vérifie la signature de l’installateur avant de publier les fichiers nécessaires aux mises à jour. L’application installée vérifie les nouvelles versions au démarrage et installe une mise à jour téléchargée à sa fermeture.

Le verrou `package-lock.json` rend les installations de publication reproductibles. Le workflow audite les dépendances applicatives et complètes, et interrompt la publication si une vulnérabilité modérée ou plus grave est détectée. Les remplacements de dépendances dans `package.json` sont testés avec l’installation et la compilation avant publication.

Pour vérifier une version installée ou téléchargée :

```powershell
Get-AuthenticodeSignature ".\Night-Browser-Setup-1.0.3.exe" |
  Format-List Status, StatusMessage, SignerCertificate
```

## Fonctionnalités présentes

- Navigation HTTP/HTTPS dans une vraie vue web Electron
- Onglets multiples, création/fermeture et raccourcis Ctrl+T, Ctrl+W
- Barre d'adresse : saisissez une URL ou une recherche
- Retour, suivant, actualisation et accueil
- Historique local des 1 000 dernières visites, consultable avec le bouton d’historique ou Ctrl+H et effaçable à la demande
- Favoris enregistrés localement sur cet ordinateur
- Onglets privés isolés dans des partitions non persistantes
- Bouton pour ouvrir la page dans le navigateur système

## Notes importantes

- Le mode privé de ce prototype isole les cookies et le stockage de la session normale ; il ne rend pas anonyme sur Internet et ne protège pas contre les sites, le réseau ou le fournisseur d'accès.
- Les favoris et l’historique sont enregistrés localement sur cet ordinateur. L’historique est limité aux 1 000 visites récentes ; les onglets privés n’y figurent pas.
- La synchronisation, les extensions et la gestion avancée des téléchargements ne sont pas encore implémentées.
- Les sites peuvent encore refuser l'accès, demander une authentification ou bloquer certains usages pour leurs propres raisons. Electron évite la limitation des iframes, mais ne contourne pas les protections des sites.
- Une signature valide confirme l’identité du signataire et l’intégrité du fichier depuis sa signature ; elle ne garantit pas l’absence de vulnérabilités.
- Ne désactivez pas `contextIsolation`, ne réactivez pas `nodeIntegration` et n'ajoutez pas de pont IPC généraliste exposant toutes les API Node au contenu web.

## Dépannage

- **`npm` n'est pas reconnu** : installez Node.js LTS, puis redémarrez VS Code.
- **`npm install` échoue** : vérifiez la connexion et relancez la commande.
- **Le site ne s'affiche pas** : vérifiez l'adresse et la connexion Internet ; certains sites limitent l'intégration ou nécessitent une configuration supplémentaire.
- **Le workflow refuse de publier** : vérifiez que les deux secrets de signature sont configurés et que le tag correspond à la version du `package.json`.
- **Windows SmartScreen affiche un avertissement** : vérifiez la signature et l’identité du signataire avant d’exécuter l’installateur.
