/**
 * Music Visualizer for Melodyx
 * Creates real-time visualizations using direct audio analysis with Web Audio API
 * @author Melodyx Team
 */

class MusicVisualizer {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.isActive = false;
        this.animationFrameId = null;
        
        // Real-time audio analysis
        this.audioContext = null;
        this.microphone = null;
        this.analyser = null;
        this.frequencyData = null;
        this.timeData = null;
        this.bufferLength = 0;
        
        // Animation parameters
        this.time = 0;
        this.amplitude = 0;
        
        // Audio frequency analysis
        this.bassLevel = 0;
        this.midLevel = 0;
        this.trebleLevel = 0;
        this.volume = 0;
        this.smoothedBass = 0;
        this.smoothedMid = 0;
        this.smoothedTreble = 0;
        
        // Beat detection system
        this.beatThreshold = 0.15;
        this.lastBeatTime = 0;
        this.beatIntensity = 0;
        this.energyHistory = [];
        this.beatHistory = [];
        this.bubbles = [];
        
        // Flowing wave system for melody
        this.wavePoints = [];
        this.melodyIntensity = 0;
        
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
        
        // Smoothing factors
        this.smoothingFactor = 0.7;
        this.beatSmoothingFactor = 0.85;
        
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
        
        console.log('🎵 Starting music visualizer...');
        
        try {
            await this.initializeAudioContext();
            this.isActive = true;
            this.startVisualizationLoop();
        } catch (error) {
            console.error('❌ Failed to start visualizer:', error);
            throw error;
        }
    }

    stop() {
        this.isActive = false;
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
        }
        console.log('⏹️ Music visualizer stopped');
    }

    stop() {
        this.isActive = false;
        
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
        }
        
        // Clean up audio context
        if (this.microphone) {
            this.microphone.disconnect();
        }
        
        if (this.audioContext && this.audioContext.state !== 'closed') {
            this.audioContext.close();
        }
        
        console.log('⏹️ Music visualizer stopped');
    }

    async initializeAudioContext() {
        try {
            // Request audio capture from browser tab or microphone
            const stream = await this.requestAudioAccess();
            
            // Create audio context
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            console.log('🔊 Audio context created, sample rate:', this.audioContext.sampleRate);
            
            // Create source from stream
            this.microphone = this.audioContext.createMediaStreamSource(stream);
            
            // Create analyser node
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 1024;
            this.analyser.smoothingTimeConstant = 0.3;
            this.analyser.minDecibels = -90;
            this.analyser.maxDecibels = -10;
            
            // Connect microphone to analyser
            this.microphone.connect(this.analyser);
            
            // Setup data arrays
            this.bufferLength = this.analyser.frequencyBinCount;
            this.frequencyData = new Uint8Array(this.bufferLength);
            this.timeData = new Uint8Array(this.bufferLength);
            
            console.log('✅ Audio analyzer initialized with', this.bufferLength, 'frequency bins');
            
        } catch (error) {
            console.error('❌ Failed to initialize audio context:', error);
            throw new Error('Audio access required for real-time visualization');
        }
    }

    async requestAudioAccess() {
        try {
            console.log('🔊 Requesting system/tab audio capture...');
            
            // First priority: Try to capture tab/system audio via screen sharing
            if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
                try {
                    console.log('📺 Requesting screen share for audio capture...');
                    console.log('📝 Instructions: Sélectionnez "Partager l\'audio de l\'onglet" dans la popup');
                    
                    const stream = await navigator.mediaDevices.getDisplayMedia({
                        video: {
                            mediaSource: 'screen',
                            width: { max: 1 },
                            height: { max: 1 },
                            frameRate: { max: 1 }
                        },
                        audio: {
                            echoCancellation: false,
                            autoGainControl: false,
                            noiseSuppression: false,
                            latency: 0,
                            sampleRate: 44100
                        }
                    });
                    
                    const audioTracks = stream.getAudioTracks();
                    if (audioTracks.length > 0) {
                        console.log('✅ System/tab audio capture granted');
                        console.log('🎵 Audio source:', audioTracks[0].label);
                        
                        // Stop video track since we only need audio
                        const videoTracks = stream.getVideoTracks();
                        videoTracks.forEach(track => {
                            track.stop();
                            stream.removeTrack(track);
                        });
                        
                        return stream;
                    } else {
                        console.warn('⚠️ No audio tracks in screen capture');
                        stream.getTracks().forEach(track => track.stop());
                    }
                } catch (displayError) {
                    console.warn('⚠️ Screen audio capture failed:', displayError.message);
                    
                    // Try system audio capture for Windows/ChromeOS
                    if (displayError.name !== 'NotAllowedError') {
                        try {
                            console.log('🔊 Trying system audio capture...');
                            const systemStream = await navigator.mediaDevices.getDisplayMedia({
                                video: true,
                                audio: {
                                    echoCancellation: false,
                                    autoGainControl: false,
                                    noiseSuppression: false,
                                    latency: 0,
                                    sampleRate: 44100
                                }
                            });
                            
                            const audioTracks = systemStream.getAudioTracks();
                            if (audioTracks.length > 0) {
                                console.log('✅ System audio capture granted');
                                
                                // Stop video track
                                const videoTracks = systemStream.getVideoTracks();
                                videoTracks.forEach(track => {
                                    track.stop();
                                    systemStream.removeTrack(track);
                                });
                                
                                return systemStream;
                            }
                        } catch (systemError) {
                            console.warn('⚠️ System audio capture failed:', systemError.message);
                        }
                    }
                }
            }
            
            // Last resort: Fallback to microphone
            console.log('🎤 Falling back to microphone access...');
            console.warn('⚠️ Using microphone instead of system audio - music may not be captured correctly');
            
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: false,
                    autoGainControl: false,
                    noiseSuppression: false,
                    latency: 0,
                    sampleRate: 44100
                }
            });
            
            console.log('✅ Microphone access granted');
            return stream;
            
        } catch (error) {
            console.error('❌ All audio access methods failed:', error);
            throw new Error(`Audio access required for real-time visualization. Error: ${error.message}`);
        }
    }

    analyzeAudio() {
        if (!this.isActive || !this.analyser) return;
        
        // Get frequency data
        this.analyser.getByteFrequencyData(this.frequencyData);
        this.analyser.getByteTimeDomainData(this.timeData);
        
        // Process frequency bands
        this.processFrequencyBands();
        
        // Detect beats
        this.detectBeats();
        
        // Continue analysis
        requestAnimationFrame(() => this.analyzeAudio());
    }
    
    processFrequencyBands() {
        const bassEnd = Math.floor(this.bufferLength * 0.1);
        const midEnd = Math.floor(this.bufferLength * 0.4);
        
        // Calculate frequency levels
        let bassSum = 0, midSum = 0, trebleSum = 0;
        let bassCount = 0, midCount = 0, trebleCount = 0;
        
        // Bass frequencies (0-10% of spectrum)
        for (let i = 0; i < bassEnd; i++) {
            bassSum += this.frequencyData[i];
            bassCount++;
        }
        
        // Mid frequencies (10-40% of spectrum)
        for (let i = bassEnd; i < midEnd; i++) {
            midSum += this.frequencyData[i];
            midCount++;
        }
        
        // Treble frequencies (40-100% of spectrum)
        for (let i = midEnd; i < this.bufferLength; i++) {
            trebleSum += this.frequencyData[i];
            trebleCount++;
        }
        
        // Normalize and smooth
        const rawBass = bassCount > 0 ? (bassSum / bassCount) / 255 : 0;
        const rawMid = midCount > 0 ? (midSum / midCount) / 255 : 0;
        const rawTreble = trebleCount > 0 ? (trebleSum / trebleCount) / 255 : 0;
        
        // Apply smoothing
        this.smoothedBass = this.smoothedBass * this.smoothingFactor + rawBass * (1 - this.smoothingFactor);
        this.smoothedMid = this.smoothedMid * this.smoothingFactor + rawMid * (1 - this.smoothingFactor);
        this.smoothedTreble = this.smoothedTreble * this.smoothingFactor + rawTreble * (1 - this.smoothingFactor);
        
        // Update levels
        this.bassLevel = this.smoothedBass;
        this.midLevel = this.smoothedMid;
        this.trebleLevel = this.smoothedTreble;
        this.volume = (this.bassLevel + this.midLevel + this.trebleLevel) / 3;
    }
    
    detectBeats() {
        const currentEnergy = this.bassLevel * 0.7 + this.midLevel * 0.3;
        
        // Add to energy history
        this.energyHistory.push(currentEnergy);
        if (this.energyHistory.length > 43) { // ~1 second at 60fps
            this.energyHistory.shift();
        }
        
        // Calculate average energy
        if (this.energyHistory.length < 10) return; // Wait for enough data
        
        const avgEnergy = this.energyHistory.reduce((a, b) => a + b, 0) / this.energyHistory.length;
        
        // Calculate variance for dynamic threshold
        const variance = this.energyHistory.reduce((sum, energy) => {
            return sum + Math.pow(energy - avgEnergy, 2);
        }, 0) / this.energyHistory.length;
        
        const sensitivity = 1.5;
        const threshold = avgEnergy + sensitivity * Math.sqrt(variance);
        
        // Detect beat
        const now = Date.now();
        const timeSinceLastBeat = now - this.lastBeatTime;
        
        if (currentEnergy > threshold && 
            currentEnergy > this.beatThreshold && 
            timeSinceLastBeat > 200) { // Minimum 200ms between beats
            
            this.triggerBeat(currentEnergy);
            this.lastBeatTime = now;
            
            // Add to beat history for tempo calculation
            this.beatHistory.push(now);
            if (this.beatHistory.length > 8) {
                this.beatHistory.shift();
            }
        }
    }

    updateVisualization() {
        this.time += 0.016; // ~60fps

        if (this.isActive && this.analyser) {
            // Update visualization from real-time audio analysis
            this.updateVisualizationFromAudio();
        } else {
            // Idle state - decay all effects
            this.beatIntensity *= 0.95;
            this.melodyIntensity *= 0.98;
            this.amplitude *= 0.95;
            
            // Remove old bubbles
            this.bubbles = this.bubbles.filter(bubble => bubble.life > 0.1);
        }
        
        // Update existing bubbles
        this.updateBubbles();
    }

    updateVisualizationFromAudio() {
        // Map audio levels to visualization parameters
        const energy = this.volume * 0.8 + this.bassLevel * 0.7;
        const tempo = this.calculateTempo();
        const tempoFactor = tempo / 120;
        
        // Update flowing wave system based on frequency data
        this.updateFlowingWavesFromAudio(energy, tempoFactor);
        
        // Update global amplitude
        this.amplitude = Math.max(0.1, energy);
        
        // Update beat intensity (smooth decay)
        this.beatIntensity = Math.max(this.beatIntensity * this.beatSmoothingFactor, this.bassLevel);
        this.melodyIntensity = this.midLevel * 0.8 + this.trebleLevel * 0.6;
    }

    calculateTempo() {
        if (this.beatHistory.length < 2) return 120; // Default tempo
        
        const intervals = [];
        for (let i = 1; i < this.beatHistory.length; i++) {
            intervals.push(this.beatHistory[i] - this.beatHistory[i - 1]);
        }
        
        const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
        const bpm = Math.round(60000 / avgInterval);
        
        // Clamp to reasonable range
        return Math.max(60, Math.min(200, bpm));
    }

    startVisualizationLoop() {
        // Start audio analysis
        this.analyzeAudio();
        
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

    triggerBeat(intensity) {
        this.beatIntensity = Math.min(1, intensity * 2.0);
        
        // Only create bubbles in certain modes
        if (this.visualizationMode === 'minimal') return;
        
        // Create new bubble at random position
        const { width, height } = this.canvas.getBoundingClientRect();
        
        const bubbleCount = this.visualizationMode === 'intense' ? 3 : Math.ceil(intensity * 2);
        const maxBubbles = this.visualizationMode === 'intense' ? 25 : 15;
        
        for (let i = 0; i < bubbleCount; i++) {
            const bubble = {
                x: Math.random() * width,
                y: height * 0.3 + Math.random() * height * 0.4,
                size: Math.max(5, 15 + intensity * (this.visualizationMode === 'intense' ? 120 : 100)),
                maxSize: Math.max(15, 25 + intensity * (this.visualizationMode === 'intense' ? 180 : 150)),
                life: 1.0,
                intensity: intensity,
                hue: Math.random() * 80 + (this.visualizationMode === 'intense' ? 0 : 120),
                vel: {
                    x: (Math.random() - 0.5) * (this.visualizationMode === 'intense' ? 6 : 3) * intensity,
                    y: -Math.random() * 4 - 1 - intensity * 2
                }
            };
            
            this.bubbles.push(bubble);
        }
        
        // Limit number of bubbles
        if (this.bubbles.length > maxBubbles) {
            this.bubbles.splice(0, this.bubbles.length - maxBubbles);
        }
        
        console.log('🥁 Beat triggered with intensity:', intensity.toFixed(2));
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

    updateFlowingWavesFromAudio(energy, tempoFactor) {
        // Update melody intensity based on frequency analysis
        this.melodyIntensity = this.midLevel * 0.8 + this.trebleLevel * 0.6;
        
        // Generate flowing wave points from frequency data
        const numPoints = 80;
        this.wavePoints = [];
        
        for (let i = 0; i <= numPoints; i++) {
            const x = (i / numPoints);
            
            // Map frequency data to wave points
            const freqIndex = Math.floor((i / numPoints) * this.bufferLength);
            const amplitude = this.frequencyData[freqIndex] / 255 || 0;
            
            // Combine with smooth waves for organic look
            const wave1 = Math.sin(x * Math.PI * 4 + this.time * tempoFactor * 2) * amplitude * this.melodyIntensity;
            const wave2 = Math.sin(x * Math.PI * 6 + this.time * tempoFactor * 1.5) * amplitude * this.melodyIntensity * 0.7;
            const wave3 = Math.sin(x * Math.PI * 8 + this.time * tempoFactor * 3) * amplitude * this.melodyIntensity * 0.4;
            
            // Bass wave (slower, deeper)
            const bassWave = Math.sin(x * Math.PI * 2 + this.time * tempoFactor * 0.8) * this.bassLevel * 0.9;
            
            const y = (wave1 + wave2 + wave3 + bassWave) * 80;
            
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
        
        // 📊 Render real-time audio info
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
        
        // Dynamic colors based on real-time audio analysis
        const hue1 = 240 + this.bassLevel * 80; // Blue to purple based on bass
        const hue2 = 200 + this.trebleLevel * 60; // Blue to cyan based on treble
        
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
        this.ctx.globalAlpha = 0.05 + this.midLevel * 0.3;
        
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

    renderMinimalTrackInfo(width, height) {
        // Show real-time audio info instead of track info
        this.ctx.save();
        
        // Subtle background for text
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        this.ctx.fillRect(20, height - 100, width - 40, 80);
        
        // Audio levels
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        this.ctx.font = 'bold 14px Inter, sans-serif';
        this.ctx.fillText('Analyse Audio en Temps Réel', 30, height - 75);
        
        // Show frequency levels
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        this.ctx.font = '11px Inter, sans-serif';
        this.ctx.fillText(`Bass: ${(this.bassLevel * 100).toFixed(0)}%`, 30, height - 55);
        this.ctx.fillText(`Mid: ${(this.midLevel * 100).toFixed(0)}%`, 120, height - 55);
        this.ctx.fillText(`Treble: ${(this.trebleLevel * 100).toFixed(0)}%`, 210, height - 55);
        
        // Show tempo
        this.ctx.fillText(`Tempo: ${this.calculateTempo()} BPM`, 30, height - 35);
        this.ctx.fillText(`Volume: ${(this.volume * 100).toFixed(0)}%`, 150, height - 35);
        
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

    // Public API methods
    setVisualizationMode(mode) {
        this.visualizationMode = mode;
        console.log('Visualization mode:', mode);
    }

    getVisualizationData() {
        return {
            beatIntensity: this.beatIntensity,
            melodyIntensity: this.melodyIntensity,
            bassLevel: this.bassLevel,
            midLevel: this.midLevel,
            trebleLevel: this.trebleLevel,
            volume: this.volume,
            bubbleCount: this.bubbles.length,
            amplitude: this.amplitude,
            tempo: this.calculateTempo(),
            isActive: this.isActive
        };
    }
}

// Export for use in other modules
window.MusicVisualizer = MusicVisualizer;