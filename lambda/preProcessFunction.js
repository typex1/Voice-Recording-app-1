/**
 * Pre-processing Lambda function
 * Validates requests and generates pre-signed URLs for S3 uploads
 */

const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');

// Initialize AWS services
const s3 = new AWS.S3();

// Configuration
const TEMP_BUCKET_NAME = process.env.TEMP_BUCKET_NAME || 'your-temp-bucket-name';
const ALLOWED_CONTENT_TYPES = ['audio/webm', 'audio/mp3', 'audio/wav', 'audio/mpeg'];
const URL_EXPIRATION = 300; // 5 minutes

/**
 * Main Lambda handler
 */
exports.handler = async (event) => {
    try {
        console.log('Event received:', JSON.stringify(event));
        
        // Parse request body
        const body = JSON.parse(event.body);
        
        // Validate request
        if (!body.contentType || !body.fileName) {
            return formatResponse(400, { 
                error: 'Missing required parameters: contentType and fileName are required' 
            });
        }
        
        // Validate content type
        if (!ALLOWED_CONTENT_TYPES.includes(body.contentType)) {
            return formatResponse(400, { 
                error: `Invalid content type. Allowed types: ${ALLOWED_CONTENT_TYPES.join(', ')}` 
            });
        }
        
        // Generate a unique recording ID
        const recordingId = uuidv4();
        
        // Create a key for the S3 object
        const key = `recordings/${recordingId}/${body.fileName}`;
        
        // Generate a pre-signed URL for uploading
        const uploadUrl = await getPresignedUrl(key, body.contentType);
        
        // Return the URL and recording ID
        return formatResponse(200, {
            uploadUrl,
            recordingId,
            key,
            expiresIn: URL_EXPIRATION
        });
        
    } catch (error) {
        console.error('Error processing request:', error);
        return formatResponse(500, { error: 'Internal server error' });
    }
};

/**
 * Generate a pre-signed URL for S3 upload
 * @param {string} key - The S3 object key
 * @param {string} contentType - The content type of the file
 * @returns {string} The pre-signed URL
 */
async function getPresignedUrl(key, contentType) {
    const params = {
        Bucket: TEMP_BUCKET_NAME,
        Key: key,
        ContentType: contentType,
        Expires: URL_EXPIRATION
    };
    
    return s3.getSignedUrlPromise('putObject', params);
}

/**
 * Format the API Gateway response
 * @param {number} statusCode - The HTTP status code
 * @param {Object} body - The response body
 * @returns {Object} The formatted response
 */
function formatResponse(statusCode, body) {
    return {
        statusCode,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'OPTIONS,POST,GET'
        },
        body: JSON.stringify(body)
    };
}