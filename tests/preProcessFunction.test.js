/**
 * Unit tests for the preProcessFunction Lambda
 */

// Mock AWS SDK
const mockS3 = {
    getSignedUrlPromise: jest.fn().mockResolvedValue('https://mock-presigned-url.com')
};

jest.mock('aws-sdk', () => ({
    S3: jest.fn(() => mockS3)
}));

jest.mock('uuid', () => ({
    v4: jest.fn().mockReturnValue('mock-uuid')
}));

// Import the Lambda handler
const { handler } = require('../lambda/preProcessFunction');

describe('preProcessFunction', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });
    
    test('should return a pre-signed URL for valid requests', async () => {
        // Mock event
        const event = {
            body: JSON.stringify({
                contentType: 'audio/webm',
                fileName: 'test-recording.webm'
            })
        };
        
        // Call the handler
        const response = await handler(event);
        const body = JSON.parse(response.body);
        
        // Verify response
        expect(response.statusCode).toBe(200);
        expect(body.uploadUrl).toBe('https://mock-presigned-url.com');
        expect(body.recordingId).toBe('mock-uuid');
        expect(body.key).toBe('recordings/mock-uuid/test-recording.webm');
        
        // Verify S3 call
        expect(mockS3.getSignedUrlPromise).toHaveBeenCalledWith('putObject', {
            Bucket: expect.any(String),
            Key: 'recordings/mock-uuid/test-recording.webm',
            ContentType: 'audio/webm',
            Expires: 300
        });
    });
    
    test('should return 400 for missing parameters', async () => {
        // Mock event with missing fileName
        const event = {
            body: JSON.stringify({
                contentType: 'audio/webm'
            })
        };
        
        // Call the handler
        const response = await handler(event);
        const body = JSON.parse(response.body);
        
        // Verify response
        expect(response.statusCode).toBe(400);
        expect(body.error).toContain('Missing required parameters');
        
        // S3 should not be called
        expect(mockS3.getSignedUrlPromise).not.toHaveBeenCalled();
    });
    
    test('should return 400 for invalid content type', async () => {
        // Mock event with invalid content type
        const event = {
            body: JSON.stringify({
                contentType: 'image/png',
                fileName: 'test-recording.png'
            })
        };
        
        // Call the handler
        const response = await handler(event);
        const body = JSON.parse(response.body);
        
        // Verify response
        expect(response.statusCode).toBe(400);
        expect(body.error).toContain('Invalid content type');
        
        // S3 should not be called
        expect(mockS3.getSignedUrlPromise).not.toHaveBeenCalled();
    });
    
    test('should return 500 for internal errors', async () => {
        // Mock S3 error
        mockS3.getSignedUrlPromise.mockRejectedValueOnce(new Error('S3 error'));
        
        // Mock event
        const event = {
            body: JSON.stringify({
                contentType: 'audio/webm',
                fileName: 'test-recording.webm'
            })
        };
        
        // Call the handler
        const response = await handler(event);
        const body = JSON.parse(response.body);
        
        // Verify response
        expect(response.statusCode).toBe(500);
        expect(body.error).toBe('Internal server error');
    });
});