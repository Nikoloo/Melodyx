/**
 * Real Audio Analyzer - Capture and analyze real-time audio
 * Uses Web Audio API to capture microphone input and analyze frequencies
 */

class RealAudioAnalyzer {
    constructor() {
        this.audioContext = null;
        this.microphone = null;
        this.analyser = null;
        this.dataArray = null;
        this.bufferLength = 0;
        
        this.isActive = false;
        this.isListening = false;
        
        // Analysis data
        this.frequencyData = new Array(64).fill(0);
        this.timeDomainData = new Array(256).fill(0);
        this.volume = 0;
        this.bassLevel = 0;
        this.midLevel = 0;
        this.trebleLevel = 0;
        
        // Beat detection
        this.beatThreshold = 0.3;
        this.lastBeatTime = 0;
        this.beatHistory = [];
        this.energyHistory = [];
        
        // Smoothing
        this.smoothingFactor = 0.8;
    }

    async requestAudioCapture() {
        try {
            console.log('🔊 Requesting tab audio capture...');
            
            // Check browser support
            if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
                console.warn('⚠️ getDisplayMedia not supported, using microphone');
                return this.requestMicrophoneAccess();
            }
            
            // First try to capture tab audio directly
            try {
                const stream = await navigator.mediaDevices.getDisplayMedia({
                    video: false,
                    audio: {
                        echoCancellation: false,
                        autoGainControl: false,
                        noiseSuppression: false,
                        latency: 0
                    }
                });
                
                // Check if audio tracks are available
                const audioTracks = stream.getAudioTracks();
                if (audioTracks.length === 0) {
                    console.warn('⚠️ No audio tracks in screen capture, trying microphone');
                    stream.getTracks().forEach(track => track.stop());
                    return this.requestMicrophoneAccess();
                }
                
                console.log('✅ Tab audio capture granted');
                return stream;
            } catch (displayError) {
                console.warn('⚠️ Tab audio capture failed, trying microphone fallback:', displayError);
                return this.requestMicrophoneAccess();
            }
            
        } catch (error) {
            console.error('❌ Audio access denied:', error);
            throw new Error('Audio access required for real-time visualization');
        }
    }

    async requestMicrophoneAccess() {
        try {
            console.log('🎤 Requesting microphone access...');
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: false,
                    autoGainControl: false,
                    noiseSuppression: false,
                    latency: 0
                }
            });
            
            console.log('✅ Microphone access granted');
            return stream;
        } catch (error) {
            console.error('❌ Microphone access denied:', error);
            throw new Error('Microphone access required for real-time visualization');
        }
    }

    async initialize() {
        try {
            // Get audio stream (tab audio or microphone fallback)
            const stream = await this.requestAudioCapture();
            
            // Create audio context
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            console.log('🎵 Audio context created, sample rate:', this.audioContext.sampleRate);
            
            // Create microphone source
            this.microphone = this.audioContext.createMediaStreamSource(stream);
            
            // Create analyser node
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 512; // Higher resolution for better frequency analysis
            this.analyser.smoothingTimeConstant = 0.3;
            this.analyser.minDecibels = -90;
            this.analyser.maxDecibels = -10;
            
            // Connect microphone to analyser
            this.microphone.connect(this.analyser);
            
            // Setup data arrays
            this.bufferLength = this.analyser.frequencyBinCount;
            this.dataArray = new Uint8Array(this.bufferLength);
            this.timeDomainArray = new Uint8Array(this.bufferLength);
            
            console.log('🔊 Audio analyzer initialized with', this.bufferLength, 'frequency bins');
            
            this.isActive = true;
            return true;
            
        } catch (error) {
            console.error('❌ Failed to initialize audio analyzer:', error);
            throw error;
        }
    }

    startListening() {
        if (!this.isActive) {
            throw new Error('Audio analyzer not initialized');
        }
        
        this.isListening = true;
        console.log('👂 Started listening to real-time audio');
        this.analyzeAudio();
    }

    stopListening() {
        this.isListening = false;
        console.log('⏹️ Stopped listening to audio');
    }

    analyzeAudio() {
        if (!this.isListening || !this.analyser) return;
        
        // Get frequency data
        this.analyser.getByteFrequencyData(this.dataArray);
        
        // Get time domain data for waveform
        this.analyser.getByteTimeDomainData(this.timeDomainArray);
        
        // Process frequency data
        this.processFrequencyData();
        
        // Process time domain data for beat detection
        this.processTimeDomainData();
        
        // Detect beats
        this.detectBeats();
        
        // Continue analysis
        requestAnimationFrame(() => this.analyzeAudio());
    }

    processFrequencyData() {
        const bands = 64; // Number of frequency bands we want
        const bandSize = Math.floor(this.bufferLength / bands);
        
        // Group frequencies into bands
        for (let i = 0; i < bands; i++) {
            let sum = 0;
            const startIndex = i * bandSize;
            const endIndex = Math.min(startIndex + bandSize, this.bufferLength);
            
            for (let j = startIndex; j < endIndex; j++) {
                sum += this.dataArray[j];
            }
            
            const average = sum / (endIndex - startIndex);
            const normalized = average / 255.0;
            
            // Apply smoothing
            this.frequencyData[i] = this.frequencyData[i] * this.smoothingFactor + 
                                   normalized * (1 - this.smoothingFactor);
        }
        
        // Calculate frequency ranges
        this.bassLevel = this.getFrequencyRangeLevel(0, 8);     // Low frequencies
        this.midLevel = this.getFrequencyRangeLevel(8, 24);     // Mid frequencies  
        this.trebleLevel = this.getFrequencyRangeLevel(24, 64); // High frequencies
        
        // Calculate overall volume
        this.volume = (this.bassLevel + this.midLevel + this.trebleLevel) / 3;
    }

    processTimeDomainData() {
        // Convert time domain data for waveform visualization
        for (let i = 0; i < Math.min(256, this.timeDomainArray.length); i++) {
            // Convert from 0-255 to -1 to 1
            this.timeDomainData[i] = (this.timeDomainArray[i] - 128) / 128.0;
        }
    }

    getFrequencyRangeLevel(startBand, endBand) {
        let sum = 0;
        let count = 0;
        
        for (let i = startBand; i < Math.min(endBand, this.frequencyData.length); i++) {
            sum += this.frequencyData[i];
            count++;
        }
        
        return count > 0 ? sum / count : 0;
    }

    detectBeats() {
        const currentEnergy = this.bassLevel * 0.6 + this.midLevel * 0.4;
        
        // Add to energy history
        this.energyHistory.push(currentEnergy);
        if (this.energyHistory.length > 43) { // ~1 second at 60fps
            this.energyHistory.shift();
        }
        
        // Calculate average energy
        const avgEnergy = this.energyHistory.reduce((a, b) => a + b, 0) / this.energyHistory.length;
        
        // Calculate variance for dynamic threshold
        const variance = this.energyHistory.reduce((sum, energy) => {
            return sum + Math.pow(energy - avgEnergy, 2);
        }, 0) / this.energyHistory.length;
        
        const sensitivity = 1.3; // Adjust beat sensitivity
        const threshold = avgEnergy + sensitivity * Math.sqrt(variance);
        
        // Detect beat
        const now = Date.now();
        const timeSinceLastBeat = now - this.lastBeatTime;
        
        if (currentEnergy > threshold && 
            currentEnergy > this.beatThreshold && 
            timeSinceLastBeat > 200) { // Minimum 200ms between beats
            
            this.onBeatDetected(currentEnergy);
            this.lastBeatTime = now;
            
            // Add to beat history for tempo calculation
            this.beatHistory.push(now);
            if (this.beatHistory.length > 8) {
                this.beatHistory.shift();
            }
        }
    }

    onBeatDetected(intensity) {
        // This will be called by the visualizer
        console.log('🥁 Beat detected with intensity:', intensity.toFixed(2));
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

    // Public API for the visualizer
    getAnalysisData() {
        return {
            frequencyData: [...this.frequencyData],
            timeDomainData: [...this.timeDomainData],
            volume: this.volume,
            bassLevel: this.bassLevel,
            midLevel: this.midLevel,
            trebleLevel: this.trebleLevel,
            tempo: this.calculateTempo(),
            isListening: this.isListening,
            isActive: this.isActive
        };
    }

    // Cleanup
    destroy() {
        this.stopListening();
        
        if (this.microphone) {
            this.microphone.disconnect();
        }
        
        if (this.audioContext && this.audioContext.state !== 'closed') {
            this.audioContext.close();
        }
        
        this.isActive = false;
        console.log('🔇 Audio analyzer destroyed');
    }
}

// Export for use
window.RealAudioAnalyzer = RealAudioAnalyzer;