/**
 * Interface for Message Queue providers
 * This will be implemented by specific providers like IBMMQProvider, RabbitMQProvider, etc.
 */
export interface IMQProvider {
    /**
     * Connect to the message queue system
     * @param connectionParams Connection parameters specific to the provider
     * @param context Optional VS Code extension context
     * @returns Promise that resolves when connected
     */
    connect(connectionParams: Record<string, any>, context?: any): Promise<void>;

    /**
     * Disconnect from the message queue system
     * @returns Promise that resolves when disconnected
     */
    disconnect(): Promise<void>;

    /**
     * Check if currently connected
     */
    isConnected(): boolean;

    /**
     * List queues in the connected system
     * @param filter Optional filter to limit returned queues
     * @returns Promise that resolves with an array of queue information
     */
    listQueues(filter?: string): Promise<QueueInfo[]>;

    /**
     * List topics in the connected system
     * @param filter Optional filter to limit returned topics
     * @returns Promise that resolves with an array of topic information
     */
    listTopics?(filter?: string): Promise<TopicInfo[]>;

    /**
     * Browse messages in a queue (non-destructive peek)
     * @param queueName Name of the queue to browse
     * @param options Options for browsing (limit, filter, etc.)
     * @returns Promise that resolves with an array of messages
     */
    browseMessages(queueName: string, options?: BrowseOptions): Promise<Message[]>;

    /**
     * Put a message to a queue
     * @param queueName Name of the queue
     * @param payload Message payload
     * @param properties Optional message properties
     * @returns Promise that resolves when message is put
     */
    putMessage(queueName: string, payload: string | Buffer, properties?: MessageProperties): Promise<void>;

    /**
     * Publish a message to a topic
     * @param topicString Topic string to publish to
     * @param payload Message payload (string or Buffer)
     * @param properties Optional message properties
     * @returns Promise that resolves when the message is published
     */
    publishMessage?(topicString: string, payload: string | Buffer, properties?: MessageProperties): Promise<void>;

    /**
     * Clear all messages from a queue
     * @param queueName Name of the queue to clear
     * @returns Promise that resolves when queue is cleared
     */
    clearQueue(queueName: string): Promise<void>;

    /**
     * Delete a specific message from a queue
     * @param queueName Name of the queue
     * @param messageId ID of the message to delete
     * @returns Promise that resolves when message is deleted
     */
    deleteMessage(queueName: string, messageId: string): Promise<void>;

    /**
     * Delete multiple messages from a queue
     * @param queueName Name of the queue
     * @param messageIds Array of message IDs to delete
     * @returns Promise that resolves when all messages are deleted
     */
    deleteMessages(queueName: string, messageIds: string[]): Promise<void>;

    /**
     * Get properties of a queue
     * @param queueName Name of the queue
     * @returns Promise that resolves with queue properties
     */
    getQueueProperties(queueName: string): Promise<QueueProperties>;

    /**
     * Get the current depth of a queue
     * @param queueName Name of the queue
     * @returns Promise that resolves to the current depth of the queue
     */
    getQueueDepth(queueName: string): Promise<number>;

    /**
     * Get properties of a topic
     * @param topicName Name of the topic
     * @returns Promise that resolves with topic properties
     */
    getTopicProperties?(topicName: string): Promise<TopicProperties>;

    /**
     * List subscriptions for a topic (ASB specific)
     * @param topicName Name of the topic
     * @returns Promise that resolves with an array of subscription information
     */
    listSubscriptions?(topicName: string): Promise<SubscriptionInfo[]>;

    /**
     * Get subscription info including rules (ASB specific)
     * @param topicName Name of the topic
     * @param subscriptionName Name of the subscription
     * @returns Promise that resolves with subscription information
     */
    getSubscriptionInfo?(topicName: string, subscriptionName: string): Promise<SubscriptionInfo | undefined>;

    /**
     * Browse messages in a subscription (ASB specific)
     * @param topicName Name of the topic
     * @param subscriptionName Name of the subscription
     * @param options Options for browsing
     * @returns Promise that resolves with an array of messages
     */
    browseSubscriptionMessages?(topicName: string, subscriptionName: string, options?: BrowseOptions): Promise<Message[]>;

    /**
     * List channels in the connected system
     * @param filter Optional filter to limit returned channels
     * @returns Promise that resolves with an array of channel information
     */
    listChannels?(filter?: string): Promise<ChannelInfo[]>;

    /**
     * Get properties of a channel
     * @param channelName Name of the channel
     * @returns Promise that resolves with channel properties
     */
    getChannelProperties?(channelName: string): Promise<ChannelProperties>;

    /**
     * Start a channel
     * @param channelName Name of the channel to start
     * @returns Promise that resolves when the channel is started
     */
    startChannel?(channelName: string): Promise<void>;

    /**
     * Stop a channel
     * @param channelName Name of the channel to stop
     * @returns Promise that resolves when the channel is stopped
     */
    stopChannel?(channelName: string): Promise<void>;
}

/**
 * Information about a queue
 */
export interface QueueInfo {
    name: string;
    depth?: number;
    type?: string;
    description?: string;
}

/**
 * Information about a topic
 */
export interface TopicInfo {
    name: string;
    topicString: string;
    type?: string;
    description?: string;
    status?: string;
    subscriptionCount?: number;
}

/**
 * Information about a subscription (for ASB topics)
 */
export interface SubscriptionInfo {
    name: string;
    topicName: string;
    messageCount?: number;
    deadLetterMessageCount?: number;
    status?: string;
    description?: string;
    rules?: SubscriptionRule[];
}

/**
 * Information about a subscription rule/filter
 */
export interface SubscriptionRule {
    name: string;
    filterType: 'sql' | 'correlation' | 'true';
    filter?: string;
    action?: string;
}

/**
 * Information about a channel
 */
export interface ChannelInfo {
    name: string;
    type?: string;
    connectionName?: string;
    status?: ChannelStatus;
    description?: string;
}

/**
 * Channel status enum
 */
export enum ChannelStatus {
    INACTIVE = 'Inactive',
    RUNNING = 'Running',
    STARTING = 'Starting',
    STOPPING = 'Stopping',
    RETRYING = 'Retrying',
    STOPPED = 'Stopped',
    UNKNOWN = 'Unknown'
}

/**
 * Options for browsing messages
 */
export interface BrowseOptions {
    limit?: number;
    startPosition?: number;
    filter?: {
        messageId?: string;    // Message ID in hex format
        correlationId?: string; // Correlation ID in hex format
        [key: string]: any;    // Other filter criteria
    };
}

/**
 * Represents a message in a queue
 */
export interface Message {
    id: string;
    correlationId?: string;
    timestamp?: Date;
    payload: string | Buffer;
    properties: MessageProperties;
}

/**
 * Properties of a message
 */
export interface MessageProperties {
    [key: string]: any;
}

/**
 * Properties of a queue
 */
export interface QueueProperties {
    name: string;
    depth?: number;
    maxDepth?: number;
    description?: string;
    creationTime?: Date;
    [key: string]: any;
}

/**
 * Properties of a topic
 */
export interface TopicProperties {
    name: string;
    topicString: string;
    description?: string;
    creationTime?: Date;
    type?: string;
    status?: string;
    publishCount?: number;
    subscriptionCount?: number;
    [key: string]: any;
}

/**
 * Properties of a channel
 */
export interface ChannelProperties {
    name: string;
    type?: string;
    connectionName?: string;
    status?: ChannelStatus;
    description?: string;
    maxMessageLength?: number;
    heartbeatInterval?: number;
    batchSize?: number;
    creationTime?: Date;
    lastStartTime?: Date;
    lastUsedTime?: Date;
    [key: string]: any;
}
