class SpotifyTrackBrowser {
    constructor() {
        this.isOpen = false;
        this.currentTracks = [];
        this.currentType = null;
    }

    async showRecentTracks() {
        try {
            const tracks = await this.fetchRecentTracks();
            this.showTrackList(tracks, 'Recently Played', 'recent');
        } catch (error) {
            console.error('Error fetching recent tracks:', error);
        }
    }

    async showSavedTracks() {
        try {
            const tracks = await this.fetchSavedTracks();
            this.showTrackList(tracks, 'Liked Songs', 'saved');
        } catch (error) {
            console.error('Error fetching saved tracks:', error);
        }
    }

    async showTopTracks() {
        try {
            const tracks = await this.fetchTopTracks();
            this.showTrackList(tracks, 'Your Top Tracks', 'top');
        } catch (error) {
            console.error('Error fetching top tracks:', error);
        }
    }

    async fetchRecentTracks() {
        const token = SpotifyAuth.getAccessToken();
        const response = await fetch('https://api.spotify.com/v1/me/player/recently-played?limit=50', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to fetch recent tracks');
        }

        const data = await response.json();
        return data.items.map(item => ({
            ...item.track,
            played_at: item.played_at
        }));
    }

    async fetchSavedTracks() {
        const token = SpotifyAuth.getAccessToken();
        const response = await fetch('https://api.spotify.com/v1/me/tracks?limit=50', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to fetch saved tracks');
        }

        const data = await response.json();
        return data.items.map(item => item.track);
    }

    async fetchTopTracks() {
        const token = SpotifyAuth.getAccessToken();
        const response = await fetch('https://api.spotify.com/v1/me/top/tracks?limit=50&time_range=medium_term', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to fetch top tracks');
        }

        const data = await response.json();
        return data.items;
    }

    showTrackList(tracks, title, type) {
        this.currentTracks = tracks;
        this.currentType = type;

        const modal = this.createTrackModal(tracks, title);
        document.body.appendChild(modal);
        this.isOpen = true;

        // Close modal on outside click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.closeModal();
            }
        });
    }

    createTrackModal(tracks, title) {
        const modal = document.createElement('div');
        modal.className = 'track-browser-modal';
        modal.innerHTML = `
            <div class="track-browser-content">
                <div class="track-browser-header">
                    <h2>${title}</h2>
                    <button class="close-btn" onclick="spotifyTrackBrowser.closeModal()">&times;</button>
                </div>
                <div class="track-list">
                    ${tracks.map((track, index) => this.createTrackItem(track, index)).join('')}
                </div>
            </div>
        `;
        return modal;
    }

    createTrackItem(track, index) {
        const imageUrl = track.album?.images?.[2]?.url || '';
        const duration = this.formatDuration(track.duration_ms);
        
        return `
            <div class="track-item" data-track-uri="${track.uri}" data-index="${index}">
                <div class="track-number">${index + 1}</div>
                <div class="track-image">
                    ${imageUrl ? `<img src="${imageUrl}" alt="Album art">` : '🎵'}
                </div>
                <div class="track-info">
                    <div class="track-title">${track.name}</div>
                    <div class="track-artist">${track.artists.map(a => a.name).join(', ')}</div>
                </div>
                <div class="track-album">${track.album?.name || ''}</div>
                <div class="track-duration">${duration}</div>
                <button class="play-track-btn" onclick="spotifyTrackBrowser.playTrack('${track.uri}', ${index})">
                    ▶️
                </button>
            </div>
        `;
    }

    formatDuration(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }

    async playTrack(uri, index) {
        try {
            // Create a context with all tracks starting from the selected one
            const uris = this.currentTracks.slice(index).map(track => track.uri);
            await spotifyPlayer.startPlayback(spotifyPlayer.deviceId, uris);
            
            this.closeModal();
            
            // Show success message
            const successMsg = document.createElement('div');
            successMsg.className = 'play-success-message';
            successMsg.textContent = `Playing: ${this.currentTracks[index].name}`;
            document.body.appendChild(successMsg);
            
            setTimeout(() => {
                successMsg.remove();
            }, 3000);
            
        } catch (error) {
            console.error('Error playing track:', error);
            alert('Failed to play track: ' + error.message);
        }
    }

    closeModal() {
        const modal = document.querySelector('.track-browser-modal');
        if (modal) {
            modal.remove();
        }
        this.isOpen = false;
    }
}

// Global instance
const spotifyTrackBrowser = new SpotifyTrackBrowser();
window.spotifyTrackBrowser = spotifyTrackBrowser;