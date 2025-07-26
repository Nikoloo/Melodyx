// Vrai Mode Aléatoire - Melodyx
class TrueRandomMode {
    constructor() {
        this.likedTracks = [];
        this.shuffledTracks = [];
        this.isLoading = false;
        this.tempPlaylistId = null;
    }

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

    // Récupérer tous les titres likés de l'utilisateur
    async fetchAllLikedTracks() {
        const token = SpotifyAuth.getAccessToken();
        if (!token) {
            throw new Error('Token d\'accès non disponible');
        }

        this.isLoading = true;
        this.updateLoadingUI(true);
        
        let allTracks = [];
        let nextUrl = 'https://api.spotify.com/v1/me/tracks?limit=50';
        
        try {
            while (nextUrl) {
                const response = await fetch(nextUrl, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (!response.ok) {
                    throw new Error(`Erreur API: ${response.status}`);
                }

                const data = await response.json();
                
                // Extraire les pistes et filtrer celles qui sont disponibles
                const tracks = data.items
                    .filter(item => item.track && item.track.is_playable !== false)
                    .map(item => ({
                        id: item.track.id,
                        uri: item.track.uri,
                        name: item.track.name,
                        artist: item.track.artists.map(a => a.name).join(', '),
                        album: item.track.album.name,
                        image: item.track.album.images[0]?.url,
                        duration: item.track.duration_ms,
                        added_at: item.added_at
                    }));

                allTracks = allTracks.concat(tracks);
                nextUrl = data.next;

                // Mettre à jour le compteur dans l'UI
                this.updateTrackCount(allTracks.length);
            }

            this.likedTracks = allTracks;
            console.log(`${allTracks.length} titres likés récupérés`);
            
            return allTracks;

        } catch (error) {
            console.error('Erreur lors de la récupération des titres likés:', error);
            throw error;
        } finally {
            this.isLoading = false;
            this.updateLoadingUI(false);
        }
    }

    // Créer le mélange aléatoire
    async createTrueShuffle() {
        if (this.likedTracks.length === 0) {
            await this.fetchAllLikedTracks();
        }

        if (this.likedTracks.length === 0) {
            throw new Error('Aucun titre liké trouvé');
        }

        // Appliquer l'algorithme Fisher-Yates
        this.shuffledTracks = this.fisherYatesShuffle(this.likedTracks);
        
        console.log('Mélange vraiment aléatoire créé:', this.shuffledTracks.length, 'titres');
        return this.shuffledTracks;
    }

    // Créer une playlist temporaire avec les titres mélangés
    async createTemporaryPlaylist() {
        const token = SpotifyAuth.getAccessToken();
        if (!token) {
            throw new Error('Token d\'accès non disponible');
        }

        try {
            // Récupérer l'ID utilisateur
            const userResponse = await fetch('https://api.spotify.com/v1/me', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!userResponse.ok) {
                throw new Error('Impossible de récupérer les informations utilisateur');
            }

            const user = await userResponse.json();
            const userId = user.id;

            // Créer la playlist temporaire
            const playlistName = `Melodyx - Vraiment Aléatoire (${new Date().toLocaleDateString()})`;
            const playlistDescription = `Playlist générée par Melodyx avec un vrai algorithme aléatoire. ${this.shuffledTracks.length} titres de votre bibliothèque.`;

            const createPlaylistResponse = await fetch(`https://api.spotify.com/v1/users/${userId}/playlists`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name: playlistName,
                    description: playlistDescription,
                    public: false
                })
            });

            if (!createPlaylistResponse.ok) {
                throw new Error('Impossible de créer la playlist');
            }

            const playlist = await createPlaylistResponse.json();
            this.tempPlaylistId = playlist.id;

            // Ajouter les pistes à la playlist (par lots de 100 max)
            const trackUris = this.shuffledTracks.map(track => track.uri);
            const batchSize = 100;

            for (let i = 0; i < trackUris.length; i += batchSize) {
                const batch = trackUris.slice(i, i + batchSize);
                
                const addTracksResponse = await fetch(`https://api.spotify.com/v1/playlists/${playlist.id}/tracks`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        uris: batch
                    })
                });

                if (!addTracksResponse.ok) {
                    console.error(`Erreur lors de l'ajout du lot ${i / batchSize + 1}`);
                }

                // Petite pause entre les requêtes pour éviter le rate limiting
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            return {
                playlistId: playlist.id,
                playlistUrl: playlist.external_urls.spotify,
                trackCount: this.shuffledTracks.length
            };

        } catch (error) {
            console.error('Erreur lors de la création de la playlist:', error);
            throw error;
        }
    }

    // Récupérer les pistes d'une playlist spécifique
    async fetchPlaylistTracks(playlistId) {
        const token = SpotifyAuth.getAccessToken();
        if (!token) {
            throw new Error('Token d\'accès non disponible');
        }

        this.isLoading = true;
        this.updateLoadingUI(true);
        
        let allTracks = [];
        let nextUrl = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=50`;
        
        try {
            while (nextUrl) {
                const response = await fetch(nextUrl, {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });

                if (!response.ok) {
                    throw new Error(`Erreur API: ${response.status}`);
                }

                const data = await response.json();
                
                // Extraire les pistes et filtrer celles qui sont disponibles
                const tracks = data.items
                    .filter(item => item.track && item.track.is_playable !== false && item.track.type === 'track')
                    .map(item => ({
                        id: item.track.id,
                        uri: item.track.uri,
                        name: item.track.name,
                        artist: item.track.artists.map(a => a.name).join(', '),
                        album: item.track.album.name,
                        image: item.track.album.images[0]?.url,
                        duration: item.track.duration_ms,
                        added_at: item.added_at
                    }));

                allTracks = allTracks.concat(tracks);
                nextUrl = data.next;

                // Mettre à jour le compteur dans l'UI
                this.updateTrackCount(allTracks.length);
            }

            console.log(`${allTracks.length} titres récupérés de la playlist`);
            return allTracks;

        } catch (error) {
            console.error('Erreur lors de la récupération des titres de la playlist:', error);
            throw error;
        } finally {
            this.isLoading = false;
            this.updateLoadingUI(false);
        }
    }

    // Shuffle d'une playlist spécifique
    async shuffleSpecificPlaylist(playlist) {
        try {
            this.showProgressModal();
            
            // Étape 1: Récupérer les titres de la playlist
            this.updateProgress(`Récupération des titres de "${playlist.name}"...`, 0);
            const playlistTracks = await this.fetchPlaylistTracks(playlist.id);
            
            if (playlistTracks.length === 0) {
                throw new Error('Cette playlist ne contient aucun titre jouable');
            }

            // Étape 2: Créer le mélange aléatoire
            this.updateProgress('Application de l\'algorithme vraiment aléatoire...', 50);
            this.shuffledTracks = this.fisherYatesShuffle(playlistTracks);
            
            // Étape 3: Créer la playlist temporaire
            this.updateProgress('Création de votre playlist mélangée...', 75);
            const result = await this.createTemporaryPlaylistFromSpecific(playlist);
            
            // Étape 4: Finalisation
            this.updateProgress('Finalisation...', 100);
            
            setTimeout(() => {
                this.hideProgressModal();
                this.showSuccessModal(result);
            }, 500);

            return result;

        } catch (error) {
            this.hideProgressModal();
            this.showErrorModal(error.message);
            throw error;
        }
    }

    // Créer une playlist temporaire à partir d'une playlist spécifique
    async createTemporaryPlaylistFromSpecific(originalPlaylist) {
        const token = SpotifyAuth.getAccessToken();
        if (!token) {
            throw new Error('Token d\'accès non disponible');
        }

        try {
            // Récupérer l'ID utilisateur
            const userResponse = await fetch('https://api.spotify.com/v1/me', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (!userResponse.ok) {
                throw new Error('Impossible de récupérer les informations utilisateur');
            }

            const user = await userResponse.json();
            const userId = user.id;

            // Créer la playlist temporaire
            const playlistName = `🎲 ${originalPlaylist.name} - True Shuffle`;
            const playlistDescription = `Version vraiment aléatoire de "${originalPlaylist.name}" générée par Melodyx. ${this.shuffledTracks.length} titres mélangés avec l'algorithme Fisher-Yates.`;

            const createPlaylistResponse = await fetch(`https://api.spotify.com/v1/users/${userId}/playlists`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    name: playlistName,
                    description: playlistDescription,
                    public: false
                })
            });

            if (!createPlaylistResponse.ok) {
                throw new Error('Impossible de créer la playlist');
            }

            const playlist = await createPlaylistResponse.json();
            this.tempPlaylistId = playlist.id;

            // Ajouter les pistes à la playlist (par lots de 100 max)
            const trackUris = this.shuffledTracks.map(track => track.uri);
            const batchSize = 100;

            for (let i = 0; i < trackUris.length; i += batchSize) {
                const batch = trackUris.slice(i, i + batchSize);
                
                const addTracksResponse = await fetch(`https://api.spotify.com/v1/playlists/${playlist.id}/tracks`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        uris: batch
                    })
                });

                if (!addTracksResponse.ok) {
                    console.error(`Erreur lors de l'ajout du lot ${i / batchSize + 1}`);
                }

                // Petite pause entre les requêtes pour éviter le rate limiting
                await new Promise(resolve => setTimeout(resolve, 100));
            }

            return {
                playlistId: playlist.id,
                playlistUrl: playlist.external_urls.spotify,
                trackCount: this.shuffledTracks.length,
                originalPlaylist: originalPlaylist.name
            };

        } catch (error) {
            console.error('Erreur lors de la création de la playlist:', error);
            throw error;
        }
    }

    // Lancer le processus complet (pour les titres likés)
    async generateTrueRandomPlaylist() {
        try {
            this.showProgressModal();
            
            // Étape 1: Récupérer les titres likés
            this.updateProgress('Récupération de vos titres likés...', 0);
            await this.fetchAllLikedTracks();
            
            // Étape 2: Créer le mélange aléatoire
            this.updateProgress('Application de l\'algorithme vraiment aléatoire...', 50);
            await this.createTrueShuffle();
            
            // Étape 3: Créer la playlist temporaire
            this.updateProgress('Création de votre playlist temporaire...', 75);
            const result = await this.createTemporaryPlaylist();
            
            // Étape 4: Finalisation
            this.updateProgress('Finalisation...', 100);
            
            setTimeout(() => {
                this.hideProgressModal();
                this.showSuccessModal(result);
            }, 500);

            return result;

        } catch (error) {
            this.hideProgressModal();
            this.showErrorModal(error.message);
            throw error;
        }
    }

    // Interface utilisateur
    updateLoadingUI(isLoading) {
        const button = document.getElementById('true-random-btn');
        if (button) {
            button.disabled = isLoading;
            button.textContent = isLoading ? 'Chargement...' : 'Générer playlist vraiment aléatoire';
        }
    }

    updateTrackCount(count) {
        const counter = document.getElementById('track-counter');
        if (counter) {
            counter.textContent = `${count} titres récupérés...`;
        }
    }

    showProgressModal() {
        const modal = document.createElement('div');
        modal.id = 'progress-modal';
        modal.className = 'spotify-modal';
        modal.innerHTML = `
            <div class="modal-overlay">
                <div class="modal-container">
                    <div class="modal-content">
                        <h2>Génération de votre playlist vraiment aléatoire</h2>
                        <div class="progress-container" style="width: 100%; background: rgba(255,255,255,0.1); border-radius: 10px; margin: 2rem 0;">
                            <div id="progress-bar" style="width: 0%; height: 20px; background: var(--gradient-primary); border-radius: 10px; transition: width 0.3s ease;"></div>
                        </div>
                        <p id="progress-text">Initialisation...</p>
                        <div id="track-counter" style="color: var(--text-secondary); font-size: 0.9rem; margin-top: 1rem;"></div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    updateProgress(text, percentage) {
        const progressBar = document.getElementById('progress-bar');
        const progressText = document.getElementById('progress-text');
        
        if (progressBar) progressBar.style.width = `${percentage}%`;
        if (progressText) progressText.textContent = text;
    }

    hideProgressModal() {
        const modal = document.getElementById('progress-modal');
        if (modal) {
            modal.remove();
        }
    }

    showSuccessModal(result) {
        const modal = document.createElement('div');
        modal.className = 'spotify-modal';
        modal.innerHTML = `
            <div class="modal-overlay" onclick="this.parentElement.remove()">
                <div class="modal-container" onclick="event.stopPropagation()">
                    <div class="modal-content success">
                        <div class="success-icon">🎉</div>
                        <h2>Playlist créée avec succès !</h2>
                        <p>Votre playlist vraiment aléatoire a été générée avec ${result.trackCount} titres.</p>
                        <div style="margin: 1.5rem 0;">
                            <strong>Algorithme utilisé :</strong> Fisher-Yates<br>
                            <strong>Garantie :</strong> 100% aléatoire, pas de biais
                        </div>
                        <div style="display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap;">
                            <a href="${result.playlistUrl}" target="_blank" class="btn btn-primary">
                                Ouvrir dans Spotify
                            </a>
                            <button class="btn btn-secondary" onclick="this.closest('.spotify-modal').remove()">
                                Fermer
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    showErrorModal(errorMessage) {
        const modal = document.createElement('div');
        modal.className = 'spotify-modal';
        modal.innerHTML = `
            <div class="modal-overlay" onclick="this.parentElement.remove()">
                <div class="modal-container" onclick="event.stopPropagation()">
                    <div class="modal-content error">
                        <div class="error-icon">⚠️</div>
                        <h2>Erreur</h2>
                        <p>${errorMessage}</p>
                        <button class="btn btn-primary" onclick="this.closest('.spotify-modal').remove()">
                            Fermer
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
}

// Instance globale
const trueRandomMode = new TrueRandomMode();