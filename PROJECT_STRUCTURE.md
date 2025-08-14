# Melodyx - Structure du Projet

## Structure des Dossiers

```
Melodyx/
├── index.html                 # Page d'accueil (racine pour GitHub Pages)
├── src/                       # Code source
│   ├── js/                    # Fichiers JavaScript
│   │   ├── auth/             # Authentification Spotify
│   │   │   ├── config.js    # Configuration et variables d'environnement
│   │   │   └── spotify-auth.js # Logique OAuth 2.0 PKCE
│   │   ├── player/           # Lecteur et fonctionnalités
│   │   │   ├── spotify-player.js # Lecteur principal
│   │   │   ├── true-random.js    # Algorithme de shuffle
│   │   │   └── playlist-selector.js # Sélecteur de playlist
│   │   ├── api/              # Services API
│   │   │   └── spotify-web-api-service.js # Interface API Spotify
│   │   └── ui/               # Interface utilisateur
│   │       └── script.js     # Scripts de la page d'accueil
│   ├── css/                  # Styles CSS
│   │   ├── base/            # Styles de base
│   │   │   └── main.css    # Styles principaux
│   │   └── components/      # Styles des composants
│   │       ├── player.css  # Styles du lecteur
│   │       └── playlist-selector.css # Styles du sélecteur
│   └── pages/               # Pages HTML (sauf index.html)
│       ├── app.html         # Redirection vers le lecteur
│       ├── callback.html    # Callback OAuth
│       ├── spotify-player.html # Interface du lecteur
│       └── playlist-selector.html # Sélecteur de playlist
├── assets/                   # Ressources statiques
│   └── icons/               # Icônes et images
├── dist/                    # Fichiers compilés (production)
└── .github/                 # Configuration GitHub
    └── workflows/           
        └── deploy.yml       # CI/CD pour GitHub Pages
```

## Points Importants

### Pourquoi index.html est à la racine ?
GitHub Pages nécessite que la page d'entrée soit à la racine du projet. C'est le point d'entrée principal de l'application.

### Organisation du Code

1. **src/js/auth/** - Gestion de l'authentification
   - Sécurisé avec OAuth 2.0 PKCE
   - Configuration centralisée

2. **src/js/player/** - Fonctionnalités du lecteur
   - Lecteur Spotify intégré
   - Algorithmes de lecture aléatoire
   - Gestion des playlists

3. **src/js/api/** - Communication avec l'API Spotify
   - Service centralisé pour toutes les requêtes API
   - Gestion du cache et des erreurs

4. **src/css/** - Styles organisés
   - `base/` : Styles globaux et variables
   - `components/` : Styles spécifiques aux composants

### Sécurité

- Le Client ID Spotify est injecté pendant le build via GitHub Actions
- Les variables sensibles ne sont jamais commitées
- Headers de sécurité configurés dans `_headers`

### Déploiement

Le workflow GitHub Actions :
1. Injecte le Client ID depuis les secrets
2. Construit l'application
3. Déploie sur GitHub Pages

### URLs de Callback

Après réorganisation, les URLs de callback Spotify doivent être mises à jour :
- Développement : `https://melodyx-dev.netlify.app/src/pages/callback`
- GitHub Pages : `https://[username].github.io/Melodyx/src/pages/callback`
- Production : `https://melodyx.app/src/pages/callback`

**Important** : N'oubliez pas de mettre à jour ces URLs dans votre application Spotify sur le Dashboard Spotify.