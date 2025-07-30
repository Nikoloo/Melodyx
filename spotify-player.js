class SpotifyPlayerService {
    constructor() {
        this.baseURL = 'https://api.spotify.com/v1/me/player';
        this.deviceId = null;
        this.isInitialized = false;
    }

    getAccessToken() {
        return SpotifyAuth.getAccessToken();
    }

    async makeRequest(endpoint, method = 'GET', body = null) {
        const token = this.getAccessToken();
        if (!token) {
            throw new Error('No access token available');
        }

        const options = {
            method,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        };

        if (body) {
            options.body = JSON.stringify(body);
        }

        const response = await fetch(endpoint, options);
        
        if (response.status === 401) {
            SpotifyAuth.logout();
            throw new Error('Authentication expired');
        }

        if (response.status === 204) {
            return null;
        }

        if (!response.ok) {
            const error = await response.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(error.error?.message || 'Request failed');
        }

        return response.json();
    }

    async getPlaybackState() {
        try {
            return await this.makeRequest(this.baseURL);
        } catch (error) {
            console.error('Error getting playback state:', error);
            return null;
        }
    }

    async startPlayback(deviceId = null, uris = null, contextUri = null) {
        const body = {};
        
        if (deviceId) {
            body.device_ids = [deviceId];
        }
        
        if (uris) {
            body.uris = uris;
        } else if (contextUri) {
            body.context_uri = contextUri;
        }

        return this.makeRequest(`${this.baseURL}/play`, 'PUT', Object.keys(body).length > 0 ? body : null);
    }

    async pausePlayback() {
        return this.makeRequest(`${this.baseURL}/pause`, 'PUT');
    }

    async nextTrack() {
        return this.makeRequest(`${this.baseURL}/next`, 'POST');
    }

    async previousTrack() {
        return this.makeRequest(`${this.baseURL}/previous`, 'POST');
    }

    async seekToPosition(positionMs) {
        return this.makeRequest(`${this.baseURL}/seek?position_ms=${positionMs}`, 'PUT');
    }

    async setVolume(volumePercent) {
        return this.makeRequest(`${this.baseURL}/volume?volume_percent=${Math.max(0, Math.min(100, volumePercent))}`, 'PUT');
    }

    async toggleShuffle(state) {
        return this.makeRequest(`${this.baseURL}/shuffle?state=${state}`, 'PUT');
    }

    async setRepeatMode(state) {
        return this.makeRequest(`${this.baseURL}/repeat?state=${state}`, 'PUT');
    }

    async addToQueue(uri) {
        return this.makeRequest(`${this.baseURL}/queue?uri=${encodeURIComponent(uri)}`, 'POST');
    }

    async getAvailableDevices() {
        return this.makeRequest(`${this.baseURL}/devices`);
    }

    async transferPlayback(deviceIds, play = false) {
        return this.makeRequest(this.baseURL, 'PUT', {
            device_ids: deviceIds,
            play: play
        });
    }

    async initializeWebPlaybackSDK() {
        return new Promise((resolve, reject) => {
            if (window.Spotify) {
                this.setupPlayer(resolve, reject);
                return;
            }

            window.onSpotifyWebPlaybackSDKReady = () => {
                this.setupPlayer(resolve, reject);
            };

            if (!document.querySelector('script[src*="spotify-player"]')) {
                const script = document.createElement('script');
                script.src = 'https://sdk.scdn.co/spotify-player.js';
                script.async = true;
                document.head.appendChild(script);
            }
        });
    }

    setupPlayer(resolve, reject) {
        const token = this.getAccessToken();
        if (!token) {
            reject(new Error('No access token'));
            return;
        }

        this.player = new Spotify.Player({
            name: 'Melodyx Web Player',
            getOAuthToken: cb => { cb(token); },
            volume: 0.5
        });

        this.player.addListener('ready', ({ device_id }) => {
            console.log('Ready with Device ID', device_id);
            this.deviceId = device_id;
            this.isInitialized = true;
            resolve(device_id);
        });

        this.player.addListener('not_ready', ({ device_id }) => {
            console.log('Device ID has gone offline', device_id);
        });

        this.player.addListener('initialization_error', ({ message }) => {
            console.error('Failed to initialize', message);
            reject(new Error(message));
        });

        this.player.addListener('authentication_error', ({ message }) => {
            console.error('Failed to authenticate', message);
            SpotifyAuth.logout();
            reject(new Error(message));
        });

        this.player.addListener('account_error', ({ message }) => {
            console.error('Failed to validate Spotify account', message);
            reject(new Error(message));
        });

        this.player.addListener('playback_error', ({ message }) => {
            console.error('Failed to perform playback', message);
        });

        this.player.addListener('player_state_changed', state => {
            if (state) {
                playerState.updateFromSpotifyState(state);
            }
        });

        this.player.connect().then(success => {
            if (success) {
                console.log('Successfully connected to Spotify!');
            } else {
                reject(new Error('Failed to connect to Spotify'));
            }
        });
    }

    async togglePlayback() {
        if (this.player) {
            const state = await this.player.getCurrentState();
            if (state && !state.paused) {
                return this.pausePlayback();
            } else {
                return this.startPlayback();
            }
        } else {
            const state = await this.getPlaybackState();
            if (state && !state.is_playing) {
                return this.startPlayback();
            } else {
                return this.pausePlayback();
            }
        }
    }

    disconnect() {
        if (this.player) {
            this.player.disconnect();
            this.player = null;
            this.deviceId = null;
            this.isInitialized = false;
        }
    }
}

class PlayerState {
    constructor() {
        this.state = {
            isPlaying: false,
            currentTrack: null,
            position: 0,
            duration: 0,
            volume: 50,
            shuffle: false,
            repeatMode: 'off',
            device: null,
            context: null,
            disallows: {}
        };
        this.listeners = [];
        this.updateInterval = null;
    }

    subscribe(callback) {
        this.listeners.push(callback);
        return () => {
            this.listeners = this.listeners.filter(cb => cb !== callback);
        };
    }

    updateState(newState) {
        const oldState = { ...this.state };
        this.state = { ...this.state, ...newState };
        
        this.notifyListeners(this.state, oldState);
    }

    updateFromSpotifyState(spotifyState) {
        const newState = {
            isPlaying: !spotifyState.paused,
            position: spotifyState.position,
            duration: spotifyState.duration,
            shuffle: spotifyState.shuffle,
            repeatMode: this.mapRepeatMode(spotifyState.repeat_mode),
            disallows: spotifyState.disallows || {}
        };

        if (spotifyState.track_window?.current_track) {
            const track = spotifyState.track_window.current_track;
            newState.currentTrack = {
                id: track.id,
                name: track.name,
                artists: track.artists,
                album: track.album,
                duration_ms: track.duration_ms,
                uri: track.uri
            };
            newState.duration = track.duration_ms;
        }

        this.updateState(newState);
    }

    updateFromAPIState(apiState) {
        if (!apiState) return;

        const newState = {
            isPlaying: apiState.is_playing,
            position: apiState.progress_ms,
            shuffle: apiState.shuffle_state,
            repeatMode: apiState.repeat_state,
            volume: apiState.device?.volume_percent || this.state.volume,
            device: apiState.device
        };

        if (apiState.item) {
            newState.currentTrack = {
                id: apiState.item.id,
                name: apiState.item.name,
                artists: apiState.item.artists,
                album: apiState.item.album,
                duration_ms: apiState.item.duration_ms,
                uri: apiState.item.uri
            };
            newState.duration = apiState.item.duration_ms;
        }

        if (apiState.context) {
            newState.context = apiState.context;
        }

        this.updateState(newState);
    }

    mapRepeatMode(spotifyRepeatMode) {
        switch (spotifyRepeatMode) {
            case 0: return 'off';
            case 1: return 'context';
            case 2: return 'track';
            default: return 'off';
        }
    }

    notifyListeners(newState, oldState) {
        this.listeners.forEach(callback => {
            try {
                callback(newState, oldState);
            } catch (error) {
                console.error('Error in state listener:', error);
            }
        });
    }

    startPositionUpdates() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
        }

        this.updateInterval = setInterval(() => {
            if (this.state.isPlaying && this.state.position < this.state.duration) {
                this.updateState({
                    position: Math.min(this.state.position + 1000, this.state.duration)
                });
            }
        }, 1000);
    }

    stopPositionUpdates() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
    }

    destroy() {
        this.stopPositionUpdates();
        this.listeners = [];
    }
}

const spotifyPlayer = new SpotifyPlayerService();
const playerState = new PlayerState();

window.spotifyPlayer = spotifyPlayer;
window.playerState = playerState;