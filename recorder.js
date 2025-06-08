/**
 * Recorder.js
 * Handles audio recording functionality using the MediaRecorder API
 */

class AudioRecorder {
    constructor() {
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.audioBlob = null;
        this.audioUrl = null;
        this.audioElement = null;
        this.stream = null;
        this.analyser = null;
        this.maxRecordingTime = 120000; // 2 minutes in milliseconds
        this.recordingTimer = null;
        this.recordingStartTime = 0;
        this.visualizerCanvas = null;
        this.visualizerContext = null;
        this.isRecording = false;
    }

    /**
     * Initialize the recorder with necessary DOM elements
     * @param {Object} options - Configuration options
     */
    initialize(options = {}) {
        this.visualizerCanvas = document.getElementById('visualizer');
        this.visualizerContext = this.visualizerCanvas.getContext('2d');
        
        // Create hidden audio element for playback
        this.audioElement = document.createElement('audio');
        this.audioElement.style.display = 'none';
        document.body.appendChild(this.audioElement);
        
        // Set canvas dimensions
        this.resizeCanvas();
        window.addEventListener('resize', () => this.resizeCanvas());
    }

    /**
     * Resize the visualizer canvas
     */
    resizeCanvas() {
        if (this.visualizerCanvas) {
            this.visualizerCanvas.width = this.visualizerCanvas.offsetWidth;
            this.visualizerCanvas.height = this.visualizerCanvas.offsetHeight;
        }
    }

    /**
     * Start recording audio
     * @returns {Promise} - Resolves when recording starts
     */
    async startRecording() {
        if (this.isRecording) return;
        
        try {
            // Request microphone access
            this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            
            // Set up audio context for visualization
            const audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.analyser = audioContext.createAnalyser();
            const source = audioContext.createMediaStreamSource(this.stream);
            source.connect(this.analyser);
            this.analyser.fftSize = 256;
            
            // Configure MediaRecorder
            this.mediaRecorder = new MediaRecorder(this.stream);
            this.audioChunks = [];
            
            // Handle data available event
            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            };
            
            // Start recording
            this.mediaRecorder.start();
            this.isRecording = true;
            this.recordingStartTime = Date.now();
            
            // Start timer and visualizer
            this.startTimer();
            this.visualize();
            
            // Set maximum recording time (2 minutes)
            setTimeout(() => {
                if (this.isRecording) {
                    this.stopRecording();
                }
            }, this.maxRecordingTime);
            
            return Promise.resolve();
        } catch (error) {
            console.error('Error starting recording:', error);
            return Promise.reject(error);
        }
    }

    /**
     * Stop recording audio
     * @returns {Promise} - Resolves with the audio blob when recording stops
     */
    stopRecording() {
        if (!this.isRecording || !this.mediaRecorder) {
            return Promise.resolve(null);
        }
        
        return new Promise((resolve) => {
            this.mediaRecorder.onstop = () => {
                // Create audio blob from chunks
                this.audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
                this.audioUrl = URL.createObjectURL(this.audioBlob);
                
                // Set up audio element for playback
                this.audioElement.src = this.audioUrl;
                
                // Stop timer and visualizer
                this.stopTimer();
                this.stopVisualization();
                
                // Clean up
                this.isRecording = false;
                
                resolve(this.audioBlob);
            };
            
            // Stop recording
            this.mediaRecorder.stop();
            
            // Stop all tracks in the stream
            if (this.stream) {
                this.stream.getTracks().forEach(track => track.stop());
            }
        });
    }

    /**
     * Play the recorded audio
     */
    playRecording() {
        if (this.audioElement && this.audioUrl) {
            this.audioElement.play();
            return true;
        }
        return false;
    }

    /**
     * Get the recorded audio blob
     * @returns {Blob|null} - The audio blob or null if no recording
     */
    getAudioBlob() {
        return this.audioBlob;
    }

    /**
     * Start the recording timer
     */
    startTimer() {
        const timerElement = document.getElementById('timer');
        if (!timerElement) return;
        
        this.recordingStartTime = Date.now();
        
        this.recordingTimer = setInterval(() => {
            const elapsedTime = Date.now() - this.recordingStartTime;
            const seconds = Math.floor((elapsedTime / 1000) % 60).toString().padStart(2, '0');
            const minutes = Math.floor((elapsedTime / 1000 / 60) % 60).toString().padStart(2, '0');
            
            timerElement.textContent = `${minutes}:${seconds}`;
            
            // Auto-stop at 2 minutes
            if (elapsedTime >= this.maxRecordingTime) {
                this.stopRecording();
            }
        }, 1000);
    }

    /**
     * Stop the recording timer
     */
    stopTimer() {
        if (this.recordingTimer) {
            clearInterval(this.recordingTimer);
            this.recordingTimer = null;
        }
    }

    /**
     * Visualize the audio input
     */
    visualize() {
        if (!this.analyser || !this.visualizerContext) return;
        
        const bufferLength = this.analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        
        const width = this.visualizerCanvas.width;
        const height = this.visualizerCanvas.height;
        
        const draw = () => {
            if (!this.isRecording) return;
            
            requestAnimationFrame(draw);
            
            this.analyser.getByteFrequencyData(dataArray);
            
            this.visualizerContext.fillStyle = '#f9f9f9';
            this.visualizerContext.fillRect(0, 0, width, height);
            
            const barWidth = (width / bufferLength) * 2.5;
            let x = 0;
            
            for (let i = 0; i < bufferLength; i++) {
                const barHeight = dataArray[i] / 255 * height;
                
                this.visualizerContext.fillStyle = `rgb(${dataArray[i]}, 50, 50)`;
                this.visualizerContext.fillRect(x, height - barHeight, barWidth, barHeight);
                
                x += barWidth + 1;
            }
        };
        
        draw();
    }

    /**
     * Stop the visualization
     */
    stopVisualization() {
        if (this.visualizerContext) {
            this.visualizerContext.clearRect(
                0, 
                0, 
                this.visualizerCanvas.width, 
                this.visualizerCanvas.height
            );
        }
    }

    /**
     * Reset the recorder state
     */
    reset() {
        this.stopRecording();
        this.audioChunks = [];
        this.audioBlob = null;
        
        if (this.audioUrl) {
            URL.revokeObjectURL(this.audioUrl);
            this.audioUrl = null;
        }
        
        if (this.audioElement) {
            this.audioElement.src = '';
        }
        
        const timerElement = document.getElementById('timer');
        if (timerElement) {
            timerElement.textContent = '00:00';
        }
        
        this.stopVisualization();
    }
}

// Export the AudioRecorder class
window.AudioRecorder = AudioRecorder;