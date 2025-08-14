// Spotify Web API Service - Melodyx
// Handles all Spotify Web API interactions for player controls

class SpotifyWebAPIService {
    constructor() {
        this.baseURL = 'https://api.spotify.com/v1';
        
        // Search functionality
        this.searchCache = new Map();
        this.searchCacheTimeout = 5 * 60 * 1000; // 5 minutes TTL
        this.maxCacheSize = 100;
        this.searchDebounceTimeout = null;
        this.currentSearchController = null;
        
        // Rate limiting
        this.requestQueue = [];
        this.isProcessingQueue = false;
        this.rateLimitRemaining = 1;
        this.rateLimitReset = Date.now();
        this.retryDelays = [1000, 2000, 4000, 8000]; // Exponential backoff
        
        logger.info('SpotifyWebAPIService: Service initialisé with enhanced search capabilities');
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

    // Effectuer une requête API avec gestion avancée des erreurs et rate limiting
    async apiRequest(endpoint, options = {}) {
        return this.apiRequestWithRetry(endpoint, options, 0);
    }

    // Requête API avec retry logic et rate limiting
    async apiRequestWithRetry(endpoint, options = {}, retryCount = 0) {
        const url = `${this.baseURL}${endpoint}`;
        
        try {
            // Check rate limiting
            await this.checkRateLimit();
            
            const headers = await this.getAuthHeaders();
            const config = {
                headers,
                ...options
            };
            
            // Add AbortController for request cancellation
            if (!config.signal && this.currentSearchController) {
                config.signal = this.currentSearchController.signal;
            }
            
            logger.debug('SpotifyWebAPIService: Requête API', { 
                method: config.method || 'GET', 
                endpoint,
                retryCount 
            });
            
            const response = await fetch(url, config);
            
            // Update rate limit info from headers
            this.updateRateLimitInfo(response);
            
            // 204 No Content est valide pour certaines opérations
            if (response.status === 204) {
                return null;
            }
            
            // Handle rate limiting (429 Too Many Requests)
            if (response.status === 429) {
                const retryAfter = parseInt(response.headers.get('Retry-After') || '1') * 1000;
                logger.warn('SpotifyWebAPIService: Rate limited, retrying after', { retryAfter });
                
                if (retryCount < this.retryDelays.length) {
                    await this.delay(retryAfter);
                    return this.apiRequestWithRetry(endpoint, options, retryCount + 1);
                }
                throw new Error('Rate limit exceeded, max retries reached');
            }
            
            // Handle server errors with exponential backoff
            if (response.status >= 500 && retryCount < this.retryDelays.length) {
                const delay = this.retryDelays[retryCount];
                logger.warn('SpotifyWebAPIService: Server error, retrying', { 
                    status: response.status, 
                    delay,
                    retryCount 
                });
                
                await this.delay(delay);
                return this.apiRequestWithRetry(endpoint, options, retryCount + 1);
            }
            
            if (!response.ok) {
                const error = await response.text();
                logger.error('SpotifyWebAPIService: Erreur API', { 
                    status: response.status, 
                    endpoint,
                    error,
                    retryCount
                });
                throw new Error(`API Error ${response.status}: ${error}`);
            }
            
            // Vérifier le content-type avant de parser en JSON
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                return response.json();
            } else {
                // Si ce n'est pas du JSON, retourner le texte ou null pour les opérations qui n'ont pas de contenu
                const text = await response.text();
                return text || null;
            }
            
        } catch (error) {
            // Don't retry if request was aborted (search cancelled)
            if (error.name === 'AbortError') {
                logger.debug('SpotifyWebAPIService: Request aborted');
                throw error;
            }
            
            // Network errors - retry with exponential backoff
            if (retryCount < this.retryDelays.length && this.isNetworkError(error)) {
                const delay = this.retryDelays[retryCount];
                logger.warn('SpotifyWebAPIService: Network error, retrying', { 
                    error: error.message, 
                    delay,
                    retryCount 
                });
                
                await this.delay(delay);
                return this.apiRequestWithRetry(endpoint, options, retryCount + 1);
            }
            
            throw error;
        }
    }

    // Check if error is a network error that should be retried
    isNetworkError(error) {
        return error.name === 'TypeError' || 
               error.message.includes('network') ||
               error.message.includes('fetch');
    }

    // Update rate limit information from response headers
    updateRateLimitInfo(response) {
        const remaining = response.headers.get('X-RateLimit-Remaining');
        const reset = response.headers.get('X-RateLimit-Reset');
        
        if (remaining !== null) {
            this.rateLimitRemaining = parseInt(remaining);
        }
        
        if (reset !== null) {
            this.rateLimitReset = parseInt(reset) * 1000; // Convert to milliseconds
        }
    }

    // Check and handle rate limiting
    async checkRateLimit() {
        if (this.rateLimitRemaining <= 1 && Date.now() < this.rateLimitReset) {
            const waitTime = this.rateLimitReset - Date.now();
            logger.info('SpotifyWebAPIService: Pre-emptive rate limit wait', { waitTime });
            await this.delay(waitTime);
        }
    }

    // Utility delay function
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
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

    // === ENHANCED SEARCH FUNCTIONALITY ===

    // Search cache management
    getCacheKey(query, types, limit, offset) {
        return `${query.toLowerCase().trim()}_${types.join(',')}_${limit}_${offset}`;
    }

    getCachedResult(cacheKey) {
        const cached = this.searchCache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < this.searchCacheTimeout) {
            logger.debug('SpotifyWebAPIService: Cache hit', { cacheKey });
            return cached.data;
        }
        
        if (cached) {
            this.searchCache.delete(cacheKey);
        }
        return null;
    }

    setCacheResult(cacheKey, data) {
        // Manage cache size
        if (this.searchCache.size >= this.maxCacheSize) {
            const firstKey = this.searchCache.keys().next().value;
            this.searchCache.delete(firstKey);
        }

        this.searchCache.set(cacheKey, {
            data,
            timestamp: Date.now()
        });
        
        logger.debug('SpotifyWebAPIService: Result cached', { cacheKey });
    }

    // Clear search cache
    clearSearchCache() {
        this.searchCache.clear();
        logger.info('SpotifyWebAPIService: Search cache cleared');
    }

    // Cancel current search
    cancelCurrentSearch() {
        if (this.currentSearchController) {
            this.currentSearchController.abort();
            this.currentSearchController = null;
            logger.debug('SpotifyWebAPIService: Current search cancelled');
        }
    }

    // Core search method with caching and error handling
    async search(query, types = ['track'], limit = 20, offset = 0, market = 'US') {
        const trimmedQuery = query.trim();
        if (!trimmedQuery || trimmedQuery.length < 1) {
            return this.getEmptySearchResult(types);
        }

        const cacheKey = this.getCacheKey(trimmedQuery, types, limit, offset);
        
        // Check cache first
        const cachedResult = this.getCachedResult(cacheKey);
        if (cachedResult) {
            return cachedResult;
        }

        logger.debug('SpotifyWebAPIService: Search', { query: trimmedQuery, types, limit, offset });
        
        try {
            // Cancel any existing search
            this.cancelCurrentSearch();
            
            // Create new AbortController for this search
            this.currentSearchController = new AbortController();
            
            const typeParam = types.join(',');
            const params = new URLSearchParams({
                q: trimmedQuery,
                type: typeParam,
                limit: limit.toString(),
                offset: offset.toString(),
                market
            });
            
            const result = await this.apiRequest(`/search?${params}`, {
                signal: this.currentSearchController.signal
            });
            
            // Normalize and enhance the result
            const normalizedResult = this.normalizeSearchResult(result, types);
            
            // Cache the result
            this.setCacheResult(cacheKey, normalizedResult);
            
            this.currentSearchController = null;
            return normalizedResult;
            
        } catch (error) {
            this.currentSearchController = null;
            
            if (error.name === 'AbortError') {
                logger.debug('SpotifyWebAPIService: Search cancelled');
                throw error;
            }
            
            logger.error('SpotifyWebAPIService: Search error', { query: trimmedQuery, error });
            throw error;
        }
    }

    // Normalize search results for consistent structure
    normalizeSearchResult(result, types) {
        const normalized = {};
        
        types.forEach(type => {
            const key = type + 's';
            if (result[key]) {
                normalized[key] = {
                    ...result[key],
                    items: result[key].items.map(item => this.normalizeSearchItem(item, type))
                };
            } else {
                normalized[key] = { items: [], total: 0, limit: 20, offset: 0 };
            }
        });
        
        return normalized;
    }

    // Normalize individual search items
    normalizeSearchItem(item, type) {
        const normalized = { ...item };
        
        // Add consistent image handling
        if (item.images) {
            normalized.image = this.getBestImage(item.images);
        } else if (item.album?.images) {
            normalized.image = this.getBestImage(item.album.images);
        } else {
            normalized.image = null;
        }
        
        // Add type field
        normalized.type = type;
        
        // Add display name for consistent rendering
        switch (type) {
            case 'track':
                normalized.displayName = item.name;
                normalized.displaySubtitle = item.artists?.map(a => a.name).join(', ') || '';
                normalized.duration = item.duration_ms;
                break;
            case 'artist':
                normalized.displayName = item.name;
                normalized.displaySubtitle = `${item.followers?.total || 0} followers`;
                break;
            case 'album':
                normalized.displayName = item.name;
                normalized.displaySubtitle = item.artists?.map(a => a.name).join(', ') || '';
                normalized.trackCount = item.total_tracks;
                break;
            case 'playlist':
                normalized.displayName = item.name;
                normalized.displaySubtitle = `${item.tracks?.total || 0} tracks`;
                normalized.trackCount = item.tracks?.total;
                break;
        }
        
        return normalized;
    }

    // Get best image from image array
    getBestImage(images) {
        if (!images || images.length === 0) return null;
        
        // Prefer medium size (300px) or fallback to largest
        const mediumImage = images.find(img => img.width >= 200 && img.width <= 400);
        if (mediumImage) return mediumImage;
        
        // Fallback to first image
        return images[0];
    }

    // Get empty search result structure
    getEmptySearchResult(types) {
        const result = {};
        types.forEach(type => {
            result[type + 's'] = { items: [], total: 0, limit: 20, offset: 0 };
        });
        return result;
    }

    // Debounced search with automatic cancellation
    async debouncedSearch(query, types = ['track'], limit = 20, offset = 0, debounceMs = 300) {
        return new Promise((resolve, reject) => {
            // Clear existing debounce timeout
            if (this.searchDebounceTimeout) {
                clearTimeout(this.searchDebounceTimeout);
            }
            
            this.searchDebounceTimeout = setTimeout(async () => {
                try {
                    const result = await this.search(query, types, limit, offset);
                    resolve(result);
                } catch (error) {
                    reject(error);
                }
            }, debounceMs);
        });
    }

    // Quick search for immediate results (cached or fast)
    async quickSearch(query, type = 'track', limit = 10) {
        logger.debug('SpotifyWebAPIService: Quick search', { query, type, limit });
        
        if (!query || query.trim().length < 2) {
            return this.getEmptySearchResult([type]);
        }
        
        try {
            const results = await this.search(query.trim(), [type], limit);
            return results;
        } catch (error) {
            if (error.name === 'AbortError') {
                throw error;
            }
            
            logger.error('SpotifyWebAPIService: Quick search error', error);
            return this.getEmptySearchResult([type]);
        }
    }

    // Multi-type search with suggestions
    async searchWithSuggestions(query, limit = 15) {
        logger.debug('SpotifyWebAPIService: Search with suggestions', { query, limit });
        
        if (!query || query.trim().length < 2) {
            return {
                tracks: [],
                artists: [],
                albums: [],
                playlists: []
            };
        }
        
        try {
            const results = await this.search(query.trim(), ['track', 'artist', 'album', 'playlist'], limit);
            
            return {
                tracks: results.tracks?.items || [],
                artists: results.artists?.items || [],
                albums: results.albums?.items || [],
                playlists: results.playlists?.items || []
            };
        } catch (error) {
            if (error.name === 'AbortError') {
                throw error;
            }
            
            logger.error('SpotifyWebAPIService: Search with suggestions error', error);
            return {
                tracks: [],
                artists: [],
                albums: [],
                playlists: []
            };
        }
    }

    // Paginated search for loading more results
    async searchMore(query, type, currentResults, limit = 20) {
        const offset = currentResults.length;
        
        try {
            const results = await this.search(query, [type], limit, offset);
            const newItems = results[type + 's']?.items || [];
            
            return {
                items: [...currentResults, ...newItems],
                hasMore: newItems.length === limit,
                total: results[type + 's']?.total || 0
            };
        } catch (error) {
            logger.error('SpotifyWebAPIService: Search more error', error);
            return {
                items: currentResults,
                hasMore: false,
                total: currentResults.length
            };
        }
    }

    // Advanced search with filters
    async advancedSearch(options) {
        const {
            query,
            type = 'track',
            artist = '',
            album = '',
            year = '',
            genre = '',
            limit = 20,
            offset = 0
        } = options;

        let searchQuery = query || '';
        
        // Build advanced query string
        if (artist) searchQuery += ` artist:${artist}`;
        if (album) searchQuery += ` album:${album}`;
        if (year) searchQuery += ` year:${year}`;
        if (genre) searchQuery += ` genre:${genre}`;
        
        if (!searchQuery.trim()) {
            return this.getEmptySearchResult([type]);
        }

        return this.search(searchQuery.trim(), [type], limit, offset);
    }

    // Search suggestions based on user input
    async getSearchSuggestions(query, maxSuggestions = 5) {
        if (!query || query.length < 2) return [];
        
        try {
            // Get a few results from each category for suggestions
            const results = await this.search(query, ['track', 'artist', 'album'], 3, 0);
            
            const suggestions = [];
            
            // Add artist suggestions
            if (results.artists?.items) {
                results.artists.items.forEach(artist => {
                    suggestions.push({
                        text: artist.name,
                        type: 'artist',
                        id: artist.id
                    });
                });
            }
            
            // Add album suggestions
            if (results.albums?.items) {
                results.albums.items.forEach(album => {
                    suggestions.push({
                        text: `${album.name} - ${album.artists?.[0]?.name || ''}`,
                        type: 'album',
                        id: album.id
                    });
                });
            }
            
            // Add track suggestions
            if (results.tracks?.items) {
                results.tracks.items.forEach(track => {
                    suggestions.push({
                        text: `${track.name} - ${track.artists?.[0]?.name || ''}`,
                        type: 'track',
                        id: track.id
                    });
                });
            }
            
            return suggestions.slice(0, maxSuggestions);
            
        } catch (error) {
            logger.error('SpotifyWebAPIService: Get search suggestions error', error);
            return [];
        }
    }

    // Get popular/trending content
    async getPopularContent(type = 'track', limit = 20) {
        logger.debug('SpotifyWebAPIService: Get popular content', { type, limit });
        
        try {
            const popularQueries = {
                track: ['top hits 2024', 'viral songs', 'trending now', 'pop music'],
                artist: ['trending artists', 'popular artists', 'top musicians'],
                album: ['new releases', 'popular albums', 'trending albums'],
                playlist: ['top playlists', 'viral playlists', 'trending playlists']
            };
            
            const queries = popularQueries[type] || popularQueries.track;
            const randomQuery = queries[Math.floor(Math.random() * queries.length)];
            
            const results = await this.search(randomQuery, [type], limit);
            return results[type + 's']?.items || [];
            
        } catch (error) {
            logger.error('SpotifyWebAPIService: Get popular content error', error);
            return [];
        }
    }

    // Play search result directly (integrates with existing player functionality)
    async playSearchResult(item, deviceId = null) {
        logger.info('SpotifyWebAPIService: Playing search result', { 
            type: item.type, 
            name: item.displayName,
            uri: item.uri 
        });

        try {
            switch (item.type) {
                case 'track':
                    return await this.playTracks([item.uri], deviceId);
                    
                case 'album':
                case 'playlist':
                    return await this.playContext(item.uri, deviceId);
                    
                case 'artist':
                    // Get artist's top tracks and play them
                    const topTracks = await this.getArtistTopTracks(item.id);
                    const trackUris = topTracks.tracks.map(track => track.uri).slice(0, 10);
                    if (trackUris.length > 0) {
                        return await this.playTracks(trackUris, deviceId);
                    }
                    throw new Error('No tracks found for this artist');
                    
                default:
                    throw new Error(`Cannot play item of type: ${item.type}`);
            }
        } catch (error) {
            logger.error('SpotifyWebAPIService: Error playing search result', error);
            throw error;
        }
    }

    // Add search result to queue (integrates with existing queue functionality)
    async addSearchResultToQueue(item) {
        logger.info('SpotifyWebAPIService: Adding search result to queue', { 
            type: item.type, 
            name: item.displayName,
            uri: item.uri 
        });

        try {
            if (item.type === 'track') {
                return await this.addToQueue(item.uri);
            } else {
                throw new Error('Only tracks can be added to queue directly');
            }
        } catch (error) {
            logger.error('SpotifyWebAPIService: Error adding search result to queue', error);
            throw error;
        }
    }

    // Get detailed information about a search result
    async getSearchResultDetails(item) {
        try {
            switch (item.type) {
                case 'track':
                    // Track details are usually complete in search results
                    return item;
                    
                case 'artist':
                    return await this.getArtist(item.id);
                    
                case 'album':
                    return await this.getAlbum(item.id);
                    
                case 'playlist':
                    return await this.getPlaylist(item.id);
                    
                default:
                    return item;
            }
        } catch (error) {
            logger.error('SpotifyWebAPIService: Error getting search result details', error);
            return item;
        }
    }

    // Format search results for UI display
    formatSearchResultsForUI(results, type) {
        const items = results[type + 's']?.items || [];
        
        return items.map(item => ({
            id: item.id,
            uri: item.uri,
            type: item.type,
            name: item.displayName,
            subtitle: item.displaySubtitle,
            image: item.image?.url || null,
            duration: item.duration ? this.formatDuration(item.duration) : null,
            explicit: item.explicit || false,
            popularity: item.popularity || 0,
            // Add play/queue action availability
            canPlay: true,
            canQueue: item.type === 'track',
            // Additional metadata for UI
            metadata: {
                trackCount: item.trackCount,
                followers: item.followers?.total,
                releaseDate: item.release_date
            }
        }));
    }

    // Format duration from milliseconds to MM:SS
    formatDuration(durationMs) {
        if (!durationMs) return null;
        
        const seconds = Math.floor(durationMs / 1000);
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    // Search analytics and usage tracking
    trackSearchAnalytics(query, type, resultCount) {
        // This could be extended to send analytics to a service
        logger.info('SpotifyWebAPIService: Search analytics', {
            query: query.substring(0, 50), // Truncate for privacy
            type,
            resultCount,
            timestamp: Date.now()
        });
    }

    // === PLAYLISTS ===

    // Obtenir les playlists de l'utilisateur
    async getUserPlaylists(limit = 50, offset = 0) {
        logger.debug('SpotifyWebAPIService: Get user playlists', { limit });
        
        return this.apiRequest(`/me/playlists?limit=${limit}&offset=${offset}`);
    }

    // Obtenir toutes les playlists de l'utilisateur (avec pagination automatique)
    async getAllUserPlaylists() {
        logger.debug('SpotifyWebAPIService: Get all user playlists');
        
        try {
            let allPlaylists = [];
            let offset = 0;
            const limit = 50;
            let hasMore = true;
            
            while (hasMore) {
                const response = await this.getUserPlaylists(limit, offset);
                const playlists = response.items || [];
                
                allPlaylists.push(...playlists);
                
                hasMore = playlists.length === limit && response.next;
                offset += limit;
                
                // Sécurité: éviter les boucles infinies
                if (offset > 1000) break;
            }
            
            logger.info('SpotifyWebAPIService: Retrieved all playlists', { count: allPlaylists.length });
            return allPlaylists;
            
        } catch (error) {
            logger.error('SpotifyWebAPIService: Error getting all playlists', error);
            return [];
        }
    }

    // Rechercher dans les playlists de l'utilisateur
    async searchUserPlaylists(query) {
        logger.debug('SpotifyWebAPIService: Search user playlists', { query });
        
        if (!query || query.trim().length < 1) {
            return await this.getAllUserPlaylists();
        }
        
        try {
            const allPlaylists = await this.getAllUserPlaylists();
            const searchTerm = query.toLowerCase().trim();
            
            const filteredPlaylists = allPlaylists.filter(playlist => {
                return playlist.name.toLowerCase().includes(searchTerm) ||
                       (playlist.description && playlist.description.toLowerCase().includes(searchTerm));
            });
            
            return filteredPlaylists;
            
        } catch (error) {
            logger.error('SpotifyWebAPIService: Error searching playlists', error);
            return [];
        }
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
    
    // Obtenir les titres likés (saved tracks)
    async getLikedTracks() {
        logger.debug('SpotifyWebAPIService: Get liked tracks');
        
        try {
            let allTracks = [];
            let offset = 0;
            const limit = 50;
            let hasMore = true;
            
            while (hasMore) {
                const response = await this.apiRequest(`/me/tracks?limit=${limit}&offset=${offset}`);
                const items = response.items || [];
                
                // Extraire les tracks des items
                const tracks = items.map(item => item.track);
                allTracks.push(...tracks);
                
                hasMore = items.length === limit && response.next;
                offset += limit;
                
                // Sécurité: éviter les boucles infinies
                if (offset > 1000) break;
            }
            
            logger.info('SpotifyWebAPIService: Retrieved liked tracks', { count: allTracks.length });
            return allTracks;
            
        } catch (error) {
            logger.error('SpotifyWebAPIService: Error getting liked tracks', error);
            return [];
        }
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

    // === TRUE SHUFFLE ===

    // Obtenir toutes les pistes d'une playlist (avec pagination automatique)
    async getAllPlaylistTracks(playlistId) {
        logger.debug('SpotifyWebAPIService: Get all playlist tracks', { playlistId });
        
        try {
            let allTracks = [];
            let offset = 0;
            const limit = 100; // Maximum autorisé par l'API
            let hasMore = true;
            
            while (hasMore) {
                const response = await this.getPlaylistTracks(playlistId, limit, offset);
                const tracks = response.items || [];
                
                // Filtrer les pistes null et extraire les objets track
                const validTracks = tracks
                    .filter(item => item && item.track && item.track.id)
                    .map(item => item.track);
                
                allTracks.push(...validTracks);
                
                hasMore = tracks.length === limit && response.next;
                offset += limit;
                
                // Sécurité: éviter les boucles infinies
                if (offset > 10000) break;
            }
            
            logger.info('SpotifyWebAPIService: Retrieved all playlist tracks', { 
                playlistId, 
                count: allTracks.length 
            });
            
            return allTracks;
            
        } catch (error) {
            logger.error('SpotifyWebAPIService: Error getting all playlist tracks', error);
            return [];
        }
    }

    // Obtenir toutes les pistes d'un album (avec pagination si nécessaire)
    async getAllAlbumTracks(albumId) {
        logger.debug('SpotifyWebAPIService: Get all album tracks', { albumId });
        
        try {
            let allTracks = [];
            let offset = 0;
            const limit = 50; // Maximum autorisé par l'API pour les albums
            let hasMore = true;
            
            while (hasMore) {
                const response = await this.getAlbumTracks(albumId, limit, offset);
                const tracks = response.items || [];
                
                // Les pistes d'album ont une structure légèrement différente
                // Ajouter les informations d'album manquantes
                const album = await this.getAlbum(albumId);
                const tracksWithAlbum = tracks.map(track => ({
                    ...track,
                    album: {
                        id: album.id,
                        name: album.name,
                        images: album.images,
                        uri: album.uri
                    }
                }));
                
                allTracks.push(...tracksWithAlbum);
                
                hasMore = tracks.length === limit && response.next;
                offset += limit;
                
                // Sécurité: éviter les boucles infinies
                if (offset > 500) break; // Les albums ont rarement plus de 500 pistes
            }
            
            logger.info('SpotifyWebAPIService: Retrieved all album tracks', { 
                albumId, 
                count: allTracks.length 
            });
            
            return allTracks;
            
        } catch (error) {
            logger.error('SpotifyWebAPIService: Error getting all album tracks', error);
            return [];
        }
    }

    // Obtenir le contexte de lecture actuel avec toutes ses pistes
    async getCurrentContextTracks() {
        logger.debug('SpotifyWebAPIService: Get current context tracks');
        
        try {
            const playbackState = await this.getPlaybackState();
            
            if (!playbackState || !playbackState.context) {
                logger.warn('SpotifyWebAPIService: No context available');
                return { tracks: [], contextType: null, contextUri: null };
            }
            
            const context = playbackState.context;
            const contextType = context.type; // 'playlist', 'album', 'artist'
            const contextUri = context.uri;
            
            // Extraire l'ID du contexte depuis l'URI
            const contextId = contextUri.split(':').pop();
            
            let tracks = [];
            
            switch (contextType) {
                case 'playlist':
                    tracks = await this.getAllPlaylistTracks(contextId);
                    break;
                    
                case 'album':
                    tracks = await this.getAllAlbumTracks(contextId);
                    break;
                    
                case 'artist':
                    // Pour un artiste, on récupère ses top tracks
                    const topTracksResponse = await this.getArtistTopTracks(contextId);
                    tracks = topTracksResponse.tracks || [];
                    break;
                    
                default:
                    logger.warn('SpotifyWebAPIService: Unknown context type', { contextType });
            }
            
            return {
                tracks,
                contextType,
                contextUri,
                contextId
            };
            
        } catch (error) {
            logger.error('SpotifyWebAPIService: Error getting context tracks', error);
            return { tracks: [], contextType: null, contextUri: null };
        }
    }

    // Jouer des pistes en mode batch (pour contourner la limite d'URIs)
    async playTracksInBatches(trackUris, deviceId = null, batchSize = 50) {
        logger.info('SpotifyWebAPIService: Play tracks in batches', { 
            totalTracks: trackUris.length, 
            batchSize,
            deviceId 
        });
        
        try {
            if (trackUris.length === 0) {
                throw new Error('No tracks to play');
            }
            
            // Pour les grandes listes, utiliser une approche plus simple
            // Jouer seulement les premières pistes pour démarrer
            const maxInitialTracks = Math.min(trackUris.length, batchSize);
            const initialBatch = trackUris.slice(0, maxInitialTracks);
            
            await this.playTracks(initialBatch, deviceId);
            
            // Si il y a plus de pistes, les ajouter progressivement à la queue
            if (trackUris.length > maxInitialTracks) {
                // Attendre un peu que la lecture démarre
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                const remainingTracks = trackUris.slice(maxInitialTracks);
                
                // Ajouter les pistes restantes par petits groupes pour éviter de surcharger l'API
                for (let i = 0; i < remainingTracks.length; i++) {
                    try {
                        await this.addToQueue(remainingTracks[i]);
                        // Délai plus court pour une expérience plus fluide
                        if (i % 10 === 0) {
                            await new Promise(resolve => setTimeout(resolve, 100));
                        }
                    } catch (queueError) {
                        logger.warn('SpotifyWebAPIService: Failed to add track to queue', { 
                            uri: remainingTracks[i], 
                            error: queueError.message 
                        });
                        // Continuer même si certaines pistes échouent
                    }
                }
            }
            
            logger.info('SpotifyWebAPIService: Batch playback started successfully');
            
        } catch (error) {
            logger.error('SpotifyWebAPIService: Error playing tracks in batches', error);
            throw error;
        }
    }
}

// Export global
window.SpotifyWebAPIService = SpotifyWebAPIService;