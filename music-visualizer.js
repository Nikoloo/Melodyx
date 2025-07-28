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
        
        // Stars for background
        this.stars = [];
        this.initializeStars();
        
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
        
        // Synthwave 3D perspective settings
        this.camera = {
            fov: 60,
            near: 1,
            far: 1000,
            position: { x: 0, y: 5, z: 0 }
        };
        
        // Road grid settings
        this.roadGrid = {
            width: 40,
            depth: 60,
            segments: 20,
            speed: 0.1,
            offset: 0
        };
        
        // Retro sun settings
        this.retroSun = {
            x: 0,
            y: -8,
            z: -50,
            baseRadius: 15,
            segments: 20,
            pulseIntensity: 0
        };
        
        // Smoothing factors
        this.smoothingFactor = 0.7;
        this.beatSmoothingFactor = 0.85;
        
        this.setupCanvas();
        this.initializeVisuals();
    }
    
    initializeStars() {
        // Generate random stars for background
        this.stars = [];
        for (let i = 0; i < 200; i++) {
            this.stars.push({
                x: (Math.random() - 0.5) * 100,
                y: Math.random() * 30 - 5,
                z: (Math.random() - 0.5) * 100,
                brightness: Math.random(),
                twinkleSpeed: Math.random() * 0.02 + 0.01
            });
        }
    }
    
    // 3D to 2D projection system
    projectPoint3D(x, y, z, width, height) {
        // Perspective projection formula
        const distance = this.camera.fov;
        const scale = distance / (distance + z - this.camera.position.z);
        
        const screenX = (x - this.camera.position.x) * scale + width / 2;
        const screenY = (y - this.camera.position.y) * scale + height / 2;
        
        return {
            x: screenX,
            y: screenY,
            scale: scale,
            z: z
        };
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
        // Initialize synthwave visualization system
        this.beatIntensity = 0;
        this.melodyIntensity = 0;
        
        // Reset synthwave elements
        this.retroSun.pulseIntensity = 0;
        this.roadGrid.offset = 0;
        
        console.log('✅ Synthwave visualization system initialized');
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
            
            // Decay synthwave elements
            this.retroSun.pulseIntensity *= 0.9;
        }
        
        // Update stars twinkling
        this.updateStars();
    }

    updateVisualizationFromAudio() {
        // Map audio levels to synthwave visualization parameters
        const energy = this.volume * 0.8 + this.bassLevel * 0.7;
        const tempo = this.calculateTempo();
        const tempoFactor = tempo / 120;
        
        // Update synthwave elements based on frequency data
        this.updateSynthwaveElements(energy, tempoFactor);
        
        // Update global amplitude
        this.amplitude = Math.max(0.1, energy);
        
        // Update beat intensity (smooth decay)
        this.beatIntensity = Math.max(this.beatIntensity * this.beatSmoothingFactor, this.bassLevel);
        this.melodyIntensity = this.midLevel * 0.8 + this.trebleLevel * 0.6;
        
        // Update retro sun pulse with bass
        this.retroSun.pulseIntensity = this.bassLevel;
        
        // Update road grid animation
        this.roadGrid.offset += this.roadGrid.speed * (1 + energy * 0.5);
        if (this.roadGrid.offset > 1) {
            this.roadGrid.offset -= 1;
        }
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

    render3DRoadGrid(width, height) {
        const grid = this.generateRoadGrid(width, height);
        
        this.ctx.save();
        
        // Set up neon glow effect
        this.ctx.shadowBlur = 10 + this.bassLevel * 20;
        this.ctx.shadowColor = '#00ffff';
        this.ctx.strokeStyle = `hsla(180, 100%, 50%, ${0.6 + this.beatIntensity * 0.4})`;
        this.ctx.lineWidth = 1 + this.bassLevel * 2;
        this.ctx.lineCap = 'round';
        
        // Sort grid lines by depth (render far to near)
        grid.sort((a, b) => a.depth - b.depth);
        
        grid.forEach(line => {
            if (line.points.length > 1) {
                // Adjust opacity based on distance
                const depthAlpha = Math.max(0.1, Math.min(1, (50 + line.depth) / 50));
                this.ctx.globalAlpha = depthAlpha * (0.6 + this.beatIntensity * 0.4);
                
                // Draw the line
                this.ctx.beginPath();
                this.ctx.moveTo(line.points[0].x, line.points[0].y);
                
                for (let i = 1; i < line.points.length; i++) {
                    this.ctx.lineTo(line.points[i].x, line.points[i].y);
                }
                
                this.ctx.stroke();
            }
        });
        
        this.ctx.restore();
    }
    
    triggerBeat(intensity) {
        this.beatIntensity = Math.min(1, intensity * 2.0);
        
        // In synthwave mode, beats trigger visual effects on the grid and sun
        this.retroSun.pulseIntensity = Math.max(this.retroSun.pulseIntensity, intensity);
        
        console.log('🎆 Beat triggered with intensity:', intensity.toFixed(2));
    }

    updateStars() {
        this.stars.forEach(star => {
            // Update star twinkling based on treble frequencies
            star.brightness += Math.sin(this.time * star.twinkleSpeed) * 0.1 + this.trebleLevel * 0.3;
            star.brightness = Math.max(0.1, Math.min(1, star.brightness));
        });
    }
    
    updateSynthwaveElements(energy, tempoFactor) {
        // This method will be expanded for specific synthwave animations
        // For now, it's a placeholder for the synthwave update system
    }

    // Generate 3D road grid points
    generateRoadGrid(width, height) {
        const grid = [];
        const segments = this.roadGrid.segments;
        const gridWidth = this.roadGrid.width;
        const gridDepth = this.roadGrid.depth;
        
        // Generate horizontal lines (going into distance)
        for (let i = 0; i <= segments; i++) {
            const z = -i * (gridDepth / segments) + this.roadGrid.offset * (gridDepth / segments);
            const line = [];
            
            // Add vibration based on melody
            const vibration = Math.sin(this.time * 2 + i * 0.3) * this.melodyIntensity * 2;
            
            for (let j = -gridWidth/2; j <= gridWidth/2; j += 2) {
                const point3D = { x: j, y: vibration, z: z };
                const projected = this.projectPoint3D(point3D.x, point3D.y, point3D.z, width, height);
                
                if (projected.z > -50) { // Only render points not too far
                    line.push(projected);
                }
            }
            
            if (line.length > 0) {
                grid.push({ type: 'horizontal', points: line, depth: z });
            }
        }
        
        // Generate vertical lines (road edges)
        const roadEdges = [-gridWidth/2, -gridWidth/4, 0, gridWidth/4, gridWidth/2];
        
        roadEdges.forEach(x => {
            const line = [];
            for (let i = 0; i <= segments; i++) {
                const z = -i * (gridDepth / segments) + this.roadGrid.offset * (gridDepth / segments);
                const vibration = Math.sin(this.time * 2 + i * 0.3) * this.melodyIntensity * 2;
                
                const point3D = { x: x, y: vibration, z: z };
                const projected = this.projectPoint3D(point3D.x, point3D.y, point3D.z, width, height);
                
                if (projected.z > -50) {
                    line.push(projected);
                }
            }
            
            if (line.length > 0) {
                grid.push({ type: 'vertical', points: line, depth: line[0].z });
            }
        });
        
        return grid;
    }

    render() {
        const { width, height } = this.canvas.getBoundingClientRect();
        
        // Clear canvas with synthwave gradient background
        this.renderSynthwaveBackground(width, height);
        
        // 🎆 Render synthwave scene
        this.renderSynthwaveScene(width, height);
        
        // 📊 Render real-time audio info
        this.renderMinimalTrackInfo(width, height);
        
        // Render performance info (debug mode)
        if (this.frameCount % 120 === 0) {
            this.renderPerformanceInfo(width, height);
        }
    }

    renderSynthwaveBackground(width, height) {
        // Synthwave gradient: dark purple to magenta/cyan
        const gradient = this.ctx.createLinearGradient(0, 0, 0, height);
        
        // Dynamic colors based on audio
        const bassInfluence = this.bassLevel * 50;
        const trebleInfluence = this.trebleLevel * 30;
        
        // Classic synthwave colors with audio reactivity
        gradient.addColorStop(0, `hsla(280, 80%, ${5 + trebleInfluence}%, 1)`);
        gradient.addColorStop(0.3, `hsla(300, 70%, ${8 + bassInfluence}%, 1)`);
        gradient.addColorStop(0.7, `hsla(320, 60%, ${3 + this.midLevel * 20}%, 1)`);
        gradient.addColorStop(1, `hsla(280, 90%, 2%, 1)`);
        
        this.ctx.fillStyle = gradient;
        this.ctx.fillRect(0, 0, width, height);
        
        // Render stars
        this.renderStars(width, height);
    }

    renderStars(width, height) {
        this.ctx.save();
        
        this.stars.forEach(star => {
            const projected = this.projectPoint3D(star.x, star.y, star.z, width, height);
            
            if (projected.z > -80 && projected.x > 0 && projected.x < width && projected.y > 0 && projected.y < height) {
                const size = Math.max(0.5, projected.scale * star.brightness * 2);
                const alpha = Math.max(0.1, star.brightness * projected.scale);
                
                this.ctx.globalAlpha = alpha;
                this.ctx.fillStyle = `hsla(${180 + star.brightness * 60}, 70%, 80%, 1)`;
                
                this.ctx.beginPath();
                this.ctx.arc(projected.x, projected.y, size, 0, Math.PI * 2);
                this.ctx.fill();
            }
        });
        
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

    renderSynthwaveScene(width, height) {
        // Render retro sun
        this.renderRetroSun(width, height);
        
        // Render mountains silhouette
        this.renderMountains(width, height);
        
        // Render 3D road grid
        this.render3DRoadGrid(width, height);
    }

    renderRetroSun(width, height) {
        const sun = this.retroSun;
        const projected = this.projectPoint3D(sun.x, sun.y, sun.z, width, height);
        
        if (projected.z < -10) { // Only render if behind camera
            const baseRadius = sun.baseRadius * projected.scale;
            const pulsedRadius = baseRadius * (1 + sun.pulseIntensity * 0.5);
            
            this.ctx.save();
            
            // Create radial gradient for sun
            const gradient = this.ctx.createRadialGradient(
                projected.x, projected.y, 0,
                projected.x, projected.y, pulsedRadius
            );
            
            // Synthwave sun colors: orange to red to purple
            gradient.addColorStop(0, `hsla(20, 100%, ${70 + sun.pulseIntensity * 30}%, 1)`);
            gradient.addColorStop(0.4, `hsla(340, 90%, ${60 + sun.pulseIntensity * 20}%, 0.8)`);
            gradient.addColorStop(0.8, `hsla(300, 80%, ${40 + sun.pulseIntensity * 15}%, 0.4)`);
            gradient.addColorStop(1, 'hsla(280, 70%, 20%, 0)');
            
            // Draw main sun circle with glow
            this.ctx.shadowBlur = 30 + sun.pulseIntensity * 20;
            this.ctx.shadowColor = '#ff6b00';
            this.ctx.fillStyle = gradient;
            
            this.ctx.beginPath();
            this.ctx.arc(projected.x, projected.y, pulsedRadius, 0, Math.PI * 2);
            this.ctx.fill();
            
            // Draw horizontal scan lines
            this.ctx.shadowBlur = 0;
            this.ctx.strokeStyle = `hsla(20, 100%, 80%, ${0.3 + sun.pulseIntensity * 0.4})`;
            this.ctx.lineWidth = 1;
            
            for (let i = 0; i < sun.segments; i++) {
                const y = projected.y - pulsedRadius + (i / sun.segments) * (pulsedRadius * 2);
                const lineWidth = Math.sqrt(pulsedRadius * pulsedRadius - Math.pow(y - projected.y, 2)) * 2;
                
                if (lineWidth > 0) {
                    this.ctx.beginPath();
                    this.ctx.moveTo(projected.x - lineWidth/2, y);
                    this.ctx.lineTo(projected.x + lineWidth/2, y);
                    this.ctx.stroke();
                }
            }
            
            this.ctx.restore();
        }
    }

    renderMountains(width, height) {
        // Simple mountain silhouettes at the horizon
        const horizonY = height * 0.6;
        
        this.ctx.save();
        this.ctx.fillStyle = `hsla(280, 50%, ${5 + this.midLevel * 10}%, 0.8)`;
        
        // Create mountain silhouette path
        this.ctx.beginPath();
        this.ctx.moveTo(0, horizonY);
        
        // Generate mountain peaks with some audio reactivity
        for (let x = 0; x <= width; x += 20) {
            const peak = Math.sin(x * 0.01) * 40 + Math.sin(x * 0.003) * 80;
            const audioVariation = Math.sin(x * 0.02 + this.time) * this.trebleLevel * 20;
            this.ctx.lineTo(x, horizonY - peak - audioVariation);
        }
        
        this.ctx.lineTo(width, height);
        this.ctx.lineTo(0, height);
        this.ctx.closePath();
        this.ctx.fill();
        
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

    // Public API methods - Synthwave mode only
    setVisualizationMode(mode) {
        // Synthwave is the only mode now
        console.log('Synthwave mode active');
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