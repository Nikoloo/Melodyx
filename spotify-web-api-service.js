// Spotify Web API Service - Melodyx
// Handles all Spotify Web API interactions for player controls

class SpotifyWebAPIService {
    constructor() {
        this.baseURL = 'https://api.spotify.com/v1';
        logger.info('SpotifyWebAPIService: Service initialisé');
    }

    // Obtenir les headers d'authentification
    async getAuthHeaders() {
        const token = await SpotifyAuth.getValidAccessToken();
        if (!token) {
            throw new Error('Token d\'accès non disponible');
        }
        
        return {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        };
    }

    // Effectuer une requête API
    async apiRequest(endpoint, options = {}) {
        const url = `${this.baseURL}${endpoint}`;
        const headers = await this.getAuthHeaders();
        
        const config = {
            headers,
            ...options
        };
        
        logger.debug('SpotifyWebAPIService: Requête API', { method: config.method || 'GET', endpoint });
        
        const response = await fetch(url, config);
        
        // 204 No Content est valide pour certaines opérations
        if (response.status === 204) {
            return null;
        }
        
        if (!response.ok) {
            const error = await response.text();
            logger.error('SpotifyWebAPIService: Erreur API', { 
                status: response.status, 
                endpoint,
                error 
            });
            throw new Error(`API Error ${response.status}: ${error}`);
        }
        
        return response.json();
    }

    // === CONTRÔLES DE LECTURE ===

    // Démarrer/reprendre la lecture
    async resumePlayback(deviceId = null) {
        logger.info('SpotifyWebAPIService: Resume playback', { deviceId });
        
        const body = {};
        if (deviceId) {
            body.device_ids = [deviceId];
        }
        
        return this.apiRequest('/me/player/play', {
            method: 'PUT',
            body: JSON.stringify(body)
        });
    }

    // Mettre en pause
    async pausePlayback() {
        logger.info('SpotifyWebAPIService: Pause playback');
        
        return this.apiRequest('/me/player/pause', {
            method: 'PUT'
        });
    }

    // Piste suivante
    async nextTrack() {
        logger.info('SpotifyWebAPIService: Next track');
        
        return this.apiRequest('/me/player/next', {
            method: 'POST'
        });
    }

    // Piste précédente
    async previousTrack() {
        logger.info('SpotifyWebAPIService: Previous track');
        
        return this.apiRequest('/me/player/previous', {
            method: 'POST'
        });
    }

    // Régler le volume (0-100)
    async setVolume(volumePercent) {
        logger.debug('SpotifyWebAPIService: Set volume', { volumePercent });
        
        return this.apiRequest(`/me/player/volume?volume_percent=${volumePercent}`, {
            method: 'PUT'
        });
    }

    // Chercher une position dans la piste (en millisecondes)
    async seekToPosition(positionMs) {
        logger.debug('SpotifyWebAPIService: Seek to position', { positionMs });
        
        return this.apiRequest(`/me/player/seek?position_ms=${positionMs}`, {
            method: 'PUT'
        });
    }

    // Activer/désactiver le mode aléatoire
    async toggleShuffle(state) {
        logger.info('SpotifyWebAPIService: Toggle shuffle', { state });
        
        return this.apiRequest(`/me/player/shuffle?state=${state}`, {
            method: 'PUT'
        });
    }

    // Définir le mode de répétition (track, context, off)
    async setRepeatMode(state) {
        logger.info('SpotifyWebAPIService: Set repeat mode', { state });
        
        return this.apiRequest(`/me/player/repeat?state=${state}`, {
            method: 'PUT'
        });
    }

    // === GESTION DES APPAREILS ===

    // Obtenir les appareils disponibles
    async getAvailableDevices() {
        logger.debug('SpotifyWebAPIService: Get available devices');
        
        const response = await this.apiRequest('/me/player/devices');
        return response?.devices || [];
    }

    // Transférer la lecture vers un appareil
    async transferPlaybackToDevice(deviceId, play = false) {
        logger.info('SpotifyWebAPIService: Transfer playback', { deviceId, play });
        
        return this.apiRequest('/me/player', {
            method: 'PUT',
            body: JSON.stringify({
                device_ids: [deviceId],
                play: play
            })
        });
    }

    // === ÉTAT DE LECTURE ===

    // Obtenir l'état de lecture actuel
    async getPlaybackState() {
        logger.debug('SpotifyWebAPIService: Get playback state');
        
        try {
            return await this.apiRequest('/me/player');
        } catch (error) {
            // Une erreur 404 ou 204 indique qu'aucune lecture n'est active
            if (error.message.includes('404') || error.message.includes('204')) {
                logger.debug('SpotifyWebAPIService: Aucune lecture active');
                return null;
            }
            throw error;
        }
    }

    // Obtenir la piste actuellement en lecture
    async getCurrentlyPlaying() {
        logger.debug('SpotifyWebAPIService: Get currently playing');
        
        try {
            return await this.apiRequest('/me/player/currently-playing');
        } catch (error) {
            if (error.message.includes('404') || error.message.includes('204')) {
                logger.debug('SpotifyWebAPIService: Aucune piste en lecture');
                return null;
            }
            throw error;
        }
    }

    // === PLAYLISTS ET CONTEXTES ===

    // Jouer une playlist/album/artiste
    async playContext(contextUri, deviceId = null, offset = null) {
        logger.info('SpotifyWebAPIService: Play context', { contextUri, deviceId, offset });
        
        const body = {
            context_uri: contextUri
        };
        
        if (offset !== null) {
            body.offset = { position: offset };
        }
        
        if (deviceId) {
            body.device_ids = [deviceId];
        }
        
        return this.apiRequest('/me/player/play', {
            method: 'PUT',
            body: JSON.stringify(body)
        });
    }

    // Jouer des pistes spécifiques
    async playTracks(trackUris, deviceId = null, offset = null) {
        logger.info('SpotifyWebAPIService: Play tracks', { trackUris, deviceId, offset });
        
        const body = {
            uris: trackUris
        };
        
        if (offset !== null) {
            body.offset = { position: offset };
        }
        
        if (deviceId) {
            body.device_ids = [deviceId];
        }
        
        return this.apiRequest('/me/player/play', {
            method: 'PUT',
            body: JSON.stringify(body)
        });
    }

    // === INFORMATIONS UTILISATEUR ===

    // Obtenir le profil utilisateur
    async getUserProfile() {
        logger.debug('SpotifyWebAPIService: Get user profile');
        
        return this.apiRequest('/me');
    }

    // Vérifier si une piste est aimée
    async checkSavedTracks(trackIds) {
        logger.debug('SpotifyWebAPIService: Check saved tracks', { trackIds });
        
        const ids = Array.isArray(trackIds) ? trackIds.join(',') : trackIds;
        return this.apiRequest(`/me/tracks/contains?ids=${ids}`);
    }

    // Aimer/ne plus aimer une piste
    async toggleSavedTrack(trackId, save = true) {
        logger.info('SpotifyWebAPIService: Toggle saved track', { trackId, save });
        
        const method = save ? 'PUT' : 'DELETE';
        return this.apiRequest(`/me/tracks?ids=${trackId}`, { method });
    }

    // === QUEUE ===

    // Obtenir la queue
    async getQueue() {
        logger.debug('SpotifyWebAPIService: Get queue');
        
        return this.apiRequest('/me/player/queue');
    }

    // Ajouter à la queue
    async addToQueue(uri) {
        logger.info('SpotifyWebAPIService: Add to queue', { uri });
        
        return this.apiRequest(`/me/player/queue?uri=${encodeURIComponent(uri)}`, {
            method: 'POST'
        });
    }

    // === RECHERCHE ===

    // Rechercher du contenu
    async search(query, types = ['track'], limit = 20, offset = 0) {
        logger.debug('SpotifyWebAPIService: Search', { query, types, limit });
        
        const typeParam = types.join(',');
        const params = new URLSearchParams({
            q: query,
            type: typeParam,
            limit: limit.toString(),
            offset: offset.toString()
        });
        
        return this.apiRequest(`/search?${params}`);
    }

    // === PLAYLISTS ===

    // Obtenir les playlists de l'utilisateur
    async getUserPlaylists(limit = 50, offset = 0) {
        logger.debug('SpotifyWebAPIService: Get user playlists', { limit });
        
        return this.apiRequest(`/me/playlists?limit=${limit}&offset=${offset}`);
    }

    // Obtenir une playlist
    async getPlaylist(playlistId) {
        logger.debug('SpotifyWebAPIService: Get playlist', { playlistId });
        
        return this.apiRequest(`/playlists/${playlistId}`);
    }

    // Obtenir les pistes d'une playlist
    async getPlaylistTracks(playlistId, limit = 100, offset = 0) {
        logger.debug('SpotifyWebAPIService: Get playlist tracks', { playlistId, limit });
        
        return this.apiRequest(`/playlists/${playlistId}/tracks?limit=${limit}&offset=${offset}`);
    }

    // === ALBUMS ===

    // Obtenir un album
    async getAlbum(albumId) {
        logger.debug('SpotifyWebAPIService: Get album', { albumId });
        
        return this.apiRequest(`/albums/${albumId}`);
    }

    // Obtenir les pistes d'un album
    async getAlbumTracks(albumId, limit = 50, offset = 0) {
        logger.debug('SpotifyWebAPIService: Get album tracks', { albumId, limit });
        
        return this.apiRequest(`/albums/${albumId}/tracks?limit=${limit}&offset=${offset}`);
    }

    // === ARTISTES ===

    // Obtenir un artiste
    async getArtist(artistId) {
        logger.debug('SpotifyWebAPIService: Get artist', { artistId });
        
        return this.apiRequest(`/artists/${artistId}`);
    }

    // Obtenir les top tracks d'un artiste
    async getArtistTopTracks(artistId, market = 'FR') {
        logger.debug('SpotifyWebAPIService: Get artist top tracks', { artistId, market });
        
        return this.apiRequest(`/artists/${artistId}/top-tracks?market=${market}`);
    }
}

// Export global
window.SpotifyWebAPIService = SpotifyWebAPIService;