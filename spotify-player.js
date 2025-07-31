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
        
        // Bouton de playlist
        const playlistBtn = document.getElementById('playlist-btn');
        if (playlistBtn) {
            playlistBtn.addEventListener('click', () => {
                this.openPlaylistModal();
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
        const playlistCloseBtn = document.getElementById('playlist-close-btn');
        const queueCloseBtn = document.getElementById('queue-close-btn');
        const searchModal = document.getElementById('search-modal');
        const playlistModal = document.getElementById('playlist-modal');
        const queueModal = document.getElementById('queue-modal');
        
        if (searchCloseBtn) {
            searchCloseBtn.addEventListener('click', () => {
                this.closeSearchModal();
            });
        }
        
        if (playlistCloseBtn) {
            playlistCloseBtn.addEventListener('click', () => {
                this.closePlaylistModal();
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
        
        if (playlistModal) {
            playlistModal.addEventListener('click', (e) => {
                if (e.target === playlistModal) {
                    this.closePlaylistModal();
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
        
        // Filtres de recherche
        const searchFilters = document.querySelectorAll('.search-filter');
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
                this.closePlaylistModal();
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
                }, 300);
            }
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
    
    // Ouvrir la modale de playlist
    async openPlaylistModal() {
        logger.info('SpotifyPlayer: Ouverture modale playlist');
        
        const modal = document.getElementById('playlist-modal');
        
        if (modal) {
            modal.style.display = 'flex';
            // Animation d'entrée
            setTimeout(() => {
                modal.classList.add('show');
            }, 10);
            
            // Charger les playlists
            await this.loadUserPlaylists();
        }
    }
    
    // Fermer la modale de playlist
    closePlaylistModal() {
        logger.info('SpotifyPlayer: Fermeture modale playlist');
        
        const modal = document.getElementById('playlist-modal');
        
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
    }
    
    // Gérer la saisie de recherche avec debounce
    handleSearchInput(query) {
        const searchClearBtn = document.getElementById('search-clear-btn');
        
        // Afficher/masquer le bouton de nettoyage
        if (searchClearBtn) {
            searchClearBtn.style.display = query.length > 0 ? 'block' : 'none';
        }
        
        // Debounce de la recherche
        clearTimeout(this.searchTimeout);
        this.searchTimeout = setTimeout(() => {
            this.performSearch(query);
        }, 300);
    }
    
    // Effectuer la recherche
    async performSearch(query) {
        logger.debug('SpotifyPlayer: Recherche', { query, type: this.currentSearchType });
        
        const searchResultsList = document.getElementById('search-results-list');
        const searchLoading = document.getElementById('search-loading');
        const searchPlaceholder = document.querySelector('.search-placeholder');
        
        if (!query || query.trim().length < 2) {
            this.showSearchPlaceholder();
            return;
        }
        
        // Afficher le loading
        this.showSearchLoading(true);
        
        try {
            const results = await this.webApiService.quickSearch(query, this.currentSearchType, 20);
            this.searchResults = results;
            
            this.displaySearchResults(results);
            
        } catch (error) {
            logger.error('SpotifyPlayer: Erreur recherche', error);
            this.showSearchError('Erreur lors de la recherche');
        } finally {
            this.showSearchLoading(false);
        }
    }
    
    // Afficher les résultats de recherche
    displaySearchResults(results) {
        const searchResultsList = document.getElementById('search-results-list');
        
        if (!searchResultsList) return;
        
        const items = results[this.currentSearchType + 's']?.items || [];
        
        if (items.length === 0) {
            searchResultsList.innerHTML = `
                <div class="search-placeholder">
                    <p>Aucun résultat trouvé</p>
                </div>
            `;
            return;
        }
        
        const resultsHTML = items.map(item => {
            return this.createSearchResultHTML(item, this.currentSearchType);
        }).join('');
        
        searchResultsList.innerHTML = resultsHTML;
        
        // Attacher les événements
        this.attachSearchResultEvents();
    }
    
    // Créer le HTML pour un résultat de recherche
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
    
    // Attacher les événements aux résultats de recherche
    attachSearchResultEvents() {
        const playActions = document.querySelectorAll('.search-result-action.play-action');
        const queueActions = document.querySelectorAll('.search-result-action.queue-action');
        
        playActions.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const item = btn.closest('.search-result-item');
                this.playSearchResult(item);
            });
        });
        
        queueActions.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const item = btn.closest('.search-result-item');
                this.addToQueue(item);
            });
        });
        
        // Clic sur l'item entier pour jouer
        const resultItems = document.querySelectorAll('.search-result-item');
        resultItems.forEach(item => {
            item.addEventListener('click', () => {
                this.playSearchResult(item);
            });
        });
    }
    
    // Jouer un résultat de recherche
    async playSearchResult(itemElement) {
        const type = itemElement.dataset.type;
        const uri = itemElement.dataset.uri;
        const id = itemElement.dataset.id;
        
        logger.info('SpotifyPlayer: Lecture résultat recherche', { type, uri, id });
        
        try {
            if (type === 'track') {
                // Jouer la piste directement
                await this.webApiService.playTracks([uri], this.deviceId);
            } else if (type === 'album' || type === 'playlist') {
                // Jouer le contexte (album ou playlist)
                await this.webApiService.playContext(uri, this.deviceId);
            } else if (type === 'artist') {
                // Jouer les top tracks de l'artiste
                const topTracks = await this.webApiService.getArtistTopTracks(id);
                const trackUris = topTracks.tracks.map(track => track.uri).slice(0, 10);
                if (trackUris.length > 0) {
                    await this.webApiService.playTracks(trackUris, this.deviceId);
                }
            }
            
            // Fermer la modale et rafraîchir l'état
            this.closeSearchModal();
            setTimeout(() => this.refreshState(), 1000);
            
        } catch (error) {
            logger.error('SpotifyPlayer: Erreur lecture résultat', error);
        }
    }
    
    // Ajouter à la file
    async addToQueue(itemElement) {
        const uri = itemElement.dataset.uri;
        
        logger.info('SpotifyPlayer: Ajout à la file', { uri });
        
        try {
            await this.webApiService.addToQueue(uri);
            
            // Feedback visuel
            const btn = itemElement.querySelector('.queue-action');
            const originalHTML = btn.innerHTML;
            btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>';
            btn.style.background = '#1db954';
            
            setTimeout(() => {
                btn.innerHTML = originalHTML;
                btn.style.background = '';
            }, 2000);
            
        } catch (error) {
            logger.error('SpotifyPlayer: Erreur ajout file', error);
        }
    }
    
    // Changer le filtre de recherche
    changeSearchFilter(type) {
        logger.debug('SpotifyPlayer: Changement filtre recherche', { type });
        
        // Mettre à jour l'état
        this.currentSearchType = type;
        
        // Mettre à jour l'UI
        const filters = document.querySelectorAll('.search-filter');
        filters.forEach(filter => {
            filter.classList.toggle('active', filter.dataset.type === type);
        });
        
        // Relancer la recherche si il y a du texte
        const searchInput = document.getElementById('search-input');
        if (searchInput && searchInput.value.trim().length >= 2) {
            this.performSearch(searchInput.value);
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
        
        queueList.innerHTML = queueHTML;
    }
    
    // Créer le HTML pour un item de queue
    createQueueItemHTML(track, position, isCurrent) {
        const imageUrl = track.album?.images?.[2]?.url || track.album?.images?.[0]?.url || '';
        const trackName = track.name;
        const artistName = track.artists?.map(a => a.name).join(', ') || 'Artiste inconnu';
        
        return `
            <div class="queue-item ${isCurrent ? 'current' : ''}" data-uri="${track.uri}">
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
            this.closePlaylistModal();
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