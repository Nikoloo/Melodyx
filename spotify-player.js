// Spotify Web Player - Melodyx

// Système de logging centralisé
class DebugLogger {
    constructor() {
        this.logs = [];
        this.maxLogs = 100;
    }

    log(level, message, data = null) {
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            level,
            message,
            data: data ? JSON.stringify(data) : null
        };
        
        this.logs.push(logEntry);
        if (this.logs.length > this.maxLogs) {
            this.logs.shift();
        }
        
        // Console output avec couleurs
        const colors = {
            ERROR: '🔴',
            WARN: '🟡', 
            INFO: '🔵',
            DEBUG: '⚪'
        };
        
        console.log(`${colors[level]} [${timestamp}] ${message}`, data || '');
    }

    error(message, data) { this.log('ERROR', message, data); }
    warn(message, data) { this.log('WARN', message, data); }
    info(message, data) { this.log('INFO', message, data); }
    debug(message, data) { this.log('DEBUG', message, data); }

    getLogs() { return this.logs; }
    clearLogs() { this.logs = []; }
}

const logger = new DebugLogger();

class SpotifyPlayer {
    constructor() {
        this.player = null;
        this.deviceId = null;
        this.currentState = null;
        this.isInitialized = false;
        this.isPlaying = false;
        this.currentPosition = 0;
        this.duration = 0;
        this.volume = 0.5;
        this.progressInterval = null;
        this.healthCheckInterval = null;
        this.lastHealthCheck = null;
        this.connectionRetries = 0;
        this.maxRetries = 3;
        
        logger.info('SpotifyPlayer: Instance créée');
    }

    // Initialiser le lecteur Spotify
    async initialize() {
        logger.info('SpotifyPlayer: Début d\'initialisation');
        
        try {
            // Vérifier l'authentification avec token valide
            const token = await SpotifyAuth.getValidAccessToken();
            if (!token) {
                throw new Error('Token d\'accès non disponible ou expiré');
            }
            
            logger.info('SpotifyPlayer: Token valide obtenu');

            // Vérifier le compte Premium
            await this.verifyPremium(token);

            // Attendre que le SDK soit chargé
            await this.waitForSDK();
            logger.info('SpotifyPlayer: SDK Spotify chargé');
            
            // Créer le lecteur
            this.createPlayer(token);
            
            // Connecter le lecteur
            await this.connectPlayer();
            
        } catch (error) {
            logger.error('SpotifyPlayer: Erreur d\'initialisation', error);
            this.showError(error.message);
        }
    }

    // Vérifier le compte Premium
    async verifyPremium(token) {
        logger.info('SpotifyPlayer: Vérification du compte Premium');
        
        try {
            const response = await fetch('https://api.spotify.com/v1/me', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (!response.ok) {
                throw new Error(`Erreur API profile: ${response.status}`);
            }
            
            const profile = await response.json();
            logger.info('SpotifyPlayer: Profil utilisateur récupéré', { product: profile.product });
            
            if (profile.product !== 'premium') {
                logger.error('SpotifyPlayer: Compte Premium requis');
                this.showPremiumNotice();
                throw new Error('Un compte Spotify Premium est requis pour utiliser le lecteur Web');
            }
            
            logger.info('SpotifyPlayer: Compte Premium validé');
        } catch (error) {
            logger.error('SpotifyPlayer: Erreur de vérification Premium', error);
            throw error;
        }
    }

    // Attendre que le SDK soit disponible
    waitForSDK() {
        return new Promise((resolve) => {
            if (window.Spotify && window.Spotify.Player) {
                logger.debug('SpotifyPlayer: SDK déjà disponible');
                resolve();
            } else {
                logger.debug('SpotifyPlayer: Attente du SDK...');
                window.onSpotifyWebPlaybackSDKReady = () => {
                    logger.info('SpotifyPlayer: SDK prêt');
                    resolve();
                };
            }
        });
    }

    // Créer l'instance du lecteur
    createPlayer(token) {
        this.player = new Spotify.Player({
            name: 'Melodyx Web Player',
            getOAuthToken: cb => { cb(token); },
            volume: this.volume
        });

        // Écouteurs d'événements
        this.attachEventListeners();
    }

    // Attacher les événements du lecteur
    attachEventListeners() {
        // Lecteur prêt
        this.player.addListener('ready', async ({ device_id }) => {
            logger.info('SpotifyPlayer: Lecteur prêt', { device_id });
            this.deviceId = device_id;
            this.isInitialized = true;
            this.connectionRetries = 0;
            
            // Vérifier l'état initial
            await this.checkInitialState();
            
            this.showPlayerInterface();
            document.getElementById('device-name').textContent = 'Melodyx Web Player';
            
            // Démarrer les health checks
            this.startHealthChecks();
        });

        // Lecteur non disponible
        this.player.addListener('not_ready', ({ device_id }) => {
            logger.warn('SpotifyPlayer: Lecteur non disponible', { device_id });
            this.isInitialized = false;
            this.stopHealthChecks();
            
            if (this.connectionRetries < this.maxRetries) {
                logger.info('SpotifyPlayer: Tentative de reconnexion...');
                this.connectionRetries++;
                setTimeout(() => this.reconnect(), 2000);
            } else {
                this.showError('Connexion perdue avec Spotify. Veuillez recharger la page.');
            }
        });

        // Erreurs d'initialisation
        this.player.addListener('initialization_error', ({ message }) => {
            logger.error('SpotifyPlayer: Erreur d\'initialisation', { message });
            this.showError('Erreur d\'initialisation: ' + message);
        });

        // Erreurs d'authentification
        this.player.addListener('authentication_error', async ({ message }) => {
            logger.error('SpotifyPlayer: Erreur d\'authentification', { message });
            
            // Tenter de rafraîchir le token
            try {
                await SpotifyAuth.refreshAccessToken();
                logger.info('SpotifyPlayer: Token rafraîchi, reconnexion...');
                await this.reconnect();
            } catch (error) {
                logger.error('SpotifyPlayer: Échec rafraîchissement token', error);
                this.showError('Erreur d\'authentification. Veuillez vous reconnecter.');
            }
        });

        // Erreurs de compte
        this.player.addListener('account_error', ({ message }) => {
            logger.error('SpotifyPlayer: Erreur de compte', { message });
            if (message.includes('premium')) {
                this.showPremiumNotice();
            } else {
                this.showError('Erreur de compte: ' + message);
            }
        });

        // Changements d'état du lecteur (AMÉLIORÉ)
        this.player.addListener('player_state_changed', (state) => {
            logger.debug('SpotifyPlayer: Changement d\'\u00e9tat', { hasState: !!state });
            
            if (!state) {
                logger.warn('SpotifyPlayer: État null reçu, tentative de récupération via API');
                this.handleNullState();
                return;
            }
            
            this.currentState = state;
            this.lastHealthCheck = Date.now();
            this.updatePlayerState(state);
        });
    }

    // Vérifier l'état initial après connexion
    async checkInitialState() {
        logger.info('SpotifyPlayer: Vérification de l\'\u00e9tat initial');
        
        try {
            // Attendre un peu pour que le device soit actif
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            const state = await this.player.getCurrentState();
            if (state) {
                logger.info('SpotifyPlayer: État initial trouvé', { 
                    track: state.track_window.current_track?.name,
                    paused: state.paused 
                });
                this.currentState = state;
                this.updatePlayerState(state);
            } else {
                logger.info('SpotifyPlayer: Aucun état initial, tentative via API Web');
                await this.fallbackToWebAPI();
            }
        } catch (error) {
            logger.error('SpotifyPlayer: Erreur vérification état initial', error);
            // Continuer sans état initial
        }
    }

    // Connecter le lecteur
    async connectPlayer() {
        logger.info('SpotifyPlayer: Connexion du lecteur...');
        
        const success = await this.player.connect();
        if (!success) {
            logger.error('SpotifyPlayer: Échec de connexion');
            throw new Error('Impossible de se connecter au lecteur Spotify');
        }
        
        logger.info('SpotifyPlayer: Connexion réussie');
    }

    // Mettre à jour l'état du lecteur
    updatePlayerState(state) {
        const track = state.track_window.current_track;
        const isPlaying = !state.paused;
        
        // Mettre à jour les informations de la piste
        this.updateTrackInfo(track);
        
        // Mettre à jour l'état de lecture
        this.isPlaying = isPlaying;
        this.currentPosition = state.position;
        this.duration = state.duration;
        
        // Mettre à jour l'interface
        this.updatePlayButton(isPlaying);
        this.updateProgress();
        
        // Gérer l'intervalle de progression
        if (isPlaying && !this.progressInterval) {
            this.startProgressTracking();
        } else if (!isPlaying && this.progressInterval) {
            this.stopProgressTracking();
        }
        
        logger.debug('SpotifyPlayer: État mis à jour', { 
            track: track?.name, 
            isPlaying, 
            position: this.currentPosition 
        });
    }

    // Mettre à jour les informations de la piste
    updateTrackInfo(track) {
        if (!track) return;

        const trackName = document.getElementById('track-name');
        const trackArtist = document.getElementById('track-artist');
        const trackAlbum = document.getElementById('track-album');
        const trackImage = document.getElementById('track-image');
        const trackPlaceholder = document.querySelector('.track-placeholder');

        trackName.textContent = track.name;
        trackArtist.textContent = track.artists.map(artist => artist.name).join(', ');
        trackAlbum.textContent = track.album.name;

        if (track.album.images && track.album.images.length > 0) {
            trackImage.src = track.album.images[0].url;
            trackImage.style.display = 'block';
            trackPlaceholder.style.display = 'none';
        } else {
            trackImage.style.display = 'none';
            trackPlaceholder.style.display = 'flex';
        }
    }

    // Mettre à jour le bouton play/pause
    updatePlayButton(isPlaying) {
        const playIcon = document.getElementById('play-icon');
        const pauseIcon = document.getElementById('pause-icon');
        const playPauseBtn = document.getElementById('play-pause-btn');

        if (isPlaying) {
            playIcon.style.display = 'none';
            pauseIcon.style.display = 'block';
            playPauseBtn.title = 'Pause';
        } else {
            playIcon.style.display = 'block';
            pauseIcon.style.display = 'none';
            playPauseBtn.title = 'Lecture';
        }
    }

    // Mettre à jour la barre de progression
    updateProgress() {
        if (!this.duration) return;

        const percentage = (this.currentPosition / this.duration) * 100;
        const progressFill = document.getElementById('progress-fill');
        const progressSlider = document.getElementById('progress-slider');
        const currentTime = document.getElementById('current-time');
        const totalTime = document.getElementById('total-time');

        progressFill.style.width = percentage + '%';
        progressSlider.value = percentage;
        currentTime.textContent = this.formatTime(this.currentPosition);
        totalTime.textContent = this.formatTime(this.duration);
    }

    // Démarrer le suivi de progression
    startProgressTracking() {
        this.progressInterval = setInterval(() => {
            if (this.isPlaying) {
                this.currentPosition += 1000; // Increment by 1 second
                this.updateProgress();
            }
        }, 1000);
    }

    // Arrêter le suivi de progression
    stopProgressTracking() {
        if (this.progressInterval) {
            clearInterval(this.progressInterval);
            this.progressInterval = null;
        }
    }

    // Formater le temps en MM:SS
    formatTime(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    // Contrôles de lecture
    async togglePlayback() {
        if (!this.player) return;
        
        try {
            await this.player.togglePlay();
        } catch (error) {
            console.error('Erreur lors du toggle play/pause:', error);
        }
    }

    async nextTrack() {
        if (!this.player) return;
        
        try {
            await this.player.nextTrack();
        } catch (error) {
            console.error('Erreur lors du passage à la piste suivante:', error);
        }
    }

    async previousTrack() {
        if (!this.player) return;
        
        try {
            await this.player.previousTrack();
        } catch (error) {
            console.error('Erreur lors du retour à la piste précédente:', error);
        }
    }

    async setVolume(volume) {
        if (!this.player) return;
        
        try {
            this.volume = volume / 100;
            await this.player.setVolume(this.volume);
        } catch (error) {
            console.error('Erreur lors du réglage du volume:', error);
        }
    }

    async seek(position) {
        if (!this.player) return;
        
        try {
            const seekPosition = (position / 100) * this.duration;
            await this.player.seek(seekPosition);
            this.currentPosition = seekPosition;
        } catch (error) {
            console.error('Erreur lors de la recherche:', error);
        }
    }

    // Interface utilisateur
    showPlayerInterface() {
        document.getElementById('connection-status').style.display = 'none';
        document.getElementById('player-interface').style.display = 'block';
        this.attachUIEvents();
    }

    showError(message) {
        document.getElementById('connection-status').style.display = 'none';
        document.getElementById('player-interface').style.display = 'none';
        document.getElementById('error-text').textContent = message;
        document.getElementById('error-message').style.display = 'block';
    }

    showPremiumNotice() {
        document.getElementById('connection-status').style.display = 'none';
        document.getElementById('player-interface').style.display = 'none';
        document.getElementById('premium-notice').style.display = 'block';
    }

    // Attacher les événements de l'interface
    attachUIEvents() {
        // Bouton play/pause
        document.getElementById('play-pause-btn').addEventListener('click', () => {
            this.togglePlayback();
        });

        // Bouton précédent
        document.getElementById('prev-btn').addEventListener('click', () => {
            this.previousTrack();
        });

        // Bouton suivant
        document.getElementById('next-btn').addEventListener('click', () => {
            this.nextTrack();
        });

        // Slider de volume
        document.getElementById('volume-input').addEventListener('input', (e) => {
            this.setVolume(e.target.value);
        });

        // Slider de progression
        document.getElementById('progress-slider').addEventListener('input', (e) => {
            this.seek(e.target.value);
        });

        // Bouton de réessai
        document.getElementById('retry-btn').addEventListener('click', () => {
            window.location.reload();
        });

        // Bouton volume (muet/son)
        document.getElementById('volume-btn').addEventListener('click', () => {
            const volumeSlider = document.getElementById('volume-input');
            if (volumeSlider.value > 0) {
                volumeSlider.value = 0;
                this.setVolume(0);
            } else {
                volumeSlider.value = 50;
                this.setVolume(50);
            }
        });
    }

    // Obtenir l'état actuel du lecteur
    async getCurrentState() {
        if (!this.player) return null;
        
        try {
            return await this.player.getCurrentState();
        } catch (error) {
            console.error('Erreur lors de l\'obtention de l\'état:', error);
            return null;
        }
    }

    // Gérer les états null (fallback API)
    async handleNullState() {
        logger.warn('SpotifyPlayer: Gestion état null');
        
        try {
            // Utiliser l'API Web comme fallback
            await this.fallbackToWebAPI();
        } catch (error) {
            logger.error('SpotifyPlayer: Échec fallback API', error);
            this.showWelcomeState();
        }
    }

    // Fallback vers l'API Web Spotify
    async fallbackToWebAPI() {
        logger.info('SpotifyPlayer: Fallback vers API Web');
        
        try {
            const token = await SpotifyAuth.getValidAccessToken();
            const response = await fetch('https://api.spotify.com/v1/me/player', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (response.status === 204) {
                logger.info('SpotifyPlayer: Aucune lecture active via API');
                this.showWelcomeState();
                return;
            }
            
            if (!response.ok) {
                throw new Error(`API Error: ${response.status}`);
            }
            
            const data = await response.json();
            logger.info('SpotifyPlayer: Données API récupérées', { 
                track: data.item?.name,
                is_playing: data.is_playing 
            });
            
            // Convertir les données API en format SDK
            if (data.item) {
                this.updateTrackInfoFromAPI(data);
            }
            
        } catch (error) {
            logger.error('SpotifyPlayer: Erreur fallback API', error);
            throw error;
        }
    }

    // Mettre à jour depuis les données API
    updateTrackInfoFromAPI(data) {
        logger.debug('SpotifyPlayer: Mise à jour depuis API');
        
        const track = data.item;
        if (!track) return;
        
        // Mettre à jour l'interface avec les données API
        const trackName = document.getElementById('track-name');
        const trackArtist = document.getElementById('track-artist');
        const trackAlbum = document.getElementById('track-album');
        const trackImage = document.getElementById('track-image');
        const trackPlaceholder = document.querySelector('.track-placeholder');
        
        trackName.textContent = track.name;
        trackArtist.textContent = track.artists.map(artist => artist.name).join(', ');
        trackAlbum.textContent = track.album.name;
        
        if (track.album.images && track.album.images.length > 0) {
            trackImage.src = track.album.images[0].url;
            trackImage.style.display = 'block';
            trackPlaceholder.style.display = 'none';
        }
        
        // Mettre à jour l'état de lecture
        this.isPlaying = data.is_playing;
        this.currentPosition = data.progress_ms || 0;
        this.duration = track.duration_ms || 0;
        
        this.updatePlayButton(this.isPlaying);
        this.updateProgress();
        
        if (this.isPlaying && !this.progressInterval) {
            this.startProgressTracking();
        }
    }

    // Afficher l'état d'accueil
    showWelcomeState() {
        logger.info('SpotifyPlayer: Affichage état d\'accueil');
        
        // Mettre à jour l'interface pour guider l'utilisateur
        const trackName = document.getElementById('track-name');
        const trackArtist = document.getElementById('track-artist');
        const trackAlbum = document.getElementById('track-album');
        
        trackName.textContent = 'Aucune piste en lecture';
        trackArtist.innerHTML = `
            <div style="margin-top: 1rem;">
                <button onclick="window.open('https://open.spotify.com', '_blank')" class="btn btn-primary" style="margin-right: 1rem;">
                    🎵 Ouvrir Spotify
                </button>
                <button onclick="window.location.href='playlist-selector.html'" class="btn btn-secondary">
                    📝 Mes Playlists
                </button>
            </div>
        `;
        trackAlbum.textContent = 'Démarrez la lecture sur n\'importe quel appareil Spotify pour contrôler ici';
    }

    // Reconnexion automatique
    async reconnect() {
        logger.info('SpotifyPlayer: Tentative de reconnexion');
        
        try {
            if (this.player) {
                await this.player.disconnect();
            }
            
            const token = await SpotifyAuth.getValidAccessToken();
            this.createPlayer(token);
            await this.connectPlayer();
            
        } catch (error) {
            logger.error('SpotifyPlayer: Échec reconnexion', error);
            throw error;
        }
    }

    // Démarrer les health checks
    startHealthChecks() {
        logger.info('SpotifyPlayer: Démarrage health checks');
        
        this.healthCheckInterval = setInterval(async () => {
            try {
                const now = Date.now();
                
                // Vérifier si on a reçu des événements récemment
                if (this.lastHealthCheck && (now - this.lastHealthCheck) > 30000) {
                    logger.warn('SpotifyPlayer: Aucun événement depuis 30s, vérification...');
                    await this.fallbackToWebAPI();
                }
                
                // Vérifier l'expiration du token
                const token = await SpotifyAuth.getValidAccessToken();
                if (!token) {
                    logger.error('SpotifyPlayer: Token expiré');
                    this.showError('Session expirée. Veuillez vous reconnecter.');
                }
                
            } catch (error) {
                logger.error('SpotifyPlayer: Erreur health check', error);
            }
        }, 15000); // Toutes les 15 secondes
    }

    // Arrêter les health checks
    stopHealthChecks() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
            logger.debug('SpotifyPlayer: Health checks arrêtés');
        }
    }

    // Déconnecter le lecteur
    disconnect() {
        logger.info('SpotifyPlayer: Déconnexion');
        
        this.stopProgressTracking();
        this.stopHealthChecks();
        
        if (this.player) {
            this.player.disconnect();
        }
    }
}

// Fonction globale appelée quand le SDK est prêt
window.onSpotifyWebPlaybackSDKReady = () => {
    console.log('Spotify Web Playback SDK est prêt');
};

// Instance globale du lecteur
let spotifyPlayer = null;