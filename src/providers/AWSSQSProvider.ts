import * as vscode from 'vscode';
import {
    SQSClient,
    ListQueuesCommand,
    GetQueueAttributesCommand,
    ReceiveMessageCommand,
    SendMessageCommand,
    DeleteMessageCommand,
    DeleteMessageBatchCommand,
    PurgeQueueCommand,
    GetQueueUrlCommand,
    Message as SQSMessage,
    MessageAttributeValue,
    DeleteMessageBatchRequestEntry
} from '@aws-sdk/client-sqs';
import { v4 as uuidv4 } from 'uuid';
import {
    IMQProvider,
    QueueInfo,
    TopicInfo,
    BrowseOptions,
    Message,
    MessageProperties,
    QueueProperties,
    TopicProperties,
    ChannelInfo,
    ChannelStatus
} from './IMQProvider';
import { AWSSQSConnectionProfile } from '../models/connectionProfile';

/**
 * AWS SQS Provider implementation
 */
export class AWSSQSProvider implements IMQProvider {
    private sqsClient: SQSClient | null = null;
    private connectionParams: AWSSQSConnectionProfile['connectionParams'] | null = null;
    private outputChannel: vscode.OutputChannel;
    private messageCache: Map<string, Map<string, Message>> = new Map();
    private context: vscode.ExtensionContext | undefined;
    private connected: boolean = false;
    private queueUrls: Map<string, string> = new Map(); // Map of queue name to queue URL

    constructor() {
        this.outputChannel = vscode.window.createOutputChannel('MQExplorer: AWS SQS Provider');
    }

    /**
     * Connect to AWS SQS
     * @param connectionParams Connection parameters
     * @param context VS Code extension context
     */
    public async connect(connectionParams: Record<string, any>, context?: vscode.ExtensionContext): Promise<void> {
        try {
            this.log(`Connecting to AWS SQS in region: ${connectionParams.region}`);
            this.context = context;
            this.connectionParams = connectionParams as AWSSQSConnectionProfile['connectionParams'];

            // Create SQS client options
            const clientOptions: any = {
                region: this.connectionParams.region
            };

            // Add credentials if provided
            if (this.connectionParams.credentials) {
                clientOptions.credentials = {
                    accessKeyId: this.connectionParams.credentials.accessKeyId,
                    secretAccessKey: this.connectionParams.credentials.secretAccessKey
                };

                if (this.connectionParams.credentials.sessionToken) {
                    clientOptions.credentials.sessionToken = this.connectionParams.credentials.sessionToken;
                }
            }

            // Add custom endpoint if provided
            if (this.connectionParams.endpoint) {
                clientOptions.endpoint = this.connectionParams.endpoint;
            }

            // Add retry options if provided
            if (this.connectionParams.maxRetries !== undefined) {
                clientOptions.maxAttempts = this.connectionParams.maxRetries;
            }

            if (this.connectionParams.retryMode) {
                clientOptions.retryMode = this.connectionParams.retryMode;
            }

            // Create SQS client
            this.sqsClient = new SQSClient(clientOptions);
            this.connected = true;
            this.log('Successfully connected to AWS SQS');
        } catch (error) {
            this.log(`Error connecting to AWS SQS: ${(error as Error).message}`, true);
            await this.disconnect();
            throw error;
        }
    }

    /**
     * Disconnect from AWS SQS
     */
    public async disconnect(): Promise<void> {
        try {
            this.log('Disconnecting from AWS SQS');
            this.sqsClient = null;
            this.connected = false;
            this.queueUrls.clear();
            this.log('Successfully disconnected from AWS SQS');
        } catch (error) {
            this.log(`Error disconnecting from AWS SQS: ${(error as Error).message}`, true);
            throw error;
        }
    }

    /**
     * Check if connected to AWS SQS
     */
    public isConnected(): boolean {
        return this.connected && this.sqsClient !== null;
    }

    /**
     * List queues in AWS SQS
     * @param filter Optional filter to limit returned queues
     */
    public async listQueues(filter?: string): Promise<QueueInfo[]> {
        try {
            this.checkConnection();
            this.log('Listing queues');

            // Get all queues from AWS SQS
            const command = new ListQueuesCommand({
                QueueNamePrefix: filter
            });

            const response = await this.sqsClient!.send(command);
            const queueUrls = response.QueueUrls || [];

            // Get queue attributes for each queue
            const queueInfos: QueueInfo[] = [];

            for (const queueUrl of queueUrls) {
                // Extract queue name from URL
                const queueName = queueUrl.split('/').pop() || '';

                // Store queue URL for later use
                this.queueUrls.set(queueName, queueUrl);

                // Get queue attributes
                try {
                    const attributesCommand = new GetQueueAttributesCommand({
                        QueueUrl: queueUrl,
                        AttributeNames: ['All']
                    });

                    const attributesResponse = await this.sqsClient!.send(attributesCommand);
                    const attributes = attributesResponse.Attributes || {};

                    const queueInfo: QueueInfo = {
                        name: queueName,
                        depth: parseInt(attributes.ApproximateNumberOfMessages || '0', 10),
                        type: 'Queue',
                        description: `AWS SQS Queue: ${queueName}`
                    };

                    queueInfos.push(queueInfo);
                } catch (error) {
                    this.log(`Error getting attributes for queue ${queueName}: ${(error as Error).message}`, true);
                }
            }

            this.log(`Found ${queueInfos.length} queues`);
            return queueInfos;
        } catch (error) {
            this.log(`Error listing queues: ${(error as Error).message}`, true);
            throw error;
        }
    }

    /**
     * List topics in AWS SQS (not directly supported)
     * @param filter Optional filter to limit returned topics
     */
    public async listTopics(filter?: string): Promise<TopicInfo[]> {
        // SQS doesn't have topics, but we can return an empty array
        return [];
    }

    /**
     * Get queue URL for a queue name
     * @param queueName Name of the queue
     */
    private async getQueueUrl(queueName: string): Promise<string> {
        // Check if we already have the queue URL
        if (this.queueUrls.has(queueName)) {
            return this.queueUrls.get(queueName)!;
        }

        // If not, get it from AWS SQS
        try {
            // Try to use the queue URL prefix if provided
            if (this.connectionParams?.queueUrlPrefix) {
                const queueUrl = `${this.connectionParams.queueUrlPrefix}/${queueName}`;
                this.queueUrls.set(queueName, queueUrl);
                return queueUrl;
            }

            // Otherwise, get it from AWS SQS
            const command = new GetQueueUrlCommand({
                QueueName: queueName
            });

            const response = await this.sqsClient!.send(command);

            if (!response.QueueUrl) {
                throw new Error(`Queue URL not found for queue: ${queueName}`);
            }

            // Store queue URL for later use
            this.queueUrls.set(queueName, response.QueueUrl);

            return response.QueueUrl;
        } catch (error) {
            this.log(`Error getting queue URL for ${queueName}: ${(error as Error).message}`, true);
            throw error;
        }
    }

    /**
     * Browse messages in a queue (non-destructive peek)
     * @param queueName Name of the queue to browse
     * @param options Options for browsing (limit, filter, etc.)
     */
    public async browseMessages(queueName: string, options?: BrowseOptions): Promise<Message[]> {
        try {
            this.checkConnection();
            this.log(`Browsing messages in queue: ${queueName}`);

            const limit = options?.limit || 10;

            // Get queue URL
            const queueUrl = await this.getQueueUrl(queueName);

            // Receive messages from the queue (with VisibilityTimeout to prevent them from being processed)
            const command = new ReceiveMessageCommand({
                QueueUrl: queueUrl,
                MaxNumberOfMessages: Math.min(limit, 10), // SQS allows max 10 messages per request
                VisibilityTimeout: 30, // 30 seconds
                AttributeNames: ['All'],
                MessageAttributeNames: ['All'],
                WaitTimeSeconds: 1 // Short polling
            });

            const response = await this.sqsClient!.send(command);
            const sqsMessages = response.Messages || [];

            // Convert to our Message format
            const messages: Message[] = sqsMessages.map(sqsMessage => {
                const messageId = sqsMessage.MessageId || uuidv4();
                const receiptHandle = sqsMessage.ReceiptHandle;

                // Parse message attributes
                const messageAttributes: Record<string, string> = {};
                if (sqsMessage.MessageAttributes) {
                    for (const [key, value] of Object.entries(sqsMessage.MessageAttributes)) {
                        if (value.StringValue) {
                            messageAttributes[key] = value.StringValue;
                        } else if (value.BinaryValue) {
                            messageAttributes[key] = '[Binary data]';
                        }
                    }
                }

                // Get payload
                const payload = sqsMessage.Body || '';

                // Get timestamp
                const sentTimestamp = sqsMessage.Attributes?.SentTimestamp
                    ? new Date(parseInt(sqsMessage.Attributes.SentTimestamp, 10))
                    : new Date();

                // Create message properties
                const properties: MessageProperties = {
                    receiptHandle,
                    messageAttributes,
                    headers: messageAttributes,
                    attributes: sqsMessage.Attributes || {}
                };

                // Create message
                const message: Message = {
                    id: messageId,
                    correlationId: messageAttributes['correlationId'],
                    timestamp: sentTimestamp,
                    payload,
                    properties
                };

                return message;
            });

            // Cache the messages for later operations
            if (!this.messageCache.has(queueName)) {
                this.messageCache.set(queueName, new Map());
            }

            const queueCache = this.messageCache.get(queueName)!;
            messages.forEach(msg => {
                queueCache.set(msg.id, msg);
            });

            this.log(`Retrieved ${messages.length} messages from queue: ${queueName}`);
            return messages;
        } catch (error) {
            this.log(`Error browsing messages: ${(error as Error).message}`, true);
            throw error;
        }
    }

    /**
     * Put a message to a queue
     * @param queueName Name of the queue
     * @param payload Message payload
     * @param properties Optional message properties
     */
    public async putMessage(queueName: string, payload: string | Buffer, properties?: MessageProperties): Promise<void> {
        try {
            this.checkConnection();
            this.log(`Putting message to queue: ${queueName}`);

            // Get queue URL
            const queueUrl = await this.getQueueUrl(queueName);

            // Convert Buffer payload to string
            const messageBody = typeof payload === 'string' ? payload : payload.toString('utf8');

            // Prepare message attributes
            const messageAttributes: Record<string, MessageAttributeValue> = {};

            // Add content type if provided
            if (properties?.contentType) {
                messageAttributes['contentType'] = {
                    DataType: 'String',
                    StringValue: properties.contentType
                };
            }

            // Add correlation ID if provided
            if (properties?.correlationId) {
                messageAttributes['correlationId'] = {
                    DataType: 'String',
                    StringValue: properties.correlationId
                };
            }

            // Add custom headers if provided
            if (properties?.headers) {
                for (const [key, value] of Object.entries(properties.headers)) {
                    messageAttributes[key] = {
                        DataType: 'String',
                        StringValue: String(value)
                    };
                }
            }

            // Create send message command
            const command = new SendMessageCommand({
                QueueUrl: queueUrl,
                MessageBody: messageBody,
                MessageAttributes: Object.keys(messageAttributes).length > 0 ? messageAttributes : undefined,
                DelaySeconds: properties?.delaySeconds ? parseInt(properties.delaySeconds.toString(), 10) : undefined
            });

            // Send the message
            await this.sqsClient!.send(command);

            this.log(`Successfully put message to queue: ${queueName}`);
        } catch (error) {
            this.log(`Error putting message: ${(error as Error).message}`, true);
            throw error;
        }
    }

    /**
     * Publish a message to a topic (not directly supported in SQS)
     * @param topicString Topic string to publish to
     * @param payload Message payload
     * @param properties Optional message properties
     */
    public async publishMessage(topicString: string, payload: string | Buffer, properties?: MessageProperties): Promise<void> {
        // SQS doesn't have topics, so we'll throw an error
        throw new Error('Publishing to topics is not supported in AWS SQS. Use SNS for topic-based messaging.');
    }

    /**
     * Clear all messages from a queue
     * @param queueName Name of the queue to clear
     */
    public async clearQueue(queueName: string): Promise<void> {
        try {
            this.checkConnection();
            this.log(`Clearing queue: ${queueName}`);

            // Get queue URL
            const queueUrl = await this.getQueueUrl(queueName);

            // Purge the queue
            const command = new PurgeQueueCommand({
                QueueUrl: queueUrl
            });

            await this.sqsClient!.send(command);

            // Clear the message cache for this queue
            this.messageCache.delete(queueName);

            this.log(`Successfully cleared queue: ${queueName}`);
        } catch (error) {
            this.log(`Error clearing queue: ${(error as Error).message}`, true);
            throw error;
        }
    }

    /**
     * Delete a specific message from a queue
     * @param queueName Name of the queue
     * @param messageId ID of the message to delete
     */
    public async deleteMessage(queueName: string, messageId: string): Promise<void> {
        try {
            this.checkConnection();
            this.log(`Deleting message ${messageId} from queue: ${queueName}`);

            // Check if the message is in our cache
            const queueCache = this.messageCache.get(queueName);
            if (!queueCache || !queueCache.has(messageId)) {
                throw new Error(`Message ${messageId} not found in cache for queue ${queueName}`);
            }

            const message = queueCache.get(messageId)!;

            // Get receipt handle from the message
            const receiptHandle = message.properties.receiptHandle;
            if (!receiptHandle) {
                throw new Error(`Receipt handle not found for message ${messageId}`);
            }

            // Get queue URL
            const queueUrl = await this.getQueueUrl(queueName);

            // Delete the message
            const command = new DeleteMessageCommand({
                QueueUrl: queueUrl,
                ReceiptHandle: receiptHandle
            });

            await this.sqsClient!.send(command);

            // Remove the message from our cache
            queueCache.delete(messageId);

            this.log(`Successfully deleted message ${messageId} from queue: ${queueName}`);
        } catch (error) {
            this.log(`Error deleting message: ${(error as Error).message}`, true);
            throw error;
        }
    }

    /**
     * Delete multiple messages from a queue
     * @param queueName Name of the queue
     * @param messageIds Array of message IDs to delete
     */
    public async deleteMessages(queueName: string, messageIds: string[]): Promise<void> {
        try {
            this.checkConnection();
            this.log(`Deleting ${messageIds.length} messages from queue: ${queueName}`);

            // Check if the messages are in our cache
            const queueCache = this.messageCache.get(queueName);
            if (!queueCache) {
                throw new Error(`Queue ${queueName} not found in cache`);
            }

            // Get queue URL
            const queueUrl = await this.getQueueUrl(queueName);

            // Prepare batch delete entries
            const entries: DeleteMessageBatchRequestEntry[] = [];

            for (const messageId of messageIds) {
                if (!queueCache.has(messageId)) {
                    this.log(`Message ${messageId} not found in cache for queue ${queueName}`, true);
                    continue;
                }

                const message = queueCache.get(messageId)!;

                // Get receipt handle from the message
                const receiptHandle = message.properties.receiptHandle;
                if (!receiptHandle) {
                    this.log(`Receipt handle not found for message ${messageId}`, true);
                    continue;
                }

                entries.push({
                    Id: messageId,
                    ReceiptHandle: receiptHandle
                });
            }

            if (entries.length === 0) {
                this.log('No valid messages to delete', true);
                return;
            }

            // SQS allows max 10 messages per batch delete
            for (let i = 0; i < entries.length; i += 10) {
                const batch = entries.slice(i, i + 10);

                // Delete the messages
                const command = new DeleteMessageBatchCommand({
                    QueueUrl: queueUrl,
                    Entries: batch
                });

                const response = await this.sqsClient!.send(command);

                // Remove the successfully deleted messages from our cache
                if (response.Successful) {
                    for (const successful of response.Successful) {
                        queueCache.delete(successful.Id!);
                    }
                }

                // Log failed deletions
                if (response.Failed && response.Failed.length > 0) {
                    for (const failed of response.Failed) {
                        this.log(`Failed to delete message ${failed.Id}: ${failed.Message}`, true);
                    }
                }
            }

            this.log(`Successfully deleted messages from queue: ${queueName}`);
        } catch (error) {
            this.log(`Error deleting messages: ${(error as Error).message}`, true);
            throw error;
        }
    }

    /**
     * Get properties of a queue
     * @param queueName Name of the queue
     */
    public async getQueueProperties(queueName: string): Promise<QueueProperties> {
        try {
            this.checkConnection();
            this.log(`Getting properties for queue: ${queueName}`);

            // Get queue URL
            const queueUrl = await this.getQueueUrl(queueName);

            // Get queue attributes
            const command = new GetQueueAttributesCommand({
                QueueUrl: queueUrl,
                AttributeNames: ['All']
            });

            const response = await this.sqsClient!.send(command);
            const attributes = response.Attributes || {};

            // Convert to our QueueProperties format
            const properties: QueueProperties = {
                name: queueName,
                depth: parseInt(attributes.ApproximateNumberOfMessages || '0', 10),
                description: `AWS SQS Queue: ${queueName}`,
                url: queueUrl,
                arn: attributes.QueueArn,
                createdTimestamp: attributes.CreatedTimestamp ? new Date(parseInt(attributes.CreatedTimestamp, 10) * 1000) : undefined,
                lastModifiedTimestamp: attributes.LastModifiedTimestamp ? new Date(parseInt(attributes.LastModifiedTimestamp, 10) * 1000) : undefined,
                visibilityTimeout: parseInt(attributes.VisibilityTimeout || '30', 10),
                maximumMessageSize: parseInt(attributes.MaximumMessageSize || '262144', 10),
                messageRetentionPeriod: parseInt(attributes.MessageRetentionPeriod || '345600', 10),
                delaySeconds: parseInt(attributes.DelaySeconds || '0', 10),
                receiveMessageWaitTimeSeconds: parseInt(attributes.ReceiveMessageWaitTimeSeconds || '0', 10),
                approximateNumberOfMessages: parseInt(attributes.ApproximateNumberOfMessages || '0', 10),
                approximateNumberOfMessagesNotVisible: parseInt(attributes.ApproximateNumberOfMessagesNotVisible || '0', 10),
                approximateNumberOfMessagesDelayed: parseInt(attributes.ApproximateNumberOfMessagesDelayed || '0', 10),
                fifoQueue: attributes.FifoQueue === 'true',
                contentBasedDeduplication: attributes.ContentBasedDeduplication === 'true',
                redrivePolicy: attributes.RedrivePolicy,
                deadLetterTargetArn: attributes.RedrivePolicy ? JSON.parse(attributes.RedrivePolicy).deadLetterTargetArn : undefined,
                maxReceiveCount: attributes.RedrivePolicy ? JSON.parse(attributes.RedrivePolicy).maxReceiveCount : undefined
            };

            this.log(`Retrieved properties for queue: ${queueName}`);
            return properties;
        } catch (error) {
            this.log(`Error getting queue properties: ${(error as Error).message}`, true);
            throw error;
        }
    }

    /**
     * Get the current depth of a queue
     * @param queueName Name of the queue
     */
    public async getQueueDepth(queueName: string): Promise<number> {
        try {
            const properties = await this.getQueueProperties(queueName);
            return properties.depth || 0;
        } catch (error) {
            this.log(`Error getting queue depth: ${(error as Error).message}`, true);
            throw error;
        }
    }

    /**
     * Get properties of a topic (not supported in SQS)
     * @param topicName Name of the topic
     */
    public async getTopicProperties(topicName: string): Promise<TopicProperties> {
        // SQS doesn't have topics, so we'll throw an error
        throw new Error('Topics are not supported in AWS SQS. Use SNS for topic-based messaging.');
    }

    /**
     * Check if connected and throw error if not
     */
    private checkConnection(): void {
        if (!this.isConnected()) {
            throw new Error('Not connected to AWS SQS');
        }
    }

    /**
     * Log a message to the output channel
     */
    private log(message: string, isError: boolean = false): void {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] ${message}`;

        this.outputChannel.appendLine(logMessage);

        if (isError) {
            console.error(logMessage);
        } else {
            console.log(logMessage);
        }
    }
}
