import * as vscode from 'vscode';
import * as path from 'path';
import { ConnectionManager } from '../services/connectionManager';
import { ConnectionProfile, IBMMQConnectionProfile } from '../models/connectionProfile';
import { QueueInfo } from '../providers/IMQProvider';

/**
 * Tree item types for MQ Explorer
 */
export enum MQTreeItemType {
    CONNECTION_PROFILE = 'connectionProfile',
    QUEUE_MANAGER = 'queueManager',
    QUEUES_FOLDER = 'queuesFolder',
    QUEUE = 'queue',
    TOPICS_FOLDER = 'topicsFolder',
    TOPIC = 'topic',
    CHANNELS_FOLDER = 'channelsFolder',
    CHANNEL = 'channel',
}

/**
 * Tree item for MQ Explorer
 */
export class MQTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly type: MQTreeItemType,
        public readonly profileId?: string,
        public readonly queueName?: string,
        public readonly contextValue?: string,
        public readonly description?: string,
        public readonly iconPath?: string | vscode.ThemeIcon
    ) {
        super(label, collapsibleState);

        this.tooltip = this.label;
        if (this.description) {
            this.tooltip += ` (${this.description})`;
        }

        this.contextValue = contextValue || type;
    }
}

/**
 * Tree data provider for MQ Explorer
 */
export class MQExplorerTreeDataProvider implements vscode.TreeDataProvider<MQTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<MQTreeItem | undefined | null | void> = new vscode.EventEmitter<MQTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<MQTreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private connectionManager: ConnectionManager;
    private extensionPath: string;
    private filterValue: string = '';

    constructor(context: vscode.ExtensionContext) {
        this.connectionManager = ConnectionManager.getInstance(context);
        this.extensionPath = context.extensionPath;

        // Listen for queue depth changes
        this.connectionManager.on(ConnectionManager.QUEUE_DEPTH_CHANGED, (queueName: string, depth: number) => {
            this.log(`Queue depth changed: ${queueName} (${depth})`);
            this.refresh();
        });

        // Listen for queue updates
        this.connectionManager.on(ConnectionManager.QUEUE_UPDATED, (queueName: string) => {
            this.log(`Queue updated: ${queueName}`);
            this.refresh();
        });
    }

    /**
     * Log a message to the console
     */
    private log(message: string): void {
        console.log(`[MQExplorerTreeDataProvider] ${message}`);
    }

    /**
     * Refresh the tree view
     */
    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    /**
     * Set a filter for the tree view
     * @param filter Filter string to apply
     */
    setFilter(filter: string): void {
        this.filterValue = filter;
        this.refresh();
    }

    /**
     * Get the current filter
     */
    getFilter(): string {
        return this.filterValue;
    }

    /**
     * Clear the current filter
     */
    clearFilter(): void {
        this.filterValue = '';
        this.refresh();
    }

    /**
     * Get tree item for a given element
     */
    getTreeItem(element: MQTreeItem): vscode.TreeItem {
        return element;
    }

    /**
     * Get children of a tree item
     */
    async getChildren(element?: MQTreeItem): Promise<MQTreeItem[]> {
        // Root level - show connection profiles
        if (!element) {
            return this.getConnectionProfiles();
        }

        // Handle different tree item types
        switch (element.type) {
            case MQTreeItemType.CONNECTION_PROFILE:
                // If connected, show queue manager
                if (element.profileId && this.connectionManager.isConnected(element.profileId)) {
                    return this.getQueueManagerItems(element.profileId, element.label);
                }
                return [];

            case MQTreeItemType.QUEUE_MANAGER:
                // Show folders under queue manager
                if (element.profileId) {
                    return this.getQueueManagerFolders(element.profileId);
                }
                return [];

            case MQTreeItemType.QUEUES_FOLDER:
                // Show queues
                if (element.profileId) {
                    return this.getQueues(element.profileId);
                }
                return [];

            case MQTreeItemType.TOPICS_FOLDER:
                // Show topics
                if (element.profileId) {
                    return this.getTopics(element.profileId);
                }
                return [];

            case MQTreeItemType.CHANNELS_FOLDER:
                // Show channels
                if (element.profileId) {
                    return this.getChannels(element.profileId);
                }
                return [];

            default:
                return [];
        }
    }

    /**
     * Get connection profile items
     */
    private async getConnectionProfiles(): Promise<MQTreeItem[]> {
        let profiles = await this.connectionManager.getConnectionProfiles();

        // Apply filter if set
        if (this.filterValue) {
            const filterLower = this.filterValue.toLowerCase();
            profiles = profiles.filter(profile => {
                // Always check name
                if (profile.name.toLowerCase().includes(filterLower)) {
                    return true;
                }

                // Check IBM MQ specific fields
                if (profile.providerType === 'ibmmq') {
                    const ibmProfile = profile as IBMMQConnectionProfile;
                    if (ibmProfile.connectionParams?.queueManager?.toLowerCase().includes(filterLower)) {
                        return true;
                    }
                    if (ibmProfile.connectionParams?.host?.toLowerCase().includes(filterLower)) {
                        return true;
                    }
                    if (ibmProfile.connectionParams?.channel?.toLowerCase().includes(filterLower)) {
                        return true;
                    }
                }

                return false;
            });
        }

        if (profiles.length === 0) {
            return [
                new MQTreeItem(
                    'No connection profiles found',
                    vscode.TreeItemCollapsibleState.None,
                    MQTreeItemType.CONNECTION_PROFILE,
                    undefined,
                    undefined,
                    'noConnectionProfiles',
                    undefined,
                    new vscode.ThemeIcon('info')
                )
            ];
        }

        return profiles.map(profile => {
            const isConnected = this.connectionManager.isConnected(profile.id);

            return new MQTreeItem(
                profile.name,
                isConnected ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.Collapsed,
                MQTreeItemType.CONNECTION_PROFILE,
                profile.id,
                undefined,
                isConnected ? 'connectedProfile' : 'disconnectedProfile',
                profile.providerType,
                new vscode.ThemeIcon(isConnected ? 'plug' : 'debug-disconnect')
            );
        });
    }

    /**
     * Get queue manager items for a connected profile
     */
    private getQueueManagerItems(profileId: string, profileName: string): MQTreeItem[] {
        // For IBM MQ, the queue manager is a single item
        // For other providers, this might be different

        return [
            new MQTreeItem(
                profileName,
                vscode.TreeItemCollapsibleState.Expanded,
                MQTreeItemType.QUEUE_MANAGER,
                profileId,
                undefined,
                'queueManager',
                'Queue Manager',
                new vscode.ThemeIcon('server')
            )
        ];
    }

    /**
     * Get folders under a queue manager
     */
    private getQueueManagerFolders(profileId: string): MQTreeItem[] {
        // Return Queues, Topics, and Channels folders
        return [
            new MQTreeItem(
                'Queues',
                vscode.TreeItemCollapsibleState.Collapsed,
                MQTreeItemType.QUEUES_FOLDER,
                profileId,
                undefined,
                'queuesFolder',
                undefined,
                new vscode.ThemeIcon('database')
            ),
            new MQTreeItem(
                'Topics',
                vscode.TreeItemCollapsibleState.Collapsed,
                MQTreeItemType.TOPICS_FOLDER,
                profileId,
                undefined,
                'topicsFolder',
                undefined,
                new vscode.ThemeIcon('broadcast')
            ),
            new MQTreeItem(
                'Channels',
                vscode.TreeItemCollapsibleState.Collapsed,
                MQTreeItemType.CHANNELS_FOLDER,
                profileId,
                undefined,
                'channelsFolder',
                undefined,
                new vscode.ThemeIcon('circuit-board')
            )
        ];
    }

    /**
     * Get queues for a connected profile
     */
    private async getQueues(profileId: string): Promise<MQTreeItem[]> {
        try {
            const provider = this.connectionManager.getProvider(profileId);

            if (!provider) {
                throw new Error('Provider not found');
            }

            // Get queues from provider
            let queues = await provider.listQueues();

            // Apply filter if set
            if (this.filterValue) {
                const filterLower = this.filterValue.toLowerCase();
                queues = queues.filter(queue =>
                    queue.name.toLowerCase().includes(filterLower) ||
                    (queue.description && queue.description.toLowerCase().includes(filterLower))
                );
            }

            if (queues.length === 0) {
                return [
                    new MQTreeItem(
                        'No queues found',
                        vscode.TreeItemCollapsibleState.None,
                        MQTreeItemType.QUEUE,
                        profileId,
                        undefined,
                        'noQueues',
                        undefined,
                        new vscode.ThemeIcon('info')
                    )
                ];
            }

            return queues.map(queue => {
                return new MQTreeItem(
                    queue.name,
                    vscode.TreeItemCollapsibleState.None,
                    MQTreeItemType.QUEUE,
                    profileId,
                    queue.name,
                    'queue',
                    queue.depth !== undefined ? `Depth: ${queue.depth}` : undefined,
                    new vscode.ThemeIcon('inbox')
                );
            });
        } catch (error) {
            vscode.window.showErrorMessage(`Error listing queues: ${(error as Error).message}`);

            return [
                new MQTreeItem(
                    `Error: ${(error as Error).message}`,
                    vscode.TreeItemCollapsibleState.None,
                    MQTreeItemType.QUEUE,
                    profileId,
                    undefined,
                    'errorQueues',
                    undefined,
                    new vscode.ThemeIcon('error')
                )
            ];
        }
    }

    /**
     * Get topics for a connected profile
     */
    private async getTopics(profileId: string): Promise<MQTreeItem[]> {
        try {
            const provider = this.connectionManager.getProvider(profileId);

            if (!provider) {
                throw new Error('Provider not found');
            }

            // Check if the provider supports topics
            if (!provider.listTopics) {
                return [
                    new MQTreeItem(
                        'Topics not supported by this provider',
                        vscode.TreeItemCollapsibleState.None,
                        MQTreeItemType.TOPIC,
                        profileId,
                        undefined,
                        'topicsNotSupported',
                        undefined,
                        new vscode.ThemeIcon('warning')
                    )
                ];
            }

            // Get topics from provider
            let topics = await provider.listTopics();

            // Apply filter if set
            if (this.filterValue) {
                const filterLower = this.filterValue.toLowerCase();
                topics = topics.filter(topic =>
                    topic.name.toLowerCase().includes(filterLower) ||
                    topic.topicString.toLowerCase().includes(filterLower) ||
                    (topic.description && topic.description.toLowerCase().includes(filterLower))
                );
            }

            if (topics.length === 0) {
                return [
                    new MQTreeItem(
                        'No topics found',
                        vscode.TreeItemCollapsibleState.None,
                        MQTreeItemType.TOPIC,
                        profileId,
                        undefined,
                        'noTopics',
                        undefined,
                        new vscode.ThemeIcon('info')
                    )
                ];
            }

            return topics.map(topic => {
                return new MQTreeItem(
                    topic.name,
                    vscode.TreeItemCollapsibleState.None,
                    MQTreeItemType.TOPIC,
                    profileId,
                    topic.topicString,
                    'topic',
                    topic.topicString,
                    new vscode.ThemeIcon('broadcast')
                );
            });
        } catch (error) {
            vscode.window.showErrorMessage(`Error listing topics: ${(error as Error).message}`);

            return [
                new MQTreeItem(
                    `Error: ${(error as Error).message}`,
                    vscode.TreeItemCollapsibleState.None,
                    MQTreeItemType.TOPIC,
                    profileId,
                    undefined,
                    'errorTopics',
                    undefined,
                    new vscode.ThemeIcon('error')
                )
            ];
        }
    }

    /**
     * Get channels for a connected profile
     */
    private async getChannels(profileId: string): Promise<MQTreeItem[]> {
        try {
            const provider = this.connectionManager.getProvider(profileId);

            if (!provider) {
                throw new Error('Provider not found');
            }

            // Check if the provider supports channels
            if (!provider.listChannels) {
                return [
                    new MQTreeItem(
                        'Channels not supported by this provider',
                        vscode.TreeItemCollapsibleState.None,
                        MQTreeItemType.CHANNEL,
                        profileId,
                        undefined,
                        'channelsNotSupported',
                        undefined,
                        new vscode.ThemeIcon('warning')
                    )
                ];
            }

            // Get channels from provider
            let channels = await provider.listChannels();

            // Apply filter if set
            if (this.filterValue) {
                const filterLower = this.filterValue.toLowerCase();
                channels = channels.filter(channel =>
                    channel.name.toLowerCase().includes(filterLower) ||
                    (channel.type && channel.type.toLowerCase().includes(filterLower)) ||
                    (channel.connectionName && channel.connectionName.toLowerCase().includes(filterLower)) ||
                    (channel.description && channel.description.toLowerCase().includes(filterLower))
                );
            }

            if (channels.length === 0) {
                return [
                    new MQTreeItem(
                        'No channels found',
                        vscode.TreeItemCollapsibleState.None,
                        MQTreeItemType.CHANNEL,
                        profileId,
                        undefined,
                        'noChannels',
                        undefined,
                        new vscode.ThemeIcon('info')
                    )
                ];
            }

            return channels.map(channel => {
                // Choose icon based on channel status
                let icon: vscode.ThemeIcon;
                let contextValue = 'channel';

                switch (channel.status) {
                    case 'Running':
                        icon = new vscode.ThemeIcon('play');
                        contextValue = 'runningChannel';
                        break;
                    case 'Retrying':
                        icon = new vscode.ThemeIcon('sync');
                        contextValue = 'retryingChannel';
                        break;
                    case 'Stopped':
                        icon = new vscode.ThemeIcon('stop');
                        contextValue = 'stoppedChannel';
                        break;
                    case 'Inactive':
                    default:
                        icon = new vscode.ThemeIcon('debug-disconnect');
                        contextValue = 'inactiveChannel';
                        break;
                }

                return new MQTreeItem(
                    channel.name,
                    vscode.TreeItemCollapsibleState.None,
                    MQTreeItemType.CHANNEL,
                    profileId,
                    channel.name,
                    contextValue,
                    `${channel.type} - ${channel.status}${channel.connectionName ? ` - ${channel.connectionName}` : ''}`,
                    icon
                );
            });
        } catch (error) {
            vscode.window.showErrorMessage(`Error listing channels: ${(error as Error).message}`);

            return [
                new MQTreeItem(
                    `Error: ${(error as Error).message}`,
                    vscode.TreeItemCollapsibleState.None,
                    MQTreeItemType.CHANNEL,
                    profileId,
                    undefined,
                    'errorChannels',
                    undefined,
                    new vscode.ThemeIcon('error')
                )
            ];
        }
    }
}
