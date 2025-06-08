/**
 * Transcription Lambda function
 * Initiates and manages Amazon Transcribe jobs
 */

const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');

// Initialize AWS services
const transcribe = new AWS.TranscribeService();
const s3 = new AWS.S3();
const dynamoDB = new AWS.DynamoDB.DocumentClient();

// Configuration
const TEMP_BUCKET_NAME = process.env.TEMP_BUCKET_NAME || 'your-temp-bucket-name';
const TRANSCRIPTION_TABLE = process.env.TRANSCRIPTION_TABLE || 'TranscriptionJobs';
const LANGUAGE_CODE = 'en-US';

/**
 * Main Lambda handler
 */
exports.handler = async (event) => {
    try {
        console.log('Event received:', JSON.stringify(event));
        
        // Parse request body
        const body = JSON.parse(event.body);
        
        // Validate request
        if (!body.recordingId) {
            return formatResponse(400, { error: 'Missing required parameter: recordingId' });
        }
        
        // Find the recording file in S3
        const recordingKey = await findRecordingFile(body.recordingId);
        
        if (!recordingKey) {
            return formatResponse(404, { error: 'Recording not found' });
        }
        
        // Start a transcription job
        const jobId = await startTranscriptionJob(recordingKey);
        
        // Store job information in DynamoDB
        await storeJobInfo(jobId, body.recordingId, recordingKey);
        
        // Return the job ID
        return formatResponse(200, { jobId });
        
    } catch (error) {
        console.error('Error processing request:', error);
        return formatResponse(500, { error: 'Internal server error' });
    }
};

/**
 * Find the recording file in S3 by recordingId
 * @param {string} recordingId - The recording ID
 * @returns {string|null} The S3 object key if found, null otherwise
 */
async function findRecordingFile(recordingId) {
    try {
        const params = {
            Bucket: TEMP_BUCKET_NAME,
            Prefix: `recordings/${recordingId}/`
        };
        
        const response = await s3.listObjectsV2(params).promise();
        
        if (response.Contents && response.Contents.length > 0) {
            // Return the first file found
            return response.Contents[0].Key;
        }
        
        return null;
    } catch (error) {
        console.error('Error finding recording file:', error);
        throw error;
    }
}

/**
 * Start an Amazon Transcribe job
 * @param {string} recordingKey - The S3 object key of the recording
 * @returns {string} The transcription job ID
 */
async function startTranscriptionJob(recordingKey) {
    try {
        const jobName = `transcription-${uuidv4()}`;
        const mediaFileUri = `s3://${TEMP_BUCKET_NAME}/${recordingKey}`;
        
        const params = {
            TranscriptionJobName: jobName,
            Media: { MediaFileUri: mediaFileUri },
            MediaFormat: getMediaFormat(recordingKey),
            LanguageCode: LANGUAGE_CODE,
            Settings: {
                MaxSpeakerLabels: 2,
                ShowSpeakerLabels: true
            }
        };
        
        const response = await transcribe.startTranscriptionJob(params).promise();
        return response.TranscriptionJob.TranscriptionJobName;
    } catch (error) {
        console.error('Error starting transcription job:', error);
        throw error;
    }
}

/**
 * Store job information in DynamoDB
 * @param {string} jobId - The transcription job ID
 * @param {string} recordingId - The recording ID
 * @param {string} recordingKey - The S3 object key of the recording
 */
async function storeJobInfo(jobId, recordingId, recordingKey) {
    try {
        const params = {
            TableName: TRANSCRIPTION_TABLE,
            Item: {
                jobId,
                recordingId,
                recordingKey,
                status: 'IN_PROGRESS',
                createdAt: new Date().toISOString()
            }
        };
        
        await dynamoDB.put(params).promise();
    } catch (error) {
        console.error('Error storing job info:', error);
        throw error;
    }
}

/**
 * Determine the media format from the file extension
 * @param {string} key - The S3 object key
 * @returns {string} The media format
 */
function getMediaFormat(key) {
    const extension = key.split('.').pop().toLowerCase();
    
    const formatMap = {
        'webm': 'webm',
        'mp3': 'mp3',
        'wav': 'wav',
        'flac': 'flac',
        'mp4': 'mp4',
        'm4a': 'mp4'
    };
    
    return formatMap[extension] || 'mp3';
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