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
        this.previousVolume = 50;
        this.progressInterval = null;
        this.healthCheckInterval = null;
        this.statePollingInterval = null;
        this.lastHealthCheck = null;
        this.connectionRetries = 0;
        this.maxRetries = 3;
        this.uiEventsAttached = false;
        this.isShuffleActive = false; // État du shuffle
        
        // True Shuffle state
        this.trueShuffle = {
            isActive: false,
            originalTracks: [],
            shuffledTracks: [],
            currentContext: null,
            playbackStarted: false
        };
        
        // Web API service instance
        this.webApiService = new SpotifyWebAPIService();
        
        // Search and playlist management
        this.searchTimeout = null;
        this.currentSearchType = 'track';
        this.searchResults = {};
        this.userPlaylists = [];
        
        // Pas de gestion complexe des états - on fait confiance au SDK/API
        
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
            
            // Enregistrer l'appareil et transférer la lecture si nécessaire
            await this.handleDeviceReady(device_id);
            
            // Vérifier l'état initial
            await this.checkInitialState();
            
            this.showPlayerInterface();
            document.getElementById('device-name').textContent = 'Melodyx Web Player';
            
            // Initialize volume display with current volume 
            this.initializeVolumeDisplay();
            
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

        // Changements d'état du lecteur - simple et direct
        this.player.addListener('player_state_changed', (state) => {
            if (state) {
                this.currentState = state;
                this.lastHealthCheck = Date.now();
                this.updatePlayerState(state);
            }
        });
    }

    // Vérifier l'état initial après connexion
    async checkInitialState() {
        logger.info('SpotifyPlayer: Vérification de l\'état initial');
        
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

    // Contrôles de lecture simplifiés (SDK primary, Web API fallback)
    async togglePlayback() {
        logger.info('SpotifyPlayer: Toggle playback');
        
        // Mise à jour optimiste immédiate
        this.isPlaying = !this.isPlaying;
        this.updatePlayButton(this.isPlaying);
        
        try {
            // Priorité au SDK qui est plus rapide
            if (this.player) {
                await this.player.togglePlay();
            } else {
                // Fallback Web API
                if (this.isPlaying) {
                    await this.webApiService.resumePlayback(this.deviceId);
                } else {
                    await this.webApiService.pausePlayback();
                }
            }
        } catch (error) {
            logger.error('SpotifyPlayer: Erreur toggle playback', error);
            // On ne restaure pas l'état - on fait confiance à l'état réel qui sera mis à jour par le polling
        }
    }

    async nextTrack() {
        logger.info('SpotifyPlayer: Next track');
        
        // Feedback immédiat
        this.currentPosition = 0;
        this.updateProgress();
        
        try {
            // SDK en priorité
            if (this.player) {
                await this.player.nextTrack();
            } else {
                await this.webApiService.nextTrack();
            }
        } catch (error) {
            logger.error('SpotifyPlayer: Erreur next track', error);
        }
    }

    async previousTrack() {
        logger.info('SpotifyPlayer: Previous track');
        
        // Feedback immédiat
        this.currentPosition = 0;
        this.updateProgress();
        
        try {
            // SDK en priorité
            if (this.player) {
                await this.player.previousTrack();
            } else {
                await this.webApiService.previousTrack();
            }
        } catch (error) {
            logger.error('SpotifyPlayer: Erreur previous track', error);
        }
    }

    async setVolume(volume) {
        logger.debug('SpotifyPlayer: Set volume', { volume });
        
        try {
            this.volume = volume / 100;
            await this.webApiService.setVolume(volume);
            
        } catch (error) {
            logger.error('SpotifyPlayer: Erreur volume via Web API', error);
            
            // Fallback to SDK
            if (this.player) {
                try {
                    await this.player.setVolume(this.volume);
                } catch (sdkError) {
                    logger.error('SpotifyPlayer: Erreur volume SDK', sdkError);
                }
            }
        }
    }

    async seek(position) {
        logger.debug('SpotifyPlayer: Seek to position', { position });
        
        try {
            const seekPosition = Math.floor((position / 100) * this.duration);
            await this.webApiService.seekToPosition(seekPosition);
            
            // Update local position immediately for smooth UI
            this.currentPosition = seekPosition;
            this.updateProgress();
            
            setTimeout(() => this.refreshState(), 500);
            
        } catch (error) {
            logger.error('SpotifyPlayer: Erreur seek via Web API', error);
            
            // Fallback to SDK
            if (this.player) {
                try {
                    const seekPosition = (position / 100) * this.duration;
                    await this.player.seek(seekPosition);
                    this.currentPosition = seekPosition;
                } catch (sdkError) {
                    logger.error('SpotifyPlayer: Erreur seek SDK', sdkError);
                }
            }
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
        // Prévenir les événements multiples
        if (this.uiEventsAttached) {
            return;
        }
        this.uiEventsAttached = true;
        
        // Activer les contrôles
        this.enableControls();
        
        // Bouton play/pause - direct et simple
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

        // Horizontal Volume Slider with Progressive Fill
        let volumeTimeout = null;
        const volumeSlider = document.getElementById('volume-input');
        
        if (volumeSlider) {
            // Handle input events for smooth visual feedback
            volumeSlider.addEventListener('input', (e) => {
                const volume = e.target.value;
                
                // Update display immediately
                this.updateVolumeDisplay(volume);
                
                // Debounce the API call
                clearTimeout(volumeTimeout);
                volumeTimeout = setTimeout(() => {
                    this.setVolume(volume);
                }, 200);
            });
            
            // Handle change events for final value
            volumeSlider.addEventListener('change', (e) => {
                const volume = e.target.value;
                // Ensure final value is set immediately
                clearTimeout(volumeTimeout);
                this.setVolume(volume);
            });
        }

        // Slider de progression avec débounce
        let seekTimeout = null;
        let isSeeking = false;
        
        const progressSlider = document.getElementById('progress-slider');
        
        progressSlider.addEventListener('mousedown', () => {
            isSeeking = true;
        });
        
        progressSlider.addEventListener('mouseup', () => {
            isSeeking = false;
        });
        
        progressSlider.addEventListener('input', (e) => {
            if (!isSeeking) return;
            
            const position = e.target.value;
            
            // Mettre à jour l'affichage immédiatement
            const seekPosition = (position / 100) * this.duration;
            this.currentPosition = seekPosition;
            this.updateProgress();
            
            // Débounce l'appel API
            clearTimeout(seekTimeout);
            seekTimeout = setTimeout(() => {
                this.seek(position);
            }, 100);
        });

        // Bouton de réessai
        document.getElementById('retry-btn').addEventListener('click', () => {
            window.location.reload();
        });

        // Volume toggle button
        const volumeBtn = document.getElementById('volume-btn');
        if (volumeBtn) {
            volumeBtn.addEventListener('click', () => {
                const volumeSlider = document.getElementById('volume-input');
                if (!volumeSlider) return;
                
                const currentVolume = parseInt(volumeSlider.value);
                
                if (currentVolume > 0) {
                    // Save current volume and mute
                    this.previousVolume = currentVolume;
                    const newVolume = 0;
                    
                    // Update display and set volume
                    this.updateVolumeDisplay(newVolume);
                    this.setVolume(newVolume);
                } else {
                    // Restore previous volume or default
                    const restoreVolume = this.previousVolume || 50;
                    
                    // Update display and set volume
                    this.updateVolumeDisplay(restoreVolume);
                    this.setVolume(restoreVolume);
                }
            });
        }
        
        // Actualisation manuelle de l'état
        const refreshBtn = document.getElementById('refresh-state-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.refreshState();
            });
        }
        
        // Bouton de transfert vers cet appareil
        const transferBtn = document.getElementById('transfer-here-btn');
        if (transferBtn) {
            transferBtn.addEventListener('click', () => {
                this.transferToThisDevice();
            });
        }
        
        // Événements pour la recherche et les playlists
        this.attachSearchAndPlaylistEvents();
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
        
        // Mettre à jour l'état du shuffle si disponible
        if (data.shuffle_state !== undefined) {
            this.isShuffleActive = data.shuffle_state;
            const shuffleBtn = document.getElementById('true-shuffle-btn');
            if (shuffleBtn) {
                if (this.isShuffleActive) {
                    shuffleBtn.classList.add('active');
                } else {
                    shuffleBtn.classList.remove('active');
                }
            }
        }
        
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
        
        // Mettre à jour le statut de l'appareil
        if (data.device && data.device.id === this.deviceId) {
            this.updateDeviceStatus('active');
        } else {
            this.updateDeviceStatus('inactive');
        }
        
        // Masquer les actions de l'appareil si la lecture est active
        const deviceActions = document.getElementById('device-actions');
        if (deviceActions && this.isPlaying) {
            deviceActions.style.display = 'none';
        }
    }

    // Gérer l'appareil prêt
    async handleDeviceReady(deviceId) {
        logger.info('SpotifyPlayer: Gestion appareil prêt', { deviceId });
        
        try {
            // Vérifier s'il y a une lecture active sur un autre appareil
            const currentState = await this.webApiService.getPlaybackState();
            
            if (currentState && currentState.is_playing && currentState.device.id !== deviceId) {
                logger.info('SpotifyPlayer: Lecture active détectée sur autre appareil', {
                    currentDevice: currentState.device.name,
                    newDevice: deviceId
                });
                
                // Transférer automatiquement la lecture vers Melodyx
                logger.info('SpotifyPlayer: Transfert automatique de la lecture vers Melodyx');
                await this.webApiService.transferPlaybackToDevice(deviceId, true);
                
                // Afficher une notification temporaire
                this.showTransferNotification(currentState.device.name);
            } else if (!currentState || !currentState.is_playing) {
                // S'il n'y a pas de lecture active, essayer de transférer quand même
                // au cas où Spotify est ouvert mais en pause sur un autre appareil
                logger.info('SpotifyPlayer: Tentative de transfert automatique (pas de lecture active)');
                try {
                    await this.webApiService.transferPlaybackToDevice(deviceId, false);
                } catch (transferError) {
                    logger.debug('SpotifyPlayer: Pas de session Spotify active à transférer', transferError);
                }
            }
            
        } catch (error) {
            logger.debug('SpotifyPlayer: Pas de lecture active sur autres appareils', error);
        }
    }
    
    // Obtenir les appareils disponibles
    async getAvailableDevices() {
        try {
            return await this.webApiService.getAvailableDevices();
        } catch (error) {
            logger.error('SpotifyPlayer: Erreur récupération appareils', error);
            return [];
        }
    }
    
    // Transférer la lecture vers cet appareil
    async transferToThisDevice() {
        if (!this.deviceId) {
            logger.warn('SpotifyPlayer: Pas de device ID pour transfert');
            return;
        }
        
        try {
            await this.webApiService.transferPlaybackToDevice(this.deviceId, false);
            logger.info('SpotifyPlayer: Lecture transférée vers Melodyx');
            
            // Rafraîchir l'état après le transfert
            setTimeout(() => this.refreshState(), 1000);
            
        } catch (error) {
            logger.error('SpotifyPlayer: Erreur transfert vers appareil', error);
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
                <button onclick="window.spotifyPlayer.transferToThisDevice()" class="btn btn-primary" style="margin-right: 1rem;">
                    🎵 Transférer ici
                </button>
                <button onclick="window.open('https://open.spotify.com', '_blank')" class="btn btn-secondary" style="margin-right: 1rem;">
                    🔗 Ouvrir Spotify
                </button>
                <button onclick="window.location.href='playlist-selector.html'" class="btn btn-secondary">
                    📝 Mes Playlists
                </button>
            </div>
        `;
        trackAlbum.textContent = 'Démarrez la lecture sur Spotify, puis cliquez sur "Transférer ici" pour contrôler depuis Melodyx';
        
        // Afficher les actions de l'appareil
        const deviceActions = document.getElementById('device-actions');
        if (deviceActions) {
            deviceActions.style.display = 'block';
        }
        
        // Mettre à jour le statut de l'appareil
        this.updateDeviceStatus('inactive');
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

    // Démarrer les health checks et state polling
    startHealthChecks() {
        logger.info('SpotifyPlayer: Démarrage health checks et state polling');
        
        // Health checks pour la connexion
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
        
        // State polling pour synchroniser l'état
        this.startStatePolling();
    }
    
    // Démarrer le polling de l'état
    startStatePolling() {
        logger.info('SpotifyPlayer: Démarrage state polling');
        
        // Polling rapide et simple comme le repo de référence
        this.statePollingInterval = setInterval(async () => {
            try {
                // Toujours rafraîchir, pas de conditions complexes
                await this.refreshState();
            } catch (error) {
                logger.debug('SpotifyPlayer: Erreur state polling', error);
            }
        }, 1000); // Toutes les secondes comme spotify-react-web-client
    }
    
    // Rafraîchir l'état depuis l'API Web
    async refreshState() {
        try {
            const state = await this.webApiService.getPlaybackState();
            if (state && state.item) {
                this.updateTrackInfoFromAPI(state);
                this.lastHealthCheck = Date.now();
            }
        } catch (error) {
            logger.debug('SpotifyPlayer: Pas de lecture active ou erreur API', error);
        }
    }

    // Arrêter les health checks et state polling
    stopHealthChecks() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
            logger.debug('SpotifyPlayer: Health checks arrêtés');
        }
        
        if (this.statePollingInterval) {
            clearInterval(this.statePollingInterval);
            this.statePollingInterval = null;
            logger.debug('SpotifyPlayer: State polling arrêté');
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
    
    
    // Mettre à jour l'affichage du volume avec effets liquides
    updateVolumeDisplay(volume) {
        const volumeSlider = document.getElementById('volume-input');
        const volumeIcon = document.getElementById('volume-icon');
        
        // Update the volume slider value
        if (volumeSlider) {
            volumeSlider.value = volume;
            // Update CSS custom property for progressive fill
            volumeSlider.style.setProperty('--volume-percent', `${volume}%`);
        }
        
        // Update volume icon based on volume level
        if (volumeIcon) {
            if (volume === 0) {
                volumeIcon.className = 'fas fa-volume-mute';
            } else if (volume < 33) {
                volumeIcon.className = 'fas fa-volume-down';
            } else if (volume < 67) {
                volumeIcon.className = 'fas fa-volume-up';
            } else {
                volumeIcon.className = 'fas fa-volume-up';
            }
        }
    }
    
    // Device status is no longer displayed in the UI
    // This method is kept for backward compatibility but does nothing
    updateDeviceStatus(status) {
        // Device status badge has been removed from the UI
        logger.debug('SpotifyPlayer: Device status updated (not displayed)', { status });
    }
    
    // Activer les contrôles
    enableControls() {
        const controls = ['play-pause-btn', 'prev-btn', 'next-btn'];
        controls.forEach(id => {
            const btn = document.getElementById(id);
            if (btn) {
                btn.disabled = false;
                btn.classList.remove('loading');
            }
        });
        
        logger.debug('SpotifyPlayer: Contrôles activés');
    }
    
    // Désactiver les contrôles
    disableControls() {
        const controls = ['play-pause-btn', 'prev-btn', 'next-btn'];
        controls.forEach(id => {
            const btn = document.getElementById(id);
            if (btn) {
                btn.disabled = true;
                btn.classList.remove('loading');
            }
        });
        
        logger.debug('SpotifyPlayer: Contrôles désactivés');
    }
    
    
    // === SEARCH AND PLAYLIST FUNCTIONALITY ===
    
    // Attacher les événements de recherche et playlist
    attachSearchAndPlaylistEvents() {
        // Bouton de recherche
        const searchBtn = document.getElementById('search-btn');
        if (searchBtn) {
            searchBtn.addEventListener('click', () => {
                this.openSearchModal();
            });
        }
        
        // Bouton de queue
        const queueBtn = document.getElementById('queue-btn');
        if (queueBtn) {
            queueBtn.addEventListener('click', () => {
                this.openQueueModal();
            });
        }
        
        // Bouton de vrai mode aléatoire
        const trueShuffleBtn = document.getElementById('true-shuffle-btn');
        if (trueShuffleBtn) {
            trueShuffleBtn.addEventListener('click', () => {
                this.shuffleCurrentQueue();
            });
        }
        
        // Fermeture des modales
        const searchCloseBtn = document.getElementById('search-close-btn');
        const queueCloseBtn = document.getElementById('queue-close-btn');
        const searchModal = document.getElementById('search-modal');
        const queueModal = document.getElementById('queue-modal');
        
        if (searchCloseBtn) {
            searchCloseBtn.addEventListener('click', () => {
                this.closeSearchModal();
            });
        }
        
        if (queueCloseBtn) {
            queueCloseBtn.addEventListener('click', () => {
                this.closeQueueModal();
            });
        }
        
        // Fermeture au clic sur le backdrop
        if (searchModal) {
            searchModal.addEventListener('click', (e) => {
                if (e.target === searchModal) {
                    this.closeSearchModal();
                }
            });
        }
        
        if (queueModal) {
            queueModal.addEventListener('click', (e) => {
                if (e.target === queueModal) {
                    this.closeQueueModal();
                }
            });
        }
        
        // Recherche en temps réel
        const searchInput = document.getElementById('search-input');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.handleSearchInput(e.target.value);
            });
            
            searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    this.closeSearchModal();
                }
            });
        }
        
        // Bouton de nettoyage de recherche
        const searchClearBtn = document.getElementById('search-clear-btn');
        if (searchClearBtn) {
            searchClearBtn.addEventListener('click', () => {
                this.clearSearch();
            });
        }
        
        // Filtres de recherche - support for both old and new selectors
        const searchFilters = document.querySelectorAll('.search-filter, .premium-filter-tab');
        searchFilters.forEach(filter => {
            filter.addEventListener('click', () => {
                this.changeSearchFilter(filter.dataset.type);
            });
        });
        
        // Recherche de playlist
        const playlistSearchInput = document.getElementById('playlist-search-input');
        if (playlistSearchInput) {
            playlistSearchInput.addEventListener('input', (e) => {
                this.handlePlaylistSearch(e.target.value);
            });
        }
        
        // Raccourcis clavier
        document.addEventListener('keydown', (e) => {
            // Ctrl+K ou Cmd+K pour ouvrir la recherche
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                this.openSearchModal();
            }
            
            // Échap pour fermer les modales
            if (e.key === 'Escape') {
                this.closeSearchModal();
                this.closeQueueModal();
            }
        });
    }
    
    // Ouvrir la modale de recherche
    openSearchModal() {
        logger.info('SpotifyPlayer: Ouverture modale recherche');
        
        const modal = document.getElementById('search-modal');
        const searchInput = document.getElementById('search-input');
        
        if (modal) {
            modal.style.display = 'flex';
            // Animation d'entrée
            setTimeout(() => {
                modal.classList.add('show');
            }, 10);
            
            // Focus sur l'input
            if (searchInput) {
                setTimeout(() => {
                    searchInput.focus();
                    // Clear previous search and show empty state
                    searchInput.value = '';
                    this.showSearchPlaceholder();
                }, 300);
            }
            
            // Initialize filter indicator position
            setTimeout(() => {
                this.initializeFilterIndicator();
            }, 400);
        }
    }
    
    // Fermer la modale de recherche
    closeSearchModal() {
        logger.info('SpotifyPlayer: Fermeture modale recherche');
        
        const modal = document.getElementById('search-modal');
        
        if (modal) {
            modal.classList.remove('show');
            setTimeout(() => {
                modal.style.display = 'none';
            }, 300);
        }
    }
    
    
    // Ouvrir la modale de queue
    async openQueueModal() {
        logger.info('SpotifyPlayer: Ouverture modale queue');
        
        const modal = document.getElementById('queue-modal');
        
        if (modal) {
            modal.style.display = 'flex';
            // Animation d'entrée
            setTimeout(() => {
                modal.classList.add('show');
            }, 10);
            
            // Charger la queue
            await this.loadCurrentQueue();
            
            // Rafraîchir la queue toutes les 5 secondes tant que la modale est ouverte
            this.queueRefreshInterval = setInterval(async () => {
                if (modal.style.display === 'flex' && modal.classList.contains('show')) {
                    await this.loadCurrentQueue();
                } else {
                    clearInterval(this.queueRefreshInterval);
                    this.queueRefreshInterval = null;
                }
            }, 5000);
        }
    }
    
    // Fermer la modale de queue
    closeQueueModal() {
        logger.info('SpotifyPlayer: Fermeture modale queue');
        
        const modal = document.getElementById('queue-modal');
        
        if (modal) {
            modal.classList.remove('show');
            setTimeout(() => {
                modal.style.display = 'none';
            }, 300);
        }
        
        // Arrêter le rafraîchissement automatique
        if (this.queueRefreshInterval) {
            clearInterval(this.queueRefreshInterval);
            this.queueRefreshInterval = null;
        }
    }
    
    // Gérer la saisie de recherche avec debounce et suggestions
    handleSearchInput(query) {
        // Ne pas gérer la recherche si on est sur les onglets spéciaux
        if (this.currentSearchType === 'my-playlists' || this.currentSearchType === 'liked') {
            return;
        }
        
        const searchClearBtn = document.getElementById('search-clear-btn');
        
        // Afficher/masquer le bouton de nettoyage
        if (searchClearBtn) {
            searchClearBtn.style.display = query.length > 0 ? 'block' : 'none';
        }
        
        // Clear existing timeout
        clearTimeout(this.searchTimeout);
        
        // Si query vide, afficher le placeholder
        if (query.length === 0) {
            this.showSearchPlaceholder();
            return;
        }
        
        // Pour les requêtes courtes (1-2 caractères), pas de suggestions pour éviter trop d'appels API
        if (query.length < 3) {
            // Juste afficher un état de saisie
            const searchResultsList = document.getElementById('search-results-list');
            if (searchResultsList) {
                searchResultsList.innerHTML = `
                    <div class="search-typing-state" style="display: flex; flex-direction: column; align-items: center; padding: 3rem; opacity: 0.6;">
                        <p>Continuez à taper...</p>
                        <small>Au moins 3 caractères requis</small>
                    </div>
                `;
                searchResultsList.style.display = 'block';
            }
            this.hideOtherSearchStates();
            return;
        }
        
        // Cancel current search only for longer queries
        this.webApiService.cancelCurrentSearch();
        
        // Perform full search for longer queries
        this.searchTimeout = setTimeout(() => {
            this.performSearch(query);
        }, 300);
    }
    
    // Helper pour masquer les autres états de recherche
    hideOtherSearchStates() {
        const emptyState = document.querySelector('.search-empty-state');
        const noResultsState = document.getElementById('search-no-results');
        const loadingState = document.getElementById('search-loading');
        
        if (emptyState) emptyState.style.display = 'none';
        if (noResultsState) noResultsState.style.display = 'none';
        if (loadingState) loadingState.style.display = 'none';
    }

    
    // Effectuer la recherche avec la nouvelle API
    async performSearch(query) {
        logger.info('SpotifyPlayer: Recherche', { query, type: this.currentSearchType });
        
        if (!query || query.trim().length < 2) {
            this.showSearchPlaceholder();
            return;
        }
        
        // Afficher le loading
        this.showSearchLoading(true);
        
        try {
            // Use direct search instead of debounced for immediate results
            const results = await this.webApiService.search(
                query.trim(), 
                [this.currentSearchType], 
                20, 
                0
            );
            
            logger.info('SpotifyPlayer: Résultats reçus', { 
                query, 
                type: this.currentSearchType, 
                count: results[this.currentSearchType + 's']?.items?.length || 0,
                results 
            });
            
            this.searchResults = results;
            
            // Track search analytics
            const resultCount = results[this.currentSearchType + 's']?.items?.length || 0;
            if (this.webApiService.trackSearchAnalytics) {
                this.webApiService.trackSearchAnalytics(query, this.currentSearchType, resultCount);
            }
            
            this.displaySearchResults(results);
            
        } catch (error) {
            // Don't show error for cancelled searches
            if (error.name === 'AbortError') {
                logger.debug('SpotifyPlayer: Search cancelled');
                return;
            }
            
            logger.error('SpotifyPlayer: Erreur recherche', error);
            this.showSearchError('Erreur lors de la recherche: ' + error.message);
        } finally {
            this.showSearchLoading(false);
        }
    }
    
    // Afficher les résultats de recherche avec données formatées
    displaySearchResults(results) {
        logger.info('SpotifyPlayer: Affichage des résultats', { results });
        
        const searchResultsList = document.getElementById('search-results-list');
        const emptyState = document.querySelector('.search-empty-state');
        const noResultsState = document.getElementById('search-no-results');
        
        if (!searchResultsList) {
            logger.error('SpotifyPlayer: Element search-results-list introuvable');
            return;
        }
        
        // Hide all states first
        if (emptyState) emptyState.style.display = 'none';
        if (noResultsState) noResultsState.style.display = 'none';
        
        // Use the formatted results from the API service
        const formattedItems = this.webApiService.formatSearchResultsForUI(results, this.currentSearchType);
        
        logger.info('SpotifyPlayer: Items formatés', { 
            count: formattedItems.length, 
            items: formattedItems 
        });
        
        if (formattedItems.length === 0) {
            logger.info('SpotifyPlayer: Aucun résultat, affichage état vide');
            searchResultsList.innerHTML = '';
            searchResultsList.style.display = 'none';
            if (noResultsState) {
                noResultsState.style.display = 'flex';
            }
            return;
        }
        
        // Show results list
        searchResultsList.style.display = 'block';
        
        const resultsHTML = formattedItems.map((item, index) => {
            const html = this.createEnhancedSearchResultHTML(item);
            logger.debug('SpotifyPlayer: HTML généré pour item', { item, html: html.substring(0, 100) });
            return html;
        }).join('');
        
        logger.info('SpotifyPlayer: Insertion HTML dans la liste', { 
            htmlLength: resultsHTML.length,
            preview: resultsHTML.substring(0, 200)
        });
        
        searchResultsList.innerHTML = resultsHTML;
        
        // Vérifier que le contenu a été inséré
        const insertedCards = searchResultsList.querySelectorAll('.premium-result-card');
        logger.info('SpotifyPlayer: Cartes insérées', { count: insertedCards.length });
        
        // Check if we can load more results
        const originalItems = results[this.currentSearchType + 's']?.items || [];
        const hasMore = originalItems.length === 20; // If we got a full page, there might be more
        
        if (hasMore) {
            searchResultsList.innerHTML += `
                <div class="premium-load-more">
                    <button class="premium-load-btn" onclick="window.spotifyPlayer.loadMoreSearchResults()">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                        </svg>
                        <span>Charger plus de résultats</span>
                    </button>
                </div>
            `;
        }
        
        // Trigger entrance animations
        requestAnimationFrame(() => {
            const cards = searchResultsList.querySelectorAll('.premium-result-card');
            cards.forEach((card, index) => {
                setTimeout(() => {
                    card.classList.add('visible');
                }, index * 50);
            });
        });
        
        // Attacher les événements
        this.attachSearchResultEvents();
    }
    
    // Créer le HTML pour un résultat de recherche (legacy method - kept for compatibility)
    createSearchResultHTML(item, type) {
        let imageUrl = '';
        let title = '';
        let subtitle = '';
        
        switch (type) {
            case 'track':
                imageUrl = item.album?.images?.[2]?.url || item.album?.images?.[0]?.url || '';
                title = item.name;
                subtitle = item.artists?.map(artist => artist.name).join(', ') || '';
                break;
            case 'artist':
                imageUrl = item.images?.[2]?.url || item.images?.[0]?.url || '';
                title = item.name;
                subtitle = `${item.followers?.total || 0} abonnés`;
                break;
            case 'album':
                imageUrl = item.images?.[2]?.url || item.images?.[0]?.url || '';
                title = item.name;
                subtitle = item.artists?.map(artist => artist.name).join(', ') || '';
                break;
            case 'playlist':
                imageUrl = item.images?.[2]?.url || item.images?.[0]?.url || '';
                title = item.name;
                subtitle = `${item.tracks?.total || 0} titres`;
                break;
        }
        
        return `
            <div class="search-result-item" data-type="${type}" data-id="${item.id}" data-uri="${item.uri}">
                <div class="search-result-artwork">
                    ${imageUrl ? `<img src="${imageUrl}" alt="${title}">` : '🎵'}
                </div>
                <div class="search-result-info">
                    <div class="search-result-title">${title}</div>
                    <div class="search-result-subtitle">${subtitle}</div>
                </div>
                <div class="search-result-actions">
                    <button class="search-result-action play-action" title="Lire">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M8 5v14l11-7z"/>
                        </svg>
                    </button>
                    ${type === 'track' ? `
                        <button class="search-result-action queue-action" title="Ajouter à la file">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                            </svg>
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
    }

    // Créer le HTML amélioré pour un résultat de recherche
    createEnhancedSearchResultHTML(item) {
        logger.debug('SpotifyPlayer: Création HTML pour item', { item });
        
        // Vérifier que l'item a les propriétés nécessaires
        if (!item || !item.type || !item.uri || !item.name) {
            logger.error('SpotifyPlayer: Item invalide pour création HTML', { item });
            return '<div class="error-card">Erreur: données invalides</div>';
        }
        
        // Badge for explicit content
        const explicitBadge = item.metadata?.explicit ? 
            '<span class="explicit-badge">E</span>' : '';
        
        // Popularity bar visualization
        const popularityBar = item.metadata?.popularity !== undefined ? 
            `<div class="popularity-bar"><div class="popularity-fill" style="width: ${item.metadata.popularity}%"></div></div>` : '';
        
        // Duration formatting
        const durationDisplay = item.metadata?.duration ? 
            `<span class="duration">${this.formatTime(item.metadata.duration / 1000)}</span>` : '';
        
        // Type badge with color
        const typeBadge = `<span class="type-badge type-${item.type}">${this.getTypeLabel(item.type)}</span>`;
        
        // Animation delay for staggered entrance
        const animationDelay = Math.random() * 0.2;
        
        return `
            <div class="premium-result-card" style="animation-delay: ${animationDelay}s" data-type="${item.type}" data-uri="${item.uri}" data-id="${item.id}" data-name="${item.displayName || item.name}">
                <div class="premium-artwork">
                    <img src="${item.image || ''}" alt="${item.displayName || item.name}" loading="lazy" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'100\\' height=\\'100\\' viewBox=\\'0 0 100 100\\'%3E%3Crect width=\\'100\\' height=\\'100\\' fill=\\'%23333\\'/%3E%3Cpath d=\\'M50 30c-11 0-20 9-20 20s9 20 20 20 20-9 20-20-9-20-20-20zm0 5c8.3 0 15 6.7 15 15s-6.7 15-15 15-15-6.7-15-15 6.7-15 15-15z\\' fill=\\'%23555\\'/%3E%3C/svg%3E'">
                    <div class="artwork-overlay">
                        <button class="premium-play-btn" title="Lire maintenant">
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M8 5v14l11-7z"/>
                            </svg>
                        </button>
                    </div>
                    <div class="artwork-gradient"></div>
                </div>
                
                <div class="premium-info">
                    <div class="info-header">
                        <h4 class="premium-title">
                            ${item.displayName || item.name}
                            ${explicitBadge}
                        </h4>
                        ${typeBadge}
                    </div>
                    
                    <p class="premium-subtitle">${item.subtitle || ''}</p>
                    
                    <div class="premium-metadata">
                        ${item.metadata?.trackCount ? `<span class="meta-item"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z"/></svg> ${item.metadata.trackCount} pistes</span>` : ''}
                        ${durationDisplay ? `<span class="meta-item"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg> ${durationDisplay}</span>` : ''}
                        ${item.metadata?.releaseDate ? `<span class="meta-item"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7z"/></svg> ${new Date(item.metadata.releaseDate).getFullYear()}</span>` : ''}
                    </div>
                    
                    ${popularityBar ? `
                        <div class="premium-popularity">
                            <span class="popularity-label">Popularité</span>
                            <div class="popularity-track">
                                <div class="popularity-fill" style="width: ${item.metadata.popularity}%">
                                    <div class="popularity-glow"></div>
                                </div>
                            </div>
                            <span class="popularity-value">${item.metadata.popularity}%</span>
                        </div>
                    ` : ''}
                </div>
                
                <div class="premium-actions">
                    <button class="premium-action-btn primary" title="Lire" data-action="play">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M8 5v14l11-7z"/>
                        </svg>
                        <span>Lire</span>
                    </button>
                    
                    <button class="premium-action-btn" title="Ajouter à la file" data-action="queue">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9h-4v4h-2v-4H9V9h4V5h2v4h4v2z"/>
                        </svg>
                    </button>
                    
                    <button class="premium-action-btn" title="Plus d'options" data-action="more">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
                        </svg>
                    </button>
                </div>
            </div>
        `;
    }
    
    // Get type label in French
    getTypeLabel(type) {
        const labels = {
            track: 'Titre',
            artist: 'Artiste',
            album: 'Album',
            playlist: 'Playlist'
        };
        return labels[type] || type;
    }
    
    // Initialize filter indicator position
    initializeFilterIndicator() {
        const activeTab = document.querySelector('.premium-filter-tab.active');
        const filterIndicator = document.querySelector('.filter-indicator');
        
        if (activeTab && filterIndicator) {
            const tabRect = activeTab.getBoundingClientRect();
            const containerRect = activeTab.parentElement.getBoundingClientRect();
            const left = tabRect.left - containerRect.left;
            const width = tabRect.width;
            
            filterIndicator.style.transform = `translateX(${left}px)`;
            filterIndicator.style.width = `${width}px`;
        }
    }
    
    // Show search result options menu
    showSearchResultOptions(cardElement) {
        const type = cardElement.dataset.type;
        const name = cardElement.dataset.name;
        
        // Simple action for now - can be enhanced with a proper context menu
        this.playSearchResult(cardElement);
    }
    
    // Enhanced search error display
    showSearchError(message) {
        const searchResultsList = document.getElementById('search-results-list');
        const emptyState = document.querySelector('.search-empty-state');
        const noResultsState = document.getElementById('search-no-results');
        const loadingState = document.getElementById('search-loading');
        
        // Hide all other states
        if (emptyState) emptyState.style.display = 'none';
        if (loadingState) loadingState.style.display = 'none';
        if (searchResultsList) searchResultsList.style.display = 'none';
        
        // Show error in no results state (reusing the UI)
        if (noResultsState) {
            noResultsState.querySelector('h4').textContent = 'Erreur de recherche';
            noResultsState.querySelector('p').textContent = message;
            noResultsState.style.display = 'flex';
        }
    }

    // Charger plus de résultats de recherche (pagination)
    async loadMoreSearchResults() {
        const searchInput = document.getElementById('search-input');
        if (!searchInput || !this.searchResults) return;
        
        const query = searchInput.value.trim();
        if (!query) return;
        
        try {
            const currentItems = this.webApiService.formatSearchResultsForUI(this.searchResults, this.currentSearchType);
            const moreResults = await this.webApiService.searchMore(
                query, 
                this.currentSearchType, 
                currentItems
            );
            
            // Update search results with more items
            this.searchResults[this.currentSearchType + 's'].items = moreResults.items;
            
            // Re-display all results
            this.displaySearchResults(this.searchResults);
            
        } catch (error) {
            logger.error('SpotifyPlayer: Erreur chargement plus de résultats', error);
        }
    }
    
    // Attacher les événements aux résultats de recherche
    attachSearchResultEvents() {
        // Support legacy and premium selectors
        const playActions = document.querySelectorAll('.search-result-action.play-action, .premium-play-btn');
        const queueActions = document.querySelectorAll('.search-result-action.queue-action');
        
        // Premium play buttons in overlay
        const overlayPlayBtns = document.querySelectorAll('.premium-play-btn');
        overlayPlayBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const card = btn.closest('.premium-result-card, .search-result-item');
                this.playSearchResult(card);
            });
        });
        
        // Action buttons
        const actionBtns = document.querySelectorAll('.premium-action-btn');
        actionBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = btn.dataset.action;
                const card = btn.closest('.premium-result-card, .search-result-item');
                
                switch(action) {
                    case 'play':
                        this.playSearchResult(card);
                        break;
                    case 'queue':
                        this.addToQueue(card);
                        break;
                    case 'more':
                        this.showSearchResultOptions(card);
                        break;
                }
            });
        });
        
        // Legacy action buttons
        playActions.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const item = btn.closest('.search-result-item, .premium-result-card');
                this.playSearchResult(item);
            });
        });
        
        queueActions.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const item = btn.closest('.search-result-item, .premium-result-card');
                this.addToQueue(item);
            });
        });
        
        // Card click for quick play (both legacy and premium)
        const resultCards = document.querySelectorAll('.premium-result-card, .search-result-item');
        resultCards.forEach(card => {
            card.addEventListener('click', (e) => {
                // Don't play if clicking on buttons
                if (e.target.closest('.premium-actions, .search-result-actions, .artwork-overlay')) {
                    return;
                }
                this.playSearchResult(card);
            });
            
            // Hover effects for premium cards
            if (card.classList.contains('premium-result-card')) {
                card.addEventListener('mouseenter', () => {
                    card.classList.add('hover');
                });
                
                card.addEventListener('mouseleave', () => {
                    card.classList.remove('hover');
                });
            }
        });
    }
    
    // Jouer un résultat de recherche avec la nouvelle API
    async playSearchResult(itemElement) {
        const type = itemElement.dataset.type;
        const uri = itemElement.dataset.uri;
        const id = itemElement.dataset.id;
        
        logger.info('SpotifyPlayer: Lecture résultat recherche', { type, uri, id });
        
        // Create item object for the new API method - support both premium and legacy selectors
        const titleElement = itemElement.querySelector('.premium-title, .search-result-title');
        const item = {
            type,
            uri,
            id,
            displayName: titleElement?.textContent?.trim() || itemElement.dataset.name || 'Unknown'
        };
        
        try {
            // Use the enhanced play method from the API service
            await this.webApiService.playSearchResult(item, this.deviceId);
            
            // Fermer la modale et rafraîchir l'état
            this.closeSearchModal();
            setTimeout(() => this.refreshState(), 1000);
            
        } catch (error) {
            logger.error('SpotifyPlayer: Erreur lecture résultat', error);
            this.showNotification(`Erreur: ${error.message}`, 'error');
        }
    }
    
    // Ajouter à la file avec la nouvelle API
    async addToQueue(itemElement) {
        const uri = itemElement.dataset.uri;
        const type = itemElement.dataset.type;
        
        logger.info('SpotifyPlayer: Ajout à la file', { uri, type });
        
        // Create item object for the new API method - support both premium and legacy selectors
        const titleElement = itemElement.querySelector('.premium-title, .search-result-title');
        const item = {
            type,
            uri,
            displayName: titleElement?.textContent?.trim() || itemElement.dataset.name || 'Unknown'
        };
        
        try {
            // Use the enhanced add to queue method from the API service
            await this.webApiService.addSearchResultToQueue(item);
            
            // Feedback visuel amélioré
            const btn = itemElement.querySelector('.queue-action');
            const originalHTML = btn.innerHTML;
            btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>';
            btn.style.background = '#1db954';
            btn.style.color = 'white';
            
            // Show success notification
            this.showNotification(`Ajouté à la file: ${item.displayName}`, 'success');
            
            setTimeout(() => {
                btn.innerHTML = originalHTML;
                btn.style.background = '';
                btn.style.color = '';
            }, 2000);
            
        } catch (error) {
            logger.error('SpotifyPlayer: Erreur ajout file', error);
            this.showNotification(`Erreur: ${error.message}`, 'error');
        }
    }
    
    // Changer le filtre de recherche
    changeSearchFilter(type) {
        logger.debug('SpotifyPlayer: Changement filtre recherche', { type });
        
        // Mettre à jour l'état
        this.currentSearchType = type;
        
        // Mettre à jour l'UI
        const filters = document.querySelectorAll('.search-filter, .premium-filter-tab');
        filters.forEach(filter => {
            filter.classList.toggle('active', filter.dataset.type === type);
        });
        
        // Gérer les onglets spéciaux
        const searchInput = document.getElementById('search-input');
        const searchContainer = document.querySelector('.premium-search-container');
        
        if (type === 'my-playlists') {
            if (searchContainer) searchContainer.style.display = 'none';
            this.showUserPlaylists();
        } else if (type === 'liked') {
            if (searchContainer) searchContainer.style.display = 'none';
            this.showLikedSongs();
        } else {
            // Afficher le champ de recherche pour les autres onglets
            if (searchContainer) searchContainer.style.display = 'block';
            
            // Relancer la recherche si il y a du texte
            if (searchInput && searchInput.value.trim().length >= 2) {
                this.performSearch(searchInput.value);
            } else {
                this.showSearchPlaceholder();
            }
        }
    }
    
    // Vider la recherche
    clearSearch() {
        const searchInput = document.getElementById('search-input');
        const searchClearBtn = document.getElementById('search-clear-btn');
        
        if (searchInput) {
            searchInput.value = '';
            searchInput.focus();
        }
        
        if (searchClearBtn) {
            searchClearBtn.style.display = 'none';
        }
        
        this.showSearchPlaceholder();
    }
    
    // Afficher les playlists de l'utilisateur dans la modale de recherche
    async showUserPlaylists() {
        logger.info('SpotifyPlayer: Affichage des playlists utilisateur');
        
        const resultsContainer = document.getElementById('search-results-container');
        const searchLoading = document.getElementById('search-loading');
        const searchResultsList = document.getElementById('search-results-list');
        const resultsCount = document.getElementById('results-count');
        
        // Masquer l'état vide et afficher le chargement
        document.querySelector('.search-empty-state').style.display = 'none';
        searchLoading.style.display = 'flex';
        resultsContainer.style.display = 'none';
        
        try {
            const playlists = await this.webApiService.getAllUserPlaylists();
            
            searchLoading.style.display = 'none';
            resultsContainer.style.display = 'block';
            
            if (resultsCount) {
                resultsCount.textContent = `${playlists.length} playlist${playlists.length !== 1 ? 's' : ''}`;
            }
            
            searchResultsList.innerHTML = '';
            
            playlists.forEach(playlist => {
                const playlistElement = this.createPlaylistElement(playlist);
                searchResultsList.appendChild(playlistElement);
            });
            
        } catch (error) {
            logger.error('SpotifyPlayer: Erreur chargement playlists', error);
            searchLoading.style.display = 'none';
            this.showSearchError('Erreur lors du chargement des playlists');
        }
    }
    
    // Afficher les titres likés
    async showLikedSongs() {
        logger.info('SpotifyPlayer: Affichage des titres likés');
        
        const resultsContainer = document.getElementById('search-results-container');
        const searchLoading = document.getElementById('search-loading');
        const searchResultsList = document.getElementById('search-results-list');
        const resultsCount = document.getElementById('results-count');
        
        // Masquer l'état vide et afficher le chargement
        document.querySelector('.search-empty-state').style.display = 'none';
        searchLoading.style.display = 'flex';
        resultsContainer.style.display = 'none';
        
        try {
            const tracks = await this.webApiService.getLikedTracks();
            
            searchLoading.style.display = 'none';
            resultsContainer.style.display = 'block';
            
            if (resultsCount) {
                resultsCount.textContent = `${tracks.length} titre${tracks.length !== 1 ? 's' : ''} liké${tracks.length !== 1 ? 's' : ''}`;
            }
            
            searchResultsList.innerHTML = '';
            
            tracks.forEach(track => {
                const trackElement = this.createSearchResultElement(track, 'track');
                searchResultsList.appendChild(trackElement);
            });
            
        } catch (error) {
            logger.error('SpotifyPlayer: Erreur chargement titres likés', error);
            searchLoading.style.display = 'none';
            this.showSearchError('Erreur lors du chargement des titres likés');
        }
    }
    
    // Créer un élément de playlist pour les résultats de recherche
    createPlaylistElement(playlist) {
        const element = document.createElement('div');
        element.className = 'premium-search-result-item';
        element.dataset.uri = playlist.uri;
        
        const imageUrl = playlist.images?.[0]?.url || '';
        const trackCount = playlist.tracks?.total || 0;
        const isOwn = playlist.owner?.id === this.currentUserId;
        
        element.innerHTML = `
            <div class="result-item-image">
                ${imageUrl ? `<img src="${imageUrl}" alt="${playlist.name}">` : '<div class="placeholder-icon">📋</div>'}
            </div>
            <div class="result-item-info">
                <div class="result-item-title">${playlist.name}</div>
                <div class="result-item-subtitle">
                    <span class="result-type-badge">Playlist</span>
                    <span>${trackCount} titres</span>
                    ${isOwn ? '<span class="owner-badge">Votre playlist</span>' : ''}
                </div>
            </div>
            <button class="result-item-action" title="Lire la playlist">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7z"/>
                </svg>
            </button>
        `;
        
        // Ajouter l'événement de clic
        element.addEventListener('click', () => {
            this.playPlaylist(playlist.uri);
            this.closeSearchModal();
        });
        
        return element;
    }
    
    // Afficher le placeholder de recherche
    showSearchPlaceholder() {
        const searchResultsList = document.getElementById('search-results-list');
        const searchPlaceholder = document.querySelector('.search-placeholder');
        
        if (searchResultsList) {
            searchResultsList.innerHTML = '';
        }
        
        if (searchPlaceholder) {
            searchPlaceholder.style.display = 'block';
        }
    }
    
    // Afficher/masquer le loading de recherche
    showSearchLoading(show) {
        const searchLoading = document.getElementById('search-loading');
        const searchPlaceholder = document.querySelector('.search-placeholder');
        
        if (searchLoading) {
            searchLoading.style.display = show ? 'block' : 'none';
        }
        
        if (searchPlaceholder) {
            searchPlaceholder.style.display = show ? 'none' : 'block';
        }
    }
    
    // Afficher une erreur de recherche
    showSearchError(message) {
        const searchResultsList = document.getElementById('search-results-list');
        
        if (searchResultsList) {
            searchResultsList.innerHTML = `
                <div class="search-placeholder">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor" opacity="0.3">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                    </svg>
                    <p>${message}</p>
                </div>
            `;
        }
    }
    
    // Charger les playlists de l'utilisateur
    async loadUserPlaylists() {
        logger.info('SpotifyPlayer: Chargement playlists utilisateur');
        
        const playlistLoading = document.getElementById('playlist-loading');
        const playlistList = document.getElementById('playlist-list');
        
        if (playlistLoading) {
            playlistLoading.style.display = 'block';
        }
        
        try {
            this.userPlaylists = await this.webApiService.getAllUserPlaylists();
            this.displayUserPlaylists(this.userPlaylists);
            
        } catch (error) {
            logger.error('SpotifyPlayer: Erreur chargement playlists', error);
            this.showPlaylistError('Erreur lors du chargement des playlists');
        } finally {
            if (playlistLoading) {
                playlistLoading.style.display = 'none';
            }
        }
    }
    
    // Afficher les playlists
    displayUserPlaylists(playlists) {
        const playlistList = document.getElementById('playlist-list');
        
        if (!playlistList) return;
        
        if (playlists.length === 0) {
            playlistList.innerHTML = `
                <div class="playlist-placeholder">
                    <p>Aucune playlist trouvée</p>
                </div>
            `;
            return;
        }
        
        const playlistsHTML = playlists.map(playlist => {
            return this.createPlaylistHTML(playlist);
        }).join('');
        
        playlistList.innerHTML = playlistsHTML;
        
        // Attacher les événements
        this.attachPlaylistEvents();
        this.attachPlaylistSortEvents();
    }
    
    // Créer le HTML pour une playlist
    createPlaylistHTML(playlist) {
        const imageUrl = playlist.images?.[0]?.url || '';
        const trackCount = playlist.tracks?.total || 0;
        const description = playlist.description || `${trackCount} titres`;
        
        return `
            <div class="playlist-row" data-id="${playlist.id}" data-uri="${playlist.uri}">
                <div class="playlist-thumbnail">
                    ${imageUrl ? `<img src="${imageUrl}" alt="${playlist.name}">` : '<div class="placeholder-image">📝</div>'}
                </div>
                <div class="playlist-details">
                    <div class="playlist-name">${playlist.name}</div>
                    <div class="playlist-meta">${description}</div>
                </div>
                <div class="track-count">${trackCount} titres</div>
            </div>
        `;
    }
    
    // Attacher les événements aux playlists
    attachPlaylistEvents() {
        const playlistItems = document.querySelectorAll('.playlist-row');
        
        playlistItems.forEach(item => {
            item.addEventListener('click', () => {
                this.playPlaylist(item);
            });
        });
    }
    
    // Attacher les événements de tri des playlists
    attachPlaylistSortEvents() {
        const sortSelect = document.getElementById('playlist-sort-select');
        
        if (sortSelect) {
            sortSelect.addEventListener('change', (e) => {
                this.sortPlaylists(e.target.value);
            });
        }
    }
    
    // Trier les playlists
    sortPlaylists(sortType) {
        if (!this.userPlaylists) return;
        
        let sortedPlaylists = [...this.userPlaylists];
        
        switch (sortType) {
            case 'alphabetical':
                sortedPlaylists.sort((a, b) => a.name.localeCompare(b.name));
                break;
            case 'track-count':
                sortedPlaylists.sort((a, b) => {
                    const aCount = a.tracks?.total || 0;
                    const bCount = b.tracks?.total || 0;
                    return bCount - aCount; // Tri décroissant
                });
                break;
            default:
                break;
        }
        
        this.displayUserPlaylists(sortedPlaylists);
    }
    
    // Charger la queue actuelle
    async loadCurrentQueue() {
        logger.info('SpotifyPlayer: Chargement queue actuelle');
        
        const queueLoading = document.getElementById('queue-loading');
        const queueList = document.getElementById('queue-list');
        
        if (queueLoading) {
            queueLoading.style.display = 'block';
        }
        
        try {
            const queueData = await this.webApiService.getQueue();
            this.displayQueue(queueData);
            
        } catch (error) {
            logger.error('SpotifyPlayer: Erreur chargement queue', error);
            this.showQueueError('Erreur lors du chargement de la liste d\'attente');
        } finally {
            if (queueLoading) {
                queueLoading.style.display = 'none';
            }
        }
    }
    
    // Afficher la queue
    displayQueue(queueData) {
        const queueList = document.getElementById('queue-list');
        
        if (!queueList) return;
        
        const currentTrack = queueData.currently_playing;
        const queueTracks = queueData.queue || [];
        
        if (!currentTrack && queueTracks.length === 0) {
            queueList.innerHTML = `
                <div style="text-align: center; padding: 2rem; color: var(--text-secondary);">
                    <p>Aucune piste en cours de lecture</p>
                </div>
            `;
            return;
        }
        
        let queueHTML = '';
        
        // Ajouter la piste en cours
        if (currentTrack) {
            queueHTML += this.createQueueItemHTML(currentTrack, 0, true);
        }
        
        // Ajouter les pistes suivantes
        queueTracks.forEach((track, index) => {
            queueHTML += this.createQueueItemHTML(track, index + 1, false);
        });
        
        // Si on a exactement 20 pistes dans la queue, il y a probablement plus de pistes
        if (queueTracks.length === 20) {
            queueHTML += `
                <div class="queue-more-info">
                    <div class="queue-more-icon">•••</div>
                    <p>La file d'attente continue...</p>
                    <small>Spotify limite l'affichage à 20 pistes</small>
                </div>
            `;
        }
        
        queueList.innerHTML = queueHTML;
        
        // Ajouter les event listeners pour les pistes cliquables
        const clickableItems = queueList.querySelectorAll('.queue-item.clickable');
        clickableItems.forEach(item => {
            item.addEventListener('click', () => {
                const trackUri = item.getAttribute('data-uri');
                const position = parseInt(item.getAttribute('data-position'));
                if (trackUri && !isNaN(position)) {
                    this.playTrackFromQueue(trackUri, position);
                }
            });
        });
    }
    
    // Créer le HTML pour un item de queue
    createQueueItemHTML(track, position, isCurrent) {
        const imageUrl = track.album?.images?.[2]?.url || track.album?.images?.[0]?.url || '';
        const trackName = track.name;
        const artistName = track.artists?.map(a => a.name).join(', ') || 'Artiste inconnu';
        const clickableClass = !isCurrent ? 'clickable' : '';
        const dataPosition = !isCurrent ? `data-position="${position - 1}"` : '';
        
        return `
            <div class="queue-item ${isCurrent ? 'current' : ''} ${clickableClass}" data-uri="${track.uri}" ${dataPosition}>
                <div class="queue-thumbnail">
                    ${imageUrl ? `<img src="${imageUrl}" alt="${trackName}">` : '🎵'}
                </div>
                <div class="queue-details">
                    <div class="queue-track-name">${trackName}</div>
                    <div class="queue-track-artist">${artistName}</div>
                </div>
                <div class="queue-position">${isCurrent ? 'En cours' : position}</div>
            </div>
        `;
    }
    
    // Afficher une erreur de queue
    showQueueError(message) {
        const queueList = document.getElementById('queue-list');
        
        if (queueList) {
            queueList.innerHTML = `
                <div style="text-align: center; padding: 2rem; color: var(--accent-color);">
                    <p>${message}</p>
                </div>
            `;
        }
    }
    
    // Jouer une piste depuis la queue
    async playTrackFromQueue(trackUri, position) {
        logger.info('SpotifyPlayer: Play track from queue', { trackUri, position });
        
        try {
            // Obtenir l'état de lecture actuel pour le contexte
            const playbackState = await this.webApiService.getPlaybackState();
            
            // Si on a un contexte (playlist, album), on peut utiliser l'API pour jouer à partir de ce contexte
            if (playbackState && playbackState.context && playbackState.context.uri) {
                const contextUri = playbackState.context.uri;
                
                // Pour les playlists et albums, on peut essayer de trouver l'URI de la piste dans le contexte
                try {
                    // Obtenir les pistes du contexte pour calculer l'offset correct
                    let contextTracks = [];
                    
                    if (contextUri.includes('playlist:')) {
                        const playlistId = contextUri.split(':')[2];
                        const playlistTracks = await this.webApiService.getPlaylistTracks(playlistId);
                        contextTracks = playlistTracks.items.map(item => item.track);
                    } else if (contextUri.includes('album:')) {
                        const albumId = contextUri.split(':')[2];
                        const albumTracks = await this.webApiService.getAlbumTracks(albumId);
                        contextTracks = albumTracks.items;
                    }
                    
                    // Trouver l'index de la piste dans le contexte
                    const trackIndex = contextTracks.findIndex(track => track.uri === trackUri);
                    
                    if (trackIndex >= 0) {
                        logger.info('SpotifyPlayer: Playing from context with offset', { 
                            contextUri, 
                            trackIndex,
                            trackUri 
                        });
                        
                        // Jouer à partir du contexte avec l'offset
                        await this.webApiService.playContext(contextUri, this.deviceId, trackIndex);
                        
                        // Fermer la modale
                        this.closeQueueModal();
                        
                        // Rafraîchir l'état après un court délai
                        setTimeout(() => this.refreshState(), 1000);
                        return;
                    }
                } catch (contextError) {
                    logger.warn('SpotifyPlayer: Fallback to queue method', contextError);
                }
            }
            
            // Fallback : utiliser la queue directement
            const queueData = await this.webApiService.getQueue();
            if (!queueData || !queueData.queue) {
                throw new Error('Impossible d\'obtenir la queue');
            }
            
            // Vérifier que la piste existe à la position donnée
            const selectedTrack = queueData.queue[position];
            
            if (!selectedTrack || selectedTrack.uri !== trackUri) {
                logger.warn('SpotifyPlayer: Track mismatch or not found', { 
                    expected: trackUri, 
                    found: selectedTrack?.uri 
                });
            }
            
            // Construire la liste des pistes à jouer depuis la position sélectionnée
            const tracksToPlay = [];
            for (let i = position; i < queueData.queue.length; i++) {
                if (queueData.queue[i]) {
                    tracksToPlay.push(queueData.queue[i].uri);
                }
            }
            
            if (tracksToPlay.length === 0) {
                throw new Error('Aucune piste disponible à cette position');
            }
            
            logger.info('SpotifyPlayer: Playing tracks from queue fallback', { 
                tracksCount: tracksToPlay.length,
                firstTrack: tracksToPlay[0]
            });
            
            // Jouer les pistes en commençant par celle sélectionnée
            await this.webApiService.playTracks(tracksToPlay, this.deviceId);
            
            // Fermer la modale
            this.closeQueueModal();
            
            // Rafraîchir l'état après un court délai
            setTimeout(() => this.refreshState(), 1000);
            
        } catch (error) {
            logger.error('SpotifyPlayer: Erreur lecture piste queue', error);
            this.showNotification('Impossible de lire cette piste', 'error');
        }
    }
    
    // === ALGORITHMES DE TRUE SHUFFLE ===
    
    // Algorithme Fisher-Yates pour un mélange vraiment aléatoire
    fisherYatesShuffle(array) {
        const shuffled = [...array]; // Copie pour ne pas modifier l'original
        
        for (let i = shuffled.length - 1; i > 0; i--) {
            // Générer un index aléatoire entre 0 et i
            const randomIndex = Math.floor(Math.random() * (i + 1));
            
            // Échanger les éléments
            [shuffled[i], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[i]];
        }
        
        return shuffled;
    }
    
    // Shuffle par batch pour les grandes playlists
    batchShuffle(array, batchSize = 50) {
        if (array.length <= batchSize) {
            return this.fisherYatesShuffle(array);
        }
        
        const batches = [];
        for (let i = 0; i < array.length; i += batchSize) {
            const batch = array.slice(i, Math.min(i + batchSize, array.length));
            batches.push(this.fisherYatesShuffle(batch));
        }
        
        // Mélanger les batches entre elles
        const shuffledBatches = this.fisherYatesShuffle(batches);
        
        // Aplatir le résultat
        return shuffledBatches.flat();
    }
    
    // Shuffle avec option no-adjacent (éviter les pistes consécutives du même artiste)
    noAdjacentShuffle(tracks) {
        if (tracks.length < 3) {
            return this.fisherYatesShuffle(tracks);
        }
        
        // Grouper les pistes par artiste
        const tracksByArtist = new Map();
        tracks.forEach(track => {
            const artistId = track.artists?.[0]?.id || 'unknown';
            if (!tracksByArtist.has(artistId)) {
                tracksByArtist.set(artistId, []);
            }
            tracksByArtist.get(artistId).push(track);
        });
        
        // Si un seul artiste, faire un shuffle normal
        if (tracksByArtist.size === 1) {
            return this.fisherYatesShuffle(tracks);
        }
        
        // Créer une liste shufflée en alternant les artistes
        const shuffled = [];
        const artistArrays = Array.from(tracksByArtist.values()).map(tracks => this.fisherYatesShuffle(tracks));
        
        while (artistArrays.some(arr => arr.length > 0)) {
            // Parcourir chaque artiste et prendre une piste
            for (let i = 0; i < artistArrays.length; i++) {
                if (artistArrays[i].length > 0) {
                    shuffled.push(artistArrays[i].shift());
                }
            }
        }
        
        return shuffled;
    }

    // Mélanger aléatoirement la queue actuelle avec true shuffle
    async shuffleCurrentQueue() {
        logger.info('SpotifyPlayer: Toggle TRUE shuffle mode');
        
        try {
            // Si le true shuffle est actif, le désactiver
            if (this.trueShuffle.isActive) {
                await this.disableTrueShuffle();
                return;
            }
            
            // Afficher un indicateur de chargement
            const shuffleBtn = document.getElementById('true-shuffle-btn');
            if (shuffleBtn) {
                shuffleBtn.classList.add('loading');
            }
            
            // Récupérer le contexte actuel et toutes ses pistes
            const contextData = await this.webApiService.getCurrentContextTracks();
            
            if (!contextData.tracks || contextData.tracks.length === 0) {
                this.showNotification('Aucune playlist ou album en cours de lecture', 'warning');
                if (shuffleBtn) shuffleBtn.classList.remove('loading');
                return;
            }
            
            logger.info('SpotifyPlayer: Context tracks retrieved', { 
                count: contextData.tracks.length,
                type: contextData.contextType 
            });
            
            // Sauvegarder l'état original
            this.trueShuffle.originalTracks = [...contextData.tracks];
            this.trueShuffle.currentContext = contextData;
            
            // Appliquer l'algorithme de shuffle approprié
            let shuffledTracks;
            
            if (contextData.tracks.length > 100) {
                // Pour les grandes playlists, utiliser le batch shuffle
                logger.info('SpotifyPlayer: Using batch shuffle for large playlist');
                shuffledTracks = this.batchShuffle(contextData.tracks);
            } else if (contextData.tracks.length > 20) {
                // Pour les playlists moyennes, option no-adjacent peut être utile
                logger.info('SpotifyPlayer: Using no-adjacent shuffle');
                shuffledTracks = this.noAdjacentShuffle(contextData.tracks);
            } else {
                // Pour les petites playlists, Fisher-Yates standard
                logger.info('SpotifyPlayer: Using standard Fisher-Yates shuffle');
                shuffledTracks = this.fisherYatesShuffle(contextData.tracks);
            }
            
            // Sauvegarder les pistes shufflées
            this.trueShuffle.shuffledTracks = shuffledTracks;
            
            // Extraire les URIs des pistes shufflées
            const shuffledUris = shuffledTracks.map(track => track.uri);
            
            // Désactiver le shuffle natif de Spotify
            await this.webApiService.toggleShuffle(false);
            
            // Jouer les pistes dans l'ordre shufflé
            if (shuffledUris.length > 50) {
                // Pour les grandes playlists, utiliser le batch playback
                await this.webApiService.playTracksInBatches(shuffledUris, this.deviceId);
            } else {
                // Pour les petites playlists, jouer directement
                await this.webApiService.playTracks(shuffledUris, this.deviceId);
            }
            
            // Marquer le true shuffle comme actif
            this.trueShuffle.isActive = true;
            this.trueShuffle.playbackStarted = true;
            
            // Mettre à jour l'interface
            if (shuffleBtn) {
                shuffleBtn.classList.remove('loading');
                shuffleBtn.classList.add('active', 'true-shuffle-active');
            }
            
            // Afficher la notification de succès
            this.showNotification(
                `True Shuffle activé - ${shuffledTracks.length} pistes mélangées aléatoirement`,
                'success'
            );
            
            // Rafraîchir l'état après un court délai
            setTimeout(() => this.refreshState(), 1000);
            
        } catch (error) {
            logger.error('SpotifyPlayer: Erreur true shuffle', error);
            this.showNotification('Erreur lors de l\'activation du true shuffle', 'error');
            
            // Nettoyer l'interface en cas d'erreur
            const shuffleBtn = document.getElementById('true-shuffle-btn');
            if (shuffleBtn) {
                shuffleBtn.classList.remove('loading', 'active', 'true-shuffle-active');
            }
        }
    }
    
    // Désactiver le true shuffle et revenir à l'ordre original
    async disableTrueShuffle() {
        logger.info('SpotifyPlayer: Disabling true shuffle');
        
        try {
            // Si on a des pistes originales, les rejouer dans l'ordre
            if (this.trueShuffle.originalTracks.length > 0 && this.trueShuffle.currentContext) {
                // Rejouer le contexte original
                await this.webApiService.playContext(
                    this.trueShuffle.currentContext.contextUri, 
                    this.deviceId
                );
            }
            
            // Réinitialiser l'état du true shuffle
            this.trueShuffle = {
                isActive: false,
                originalTracks: [],
                shuffledTracks: [],
                currentContext: null,
                playbackStarted: false
            };
            
            // Mettre à jour l'interface
            const shuffleBtn = document.getElementById('true-shuffle-btn');
            if (shuffleBtn) {
                shuffleBtn.classList.remove('active', 'true-shuffle-active');
            }
            
            this.showNotification('True Shuffle désactivé - Ordre original restauré', 'info');
            
            // Rafraîchir l'état
            setTimeout(() => this.refreshState(), 1000);
            
        } catch (error) {
            logger.error('SpotifyPlayer: Erreur désactivation true shuffle', error);
            this.showNotification('Erreur lors de la désactivation du true shuffle', 'error');
        }
    }
    
    // Afficher une notification temporaire
    showNotification(message, type = 'info') {
        // Créer la notification si elle n'existe pas
        let notification = document.getElementById('shuffle-notification');
        
        if (!notification) {
            notification = document.createElement('div');
            notification.id = 'shuffle-notification';
            notification.className = 'shuffle-notification';
            document.body.appendChild(notification);
        }
        
        // Définir le style selon le type
        const colors = {
            success: '#1DB954',
            warning: '#ff9500',
            error: '#ff4444',
            info: '#1e90ff'
        };
        
        notification.innerHTML = `
            <div class="notification-content" style="background: ${colors[type]};">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"/>
                </svg>
                <span>${message}</span>
            </div>
        `;
        
        // Afficher la notification
        notification.classList.add('show');
        
        // Masquer après 3 secondes
        setTimeout(() => {
            notification.classList.remove('show');
        }, 3000);
    }
    
    // Jouer une playlist
    async playPlaylist(playlistElement) {
        const uri = playlistElement.dataset.uri;
        const id = playlistElement.dataset.id;
        
        logger.info('SpotifyPlayer: Lecture playlist', { uri, id });
        
        try {
            await this.webApiService.playContext(uri, this.deviceId);
            
            // Fermer la modale et rafraîchir l'état
            this.closeSearchModal();
            setTimeout(() => this.refreshState(), 1000);
            
        } catch (error) {
            logger.error('SpotifyPlayer: Erreur lecture playlist', error);
        }
    }
    
    // Rechercher dans les playlists
    async handlePlaylistSearch(query) {
        logger.debug('SpotifyPlayer: Recherche playlist', { query });
        
        try {
            const filteredPlaylists = await this.webApiService.searchUserPlaylists(query);
            this.displayUserPlaylists(filteredPlaylists);
            
        } catch (error) {
            logger.error('SpotifyPlayer: Erreur recherche playlist', error);
        }
    }
    
    // Afficher une erreur de playlist
    showPlaylistError(message) {
        const playlistList = document.getElementById('playlist-list');
        
        if (playlistList) {
            playlistList.innerHTML = `
                <div class="playlist-placeholder">
                    <p>${message}</p>
                </div>
            `;
        }
    }
    
    
    // Initialize volume display
    initializeVolumeDisplay() {
        const initialVolume = this.volume * 100; // Convert from 0-1 to 0-100
        this.updateVolumeDisplay(initialVolume);
        
        logger.debug('SpotifyPlayer: Volume display initialized', { volume: initialVolume });
    }
    
    // Afficher une notification de transfert
    showTransferNotification(previousDeviceName) {
        logger.info('SpotifyPlayer: Affichage notification de transfert', { previousDeviceName });
        
        // Créer la notification si elle n'existe pas
        let notification = document.getElementById('transfer-notification');
        if (!notification) {
            notification = document.createElement('div');
            notification.id = 'transfer-notification';
            notification.className = 'transfer-notification';
            document.body.appendChild(notification);
        }
        
        // Mettre à jour le contenu
        notification.innerHTML = `
            <div class="notification-content">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                </svg>
                <span>Lecture transférée depuis ${previousDeviceName} vers Melodyx</span>
            </div>
        `;
        
        // Afficher avec animation
        notification.classList.add('show');
        
        // Masquer après 3 secondes
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }
    
}

// Fonction globale appelée quand le SDK est prêt
window.onSpotifyWebPlaybackSDKReady = () => {
    console.log('Spotify Web Playback SDK est prêt');
};

// Instance globale du lecteur
let spotifyPlayer = null;