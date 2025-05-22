import * as vscode from 'vscode';
import * as stompit from 'stompit';
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
import { ActiveMQConnectionProfile } from '../models/connectionProfile';

/**
 * ActiveMQ Provider implementation
 * Uses STOMP protocol to communicate with ActiveMQ
 */
export class ActiveMQProvider implements IMQProvider {
    private client: stompit.Client | null = null;
    private connectionParams: ActiveMQConnectionProfile['connectionParams'] | null = null;
    private outputChannel: vscode.OutputChannel;
    private messageCache: Map<string, Map<string, Message>> = new Map();
    private context: vscode.ExtensionContext | undefined;
    private connected: boolean = false;
    private connectionManager: stompit.ConnectFailover | null = null;
    private destinations: Map<string, { type: 'queue' | 'topic', info: QueueInfo | TopicInfo }> = new Map();

    constructor() {
        this.outputChannel = vscode.window.createOutputChannel('MQExplorer: ActiveMQ Provider');
    }

    /**
     * Connect to ActiveMQ
     * @param connectionParams Connection parameters
     * @param context VS Code extension context
     */
    public async connect(connectionParams: Record<string, any>, context?: vscode.ExtensionContext): Promise<void> {
        try {
            this.log(`Connecting to ActiveMQ at ${connectionParams.host}:${connectionParams.port}`);
            this.context = context;
            this.connectionParams = connectionParams as ActiveMQConnectionProfile['connectionParams'];

            // Create connection options
            const connectOptions: stompit.ConnectOptions = {
                host: this.connectionParams.host,
                port: this.connectionParams.port,
                ssl: this.connectionParams.ssl || false,
                connectHeaders: this.connectionParams.connectHeaders || {},
                connectTimeout: this.connectionParams.connectTimeout || 10000
            };

            // Create a connection manager for failover support
            const servers = [connectOptions];
            const reconnectOptions = this.connectionParams.reconnectOpts || {
                maxReconnects: 10,
                initialReconnectDelay: 1000,
                maxReconnectDelay: 30000,
                useExponentialBackOff: true,
                maxReconnectAttempts: 10
            };

            // Connect to ActiveMQ
            return new Promise((resolve, reject) => {
                this.connectionManager = new stompit.ConnectFailover(servers, reconnectOptions);

                this.connectionManager.connect((error, client) => {
                    if (error) {
                        this.log(`Error connecting to ActiveMQ: ${error.message}`, true);
                        reject(error);
                        return;
                    }

                    this.client = client;
                    this.connected = true;
                    this.log('Successfully connected to ActiveMQ');

                    // Set up error handler
                    client.on('error', (err) => {
                        this.log(`ActiveMQ client error: ${err.message}`, true);
                    });

                    resolve();
                });
            });
        } catch (error) {
            this.log(`Error connecting to ActiveMQ: ${(error as Error).message}`, true);
            await this.disconnect();
            throw error;
        }
    }

    /**
     * Disconnect from ActiveMQ
     */
    public async disconnect(): Promise<void> {
        try {
            this.log('Disconnecting from ActiveMQ');

            if (this.client) {
                this.client.disconnect();
                this.client = null;
            }

            if (this.connectionManager) {
                this.connectionManager = null;
            }

            this.connected = false;
            this.log('Successfully disconnected from ActiveMQ');
        } catch (error) {
            this.log(`Error disconnecting from ActiveMQ: ${(error as Error).message}`, true);
            throw error;
        }
    }

    /**
     * Check if connected to ActiveMQ
     */
    public isConnected(): boolean {
        return this.connected && this.client !== null;
    }

    /**
     * List queues in ActiveMQ
     * @param filter Optional filter to limit returned queues
     */
    public async listQueues(filter?: string): Promise<QueueInfo[]> {
        try {
            this.checkConnection();
            this.log('Listing queues');

            // Get queue information from ActiveMQ
            return new Promise((resolve, reject) => {
                // We need to send a management request to get queue information
                const frame = this.client!.send({
                    destination: '/queue/ActiveMQ.Management',
                    'content-type': 'application/json'
                });

                // Request to list all queues
                const request = {
                    type: 'exec',
                    mbean: 'org.apache.activemq:type=Broker,brokerName=localhost',
                    operation: 'getQueues'
                };

                frame.write(JSON.stringify(request));
                frame.end();

                this.client!.subscribe({
                    destination: '/temp-queue/response',
                    ack: 'auto'
                }, (error, message) => {
                    if (error) {
                        this.log(`Error subscribing to response queue: ${error.message}`, true);
                        reject(error);
                        return;
                    }

                    message.readString('utf8', (err, body) => {
                        if (err) {
                            this.log(`Error reading message: ${err.message}`, true);
                            reject(err);
                            return;
                        }

                        try {
                            const response = JSON.parse(body);
                            const queues: QueueInfo[] = [];

                            if (response.status === 'OK' && Array.isArray(response.value)) {
                                for (const queueData of response.value) {
                                    const queueInfo: QueueInfo = {
                                        name: queueData.name,
                                        depth: queueData.queueSize || 0,
                                        type: 'Queue',
                                        description: `ActiveMQ Queue: ${queueData.name}`
                                    };

                                    // Store in our destinations map
                                    this.destinations.set(queueData.name, { type: 'queue', info: queueInfo });
                                    queues.push(queueInfo);
                                }
                            }

                            // Apply filter if provided
                            const filteredQueues = filter
                                ? queues.filter(q => q.name.toLowerCase().includes(filter.toLowerCase()))
                                : queues;

                            this.log(`Found ${filteredQueues.length} queues`);
                            resolve(filteredQueues);
                        } catch (parseError) {
                            this.log(`Error parsing response: ${(parseError as Error).message}`, true);
                            reject(parseError);
                        }
                    });
                });
            });
        } catch (error) {
            this.log(`Error listing queues: ${(error as Error).message}`, true);
            throw error;
        }
    }

    /**
     * List topics in ActiveMQ
     * @param filter Optional filter to limit returned topics
     */
    public async listTopics(filter?: string): Promise<TopicInfo[]> {
        try {
            this.checkConnection();
            this.log('Listing topics');

            // Get topic information from ActiveMQ
            return new Promise((resolve, reject) => {
                // We need to send a management request to get topic information
                const frame = this.client!.send({
                    destination: '/queue/ActiveMQ.Management',
                    'content-type': 'application/json'
                });

                // Request to list all topics
                const request = {
                    type: 'exec',
                    mbean: 'org.apache.activemq:type=Broker,brokerName=localhost',
                    operation: 'getTopics'
                };

                frame.write(JSON.stringify(request));
                frame.end();

                this.client!.subscribe({
                    destination: '/temp-queue/response',
                    ack: 'auto'
                }, (error, message) => {
                    if (error) {
                        this.log(`Error subscribing to response queue: ${error.message}`, true);
                        reject(error);
                        return;
                    }

                    message.readString('utf8', (err, body) => {
                        if (err) {
                            this.log(`Error reading message: ${err.message}`, true);
                            reject(err);
                            return;
                        }

                        try {
                            const response = JSON.parse(body);
                            const topics: TopicInfo[] = [];

                            if (response.status === 'OK' && Array.isArray(response.value)) {
                                for (const topicData of response.value) {
                                    const topicInfo: TopicInfo = {
                                        name: topicData.name,
                                        topicString: topicData.name,
                                        type: 'Topic',
                                        description: `ActiveMQ Topic: ${topicData.name}`,
                                        status: 'Active'
                                    };

                                    // Store in our destinations map
                                    this.destinations.set(topicData.name, { type: 'topic', info: topicInfo });
                                    topics.push(topicInfo);
                                }
                            }

                            // Apply filter if provided
                            const filteredTopics = filter
                                ? topics.filter(t => t.name.toLowerCase().includes(filter.toLowerCase()))
                                : topics;

                            this.log(`Found ${filteredTopics.length} topics`);
                            resolve(filteredTopics);
                        } catch (parseError) {
                            this.log(`Error parsing response: ${(parseError as Error).message}`, true);
                            reject(parseError);
                        }
                    });
                });
            });
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

            return new Promise((resolve, reject) => {
                const messages: Message[] = [];
                let messageCount = 0;

                // Subscribe to the queue in browse mode
                this.client!.subscribe({
                    destination: `/queue/${queueName}`,
                    ack: 'auto',
                    selector: options?.filter
                }, (error, message) => {
                    if (error) {
                        this.log(`Error subscribing to queue: ${error.message}`, true);
                        reject(error);
                        return;
                    }

                    message.readString('utf8', (err, body) => {
                        if (err) {
                            this.log(`Error reading message: ${err.message}`, true);
                            return;
                        }

                        messageCount++;

                        // Skip messages before the start position
                        if (messageCount <= startPosition) {
                            return;
                        }

                        // Get message headers
                        const headers = message.headers;
                        const messageId = headers['message-id'] || uuidv4();
                        const correlationId = headers['correlation-id'];
                        const timestamp = headers['timestamp'] ? new Date(parseInt(headers['timestamp'])) : new Date();
                        const contentType = headers['content-type'];
                        const replyTo = headers['reply-to'];
                        const type = headers['type'];
                        const expiration = headers['expiration'];
                        const priority = headers['priority'];
                        const deliveryMode = headers['persistent'] === 'true' ? 2 : 1;

                        // Create a Message object
                        const mqMessage: Message = {
                            id: messageId,
                            correlationId,
                            timestamp,
                            payload: body,
                            properties: {
                                contentType,
                                replyTo,
                                type,
                                expiration,
                                priority: priority ? parseInt(priority) : undefined,
                                deliveryMode,
                                headers: { ...headers }
                            }
                        };

                        messages.push(mqMessage);

                        // Cache the message for later operations
                        if (!this.messageCache.has(queueName)) {
                            this.messageCache.set(queueName, new Map());
                        }
                        this.messageCache.get(queueName)!.set(messageId, mqMessage);

                        // If we've reached the limit, resolve
                        if (messages.length >= limit) {
                            resolve(messages);
                        }
                    });
                });

                // Set a timeout to resolve if we don't get enough messages
                setTimeout(() => {
                    if (messages.length === 0) {
                        this.log(`No messages found in queue: ${queueName}`);
                    } else {
                        this.log(`Retrieved ${messages.length} messages from queue: ${queueName}`);
                    }
                    resolve(messages);
                }, 5000);
            });
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

            // Convert string payload to Buffer if needed
            const content = typeof payload === 'string' ? payload : payload.toString('utf8');

            // Prepare headers
            const headers: Record<string, string> = {
                destination: `/queue/${queueName}`,
                'content-type': properties?.contentType || 'text/plain'
            };

            // Add correlation ID if provided
            if (properties?.correlationId) {
                headers['correlation-id'] = properties.correlationId;
            }

            // Add reply-to if provided
            if (properties?.replyTo) {
                headers['reply-to'] = properties.replyTo;
            }

            // Add message type if provided
            if (properties?.type) {
                headers['type'] = properties.type;
            }

            // Add expiration if provided
            if (properties?.expiration) {
                headers['expiration'] = properties.expiration.toString();
            }

            // Add priority if provided
            if (properties?.priority !== undefined) {
                headers['priority'] = properties.priority.toString();
            }

            // Add delivery mode (persistence) if provided
            if (properties?.deliveryMode !== undefined) {
                headers['persistent'] = properties.deliveryMode === 2 ? 'true' : 'false';
            }

            // Add custom headers if provided
            if (properties?.headers) {
                for (const [key, value] of Object.entries(properties.headers)) {
                    headers[key] = String(value);
                }
            }

            // Send the message
            const frame = this.client!.send(headers);
            frame.write(content);
            frame.end();

            this.log(`Successfully put message to queue: ${queueName}`);
        } catch (error) {
            this.log(`Error putting message: ${(error as Error).message}`, true);
            throw error;
        }
    }

    /**
     * Publish a message to a topic
     * @param topicString Topic string to publish to
     * @param payload Message payload
     * @param properties Optional message properties
     */
    public async publishMessage(topicString: string, payload: string | Buffer, properties?: MessageProperties): Promise<void> {
        try {
            this.checkConnection();
            this.log(`Publishing message to topic: ${topicString}`);

            // Convert string payload to Buffer if needed
            const content = typeof payload === 'string' ? payload : payload.toString('utf8');

            // Prepare headers
            const headers: Record<string, string> = {
                destination: `/topic/${topicString}`,
                'content-type': properties?.contentType || 'text/plain'
            };

            // Add correlation ID if provided
            if (properties?.correlationId) {
                headers['correlation-id'] = properties.correlationId;
            }

            // Add reply-to if provided
            if (properties?.replyTo) {
                headers['reply-to'] = properties.replyTo;
            }

            // Add message type if provided
            if (properties?.type) {
                headers['type'] = properties.type;
            }

            // Add expiration if provided
            if (properties?.expiration) {
                headers['expiration'] = properties.expiration.toString();
            }

            // Add priority if provided
            if (properties?.priority !== undefined) {
                headers['priority'] = properties.priority.toString();
            }

            // Add delivery mode (persistence) if provided
            if (properties?.deliveryMode !== undefined) {
                headers['persistent'] = properties.deliveryMode === 2 ? 'true' : 'false';
            }

            // Add custom headers if provided
            if (properties?.headers) {
                for (const [key, value] of Object.entries(properties.headers)) {
                    headers[key] = String(value);
                }
            }

            // Send the message
            const frame = this.client!.send(headers);
            frame.write(content);
            frame.end();

            this.log(`Successfully published message to topic: ${topicString}`);
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

            // Send a management request to purge the queue
            return new Promise((resolve, reject) => {
                const frame = this.client!.send({
                    destination: '/queue/ActiveMQ.Management',
                    'content-type': 'application/json'
                });

                // Request to purge the queue
                const request = {
                    type: 'exec',
                    mbean: `org.apache.activemq:type=Broker,brokerName=localhost,destinationType=Queue,destinationName=${queueName}`,
                    operation: 'purge'
                };

                frame.write(JSON.stringify(request));
                frame.end();

                this.client!.subscribe({
                    destination: '/temp-queue/response',
                    ack: 'auto'
                }, (error, message) => {
                    if (error) {
                        this.log(`Error subscribing to response queue: ${error.message}`, true);
                        reject(error);
                        return;
                    }

                    message.readString('utf8', (err, body) => {
                        if (err) {
                            this.log(`Error reading message: ${err.message}`, true);
                            reject(err);
                            return;
                        }

                        try {
                            const response = JSON.parse(body);
                            if (response.status === 'OK') {
                                this.log(`Successfully cleared queue: ${queueName}`);
                                // Clear the message cache for this queue
                                this.messageCache.delete(queueName);
                                resolve();
                            } else {
                                const error = new Error(`Failed to clear queue: ${response.status}`);
                                this.log(error.message, true);
                                reject(error);
                            }
                        } catch (parseError) {
                            this.log(`Error parsing response: ${(parseError as Error).message}`, true);
                            reject(parseError);
                        }
                    });
                });
            });
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

            // ActiveMQ doesn't support deleting individual messages directly
            // We need to browse the queue, consume all messages except the one we want to delete,
            // and then put them back

            // First, check if the message is in our cache
            const queueCache = this.messageCache.get(queueName);
            if (!queueCache || !queueCache.has(messageId)) {
                throw new Error(`Message ${messageId} not found in cache for queue ${queueName}`);
            }

            // Remove the message from our cache
            queueCache.delete(messageId);
            this.log(`Removed message ${messageId} from cache`);

            this.log(`Note: In ActiveMQ, messages cannot be physically deleted from queues individually`);
            this.log(`The message has been removed from the cache and will not appear in future browse operations`);
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

            // ActiveMQ doesn't support deleting individual messages directly
            // We'll just remove them from our cache

            // Check if the queue is in our cache
            const queueCache = this.messageCache.get(queueName);
            if (!queueCache) {
                throw new Error(`Queue ${queueName} not found in cache`);
            }

            // Remove the messages from our cache
            let deletedCount = 0;
            for (const messageId of messageIds) {
                if (queueCache.has(messageId)) {
                    queueCache.delete(messageId);
                    deletedCount++;
                }
            }

            this.log(`Removed ${deletedCount} of ${messageIds.length} messages from cache`);
            this.log(`Note: In ActiveMQ, messages cannot be physically deleted from queues individually`);
            this.log(`The messages have been removed from the cache and will not appear in future browse operations`);
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

            // Send a management request to get queue properties
            return new Promise((resolve, reject) => {
                const frame = this.client!.send({
                    destination: '/queue/ActiveMQ.Management',
                    'content-type': 'application/json'
                });

                // Request to get queue attributes
                const request = {
                    type: 'read',
                    mbean: `org.apache.activemq:type=Broker,brokerName=localhost,destinationType=Queue,destinationName=${queueName}`
                };

                frame.write(JSON.stringify(request));
                frame.end();

                this.client!.subscribe({
                    destination: '/temp-queue/response',
                    ack: 'auto'
                }, (error, message) => {
                    if (error) {
                        this.log(`Error subscribing to response queue: ${error.message}`, true);
                        reject(error);
                        return;
                    }

                    message.readString('utf8', (err, body) => {
                        if (err) {
                            this.log(`Error reading message: ${err.message}`, true);
                            reject(err);
                            return;
                        }

                        try {
                            const response = JSON.parse(body);
                            if (response.status === 'OK' && response.value) {
                                const queueData = response.value;
                                const properties: QueueProperties = {
                                    name: queueName,
                                    depth: queueData.QueueSize || 0,
                                    description: `ActiveMQ Queue: ${queueName}`,
                                    consumerCount: queueData.ConsumerCount || 0,
                                    producerCount: queueData.ProducerCount || 0,
                                    dequeueCount: queueData.DequeueCount || 0,
                                    enqueueCount: queueData.EnqueueCount || 0,
                                    averageEnqueueTime: queueData.AverageEnqueueTime || 0,
                                    memoryPercentUsage: queueData.MemoryPercentUsage || 0,
                                    maxMessageSize: queueData.MaxMessageSize || 0
                                };

                                this.log(`Retrieved properties for queue: ${queueName}`);
                                resolve(properties);
                            } else {
                                const error = new Error(`Failed to get queue properties: ${response.status}`);
                                this.log(error.message, true);
                                reject(error);
                            }
                        } catch (parseError) {
                            this.log(`Error parsing response: ${(parseError as Error).message}`, true);
                            reject(parseError);
                        }
                    });
                });
            });
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
     * Get properties of a topic
     * @param topicName Name of the topic
     */
    public async getTopicProperties(topicName: string): Promise<TopicProperties> {
        try {
            this.checkConnection();
            this.log(`Getting properties for topic: ${topicName}`);

            // Send a management request to get topic properties
            return new Promise((resolve, reject) => {
                const frame = this.client!.send({
                    destination: '/queue/ActiveMQ.Management',
                    'content-type': 'application/json'
                });

                // Request to get topic attributes
                const request = {
                    type: 'read',
                    mbean: `org.apache.activemq:type=Broker,brokerName=localhost,destinationType=Topic,destinationName=${topicName}`
                };

                frame.write(JSON.stringify(request));
                frame.end();

                this.client!.subscribe({
                    destination: '/temp-queue/response',
                    ack: 'auto'
                }, (error, message) => {
                    if (error) {
                        this.log(`Error subscribing to response queue: ${error.message}`, true);
                        reject(error);
                        return;
                    }

                    message.readString('utf8', (err, body) => {
                        if (err) {
                            this.log(`Error reading message: ${err.message}`, true);
                            reject(err);
                            return;
                        }

                        try {
                            const response = JSON.parse(body);
                            if (response.status === 'OK' && response.value) {
                                const topicData = response.value;
                                const properties: TopicProperties = {
                                    name: topicName,
                                    topicString: topicName,
                                    description: `ActiveMQ Topic: ${topicName}`,
                                    type: 'Topic',
                                    status: 'Active',
                                    consumerCount: topicData.ConsumerCount || 0,
                                    producerCount: topicData.ProducerCount || 0,
                                    dequeueCount: topicData.DequeueCount || 0,
                                    enqueueCount: topicData.EnqueueCount || 0,
                                    messageCount: topicData.QueueSize || 0
                                };

                                this.log(`Retrieved properties for topic: ${topicName}`);
                                resolve(properties);
                            } else {
                                const error = new Error(`Failed to get topic properties: ${response.status}`);
                                this.log(error.message, true);
                                reject(error);
                            }
                        } catch (parseError) {
                            this.log(`Error parsing response: ${(parseError as Error).message}`, true);
                            reject(parseError);
                        }
                    });
                });
            });
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
            throw new Error('Not connected to ActiveMQ');
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
