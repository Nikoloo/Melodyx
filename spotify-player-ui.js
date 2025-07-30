class SpotifyPlayerUI {
    constructor() {
        this.playerContainer = null;
        this.isInitialized = false;
        this.unsubscribe = null;
    }

    async initialize() {
        if (this.isInitialized) return;

        try {
            // Always create the UI first
            this.createPlayerUI();
            this.bindEvents();
            this.subscribeToState();
            this.startPeriodicUpdates();
            
            // Try to initialize the Web Playback SDK (optional)
            try {
                await spotifyPlayer.initializeWebPlaybackSDK();
                console.log('Spotify Web Playback SDK initialized');
            } catch (sdkError) {
                console.warn('Web Playback SDK not available, using API controls only:', sdkError.message);
                // Player will still work with API calls, just without Web Playback SDK features
            }
            
            this.isInitialized = true;
            console.log('Spotify Player UI initialized');
        } catch (error) {
            console.error('Failed to initialize Spotify Player UI:', error);
            this.showError('Failed to initialize player: ' + error.message);
        }
    }

    createPlayerUI() {
        const existingPlayer = document.getElementById('spotify-player');
        if (existingPlayer) {
            existingPlayer.remove();
        }

        this.playerContainer = document.createElement('div');
        this.playerContainer.id = 'spotify-player';
        this.playerContainer.className = 'spotify-player';
        
        this.playerContainer.innerHTML = `
            <div class="player-main">
                <div class="track-info">
                    <div class="track-image-container">
                        <img id="player-track-image" class="track-image" src="" alt="Album Art" style="display: none;">
                        <div id="player-track-placeholder" class="track-placeholder">🎵</div>
                    </div>
                    <div class="track-details">
                        <div id="player-track-name" class="track-name">Select a track</div>
                        <div id="player-track-artist" class="track-artist">No artist</div>
                    </div>
                </div>

                <div class="player-controls">
                    <div class="control-buttons">
                        <button id="shuffle-btn" class="control-btn" title="Shuffle">
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                                <path d="M13.151.922a.75.75 0 1 0-1.06 1.06L13.109 3H11.16a3.75 3.75 0 0 0-2.873 1.34l-6.173 7.356A2.25 2.25 0 0 1 .39 12.5H0V14h.391a3.75 3.75 0 0 0 2.873-1.34l6.173-7.356A2.25 2.25 0 0 1 11.16 4.5h1.95l-1.017 1.018a.75.75 0 0 0 1.06 1.06L15.98 3.75 13.151.922zM.391 3.5H0V2h.391c1.109 0 2.16.49 2.873 1.34L4.89 5.277l-.979 1.167L1.265 4.84A2.25 2.25 0 0 0 .39 3.5z"/>
                                <path d="m7.5 10.723.98-1.167.957 1.14a2.25 2.25 0 0 0 1.724.804h1.95l-1.017-1.018a.75.75 0 1 1 1.06-1.06L15.98 12.25l-2.829 2.828a.75.75 0 1 1-1.06-1.06L13.109 13H11.16a3.75 3.75 0 0 1-2.873-1.34l-.787-.938z"/>
                            </svg>
                        </button>

                        <button id="prev-btn" class="control-btn" title="Previous">
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                                <path d="M3.3 1a.7.7 0 0 1 .7.7v5.15l9.95-5.744a.7.7 0 0 1 1.05.606v12.588a.7.7 0 0 1-1.05.606L4 8.149V13.3a.7.7 0 0 1-1.4 0V1.7a.7.7 0 0 1 .7-.7z"/>
                            </svg>
                        </button>

                        <button id="play-pause-btn" class="control-btn play-btn" title="Play">
                            <svg id="play-icon" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                                <path d="m11.596 8.697-6.363 3.692c-.54.313-1.233-.066-1.233-.697V4.308c0-.63.692-1.01 1.233-.696l6.363 3.692a.802.802 0 0 1 0 1.393z"/>
                            </svg>
                            <svg id="pause-icon" width="16" height="16" viewBox="0 0 16 16" fill="currentColor" style="display: none;">
                                <path d="M5.5 3.5A1.5 1.5 0 0 1 7 2h2a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 9 14H7a1.5 1.5 0 0 1-1.5-1.5v-9z"/>
                            </svg>
                        </button>

                        <button id="next-btn" class="control-btn" title="Next">
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                                <path d="M12.7 1a.7.7 0 0 0-.7.7v5.15L2.05 1.107A.7.7 0 0 0 1 1.712v12.588a.7.7 0 0 0 1.05.606L12 8.149V13.3a.7.7 0 0 0 1.4 0V1.7a.7.7 0 0 0-.7-.7z"/>
                            </svg>
                        </button>

                        <button id="repeat-btn" class="control-btn" title="Repeat">
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                                <path d="M0 4.75A3.75 3.75 0 0 1 3.75 1h8.5A3.75 3.75 0 0 1 16 4.75v5a3.75 3.75 0 0 1-3.75 3.75H9.81l1.018 1.018a.75.75 0 1 1-1.06 1.06L6.939 12.75l2.829-2.828a.75.75 0 1 1 1.06 1.06L9.811 12h2.439A2.25 2.25 0 0 0 14.5 9.75v-5A2.25 2.25 0 0 0 12.25 2.5h-8.5A2.25 2.25 0 0 0 1.5 4.75v5A2.25 2.25 0 0 0 3.75 12H5v1.5H3.75A3.75 3.75 0 0 1 0 9.75v-5z"/>
                            </svg>
                        </button>
                    </div>

                    <div class="progress-container">
                        <span id="current-time" class="time-display">0:00</span>
                        <div class="progress-bar-container">
                            <div id="progress-bar" class="progress-bar">
                                <div id="progress-fill" class="progress-fill"></div>
                                <div id="progress-handle" class="progress-handle"></div>
                            </div>
                        </div>
                        <span id="total-time" class="time-display">0:00</span>
                    </div>
                </div>

                <div class="volume-controls">
                    <button id="volume-btn" class="control-btn" title="Volume">
                        <svg id="volume-icon" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                            <path d="M10.717 3.55A.5.5 0 0 1 11 4v8a.5.5 0 0 1-.812.39L7.825 10.5H5.5A.5.5 0 0 1 5 10V6a.5.5 0 0 1 .5-.5h2.325l2.363-1.89a.5.5 0 0 1 .529-.06zM10 5.04 8.312 6.39A.5.5 0 0 1 8 6.5H6v3h2a.5.5 0 0 1 .312.11L10 10.96V5.04z"/>
                            <path d="M11 4a.5.5 0 0 1 .5-.5c.712 0 1.36.295 1.83.735.474.44.775 1.06.775 1.765s-.301 1.325-.775 1.765c-.47.44-1.118.735-1.83.735A.5.5 0 0 1 11 8a.5.5 0 0 1 .5-.5c.446 0 .84-.19 1.14-.465.302-.277.485-.651.485-1.035s-.183-.758-.485-1.035c-.3-.275-.694-.465-1.14-.465A.5.5 0 0 1 11 4z"/>
                        </svg>
                    </button>
                    <div class="volume-slider-container">
                        <input type="range" id="volume-slider" class="volume-slider" min="0" max="100" value="50">
                    </div>
                </div>
            </div>

            <div id="player-error" class="player-error" style="display: none;"></div>
        `;

        document.body.appendChild(this.playerContainer);
    }

    bindEvents() {
        document.getElementById('play-pause-btn').addEventListener('click', () => this.togglePlayback());
        document.getElementById('prev-btn').addEventListener('click', () => this.previousTrack());
        document.getElementById('next-btn').addEventListener('click', () => this.nextTrack());
        document.getElementById('shuffle-btn').addEventListener('click', () => this.toggleShuffle());
        document.getElementById('repeat-btn').addEventListener('click', () => this.toggleRepeat());
        document.getElementById('volume-slider').addEventListener('input', (e) => this.setVolume(e.target.value));
        document.getElementById('volume-btn').addEventListener('click', () => this.toggleMute());

        this.bindProgressBarEvents();
    }

    bindProgressBarEvents() {
        const progressBar = document.getElementById('progress-bar');
        const progressFill = document.getElementById('progress-fill');
        const progressHandle = document.getElementById('progress-handle');
        let isDragging = false;

        const getProgressFromEvent = (e) => {
            const rect = progressBar.getBoundingClientRect();
            const x = e.clientX - rect.left;
            return Math.max(0, Math.min(1, x / rect.width));
        };

        const updateProgressVisual = (progress) => {
            const percentage = progress * 100;
            progressFill.style.width = percentage + '%';
            progressHandle.style.left = percentage + '%';
        };

        progressBar.addEventListener('mousedown', (e) => {
            isDragging = true;
            const progress = getProgressFromEvent(e);
            updateProgressVisual(progress);
            progressBar.style.cursor = 'grabbing';
        });

        document.addEventListener('mousemove', (e) => {
            if (isDragging) {
                const progress = getProgressFromEvent(e);
                updateProgressVisual(progress);
            }
        });

        document.addEventListener('mouseup', (e) => {
            if (isDragging) {
                const progress = getProgressFromEvent(e);
                const position = progress * playerState.state.duration;
                this.seekToPosition(position);
                isDragging = false;
                progressBar.style.cursor = 'pointer';
            }
        });

        progressBar.addEventListener('click', (e) => {
            if (!isDragging) {
                const progress = getProgressFromEvent(e);
                const position = progress * playerState.state.duration;
                this.seekToPosition(position);
            }
        });
    }

    subscribeToState() {
        this.unsubscribe = playerState.subscribe((newState, oldState) => {
            this.updateUI(newState, oldState);
        });
    }

    updateUI(state, oldState = {}) {
        this.updateTrackInfo(state.currentTrack);
        this.updatePlayButton(state.isPlaying);
        this.updateProgress(state.position, state.duration);
        this.updateShuffleButton(state.shuffle);
        this.updateRepeatButton(state.repeatMode);
        this.updateVolumeControl(state.volume);
        this.updateControlsState(state.disallows);
    }

    updateTrackInfo(track) {
        const trackName = document.getElementById('player-track-name');
        const trackArtist = document.getElementById('player-track-artist');
        const trackImage = document.getElementById('player-track-image');
        const trackPlaceholder = document.getElementById('player-track-placeholder');

        if (track) {
            trackName.textContent = track.name;
            trackArtist.textContent = track.artists.map(a => a.name).join(', ');
            
            if (track.album?.images?.[0]?.url) {
                trackImage.src = track.album.images[0].url;
                trackImage.style.display = 'block';
                trackPlaceholder.style.display = 'none';
            } else {
                trackImage.style.display = 'none';
                trackPlaceholder.style.display = 'flex';
            }
        } else {
            trackName.textContent = 'Select a track';
            trackArtist.textContent = 'No artist';
            trackImage.style.display = 'none';
            trackPlaceholder.style.display = 'flex';
        }
    }

    updatePlayButton(isPlaying) {
        const playIcon = document.getElementById('play-icon');
        const pauseIcon = document.getElementById('pause-icon');
        const playButton = document.getElementById('play-pause-btn');

        if (isPlaying) {
            playIcon.style.display = 'none';
            pauseIcon.style.display = 'block';
            playButton.title = 'Pause';
        } else {
            playIcon.style.display = 'block';
            pauseIcon.style.display = 'none';
            playButton.title = 'Play';
        }
    }

    updateProgress(position, duration) {
        const currentTime = document.getElementById('current-time');
        const totalTime = document.getElementById('total-time');
        const progressFill = document.getElementById('progress-fill');
        const progressHandle = document.getElementById('progress-handle');

        currentTime.textContent = this.formatTime(position);
        totalTime.textContent = this.formatTime(duration);

        if (duration > 0) {
            const progress = (position / duration) * 100;
            progressFill.style.width = progress + '%';
            progressHandle.style.left = progress + '%';
        }
    }

    updateShuffleButton(shuffle) {
        const shuffleBtn = document.getElementById('shuffle-btn');
        shuffleBtn.classList.toggle('active', shuffle);
    }

    updateRepeatButton(repeatMode) {
        const repeatBtn = document.getElementById('repeat-btn');
        repeatBtn.classList.remove('active', 'repeat-one');
        
        if (repeatMode === 'context') {
            repeatBtn.classList.add('active');
        } else if (repeatMode === 'track') {
            repeatBtn.classList.add('active', 'repeat-one');
        }
    }

    updateVolumeControl(volume) {
        const volumeSlider = document.getElementById('volume-slider');
        const volumeIcon = document.getElementById('volume-icon');
        
        volumeSlider.value = volume;
        
        // Update volume icon based on level
        if (volume === 0) {
            volumeIcon.innerHTML = `<path d="M10.717 3.55A.5.5 0 0 1 11 4v8a.5.5 0 0 1-.812.39L7.825 10.5H5.5A.5.5 0 0 1 5 10V6a.5.5 0 0 1 .5-.5h2.325l2.363-1.89a.5.5 0 0 1 .529-.06zM10 5.04 8.312 6.39A.5.5 0 0 1 8 6.5H6v3h2a.5.5 0 0 1 .312.11L10 10.96V5.04z"/><path d="M6.717 3.55A.5.5 0 0 1 7 4v8a.5.5 0 0 1-.812.39L3.825 10.5H1.5A.5.5 0 0 1 1 10V6a.5.5 0 0 1 .5-.5h2.325l2.363-1.89a.5.5 0 0 1 .529-.06z"/>`;
        } else if (volume < 50) {
            volumeIcon.innerHTML = `<path d="M10.717 3.55A.5.5 0 0 1 11 4v8a.5.5 0 0 1-.812.39L7.825 10.5H5.5A.5.5 0 0 1 5 10V6a.5.5 0 0 1 .5-.5h2.325l2.363-1.89a.5.5 0 0 1 .529-.06zM10 5.04 8.312 6.39A.5.5 0 0 1 8 6.5H6v3h2a.5.5 0 0 1 .312.11L10 10.96V5.04z"/>`;
        } else {
            volumeIcon.innerHTML = `<path d="M10.717 3.55A.5.5 0 0 1 11 4v8a.5.5 0 0 1-.812.39L7.825 10.5H5.5A.5.5 0 0 1 5 10V6a.5.5 0 0 1 .5-.5h2.325l2.363-1.89a.5.5 0 0 1 .529-.06zM10 5.04 8.312 6.39A.5.5 0 0 1 8 6.5H6v3h2a.5.5 0 0 1 .312.11L10 10.96V5.04z"/><path d="M11 4a.5.5 0 0 1 .5-.5c.712 0 1.36.295 1.83.735.474.44.775 1.06.775 1.765s-.301 1.325-.775 1.765c-.47.44-1.118.735-1.83.735A.5.5 0 0 1 11 8a.5.5 0 0 1 .5-.5c.446 0 .84-.19 1.14-.465.302-.277.485-.651.485-1.035s-.183-.758-.485-1.035c-.3-.275-.694-.465-1.14-.465A.5.5 0 0 1 11 4z"/>`;
        }
    }

    updateControlsState(disallows) {
        const playBtn = document.getElementById('play-pause-btn');
        const nextBtn = document.getElementById('next-btn');
        const prevBtn = document.getElementById('prev-btn');
        const shuffleBtn = document.getElementById('shuffle-btn');
        const repeatBtn = document.getElementById('repeat-btn');

        playBtn.disabled = disallows.pausing && disallows.resuming;
        nextBtn.disabled = disallows.skipping_next;
        prevBtn.disabled = disallows.skipping_prev;
        shuffleBtn.disabled = disallows.toggling_shuffle;
        repeatBtn.disabled = disallows.toggling_repeat_context && disallows.toggling_repeat_track;
    }

    formatTime(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    async togglePlayback() {
        try {
            await spotifyPlayer.togglePlayback();
        } catch (error) {
            this.showError('Playback error: ' + error.message);
        }
    }

    async previousTrack() {
        try {
            await spotifyPlayer.previousTrack();
        } catch (error) {
            this.showError('Previous track error: ' + error.message);
        }
    }

    async nextTrack() {
        try {
            await spotifyPlayer.nextTrack();
        } catch (error) {
            this.showError('Next track error: ' + error.message);
        }
    }

    async toggleShuffle() {
        try {
            const newState = !playerState.state.shuffle;
            await spotifyPlayer.toggleShuffle(newState);
        } catch (error) {
            this.showError('Shuffle error: ' + error.message);
        }
    }

    async toggleRepeat() {
        try {
            let nextMode;
            switch (playerState.state.repeatMode) {
                case 'off': nextMode = 'context'; break;
                case 'context': nextMode = 'track'; break;
                case 'track': nextMode = 'off'; break;
                default: nextMode = 'off';
            }
            await spotifyPlayer.setRepeatMode(nextMode);
        } catch (error) {
            this.showError('Repeat error: ' + error.message);
        }
    }

    async setVolume(volume) {
        try {
            await spotifyPlayer.setVolume(parseInt(volume));
            playerState.updateState({ volume: parseInt(volume) });
        } catch (error) {
            this.showError('Volume error: ' + error.message);
        }
    }

    async seekToPosition(position) {
        try {
            await spotifyPlayer.seekToPosition(Math.floor(position));
        } catch (error) {
            this.showError('Seek error: ' + error.message);
        }
    }

    async toggleMute() {
        try {
            const currentVolume = playerState.state.volume;
            const newVolume = currentVolume > 0 ? 0 : 50;
            await this.setVolume(newVolume);
        } catch (error) {
            this.showError('Mute error: ' + error.message);
        }
    }

    showError(message) {
        const errorElement = document.getElementById('player-error');
        errorElement.textContent = message;
        errorElement.style.display = 'block';
        
        setTimeout(() => {
            errorElement.style.display = 'none';
        }, 5000);
    }

    startPeriodicUpdates() {
        setInterval(async () => {
            try {
                const state = await spotifyPlayer.getPlaybackState();
                if (state) {
                    playerState.updateFromAPIState(state);
                }
            } catch (error) {
                console.error('Error updating player state:', error);
            }
        }, 5000);

        playerState.startPositionUpdates();
    }

    destroy() {
        if (this.unsubscribe) {
            this.unsubscribe();
        }
        
        if (this.playerContainer) {
            this.playerContainer.remove();
        }
        
        playerState.destroy();
        spotifyPlayer.disconnect();
        this.isInitialized = false;
    }
}

const spotifyPlayerUI = new SpotifyPlayerUI();
window.spotifyPlayerUI = spotifyPlayerUI;