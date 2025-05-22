import * as vscode from 'vscode';
import * as amqplib from 'amqplib';
import { Connection, Channel, connect } from 'amqplib/callback_api';
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
import { RabbitMQConnectionProfile } from '../models/connectionProfile';

/**
 * RabbitMQ Provider implementation
 */
export class RabbitMQProvider implements IMQProvider {
    private connection: any | null = null;
    private channel: any | null = null;
    private connectionParams: RabbitMQConnectionProfile['connectionParams'] | null = null;
    private outputChannel: vscode.OutputChannel;
    private messageCache: Map<string, Map<string, Message>> = new Map();
    private context: vscode.ExtensionContext | undefined;

    constructor() {
        this.outputChannel = vscode.window.createOutputChannel('MQExplorer: RabbitMQ Provider');
    }

    /**
     * Connect to RabbitMQ
     * @param connectionParams Connection parameters
     * @param context VS Code extension context
     */
    public async connect(connectionParams: Record<string, any>, context?: vscode.ExtensionContext): Promise<void> {
        try {
            this.log(`Connecting to RabbitMQ at ${connectionParams.host}:${connectionParams.port}`);
            this.context = context;
            this.connectionParams = connectionParams as RabbitMQConnectionProfile['connectionParams'];

            // Build connection URL
            const protocol = this.connectionParams.useTLS ? 'amqps' : 'amqp';
            const auth = this.connectionParams.username ?
                `${encodeURIComponent(this.connectionParams.username)}:${encodeURIComponent(this.connectionParams.password || '')}@` :
                '';
            const vhost = this.connectionParams.vhost ?
                `/${encodeURIComponent(this.connectionParams.vhost)}` :
                '';

            const url = `${protocol}://${auth}${this.connectionParams.host}:${this.connectionParams.port}${vhost}`;

            // Set up TLS options if needed
            const options: any = {};
            if (this.connectionParams.useTLS && this.connectionParams.tlsOptions) {
                // Create socket options for TLS
                options.cert = this.connectionParams.tlsOptions.cert;
                options.key = this.connectionParams.tlsOptions.key;
                options.ca = this.connectionParams.tlsOptions.ca;
                options.passphrase = this.connectionParams.tlsOptions.passphrase;
                options.rejectUnauthorized = this.connectionParams.tlsOptions.rejectUnauthorized;
            }

            // Connect to RabbitMQ
            this.connection = await amqplib.connect(url, options);

            // Create a channel
            this.channel = await this.connection.createChannel();

            // Set up connection error handlers
            this.connection.on('error', (err) => {
                this.log(`Connection error: ${err.message}`, true);
                this.connection = null;
                this.channel = null;
            });

            this.connection.on('close', () => {
                this.log('Connection closed');
                this.connection = null;
                this.channel = null;
            });

            this.log('Successfully connected to RabbitMQ');
        } catch (error) {
            this.log(`Error connecting to RabbitMQ: ${(error as Error).message}`, true);
            this.connection = null;
            this.channel = null;
            throw error;
        }
    }

    /**
     * Disconnect from RabbitMQ
     */
    public async disconnect(): Promise<void> {
        try {
            this.log('Disconnecting from RabbitMQ');

            if (this.channel) {
                await this.channel.close();
                this.channel = null;
            }

            if (this.connection) {
                await this.connection.close();
                this.connection = null;
            }

            this.log('Successfully disconnected from RabbitMQ');
        } catch (error) {
            this.log(`Error disconnecting from RabbitMQ: ${(error as Error).message}`, true);
            throw error;
        }
    }

    /**
     * Check if connected to RabbitMQ
     */
    public isConnected(): boolean {
        return this.connection !== null && this.channel !== null;
    }

    /**
     * List queues in RabbitMQ
     * @param filter Optional filter to limit returned queues
     */
    public async listQueues(filter?: string): Promise<QueueInfo[]> {
        try {
            this.checkConnection();
            this.log('Listing queues');

            // Get all queues from the server
            const response = await fetch(`http://${this.connectionParams?.host}:15672/api/queues${this.connectionParams?.vhost ? '/' + encodeURIComponent(this.connectionParams.vhost) : ''}`, {
                headers: {
                    'Authorization': 'Basic ' + Buffer.from(`${this.connectionParams?.username || 'guest'}:${this.connectionParams?.password || 'guest'}`).toString('base64')
                }
            });

            if (!response.ok) {
                throw new Error(`Failed to list queues: ${response.statusText}`);
            }

            const queues = await response.json() as any[];

            // Convert to QueueInfo objects
            const queueInfos = queues.map(q => ({
                name: q.name,
                depth: q.messages,
                type: q.durable ? 'Durable' : 'Transient',
                description: `${q.messages} messages, ${q.consumers} consumers`
            }));

            // Apply filter if provided
            const filteredQueues = filter
                ? queueInfos.filter(q => q.name.toLowerCase().includes(filter.toLowerCase()))
                : queueInfos;

            this.log(`Found ${filteredQueues.length} queues`);
            return filteredQueues;
        } catch (error) {
            this.log(`Error listing queues: ${(error as Error).message}`, true);
            throw error;
        }
    }

    /**
     * List topics (exchanges) in RabbitMQ
     * @param filter Optional filter to limit returned topics
     */
    public async listTopics(filter?: string): Promise<TopicInfo[]> {
        try {
            this.checkConnection();
            this.log('Listing topics (exchanges)');

            // Get all exchanges from the server
            const response = await fetch(`http://${this.connectionParams?.host}:15672/api/exchanges${this.connectionParams?.vhost ? '/' + encodeURIComponent(this.connectionParams.vhost) : ''}`, {
                headers: {
                    'Authorization': 'Basic ' + Buffer.from(`${this.connectionParams?.username || 'guest'}:${this.connectionParams?.password || 'guest'}`).toString('base64')
                }
            });

            if (!response.ok) {
                throw new Error(`Failed to list exchanges: ${response.statusText}`);
            }

            const exchanges = await response.json() as any[];

            // Filter out the default exchanges
            const userExchanges = exchanges.filter(e => !['', 'amq.direct', 'amq.fanout', 'amq.headers', 'amq.match', 'amq.topic'].includes(e.name));

            // Convert to TopicInfo objects
            const topicInfos = userExchanges.map(e => ({
                name: e.name,
                topicString: e.name,
                type: e.type,
                description: `Type: ${e.type}, Durable: ${e.durable}`,
                status: 'Active'
            }));

            // Apply filter if provided
            const filteredTopics = filter
                ? topicInfos.filter(t => t.name.toLowerCase().includes(filter.toLowerCase()))
                : topicInfos;

            this.log(`Found ${filteredTopics.length} topics (exchanges)`);
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

            // Create a temporary queue for browsing
            const tempQueueName = `temp-browse-${uuidv4()}`;
            await this.channel!.assertQueue(tempQueueName, { exclusive: true, autoDelete: true });

            // Bind the temporary queue to the target queue using the Shovel plugin
            // This is a workaround since RabbitMQ doesn't have a native browse/peek functionality
            const bindOk = await this.channel!.bindQueue(tempQueueName, 'amq.direct', queueName);

            // Get messages from the temporary queue
            const messages: Message[] = [];
            let messageCount = 0;

            // Use get with noAck to peek at messages
            while (messageCount < limit + startPosition) {
                const msg = await this.channel!.get(tempQueueName, { noAck: true });
                if (!msg) {
                    break; // No more messages
                }

                if (messageCount >= startPosition) {
                    const message: Message = {
                        id: msg.properties.messageId || uuidv4(),
                        correlationId: msg.properties.correlationId,
                        timestamp: msg.properties.timestamp ? new Date(msg.properties.timestamp) : new Date(),
                        payload: msg.content,
                        properties: {
                            ...msg.properties,
                            contentType: msg.properties.contentType,
                            contentEncoding: msg.properties.contentEncoding,
                            headers: msg.properties.headers,
                            deliveryMode: msg.properties.deliveryMode,
                            priority: msg.properties.priority,
                            replyTo: msg.properties.replyTo,
                            expiration: msg.properties.expiration,
                            type: msg.properties.type,
                            userId: msg.properties.userId,
                            appId: msg.properties.appId
                        }
                    };

                    messages.push(message);
                }

                messageCount++;
            }

            // Delete the temporary queue
            await this.channel!.deleteQueue(tempQueueName);

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

            // Ensure the queue exists
            await this.channel!.assertQueue(queueName, { durable: true });

            // Convert string payload to Buffer if needed
            const content = typeof payload === 'string' ? Buffer.from(payload) : payload;

            // Prepare message properties
            const msgProperties: amqplib.Options.Publish = {
                messageId: properties?.messageId || uuidv4(),
                correlationId: properties?.correlationId,
                timestamp: properties?.timestamp ? properties.timestamp.getTime() : Date.now(),
                contentType: properties?.contentType || 'text/plain',
                contentEncoding: properties?.contentEncoding,
                headers: properties?.headers,
                deliveryMode: properties?.deliveryMode || 2, // 2 = persistent
                priority: properties?.priority,
                replyTo: properties?.replyTo,
                expiration: properties?.expiration,
                type: properties?.type,
                userId: properties?.userId,
                appId: properties?.appId
            };

            // Publish the message
            const publishOk = this.channel!.publish('', queueName, content, msgProperties);

            if (!publishOk) {
                throw new Error('Failed to publish message to queue');
            }

            this.log(`Successfully put message to queue: ${queueName}`);
        } catch (error) {
            this.log(`Error putting message: ${(error as Error).message}`, true);
            throw error;
        }
    }

    /**
     * Publish a message to a topic (exchange)
     * @param topicString Topic string (exchange name) to publish to
     * @param payload Message payload
     * @param properties Optional message properties
     */
    public async publishMessage(topicString: string, payload: string | Buffer, properties?: MessageProperties): Promise<void> {
        try {
            this.checkConnection();
            this.log(`Publishing message to topic: ${topicString}`);

            // Convert string payload to Buffer if needed
            const content = typeof payload === 'string' ? Buffer.from(payload) : payload;

            // Prepare message properties
            const msgProperties: amqplib.Options.Publish = {
                messageId: properties?.messageId || uuidv4(),
                correlationId: properties?.correlationId,
                timestamp: properties?.timestamp ? properties.timestamp.getTime() : Date.now(),
                contentType: properties?.contentType || 'text/plain',
                contentEncoding: properties?.contentEncoding,
                headers: properties?.headers,
                deliveryMode: properties?.deliveryMode || 2, // 2 = persistent
                priority: properties?.priority,
                replyTo: properties?.replyTo,
                expiration: properties?.expiration,
                type: properties?.type,
                userId: properties?.userId,
                appId: properties?.appId
            };

            // Publish the message to the exchange
            const routingKey = properties?.routingKey || '';
            const publishOk = this.channel!.publish(topicString, routingKey, content, msgProperties);

            if (!publishOk) {
                throw new Error('Failed to publish message to topic');
            }

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

            // Purge the queue
            await this.channel!.purgeQueue(queueName);

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

            // RabbitMQ doesn't support deleting individual messages directly
            // We need to get all messages, skip the one we want to delete, and re-queue the rest

            // Create a temporary queue
            const tempQueueName = `temp-delete-${uuidv4()}`;
            await this.channel!.assertQueue(tempQueueName, { exclusive: true, autoDelete: true });

            // Get all messages from the original queue
            let msg;
            let count = 0;
            let deletedCount = 0;

            // Get messages with noAck: false to remove them from the queue
            while ((msg = await this.channel!.get(queueName, { noAck: false })) !== false) {
                count++;

                // Check if this is the message to delete
                if (msg.properties.messageId === messageId) {
                    // Acknowledge the message to remove it
                    this.channel!.ack(msg);
                    deletedCount++;
                } else {
                    // Re-publish to the temporary queue
                    this.channel!.publish('', tempQueueName, msg.content, msg.properties);
                    this.channel!.ack(msg);
                }
            }

            // Now move all messages back from temp queue to original queue
            while ((msg = await this.channel!.get(tempQueueName, { noAck: false })) !== false) {
                this.channel!.publish('', queueName, msg.content, msg.properties);
                this.channel!.ack(msg);
            }

            // Delete the temporary queue
            await this.channel!.deleteQueue(tempQueueName);

            // Remove from cache if present
            const queueCache = this.messageCache.get(queueName);
            if (queueCache) {
                queueCache.delete(messageId);
            }

            if (deletedCount === 0) {
                this.log(`Warning: Message ${messageId} not found in queue: ${queueName}`);
            } else {
                this.log(`Successfully deleted message ${messageId} from queue: ${queueName}`);
            }
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

            // RabbitMQ doesn't support deleting individual messages directly
            // We need to get all messages, skip the ones we want to delete, and re-queue the rest

            // Create a temporary queue
            const tempQueueName = `temp-delete-${uuidv4()}`;
            await this.channel!.assertQueue(tempQueueName, { exclusive: true, autoDelete: true });

            // Get all messages from the original queue
            let msg;
            let count = 0;
            let deletedCount = 0;

            // Get messages with noAck: false to remove them from the queue
            while ((msg = await this.channel!.get(queueName, { noAck: false })) !== false) {
                count++;

                // Check if this is a message to delete
                if (messageIds.includes(msg.properties.messageId)) {
                    // Acknowledge the message to remove it
                    this.channel!.ack(msg);
                    deletedCount++;
                } else {
                    // Re-publish to the temporary queue
                    this.channel!.publish('', tempQueueName, msg.content, msg.properties);
                    this.channel!.ack(msg);
                }
            }

            // Now move all messages back from temp queue to original queue
            while ((msg = await this.channel!.get(tempQueueName, { noAck: false })) !== false) {
                this.channel!.publish('', queueName, msg.content, msg.properties);
                this.channel!.ack(msg);
            }

            // Delete the temporary queue
            await this.channel!.deleteQueue(tempQueueName);

            // Remove from cache if present
            const queueCache = this.messageCache.get(queueName);
            if (queueCache) {
                messageIds.forEach(id => queueCache.delete(id));
            }

            this.log(`Successfully deleted ${deletedCount} of ${messageIds.length} messages from queue: ${queueName}`);
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

            // Get queue information from the management API
            const response = await fetch(`http://${this.connectionParams?.host}:15672/api/queues/${encodeURIComponent(this.connectionParams?.vhost || '')}/
${encodeURIComponent(queueName)}`, {
                headers: {
                    'Authorization': 'Basic ' + Buffer.from(`${this.connectionParams?.username || 'guest'}:${this.connectionParams?.password || 'guest'}`).toString('base64')
                }
            });

            if (!response.ok) {
                throw new Error(`Failed to get queue properties: ${response.statusText}`);
            }

            const queueInfo = await response.json() as any;

            // Convert to QueueProperties
            const properties: QueueProperties = {
                name: queueInfo.name,
                depth: queueInfo.messages,
                maxDepth: queueInfo.max_length || undefined,
                description: `Type: ${queueInfo.durable ? 'Durable' : 'Transient'}`,
                creationTime: new Date(queueInfo.idle_since),
                durable: queueInfo.durable,
                autoDelete: queueInfo.auto_delete,
                exclusive: queueInfo.exclusive,
                consumers: queueInfo.consumers,
                memory: queueInfo.memory,
                state: queueInfo.state
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

            // Get queue information from the management API
            const response = await fetch(`http://${this.connectionParams?.host}:15672/api/queues/${encodeURIComponent(this.connectionParams?.vhost || '')}/
${encodeURIComponent(queueName)}`, {
                headers: {
                    'Authorization': 'Basic ' + Buffer.from(`${this.connectionParams?.username || 'guest'}:${this.connectionParams?.password || 'guest'}`).toString('base64')
                }
            });

            if (!response.ok) {
                throw new Error(`Failed to get queue depth: ${response.statusText}`);
            }

            const queueInfo = await response.json() as any;
            return queueInfo.messages;
        } catch (error) {
            this.log(`Error getting queue depth: ${(error as Error).message}`, true);
            throw error;
        }
    }

    /**
     * Get properties of a topic (exchange)
     * @param topicName Name of the topic (exchange)
     */
    public async getTopicProperties(topicName: string): Promise<TopicProperties> {
        try {
            this.checkConnection();
            this.log(`Getting properties for topic: ${topicName}`);

            // Get exchange information from the management API
            const response = await fetch(`http://${this.connectionParams?.host}:15672/api/exchanges/${encodeURIComponent(this.connectionParams?.vhost || '')}/
${encodeURIComponent(topicName)}`, {
                headers: {
                    'Authorization': 'Basic ' + Buffer.from(`${this.connectionParams?.username || 'guest'}:${this.connectionParams?.password || 'guest'}`).toString('base64')
                }
            });

            if (!response.ok) {
                throw new Error(`Failed to get topic properties: ${response.statusText}`);
            }

            const exchangeInfo = await response.json() as any;

            // Convert to TopicProperties
            const properties: TopicProperties = {
                name: exchangeInfo.name,
                topicString: exchangeInfo.name,
                description: `Type: ${exchangeInfo.type}`,
                type: exchangeInfo.type,
                status: 'Active',
                durable: exchangeInfo.durable,
                autoDelete: exchangeInfo.auto_delete,
                internal: exchangeInfo.internal,
                arguments: exchangeInfo.arguments
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
            throw new Error('Not connected to RabbitMQ');
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
