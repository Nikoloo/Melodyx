// Spotify OAuth Configuration
const SpotifyAuth = {
    // Configuration OAuth Spotify
    config: {
        clientId: '6b0945e253ec4d6d87b5729d1dd946df', // À remplacer par votre Client ID
        scopes: [
            'user-read-private',
            'user-read-email',
            'user-read-playback-state',
            'user-modify-playback-state',
            'user-read-currently-playing',
            'user-library-read',
            'user-library-modify',
            'user-read-recently-played',
            'user-top-read',
            'playlist-read-private',
            'playlist-read-collaborative',
            'playlist-modify-public',
            'playlist-modify-private'
        ].join(' '),
        responseType: 'code',
        showDialog: true
    },

    // Obtenir l'URI de redirection selon l'environnement
    getRedirectUri() {
        const hostname = window.location.hostname;
        const protocol = window.location.protocol;
        const pathname = window.location.pathname;
        
        // Configuration pour différents environnements
        if (hostname === 'localhost' || hostname === '127.0.0.1') {
            // Pour le développement local, utiliser une URL de test
            return 'https://melodyx-dev.netlify.app/callback';
        } else if (hostname.includes('.github.io')) {
            // Pour GitHub Pages - inclure le chemin du repository
            const basePath = pathname.split('/').slice(0, -1).join('/');
            return `${protocol}//${hostname}${basePath}/callback`;
        } else if (hostname.includes('.vercel.app') || hostname.includes('.netlify.app')) {
            // Pour les déploiements de test
            return `${protocol}//${hostname}/callback`;
        } else {
            // Pour la production
            return 'https://melodyx.app/callback';
        }
    },

    // Générer une chaîne aléatoire pour la sécurité
    generateRandomString(length) {
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        const values = crypto.getRandomValues(new Uint8Array(length));
        return values.reduce((acc, x) => acc + possible[x % possible.length], "");
    },

    // Générer le challenge PKCE
    async generateCodeChallenge(codeVerifier) {
        const encoder = new TextEncoder();
        const data = encoder.encode(codeVerifier);
        const digest = await crypto.subtle.digest('SHA-256', data);
        
        return btoa(String.fromCharCode(...new Uint8Array(digest)))
            .replace(/=/g, '')
            .replace(/\+/g, '-')
            .replace(/\//g, '_');
    },

    // Démarrer le processus d'authentification
    async login() {
        try {
            // Vérifier si le Client ID est configuré
            if (this.config.clientId === 'YOUR_SPOTIFY_CLIENT_ID') {
                this.showSetupInstructions();
                return;
            }

            // Générer le code verifier et challenge pour PKCE
            const codeVerifier = this.generateRandomString(64);
            const codeChallenge = await this.generateCodeChallenge(codeVerifier);
            const state = this.generateRandomString(16);

            // Stocker les valeurs dans le localStorage
            localStorage.setItem('spotify_code_verifier', codeVerifier);
            localStorage.setItem('spotify_state', state);

            // Construire l'URL d'autorisation
            const redirectUri = this.getRedirectUri();
            const authUrl = new URL('https://accounts.spotify.com/authorize');
            authUrl.searchParams.set('client_id', this.config.clientId);
            authUrl.searchParams.set('response_type', this.config.responseType);
            authUrl.searchParams.set('redirect_uri', redirectUri);
            authUrl.searchParams.set('scope', this.config.scopes);
            authUrl.searchParams.set('state', state);
            authUrl.searchParams.set('code_challenge_method', 'S256');
            authUrl.searchParams.set('code_challenge', codeChallenge);
            authUrl.searchParams.set('show_dialog', this.config.showDialog);

            // Afficher le modal de chargement
            this.showLoadingModal();

            // Rediriger vers Spotify
            window.location.href = authUrl.toString();

        } catch (error) {
            console.error('Erreur lors de l\'authentification:', error);
            this.showErrorModal('Une erreur est survenue lors de la connexion à Spotify.');
        }
    },

    // Gérer le callback après autorisation
    async handleCallback() {
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        const state = urlParams.get('state');
        const error = urlParams.get('error');

        // Vérifier s'il y a une erreur
        if (error) {
            this.showErrorModal(`Erreur d'autorisation: ${error}`);
            return;
        }

        // Vérifier le state pour la sécurité
        const savedState = localStorage.getItem('spotify_state');
        if (state !== savedState) {
            this.showErrorModal('Erreur de sécurité: state invalide');
            return;
        }

        if (code) {
            try {
                await this.exchangeCodeForToken(code);
            } catch (error) {
                console.error('Erreur lors de l\'échange du code:', error);
                this.showErrorModal('Erreur lors de la récupération du token d\'accès.');
            }
        }
    },

    // Échanger le code d'autorisation contre un token
    async exchangeCodeForToken(code) {
        const codeVerifier = localStorage.getItem('spotify_code_verifier');
        
        const tokenUrl = 'https://accounts.spotify.com/api/token';
        const payload = new URLSearchParams({
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: this.getRedirectUri(),
            client_id: this.config.clientId,
            code_verifier: codeVerifier
        });

        const response = await fetch(tokenUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: payload
        });

        if (response.ok) {
            const tokenData = await response.json();
            this.storeTokens(tokenData);
            this.showSuccessModal();
            
            // Nettoyer le localStorage
            localStorage.removeItem('spotify_code_verifier');
            localStorage.removeItem('spotify_state');
            
            // Rediriger vers l'application principale après 2 secondes
            setTimeout(() => {
                window.location.href = '/app'; // À adapter selon votre structure
            }, 2000);
        } else {
            throw new Error(`Erreur HTTP: ${response.status}`);
        }
    },

    // Stocker les tokens
    storeTokens(tokenData) {
        const expirationTime = Date.now() + (tokenData.expires_in * 1000);
        
        localStorage.setItem('spotify_access_token', tokenData.access_token);
        localStorage.setItem('spotify_refresh_token', tokenData.refresh_token);
        localStorage.setItem('spotify_token_expiration', expirationTime.toString());
    },

    // Vérifier si l'utilisateur est connecté
    isLoggedIn() {
        const token = localStorage.getItem('spotify_access_token');
        const expiration = localStorage.getItem('spotify_token_expiration');
        
        if (!token || !expiration) return false;
        
        return Date.now() < parseInt(expiration);
    },

    // Obtenir le token d'accès
    getAccessToken() {
        if (this.isLoggedIn()) {
            return localStorage.getItem('spotify_access_token');
        }
        return null;
    },

    // Déconnexion
    logout() {
        localStorage.removeItem('spotify_access_token');
        localStorage.removeItem('spotify_refresh_token');
        localStorage.removeItem('spotify_token_expiration');
        window.location.reload();
    },

    // Afficher les instructions de configuration
    showSetupInstructions() {
        const redirectUri = this.getRedirectUri();
        const modal = this.createModal(`
            <div class="modal-content setup-instructions">
                <h2>Configuration requise</h2>
                <p>Pour utiliser Melodyx, vous devez configurer une application Spotify :</p>
                <ol>
                    <li>Allez sur <a href="https://developer.spotify.com/dashboard" target="_blank">Spotify Developer Dashboard</a></li>
                    <li>Créez une nouvelle application (Web API)</li>
                    <li>Dans les paramètres, ajoutez cette URI de redirection :<br>
                        <code style="background: rgba(29, 185, 84, 0.1); padding: 4px 8px; border-radius: 4px; font-family: monospace;">${redirectUri}</code>
                    </li>
                    <li>Copiez le Client ID dans le fichier spotify-auth.js</li>
                </ol>
                <div style="background: rgba(255, 107, 107, 0.1); padding: 1rem; border-radius: 8px; margin-top: 1rem; border: 1px solid rgba(255, 107, 107, 0.3);">
                    <strong>⚠️ Important :</strong> Localhost n'est plus autorisé par Spotify. Vous devez déployer votre application sur un domaine HTTPS valide.
                </div>
                <div style="background: rgba(29, 185, 84, 0.1); padding: 1rem; border-radius: 8px; margin-top: 1rem; border: 1px solid rgba(29, 185, 84, 0.3);">
                    <strong>💡 Solutions de déploiement gratuit :</strong><br>
                    • <a href="https://netlify.com" target="_blank">Netlify</a><br>
                    • <a href="https://vercel.com" target="_blank">Vercel</a><br>
                    • <a href="https://pages.github.com" target="_blank">GitHub Pages</a>
                </div>
                <button class="btn btn-primary" onclick="SpotifyAuth.closeModal()">Compris</button>
            </div>
        `);
        document.body.appendChild(modal);
    },

    // Afficher le modal de chargement
    showLoadingModal() {
        const modal = this.createModal(`
            <div class="modal-content loading">
                <div class="spinner"></div>
                <h2>Connexion à Spotify</h2>
                <p>Redirection en cours...</p>
            </div>
        `);
        document.body.appendChild(modal);
    },

    // Afficher le modal de succès
    showSuccessModal() {
        const modal = this.createModal(`
            <div class="modal-content success">
                <div class="success-icon">✓</div>
                <h2>Connexion réussie !</h2>
                <p>Redirection vers l'application...</p>
            </div>
        `);
        document.body.appendChild(modal);
    },

    // Afficher le modal d'erreur
    showErrorModal(message) {
        const modal = this.createModal(`
            <div class="modal-content error">
                <div class="error-icon">⚠️</div>
                <h2>Erreur de connexion</h2>
                <p>${message}</p>
                <button class="btn btn-primary" onclick="SpotifyAuth.closeModal()">Fermer</button>
            </div>
        `);
        document.body.appendChild(modal);
    },

    // Créer un modal
    createModal(content) {
        const modal = document.createElement('div');
        modal.className = 'spotify-modal';
        modal.innerHTML = `
            <div class="modal-overlay" onclick="SpotifyAuth.closeModal()">
                <div class="modal-container" onclick="event.stopPropagation()">
                    ${content}
                </div>
            </div>
        `;
        return modal;
    },

    // Fermer le modal
    closeModal() {
        const modal = document.querySelector('.spotify-modal');
        if (modal) {
            modal.remove();
        }
    }
};

// Styles pour les modals
const modalStyles = `
.spotify-modal {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    z-index: 10000;
}

.modal-overlay {
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    backdrop-filter: blur(5px);
}

.modal-container {
    background: var(--background-card);
    border-radius: var(--border-radius);
    padding: 2rem;
    max-width: 500px;
    width: 90%;
    box-shadow: var(--shadow);
    border: 1px solid rgba(255, 255, 255, 0.1);
}

.modal-content {
    text-align: center;
}

.modal-content h2 {
    color: var(--text-primary);
    margin-bottom: 1rem;
}

.modal-content p {
    color: var(--text-secondary);
    margin-bottom: 1.5rem;
    line-height: 1.6;
}

.setup-instructions ol {
    text-align: left;
    margin: 1.5rem 0;
    color: var(--text-secondary);
    line-height: 1.8;
}

.setup-instructions a {
    color: var(--primary-color);
    text-decoration: none;
}

.setup-instructions a:hover {
    text-decoration: underline;
}

.spinner {
    width: 40px;
    height: 40px;
    border: 3px solid rgba(29, 185, 84, 0.3);
    border-top: 3px solid var(--primary-color);
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin: 0 auto 1rem;
}

@keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
}

.success-icon, .error-icon {
    font-size: 3rem;
    margin-bottom: 1rem;
}

.success-icon {
    color: var(--primary-color);
}

.error-icon {
    color: var(--accent-color);
}

.loading h2 {
    background: var(--gradient-primary);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
}
`;

// Ajouter les styles au document
const styleSheet = document.createElement('style');
styleSheet.textContent = modalStyles;
document.head.appendChild(styleSheet);