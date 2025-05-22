import * as vscode from 'vscode';
import { ServiceBusClient, ServiceBusAdministrationClient, ServiceBusReceiver, ServiceBusSender, ServiceBusMessage, RetryOptions } from '@azure/service-bus';
import { ClientSecretCredential } from '@azure/identity';
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
import { AzureServiceBusConnectionProfile } from '../models/connectionProfile';

/**
 * Azure Service Bus Provider implementation
 */
export class AzureServiceBusProvider implements IMQProvider {
    private serviceBusClient: ServiceBusClient | null = null;
    private adminClient: ServiceBusAdministrationClient | null = null;
    private connectionParams: AzureServiceBusConnectionProfile['connectionParams'] | null = null;
    private outputChannel: vscode.OutputChannel;
    private messageCache: Map<string, Map<string, Message>> = new Map();
    private context: vscode.ExtensionContext | undefined;
    private connected: boolean = false;
    private receivers: Map<string, ServiceBusReceiver> = new Map();
    private senders: Map<string, ServiceBusSender> = new Map();

    constructor() {
        this.outputChannel = vscode.window.createOutputChannel('MQExplorer: Azure Service Bus Provider');
    }

    /**
     * Connect to Azure Service Bus
     * @param connectionParams Connection parameters
     * @param context VS Code extension context
     */
    public async connect(connectionParams: Record<string, any>, context?: vscode.ExtensionContext): Promise<void> {
        try {
            this.log(`Connecting to Azure Service Bus...`);
            this.context = context;
            this.connectionParams = connectionParams as AzureServiceBusConnectionProfile['connectionParams'];

            // Create retry options if provided
            let retryOptions: RetryOptions | undefined;
            if (this.connectionParams.retryOptions) {
                retryOptions = {
                    maxRetries: this.connectionParams.retryOptions.maxRetries || 3,
                    maxRetryDelayInMs: this.connectionParams.retryOptions.maxRetryDelayInMs || 30000,
                    retryDelayInMs: this.connectionParams.retryOptions.retryDelayInMs || 1000
                };
            }

            // Create Service Bus client
            if (this.connectionParams.connectionString) {
                // Connect using connection string
                this.serviceBusClient = new ServiceBusClient(this.connectionParams.connectionString, { retryOptions });
                this.adminClient = new ServiceBusAdministrationClient(this.connectionParams.connectionString);
            } else if (this.connectionParams.useAadAuth && this.connectionParams.credential &&
                       this.connectionParams.credential.clientId &&
                       this.connectionParams.credential.clientSecret &&
                       this.connectionParams.credential.tenantId &&
                       this.connectionParams.fullyQualifiedNamespace) {
                // Connect using Azure AD authentication
                const credential = new ClientSecretCredential(
                    this.connectionParams.credential.tenantId,
                    this.connectionParams.credential.clientId,
                    this.connectionParams.credential.clientSecret
                );

                this.serviceBusClient = new ServiceBusClient(
                    this.connectionParams.fullyQualifiedNamespace,
                    credential,
                    { retryOptions }
                );

                this.adminClient = new ServiceBusAdministrationClient(
                    this.connectionParams.fullyQualifiedNamespace,
                    credential
                );
            } else {
                throw new Error('Invalid connection parameters. Either connectionString or AAD credentials must be provided.');
            }

            this.connected = true;
            this.log('Successfully connected to Azure Service Bus');
        } catch (error) {
            this.log(`Error connecting to Azure Service Bus: ${(error as Error).message}`, true);
            await this.disconnect();
            throw error;
        }
    }

    /**
     * Disconnect from Azure Service Bus
     */
    public async disconnect(): Promise<void> {
        try {
            this.log('Disconnecting from Azure Service Bus');

            // Close all receivers
            for (const [queueName, receiver] of this.receivers.entries()) {
                try {
                    await receiver.close();
                    this.log(`Closed receiver for ${queueName}`);
                } catch (error) {
                    this.log(`Error closing receiver for ${queueName}: ${(error as Error).message}`, true);
                }
            }
            this.receivers.clear();

            // Close all senders
            for (const [queueName, sender] of this.senders.entries()) {
                try {
                    await sender.close();
                    this.log(`Closed sender for ${queueName}`);
                } catch (error) {
                    this.log(`Error closing sender for ${queueName}: ${(error as Error).message}`, true);
                }
            }
            this.senders.clear();

            // Close the Service Bus client
            if (this.serviceBusClient) {
                await this.serviceBusClient.close();
                this.serviceBusClient = null;
            }

            this.adminClient = null;
            this.connected = false;
            this.log('Successfully disconnected from Azure Service Bus');
        } catch (error) {
            this.log(`Error disconnecting from Azure Service Bus: ${(error as Error).message}`, true);
            throw error;
        }
    }

    /**
     * Check if connected to Azure Service Bus
     */
    public isConnected(): boolean {
        return this.connected && this.serviceBusClient !== null;
    }

    /**
     * List queues in Azure Service Bus
     * @param filter Optional filter to limit returned queues
     */
    public async listQueues(filter?: string): Promise<QueueInfo[]> {
        try {
            this.checkConnection();
            this.log('Listing queues');

            const queues: QueueInfo[] = [];

            // Get all queues from Azure Service Bus
            for await (const queueProperties of this.adminClient!.listQueues()) {
                const queueInfo: QueueInfo = {
                    name: queueProperties.name,
                    depth: 0, // Will be updated with actual count when needed
                    type: 'Queue',
                    description: queueProperties.userMetadata || `Azure Service Bus Queue: ${queueProperties.name}`
                };

                queues.push(queueInfo);
            }

            // Apply filter if provided
            const filteredQueues = filter
                ? queues.filter(q => q.name.toLowerCase().includes(filter.toLowerCase()))
                : queues;

            this.log(`Found ${filteredQueues.length} queues`);
            return filteredQueues;
        } catch (error) {
            this.log(`Error listing queues: ${(error as Error).message}`, true);
            throw error;
        }
    }

    /**
     * List topics in Azure Service Bus
     * @param filter Optional filter to limit returned topics
     */
    public async listTopics(filter?: string): Promise<TopicInfo[]> {
        try {
            this.checkConnection();
            this.log('Listing topics');

            const topics: TopicInfo[] = [];

            // Get all topics from Azure Service Bus
            for await (const topicProperties of this.adminClient!.listTopics()) {
                const topicInfo: TopicInfo = {
                    name: topicProperties.name,
                    topicString: topicProperties.name,
                    type: 'Topic',
                    description: topicProperties.userMetadata || `Azure Service Bus Topic: ${topicProperties.name}`,
                    status: 'Active'
                };

                topics.push(topicInfo);
            }

            // Apply filter if provided
            const filteredTopics = filter
                ? topics.filter(t => t.name.toLowerCase().includes(filter.toLowerCase()))
                : topics;

            this.log(`Found ${filteredTopics.length} topics`);
            return filteredTopics;
        } catch (error) {
            this.log(`Error listing topics: ${(error as Error).message}`, true);
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
            const startPosition = options?.startPosition || 0;

            // Get a receiver for the queue
            const receiver = this.serviceBusClient!.createReceiver(queueName, { receiveMode: 'peekLock' });

            // Peek messages from the queue
            const sbMessages = await receiver.peekMessages(limit);

            // Convert to our Message format
            const messages: Message[] = sbMessages.map(sbMessage => {
                const messageId = sbMessage.messageId || uuidv4();
                const correlationId = sbMessage.correlationId;
                const timestamp = sbMessage.enqueuedTimeUtc;

                // Get payload
                let payload: string | Buffer;
                if (typeof sbMessage.body === 'string') {
                    payload = sbMessage.body;
                } else if (Buffer.isBuffer(sbMessage.body)) {
                    payload = sbMessage.body;
                } else if (sbMessage.body !== undefined && sbMessage.body !== null) {
                    payload = JSON.stringify(sbMessage.body);
                } else {
                    payload = '';
                }

                // Create message properties
                const properties: MessageProperties = {
                    contentType: sbMessage.contentType,
                    replyTo: sbMessage.replyTo,
                    timeToLive: sbMessage.timeToLive ? sbMessage.timeToLive.toString() : undefined,
                    label: sbMessage.subject,
                    deliveryCount: sbMessage.deliveryCount,
                    sequenceNumber: sbMessage.sequenceNumber?.toString(),
                    lockToken: sbMessage.lockToken,
                    enqueuedTime: sbMessage.enqueuedTimeUtc,
                    expiresAt: sbMessage.expiresAtUtc,
                    sessionId: sbMessage.sessionId,
                    partitionKey: sbMessage.partitionKey,
                    applicationProperties: sbMessage.applicationProperties
                };

                // Create message
                const message: Message = {
                    id: messageId,
                    correlationId: correlationId ? String(correlationId) : undefined,
                    timestamp,
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

            // Close the receiver
            await receiver.close();

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

            // Get or create a sender for the queue
            let sender = this.senders.get(queueName);
            if (!sender) {
                sender = this.serviceBusClient!.createSender(queueName);
                this.senders.set(queueName, sender);
            }

            // Create the message
            const message: ServiceBusMessage = {
                body: payload,
                contentType: properties?.contentType,
                correlationId: properties?.correlationId,
                subject: properties?.label,
                messageId: properties?.messageId || uuidv4(),
                replyTo: properties?.replyTo,
                partitionKey: properties?.partitionKey,
                sessionId: properties?.sessionId,
                timeToLive: properties?.timeToLive ? parseInt(properties.timeToLive) : undefined,
                applicationProperties: properties?.applicationProperties || {}
            };

            // Add custom properties if provided
            if (properties?.headers) {
                for (const [key, value] of Object.entries(properties.headers)) {
                    if (message.applicationProperties) {
                        message.applicationProperties[key] = typeof value === 'string' ? value : String(value);
                    }
                }
            }

            // Send the message
            await sender.sendMessages(message);

            this.log(`Successfully put message to queue: ${queueName}`);
        } catch (error) {
            this.log(`Error putting message: ${(error as Error).message}`, true);
            throw error;
        }
    }

    /**
     * Publish a message to a topic
     * @param topicName Topic name to publish to
     * @param payload Message payload
     * @param properties Optional message properties
     */
    public async publishMessage(topicName: string, payload: string | Buffer, properties?: MessageProperties): Promise<void> {
        try {
            this.checkConnection();
            this.log(`Publishing message to topic: ${topicName}`);

            // Get or create a sender for the topic
            let sender = this.senders.get(topicName);
            if (!sender) {
                sender = this.serviceBusClient!.createSender(topicName);
                this.senders.set(topicName, sender);
            }

            // Create the message
            const message: ServiceBusMessage = {
                body: payload,
                contentType: properties?.contentType,
                correlationId: properties?.correlationId,
                subject: properties?.label,
                messageId: properties?.messageId || uuidv4(),
                replyTo: properties?.replyTo,
                partitionKey: properties?.partitionKey,
                sessionId: properties?.sessionId,
                timeToLive: properties?.timeToLive ? parseInt(properties.timeToLive) : undefined,
                applicationProperties: properties?.applicationProperties || {}
            };

            // Add custom properties if provided
            if (properties?.headers) {
                for (const [key, value] of Object.entries(properties.headers)) {
                    if (message.applicationProperties) {
                        message.applicationProperties[key] = typeof value === 'string' ? value : String(value);
                    }
                }
            }

            // Send the message
            await sender.sendMessages(message);

            this.log(`Successfully published message to topic: ${topicName}`);
        } catch (error) {
            this.log(`Error publishing message: ${(error as Error).message}`, true);
            throw error;
        }
    }

    /**
     * Clear all messages from a queue
     * @param queueName Name of the queue to clear
     */
    public async clearQueue(queueName: string): Promise<void> {
        try {
            this.checkConnection();
            this.log(`Clearing queue: ${queueName}`);

            // Get a receiver for the queue
            const receiver = this.serviceBusClient!.createReceiver(queueName, { receiveMode: 'receiveAndDelete' });

            // Receive and delete all messages
            let messagesReceived = 0;
            let batch;

            do {
                batch = await receiver.receiveMessages(100, { maxWaitTimeInMs: 5000 });
                messagesReceived += batch.length;
                this.log(`Received and deleted ${batch.length} messages`);
            } while (batch.length > 0);

            // Close the receiver
            await receiver.close();

            // Clear the message cache for this queue
            this.messageCache.delete(queueName);

            this.log(`Successfully cleared queue: ${queueName}, removed ${messagesReceived} messages`);
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

            // If we have a lock token, we can complete the message
            if (message.properties.lockToken) {
                // Get a receiver for the queue
                const receiver = this.serviceBusClient!.createReceiver(queueName, { receiveMode: 'peekLock' });

                // We can't directly complete a peeked message, so we need to receive and complete it
                const receivedMessages = await receiver.receiveMessages(1, { maxWaitTimeInMs: 5000 });

                for (const receivedMessage of receivedMessages) {
                    if (receivedMessage.messageId === messageId) {
                        await receiver.completeMessage(receivedMessage);
                        break;
                    }
                }

                // Close the receiver
                await receiver.close();

                this.log(`Successfully deleted message ${messageId} from queue: ${queueName}`);
            } else {
                // If we don't have a lock token, we can't delete the message directly
                // We'll need to receive messages until we find the one we want to delete
                this.log(`No lock token available for message ${messageId}, attempting to receive and delete`);

                // Get a receiver for the queue
                const receiver = this.serviceBusClient!.createReceiver(queueName, { receiveMode: 'peekLock' });

                // Receive messages until we find the one we want to delete
                let found = false;
                let batch;

                do {
                    batch = await receiver.receiveMessages(10, { maxWaitTimeInMs: 5000 });

                    for (const sbMessage of batch) {
                        if (sbMessage.messageId === messageId) {
                            await receiver.completeMessage(sbMessage);
                            found = true;
                            break;
                        }
                    }
                } while (batch.length > 0 && !found);

                // Close the receiver
                await receiver.close();

                if (found) {
                    this.log(`Successfully deleted message ${messageId} from queue: ${queueName}`);
                } else {
                    this.log(`Message ${messageId} not found in queue: ${queueName}`, true);
                }
            }

            // Remove the message from our cache
            queueCache.delete(messageId);
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

            // Delete each message individually
            for (const messageId of messageIds) {
                try {
                    await this.deleteMessage(queueName, messageId);
                } catch (error) {
                    this.log(`Error deleting message ${messageId}: ${(error as Error).message}`, true);
                }
            }

            this.log(`Completed deletion of messages from queue: ${queueName}`);
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

            // Get queue properties from Azure Service Bus
            const queueProperties = await this.adminClient!.getQueue(queueName);

            // Convert to our QueueProperties format
            const properties: QueueProperties = {
                name: queueProperties.name,
                depth: 0, // Azure Service Bus doesn't provide a direct way to get message count in the properties
                description: queueProperties.userMetadata || `Azure Service Bus Queue: ${queueProperties.name}`,
                maxSizeInMegabytes: queueProperties.maxSizeInMegabytes,
                lockDuration: queueProperties.lockDuration?.toString(),
                requiresDuplicateDetection: queueProperties.requiresDuplicateDetection,
                requiresSession: queueProperties.requiresSession,
                defaultMessageTimeToLive: queueProperties.defaultMessageTimeToLive?.toString(),
                deadLetteringOnMessageExpiration: queueProperties.deadLetteringOnMessageExpiration,
                duplicateDetectionHistoryTimeWindow: queueProperties.duplicateDetectionHistoryTimeWindow?.toString(),
                maxDeliveryCount: queueProperties.maxDeliveryCount,
                status: queueProperties.status,
                enableBatchedOperations: queueProperties.enableBatchedOperations,
                autoDeleteOnIdle: queueProperties.autoDeleteOnIdle?.toString(),
                enablePartitioning: queueProperties.enablePartitioning,
                forwardTo: queueProperties.forwardTo,
                forwardDeadLetteredMessagesTo: queueProperties.forwardDeadLetteredMessagesTo
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
            // Azure Service Bus doesn't provide a direct way to get message count
            // We'll return 0 as a placeholder
            return 0;
        } catch (error) {
            this.log(`Error getting queue depth: ${(error as Error).message}`, true);
            throw error;
        }
    }

    /**
     * Get properties of a topic
     * @param topicName Name of the topic
     */
    public async getTopicProperties(topicName: string): Promise<TopicProperties> {
        try {
            this.checkConnection();
            this.log(`Getting properties for topic: ${topicName}`);

            // Get topic properties from Azure Service Bus
            const topicProperties = await this.adminClient!.getTopic(topicName);

            // Get subscriptions for this topic
            const subscriptions: string[] = [];
            for await (const subscription of this.adminClient!.listSubscriptions(topicName)) {
                if (subscription.subscriptionName) {
                    subscriptions.push(subscription.subscriptionName);
                }
            }

            // Convert to our TopicProperties format
            const properties: TopicProperties = {
                name: topicProperties.name,
                topicString: topicProperties.name,
                description: topicProperties.userMetadata || `Azure Service Bus Topic: ${topicProperties.name}`,
                type: 'Topic',
                status: topicProperties.status,
                maxSizeInMegabytes: topicProperties.maxSizeInMegabytes,
                requiresDuplicateDetection: topicProperties.requiresDuplicateDetection,
                defaultMessageTimeToLive: topicProperties.defaultMessageTimeToLive?.toString(),
                duplicateDetectionHistoryTimeWindow: topicProperties.duplicateDetectionHistoryTimeWindow?.toString(),
                enableBatchedOperations: topicProperties.enableBatchedOperations,
                autoDeleteOnIdle: topicProperties.autoDeleteOnIdle?.toString(),
                enablePartitioning: topicProperties.enablePartitioning,
                subscriptionCount: subscriptions.length,
                subscriptions
            };

            this.log(`Retrieved properties for topic: ${topicName}`);
            return properties;
        } catch (error) {
            this.log(`Error getting topic properties: ${(error as Error).message}`, true);
            throw error;
        }
    }

    /**
     * Check if connected and throw error if not
     */
    private checkConnection(): void {
        if (!this.isConnected()) {
            throw new Error('Not connected to Azure Service Bus');
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
