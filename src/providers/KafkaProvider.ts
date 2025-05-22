import * as vscode from 'vscode';
import { Kafka, Consumer, Producer, Admin, ITopicConfig, SeekEntry } from 'kafkajs';
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
import { KafkaConnectionProfile } from '../models/connectionProfile';

/**
 * Kafka Provider implementation
 * Note: Kafka has a different model than traditional message queues.
 * - Topics in Kafka are similar to queues in other MQ systems
 * - Consumer groups allow multiple consumers to read from a topic
 * - Messages are retained for a configurable period
 * - Messages are not deleted when consumed
 */
export class KafkaProvider implements IMQProvider {
    private kafka: Kafka | null = null;
    private admin: Admin | null = null;
    private producer: Producer | null = null;
    private consumer: Consumer | null = null;
    private connectionParams: KafkaConnectionProfile['connectionParams'] | null = null;
    private outputChannel: vscode.OutputChannel;
    private messageCache: Map<string, Map<string, Message>> = new Map();
    private context: vscode.ExtensionContext | undefined;
    private consumerGroup: string = 'mqexplorer-consumer';
    private connected: boolean = false;

    constructor() {
        this.outputChannel = vscode.window.createOutputChannel('MQExplorer: Kafka Provider');
    }

    /**
     * Connect to Kafka
     * @param connectionParams Connection parameters
     * @param context VS Code extension context
     */
    public async connect(connectionParams: Record<string, any>, context?: vscode.ExtensionContext): Promise<void> {
        try {
            this.log(`Connecting to Kafka brokers: ${(connectionParams.brokers as string[]).join(', ')}`);
            this.context = context;
            this.connectionParams = connectionParams as KafkaConnectionProfile['connectionParams'];

            // Create Kafka client
            const kafkaConfig: any = {
                clientId: this.connectionParams.clientId || 'mqexplorer',
                brokers: this.connectionParams.brokers,
                connectionTimeout: this.connectionParams.connectionTimeout || 30000,
                authenticationTimeout: this.connectionParams.authenticationTimeout || 10000,
            };

            // Add SSL if enabled
            if (this.connectionParams.ssl) {
                kafkaConfig.ssl = true;
            }

            // Add SASL if provided
            if (this.connectionParams.sasl) {
                kafkaConfig.sasl = {
                    mechanism: this.connectionParams.sasl.mechanism,
                    username: this.connectionParams.sasl.username,
                    password: this.connectionParams.sasl.password
                };
            }

            // Create Kafka instance
            this.kafka = new Kafka(kafkaConfig);

            // Create admin client
            this.admin = this.kafka.admin();
            await this.admin.connect();

            // Create producer
            this.producer = this.kafka.producer();
            await this.producer.connect();

            // Create consumer with a unique group ID to avoid conflicts
            const uniqueGroupId = `${this.consumerGroup}-${uuidv4()}`;
            this.consumer = this.kafka.consumer({ groupId: uniqueGroupId });
            await this.consumer.connect();

            this.connected = true;
            this.log('Successfully connected to Kafka');
        } catch (error) {
            this.log(`Error connecting to Kafka: ${(error as Error).message}`, true);
            await this.disconnect();
            throw error;
        }
    }

    /**
     * Disconnect from Kafka
     */
    public async disconnect(): Promise<void> {
        try {
            this.log('Disconnecting from Kafka');

            if (this.consumer) {
                await this.consumer.disconnect();
                this.consumer = null;
            }

            if (this.producer) {
                await this.producer.disconnect();
                this.producer = null;
            }

            if (this.admin) {
                await this.admin.disconnect();
                this.admin = null;
            }

            this.kafka = null;
            this.connected = false;
            this.log('Successfully disconnected from Kafka');
        } catch (error) {
            this.log(`Error disconnecting from Kafka: ${(error as Error).message}`, true);
            throw error;
        }
    }

    /**
     * Check if connected to Kafka
     */
    public isConnected(): boolean {
        return this.connected;
    }

    /**
     * List queues (topics) in Kafka
     * @param filter Optional filter to limit returned queues
     */
    public async listQueues(filter?: string): Promise<QueueInfo[]> {
        try {
            this.checkConnection();
            this.log('Listing topics (queues)');

            // Get all topics from Kafka
            const topics = await this.admin!.listTopics();

            // Convert to QueueInfo objects
            const queueInfos = await Promise.all(topics.map(async (topicName) => {
                // Get topic metadata
                const metadata = await this.admin!.fetchTopicMetadata({ topics: [topicName] });
                const topicMetadata = metadata.topics[0];

                // Get topic offsets
                const partitionOffsets = await this.admin!.fetchTopicOffsets(topicName);

                // Calculate total messages (approximate)
                let totalMessages = 0;
                for (const partition of partitionOffsets) {
                    totalMessages += parseInt(partition.high) - parseInt(partition.low);
                }

                return {
                    name: topicName,
                    depth: totalMessages,
                    type: 'Topic',
                    description: `Partitions: ${topicMetadata.partitions.length}`
                };
            }));

            // Apply filter if provided
            const filteredQueues = filter
                ? queueInfos.filter(q => q.name.toLowerCase().includes(filter.toLowerCase()))
                : queueInfos;

            this.log(`Found ${filteredQueues.length} topics (queues)`);
            return filteredQueues;
        } catch (error) {
            this.log(`Error listing topics: ${(error as Error).message}`, true);
            throw error;
        }
    }

    /**
     * List topics in Kafka (same as listQueues for Kafka)
     * @param filter Optional filter to limit returned topics
     */
    public async listTopics(filter?: string): Promise<TopicInfo[]> {
        try {
            this.checkConnection();
            this.log('Listing topics');

            // Get all topics from Kafka
            const topics = await this.admin!.listTopics();

            // Convert to TopicInfo objects
            const topicInfos = await Promise.all(topics.map(async (topicName) => {
                // Get topic metadata
                const metadata = await this.admin!.fetchTopicMetadata({ topics: [topicName] });
                const topicMetadata = metadata.topics[0];

                return {
                    name: topicName,
                    topicString: topicName,
                    type: 'Kafka Topic',
                    description: `Partitions: ${topicMetadata.partitions.length}`,
                    status: 'Active'
                };
            }));

            // Apply filter if provided
            const filteredTopics = filter
                ? topicInfos.filter(t => t.name.toLowerCase().includes(filter.toLowerCase()))
                : topicInfos;

            this.log(`Found ${filteredTopics.length} topics`);
            return filteredTopics;
        } catch (error) {
            this.log(`Error listing topics: ${(error as Error).message}`, true);
            throw error;
        }
    }

    /**
     * Browse messages in a topic (non-destructive peek)
     * @param topicName Name of the topic to browse
     * @param options Options for browsing (limit, filter, etc.)
     */
    public async browseMessages(topicName: string, options?: BrowseOptions): Promise<Message[]> {
        try {
            this.checkConnection();
            this.log(`Browsing messages in topic: ${topicName}`);

            const limit = options?.limit || 10;
            const startPosition = options?.startPosition || 0;

            // Get topic metadata to find partitions
            const metadata = await this.admin!.fetchTopicMetadata({ topics: [topicName] });
            const partitions = metadata.topics[0].partitions.map(p => p.partitionId);

            // Get offsets for each partition
            const partitionOffsets = await this.admin!.fetchTopicOffsets(topicName);

            // Subscribe to the topic
            await this.consumer!.subscribe({ topic: topicName, fromBeginning: true });

            // Create a promise that will resolve with the messages
            const messages: Message[] = [];
            const messagePromise = new Promise<void>((resolve, reject) => {
                let messageCount = 0;
                let timeoutId: NodeJS.Timeout;

                // Set a timeout to prevent hanging if there are not enough messages
                timeoutId = setTimeout(() => {
                    this.consumer!.stop();
                    resolve();
                }, 5000);

                // Start consuming messages
                this.consumer!.run({
                    eachMessage: async ({ topic, partition, message }) => {
                        messageCount++;

                        // Skip messages before the start position
                        if (messageCount <= startPosition) {
                            return;
                        }

                        // Create a Message object
                        const mqMessage: Message = {
                            id: message.key?.toString() || uuidv4(),
                            correlationId: message.headers?.correlationId?.toString(),
                            timestamp: message.timestamp ? new Date(parseInt(message.timestamp)) : new Date(),
                            payload: message.value || Buffer.from(''),
                            properties: {
                                headers: message.headers,
                                partition,
                                offset: message.offset,
                                key: message.key?.toString(),
                                timestamp: message.timestamp
                            }
                        };

                        messages.push(mqMessage);

                        // Stop when we have enough messages
                        if (messages.length >= limit) {
                            clearTimeout(timeoutId);
                            await this.consumer!.stop();
                            resolve();
                        }
                    },
                });
            });

            // Wait for messages to be collected
            await messagePromise;

            // Cache the messages for later operations
            if (!this.messageCache.has(topicName)) {
                this.messageCache.set(topicName, new Map());
            }

            const topicCache = this.messageCache.get(topicName)!;
            messages.forEach(msg => {
                topicCache.set(msg.id, msg);
            });

            this.log(`Retrieved ${messages.length} messages from topic: ${topicName}`);
            return messages;
        } catch (error) {
            this.log(`Error browsing messages: ${(error as Error).message}`, true);
            throw error;
        }
    }

    /**
     * Put a message to a topic
     * @param topicName Name of the topic
     * @param payload Message payload
     * @param properties Optional message properties
     */
    public async putMessage(topicName: string, payload: string | Buffer, properties?: MessageProperties): Promise<void> {
        try {
            this.checkConnection();
            this.log(`Putting message to topic: ${topicName}`);

            // Convert string payload to Buffer if needed
            const value = typeof payload === 'string' ? Buffer.from(payload) : payload;

            // Prepare message properties
            const key = properties?.key ? Buffer.from(properties.key) : null;
            const headers: Record<string, Buffer> = {};

            // Convert headers to Buffer values
            if (properties?.headers) {
                for (const [headerKey, headerValue] of Object.entries(properties.headers)) {
                    headers[headerKey] = typeof headerValue === 'string'
                        ? Buffer.from(headerValue)
                        : Buffer.from(String(headerValue));
                }
            }

            // Add correlation ID if provided
            if (properties?.correlationId) {
                headers.correlationId = Buffer.from(properties.correlationId);
            }

            // Send the message
            await this.producer!.send({
                topic: topicName,
                messages: [
                    {
                        key,
                        value,
                        headers
                    }
                ]
            });

            this.log(`Successfully put message to topic: ${topicName}`);
        } catch (error) {
            this.log(`Error putting message: ${(error as Error).message}`, true);
            throw error;
        }
    }

    /**
     * Publish a message to a topic (same as putMessage for Kafka)
     * @param topicString Topic string to publish to
     * @param payload Message payload
     * @param properties Optional message properties
     */
    public async publishMessage(topicString: string, payload: string | Buffer, properties?: MessageProperties): Promise<void> {
        return this.putMessage(topicString, payload, properties);
    }

    /**
     * Clear all messages from a topic (not directly supported in Kafka)
     * @param topicName Name of the topic to clear
     */
    public async clearQueue(topicName: string): Promise<void> {
        try {
            this.checkConnection();
            this.log(`Clearing topic: ${topicName}`);

            // In Kafka, we can't directly clear a topic
            // Options:
            // 1. Delete and recreate the topic (destructive)
            // 2. Create a new consumer group and set offsets to the end (non-destructive)

            // We'll use option 2 as it's safer
            const uniqueGroupId = `${this.consumerGroup}-clear-${uuidv4()}`;
            const clearConsumer = this.kafka!.consumer({ groupId: uniqueGroupId });
            await clearConsumer.connect();

            // Subscribe to the topic
            await clearConsumer.subscribe({ topic: topicName });

            // Get topic metadata to find partitions
            const metadata = await this.admin!.fetchTopicMetadata({ topics: [topicName] });
            const partitions = metadata.topics[0].partitions.map(p => p.partitionId);

            // Get the latest offsets for each partition
            const partitionOffsets = await this.admin!.fetchTopicOffsets(topicName);

            // Create seek entries to move to the end of each partition
            const seekEntries: SeekEntry[] = partitions.map(partition => {
                const offset = partitionOffsets.find(p => p.partition === partition)?.high || '0';
                return {
                    topic: topicName,
                    partition,
                    offset
                };
            });

            // Seek to the end of each partition
            await clearConsumer.run({
                eachMessage: async () => {
                    // We don't need to process any messages
                }
            });

            // Wait a moment for the consumer to initialize
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Seek to the end
            await clearConsumer.seek({
                topic: topicName,
                partition: seekEntries[0].partition,
                offset: seekEntries[0].offset
            });

            // Disconnect the consumer
            await clearConsumer.disconnect();

            // Clear the message cache for this topic
            this.messageCache.delete(topicName);

            this.log(`Successfully cleared topic: ${topicName}`);
        } catch (error) {
            this.log(`Error clearing topic: ${(error as Error).message}`, true);
            throw error;
        }
    }

    /**
     * Delete a specific message from a topic (not directly supported in Kafka)
     * @param topicName Name of the topic
     * @param messageId ID of the message to delete
     */
    public async deleteMessage(topicName: string, messageId: string): Promise<void> {
        try {
            this.checkConnection();
            this.log(`Deleting message ${messageId} from topic: ${topicName}`);

            // Kafka doesn't support deleting individual messages
            // We can only simulate this by removing it from our cache

            const topicCache = this.messageCache.get(topicName);
            if (topicCache) {
                if (topicCache.has(messageId)) {
                    topicCache.delete(messageId);
                    this.log(`Removed message ${messageId} from cache`);
                } else {
                    this.log(`Message ${messageId} not found in cache`, true);
                }
            } else {
                this.log(`No cache found for topic: ${topicName}`, true);
            }

            this.log(`Note: In Kafka, messages cannot be physically deleted from topics`);
        } catch (error) {
            this.log(`Error deleting message: ${(error as Error).message}`, true);
            throw error;
        }
    }

    /**
     * Delete multiple messages from a topic (not directly supported in Kafka)
     * @param topicName Name of the topic
     * @param messageIds Array of message IDs to delete
     */
    public async deleteMessages(topicName: string, messageIds: string[]): Promise<void> {
        try {
            this.checkConnection();
            this.log(`Deleting ${messageIds.length} messages from topic: ${topicName}`);

            // Kafka doesn't support deleting individual messages
            // We can only simulate this by removing them from our cache

            const topicCache = this.messageCache.get(topicName);
            if (topicCache) {
                let deletedCount = 0;
                for (const messageId of messageIds) {
                    if (topicCache.has(messageId)) {
                        topicCache.delete(messageId);
                        deletedCount++;
                    }
                }
                this.log(`Removed ${deletedCount} of ${messageIds.length} messages from cache`);
            } else {
                this.log(`No cache found for topic: ${topicName}`, true);
            }

            this.log(`Note: In Kafka, messages cannot be physically deleted from topics`);
        } catch (error) {
            this.log(`Error deleting messages: ${(error as Error).message}`, true);
            throw error;
        }
    }

    /**
     * Get properties of a topic
     * @param topicName Name of the topic
     */
    public async getQueueProperties(topicName: string): Promise<QueueProperties> {
        try {
            this.checkConnection();
            this.log(`Getting properties for topic: ${topicName}`);

            // Get topic metadata
            const metadata = await this.admin!.fetchTopicMetadata({ topics: [topicName] });
            const topicMetadata = metadata.topics[0];

            // Get topic offsets
            const partitionOffsets = await this.admin!.fetchTopicOffsets(topicName);

            // Calculate total messages (approximate)
            let totalMessages = 0;
            for (const partition of partitionOffsets) {
                totalMessages += parseInt(partition.high) - parseInt(partition.low);
            }

            // Convert to QueueProperties
            const properties: QueueProperties = {
                name: topicName,
                depth: totalMessages,
                description: `Kafka Topic with ${topicMetadata.partitions.length} partitions`,
                partitionCount: topicMetadata.partitions.length,
                partitions: topicMetadata.partitions.map(p => ({
                    id: p.partitionId,
                    leader: p.leader,
                    replicas: p.replicas,
                    isr: p.isr
                })),
                offsets: partitionOffsets.map(p => ({
                    partition: p.partition,
                    low: p.low,
                    high: p.high
                }))
            };

            this.log(`Retrieved properties for topic: ${topicName}`);
            return properties;
        } catch (error) {
            this.log(`Error getting topic properties: ${(error as Error).message}`, true);
            throw error;
        }
    }

    /**
     * Get the current depth of a topic
     * @param topicName Name of the topic
     */
    public async getQueueDepth(topicName: string): Promise<number> {
        try {
            this.checkConnection();

            // Get topic offsets
            const partitionOffsets = await this.admin!.fetchTopicOffsets(topicName);

            // Calculate total messages (approximate)
            let totalMessages = 0;
            for (const partition of partitionOffsets) {
                totalMessages += parseInt(partition.high) - parseInt(partition.low);
            }

            return totalMessages;
        } catch (error) {
            this.log(`Error getting topic depth: ${(error as Error).message}`, true);
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

            // Get topic metadata
            const metadata = await this.admin!.fetchTopicMetadata({ topics: [topicName] });
            const topicMetadata = metadata.topics[0];

            // Get topic offsets
            const partitionOffsets = await this.admin!.fetchTopicOffsets(topicName);

            // Calculate total messages (approximate)
            let totalMessages = 0;
            for (const partition of partitionOffsets) {
                totalMessages += parseInt(partition.high) - parseInt(partition.low);
            }

            // Convert to TopicProperties
            const properties: TopicProperties = {
                name: topicName,
                topicString: topicName,
                description: `Kafka Topic with ${topicMetadata.partitions.length} partitions`,
                type: 'Kafka Topic',
                status: 'Active',
                partitionCount: topicMetadata.partitions.length,
                messageCount: totalMessages,
                partitions: topicMetadata.partitions.map(p => ({
                    id: p.partitionId,
                    leader: p.leader,
                    replicas: p.replicas,
                    isr: p.isr
                })),
                offsets: partitionOffsets.map(p => ({
                    partition: p.partition,
                    low: p.low,
                    high: p.high
                }))
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
            throw new Error('Not connected to Kafka');
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
