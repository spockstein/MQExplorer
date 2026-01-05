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
                // Get runtime properties to get the actual message count
                let activeMessageCount = 0;
                try {
                    const runtimeProps = await this.adminClient!.getQueueRuntimeProperties(queueProperties.name);
                    activeMessageCount = runtimeProps.activeMessageCount || 0;
                } catch (runtimeError) {
                    this.log(`Warning: Could not get runtime properties for queue ${queueProperties.name}: ${(runtimeError as Error).message}`);
                }

                const queueInfo: QueueInfo = {
                    name: queueProperties.name,
                    depth: activeMessageCount,
                    type: 'Queue',
                    description: queueProperties.userMetadata || `${activeMessageCount} messages`
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
                // Get runtime properties to get subscription count
                let subscriptionCount = 0;
                try {
                    const runtimeProps = await this.adminClient!.getTopicRuntimeProperties(topicProperties.name);
                    subscriptionCount = runtimeProps.subscriptionCount || 0;
                } catch (runtimeError) {
                    this.log(`Warning: Could not get runtime properties for topic ${topicProperties.name}: ${(runtimeError as Error).message}`);
                }

                const topicInfo: TopicInfo = {
                    name: topicProperties.name,
                    topicString: topicProperties.name,
                    type: 'Topic',
                    description: topicProperties.userMetadata || `${subscriptionCount} subscriptions`,
                    status: 'Active',
                    subscriptionCount: subscriptionCount
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

            // First, get the current queue depth for diagnostics
            try {
                const runtimeProps = await this.adminClient!.getQueueRuntimeProperties(queueName);
                this.log(`Queue ${queueName} runtime properties: activeMessageCount=${runtimeProps.activeMessageCount}, deadLetterMessageCount=${runtimeProps.deadLetterMessageCount}, scheduledMessageCount=${runtimeProps.scheduledMessageCount}`);
            } catch (error) {
                this.log(`Warning: Could not get queue runtime properties: ${(error as Error).message}`);
            }

            // Get a receiver for the queue - note: peekMessages() is non-destructive regardless of receiveMode
            const receiver = this.serviceBusClient!.createReceiver(queueName, { receiveMode: 'peekLock' });

            // Peek messages from the queue (non-destructive operation)
            this.log(`Peeking up to ${limit} messages from queue: ${queueName}`);
            const sbMessages = await receiver.peekMessages(limit);
            this.log(`Peeked ${sbMessages.length} messages from queue: ${queueName}`);

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

                // Calculate message size (approximate based on payload)
                let messageSize: number | undefined;
                if (typeof payload === 'string') {
                    messageSize = Buffer.byteLength(payload, 'utf8');
                } else if (Buffer.isBuffer(payload)) {
                    messageSize = payload.length;
                }

                // Create message properties with all ASB system properties
                const properties: MessageProperties = {
                    // Content properties
                    contentType: sbMessage.contentType,
                    subject: sbMessage.subject, // Also known as Label

                    // Routing properties
                    to: sbMessage.to,
                    replyTo: sbMessage.replyTo,
                    replyToSessionId: sbMessage.replyToSessionId,

                    // Session and partition properties
                    sessionId: sbMessage.sessionId,
                    partitionKey: sbMessage.partitionKey,

                    // Timing properties
                    timeToLive: sbMessage.timeToLive ? `${sbMessage.timeToLive} ms` : undefined,
                    enqueuedTime: sbMessage.enqueuedTimeUtc,
                    expiresAt: sbMessage.expiresAtUtc,
                    scheduledEnqueueTime: sbMessage.scheduledEnqueueTimeUtc,

                    // Delivery properties
                    deliveryCount: sbMessage.deliveryCount,
                    sequenceNumber: sbMessage.sequenceNumber?.toString(),
                    enqueuedSequenceNumber: sbMessage.enqueuedSequenceNumber?.toString(),
                    lockToken: sbMessage.lockToken,
                    lockedUntil: sbMessage.lockedUntilUtc,

                    // State properties
                    state: sbMessage.state,
                    deadLetterSource: sbMessage.deadLetterSource,
                    deadLetterReason: sbMessage.deadLetterReason,
                    deadLetterErrorDescription: sbMessage.deadLetterErrorDescription,

                    // Size
                    messageSize: messageSize ? `${messageSize} bytes` : undefined,

                    // Application properties (custom user properties)
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

            // Create the message with full ASB system properties support
            const message: ServiceBusMessage = {
                body: payload,
                messageId: properties?.messageId || uuidv4(),

                // Content properties
                contentType: properties?.contentType,
                subject: properties?.subject || properties?.label, // Support both 'subject' and legacy 'label'

                // Routing properties
                to: properties?.to,
                replyTo: properties?.replyTo,
                replyToSessionId: properties?.replyToSessionId,
                correlationId: properties?.correlationId,

                // Session and partition properties
                sessionId: properties?.sessionId,
                partitionKey: properties?.partitionKey,

                // Timing properties
                timeToLive: properties?.timeToLive ? parseInt(properties.timeToLive) : undefined,
                scheduledEnqueueTimeUtc: properties?.scheduledEnqueueTime ? new Date(properties.scheduledEnqueueTime) : undefined,

                // Application properties (custom user properties)
                applicationProperties: properties?.applicationProperties || {}
            };

            // Add custom properties if provided via headers
            if (properties?.headers) {
                for (const [key, value] of Object.entries(properties.headers)) {
                    if (message.applicationProperties) {
                        message.applicationProperties[key] = typeof value === 'string' ? value : String(value);
                    }
                }
            }

            // Send the message
            await sender.sendMessages(message);

            this.log(`Successfully put message to queue: ${queueName} with messageId: ${message.messageId}`);

            // Verify the message was sent by checking queue depth
            try {
                const runtimeProps = await this.adminClient!.getQueueRuntimeProperties(queueName);
                this.log(`Queue ${queueName} after put: activeMessageCount=${runtimeProps.activeMessageCount}`);
            } catch (error) {
                this.log(`Warning: Could not verify queue depth after put: ${(error as Error).message}`);
            }
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

            // Create the message with full ASB system properties support
            const message: ServiceBusMessage = {
                body: payload,
                messageId: properties?.messageId || uuidv4(),

                // Content properties
                contentType: properties?.contentType,
                subject: properties?.subject || properties?.label, // Support both 'subject' and legacy 'label'

                // Routing properties
                to: properties?.to,
                replyTo: properties?.replyTo,
                replyToSessionId: properties?.replyToSessionId,
                correlationId: properties?.correlationId,

                // Session and partition properties
                sessionId: properties?.sessionId,
                partitionKey: properties?.partitionKey,

                // Timing properties
                timeToLive: properties?.timeToLive ? parseInt(properties.timeToLive) : undefined,
                scheduledEnqueueTimeUtc: properties?.scheduledEnqueueTime ? new Date(properties.scheduledEnqueueTime) : undefined,

                // Application properties (custom user properties)
                applicationProperties: properties?.applicationProperties || {}
            };

            // Add custom properties if provided via headers
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
     * List subscriptions for a topic
     * @param topicName Name of the topic
     */
    public async listSubscriptions(topicName: string): Promise<import('./IMQProvider').SubscriptionInfo[]> {
        try {
            this.checkConnection();
            this.log(`Listing subscriptions for topic: ${topicName}`);

            const subscriptions: import('./IMQProvider').SubscriptionInfo[] = [];

            // Get all subscriptions for the topic
            for await (const subProperties of this.adminClient!.listSubscriptions(topicName)) {
                // Get runtime properties to get message count
                let messageCount = 0;
                let deadLetterMessageCount = 0;
                try {
                    const runtimeProps = await this.adminClient!.getSubscriptionRuntimeProperties(topicName, subProperties.subscriptionName);
                    messageCount = runtimeProps.activeMessageCount || 0;
                    deadLetterMessageCount = runtimeProps.deadLetterMessageCount || 0;
                } catch (runtimeError) {
                    this.log(`Warning: Could not get runtime properties for subscription ${subProperties.subscriptionName}: ${(runtimeError as Error).message}`);
                }

                // Get subscription rules
                const rules: import('./IMQProvider').SubscriptionRule[] = [];
                try {
                    for await (const rule of this.adminClient!.listRules(topicName, subProperties.subscriptionName)) {
                        let filterType: 'sql' | 'correlation' | 'true' = 'true';
                        let filter: string | undefined;

                        if (rule.filter) {
                            if ('sqlExpression' in rule.filter && rule.filter.sqlExpression) {
                                filterType = 'sql';
                                filter = rule.filter.sqlExpression;
                            } else if ('correlationId' in rule.filter) {
                                filterType = 'correlation';
                                const corrFilter = rule.filter as any;
                                const filterParts: string[] = [];
                                if (corrFilter.correlationId) filterParts.push(`correlationId=${corrFilter.correlationId}`);
                                if (corrFilter.messageId) filterParts.push(`messageId=${corrFilter.messageId}`);
                                if (corrFilter.to) filterParts.push(`to=${corrFilter.to}`);
                                if (corrFilter.replyTo) filterParts.push(`replyTo=${corrFilter.replyTo}`);
                                if (corrFilter.subject) filterParts.push(`subject=${corrFilter.subject}`);
                                if (corrFilter.sessionId) filterParts.push(`sessionId=${corrFilter.sessionId}`);
                                if (corrFilter.contentType) filterParts.push(`contentType=${corrFilter.contentType}`);
                                if (corrFilter.applicationProperties) {
                                    for (const [key, value] of Object.entries(corrFilter.applicationProperties)) {
                                        filterParts.push(`${key}=${value}`);
                                    }
                                }
                                filter = filterParts.join(', ') || 'correlation filter';
                            }
                        }

                        let action: string | undefined;
                        if (rule.action && 'sqlExpression' in rule.action) {
                            action = rule.action.sqlExpression;
                        }

                        rules.push({
                            name: rule.name,
                            filterType,
                            filter,
                            action
                        });
                    }
                } catch (rulesError) {
                    this.log(`Warning: Could not get rules for subscription ${subProperties.subscriptionName}: ${(rulesError as Error).message}`);
                }

                subscriptions.push({
                    name: subProperties.subscriptionName,
                    topicName: topicName,
                    messageCount,
                    deadLetterMessageCount,
                    status: subProperties.status || 'Active',
                    description: subProperties.userMetadata || `${messageCount} messages`,
                    rules
                });
            }

            this.log(`Found ${subscriptions.length} subscriptions for topic: ${topicName}`);
            return subscriptions;
        } catch (error) {
            this.log(`Error listing subscriptions: ${(error as Error).message}`, true);
            throw error;
        }
    }

    /**
     * Browse messages in a subscription (non-destructive peek)
     * @param topicName Name of the topic
     * @param subscriptionName Name of the subscription
     * @param options Options for browsing
     */
    public async browseSubscriptionMessages(topicName: string, subscriptionName: string, options?: BrowseOptions): Promise<Message[]> {
        try {
            this.checkConnection();
            this.log(`Browsing messages in subscription: ${topicName}/${subscriptionName}`);

            const limit = options?.limit || 10;

            // Get a receiver for the subscription
            const receiver = this.serviceBusClient!.createReceiver(topicName, subscriptionName, { receiveMode: 'peekLock' });

            // Peek messages from the subscription
            const sbMessages = await receiver.peekMessages(limit);

            // Convert to our Message format (reusing the same logic as browseMessages)
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

                // Calculate message size
                let messageSize: number | undefined;
                if (typeof payload === 'string') {
                    messageSize = Buffer.byteLength(payload, 'utf8');
                } else if (Buffer.isBuffer(payload)) {
                    messageSize = payload.length;
                }

                // Create message properties with all ASB system properties
                const properties: MessageProperties = {
                    // Content properties
                    contentType: sbMessage.contentType,
                    subject: sbMessage.subject,

                    // Routing properties
                    to: sbMessage.to,
                    replyTo: sbMessage.replyTo,
                    replyToSessionId: sbMessage.replyToSessionId,

                    // Session and partition properties
                    sessionId: sbMessage.sessionId,
                    partitionKey: sbMessage.partitionKey,

                    // Timing properties
                    timeToLive: sbMessage.timeToLive ? `${sbMessage.timeToLive} ms` : undefined,
                    enqueuedTime: sbMessage.enqueuedTimeUtc,
                    expiresAt: sbMessage.expiresAtUtc,
                    scheduledEnqueueTime: sbMessage.scheduledEnqueueTimeUtc,

                    // Delivery properties
                    deliveryCount: sbMessage.deliveryCount,
                    sequenceNumber: sbMessage.sequenceNumber?.toString(),
                    enqueuedSequenceNumber: sbMessage.enqueuedSequenceNumber?.toString(),
                    lockToken: sbMessage.lockToken,
                    lockedUntil: sbMessage.lockedUntilUtc,

                    // State properties
                    state: sbMessage.state,
                    deadLetterSource: sbMessage.deadLetterSource,
                    deadLetterReason: sbMessage.deadLetterReason,
                    deadLetterErrorDescription: sbMessage.deadLetterErrorDescription,

                    // Size
                    messageSize: messageSize ? `${messageSize} bytes` : undefined,

                    // Subscription info
                    topicName: topicName,
                    subscriptionName: subscriptionName,

                    // Application properties
                    applicationProperties: sbMessage.applicationProperties
                };

                return {
                    id: messageId,
                    correlationId: correlationId ? String(correlationId) : undefined,
                    timestamp,
                    payload,
                    properties
                };
            });

            // Close the receiver
            await receiver.close();

            this.log(`Retrieved ${messages.length} messages from subscription: ${topicName}/${subscriptionName}`);
            return messages;
        } catch (error) {
            this.log(`Error browsing subscription messages: ${(error as Error).message}`, true);
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

            // Get the sequence number from our cached message - this is the reliable identifier in ASB
            const sequenceNumber = message.properties.sequenceNumber;
            if (!sequenceNumber) {
                throw new Error(`Message ${messageId} does not have a sequence number - cannot delete`);
            }

            this.log(`Using sequence number ${sequenceNumber} to delete message`);

            // Get a receiver for the queue
            const receiver = this.serviceBusClient!.createReceiver(queueName, { receiveMode: 'peekLock' });

            try {
                // Receive a single message and check if it's the one we want
                // We'll receive messages one at a time and abandon those that don't match
                let found = false;
                let attempts = 0;
                const maxAttempts = 100; // Safety limit to prevent infinite loops

                while (!found && attempts < maxAttempts) {
                    attempts++;

                    // Receive one message at a time
                    const receivedMessages = await receiver.receiveMessages(1, { maxWaitTimeInMs: 2000 });

                    if (receivedMessages.length === 0) {
                        // No more messages in the queue
                        this.log(`No more messages available, message ${messageId} not found after ${attempts} attempts`, true);
                        break;
                    }

                    const receivedMessage = receivedMessages[0];

                    // Check if this is the message we're looking for using sequence number
                    if (receivedMessage.sequenceNumber?.toString() === sequenceNumber) {
                        // This is the message we want to delete
                        await receiver.completeMessage(receivedMessage);
                        found = true;
                        this.log(`Successfully deleted message ${messageId} (sequence: ${sequenceNumber}) from queue: ${queueName}`);
                    } else {
                        // Not the message we're looking for - abandon it so it goes back to the queue
                        await receiver.abandonMessage(receivedMessage);
                        this.log(`Abandoned message with sequence ${receivedMessage.sequenceNumber}, looking for ${sequenceNumber}`);
                    }
                }

                if (!found) {
                    throw new Error(`Message ${messageId} (sequence: ${sequenceNumber}) not found in queue after ${attempts} attempts`);
                }
            } finally {
                // Always close the receiver
                await receiver.close();
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
            this.checkConnection();
            this.log(`Getting queue depth for: ${queueName}`);

            // Use getQueueRuntimeProperties to get the actual message count
            const runtimeProps = await this.adminClient!.getQueueRuntimeProperties(queueName);
            return runtimeProps.activeMessageCount || 0;
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
