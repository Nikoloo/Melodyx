# ⚠️ ACTION REQUISE : Mettre à jour l'URL de callback Spotify

## Problème actuel
L'erreur "INVALID_CLIENT: Invalid redirect URI" indique que l'URL de callback configurée sur Spotify ne correspond pas à celle utilisée par l'application.

## Solution

### 1. Aller sur le Dashboard Spotify
1. Connectez-vous à https://developer.spotify.com/dashboard
2. Sélectionnez votre application "Melodyx"
3. Cliquez sur "Settings"

### 2. Mettre à jour les Redirect URIs
Dans la section "Redirect URIs", **ajoutez cette URL exacte** :

```
https://nikoloo.github.io/Melodyx/src/pages/callback.html
```

⚠️ **IMPORTANT** : L'URL doit être EXACTEMENT comme ci-dessus, avec :
- `/src/pages/` (nouvelle structure)
- `.html` à la fin
- Pas de slash final

### 3. Sauvegarder
Cliquez sur "Save" en bas de la page.

## URLs de navigation mises à jour

Après la réorganisation, les nouvelles URLs sont :
- Page d'accueil : `https://nikoloo.github.io/Melodyx/`
- Lecteur : `https://nikoloo.github.io/Melodyx/src/pages/spotify-player.html`
- Callback : `https://nikoloo.github.io/Melodyx/src/pages/callback.html`

## Vérification
Après avoir mis à jour l'URL sur Spotify :
1. Retournez sur https://nikoloo.github.io/Melodyx/
2. Cliquez sur "Commencer maintenant"
3. La connexion Spotify devrait maintenant fonctionner

## Note
Si vous avez déjà d'autres URLs de callback (pour le développement local par exemple), gardez-les et ajoutez simplement la nouvelle.