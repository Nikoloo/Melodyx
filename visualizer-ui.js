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
        this.useRealAudio = true; // Default to real-time audio
        
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
        
        // Audio is now always real-time
        this.useRealAudio = true;
        
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
                    <button class="visualizer-btn" id="test-btn" onclick="visualizerUI.testAudioAccess()" title="Test Audio Access">
                        🎤
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
                <div class="audio-source-selector" style="margin-bottom: 1rem;">
                    <p style="margin-bottom: 0.5rem; color: var(--text-primary); font-weight: 600;">Source audio :</p>
                    <div style="display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap;">
                        <label class="audio-source-option">
                            <input type="radio" name="audioSource" value="realtime" checked>
                            <span>🔊 Audio en temps réel</span>
                        </label>
                    </div>
                </div>
                
                <button id="start-visualizer-btn" class="btn btn-primary" onclick="visualizerUI.toggleVisualizer()">
                    Démarrer les visualisations
                </button>
                
                <div class="visualizer-help" style="margin-top: 1rem; font-size: 0.9rem; color: var(--text-secondary);">
                    <details>
                        <summary style="cursor: pointer; color: var(--primary-color);">
                            💡 Instructions détaillées
                        </summary>
                        <div style="margin-top: 0.5rem; text-align: left; line-height: 1.4;">
                            <p><strong>🔊 Comment ça marche :</strong></p>
                            <ol style="margin: 0.5rem 0; padding-left: 1.5rem;">
                                <li><strong>Cliquez sur "Démarrer"</strong> - Une popup va apparaitre</li>
                                <li><strong>Sélectionnez "Onglet entier"</strong> dans la popup</li>
                                <li><strong>Cochez "Partager l'audio de l'onglet"</strong> ✅</li>
                                <li><strong>Cliquez "Partager"</strong> pour confirmer</li>
                            </ol>
                            
                            <p><strong>🎵 Avantages :</strong></p>
                            <ul style="margin: 0.5rem 0; padding-left: 1.5rem;">
                                <li>Capture l'audio réel de Spotify, YouTube, Apple Music, etc.</li>
                                <li>Fonctionne même si la musique est dans une autre application</li>
                                <li>Détection précise des basses, moyennes et aiguës</li>
                                <li>Visualisations réactives basées sur les vraies fréquences</li>
                            </ul>
                            
                            <p style="margin-top: 0.75rem; font-size: 0.85em; color: var(--primary-color);">
                                📝 <strong>Important :</strong> Pour capturer Spotify, lancez Spotify dans un onglet du navigateur plutôt que l'application desktop.
                            </p>
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
            statusText.textContent = 'Demande d\'autorisation audio...';
            
            try {
                await this.visualizer.start();
                statusDot.className = 'status-dot playing';
                statusText.textContent = 'Audio système capturé - Visualisations actives';
            } catch (error) {
                console.error('Error starting visualizer:', error);
                
                // Reset UI on error
                btn.textContent = 'Démarrer les visualisations';
                btn.classList.remove('btn-secondary');
                btn.classList.add('btn-primary');
                statusDot.className = 'status-dot';
                
                // Show specific error messages
                if (error.message.includes('NotAllowedError') || error.message.includes('Permission denied')) {
                    statusText.textContent = 'Permission refusée - Cliquez pour réessayer';
                    this.showError('Accès audio refusé. Cliquez sur "Démarrer" et acceptez le partage d\'audio dans la popup.');
                } else if (error.message.includes('NotSupportedError')) {
                    statusText.textContent = 'Navigateur non supporté';
                    this.showError('Votre navigateur ne supporte pas la capture audio. Utilisez Chrome ou Edge pour de meilleurs résultats.');
                } else {
                    statusText.textContent = 'Erreur d\'initialisation';
                    this.showError(`Erreur: ${error.message}. Assurez-vous d\'utiliser Chrome et d\'accepter le partage audio.`);
                }
            }
        } else {
            // Stop visualizer
            this.visualizer.stop();
            
            
            btn.textContent = 'Démarrer les visualisations';
            btn.classList.remove('btn-secondary');
            btn.classList.add('btn-primary');
            
            statusDot.className = 'status-dot';
            statusText.textContent = 'Visualiseur arrêté - Cliquez pour redémarrer';
            
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
        
        // Update status with real-time audio data
        const statusDot = document.getElementById('status-dot');
        const statusText = document.getElementById('status-text');
        
        if (data.isActive) {
            statusDot.className = 'status-dot playing';
            statusText.textContent = `Audio actif - Tempo: ${data.tempo} BPM`;
            
            // Show and update real-time audio info
            this.updateAudioInfo(data);
        } else {
            statusDot.className = 'status-dot';
            statusText.textContent = 'Audio inactif';
            
            // Hide track info when no audio
            const trackInfo = document.getElementById('track-info');
            if (trackInfo) {
                trackInfo.style.display = 'none';
            }
        }
    }

    updateAudioInfo(data) {
        const trackInfo = document.getElementById('track-info');
        const trackName = document.getElementById('track-name');
        const trackArtist = document.getElementById('track-artist');
        const featuresContainer = document.getElementById('audio-features');
        
        trackInfo.style.display = 'block';
        trackName.textContent = 'Analyse Audio en Temps Réel';
        trackArtist.textContent = 'Source: Microphone/Onglet du navigateur';
        
        // Show real-time audio levels
        featuresContainer.style.display = 'flex';
        
        const bassText = Math.round(data.bassLevel * 100) + '%';
        const midText = Math.round(data.midLevel * 100) + '%';
        const trebleText = Math.round(data.trebleLevel * 100) + '%';
        
        document.getElementById('feature-energy').textContent = bassText;
        document.getElementById('feature-tempo').textContent = midText;
        document.getElementById('feature-dance').textContent = trebleText;
        
        // Update labels to reflect real-time data
        const energyLabel = featuresContainer.querySelector('.feature-item:nth-child(1) span:first-child');
        const tempoLabel = featuresContainer.querySelector('.feature-item:nth-child(2) span:first-child');
        const danceLabel = featuresContainer.querySelector('.feature-item:nth-child(3) span:first-child');
        
        if (energyLabel) energyLabel.textContent = 'Bass';
        if (tempoLabel) tempoLabel.textContent = 'Mid';
        if (danceLabel) danceLabel.textContent = 'Treble';
        
        featuresContainer.title = 'Niveaux audio en temps réel';
    }

    showError(message) {
        const container = document.getElementById('main-visualizer');
        const canvas = container.querySelector('canvas');
        
        // Show error overlay without removing the canvas
        let errorOverlay = container.querySelector('.error-overlay');
        if (!errorOverlay) {
            errorOverlay = document.createElement('div');
            errorOverlay.className = 'error-overlay';
            errorOverlay.style.cssText = `
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.8);
                display: flex;
                flex-direction: column;
                justify-content: center;
                align-items: center;
                color: white;
                text-align: center;
                padding: 2rem;
                box-sizing: border-box;
                z-index: 1000;
            `;
            container.appendChild(errorOverlay);
        }
        
        errorOverlay.innerHTML = `
            <div class="error-content">
                <div class="error-icon" style="font-size: 3rem; margin-bottom: 1rem;">⚠️</div>
                <h3 style="color: #ff6b6b; margin-bottom: 1rem;">Erreur de capture audio</h3>
                <p style="margin-bottom: 2rem; line-height: 1.5;">${message}</p>
                <div style="display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap;">
                    <button class="retry-btn" onclick="visualizerUI.hideError()" style="
                        background: var(--primary-color);
                        color: white;
                        border: none;
                        padding: 0.75rem 1.5rem;
                        border-radius: 0.5rem;
                        cursor: pointer;
                        font-weight: 600;
                    ">
                        Fermer
                    </button>
                    <button class="test-btn" onclick="visualizerUI.testAudioAccess()" style="
                        background: transparent;
                        color: var(--primary-color);
                        border: 2px solid var(--primary-color);
                        padding: 0.75rem 1.5rem;
                        border-radius: 0.5rem;
                        cursor: pointer;
                        font-weight: 600;
                    ">
                        Tester l\'audio
                    </button>
                </div>
            </div>
        `;
    }
    
    hideError() {
        const container = document.getElementById('main-visualizer');
        const errorOverlay = container.querySelector('.error-overlay');
        if (errorOverlay) {
            errorOverlay.remove();
        }
    }

    async testAudioAccess() {
        console.log('🧪 Testing system audio access...');
        
        try {
            // Test system/tab audio capture
            const stream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    width: { max: 1 },
                    height: { max: 1 }
                },
                audio: {
                    echoCancellation: false,
                    autoGainControl: false,
                    noiseSuppression: false
                }
            });
            
            const audioTracks = stream.getAudioTracks();
            const videoTracks = stream.getVideoTracks();
            
            if (audioTracks.length > 0) {
                const audioLabel = audioTracks[0].label || 'Audio d\'onglet';
                alert(`✅ Accès audio réussi!\n\nSource: ${audioLabel}\n\n🎵 Vous pouvez maintenant démarrer les visualisations et jouer de la musique sur cet onglet.`);
            } else {
                alert('⚠️ Partage d\'audio non sélectionné\n\nAssurez-vous de cocher "Partager l\'audio de l\'onglet" dans la popup de permission.');
            }
            
            // Clean up test stream
            stream.getTracks().forEach(track => track.stop());
            
        } catch (error) {
            console.error('❌ Audio access test failed:', error);
            
            if (error.name === 'NotAllowedError') {
                alert('❌ Permission refusée\n\nVous avez refusé l\'accès au partage d\'\u00e9cran. Essayez à nouveau et acceptez les permissions.');
            } else if (error.name === 'NotSupportedError') {
                alert('❌ Navigateur non supporté\n\nVotre navigateur ne supporte pas la capture audio. Utilisez Chrome ou Edge pour de meilleurs résultats.');
            } else {
                alert(`❌ Erreur de test audio\n\n${error.message}\n\nVérifiez que vous utilisez un navigateur compatible (Chrome recommandé).`);
            }
        }
    }

    // Public API
    isActive() {
        return this.visualizer && this.visualizer.isActive;
    }

    getVisualizationData() {
        return this.visualizer ? this.visualizer.getVisualizationData() : null;
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