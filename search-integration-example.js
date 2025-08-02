// Spotify Search API Integration Example - Melodyx
// Complete usage examples for the enhanced search functionality

/**
 * ENHANCED SEARCH API INTEGRATION FOR MELODYX
 * 
 * This file demonstrates how to use the comprehensive search functionality
 * that has been integrated into the Melodyx player.
 * 
 * Features included:
 * - Debounced search with automatic cancellation
 * - Result caching with TTL and memory management  
 * - Pagination support for loading more results
 * - Rate limiting with exponential backoff retry logic
 * - Search result normalization and parsing
 * - Integration with player controls (play, queue)
 * - Search suggestions and auto-completion
 * - Advanced search with filters
 * - Error handling and network resilience
 */

// =============================================================================
// BASIC SEARCH USAGE
// =============================================================================

class SearchIntegrationExample {
    constructor() {
        this.webApiService = new SpotifyWebAPIService();
    }

    // Basic search - most common use case
    async basicSearch() {
        try {
            const results = await this.webApiService.search('bohemian rhapsody', ['track'], 20);
            console.log('Search results:', results);
            
            // Results are normalized with consistent structure:
            // {
            //   tracks: {
            //     items: [...], // Normalized track objects
            //     total: 1000,
            //     limit: 20,
            //     offset: 0
            //   }
            // }
        } catch (error) {
            console.error('Search failed:', error);
        }
    }

    // Debounced search - prevents API spam during typing
    async debouncedSearchExample() {
        const searchInput = document.getElementById('search-input');
        
        searchInput.addEventListener('input', async (e) => {
            try {
                // This will automatically cancel previous searches and debounce
                const results = await this.webApiService.debouncedSearch(
                    e.target.value,
                    ['track', 'artist'], 
                    15,    // limit
                    0,     // offset
                    300    // debounce delay in ms
                );
                
                this.displayResults(results);
            } catch (error) {
                if (error.name !== 'AbortError') {
                    console.error('Search error:', error);
                }
            }
        });
    }

    // Multi-type search with suggestions
    async searchWithSuggestions() {
        try {
            const results = await this.webApiService.searchWithSuggestions('queen');
            
            console.log('Tracks:', results.tracks);
            console.log('Artists:', results.artists);
            console.log('Albums:', results.albums);
            console.log('Playlists:', results.playlists);
        } catch (error) {
            console.error('Search with suggestions failed:', error);
        }
    }

    // Advanced search with filters
    async advancedSearchExample() {
        try {
            const results = await this.webApiService.advancedSearch({
                query: 'rock',
                type: 'track',
                artist: 'Queen',
                year: '1975',
                limit: 10
            });
            
            console.log('Advanced search results:', results);
        } catch (error) {
            console.error('Advanced search failed:', error);
        }
    }

    // =============================================================================
    // PAGINATION AND LOADING MORE RESULTS
    // =============================================================================

    async paginationExample() {
        try {
            // Initial search
            let results = await this.webApiService.search('pop music', ['track'], 20, 0);
            let allTracks = results.tracks.items;
            
            // Load more results
            const moreResults = await this.webApiService.searchMore(
                'pop music', 
                'track', 
                allTracks, 
                20
            );
            
            console.log('All tracks:', moreResults.items);
            console.log('Has more:', moreResults.hasMore);
            console.log('Total available:', moreResults.total);
        } catch (error) {
            console.error('Pagination failed:', error);
        }
    }

    // =============================================================================
    // CACHING EXAMPLES
    // =============================================================================

    async cachingExample() {
        const query = 'test search';
        
        // First search - hits API
        console.time('First search');
        await this.webApiService.search(query, ['track']);
        console.timeEnd('First search');
        
        // Second search - hits cache (much faster)
        console.time('Cached search');
        await this.webApiService.search(query, ['track']);
        console.timeEnd('Cached search');
        
        // Clear cache if needed
        this.webApiService.clearSearchCache();
    }

    // =============================================================================
    // PLAYING AND QUEUEING SEARCH RESULTS
    // =============================================================================

    async playResultsExample() {
        try {
            const results = await this.webApiService.search('bohemian rhapsody', ['track'], 1);
            const track = results.tracks.items[0];
            
            if (track) {
                // Play the track directly
                await this.webApiService.playSearchResult(track, 'your-device-id');
                console.log('Now playing:', track.displayName);
            }
        } catch (error) {
            console.error('Play failed:', error);
        }
    }

    async queueResultsExample() {
        try {
            const results = await this.webApiService.search('queen greatest hits', ['track'], 5);
            
            // Add all tracks to queue
            for (const track of results.tracks.items) {
                if (track.type === 'track') {
                    await this.webApiService.addSearchResultToQueue(track);
                    console.log('Added to queue:', track.displayName);
                }
            }
        } catch (error) {
            console.error('Queue failed:', error);
        }
    }

    // =============================================================================
    // SEARCH SUGGESTIONS AND AUTO-COMPLETE
    // =============================================================================

    async searchSuggestionsExample() {
        try {
            // Get suggestions based on partial input
            const suggestions = await this.webApiService.getSearchSuggestions('que', 5);
            
            suggestions.forEach(suggestion => {
                console.log(`${suggestion.type}: ${suggestion.text}`);
            });
            
            // Example output:
            // artist: Queen
            // track: Queen - Bohemian Rhapsody
            // album: Queen - A Night at the Opera
        } catch (error) {
            console.error('Suggestions failed:', error);
        }
    }

    // =============================================================================
    // POPULAR CONTENT AND TRENDING
    // =============================================================================

    async popularContentExample() {
        try {
            const popularTracks = await this.webApiService.getPopularContent('track', 10);
            const trendingArtists = await this.webApiService.getPopularContent('artist', 5);
            
            console.log('Popular tracks:', popularTracks);
            console.log('Trending artists:', trendingArtists);
        } catch (error) {
            console.error('Popular content failed:', error);
        }
    }

    // =============================================================================
    // FORMATTED RESULTS FOR UI
    // =============================================================================

    displayFormattedResults() {
        this.webApiService.search('sample query', ['track']).then(results => {
            // Get formatted data ready for UI display
            const formattedTracks = this.webApiService.formatSearchResultsForUI(results, 'track');
            
            formattedTracks.forEach(track => {
                console.log({
                    name: track.name,
                    subtitle: track.subtitle,
                    image: track.image,
                    duration: track.duration, // Already formatted as "3:45"
                    canPlay: track.canPlay,
                    canQueue: track.canQueue,
                    explicit: track.explicit,
                    popularity: track.popularity
                });
            });
        });
    }

    // =============================================================================
    // ERROR HANDLING AND RESILIENCE
    // =============================================================================

    async errorHandlingExample() {
        try {
            // The API service automatically handles:
            // - Rate limiting (429 errors) with exponential backoff
            // - Server errors (5xx) with retry logic
            // - Network failures with automatic retry
            // - Request cancellation during rapid typing
            
            const results = await this.webApiService.search('search query', ['track']);
            
        } catch (error) {
            if (error.name === 'AbortError') {
                console.log('Search was cancelled (user typed something else)');
            } else if (error.message.includes('Rate limit')) {
                console.log('Rate limited - will automatically retry');
            } else if (error.message.includes('API Error 5')) {
                console.log('Server error - will automatically retry');
            } else {
                console.error('Search failed:', error);
            }
        }
    }

    // =============================================================================
    // COMPLETE UI INTEGRATION EXAMPLE
    // =============================================================================

    setupCompleteSearchUI() {
        const searchInput = document.getElementById('search-input');
        const searchResults = document.getElementById('search-results');
        const searchType = document.getElementById('search-type-select');
        
        let currentResults = [];
        let currentQuery = '';
        let currentType = 'track';

        // Handle search input with debouncing
        searchInput.addEventListener('input', async (e) => {
            const query = e.target.value.trim();
            currentQuery = query;
            
            if (query.length < 2) {
                this.showPlaceholder();
                return;
            }
            
            if (query.length < 3) {
                this.showSuggestions(query);
                return;
            }
            
            try {
                this.showLoading(true);
                
                const results = await this.webApiService.debouncedSearch(
                    query, 
                    [currentType], 
                    20, 
                    0, 
                    300
                );
                
                currentResults = this.webApiService.formatSearchResultsForUI(results, currentType);
                this.displayResults(currentResults);
                
            } catch (error) {
                if (error.name !== 'AbortError') {
                    this.showError('Search failed');
                }
            } finally {
                this.showLoading(false);
            }
        });

        // Handle search type changes
        searchType.addEventListener('change', async (e) => {
            currentType = e.target.value;
            
            if (currentQuery.length >= 3) {
                // Re-run search with new type
                searchInput.dispatchEvent(new Event('input'));
            }
        });

        // Handle load more button
        document.addEventListener('click', async (e) => {
            if (e.target.classList.contains('load-more-btn')) {
                try {
                    const moreResults = await this.webApiService.searchMore(
                        currentQuery,
                        currentType,
                        currentResults,
                        20
                    );
                    
                    currentResults = moreResults.items;
                    this.displayResults(currentResults, moreResults.hasMore);
                    
                } catch (error) {
                    console.error('Load more failed:', error);
                }
            }
        });
    }

    // UI Helper methods
    showPlaceholder() {
        document.getElementById('search-results').innerHTML = `
            <div class="search-placeholder">
                <p>Tapez au moins 2 caractères pour commencer la recherche</p>
            </div>
        `;
    }

    async showSuggestions(query) {
        try {
            const suggestions = await this.webApiService.getSearchSuggestions(query, 5);
            
            const suggestionsHTML = suggestions.map(s => `
                <div class="suggestion" data-query="${s.text}" data-type="${s.type}">
                    <span class="suggestion-type">${s.type}</span>
                    <span class="suggestion-text">${s.text}</span>
                </div>
            `).join('');
            
            document.getElementById('search-results').innerHTML = `
                <div class="search-suggestions">
                    <h3>Suggestions</h3>
                    ${suggestionsHTML}
                </div>
            `;
        } catch (error) {
            this.showPlaceholder();
        }
    }

    showLoading(show) {
        const loader = document.getElementById('search-loading');
        if (loader) {
            loader.style.display = show ? 'block' : 'none';
        }
    }

    displayResults(results, hasMore = false) {
        const resultsHTML = results.map(item => `
            <div class="search-result" data-uri="${item.uri}" data-type="${item.type}">
                <img src="${item.image || 'placeholder.jpg'}" alt="${item.name}">
                <div class="result-info">
                    <h4>${item.name}</h4>
                    <p>${item.subtitle}</p>
                    ${item.duration ? `<span class="duration">${item.duration}</span>` : ''}
                </div>
                <div class="result-actions">
                    <button class="play-btn">Play</button>
                    ${item.canQueue ? '<button class="queue-btn">Queue</button>' : ''}
                </div>
            </div>
        `).join('');
        
        const loadMoreBtn = hasMore ? '<button class="load-more-btn">Load More</button>' : '';
        
        document.getElementById('search-results').innerHTML = resultsHTML + loadMoreBtn;
    }

    showError(message) {
        document.getElementById('search-results').innerHTML = `
            <div class="search-error">
                <p>${message}</p>
            </div>
        `;
    }
}

// =============================================================================
// PERFORMANCE OPTIMIZATION TIPS
// =============================================================================

/**
 * PERFORMANCE TIPS:
 * 
 * 1. Use debounced search to prevent API spam
 * 2. Cache is automatically managed (5 min TTL, 100 item limit)
 * 3. Use cancelCurrentSearch() when user navigates away
 * 4. Pagination prevents loading too much data at once
 * 5. Rate limiting prevents hitting API limits
 * 6. Image lazy loading for search result artwork
 * 7. Normalize results to reduce UI rendering complexity
 */

// =============================================================================
// INTEGRATION CHECKLIST
// =============================================================================

/**
 * INTEGRATION CHECKLIST:
 * 
 * ✅ SpotifyWebAPIService enhanced with search functionality
 * ✅ Debounced search implementation 
 * ✅ Search result caching system
 * ✅ Rate limiting and retry logic
 * ✅ Search result normalization
 * ✅ Pagination support
 * ✅ Play/queue integration
 * ✅ Search suggestions
 * ✅ Error handling
 * ✅ UI integration examples
 * 
 * SPOTIFY API ENDPOINTS USED:
 * - GET /search (core search functionality)
 * - All existing player endpoints for play/queue
 * 
 * REQUIRED SCOPES:
 * - user-read-playback-state
 * - user-modify-playback-state
 * - user-library-read (for saved track checking)
 */

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SearchIntegrationExample;
}