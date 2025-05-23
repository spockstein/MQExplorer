import { IMQProvider, QueueInfo, BrowseOptions, Message, MessageProperties, QueueProperties, TopicInfo, TopicProperties, ChannelInfo, ChannelProperties, ChannelStatus } from '../../providers/IMQProvider';
import * as vscode from 'vscode';

/**
 * Mock MQ Provider for testing
 */
export class MockMQProvider implements IMQProvider {
    private connected: boolean = false;
    private connectionParams: any = null;
    private outputChannel: vscode.OutputChannel;
    private mockQueues: Map<string, MockQueue> = new Map();
    private mockTopics: Map<string, MockTopic> = new Map();
    private mockChannels: Map<string, MockChannel> = new Map();

    constructor() {
        this.outputChannel = vscode.window.createOutputChannel('MQExplorer: Mock Provider');
        this.initializeMockData();
    }

    /**
     * Initialize mock data
     */
    private initializeMockData(): void {
        // Create some mock queues with messages
        const queue1 = new MockQueue('MOCK.QUEUE.1', 'Local', 'Mock queue 1');
        queue1.addMessage('Test message 1');
        queue1.addMessage('Test message 2');
        queue1.addMessage('Test message 3');
        this.mockQueues.set(queue1.name, queue1);

        const queue2 = new MockQueue('MOCK.QUEUE.2', 'Local', 'Mock queue 2');
        this.mockQueues.set(queue2.name, queue2);

        // Create some mock topics
        const topic1 = new MockTopic('MOCK.TOPIC.1', 'mock/topic/1', 'Mock topic 1');
        this.mockTopics.set(topic1.name, topic1);

        const topic2 = new MockTopic('MOCK.TOPIC.2', 'mock/topic/2', 'Mock topic 2');
        this.mockTopics.set(topic2.name, topic2);

        // Create some mock channels
        const channel1 = new MockChannel('MOCK.CHANNEL.1', 'SVRCONN', 'Mock channel 1');
        this.mockChannels.set(channel1.name, channel1);

        const channel2 = new MockChannel('MOCK.CHANNEL.2', 'SDR', 'Mock channel 2');
        this.mockChannels.set(channel2.name, channel2);
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

    /**
     * Connect to the mock provider
     */
    async connect(connectionParams: any, context?: vscode.ExtensionContext): Promise<void> {
        this.log(`Connecting with params: ${JSON.stringify(connectionParams)}`);
        this.connectionParams = connectionParams;
        this.connected = true;
    }

    /**
     * Disconnect from the mock provider
     */
    async disconnect(): Promise<void> {
        this.log('Disconnecting');
        this.connected = false;
        this.connectionParams = null;
    }

    /**
     * Check if connected
     */
    isConnected(): boolean {
        return this.connected;
    }

    /**
     * List queues
     */
    async listQueues(filter?: string): Promise<QueueInfo[]> {
        this.log(`Listing queues with filter: ${filter || 'none'}`);
        
        if (!this.isConnected()) {
            throw new Error('Not connected');
        }

        let queues = Array.from(this.mockQueues.values()).map(q => ({
            name: q.name,
            depth: q.messages.length,
            type: q.type
        }));

        if (filter) {
            queues = queues.filter(q => q.name.includes(filter));
        }

        return queues;
    }

    /**
     * Get queue properties
     */
    async getQueueProperties(queueName: string): Promise<QueueProperties> {
        this.log(`Getting properties for queue: ${queueName}`);
        
        if (!this.isConnected()) {
            throw new Error('Not connected');
        }

        const queue = this.mockQueues.get(queueName);
        if (!queue) {
            throw new Error(`Queue ${queueName} not found`);
        }

        return {
            name: queue.name,
            depth: queue.messages.length,
            maxDepth: 5000,
            description: queue.description,
            creationTime: new Date(),
            type: queue.type,
            status: 'Active'
        };
    }

    /**
     * Get queue depth
     */
    async getQueueDepth(queueName: string): Promise<number> {
        this.log(`Getting depth for queue: ${queueName}`);
        
        if (!this.isConnected()) {
            throw new Error('Not connected');
        }

        const queue = this.mockQueues.get(queueName);
        if (!queue) {
            throw new Error(`Queue ${queueName} not found`);
        }

        return queue.messages.length;
    }

    /**
     * Browse messages
     */
    async browseMessages(queueName: string, options?: BrowseOptions): Promise<Message[]> {
        const limit = options?.limit || 10;
        const startPosition = options?.startPosition || 0;
        
        this.log(`Browsing messages in queue: ${queueName} (limit: ${limit}, start: ${startPosition})`);
        
        if (!this.isConnected()) {
            throw new Error('Not connected');
        }

        const queue = this.mockQueues.get(queueName);
        if (!queue) {
            throw new Error(`Queue ${queueName} not found`);
        }

        return queue.getMessages(startPosition, limit);
    }

    /**
     * Put a message
     */
    async putMessage(queueName: string, payload: string | Buffer, properties?: MessageProperties): Promise<void> {
        this.log(`Putting message to queue: ${queueName}`);
        
        if (!this.isConnected()) {
            throw new Error('Not connected');
        }

        const queue = this.mockQueues.get(queueName);
        if (!queue) {
            throw new Error(`Queue ${queueName} not found`);
        }

        queue.addMessage(payload, properties);
    }

    /**
     * Delete a message
     */
    async deleteMessage(queueName: string, messageId: string): Promise<void> {
        this.log(`Deleting message ${messageId} from queue: ${queueName}`);
        
        if (!this.isConnected()) {
            throw new Error('Not connected');
        }

        const queue = this.mockQueues.get(queueName);
        if (!queue) {
            throw new Error(`Queue ${queueName} not found`);
        }

        queue.deleteMessage(messageId);
    }

    /**
     * Delete multiple messages
     */
    async deleteMessages(queueName: string, messageIds: string[]): Promise<void> {
        this.log(`Deleting ${messageIds.length} messages from queue: ${queueName}`);
        
        if (!this.isConnected()) {
            throw new Error('Not connected');
        }

        const queue = this.mockQueues.get(queueName);
        if (!queue) {
            throw new Error(`Queue ${queueName} not found`);
        }

        for (const messageId of messageIds) {
            queue.deleteMessage(messageId);
        }
    }

    /**
     * Clear a queue
     */
    async clearQueue(queueName: string): Promise<void> {
        this.log(`Clearing queue: ${queueName}`);
        
        if (!this.isConnected()) {
            throw new Error('Not connected');
        }

        const queue = this.mockQueues.get(queueName);
        if (!queue) {
            throw new Error(`Queue ${queueName} not found`);
        }

        queue.clear();
    }

    // Implement other required methods from IMQProvider
    // These are simplified implementations for the mock provider

    async listTopics(filter?: string): Promise<TopicInfo[]> {
        return Array.from(this.mockTopics.values()).map(t => ({
            name: t.name,
            topicString: t.topicString,
            description: t.description,
            type: 'Local',
            status: 'Available'
        }));
    }

    async getTopicProperties(topicName: string): Promise<TopicProperties> {
        const topic = this.mockTopics.get(topicName);
        if (!topic) {
            throw new Error(`Topic ${topicName} not found`);
        }

        return {
            name: topic.name,
            topicString: topic.topicString,
            description: topic.description,
            creationTime: new Date(),
            type: 'Local',
            status: 'Available',
            publishCount: 0,
            subscriptionCount: 0
        };
    }

    async publishMessage(topicName: string, payload: string | Buffer): Promise<void> {
        // Mock implementation
    }

    async listChannels(filter?: string): Promise<ChannelInfo[]> {
        return Array.from(this.mockChannels.values()).map(c => ({
            name: c.name,
            type: c.type,
            connectionName: '',
            status: ChannelStatus.INACTIVE,
            description: c.description
        }));
    }

    async getChannelProperties(channelName: string): Promise<ChannelProperties> {
        const channel = this.mockChannels.get(channelName);
        if (!channel) {
            throw new Error(`Channel ${channelName} not found`);
        }

        return {
            name: channel.name,
            type: channel.type,
            connectionName: '',
            status: ChannelStatus.INACTIVE,
            description: channel.description,
            maxMessageLength: 4194304,
            heartbeatInterval: 300,
            batchSize: 50,
            creationTime: new Date(),
            lastStartTime: undefined,
            lastUsedTime: new Date()
        };
    }

    async startChannel(channelName: string): Promise<void> {
        // Mock implementation
    }

    async stopChannel(channelName: string): Promise<void> {
        // Mock implementation
    }
}

/**
 * Mock Queue class
 */
class MockQueue {
    name: string;
    type: string;
    description: string;
    messages: MockMessage[] = [];

    constructor(name: string, type: string, description: string) {
        this.name = name;
        this.type = type;
        this.description = description;
    }

    addMessage(payload: string | Buffer, properties?: MessageProperties): void {
        const message = new MockMessage(payload, properties);
        this.messages.push(message);
    }

    getMessages(startPosition: number, limit: number): Message[] {
        return this.messages
            .slice(startPosition, startPosition + limit)
            .map(m => m.toMessage());
    }

    deleteMessage(messageId: string): void {
        const index = this.messages.findIndex(m => m.id === messageId);
        if (index !== -1) {
            this.messages.splice(index, 1);
        }
    }

    clear(): void {
        this.messages = [];
    }
}

/**
 * Mock Message class
 */
class MockMessage {
    id: string;
    correlationId: string;
    timestamp: Date;
    payload: string | Buffer;
    properties: MessageProperties;

    constructor(payload: string | Buffer, properties?: MessageProperties) {
        this.id = this.generateId();
        this.correlationId = this.generateId();
        this.timestamp = new Date();
        this.payload = payload;
        this.properties = properties || {
            format: 'MQSTR',
            persistence: 1,
            priority: 5
        };
    }

    generateId(): string {
        return Math.random().toString(16).substring(2, 10) + 
               Math.random().toString(16).substring(2, 10);
    }

    toMessage(): Message {
        return {
            id: this.id,
            correlationId: this.correlationId,
            timestamp: this.timestamp,
            payload: this.payload,
            properties: this.properties
        };
    }
}

/**
 * Mock Topic class
 */
class MockTopic {
    name: string;
    topicString: string;
    description: string;

    constructor(name: string, topicString: string, description: string) {
        this.name = name;
        this.topicString = topicString;
        this.description = description;
    }
}

/**
 * Mock Channel class
 */
class MockChannel {
    name: string;
    type: string;
    description: string;

    constructor(name: string, type: string, description: string) {
        this.name = name;
        this.type = type;
        this.description = description;
    }
}
