// Sélecteur de Playlist 3D - Melodyx
class PlaylistSelector {
    constructor() {
        this.playlists = [];
        this.filteredPlaylists = [];
        this.isLoading = false;
        this.selectedPlaylist = null;
        this.currentSort = 'alphabetical'; // alphabetical, count
        this.currentView = 'grid'; // grid, list, dense
    }

    // Récupérer toutes les playlists de l'utilisateur
    async fetchUserPlaylists() {
        const token = SpotifyAuth.getAccessToken();
        if (!token) {
            throw new Error('Token d\'accès non disponible');
        }

        this.isLoading = true;
        let allPlaylists = [];
        let nextUrl = 'https://api.spotify.com/v1/me/playlists?limit=50';

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
                
                // Traiter les playlists
                const playlists = data.items.map(playlist => ({
                    id: playlist.id,
                    name: playlist.name,
                    description: playlist.description || 'Aucune description',
                    image: playlist.images && playlist.images.length > 0 
                        ? playlist.images[0].url 
                        : null,
                    trackCount: playlist.tracks.total,
                    owner: playlist.owner.display_name,
                    isOwner: playlist.owner.id === playlist.collaborative || playlist.owner.id,
                    uri: playlist.uri,
                    isPinned: false,
                    addedAt: new Date(playlist.tracks.href) // Approximation pour le tri par date
                }));

                allPlaylists = allPlaylists.concat(playlists);
                nextUrl = data.next;
            }

            // Ajouter l'option "Titres likés" en premier
            allPlaylists.unshift({
                id: 'liked-tracks',
                name: '❤️ Titres likés',
                description: 'Votre collection de titres favoris',
                image: null,
                trackCount: 'Auto',
                owner: 'Vous',
                isOwner: true,
                uri: null,
                isPinned: false,
                addedAt: new Date()
            });

            this.playlists = allPlaylists;
            this.filteredPlaylists = [...allPlaylists];
            this.applySorting();
            return allPlaylists;

        } catch (error) {
            console.error('Erreur lors de la récupération des playlists:', error);
            throw error;
        } finally {
            this.isLoading = false;
        }
    }

    // Ouvrir le sélecteur de playlist avec animation 3D
    async openSelector() {
        // Rediriger vers la page dédiée au lieu d'ouvrir un modal
        window.location.href = 'playlist-selector.html';
    }

    // Modal de chargement initial
    showLoadingModal() {
        const modal = document.createElement('div');
        modal.id = 'playlist-selector-modal';
        modal.className = 'playlist-selector-modal';
        modal.innerHTML = `
            <div class="modal-3d-overlay">
                <div class="modal-3d-container loading-state">
                    <div class="modal-3d-content">
                        <div class="loading-spinner-3d">
                            <div class="spinner-cube">
                                <div class="cube-face cube-front"></div>
                                <div class="cube-face cube-back"></div>
                                <div class="cube-face cube-right"></div>
                                <div class="cube-face cube-left"></div>
                                <div class="cube-face cube-top"></div>
                                <div class="cube-face cube-bottom"></div>
                            </div>
                        </div>
                        <h2 class="loading-title">Récupération de vos playlists...</h2>
                        <p class="loading-subtitle">Veuillez patienter</p>
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Déclencher l'animation d'entrée
        setTimeout(() => {
            modal.classList.add('modal-active');
        }, 50);
    }

    // Afficher le sélecteur de playlists
    showPlaylistSelector() {
        const modal = document.getElementById('playlist-selector-modal');
        if (!modal) return;

        modal.innerHTML = `
            <div class="modal-3d-overlay" onclick="playlistSelector.closeSelector()">
                <div class="modal-3d-container" onclick="event.stopPropagation()">
                    <div class="modal-3d-header">
                        <h2>🎵 Choisissez votre playlist</h2>
                        <p>Sélectionnez la playlist à mélanger avec True Shuffle</p>
                        <button class="close-btn-3d" onclick="playlistSelector.closeSelector()">×</button>
                    </div>
                    
                    <div class="modal-3d-toolbar">
                        <div class="sort-controls">
                            <label class="sort-label">📋 Trier par:</label>
                            <select class="sort-dropdown" id="sort-dropdown" onchange="playlistSelector.changeSorting(this.value)">
                                <option value="alphabetical" selected>🔤 Ordre alphabétique</option>
                                <option value="count">🔢 Nombre de titres</option>
                            </select>
                        </div>
                        <div class="playlist-count">
                            <span id="playlist-count">${this.filteredPlaylists.length} playlists</span>
                        </div>
                    </div>
                    
                    <div class="modal-3d-content">
                        <div class="playlist-grid" id="playlist-grid">
                            ${this.renderPlaylistGrid()}
                        </div>
                    </div>
                    
                    <div class="floating-buttons">
                        <button class="btn btn-secondary floating-btn" onclick="playlistSelector.closeSelector()">
                            Annuler
                        </button>
                        <button id="shuffle-selected-btn" class="btn btn-primary floating-btn" onclick="playlistSelector.shuffleSelected()" disabled>
                            Shuffle la playlist sélectionnée
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    // Générer la grille de playlists
    // Méthode unifiée pour rendre les playlists selon la vue actuelle
    renderPlaylistView() {
        switch (this.currentView) {
            case 'list':
                return this.renderPlaylistList();
            case 'dense':
                return this.renderPlaylistDense();
            default:
                return this.renderPlaylistGrid();
        }
    }
    
    // Vue liste compacte
    renderPlaylistList() {
        if (this.filteredPlaylists.length === 0) {
            return '<div class="no-playlists">Aucune playlist trouvée</div>';
        }
        
        return this.filteredPlaylists.map(playlist => `
            <div class="playlist-row" data-playlist-id="${playlist.id}">
                <div class="playlist-thumbnail">
                    ${playlist.image 
                        ? `<img src="${playlist.image}" alt="${playlist.name}" loading="lazy">` 
                        : '<div class="placeholder-image">🎵</div>'
                    }
                </div>
                <div class="playlist-info">
                    <h4 class="playlist-name">${playlist.name}</h4>
                    <p class="playlist-meta">${playlist.trackCount} titres • ${playlist.owner}</p>
                </div>
                <div class="playlist-actions">
                    <span class="track-count">${playlist.trackCount}</span>
                </div>
            </div>
        `).join('');
    }
    
    // Vue grille dense
    renderPlaylistDense() {
        if (this.filteredPlaylists.length === 0) {
            return '<div class="no-playlists">Aucune playlist trouvée</div>';
        }
        
        return this.filteredPlaylists.map(playlist => `
            <div class="playlist-card dense" data-playlist-id="${playlist.id}">
                <div class="playlist-image-container">
                    ${playlist.image 
                        ? `<img src="${playlist.image}" alt="${playlist.name}" class="playlist-image" loading="lazy">` 
                        : '<div class="playlist-placeholder">🎵</div>'
                    }
                </div>
                <div class="playlist-details">
                    <h4 class="playlist-title">${playlist.name}</h4>
                    <p class="playlist-count">${playlist.trackCount} titres</p>
                </div>
            </div>
        `).join('');
    }

    renderPlaylistGrid() {
        const html = this.filteredPlaylists.map(playlist => `
            <div class="playlist-card" data-playlist-id="${playlist.id}">
                <div class="playlist-image">
                    ${playlist.image 
                        ? `<img src="${playlist.image}" alt="${playlist.name}" loading="lazy">` 
                        : `<div class="playlist-default-icon">${playlist.id === 'liked-tracks' ? '❤️' : '🎵'}</div>`
                    }
                    <div class="playlist-overlay">
                        <div class="play-icon">▶</div>
                    </div>
                </div>
                <div class="playlist-info">
                    <h3 class="playlist-name">${playlist.name}</h3>
                    <p class="playlist-meta">${playlist.trackCount} titres • ${playlist.owner}</p>
                    <p class="playlist-description">${playlist.description}</p>
                </div>
                <div class="selection-indicator">
                    <div class="checkmark">✓</div>
                </div>
            </div>
        `).join('');
        
        // Ajouter les event listeners après le rendu
        setTimeout(() => this.attachPlaylistEvents(), 0);
        
        return html;
    }

    // Attacher les événements aux cartes de playlist
    attachPlaylistEvents() {
        // Sélecteur générique pour tous les types de cartes/lignes
        const selectors = ['.playlist-card', '.playlist-row'];
        
        selectors.forEach(selector => {
            document.querySelectorAll(selector).forEach(element => {
                element.addEventListener('click', () => {
                    const playlistId = element.getAttribute('data-playlist-id');
                    this.selectPlaylist(playlistId);
                });
            });
        });
    }

    // Sélectionner une playlist
    selectPlaylist(playlistId) {
        console.log('selectPlaylist appelé avec ID:', playlistId);
        
        // Retirer la sélection précédente de tous les éléments
        const selectors = ['.playlist-card', '.playlist-row'];
        selectors.forEach(selector => {
            document.querySelectorAll(selector).forEach(element => {
                element.classList.remove('selected');
            });
        });

        // Ajouter la sélection à la nouvelle carte/ligne
        const selectedElement = document.querySelector(`[data-playlist-id="${playlistId}"]`);
        if (selectedElement) {
            selectedElement.classList.add('selected');
            this.selectedPlaylist = this.filteredPlaylists.find(p => p.id === playlistId);
            
            console.log('Playlist sélectionnée:', this.selectedPlaylist);
            
            // Activer le bouton shuffle
            const shuffleBtn = document.getElementById('shuffle-selected-btn');
            if (shuffleBtn) {
                shuffleBtn.disabled = false;
                shuffleBtn.textContent = `Shuffle "${this.selectedPlaylist.name}"`;
            }
        } else {
            console.error('Element de playlist non trouvé pour ID:', playlistId);
        }
    }

    // Lancer le shuffle de la playlist sélectionnée
    async shuffleSelected() {
        console.log('shuffleSelected appelé, selectedPlaylist:', this.selectedPlaylist);
        
        if (!this.selectedPlaylist) {
            alert('Veuillez sélectionner une playlist');
            return;
        }

        try {
            // Sauvegarder la playlist sélectionnée avant de fermer le modal
            const playlistToShuffle = this.selectedPlaylist;
            this.closeSelector();
            
            if (playlistToShuffle.id === 'liked-tracks') {
                // Utiliser la méthode existante pour les titres likés
                await trueRandomMode.generateTrueRandomPlaylist();
            } else {
                // Nouvelle méthode pour les playlists spécifiques
                await trueRandomMode.shuffleSpecificPlaylist(playlistToShuffle);
            }
            
        } catch (error) {
            console.error('Erreur lors du shuffle:', error);
            this.showErrorModal(error.message);
        }
    }

    // Fermer le sélecteur (mode page)
    closeSelector() {
        // En mode page, rediriger vers app.html
        window.location.href = 'app.html';
    }
    
    // Nouvelle méthode pour générer le HTML du sélecteur pour une page
    generatePlaylistSelectorHTML() {
        return `
            <div class="modal-3d-container">
                <div class="modal-3d-toolbar">
                    <div class="sort-controls">
                        <label class="sort-label">📋 Trier par:</label>
                        <select class="sort-dropdown" id="sort-dropdown">
                            <option value="alphabetical" selected>🔤 Ordre alphabétique</option>
                            <option value="count">🔢 Nombre de titres</option>
                        </select>
                    </div>
                    
                    <div class="view-controls">
                        <label class="view-label">👁️ Vue:</label>
                        <div class="view-buttons">
                            <button class="view-btn ${this.currentView === 'grid' ? 'active' : ''}" data-view="grid" title="Vue grille">
                                ⬜
                            </button>
                            <button class="view-btn ${this.currentView === 'list' ? 'active' : ''}" data-view="list" title="Vue liste">
                                ☰
                            </button>
                            <button class="view-btn ${this.currentView === 'dense' ? 'active' : ''}" data-view="dense" title="Vue dense">
                                ▦
                            </button>
                        </div>
                    </div>
                    
                    <div class="playlist-count">
                        <span id="playlist-count">${this.filteredPlaylists.length} playlists</span>
                    </div>
                </div>
                
                <div class="modal-3d-content">
                    <div class="playlist-container ${this.currentView}" id="playlist-grid">
                        ${this.renderPlaylistView()}
                    </div>
                </div>
                
                <div class="floating-buttons">
                    <button class="btn btn-secondary floating-btn" onclick="window.location.href='app.html'">
                        Retour
                    </button>
                    <button id="shuffle-selected-btn" class="btn btn-primary floating-btn" onclick="playlistSelector.shuffleSelected()" disabled>
                        Shuffle la playlist sélectionnée
                    </button>
                </div>
            </div>
        `;
    }
    
    // Méthode pour changer de vue
    changeView(viewType) {
        this.currentView = viewType;
        localStorage.setItem('playlist-view', viewType);
        
        // Mettre à jour les boutons actifs
        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.classList.remove('active');
            if (btn.getAttribute('data-view') === viewType) {
                btn.classList.add('active');
            }
        });
        
        // Ré-rendre les playlists avec la nouvelle vue
        this.refreshGrid();
    }
    
    // Nouvelle méthode pour initialiser les événements en mode page
    initializePageEvents() {
        // Ré-attacher les événements après injection du HTML
        const sortDropdown = document.getElementById('sort-dropdown');
        if (sortDropdown) {
            sortDropdown.addEventListener('change', (e) => {
                this.changeSorting(e.target.value);
            });
        }
        
        // Attacher les événements des boutons de vue
        const viewButtons = document.querySelectorAll('.view-btn');
        viewButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const view = e.target.getAttribute('data-view');
                this.changeView(view);
            });
        });
        
        // Charger la préférence de vue sauvegardée
        const savedView = localStorage.getItem('playlist-view');
        if (savedView && ['grid', 'list', 'dense'].includes(savedView)) {
            this.currentView = savedView;
        }
        
        // Attacher les événements de sélection de playlist
        this.attachPlaylistEvents();
    }
    


    // Fonctions de tri
    changeSorting(sortType) {
        this.currentSort = sortType;
        this.applySorting();
        this.refreshGrid();
    }

    applySorting() {
        switch (this.currentSort) {
            case 'alphabetical':
                this.filteredPlaylists = [...this.playlists].sort((a, b) => 
                    a.name.localeCompare(b.name)
                );
                break;
                
            case 'count':
                this.filteredPlaylists = [...this.playlists].sort((a, b) => {
                    const aCount = a.trackCount === 'Auto' ? 9999 : parseInt(a.trackCount);
                    const bCount = b.trackCount === 'Auto' ? 9999 : parseInt(b.trackCount);
                    return bCount - aCount;
                });
                break;
                
            default:
                this.filteredPlaylists = [...this.playlists].sort((a, b) => 
                    a.name.localeCompare(b.name)
                );
                break;
        }
    }

    refreshGrid() {
        const grid = document.getElementById('playlist-grid');
        const counter = document.getElementById('playlist-count');
        
        if (grid) {
            // Mettre à jour la classe du container
            grid.className = `playlist-container ${this.currentView}`;
            grid.innerHTML = this.renderPlaylistView();
            // Ré-attacher les événements
            setTimeout(() => this.attachPlaylistEvents(), 0);
        }
        
        if (counter) {
            counter.textContent = `${this.filteredPlaylists.length} playlists`;
        }
    }

    // Modal d'erreur
    showErrorModal(errorMessage) {
        const modal = document.getElementById('playlist-selector-modal');
        if (modal) {
            modal.innerHTML = `
                <div class="modal-3d-overlay" onclick="playlistSelector.closeSelector()">
                    <div class="modal-3d-container error-state">
                        <div class="modal-3d-content">
                            <div class="error-icon-3d">⚠️</div>
                            <h2>Erreur</h2>
                            <p>${errorMessage}</p>
                            <button class="btn btn-primary" onclick="playlistSelector.closeSelector()">
                                Fermer
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }
    }
}

// Instance globale
const playlistSelector = new PlaylistSelector();

// Fonction appelée par le bouton
function openPlaylistSelector() {
    // Rediriger vers la page de sélection de playlist
    window.location.href = 'playlist-selector.html';
}