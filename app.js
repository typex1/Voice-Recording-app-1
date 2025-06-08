/**
 * Main application script for Voice Recording App
 * Handles UI interactions and AWS service integration
 */

document.addEventListener('DOMContentLoaded', () => {
    // Initialize variables
    const recorder = new AudioRecorder();
    const recordButton = document.getElementById('recordButton');
    const stopButton = document.getElementById('stopButton');
    const playButton = document.getElementById('playButton');
    const statusElement = document.getElementById('status');
    const transcriptionResult = document.getElementById('transcriptionResult');
    
    // API endpoint (to be replaced with actual API Gateway URL)
    const API_ENDPOINT = 'https://your-api-gateway-url.amazonaws.com/prod';
    
    // Initialize recorder
    recorder.initialize();
    
    // Event listeners
    recordButton.addEventListener('click', startRecording);
    stopButton.addEventListener('click', stopRecording);
    playButton.addEventListener('click', playRecording);
    
    /**
     * Start recording audio
     */
    async function startRecording() {
        try {
            updateStatus('Recording...');
            
            // Update button states
            recordButton.disabled = true;
            stopButton.disabled = false;
            playButton.disabled = true;
            
            // Clear previous transcription
            setTranscriptionPlaceholder('Recording in progress...');
            
            // Start recording
            await recorder.startRecording();
        } catch (error) {
            console.error('Failed to start recording:', error);
            updateStatus('Error: Could not access microphone');
            resetUI();
        }
    }
    
    /**
     * Stop recording audio and process it
     */
    async function stopRecording() {
        try {
            updateStatus('Processing recording...');
            
            // Update button states
            recordButton.disabled = false;
            stopButton.disabled = true;
            playButton.disabled = false;
            
            // Stop recording and get audio blob
            const audioBlob = await recorder.stopRecording();
            
            if (audioBlob) {
                // Upload and process the recording
                await processRecording(audioBlob);
            } else {
                updateStatus('No recording to process');
            }
        } catch (error) {
            console.error('Error stopping recording:', error);
            updateStatus('Error processing recording');
            resetUI();
        }
    }
    
    /**
     * Play the recorded audio
     */
    function playRecording() {
        const success = recorder.playRecording();
        if (success) {
            updateStatus('Playing recording...');
        } else {
            updateStatus('No recording to play');
        }
    }
    
    /**
     * Process the recording with AWS services
     * @param {Blob} audioBlob - The recorded audio blob
     */
    async function processRecording(audioBlob) {
        try {
            updateStatus('Uploading recording...');
            setTranscriptionPlaceholder('Transcribing audio...');
            
            // Step 1: Get pre-signed URL for upload
            const uploadUrlResponse = await fetch(`${API_ENDPOINT}/get-upload-url`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    contentType: audioBlob.type,
                    fileName: `recording-${Date.now()}.webm`
                })
            });
            
            if (!uploadUrlResponse.ok) {
                throw new Error('Failed to get upload URL');
            }
            
            const { uploadUrl, recordingId } = await uploadUrlResponse.json();
            
            // Step 2: Upload the audio file
            const uploadResponse = await fetch(uploadUrl, {
                method: 'PUT',
                body: audioBlob,
                headers: {
                    'Content-Type': audioBlob.type
                }
            });
            
            if (!uploadResponse.ok) {
                throw new Error('Failed to upload recording');
            }
            
            updateStatus('Transcribing audio...');
            
            // Step 3: Start transcription job
            const transcribeResponse = await fetch(`${API_ENDPOINT}/transcribe`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ recordingId })
            });
            
            if (!transcribeResponse.ok) {
                throw new Error('Failed to start transcription');
            }
            
            const { jobId } = await transcribeResponse.json();
            
            // Step 4: Poll for transcription results
            await pollTranscriptionStatus(jobId);
            
        } catch (error) {
            console.error('Error processing recording:', error);
            updateStatus('Error: ' + error.message);
            setTranscriptionPlaceholder('Transcription failed. Please try again.');
        }
    }
    
    /**
     * Poll for transcription job status
     * @param {string} jobId - The transcription job ID
     */
    async function pollTranscriptionStatus(jobId) {
        try {
            let completed = false;
            let attempts = 0;
            const maxAttempts = 30; // Maximum polling attempts
            
            while (!completed && attempts < maxAttempts) {
                attempts++;
                
                // Wait before polling again
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                // Check job status
                const statusResponse = await fetch(`${API_ENDPOINT}/transcription-status?jobId=${jobId}`);
                
                if (!statusResponse.ok) {
                    throw new Error('Failed to check transcription status');
                }
                
                const statusData = await statusResponse.json();
                
                if (statusData.status === 'COMPLETED') {
                    completed = true;
                    await displayTranscription(statusData.transcriptionId);
                } else if (statusData.status === 'FAILED') {
                    throw new Error('Transcription job failed');
                } else {
                    updateStatus(`Transcribing... (${attempts}/${maxAttempts})`);
                }
            }
            
            if (!completed) {
                throw new Error('Transcription timed out');
            }
            
        } catch (error) {
            console.error('Error polling transcription status:', error);
            updateStatus('Error: ' + error.message);
            setTranscriptionPlaceholder('Transcription failed. Please try again.');
        }
    }
    
    /**
     * Display the transcription result
     * @param {string} transcriptionId - The ID of the transcription to display
     */
    async function displayTranscription(transcriptionId) {
        try {
            updateStatus('Fetching transcription...');
            
            // Get transcription text
            const transcriptionResponse = await fetch(`${API_ENDPOINT}/transcription?id=${transcriptionId}`);
            
            if (!transcriptionResponse.ok) {
                throw new Error('Failed to fetch transcription');
            }
            
            const { text } = await transcriptionResponse.json();
            
            // Display the transcription
            transcriptionResult.innerHTML = `<p>${text}</p>`;
            updateStatus('Transcription complete');
            
        } catch (error) {
            console.error('Error displaying transcription:', error);
            updateStatus('Error: ' + error.message);
            setTranscriptionPlaceholder('Failed to fetch transcription');
        }
    }
    
    /**
     * Update the status message
     * @param {string} message - The status message to display
     */
    function updateStatus(message) {
        statusElement.textContent = message;
    }
    
    /**
     * Set a placeholder message in the transcription area
     * @param {string} message - The placeholder message
     */
    function setTranscriptionPlaceholder(message) {
        transcriptionResult.innerHTML = `<p class="placeholder">${message}</p>`;
    }
    
    /**
     * Reset the UI to its initial state
     */
    function resetUI() {
        recordButton.disabled = false;
        stopButton.disabled = true;
        playButton.disabled = true;
        updateStatus('Ready to record');
    }
});