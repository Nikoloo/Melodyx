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
        this.frequencyData = new Array(64).fill(0);
        this.waveformData = new Array(128).fill(0);
        this.time = 0;
        this.amplitude = 0;
        
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
        // Initialize with default neutral values
        this.frequencyData = this.frequencyData.map(() => Math.random() * 0.1);
        this.waveformData = this.waveformData.map(() => Math.random() * 0.05);
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

        // Generate simulated audio data based on playback state and features
        if (this.playbackState?.is_playing && this.currentTrack) {
            const progress = this.playbackState.progress_ms / this.currentTrack.duration_ms;
            
            // Use audio features if available, otherwise use smart fallbacks
            let energy, danceability, tempo, valence;
            
            if (this.audioFeatures) {
                ({ energy, danceability, tempo, valence } = this.audioFeatures);
                
                if (this.audioFeatures.fallback) {
                    console.log('🎨 Using fallback visualization mode');
                    // Add some variation to fallback values based on song progress
                    energy = 0.5 + Math.sin(progress * Math.PI * 4) * 0.3;
                    danceability = 0.4 + Math.sin(progress * Math.PI * 2) * 0.3;
                    tempo = 120 + Math.sin(this.time * 0.1) * 20;
                    valence = 0.5 + Math.sin(progress * Math.PI) * 0.3;
                }
            } else {
                // Fully dynamic fallback based on song timing
                energy = 0.5 + Math.sin(progress * Math.PI * 3) * 0.4;
                danceability = 0.4 + Math.cos(progress * Math.PI * 2) * 0.4;
                tempo = 120 + Math.sin(this.time * 0.05) * 30;
                valence = 0.3 + Math.sin(progress * Math.PI) * 0.5;
            }
            
            // Calculate intensity based on song progress and features
            const baseIntensity = energy * 0.8 + danceability * 0.6;
            const tempoFactor = Math.min(tempo / 120, 2); // Normalize around 120 BPM
            const progressIntensity = Math.sin(progress * Math.PI) * 0.4; // Peak in middle
            
            this.amplitude = Math.max(0.1, baseIntensity + progressIntensity);
            
            // Generate frequency bars with more dynamic behavior
            for (let i = 0; i < this.frequencyData.length; i++) {
                const frequency = i / this.frequencyData.length;
                const bassBoost = frequency < 0.1 ? 2.5 : 1;
                const midBoost = frequency > 0.1 && frequency < 0.6 ? 1.8 : 1;
                const trebleBoost = frequency > 0.8 ? 1.3 : 1;
                
                // Create more complex wave patterns
                const wave1 = Math.sin(this.time * tempoFactor + i * 0.15) * this.amplitude;
                const wave2 = Math.sin(this.time * tempoFactor * 0.7 + i * 0.1) * this.amplitude * 0.5;
                const noise = (Math.random() - 0.5) * 0.15 * energy;
                
                const combinedWave = (wave1 + wave2 + noise) * bassBoost * midBoost * trebleBoost;
                
                this.frequencyData[i] = Math.max(0.05, 
                    Math.min(1, combinedWave * 0.4 + 0.15)
                );
            }
            
            // Generate waveform with more variation
            for (let i = 0; i < this.waveformData.length; i++) {
                const phase1 = (this.time * tempoFactor * 2) + (i / this.waveformData.length) * Math.PI * 2;
                const phase2 = (this.time * tempoFactor * 1.3) + (i / this.waveformData.length) * Math.PI * 3;
                
                const wave1 = Math.sin(phase1) * this.amplitude * valence;
                const wave2 = Math.sin(phase2) * this.amplitude * energy * 0.3;
                
                this.waveformData[i] = (wave1 + wave2) * 0.4;
            }
        } else {
            // Idle animation when not playing
            this.amplitude *= 0.95; // Decay
            for (let i = 0; i < this.frequencyData.length; i++) {
                this.frequencyData[i] *= 0.98;
                this.frequencyData[i] += Math.random() * 0.02;
            }
            
            // Gentle waveform when idle
            for (let i = 0; i < this.waveformData.length; i++) {
                this.waveformData[i] *= 0.99;
            }
        }
    }

    render() {
        const { width, height } = this.canvas.getBoundingClientRect();
        
        // Clear canvas with gradient background
        const gradient = this.ctx.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0, this.colors.background);
        gradient.addColorStop(1, '#1a1a1a');
        
        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(0, 0, width, height);
        
        // Render frequency bars
        this.renderFrequencyBars(width, height);
        
        // Render central waveform
        this.renderWaveform(width, height);
        
        // Render track info overlay
        this.renderTrackInfo(width, height);
        
        // Render performance info (debug mode)
        if (this.frameCount % 120 === 0) { // Update every 2 seconds
            this.renderPerformanceInfo(width, height);
        }
    }

    renderFrequencyBars(width, height) {
        const barWidth = width / this.frequencyData.length;
        const maxBarHeight = height * 0.6;
        
        this.ctx.shadowBlur = 20;
        this.ctx.shadowColor = this.colors.primary;
        
        for (let i = 0; i < this.frequencyData.length; i++) {
            const barHeight = this.frequencyData[i] * maxBarHeight;
            const x = i * barWidth;
            const y = height - barHeight;
            
            // Create gradient for each bar
            const barGradient = this.ctx.createLinearGradient(0, y, 0, height);
            barGradient.addColorStop(0, this.colors.secondary);
            barGradient.addColorStop(0.5, this.colors.primary);
            barGradient.addColorStop(1, this.colors.accent);
            
            this.ctx.fillStyle = barGradient;
            this.ctx.fillRect(x + 2, y, barWidth - 4, barHeight);
        }
        
        this.ctx.shadowBlur = 0;
    }

    renderWaveform(width, height) {
        const centerY = height / 2;
        const waveHeight = height * 0.2;
        
        this.ctx.strokeStyle = this.colors.primary;
        this.ctx.lineWidth = 3;
        this.ctx.lineCap = 'round';
        this.ctx.shadowBlur = 10;
        this.ctx.shadowColor = this.colors.primary;
        
        this.ctx.beginPath();
        
        for (let i = 0; i < this.waveformData.length; i++) {
            const x = (i / this.waveformData.length) * width;
            const y = centerY + this.waveformData[i] * waveHeight;
            
            if (i === 0) {
                this.ctx.moveTo(x, y);
            } else {
                this.ctx.lineTo(x, y);
            }
        }
        
        this.ctx.stroke();
        this.ctx.shadowBlur = 0;
    }

    renderTrackInfo(width, height) {
        if (!this.currentTrack) return;
        
        // Semi-transparent overlay
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.ctx.fillRect(20, 20, width - 40, 80);
        
        // Track name
        this.ctx.fillStyle = this.colors.primary;
        this.ctx.font = 'bold 18px Inter, sans-serif';
        this.ctx.fillText(this.currentTrack.name, 40, 50);
        
        // Artist name
        this.ctx.fillStyle = '#b3b3b3';
        this.ctx.font = '14px Inter, sans-serif';
        const artists = this.currentTrack.artists.map(a => a.name).join(', ');
        this.ctx.fillText(artists, 40, 75);
        
        // Audio features (if available)
        if (this.audioFeatures) {
            this.ctx.fillStyle = this.audioFeatures.fallback ? '#ffc107' : this.colors.secondary;
            this.ctx.font = '12px Inter, sans-serif';
            const features = `Energy: ${Math.round(this.audioFeatures.energy * 100)}% | ` +
                           `Tempo: ${Math.round(this.audioFeatures.tempo)} BPM` +
                           (this.audioFeatures.fallback ? ' (Simulé)' : '');
            this.ctx.fillText(features, 40, 90);
        }
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
            frequencyData: [...this.frequencyData],
            waveformData: [...this.waveformData],
            amplitude: this.amplitude,
            isPlaying: this.playbackState?.is_playing || false,
            currentTrack: this.currentTrack,
            audioFeatures: this.audioFeatures
        };
    }
}

// Export for use in other modules
window.MusicVisualizer = MusicVisualizer;