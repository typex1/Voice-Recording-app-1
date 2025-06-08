/**
 * Post-processing Lambda function
 * Processes transcription results and stores them in the destination S3 bucket
 */

const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');

// Initialize AWS services
const transcribe = new AWS.TranscribeService();
const s3 = new AWS.S3();
const dynamoDB = new AWS.DynamoDB.DocumentClient();

// Configuration
const TEMP_BUCKET_NAME = process.env.TEMP_BUCKET_NAME || 'your-temp-bucket-name';
const DESTINATION_BUCKET_NAME = process.env.DESTINATION_BUCKET_NAME || 'your-destination-bucket-name';
const TRANSCRIPTION_TABLE = process.env.TRANSCRIPTION_TABLE || 'TranscriptionJobs';
const RETENTION_PERIOD = process.env.RETENTION_PERIOD || 7; // Days to keep temp files

/**
 * Main Lambda handler
 */
exports.handler = async (event) => {
    try {
        console.log('Event received:', JSON.stringify(event));
        
        // Parse request body
        const body = JSON.parse(event.body);
        
        // Validate request
        if (!body.jobId) {
            return formatResponse(400, { error: 'Missing required parameter: jobId' });
        }
        
        // Get job information from DynamoDB
        const jobInfo = await getJobInfo(body.jobId);
        
        if (!jobInfo) {
            return formatResponse(404, { error: 'Transcription job not found' });
        }
        
        // Get transcription job status
        const jobStatus = await getTranscriptionJobStatus(body.jobId);
        
        if (jobStatus === 'COMPLETED') {
            // Process the completed transcription
            const transcriptionId = await processCompletedTranscription(body.jobId, jobInfo);
            
            // Update job status in DynamoDB
            await updateJobStatus(body.jobId, 'COMPLETED', transcriptionId);
            
            return formatResponse(200, { 
                status: jobStatus,
                transcriptionId
            });
        } else if (jobStatus === 'FAILED') {
            // Update job status in DynamoDB
            await updateJobStatus(body.jobId, 'FAILED');
            
            return formatResponse(200, { 
                status: jobStatus,
                error: 'Transcription job failed'
            });
        } else {
            // Job is still in progress
            return formatResponse(200, { status: jobStatus });
        }
        
    } catch (error) {
        console.error('Error processing request:', error);
        return formatResponse(500, { error: 'Internal server error' });
    }
};

/**
 * Get job information from DynamoDB
 * @param {string} jobId - The transcription job ID
 * @returns {Object|null} The job information
 */
async function getJobInfo(jobId) {
    try {
        const params = {
            TableName: TRANSCRIPTION_TABLE,
            Key: { jobId }
        };
        
        const response = await dynamoDB.get(params).promise();
        return response.Item;
    } catch (error) {
        console.error('Error getting job info:', error);
        throw error;
    }
}

/**
 * Get the status of a transcription job
 * @param {string} jobId - The transcription job ID
 * @returns {string} The job status
 */
async function getTranscriptionJobStatus(jobId) {
    try {
        const params = {
            TranscriptionJobName: jobId
        };
        
        const response = await transcribe.getTranscriptionJob(params).promise();
        return response.TranscriptionJob.TranscriptionJobStatus;
    } catch (error) {
        console.error('Error getting transcription job status:', error);
        throw error;
    }
}

/**
 * Process a completed transcription job
 * @param {string} jobId - The transcription job ID
 * @param {Object} jobInfo - The job information
 * @returns {string} The transcription ID
 */
async function processCompletedTranscription(jobId, jobInfo) {
    try {
        // Get the transcription job details
        const jobDetails = await transcribe.getTranscriptionJob({
            TranscriptionJobName: jobId
        }).promise();
        
        // Get the transcript file URL
        const transcriptUrl = jobDetails.TranscriptionJob.Transcript.TranscriptFileUri;
        
        // Download the transcript file
        const transcript = await downloadTranscript(transcriptUrl);
        
        // Extract the text from the transcript
        const text = extractText(transcript);
        
        // Generate a unique ID for the transcription
        const transcriptionId = uuidv4();
        
        // Store the transcription text in the destination bucket
        await storeTranscription(transcriptionId, text, jobInfo.recordingId);
        
        // Schedule cleanup of temporary files
        scheduleCleanup(jobInfo.recordingKey);
        
        return transcriptionId;
    } catch (error) {
        console.error('Error processing completed transcription:', error);
        throw error;
    }
}

/**
 * Download a transcript file from a URL
 * @param {string} url - The transcript file URL
 * @returns {Object} The transcript data
 */
async function downloadTranscript(url) {
    try {
        // Use the AWS SDK to make an HTTP request
        const https = require('https');
        
        return new Promise((resolve, reject) => {
            https.get(url, (response) => {
                let data = '';
                
                response.on('data', (chunk) => {
                    data += chunk;
                });
                
                response.on('end', () => {
                    try {
                        const transcript = JSON.parse(data);
                        resolve(transcript);
                    } catch (error) {
                        reject(error);
                    }
                });
                
            }).on('error', (error) => {
                reject(error);
            });
        });
    } catch (error) {
        console.error('Error downloading transcript:', error);
        throw error;
    }
}

/**
 * Extract text from a transcript
 * @param {Object} transcript - The transcript data
 * @returns {string} The extracted text
 */
function extractText(transcript) {
    try {
        // Extract the transcription text
        const results = transcript.results;
        
        if (!results || !results.transcripts || results.transcripts.length === 0) {
            return '';
        }
        
        // Combine all transcript parts
        return results.transcripts
            .map(t => t.transcript)
            .join(' ')
            .trim();
    } catch (error) {
        console.error('Error extracting text:', error);
        throw error;
    }
}

/**
 * Store the transcription text in the destination bucket
 * @param {string} transcriptionId - The transcription ID
 * @param {string} text - The transcription text
 * @param {string} recordingId - The recording ID
 * @returns {Promise} Promise that resolves when the text is stored
 */
async function storeTranscription(transcriptionId, text, recordingId) {
    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const key = `transcriptions/${recordingId}/${timestamp}_${transcriptionId}.txt`;
        
        const params = {
            Bucket: DESTINATION_BUCKET_NAME,
            Key: key,
            Body: text,
            ContentType: 'text/plain'
        };
        
        await s3.putObject(params).promise();
        
        return key;
    } catch (error) {
        console.error('Error storing transcription:', error);
        throw error;
    }
}

/**
 * Update job status in DynamoDB
 * @param {string} jobId - The transcription job ID
 * @param {string} status - The new status
 * @param {string} [transcriptionId] - The transcription ID (for completed jobs)
 */
async function updateJobStatus(jobId, status, transcriptionId = null) {
    try {
        const updateExpression = transcriptionId
            ? 'SET #status = :status, transcriptionId = :transcriptionId, updatedAt = :updatedAt'
            : 'SET #status = :status, updatedAt = :updatedAt';
            
        const expressionAttributeNames = {
            '#status': 'status'
        };
        
        const expressionAttributeValues = {
            ':status': status,
            ':updatedAt': new Date().toISOString()
        };
        
        if (transcriptionId) {
            expressionAttributeValues[':transcriptionId'] = transcriptionId;
        }
        
        const params = {
            TableName: TRANSCRIPTION_TABLE,
            Key: { jobId },
            UpdateExpression: updateExpression,
            ExpressionAttributeNames: expressionAttributeNames,
            ExpressionAttributeValues: expressionAttributeValues
        };
        
        await dynamoDB.update(params).promise();
    } catch (error) {
        console.error('Error updating job status:', error);
        throw error;
    }
}

/**
 * Schedule cleanup of temporary files
 * @param {string} recordingKey - The S3 object key of the recording
 */
function scheduleCleanup(recordingKey) {
    try {
        // Set expiration on the object
        const params = {
            Bucket: TEMP_BUCKET_NAME,
            Key: recordingKey,
            Expires: new Date(Date.now() + RETENTION_PERIOD * 24 * 60 * 60 * 1000)
        };
        
        // This is async but we don't need to wait for it
        s3.putObjectTagging({
            Bucket: TEMP_BUCKET_NAME,
            Key: recordingKey,
            Tagging: {
                TagSet: [
                    {
                        Key: 'Expiration',
                        Value: 'true'
                    }
                ]
            }
        }).promise();
    } catch (error) {
        console.error('Error scheduling cleanup:', error);
        // Don't throw, this is not critical
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