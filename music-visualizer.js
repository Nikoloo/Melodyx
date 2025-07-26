/**
 * Music Visualizer for Melodyx
 * Creates real-time visualizations using Spotify API data and simulated audio analysis
 * @author Melodyx Team
 */

class MusicVisualizer {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.isActive = false;
        this.animationFrameId = null;
        
        // Visualization state
        this.currentTrack = null;
        this.audioFeatures = null;
        this.playbackState = null;
        
        // Animation parameters
        this.time = 0;
        this.amplitude = 0;
        
        // Beat detection and percussion bubble system
        this.beatThreshold = 0.7;
        this.lastBeatTime = 0;
        this.beatIntensity = 0;
        this.bubbles = [];
        
        // Flowing wave system for melody
        this.wavePoints = [];
        this.melodyIntensity = 0;
        this.bassIntensity = 0;
        
        // Performance monitoring
        this.lastFrameTime = performance.now();
        this.frameCount = 0;
        this.fps = 60;
        
        // Visual settings
        this.colors = {
            primary: '#1DB954',
            secondary: '#1ed760',
            accent: '#ff6b6b',
            background: '#121212'
        };
        
        // Visualization mode
        this.visualizationMode = 'bubbles';
        
        this.setupCanvas();
        this.initializeVisuals();
    }

    setupCanvas() {
        // Set canvas size to match container
        const container = this.canvas.parentElement;
        const rect = container.getBoundingClientRect();
        
        this.canvas.width = rect.width * window.devicePixelRatio;
        this.canvas.height = rect.height * window.devicePixelRatio;
        this.canvas.style.width = rect.width + 'px';
        this.canvas.style.height = rect.height + 'px';
        
        // Scale context for crisp rendering
        this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
        
        // Handle resize
        window.addEventListener('resize', () => {
            this.setupCanvas();
        });
    }

    initializeVisuals() {
        // Initialize visualization system
        this.beatIntensity = 0;
        this.melodyIntensity = 0;
        this.bassIntensity = 0;
        this.bubbles = [];
        this.wavePoints = [];
        
        console.log('✅ Visualization system initialized');
    }

    async start() {
        if (this.isActive) return;
        
        this.isActive = true;
        console.log('🎵 Starting music visualizer...');
        
        // Start the update loops
        this.startVisualizationLoop();
        this.startSpotifyDataLoop();
    }

    stop() {
        this.isActive = false;
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
        }
        console.log('⏹️ Music visualizer stopped');
    }

    startVisualizationLoop() {
        const animate = () => {
            if (!this.isActive) return;
            
            // Performance monitoring
            const now = performance.now();
            const deltaTime = now - this.lastFrameTime;
            this.lastFrameTime = now;
            this.frameCount++;
            
            if (this.frameCount % 60 === 0) {
                this.fps = Math.round(1000 / deltaTime);
            }
            
            this.updateVisualization();
            this.render();
            
            this.animationFrameId = requestAnimationFrame(animate);
        };
        
        animate();
    }

    async startSpotifyDataLoop() {
        // Update Spotify data every 1 second
        const updateSpotifyData = async () => {
            if (!this.isActive) return;
            
            try {
                await this.fetchCurrentPlayback();
                await this.updateAudioFeatures();
            } catch (error) {
                console.warn('Error fetching Spotify data:', error);
            }
            
            if (this.isActive) {
                setTimeout(updateSpotifyData, 1000);
            }
        };
        
        updateSpotifyData();
    }

    async fetchCurrentPlayback() {
        const token = SpotifyAuth.getAccessToken();
        if (!token) {
            console.warn('⚠️ No Spotify access token available');
            return;
        }

        try {
            console.log('🔍 Fetching current playback...');
            
            // First try the currently-playing endpoint
            let response = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            console.log('📡 Currently-playing API response status:', response.status);

            if (response.status === 204) {
                console.log('⏸️ No music currently playing (204 response)');
                this.playbackState = null;
                
                // Try the general player endpoint as fallback
                console.log('🔄 Trying general player endpoint...');
                response = await fetch('https://api.spotify.com/v1/me/player', {
                    headers: {
                        'Authorization': `Bearer ${token}`
                    }
                });
                
                console.log('📡 Player API response status:', response.status);
                
                if (response.status === 204) {
                    console.log('⏸️ No active device found');
                    return;
                }
                
                if (response.ok) {
                    this.playbackState = await response.json();
                    console.log('🎵 Player state (fallback):', this.playbackState);
                } else {
                    console.log('❌ Both endpoints returned no playback data');
                    return;
                }
            } else if (response.ok) {
                this.playbackState = await response.json();
                console.log('🎵 Playback state:', this.playbackState);
            } else if (response.status === 401) {
                console.error('🚫 Unauthorized - token may be expired');
                this.handleTokenError();
                return;
            } else {
                console.error('❌ Spotify API error:', response.status, response.statusText);
                const errorData = await response.text();
                console.error('Error details:', errorData);
                return;
            }

            // Process the playback state if we have it
            if (this.playbackState && this.playbackState.item) {
                // Check if track changed
                if (!this.currentTrack || this.currentTrack.id !== this.playbackState.item.id) {
                    this.currentTrack = this.playbackState.item;
                    this.audioFeatures = null; // Reset features for new track
                    console.log('🎵 New track detected:', this.currentTrack.name, 'by', this.currentTrack.artists.map(a => a.name).join(', '));
                }
                
                if (this.playbackState.is_playing) {
                    console.log('▶️ Music is playing:', this.playbackState.progress_ms, '/', this.currentTrack.duration_ms);
                } else {
                    console.log('⏸️ Music is paused');
                }
            } else {
                console.log('❓ No track item in playback state');
            }

        } catch (error) {
            console.error('❌ Network error fetching playback state:', error);
        }
    }

    async updateAudioFeatures() {
        if (!this.currentTrack || this.audioFeatures) return;

        const token = SpotifyAuth.getAccessToken();
        if (!token) return;

        try {
            console.log('🎼 Attempting to fetch audio features...');
            const response = await fetch(`https://api.spotify.com/v1/audio-features/${this.currentTrack.id}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                this.audioFeatures = await response.json();
                console.log('✅ Audio features loaded:', {
                    energy: this.audioFeatures.energy,
                    danceability: this.audioFeatures.danceability,
                    tempo: this.audioFeatures.tempo,
                    valence: this.audioFeatures.valence
                });
            } else if (response.status === 403) {
                console.warn('⚠️ Audio features API restricted (403). Using fallback visualization.');
                // Set fallback features to prevent repeated API calls
                this.audioFeatures = this.generateFallbackFeatures();
            } else {
                console.error('❌ Audio features error:', response.status, response.statusText);
                // Set fallback features
                this.audioFeatures = this.generateFallbackFeatures();
            }
        } catch (error) {
            console.error('❌ Network error fetching audio features:', error);
            // Set fallback features
            this.audioFeatures = this.generateFallbackFeatures();
        }
    }

    generateFallbackFeatures() {
        // Generate reasonable fallback values for visualization
        console.log('🎨 Generating fallback audio features...');
        return {
            energy: 0.7,        // Moderate energy
            danceability: 0.6,  // Moderate danceability
            tempo: 120,         // Standard tempo
            valence: 0.5,       // Neutral mood
            acousticness: 0.3,
            instrumentalness: 0.1,
            speechiness: 0.1,
            liveness: 0.2,
            fallback: true      // Flag to indicate these are generated values
        };
    }

    updateVisualization() {
        this.time += 0.016; // ~60fps

        if (this.playbackState?.is_playing && this.currentTrack) {
            const progress = this.playbackState.progress_ms / this.currentTrack.duration_ms;
            
            // Get audio features (real or fallback)
            let energy, danceability, tempo, valence;
            
            if (this.audioFeatures) {
                ({ energy, danceability, tempo, valence } = this.audioFeatures);
                
                if (this.audioFeatures.fallback) {
                    // Dynamic fallback values
                    energy = 0.5 + Math.sin(progress * Math.PI * 4) * 0.3;
                    danceability = 0.4 + Math.sin(progress * Math.PI * 2) * 0.3;
                    tempo = 120 + Math.sin(this.time * 0.1) * 20;
                    valence = 0.5 + Math.sin(progress * Math.PI) * 0.3;
                }
            } else {
                energy = 0.5 + Math.sin(progress * Math.PI * 3) * 0.4;
                danceability = 0.4 + Math.cos(progress * Math.PI * 2) * 0.4;
                tempo = 120 + Math.sin(this.time * 0.05) * 30;
                valence = 0.3 + Math.sin(progress * Math.PI) * 0.5;
            }
            
            const tempoFactor = tempo / 120;
            
            // 🥁 BEAT DETECTION & BUBBLE SYSTEM
            this.updateBeatDetection(energy, danceability, tempoFactor);
            
            // 🌊 FLOWING WAVE SYSTEM  
            this.updateFlowingWaves(valence, energy, tempoFactor);
            
            // Update global amplitude for other effects
            this.amplitude = Math.max(0.1, energy * 0.8 + danceability * 0.6);
            
        } else {
            // Idle state - decay all effects
            this.beatIntensity *= 0.95;
            this.melodyIntensity *= 0.98;
            this.bassIntensity *= 0.97;
            this.amplitude *= 0.95;
            
            // Remove old bubbles
            this.bubbles = this.bubbles.filter(bubble => bubble.life > 0.1);
        }
        
        // Update existing bubbles
        this.updateBubbles();
    }

    updateBeatDetection(energy, danceability, tempoFactor) {
        // Simulate beat timing based on tempo
        const beatInterval = (60 / (tempoFactor * 120)) * 1000; // ms between beats
        const timeSinceLastBeat = Date.now() - this.lastBeatTime;
        
        // Calculate beat probability
        const beatPattern = Math.sin(this.time * tempoFactor * 8) * 0.5 + 0.5;
        const energyBoost = energy * danceability;
        const beatProbability = (beatPattern * energyBoost + Math.random() * 0.3);
        
        // Trigger beat if conditions are met
        if (timeSinceLastBeat > beatInterval * 0.8 && beatProbability > this.beatThreshold) {
            this.triggerBeat(energyBoost);
            this.lastBeatTime = Date.now();
        }
        
        // Update beat intensity (decays over time)
        this.beatIntensity *= 0.92;
    }

    triggerBeat(intensity) {
        this.beatIntensity = Math.min(1, intensity * 1.5);
        
        // Only create bubbles in certain modes
        if (this.visualizationMode === 'minimal') return;
        
        // Create new bubble at random position
        const { width, height } = this.canvas.getBoundingClientRect();
        
        const bubbleCount = this.visualizationMode === 'intense' ? 2 : 1;
        const maxBubbles = this.visualizationMode === 'intense' ? 20 : 12;
        
        for (let i = 0; i < bubbleCount; i++) {
            const bubble = {
                x: Math.random() * width,
                y: height * 0.3 + Math.random() * height * 0.4, // Middle area
                size: Math.max(10, 20 + intensity * (this.visualizationMode === 'intense' ? 100 : 80)),
                maxSize: Math.max(20, 30 + intensity * (this.visualizationMode === 'intense' ? 150 : 120)),
                life: 1.0,
                intensity: intensity,
                hue: Math.random() * 60 + (this.visualizationMode === 'intense' ? 0 : 100), // More variety in intense mode
                vel: {
                    x: (Math.random() - 0.5) * (this.visualizationMode === 'intense' ? 4 : 2),
                    y: -Math.random() * 3 - 1
                }
            };
            
            this.bubbles.push(bubble);
        }
        
        // Limit number of bubbles
        if (this.bubbles.length > maxBubbles) {
            this.bubbles.splice(0, this.bubbles.length - maxBubbles);
        }
    }

    updateBubbles() {
        this.bubbles.forEach(bubble => {
            // Animate bubble growth and movement
            bubble.size = Math.min(bubble.maxSize, bubble.size + 2);
            bubble.x += bubble.vel.x;
            bubble.y += bubble.vel.y;
            bubble.life *= 0.98; // Fade out
            
            // Apply some physics
            bubble.vel.y += 0.1; // Gravity
            bubble.vel.x *= 0.99; // Air resistance
        });
        
        // Remove dead bubbles
        this.bubbles = this.bubbles.filter(bubble => bubble.life > 0.05);
    }

    updateFlowingWaves(valence, energy, tempoFactor) {
        // Update melody intensity (smoother than beats)
        this.melodyIntensity = valence * 0.6 + energy * 0.4;
        this.bassIntensity = energy * 0.8;
        
        // Generate flowing wave points
        const numPoints = 80;
        this.wavePoints = [];
        
        for (let i = 0; i <= numPoints; i++) {
            const x = (i / numPoints);
            
            // Multiple sine waves for complex melody representation
            const wave1 = Math.sin(x * Math.PI * 4 + this.time * tempoFactor * 3) * this.melodyIntensity;
            const wave2 = Math.sin(x * Math.PI * 6 + this.time * tempoFactor * 2) * this.melodyIntensity * 0.5;
            const wave3 = Math.sin(x * Math.PI * 8 + this.time * tempoFactor * 4) * this.melodyIntensity * 0.3;
            
            // Bass wave (slower, deeper)
            const bassWave = Math.sin(x * Math.PI * 2 + this.time * tempoFactor) * this.bassIntensity * 0.8;
            
            const y = (wave1 + wave2 + wave3 + bassWave) * 60;
            
            this.wavePoints.push({ x: x, y: y });
        }
    }

    render() {
        const { width, height } = this.canvas.getBoundingClientRect();
        
        // Clear canvas with beautiful gradient background
        this.renderBackground(width, height);
        
        // 🌊 Render flowing waves (melody)
        this.renderFlowingWaves(width, height);
        
        // 🫧 Render percussion bubbles
        this.renderBubbles(width, height);
        
        // 🎵 Render minimal track info
        this.renderMinimalTrackInfo(width, height);
        
        // Render performance info (debug mode)
        if (this.frameCount % 120 === 0) {
            this.renderPerformanceInfo(width, height);
        }
    }

    renderBackground(width, height) {
        // Beautiful animated gradient background
        const time = this.time * 0.5;
        
        // Create radial gradient that shifts with music
        const centerX = width * 0.5 + Math.sin(time) * 100;
        const centerY = height * 0.5 + Math.cos(time * 0.7) * 50;
        
        const gradient = this.ctx.createRadialGradient(
            centerX, centerY, 0,
            centerX, centerY, Math.max(width, height) * 0.8
        );
        
        // Dynamic colors based on music intensity
        const hue1 = 240 + this.amplitude * 60; // Blue to purple
        const hue2 = 200 + this.melodyIntensity * 40; // Blue to cyan
        
        gradient.addColorStop(0, `hsla(${hue1}, 70%, 20%, 0.8)`);
        gradient.addColorStop(0.5, `hsla(${hue2}, 50%, 15%, 0.6)`);
        gradient.addColorStop(1, `hsla(220, 30%, 8%, 1)`);
        
        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(0, 0, width, height);
        
        // Add subtle moving particles in background
        this.renderBackgroundParticles(width, height);
    }

    renderBackgroundParticles(width, height) {
        const numParticles = 20;
        
        this.ctx.save();
        this.ctx.globalAlpha = 0.1 + this.melodyIntensity * 0.2;
        
        for (let i = 0; i < numParticles; i++) {
            const x = (Math.sin(this.time * 0.2 + i) * 0.5 + 0.5) * width;
            const y = (Math.cos(this.time * 0.15 + i) * 0.5 + 0.5) * height;
            const size = Math.max(0.5, 2 + Math.sin(this.time + i) * 3); // Ensure positive radius
            
            this.ctx.beginPath();
            this.ctx.arc(x, y, size, 0, Math.PI * 2);
            this.ctx.fillStyle = `hsla(${180 + i * 10}, 60%, 60%, 0.5)`;
            this.ctx.fill();
        }
        
        this.ctx.restore();
    }

    renderFlowingWaves(width, height) {
        if (this.wavePoints.length === 0) return;
        
        const centerY = height * 0.5;
        
        this.ctx.save();
        
        // Render different wave styles based on mode
        switch (this.visualizationMode) {
            case 'minimal':
                // Single, clean wave
                this.renderWaveLayer(width, height, centerY, 0.6, 2, 'hsla(200, 50%, 60%, 0.8)');
                break;
                
            case 'intense':
                // Multiple chaotic waves
                this.renderWaveLayer(width, height, centerY, 1.2, 6, 'hsla(0, 80%, 50%, 0.7)');
                this.renderWaveLayer(width, height, centerY, 0.9, 4, 'hsla(60, 70%, 60%, 0.5)');
                this.renderWaveLayer(width, height, centerY, 0.6, 3, 'hsla(180, 60%, 70%, 0.4)');
                this.renderWaveLayer(width, height, centerY, 0.3, 2, 'hsla(300, 50%, 80%, 0.3)');
                break;
                
            case 'bubbles':
            default:
                // Balanced wave layers
                this.renderWaveLayer(width, height, centerY, 0.8, 4, 'hsla(180, 70%, 50%, 0.6)');
                this.renderWaveLayer(width, height, centerY, 0.6, 3, 'hsla(200, 60%, 60%, 0.4)');
                this.renderWaveLayer(width, height, centerY, 0.4, 2, 'hsla(220, 50%, 70%, 0.3)');
                break;
        }
        
        this.ctx.restore();
    }

    renderWaveLayer(width, height, centerY, intensityMul, lineWidth, color) {
        this.ctx.strokeStyle = color;
        this.ctx.lineWidth = lineWidth;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        
        // Add glow effect
        this.ctx.shadowBlur = 15;
        this.ctx.shadowColor = color;
        
        this.ctx.beginPath();
        
        for (let i = 0; i < this.wavePoints.length; i++) {
            const point = this.wavePoints[i];
            const x = point.x * width;
            const y = centerY + point.y * intensityMul;
            
            if (i === 0) {
                this.ctx.moveTo(x, y);
            } else {
                // Use bezier curves for smooth flowing effect
                const prevPoint = this.wavePoints[i - 1];
                const prevX = prevPoint.x * width;
                const prevY = centerY + prevPoint.y * intensityMul;
                
                const cpX = (x + prevX) / 2;
                const cpY = (y + prevY) / 2;
                
                this.ctx.quadraticCurveTo(prevX, prevY, cpX, cpY);
            }
        }
        
        this.ctx.stroke();
        this.ctx.shadowBlur = 0;
    }

    renderBubbles(width, height) {
        this.bubbles.forEach(bubble => {
            this.ctx.save();
            
            // Set opacity based on bubble life
            this.ctx.globalAlpha = bubble.life * 0.8;
            
            // Create radial gradient for bubble
            const gradient = this.ctx.createRadialGradient(
                bubble.x, bubble.y, 0,
                bubble.x, bubble.y, bubble.size
            );
            
            const hue = bubble.hue + this.time * 20;
            gradient.addColorStop(0, `hsla(${hue}, 70%, 60%, 0.8)`);
            gradient.addColorStop(0.7, `hsla(${hue + 20}, 60%, 50%, 0.4)`);
            gradient.addColorStop(1, `hsla(${hue + 40}, 50%, 40%, 0)`);
            
            // Draw bubble with glow
            this.ctx.shadowBlur = 20;
            this.ctx.shadowColor = `hsla(${hue}, 70%, 60%, 0.6)`;
            
            this.ctx.beginPath();
            this.ctx.arc(bubble.x, bubble.y, Math.max(1, bubble.size), 0, Math.PI * 2);
            this.ctx.fillStyle = gradient;
            this.ctx.fill();
            
            // Add inner highlight
            this.ctx.shadowBlur = 0;
            this.ctx.beginPath();
            this.ctx.arc(
                bubble.x - bubble.size * 0.3,
                bubble.y - bubble.size * 0.3,
                Math.max(0.5, bubble.size * 0.2),
                0, Math.PI * 2
            );
            this.ctx.fillStyle = `hsla(${hue}, 30%, 80%, ${bubble.life * 0.5})`;
            this.ctx.fill();
            
            this.ctx.restore();
        });
    }

    renderMinimalTrackInfo(width, height) {
        if (!this.currentTrack) return;
        
        this.ctx.save();
        
        // Subtle background for text
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        this.ctx.fillRect(20, height - 80, width - 40, 60);
        
        // Track name
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        this.ctx.font = 'bold 16px Inter, sans-serif';
        this.ctx.fillText(this.currentTrack.name, 30, height - 50);
        
        // Artist name
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
        this.ctx.font = '12px Inter, sans-serif';
        const artists = this.currentTrack.artists.map(a => a.name).join(', ');
        this.ctx.fillText(artists, 30, height - 30);
        
        this.ctx.restore();
    }


    renderPerformanceInfo(width, height) {
        // Only show in development or debug mode
        if (!window.location.hostname.includes('localhost') && 
            !window.location.search.includes('debug')) return;
            
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        this.ctx.fillRect(width - 120, height - 60, 100, 40);
        
        this.ctx.fillStyle = this.fps >= 50 ? '#1DB954' : this.fps >= 30 ? '#ffc107' : '#ff6b6b';
        this.ctx.font = '12px Inter, sans-serif';
        this.ctx.fillText(`FPS: ${this.fps}`, width - 110, height - 40);
        
        this.ctx.fillStyle = '#b3b3b3';
        this.ctx.fillText(`Frames: ${this.frameCount}`, width - 110, height - 25);
    }

    handleTokenError() {
        console.error('🚫 Spotify token expired or invalid');
        // You might want to trigger a re-authentication here
        // For now, just stop the visualizer
        this.stop();
        
        // Update UI to show error
        const statusText = document.getElementById('status-text');
        if (statusText) {
            statusText.textContent = 'Token expiré - reconnectez-vous';
        }
    }

    // Public API methods
    setVisualizationMode(mode) {
        this.visualizationMode = mode;
        console.log('Visualization mode:', mode);
    }

    getVisualizationData() {
        return {
            beatIntensity: this.beatIntensity,
            melodyIntensity: this.melodyIntensity,
            bassIntensity: this.bassIntensity,
            bubbleCount: this.bubbles.length,
            amplitude: this.amplitude,
            isPlaying: this.playbackState?.is_playing || false,
            currentTrack: this.currentTrack,
            audioFeatures: this.audioFeatures
        };
    }
}

// Export for use in other modules
window.MusicVisualizer = MusicVisualizer;