import { IMQProvider, QueueInfo, BrowseOptions, Message, MessageProperties, QueueProperties, TopicInfo, TopicProperties, ChannelInfo, ChannelProperties, ChannelStatus } from './IMQProvider';
import { IBMMQConnectionProfile } from '../models/connectionProfile';
import * as vscode from 'vscode';

/**
 * Wrapper for IBM MQ Provider that handles optional dependency gracefully
 * This allows the extension to load even when IBM MQ libraries are not available
 */
export class IBMMQProviderWrapper implements IMQProvider {
    private actualProvider: IMQProvider | null = null;
    private outputChannel: vscode.OutputChannel;

    constructor() {
        this.outputChannel = vscode.window.createOutputChannel('MQExplorer: IBM MQ');
    }

    /**
     * Lazy load the actual IBM MQ provider
     */
    private async loadActualProvider(): Promise<IMQProvider> {
        if (this.actualProvider === null) {
            try {
                // Try to load IBM MQ library first
                require('ibmmq');

                // If successful, load the actual provider
                const { IBMMQProvider } = require('./IBMMQProvider');
                this.actualProvider = new IBMMQProvider();
                this.outputChannel.appendLine('✅ IBM MQ provider loaded successfully');
            } catch (error) {
                const errorMessage = `IBM MQ library not available: ${(error as Error).message}`;
                this.outputChannel.appendLine(`❌ ${errorMessage}`);
                throw new Error(`${errorMessage}\n\nTo use IBM MQ functionality, please install the IBM MQ client libraries:\n1. Download IBM MQ client from IBM website\n2. Install the client libraries\n3. Restart VS Code\n\nAlternatively, you can use other messaging providers like RabbitMQ, Kafka, Azure Service Bus, or AWS SQS.`);
            }
        }
        return this.actualProvider!; // We know it's not null at this point
    }

    async connect(connectionParams: IBMMQConnectionProfile['connectionParams'], context?: vscode.ExtensionContext): Promise<void> {
        const provider = await this.loadActualProvider();
        return provider.connect(connectionParams, context);
    }

    async disconnect(): Promise<void> {
        if (this.actualProvider) {
            return this.actualProvider.disconnect();
        }
        // If no provider was loaded, nothing to disconnect
        return Promise.resolve();
    }

    isConnected(): boolean {
        return this.actualProvider ? this.actualProvider.isConnected() : false;
    }

    async listQueues(filter?: string): Promise<QueueInfo[]> {
        const provider = await this.loadActualProvider();
        return provider.listQueues(filter);
    }

    async browseMessages(queueName: string, options?: BrowseOptions): Promise<Message[]> {
        const provider = await this.loadActualProvider();
        return provider.browseMessages(queueName, options);
    }

    async putMessage(queueName: string, payload: string | Buffer, properties?: MessageProperties): Promise<void> {
        const provider = await this.loadActualProvider();
        return provider.putMessage(queueName, payload, properties);
    }

    async deleteMessage(queueName: string, messageId: string): Promise<void> {
        const provider = await this.loadActualProvider();
        return provider.deleteMessage(queueName, messageId);
    }

    async deleteMessages(queueName: string, messageIds: string[]): Promise<void> {
        const provider = await this.loadActualProvider();
        return provider.deleteMessages(queueName, messageIds);
    }

    async clearQueue(queueName: string): Promise<void> {
        const provider = await this.loadActualProvider();
        return provider.clearQueue(queueName);
    }

    async getQueueDepth(queueName: string): Promise<number> {
        const provider = await this.loadActualProvider();
        return provider.getQueueDepth(queueName);
    }

    async getQueueProperties(queueName: string): Promise<QueueProperties> {
        const provider = await this.loadActualProvider();
        return provider.getQueueProperties(queueName);
    }

    async listTopics(filter?: string): Promise<TopicInfo[]> {
        const provider = await this.loadActualProvider();
        return provider.listTopics ? provider.listTopics(filter) : [];
    }

    async getTopicProperties(topicName: string): Promise<TopicProperties> {
        const provider = await this.loadActualProvider();
        if (!provider.getTopicProperties) {
            throw new Error('Topic properties not supported by this provider');
        }
        return provider.getTopicProperties(topicName);
    }

    async listChannels(filter?: string): Promise<ChannelInfo[]> {
        const provider = await this.loadActualProvider();
        return provider.listChannels ? provider.listChannels(filter) : [];
    }

    async getChannelProperties(channelName: string): Promise<ChannelProperties> {
        const provider = await this.loadActualProvider();
        if (!provider.getChannelProperties) {
            throw new Error('Channel properties not supported by this provider');
        }
        return provider.getChannelProperties(channelName);
    }

    async getChannelStatus(channelName: string): Promise<ChannelStatus> {
        const provider = await this.loadActualProvider();
        // Check if the method exists on the provider
        if ('getChannelStatus' in provider && typeof (provider as any).getChannelStatus === 'function') {
            return (provider as any).getChannelStatus(channelName);
        }
        // Fallback implementation
        return ChannelStatus.UNKNOWN;
    }

    // Pass through any additional methods that might exist on the actual provider
    setConnectionManager(connectionManager: any): void {
        if (this.actualProvider && 'setConnectionManager' in this.actualProvider) {
            (this.actualProvider as any).setConnectionManager(connectionManager);
        }
    }
}
