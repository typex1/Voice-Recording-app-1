/**
 * Unit tests for the AudioRecorder class
 */

// Mock browser APIs
global.window = {
    AudioContext: jest.fn().mockImplementation(() => ({
        createAnalyser: jest.fn().mockReturnValue({
            connect: jest.fn(),
            fftSize: 0
        }),
        createMediaStreamSource: jest.fn().mockReturnValue({
            connect: jest.fn()
        })
    })),
    webkitAudioContext: jest.fn(),
    URL: {
        createObjectURL: jest.fn().mockReturnValue('blob:mock-url'),
        revokeObjectURL: jest.fn()
    },
    addEventListener: jest.fn()
};

global.document = {
    getElementById: jest.fn().mockImplementation((id) => {
        if (id === 'visualizer') {
            return {
                getContext: jest.fn().mockReturnValue({
                    clearRect: jest.fn(),
                    fillRect: jest.fn(),
                    fillStyle: ''
                }),
                width: 100,
                height: 100,
                offsetWidth: 100,
                offsetHeight: 100
            };
        }
        if (id === 'timer') {
            return { textContent: '' };
        }
        return null;
    }),
    createElement: jest.fn().mockImplementation(() => ({
        style: {},
        src: ''
    })),
    body: {
        appendChild: jest.fn()
    }
};

global.navigator = {
    mediaDevices: {
        getUserMedia: jest.fn().mockResolvedValue({
            getTracks: jest.fn().mockReturnValue([{ stop: jest.fn() }])
        })
    }
};

global.MediaRecorder = jest.fn().mockImplementation(() => ({
    start: jest.fn(),
    stop: jest.fn(),
    ondataavailable: null,
    onstop: null
}));

// Import the AudioRecorder class
require('../recorder.js');
const AudioRecorder = global.AudioRecorder;

describe('AudioRecorder', () => {
    let recorder;
    
    beforeEach(() => {
        jest.clearAllMocks();
        recorder = new AudioRecorder();
        recorder.initialize();
    });
    
    test('should initialize correctly', () => {
        expect(recorder).toBeDefined();
        expect(recorder.isRecording).toBe(false);
        expect(recorder.maxRecordingTime).toBe(120000); // 2 minutes
        expect(document.createElement).toHaveBeenCalledWith('audio');
        expect(document.body.appendChild).toHaveBeenCalled();
    });
    
    test('should start recording when startRecording is called', async () => {
        await recorder.startRecording();
        
        expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({ audio: true });
        expect(recorder.isRecording).toBe(true);
        expect(recorder.mediaRecorder.start).toHaveBeenCalled();
    });
    
    test('should stop recording when stopRecording is called', async () => {
        await recorder.startRecording();
        
        // Mock the ondataavailable event
        recorder.mediaRecorder.ondataavailable({ data: { size: 100 } });
        
        // Create a promise that resolves when onstop is called
        const stopPromise = recorder.stopRecording();
        
        // Simulate the onstop event
        recorder.mediaRecorder.onstop();
        
        await stopPromise;
        
        expect(recorder.isRecording).toBe(false);
        expect(recorder.mediaRecorder.stop).toHaveBeenCalled();
        expect(recorder.stream.getTracks()[0].stop).toHaveBeenCalled();
    });
    
    test('should reset recorder state', async () => {
        await recorder.startRecording();
        recorder.mediaRecorder.ondataavailable({ data: { size: 100 } });
        recorder.mediaRecorder.onstop();
        
        recorder.reset();
        
        expect(recorder.audioChunks).toEqual([]);
        expect(recorder.audioBlob).toBeNull();
        expect(window.URL.revokeObjectURL).toHaveBeenCalled();
    });
    
    test('should respect maximum recording time of 2 minutes', async () => {
        jest.useFakeTimers();
        
        await recorder.startRecording();
        
        // Fast-forward 2 minutes and 1 second
        jest.advanceTimersByTime(120001);
        
        // The recorder should have stopped automatically
        expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 120000);
        
        jest.useRealTimers();
    });
});