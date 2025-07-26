/**
 * Visualizer UI Controller
 * Manages the visualizer interface and integration with Melodyx
 */

class VisualizerUI {
    constructor() {
        this.visualizer = null;
        this.isFullscreen = false;
        this.isInitialized = false;
        this.container = null;
        this.currentMode = 'bubbles';
        
        this.modes = {
            'bubbles': 'Bulles & Vagues',
            'minimal': 'Mode Minimal',
            'intense': 'Mode Intense'
        };
    }

    async initialize() {
        if (this.isInitialized) return;
        
        console.log('🎨 Initializing Visualizer UI...');
        
        // Create the visualizer container
        this.createVisualizerContainer();
        
        // Initialize the visualizer engine (only if canvas exists)
        const canvas = document.getElementById('visualizer-canvas');
        if (canvas) {
            this.visualizer = new MusicVisualizer('visualizer-canvas');
            console.log('✅ Visualizer engine initialized');
        } else {
            console.warn('⚠️ Canvas not found, visualizer will be initialized on first use');
        }
        
        // Set up event listeners
        this.setupEventListeners();
        
        this.isInitialized = true;
        console.log('✅ Visualizer UI initialized');
    }

    createVisualizerContainer() {
        // Find insertion point in the app
        const appContainer = document.querySelector('.features-grid-app');
        if (!appContainer) {
            console.error('Could not find app container for visualizer');
            return;
        }

        // Create visualizer feature card
        const visualizerCard = document.createElement('div');
        visualizerCard.className = 'feature-app visualizer-feature';
        visualizerCard.innerHTML = `
            <h3>🌈 Visualisations musicales</h3>
            <div class="visualizer-container" id="main-visualizer">
                <canvas id="visualizer-canvas" class="visualizer-canvas"></canvas>
                
                <div class="visualizer-overlay"></div>
                
                <div class="visualizer-status" id="visualizer-status">
                    <div class="status-indicator">
                        <div class="status-dot" id="status-dot"></div>
                        <span id="status-text">En attente de musique...</span>
                    </div>
                    
                    <div class="track-info" id="track-info" style="display: none;">
                        <h4 id="track-name">-</h4>
                        <p id="track-artist">-</p>
                        
                        <div class="audio-features" id="audio-features" style="display: none;">
                            <div class="feature-item">
                                <span>Energy</span>
                                <span class="feature-value" id="feature-energy">-</span>
                            </div>
                            <div class="feature-item">
                                <span>Tempo</span>
                                <span class="feature-value" id="feature-tempo">-</span>
                            </div>
                            <div class="feature-item">
                                <span>Dance</span>
                                <span class="feature-value" id="feature-dance">-</span>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="visualizer-controls">
                    <button class="visualizer-btn" id="test-btn" onclick="visualizerUI.testSpotifyAPI()" title="Test Spotify API">
                        🔍
                    </button>
                    <button class="visualizer-btn" id="mode-btn" onclick="visualizerUI.cycleMode()">
                        Bulles & Vagues
                    </button>
                    <button class="visualizer-btn" id="fullscreen-btn" onclick="visualizerUI.toggleFullscreen()">
                        ⛶
                    </button>
                </div>
            </div>
            
            <div class="visualizer-actions" style="margin-top: 1rem; text-align: center;">
                <button id="start-visualizer-btn" class="btn btn-primary" onclick="visualizerUI.toggleVisualizer()">
                    Démarrer les visualisations
                </button>
                
                <div class="visualizer-help" style="margin-top: 1rem; font-size: 0.9rem; color: var(--text-secondary);">
                    <details>
                        <summary style="cursor: pointer; color: var(--primary-color);">
                            💡 Problèmes de détection ? Cliquez ici
                        </summary>
                        <div style="margin-top: 0.5rem; text-align: left; line-height: 1.4;">
                            <p><strong>Pour que le visualiseur fonctionne :</strong></p>
                            <ol style="margin: 0.5rem 0; padding-left: 1.5rem;">
                                <li>Ouvrez Spotify sur n'importe quel appareil</li>
                                <li>Commencez à jouer de la musique</li>
                                <li>Cliquez sur le bouton 🔍 pour tester l'API</li>
                                <li>Démarrez le visualiseur</li>
                            </ol>
                            <p style="margin-top: 0.5rem;"><strong>Note :</strong> Le visualiseur ne peut pas détecter la musique si aucun appareil Spotify n'est actif.</p>
                        </div>
                    </details>
                </div>
            </div>
        `;

        // Insert before the last feature card (stats)
        const statsCard = appContainer.querySelector('.feature-app:last-child');
        appContainer.insertBefore(visualizerCard, statsCard);
        
        this.container = visualizerCard;
    }

    setupEventListeners() {
        // Canvas click for fullscreen
        const canvas = document.getElementById('visualizer-canvas');
        if (canvas) {
            canvas.addEventListener('dblclick', () => {
                this.toggleFullscreen();
            });
        }

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isFullscreen) {
                this.exitFullscreen();
            }
            if (e.key === 'v' && e.ctrlKey) {
                e.preventDefault();
                this.toggleVisualizer();
            }
            if (e.key === 'm' && e.ctrlKey) {
                e.preventDefault();
                this.cycleMode();
            }
        });

        // Update UI when visualizer data changes
        setInterval(() => {
            this.updateUI();
        }, 500);
    }

    async toggleVisualizer() {
        const btn = document.getElementById('start-visualizer-btn');
        const statusDot = document.getElementById('status-dot');
        const statusText = document.getElementById('status-text');
        
        // Initialize visualizer if not already done
        if (!this.visualizer) {
            console.log('🔧 Initializing visualizer...');
            this.visualizer = new MusicVisualizer('visualizer-canvas');
        }
        
        if (!this.visualizer.isActive) {
            // Start visualizer
            btn.textContent = 'Arrêter les visualisations';
            btn.classList.remove('btn-primary');
            btn.classList.add('btn-secondary');
            
            statusDot.className = 'status-dot loading';
            statusText.textContent = 'Démarrage...';
            
            try {
                await this.visualizer.start();
                statusDot.className = 'status-dot playing';
                statusText.textContent = 'Visualiseur actif';
            } catch (error) {
                console.error('Error starting visualizer:', error);
                this.showError('Erreur lors du démarrage du visualiseur');
            }
        } else {
            // Stop visualizer
            this.visualizer.stop();
            
            btn.textContent = 'Démarrer les visualisations';
            btn.classList.remove('btn-secondary');
            btn.classList.add('btn-primary');
            
            statusDot.className = 'status-dot';
            statusText.textContent = 'Visualiseur arrêté';
            
            // Hide track info
            document.getElementById('track-info').style.display = 'none';
        }
    }

    cycleMode() {
        const modes = Object.keys(this.modes);
        const currentIndex = modes.indexOf(this.currentMode);
        const nextIndex = (currentIndex + 1) % modes.length;
        
        this.currentMode = modes[nextIndex];
        
        // Only set mode if visualizer exists
        if (this.visualizer) {
            this.visualizer.setVisualizationMode(this.currentMode);
        }
        
        const modeBtn = document.getElementById('mode-btn');
        if (modeBtn) {
            modeBtn.textContent = this.modes[this.currentMode];
        }
        
        console.log('Visualization mode changed to:', this.currentMode);
    }

    toggleFullscreen() {
        if (this.isFullscreen) {
            this.exitFullscreen();
        } else {
            this.enterFullscreen();
        }
    }

    enterFullscreen() {
        const container = document.getElementById('main-visualizer');
        if (!container) return;

        // Create fullscreen wrapper
        const fullscreenWrapper = document.createElement('div');
        fullscreenWrapper.className = 'visualizer-fullscreen';
        fullscreenWrapper.id = 'fullscreen-visualizer';
        
        // Move container to fullscreen
        container.parentNode.removeChild(container);
        fullscreenWrapper.appendChild(container);
        
        // Add exit button
        const exitBtn = document.createElement('button');
        exitBtn.className = 'fullscreen-exit';
        exitBtn.innerHTML = '×';
        exitBtn.onclick = () => this.exitFullscreen();
        fullscreenWrapper.appendChild(exitBtn);
        
        document.body.appendChild(fullscreenWrapper);
        
        this.isFullscreen = true;
        
        // Update button
        const fullscreenBtn = document.getElementById('fullscreen-btn');
        fullscreenBtn.textContent = '⛟';
        
        // Resize canvas
        setTimeout(() => {
            this.visualizer.setupCanvas();
        }, 100);
    }

    exitFullscreen() {
        const fullscreenWrapper = document.getElementById('fullscreen-visualizer');
        const container = document.getElementById('main-visualizer');
        
        if (!fullscreenWrapper || !container) return;
        
        // Move container back to original position
        container.parentNode.removeChild(container);
        this.container.appendChild(container);
        
        // Remove fullscreen wrapper
        fullscreenWrapper.remove();
        
        this.isFullscreen = false;
        
        // Update button
        const fullscreenBtn = document.getElementById('fullscreen-btn');
        fullscreenBtn.textContent = '⛶';
        
        // Resize canvas
        setTimeout(() => {
            this.visualizer.setupCanvas();
        }, 100);
    }

    updateUI() {
        if (!this.visualizer || !this.visualizer.isActive) return;
        
        const data = this.visualizer.getVisualizationData();
        if (!data) return;
        
        // Update status
        const statusDot = document.getElementById('status-dot');
        const statusText = document.getElementById('status-text');
        
        if (data.currentTrack) {
            if (data.isPlaying) {
                statusDot.className = 'status-dot playing';
                statusText.textContent = 'En lecture';
            } else {
                statusDot.className = 'status-dot';
                statusText.textContent = 'En pause';
            }
            
            // Show and update track info
            this.updateTrackInfo(data.currentTrack, data.audioFeatures);
        } else {
            statusDot.className = 'status-dot loading';
            statusText.textContent = 'Recherche de musique...';
            
            // Hide track info when no track
            const trackInfo = document.getElementById('track-info');
            if (trackInfo) {
                trackInfo.style.display = 'none';
            }
        }
    }

    updateTrackInfo(track, audioFeatures) {
        const trackInfo = document.getElementById('track-info');
        const trackName = document.getElementById('track-name');
        const trackArtist = document.getElementById('track-artist');
        const featuresContainer = document.getElementById('audio-features');
        
        trackInfo.style.display = 'block';
        trackName.textContent = track.name;
        trackArtist.textContent = track.artists.map(a => a.name).join(', ');
        
        if (audioFeatures) {
            featuresContainer.style.display = 'flex';
            
            const energyText = Math.round(audioFeatures.energy * 100) + '%';
            const tempoText = Math.round(audioFeatures.tempo) + ' BPM';
            const danceText = Math.round(audioFeatures.danceability * 100) + '%';
            
            // Add fallback indicator if using simulated features
            const suffix = audioFeatures.fallback ? '*' : '';
            
            document.getElementById('feature-energy').textContent = energyText + suffix;
            document.getElementById('feature-tempo').textContent = tempoText + suffix;
            document.getElementById('feature-dance').textContent = danceText + suffix;
            
            // Add tooltip for fallback mode
            if (audioFeatures.fallback) {
                featuresContainer.title = '* Valeurs simulées (API audio-features restreinte)';
            } else {
                featuresContainer.title = 'Données audio Spotify';
            }
        } else {
            featuresContainer.style.display = 'none';
        }
    }

    showError(message) {
        const container = document.getElementById('main-visualizer');
        container.innerHTML = `
            <div class="visualizer-error">
                <div class="error-icon">⚠️</div>
                <p><strong>Erreur du visualiseur</strong></p>
                <p>${message}</p>
                <button class="retry-btn" onclick="location.reload()">
                    Recharger la page
                </button>
            </div>
        `;
    }

    async testSpotifyAPI() {
        console.log('🧪 Testing Spotify API connection...');
        
        const token = SpotifyAuth.getAccessToken();
        if (!token) {
            alert('❌ No Spotify token found. Please log in to Spotify first.');
            return;
        }
        
        console.log('✅ Token found:', token.substring(0, 20) + '...');
        
        try {
            // Test user profile
            console.log('🔍 Testing user profile...');
            const userResponse = await fetch('https://api.spotify.com/v1/me', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            if (userResponse.ok) {
                const user = await userResponse.json();
                console.log('✅ User profile:', user.display_name);
            } else {
                console.error('❌ User profile failed:', userResponse.status);
            }
            
            // Test player state
            console.log('🔍 Testing player state...');
            const playerResponse = await fetch('https://api.spotify.com/v1/me/player', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            
            console.log('📡 Player response status:', playerResponse.status);
            
            if (playerResponse.status === 204) {
                alert('⚠️ No active Spotify device found. Please:\n1. Open Spotify on any device\n2. Start playing music\n3. Try again');
            } else if (playerResponse.ok) {
                const player = await playerResponse.json();
                console.log('✅ Player state:', player);
                
                if (player.item) {
                    alert(`✅ Spotify API working!\nCurrently playing: ${player.item.name}\nby ${player.item.artists.map(a => a.name).join(', ')}`);
                } else {
                    alert('⚠️ Spotify is connected but no track is playing. Please start playing music.');
                }
            } else {
                console.error('❌ Player request failed:', playerResponse.status);
                alert('❌ Spotify API error. Check console for details.');
            }
            
        } catch (error) {
            console.error('❌ Test failed:', error);
            alert('❌ Network error testing Spotify API. Check your connection.');
        }
    }

    // Public API
    isActive() {
        return this.visualizer && this.visualizer.isActive;
    }

    getCurrentTrack() {
        return this.visualizer ? this.visualizer.currentTrack : null;
    }

    getAudioFeatures() {
        return this.visualizer ? this.visualizer.audioFeatures : null;
    }
}

// Create global instance
const visualizerUI = new VisualizerUI();

// Auto-initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Only initialize if we're on the app page and user is logged in
    if (window.location.pathname.includes('app.html') && SpotifyAuth.isLoggedIn()) {
        setTimeout(() => {
            visualizerUI.initialize();
        }, 1000); // Delay to ensure other components are loaded
    }
});

// Expose to global scope
window.visualizerUI = visualizerUI;