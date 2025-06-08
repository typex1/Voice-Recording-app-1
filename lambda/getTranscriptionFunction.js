/**
 * Get Transcription Lambda function
 * Retrieves transcription text from the S3 bucket
 */

const AWS = require('aws-sdk');

// Initialize AWS services
const s3 = new AWS.S3();
const dynamoDB = new AWS.DynamoDB.DocumentClient();

// Configuration
const DESTINATION_BUCKET_NAME = process.env.DESTINATION_BUCKET_NAME || 'your-destination-bucket-name';
const TRANSCRIPTION_TABLE = process.env.TRANSCRIPTION_TABLE || 'TranscriptionJobs';

/**
 * Main Lambda handler
 */
exports.handler = async (event) => {
    try {
        console.log('Event received:', JSON.stringify(event));
        
        // Get transcription ID from query parameters
        const transcriptionId = event.queryStringParameters?.id;
        
        if (!transcriptionId) {
            return formatResponse(400, { error: 'Missing required parameter: id' });
        }
        
        // Find the transcription in DynamoDB
        const transcriptionInfo = await findTranscriptionById(transcriptionId);
        
        if (!transcriptionInfo) {
            return formatResponse(404, { error: 'Transcription not found' });
        }
        
        // Find the transcription file in S3
        const transcriptionKey = await findTranscriptionFile(transcriptionInfo.recordingId, transcriptionId);
        
        if (!transcriptionKey) {
            return formatResponse(404, { error: 'Transcription file not found' });
        }
        
        // Get the transcription text from S3
        const text = await getTranscriptionText(transcriptionKey);
        
        // Return the transcription text
        return formatResponse(200, { 
            text,
            recordingId: transcriptionInfo.recordingId,
            jobId: transcriptionInfo.jobId,
            timestamp: transcriptionInfo.updatedAt
        });
        
    } catch (error) {
        console.error('Error processing request:', error);
        return formatResponse(500, { error: 'Internal server error' });
    }
};

/**
 * Find transcription information by ID
 * @param {string} transcriptionId - The transcription ID
 * @returns {Object|null} The transcription information
 */
async function findTranscriptionById(transcriptionId) {
    try {
        const params = {
            TableName: TRANSCRIPTION_TABLE,
            IndexName: 'TranscriptionIdIndex',
            KeyConditionExpression: 'transcriptionId = :transcriptionId',
            ExpressionAttributeValues: {
                ':transcriptionId': transcriptionId
            }
        };
        
        const response = await dynamoDB.query(params).promise();
        
        if (response.Items && response.Items.length > 0) {
            return response.Items[0];
        }
        
        return null;
    } catch (error) {
        console.error('Error finding transcription by ID:', error);
        throw error;
    }
}

/**
 * Find the transcription file in S3
 * @param {string} recordingId - The recording ID
 * @param {string} transcriptionId - The transcription ID
 * @returns {string|null} The S3 object key if found, null otherwise
 */
async function findTranscriptionFile(recordingId, transcriptionId) {
    try {
        const params = {
            Bucket: DESTINATION_BUCKET_NAME,
            Prefix: `transcriptions/${recordingId}/`
        };
        
        const response = await s3.listObjectsV2(params).promise();
        
        if (response.Contents && response.Contents.length > 0) {
            // Find the file that contains the transcription ID
            const file = response.Contents.find(item => 
                item.Key.includes(transcriptionId)
            );
            
            return file ? file.Key : null;
        }
        
        return null;
    } catch (error) {
        console.error('Error finding transcription file:', error);
        throw error;
    }
}

/**
 * Get transcription text from S3
 * @param {string} key - The S3 object key
 * @returns {string} The transcription text
 */
async function getTranscriptionText(key) {
    try {
        const params = {
            Bucket: DESTINATION_BUCKET_NAME,
            Key: key
        };
        
        const response = await s3.getObject(params).promise();
        return response.Body.toString('utf-8');
    } catch (error) {
        console.error('Error getting transcription text:', error);
        throw error;
    }
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