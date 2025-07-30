// Spotify Web Player - Melodyx
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
    }

    // Initialiser le lecteur Spotify
    async initialize() {
        try {
            // Vérifier l'authentification
            const token = SpotifyAuth.getAccessToken();
            if (!token) {
                throw new Error('Token d\'accès non disponible');
            }

            // Attendre que le SDK soit chargé
            await this.waitForSDK();
            
            // Créer le lecteur
            this.createPlayer(token);
            
            // Connecter le lecteur
            await this.connectPlayer();
            
        } catch (error) {
            console.error('Erreur d\'initialisation:', error);
            this.showError(error.message);
        }
    }

    // Attendre que le SDK soit disponible
    waitForSDK() {
        return new Promise((resolve) => {
            if (window.Spotify && window.Spotify.Player) {
                resolve();
            } else {
                window.onSpotifyWebPlaybackSDKReady = () => {
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
        this.player.addListener('ready', ({ device_id }) => {
            console.log('Lecteur prêt avec Device ID:', device_id);
            this.deviceId = device_id;
            this.isInitialized = true;
            this.showPlayerInterface();
            document.getElementById('device-name').textContent = 'Melodyx Web Player';
        });

        // Lecteur non disponible
        this.player.addListener('not_ready', ({ device_id }) => {
            console.log('Le lecteur n\'est plus disponible:', device_id);
            this.showError('Connexion perdue avec Spotify');
        });

        // Erreurs d'initialisation
        this.player.addListener('initialization_error', ({ message }) => {
            console.error('Erreur d\'initialisation:', message);
            this.showError('Erreur d\'initialisation: ' + message);
        });

        // Erreurs d'authentification
        this.player.addListener('authentication_error', ({ message }) => {
            console.error('Erreur d\'authentification:', message);
            this.showError('Erreur d\'authentification. Veuillez vous reconnecter.');
        });

        // Erreurs de compte
        this.player.addListener('account_error', ({ message }) => {
            console.error('Erreur de compte:', message);
            if (message.includes('premium')) {
                this.showPremiumNotice();
            } else {
                this.showError('Erreur de compte: ' + message);
            }
        });

        // Changements d'état du lecteur
        this.player.addListener('player_state_changed', (state) => {
            if (!state) return;
            
            this.currentState = state;
            this.updatePlayerState(state);
        });
    }

    // Connecter le lecteur
    async connectPlayer() {
        const success = await this.player.connect();
        if (!success) {
            throw new Error('Impossible de se connecter au lecteur Spotify');
        }
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

    // Déconnecter le lecteur
    disconnect() {
        if (this.player) {
            this.stopProgressTracking();
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