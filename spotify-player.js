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

        // Vertical Volume Slider with Liquid Physics
        let volumeTimeout = null;
        const volumeSlider = document.getElementById('volume-input');
        
        if (volumeSlider) {
            // Handle input events for smooth visual feedback
            volumeSlider.addEventListener('input', (e) => {
                const volume = e.target.value;
                
                // Trigger liquid physics effects
                this.triggerLiquidPhysics(volume);
                
                // Mettre à jour l'affichage immédiatement
                this.updateVolumeDisplay(volume);
                
                // Débounce l'appel API
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
                this.triggerLiquidSettling();
            });
            
            // Handle clicks on the liquid container for direct volume setting
            const liquidContainer = document.querySelector('.liquid-container');
            if (liquidContainer) {
                liquidContainer.addEventListener('click', (e) => {
                    // Prevent event if clicking on the slider input
                    if (e.target.id === 'volume-input') {
                        return;
                    }
                    
                    const rect = liquidContainer.getBoundingClientRect();
                    // For vertical control, calculate from bottom (inverted Y)
                    const clickY = rect.bottom - e.clientY;
                    const percentage = Math.max(0, Math.min(100, (clickY / rect.height) * 100));
                    const volume = Math.round(percentage);
                    
                    // Update volume immediately with physics effects
                    this.updateVolumeDisplay(volume);
                    this.triggerLiquidSplash(volume);
                    this.setVolume(volume);
                });
            }
            
            // Add vertical drag functionality with momentum physics
            let isDragging = false;
            let dragTimeout = null;
            let lastDragY = 0;
            let dragVelocity = 0;
            let dragMomentum = null;
            
            // Mouse events for desktop
            liquidContainer?.addEventListener('mousedown', (e) => {
                isDragging = true;
                lastDragY = e.clientY;
                dragVelocity = 0;
                if (dragMomentum) clearInterval(dragMomentum);
                e.preventDefault();
                
                document.body.classList.add('volume-dragging');
            });
            
            document.addEventListener('mousemove', (e) => {
                if (!isDragging) return;
                
                const liquidContainer = document.querySelector('.liquid-container');
                if (!liquidContainer) return;
                
                const rect = liquidContainer.getBoundingClientRect();
                const currentY = e.clientY;
                
                // Calculate velocity for momentum physics
                dragVelocity = (lastDragY - currentY) * 0.5;
                lastDragY = currentY;
                
                // For vertical control, calculate from bottom (inverted Y)
                const y = rect.bottom - currentY;
                const percentage = Math.max(0, Math.min(100, (y / rect.height) * 100));
                const volume = Math.round(percentage);
                
                // Update display immediately for smooth feedback
                this.updateVolumeDisplay(volume);
                this.triggerLiquidFlow(volume, Math.abs(dragVelocity));
                
                // Debounce the API call
                clearTimeout(dragTimeout);
                dragTimeout = setTimeout(() => {
                    this.setVolume(volume);
                }, 50);
            });
            
            document.addEventListener('mouseup', () => {
                if (isDragging) {
                    isDragging = false;
                    document.body.classList.remove('volume-dragging');
                    
                    // Apply momentum physics for natural feel
                    if (Math.abs(dragVelocity) > 2) {
                        this.applyVolumeMomentum(dragVelocity);
                    } else {
                        this.triggerLiquidSettling();
                    }
                    
                    // Ensure final volume is set
                    clearTimeout(dragTimeout);
                    const volumeSlider = document.getElementById('volume-input');
                    if (volumeSlider) {
                        this.setVolume(volumeSlider.value);
                    }
                }
            });
            
            // Touch events for mobile
            liquidContainer?.addEventListener('touchstart', (e) => {
                isDragging = true;
                lastDragY = e.touches[0].clientY;
                dragVelocity = 0;
                if (dragMomentum) clearInterval(dragMomentum);
                e.preventDefault();
                
                document.body.classList.add('volume-dragging');
            });
            
            liquidContainer?.addEventListener('touchmove', (e) => {
                if (!isDragging) return;
                
                const rect = liquidContainer.getBoundingClientRect();
                const currentY = e.touches[0].clientY;
                
                // Calculate velocity for momentum physics
                dragVelocity = (lastDragY - currentY) * 0.5;
                lastDragY = currentY;
                
                // For vertical control, calculate from bottom (inverted Y)
                const y = rect.bottom - currentY;
                const percentage = Math.max(0, Math.min(100, (y / rect.height) * 100));
                const volume = Math.round(percentage);
                
                // Update display immediately for smooth feedback
                this.updateVolumeDisplay(volume);
                this.triggerLiquidFlow(volume, Math.abs(dragVelocity));
                
                // Debounce the API call
                clearTimeout(dragTimeout);
                dragTimeout = setTimeout(() => {
                    this.setVolume(volume);
                }, 50);
                
                e.preventDefault();
            });
            
            liquidContainer?.addEventListener('touchend', () => {
                if (isDragging) {
                    isDragging = false;
                    document.body.classList.remove('volume-dragging');
                    
                    // Apply momentum physics for natural feel
                    if (Math.abs(dragVelocity) > 2) {
                        this.applyVolumeMomentum(dragVelocity);
                    } else {
                        this.triggerLiquidSettling();
                    }
                    
                    // Ensure final volume is set
                    clearTimeout(dragTimeout);
                    const volumeSlider = document.getElementById('volume-input');
                    if (volumeSlider) {
                        this.setVolume(volumeSlider.value);
                    }
                }
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

        // Volume toggle button with liquid physics feedback
        const volumeBtn = document.getElementById('volume-btn');
        if (volumeBtn) {
            volumeBtn.addEventListener('click', () => {
                const volumeSlider = document.getElementById('volume-input');
                if (!volumeSlider) return;
                
                const currentVolume = parseInt(volumeSlider.value);
                
                if (currentVolume > 0) {
                    // Sauvegarder le volume actuel et couper le son
                    this.previousVolume = currentVolume;
                    const newVolume = 0;
                    
                    // Update all volume displays with drain effect
                    this.updateVolumeDisplay(newVolume);
                    this.triggerLiquidDrain();
                    this.setVolume(newVolume);
                } else {
                    // Restaurer le volume précédent ou défaut
                    const restoreVolume = this.previousVolume || 50;
                    
                    // Update all volume displays with fill effect
                    this.updateVolumeDisplay(restoreVolume);
                    this.triggerLiquidFill(restoreVolume);
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
        const liquidVolumeFill = document.getElementById('liquid-volume-fill');
        const liquidContainer = document.querySelector('.liquid-container');
        const volumeSlider = document.getElementById('volume-input');
        const volumeValue = document.getElementById('volume-value');
        
        // Update the volume slider value
        if (volumeSlider) {
            volumeSlider.value = volume;
        }
        
        // Update the liquid fill height for vertical layout with smooth transition
        if (liquidVolumeFill) {
            // Set height from bottom (vertical fill)
            liquidVolumeFill.style.height = `${volume}%`;
            
            // Add dynamic liquid physics classes based on volume level
            liquidVolumeFill.classList.add('volume-changing');
            
            // Apply different liquid behaviors based on volume level
            if (volume > 80) {
                liquidVolumeFill.classList.add('high-volume');
            } else {
                liquidVolumeFill.classList.remove('high-volume');
            }
            
            if (volume < 10) {
                liquidVolumeFill.classList.add('low-volume');
            } else {
                liquidVolumeFill.classList.remove('low-volume');
            }
            
            // Remove animation class after completion
            setTimeout(() => {
                liquidVolumeFill.classList.remove('volume-changing');
            }, 1200);
            
            // Activate enhanced bubble effects during volume changes
            if (liquidContainer) {
                liquidContainer.classList.add('volume-active');
                
                // Add intensity class based on volume level
                liquidContainer.className = liquidContainer.className.replace(/volume-intensity-\d+/g, '');
                const intensity = Math.ceil(volume / 25); // 1-4 intensity levels
                liquidContainer.classList.add(`volume-intensity-${intensity}`);
                
                setTimeout(() => {
                    liquidContainer.classList.remove('volume-active');
                }, 3000);
            }
        }
        
        // Update volume percentage display with enhanced visual feedback
        if (volumeValue) {
            volumeValue.textContent = `${Math.round(volume)}%`;
            
            // Add visual feedback for volume level with smooth transitions
            volumeValue.classList.remove('volume-critical', 'volume-high', 'volume-medium', 'volume-low');
            
            if (volume === 0) {
                volumeValue.classList.add('volume-muted');
                volumeValue.style.color = '#666';
            } else if (volume > 90) {
                volumeValue.classList.add('volume-critical');
                volumeValue.style.color = '#ff4757'; // Critical volume warning
            } else if (volume > 70) {
                volumeValue.classList.add('volume-high');
                volumeValue.style.color = '#ff6b6b'; // High volume warning
            } else if (volume > 40) {
                volumeValue.classList.add('volume-medium');
                volumeValue.style.color = '#feca57'; // Medium volume
            } else {
                volumeValue.classList.add('volume-low');
                volumeValue.style.color = 'var(--primary-color)'; // Normal volume
            }
            
            if (volume > 0) {
                volumeValue.classList.remove('volume-muted');
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
        
        // Fermeture des modales
        const searchCloseBtn = document.getElementById('search-close-btn');
        const playlistCloseBtn = document.getElementById('playlist-close-btn');
        const searchModal = document.getElementById('search-modal');
        const playlistModal = document.getElementById('playlist-modal');
        
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
    }
    
    // Créer le HTML pour une playlist
    createPlaylistHTML(playlist) {
        const imageUrl = playlist.images?.[0]?.url || '';
        const trackCount = playlist.tracks?.total || 0;
        const description = playlist.description || `${trackCount} titres`;
        
        return `
            <div class="playlist-item" data-id="${playlist.id}" data-uri="${playlist.uri}">
                <div class="playlist-artwork">
                    ${imageUrl ? `<img src="${imageUrl}" alt="${playlist.name}">` : '📝'}
                </div>
                <div class="playlist-info">
                    <div class="playlist-name">${playlist.name}</div>
                    <div class="playlist-description">${description}</div>
                    <div class="playlist-track-count">${trackCount} titres</div>
                </div>
            </div>
        `;
    }
    
    // Attacher les événements aux playlists
    attachPlaylistEvents() {
        const playlistItems = document.querySelectorAll('.playlist-item');
        
        playlistItems.forEach(item => {
            item.addEventListener('click', () => {
                this.playPlaylist(item);
            });
        });
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
    
    // === LIQUID PHYSICS EFFECTS FOR VOLUME CONTROL ===
    
    // Trigger liquid physics momentum effect
    applyVolumeMomentum(velocity) {
        const volumeSlider = document.getElementById('volume-input');
        const liquidContainer = document.querySelector('.liquid-container');
        
        if (!volumeSlider || !liquidContainer) return;
        
        let currentVolume = parseInt(volumeSlider.value);
        const momentumSteps = Math.min(8, Math.abs(velocity));
        const volumeChange = velocity > 0 ? 2 : -2;
        let step = 0;
        
        liquidContainer.classList.add('momentum-physics');
        
        const momentumInterval = setInterval(() => {
            step++;
            currentVolume = Math.max(0, Math.min(100, currentVolume + volumeChange));
            
            this.updateVolumeDisplay(currentVolume);
            this.setVolume(currentVolume);
            
            if (step >= momentumSteps) {
                clearInterval(momentumInterval);
                liquidContainer.classList.remove('momentum-physics');
                this.triggerLiquidSettling();
            }
        }, 80);
    }
    
    // Trigger liquid physics effects based on volume change type
    triggerLiquidPhysics(volume) {
        const liquidContainer = document.querySelector('.liquid-container');
        const liquidFill = document.getElementById('liquid-volume-fill');
        
        if (!liquidContainer || !liquidFill) return;
        
        // Remove existing physics classes
        liquidContainer.classList.remove('liquid-splash', 'liquid-flow', 'volume-active');
        liquidFill.classList.remove('volume-changing');
        
        // Add new physics class based on volume change
        liquidContainer.classList.add('volume-active');
        liquidFill.classList.add('volume-changing');
        
        // Trigger ripple effect
        this.createVolumeRipple(volume);
    }
    
    // Trigger liquid splash effect for rapid volume changes
    triggerLiquidSplash(volume) {
        const liquidContainer = document.querySelector('.liquid-container');
        if (!liquidContainer) return;
        
        liquidContainer.classList.add('liquid-splash');
        this.createVolumeRipple(volume);
        
        setTimeout(() => {
            liquidContainer.classList.remove('liquid-splash');
        }, 800);
    }
    
    // Trigger liquid flow effect for dragging
    triggerLiquidFlow(volume, velocity) {
        const liquidContainer = document.querySelector('.liquid-container');
        const liquidFill = document.getElementById('liquid-volume-fill');
        
        if (!liquidContainer || !liquidFill) return;
        
        liquidContainer.classList.add('liquid-flow');
        
        // Adjust flow intensity based on velocity
        liquidContainer.style.setProperty('--flow-velocity', Math.min(velocity / 10, 3));
        
        setTimeout(() => {
            liquidContainer.classList.remove('liquid-flow');
        }, 300);
    }
    
    // Trigger liquid settling effect after interactions
    triggerLiquidSettling() {
        const liquidContainer = document.querySelector('.liquid-container');
        if (!liquidContainer) return;
        
        liquidContainer.classList.add('liquid-settling');
        
        setTimeout(() => {
            liquidContainer.classList.remove('liquid-settling');
        }, 1500);
    }
    
    // Trigger liquid drain effect for mute
    triggerLiquidDrain() {
        const liquidContainer = document.querySelector('.liquid-container');
        const liquidFill = document.getElementById('liquid-volume-fill');
        
        if (!liquidContainer || !liquidFill) return;
        
        liquidContainer.classList.add('liquid-drain');
        liquidFill.classList.add('draining');
        
        setTimeout(() => {
            liquidContainer.classList.remove('liquid-drain');
            liquidFill.classList.remove('draining');
        }, 1000);
    }
    
    // Trigger liquid fill effect for unmute
    triggerLiquidFill(targetVolume) {
        const liquidContainer = document.querySelector('.liquid-container');
        const liquidFill = document.getElementById('liquid-volume-fill');
        
        if (!liquidContainer || !liquidFill) return;
        
        liquidContainer.classList.add('liquid-fill');
        liquidFill.classList.add('filling');
        
        // Animate fill based on target volume
        liquidFill.style.setProperty('--fill-target', `${targetVolume}%`);
        
        setTimeout(() => {
            liquidContainer.classList.remove('liquid-fill');
            liquidFill.classList.remove('filling');
        }, 1200);
    }
    
    // Create ripple effect at volume level position
    createVolumeRipple(volume) {
        const liquidContainer = document.querySelector('.liquid-container');
        if (!liquidContainer) return;
        
        // Remove existing ripples
        const existingRipples = liquidContainer.querySelectorAll('.volume-ripple');
        existingRipples.forEach(ripple => ripple.remove());
        
        // Create new ripple element
        const ripple = document.createElement('div');
        ripple.className = 'volume-ripple';
        
        // Position ripple at the current volume level (from bottom)
        const ripplePosition = volume; // Percentage from bottom
        ripple.style.bottom = `${ripplePosition}%`;
        
        liquidContainer.appendChild(ripple);
        
        // Remove ripple after animation
        setTimeout(() => {
            if (ripple.parentNode) {
                ripple.parentNode.removeChild(ripple);
            }
        }, 1000);
    }
    
    // Enhanced volume initialization with liquid effects
    initializeVolumeDisplay() {
        const initialVolume = this.volume * 100; // Convert from 0-1 to 0-100
        this.updateVolumeDisplay(initialVolume);
        
        // Trigger initial liquid fill animation
        setTimeout(() => {
            this.triggerLiquidFill(initialVolume);
        }, 500);
        
        logger.debug('SpotifyPlayer: Vertical liquid volume display initialized', { volume: initialVolume });
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