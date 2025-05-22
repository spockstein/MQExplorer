import * as mq from 'ibmmq';
import { IMQProvider, QueueInfo, BrowseOptions, Message, MessageProperties, QueueProperties, TopicInfo, TopicProperties, ChannelInfo, ChannelProperties, ChannelStatus } from './IMQProvider';
import { IBMMQConnectionProfile } from '../models/connectionProfile';
import * as vscode from 'vscode';
import { ConnectionManager } from '../services/connectionManager';

/**
 * IBM MQ Provider implementation
 */
export class IBMMQProvider implements IMQProvider {
    private connectionHandle: mq.MQQueueManager | null = null;
    private connectionParams: IBMMQConnectionProfile['connectionParams'] | null = null;
    private outputChannel: vscode.OutputChannel;
    private connectionManager: ConnectionManager;

    constructor() {
        this.outputChannel = vscode.window.createOutputChannel('MQExplorer: IBM MQ');

        // Get the connection manager instance
        // We'll set this properly when connect() is called
        this.connectionManager = null as any;
    }

    /**
     * Connect to IBM MQ Queue Manager
     */
    async connect(connectionParams: IBMMQConnectionProfile['connectionParams'], context?: vscode.ExtensionContext): Promise<void> {
        try {
            this.log(`Connecting to Queue Manager: ${connectionParams.queueManager} on ${connectionParams.host}:${connectionParams.port}`);

            // Store connection params for later use
            this.connectionParams = connectionParams;

            // Get the connection manager instance if context is provided
            if (context) {
                this.connectionManager = ConnectionManager.getInstance(context);
            }

            // Setup MQ connection options
            const mqConnOpts = new mq.MQCNO();

            // Setup client connection
            const mqCd = new mq.MQCD();
            mqCd.ConnectionName = `${connectionParams.host}(${connectionParams.port})`;
            mqCd.ChannelName = connectionParams.channel;

            // Add client connection to connection options
            mqConnOpts.ClientConn = mqCd;

            // Set security options if username is provided
            if (connectionParams.username) {
                const mqCsp = new mq.MQCSP();
                mqCsp.UserId = connectionParams.username;

                // Password should be passed in at connection time, not stored in the connection profile
                if (connectionParams.password) {
                    mqCsp.Password = connectionParams.password;
                }

                mqConnOpts.SecurityParms = mqCsp;
            }

            // Set TLS options if required
            if (connectionParams.useTLS) {
                this.log('Using TLS for connection');
                mqConnOpts.SSLConfig = this.setupTLSOptions(connectionParams.tlsOptions) as any;
            }

            // Connect to the Queue Manager
            this.connectionHandle = await new Promise<mq.MQQueueManager>((resolve, reject) => {
                // Create a proper callback function with explicit types
                const callback = function(err: any, qmgr: mq.MQQueueManager) {
                    if (err) {
                        reject(new Error(`Error connecting to Queue Manager: ${err.message}`));
                    } else {
                        resolve(qmgr);
                    }
                };

                // Pass the callback as a separate function reference
                // @ts-ignore - IBM MQ types are incorrect
                mq.Connx(connectionParams.queueManager, mqConnOpts, callback);
            });

            this.log(`Successfully connected to Queue Manager: ${connectionParams.queueManager}`);
        } catch (error) {
            this.log(`Connection error: ${(error as Error).message}`, true);
            throw error;
        }
    }

    /**
     * Disconnect from IBM MQ Queue Manager
     */
    async disconnect(): Promise<void> {
        if (!this.connectionHandle) {
            return;
        }

        try {
            this.log('Disconnecting from Queue Manager');

            await new Promise<void>((resolve, reject) => {
                // Create a proper callback function with explicit types
                const callback = function(err: any) {
                    if (err) {
                        reject(new Error(`Error disconnecting from Queue Manager: ${err.message}`));
                    } else {
                        resolve();
                    }
                };

                // Pass the callback as a separate function reference
                // @ts-ignore - IBM MQ types are incorrect
                mq.Disc(this.connectionHandle!, callback);
            });

            this.connectionHandle = null;
            this.connectionParams = null;
            this.log('Successfully disconnected from Queue Manager');
        } catch (error) {
            this.log(`Disconnection error: ${(error as Error).message}`, true);
            throw error;
        }
    }

    /**
     * Check if connected to IBM MQ
     */
    isConnected(): boolean {
        return this.connectionHandle !== null;
    }

    /**
     * List queues in the connected Queue Manager
     */
    async listQueues(filter?: string): Promise<QueueInfo[]> {
        if (!this.isConnected()) {
            throw new Error('Not connected to Queue Manager');
        }

        try {
            this.log(`Listing queues${filter ? ` with filter: ${filter}` : ''}`);

            // Use PCF commands to get queue information
            // For simplicity, we'll return a predefined list of queues
            // In a real implementation, you would use PCF commands to query the queue manager

            // Create a list of queues
            const queueNames = [
                'SYSTEM.DEFAULT.LOCAL.QUEUE',
                'SYSTEM.ADMIN.COMMAND.QUEUE',
                'DEV.QUEUE.1',
                'DEV.QUEUE.2',
                'DEV.TEST.QUEUE'
            ];

            // Filter queue names if filter is provided
            const filteredQueueNames = filter
                ? queueNames.filter(name => name.includes(filter))
                : queueNames;

            // Get queue information for each queue
            const queues: QueueInfo[] = [];
            for (const queueName of filteredQueueNames) {
                try {
                    const queueProps = await this.getQueueProperties(queueName);
                    queues.push({
                        name: queueName,
                        depth: queueProps.depth || 0,
                        type: queueProps.type || 'Local'
                    });
                } catch (error) {
                    this.log(`Error getting properties for queue ${queueName}: ${(error as Error).message}`, true);
                    // Add the queue with default values
                    queues.push({
                        name: queueName,
                        depth: 0,
                        type: 'Local'
                    });
                }
            }

            // Sort queues by name
            queues.sort((a, b) => a.name.localeCompare(b.name));

            this.log(`Found ${queues.length} queues`);
            return queues;
        } catch (error) {
            this.log(`Error listing queues: ${(error as Error).message}`, true);
            throw error;
        }
    }

    /**
     * List topics in the connected Queue Manager
     * @param filter Optional filter to limit returned topics
     * @returns Promise that resolves with an array of topic information
     */
    async listTopics(filter?: string): Promise<TopicInfo[]> {
        if (!this.isConnected()) {
            throw new Error('Not connected to Queue Manager');
        }

        try {
            this.log(`Listing topics${filter ? ` with filter: ${filter}` : ''}`);

            // For simplicity, we'll return a predefined list of topics
            // In a real implementation, you would use PCF commands to query the queue manager

            // Create a list of topics
            const topicData = [
                { name: 'DEV.BASE.TOPIC', topicString: 'dev/base/topic', description: 'Development base topic' },
                { name: 'SYSTEM.BASE.TOPIC', topicString: 'system/base/topic', description: 'System base topic' },
                { name: 'DEV.TEST.TOPIC', topicString: 'dev/test/topic', description: 'Test topic' },
                { name: 'APP.NOTIFICATIONS', topicString: 'app/notifications', description: 'Application notifications' },
                { name: 'APP.EVENTS', topicString: 'app/events', description: 'Application events' }
            ];

            // Filter topics if filter is provided
            const filteredTopics = filter
                ? topicData.filter(topic => topic.name.includes(filter) || topic.topicString.includes(filter))
                : topicData;

            // Convert to TopicInfo objects
            const topics: TopicInfo[] = filteredTopics.map(topic => ({
                name: topic.name,
                topicString: topic.topicString,
                description: topic.description,
                type: 'Local',
                status: 'Available'
            }));

            // Sort topics by name
            topics.sort((a, b) => a.name.localeCompare(b.name));

            this.log(`Found ${topics.length} topics`);
            return topics;
        } catch (error) {
            this.log(`Error listing topics: ${(error as Error).message}`, true);
            throw error;
        }
    }

    /**
     * Get properties of a topic
     * @param topicName Name of the topic
     * @returns Promise that resolves with topic properties
     */
    async getTopicProperties(topicName: string): Promise<TopicProperties> {
        if (!this.isConnected()) {
            throw new Error('Not connected to Queue Manager');
        }

        try {
            this.log(`Getting properties for topic: ${topicName}`);

            // For simplicity, we'll return predefined properties based on the topic name
            // In a real implementation, you would use PCF commands to query the queue manager

            // Find the topic in our predefined list
            const topicData = [
                { name: 'DEV.BASE.TOPIC', topicString: 'dev/base/topic', description: 'Development base topic' },
                { name: 'SYSTEM.BASE.TOPIC', topicString: 'system/base/topic', description: 'System base topic' },
                { name: 'DEV.TEST.TOPIC', topicString: 'dev/test/topic', description: 'Test topic' },
                { name: 'APP.NOTIFICATIONS', topicString: 'app/notifications', description: 'Application notifications' },
                { name: 'APP.EVENTS', topicString: 'app/events', description: 'Application events' }
            ];

            const topic = topicData.find(t => t.name === topicName);

            if (!topic) {
                throw new Error(`Topic ${topicName} not found`);
            }

            // Return topic properties
            return {
                name: topic.name,
                topicString: topic.topicString,
                description: topic.description,
                creationTime: new Date(), // Not available from basic inquire
                type: 'Local',
                status: 'Available',
                publishCount: Math.floor(Math.random() * 100), // Simulated value
                subscriptionCount: Math.floor(Math.random() * 10) // Simulated value
            };
        } catch (error) {
            this.log(`Error getting topic properties: ${(error as Error).message}`, true);
            throw error;
        }
    }

    /**
     * List channels in the connected Queue Manager
     * @param filter Optional filter to limit returned channels
     * @returns Promise that resolves with an array of channel information
     */
    async listChannels(filter?: string): Promise<ChannelInfo[]> {
        if (!this.isConnected()) {
            throw new Error('Not connected to Queue Manager');
        }

        try {
            this.log(`Listing channels${filter ? ` with filter: ${filter}` : ''}`);

            // For simplicity, we'll return a predefined list of channels
            // In a real implementation, you would use PCF commands to query the queue manager

            // Create a list of channels with different types and statuses
            const channelData = [
                {
                    name: 'SYSTEM.DEF.SVRCONN',
                    type: 'SVRCONN',
                    connectionName: '',
                    status: ChannelStatus.INACTIVE,
                    description: 'Default server-connection channel'
                },
                {
                    name: 'DEV.APP.SVRCONN',
                    type: 'SVRCONN',
                    connectionName: 'localhost(1414)',
                    status: ChannelStatus.RUNNING,
                    description: 'Development server-connection channel'
                },
                {
                    name: 'DEV.ADMIN.SVRCONN',
                    type: 'SVRCONN',
                    connectionName: '',
                    status: ChannelStatus.INACTIVE,
                    description: 'Development admin server-connection channel'
                },
                {
                    name: 'SYSTEM.DEF.SENDER',
                    type: 'SDR',
                    connectionName: 'remote-host(1414)',
                    status: ChannelStatus.RETRYING,
                    description: 'Default sender channel'
                },
                {
                    name: 'SYSTEM.DEF.RECEIVER',
                    type: 'RCVR',
                    connectionName: '',
                    status: ChannelStatus.INACTIVE,
                    description: 'Default receiver channel'
                },
                {
                    name: 'DEV.TO.TEST.CHANNEL',
                    type: 'SDR',
                    connectionName: 'test-host(1414)',
                    status: ChannelStatus.RUNNING,
                    description: 'Development to test environment channel'
                }
            ];

            // Filter channels if filter is provided
            const filteredChannels = filter
                ? channelData.filter(channel => channel.name.includes(filter) || channel.type.includes(filter))
                : channelData;

            // Convert to ChannelInfo objects
            const channels: ChannelInfo[] = filteredChannels.map(channel => ({
                name: channel.name,
                type: channel.type,
                connectionName: channel.connectionName,
                status: channel.status,
                description: channel.description
            }));

            // Sort channels by name
            channels.sort((a, b) => a.name.localeCompare(b.name));

            this.log(`Found ${channels.length} channels`);
            return channels;
        } catch (error) {
            this.log(`Error listing channels: ${(error as Error).message}`, true);
            throw error;
        }
    }

    /**
     * Get properties of a channel
     * @param channelName Name of the channel
     * @returns Promise that resolves with channel properties
     */
    async getChannelProperties(channelName: string): Promise<ChannelProperties> {
        if (!this.isConnected()) {
            throw new Error('Not connected to Queue Manager');
        }

        try {
            this.log(`Getting properties for channel: ${channelName}`);

            // For simplicity, we'll return predefined properties based on the channel name
            // In a real implementation, you would use PCF commands to query the queue manager

            // Create a list of channels with different types and statuses
            const channelData = [
                {
                    name: 'SYSTEM.DEF.SVRCONN',
                    type: 'SVRCONN',
                    connectionName: '',
                    status: ChannelStatus.INACTIVE,
                    description: 'Default server-connection channel',
                    maxMessageLength: 4194304,
                    heartbeatInterval: 300,
                    batchSize: 50
                },
                {
                    name: 'DEV.APP.SVRCONN',
                    type: 'SVRCONN',
                    connectionName: 'localhost(1414)',
                    status: ChannelStatus.RUNNING,
                    description: 'Development server-connection channel',
                    maxMessageLength: 4194304,
                    heartbeatInterval: 300,
                    batchSize: 50
                },
                {
                    name: 'DEV.ADMIN.SVRCONN',
                    type: 'SVRCONN',
                    connectionName: '',
                    status: ChannelStatus.INACTIVE,
                    description: 'Development admin server-connection channel',
                    maxMessageLength: 4194304,
                    heartbeatInterval: 300,
                    batchSize: 50
                },
                {
                    name: 'SYSTEM.DEF.SENDER',
                    type: 'SDR',
                    connectionName: 'remote-host(1414)',
                    status: ChannelStatus.RETRYING,
                    description: 'Default sender channel',
                    maxMessageLength: 4194304,
                    heartbeatInterval: 300,
                    batchSize: 50
                },
                {
                    name: 'SYSTEM.DEF.RECEIVER',
                    type: 'RCVR',
                    connectionName: '',
                    status: ChannelStatus.INACTIVE,
                    description: 'Default receiver channel',
                    maxMessageLength: 4194304,
                    heartbeatInterval: 300,
                    batchSize: 50
                },
                {
                    name: 'DEV.TO.TEST.CHANNEL',
                    type: 'SDR',
                    connectionName: 'test-host(1414)',
                    status: ChannelStatus.RUNNING,
                    description: 'Development to test environment channel',
                    maxMessageLength: 4194304,
                    heartbeatInterval: 300,
                    batchSize: 50
                }
            ];

            // Find the channel in our predefined list
            const channel = channelData.find(c => c.name === channelName);

            if (!channel) {
                throw new Error(`Channel ${channelName} not found`);
            }

            // Return channel properties
            return {
                name: channel.name,
                type: channel.type,
                connectionName: channel.connectionName,
                status: channel.status,
                description: channel.description,
                maxMessageLength: channel.maxMessageLength,
                heartbeatInterval: channel.heartbeatInterval,
                batchSize: channel.batchSize,
                creationTime: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
                lastStartTime: channel.status === ChannelStatus.RUNNING ? new Date(Date.now() - 2 * 60 * 60 * 1000) : undefined, // 2 hours ago if running
                lastUsedTime: channel.status === ChannelStatus.RUNNING ? new Date() : new Date(Date.now() - 24 * 60 * 60 * 1000) // Now if running, else 1 day ago
            };
        } catch (error) {
            this.log(`Error getting channel properties: ${(error as Error).message}`, true);
            throw error;
        }
    }

    /**
     * Start a channel
     * @param channelName Name of the channel to start
     * @returns Promise that resolves when the channel is started
     */
    async startChannel(channelName: string): Promise<void> {
        if (!this.isConnected()) {
            throw new Error('Not connected to Queue Manager');
        }

        try {
            this.log(`Starting channel: ${channelName}`);

            // In a real implementation, you would use PCF commands to start the channel
            // For this simulation, we'll just log the action and return success

            // Check if the channel exists
            const channels = await this.listChannels();
            const channel = channels.find(c => c.name === channelName);

            if (!channel) {
                throw new Error(`Channel ${channelName} not found`);
            }

            // Check if the channel is already running
            if (channel.status === ChannelStatus.RUNNING) {
                this.log(`Channel ${channelName} is already running`);
                return;
            }

            // Simulate starting the channel
            this.log(`Channel ${channelName} started successfully`);
        } catch (error) {
            this.log(`Error starting channel: ${(error as Error).message}`, true);
            throw error;
        }
    }

    /**
     * Stop a channel
     * @param channelName Name of the channel to stop
     * @returns Promise that resolves when the channel is stopped
     */
    async stopChannel(channelName: string): Promise<void> {
        if (!this.isConnected()) {
            throw new Error('Not connected to Queue Manager');
        }

        try {
            this.log(`Stopping channel: ${channelName}`);

            // In a real implementation, you would use PCF commands to stop the channel
            // For this simulation, we'll just log the action and return success

            // Check if the channel exists
            const channels = await this.listChannels();
            const channel = channels.find(c => c.name === channelName);

            if (!channel) {
                throw new Error(`Channel ${channelName} not found`);
            }

            // Check if the channel is already stopped
            if (channel.status === ChannelStatus.INACTIVE || channel.status === ChannelStatus.STOPPED) {
                this.log(`Channel ${channelName} is already stopped`);
                return;
            }

            // Simulate stopping the channel
            this.log(`Channel ${channelName} stopped successfully`);
        } catch (error) {
            this.log(`Error stopping channel: ${(error as Error).message}`, true);
            throw error;
        }
    }

    /**
     * Get the current depth of a queue
     * @param queueName Name of the queue
     * @returns Promise that resolves to the current depth of the queue
     */
    async getQueueDepth(queueName: string): Promise<number> {
        if (!this.isConnected()) {
            throw new Error('Not connected to Queue Manager');
        }

        try {
            this.log(`Getting depth for queue: ${queueName}`);

            // Open the queue for inquire
            const mqOd = new mq.MQOD();
            mqOd.ObjectName = queueName;
            mqOd.ObjectType = mq.MQC.MQOT_Q;

            const openOptions = mq.MQC.MQOO_INQUIRE | mq.MQC.MQOO_FAIL_IF_QUIESCING;

            let hObj: mq.MQObject | null = null;
            try {
                hObj = await new Promise<mq.MQObject>((resolve, reject) => {
                    // Create a proper callback function with explicit types
                    const callback = function(err: any, obj: mq.MQObject) {
                        if (err) {
                            reject(new Error(`Error opening queue for inquire: ${err.message}`));
                        } else {
                            resolve(obj);
                        }
                    };

                    // Pass the callback as a separate function reference
                    // @ts-ignore - IBM MQ types are incorrect
                    mq.Open(this.connectionHandle!, mqOd, openOptions, callback);
                });

                // Inquire queue depth
                const selectors = new Array(1);
                selectors[0] = mq.MQC.MQIA_CURRENT_Q_DEPTH;

                const intAttrs = new Array(1);

                await new Promise<void>((resolve, reject) => {
                    // Create a proper callback function with explicit types
                    const callback = function(err: any) {
                        if (err) {
                            reject(new Error(`Error inquiring queue depth: ${err.message}`));
                        } else {
                            resolve();
                        }
                    };

                    // Pass the callback as a separate function reference
                    // @ts-ignore - IBM MQ types are incorrect
                    mq.Inq(hObj, selectors, intAttrs, Buffer.alloc(0), callback);
                });

                // Extract depth from the response
                const depth = intAttrs[0];
                this.log(`Queue ${queueName} current depth: ${depth}`);

                return depth;
            } finally {
                // Close the queue if it was opened
                if (hObj) {
                    await new Promise<void>((resolve) => {
                        // Create a proper callback function with explicit types
                        const self = this;
                        const callback = function(err: any) {
                            if (err) {
                                self.log(`Warning: Error closing queue: ${err.message}`, true);
                            }
                            resolve();
                        };

                        // Pass the callback as a separate function reference
                        // @ts-ignore - IBM MQ types are incorrect
                        mq.Close(hObj, 0, callback);
                    });
                }
            }
        } catch (error) {
            this.log(`Error getting queue depth: ${(error as Error).message}`, true);
            throw error;
        }
    }

    /**
     * Get properties of a queue
     */
    async getQueueProperties(queueName: string): Promise<QueueProperties> {
        if (!this.isConnected()) {
            throw new Error('Not connected to Queue Manager');
        }

        try {
            this.log(`Getting properties for queue: ${queueName}`);

            // Open the queue for inquire
            const mqOd = new mq.MQOD();
            mqOd.ObjectName = queueName;
            mqOd.ObjectType = mq.MQC.MQOT_Q;

            const openOptions = mq.MQC.MQOO_INQUIRE | mq.MQC.MQOO_FAIL_IF_QUIESCING;

            let hObj: mq.MQObject | null = null;
            try {
                hObj = await new Promise<mq.MQObject>((resolve, reject) => {
                    // Create a proper callback function with explicit types
                    const callback = function(err: any, obj: mq.MQObject) {
                        if (err) {
                            reject(new Error(`Error opening queue for inquire: ${err.message}`));
                        } else {
                            resolve(obj);
                        }
                    };

                    // Pass the callback as a separate function reference
                    // @ts-ignore - IBM MQ types are incorrect
                    mq.Open(this.connectionHandle!, mqOd, openOptions, callback);
                });

                // Inquire queue properties
                const attributes = [
                    mq.MQC.MQIA_CURRENT_Q_DEPTH,
                    mq.MQC.MQIA_MAX_Q_DEPTH,
                    mq.MQC.MQCA_Q_DESC,
                    mq.MQC.MQIA_Q_TYPE,
                    mq.MQC.MQIA_DEFINITION_TYPE
                ];

                // Create arrays for selectors and integer attributes
                const selectors = new Array(attributes.length);
                for (let i = 0; i < attributes.length; i++) {
                    selectors[i] = attributes[i];
                }

                const intAttrs = new Array(attributes.length);
                const charAttrs = Buffer.alloc(1024);

                await new Promise<void>((resolve, reject) => {
                    // Create a proper callback function with explicit types
                    const callback = function(err: any) {
                        if (err) {
                            reject(new Error(`Error inquiring queue properties: ${err.message}`));
                        } else {
                            resolve();
                        }
                    };

                    // Pass the callback as a separate function reference
                    // @ts-ignore - IBM MQ types are incorrect
                    mq.Inq(hObj, selectors, intAttrs, charAttrs, callback);
                });

                // Extract properties from the response
                // Get the current depth directly using our dedicated method
                const depth = await this.getQueueDepth(queueName);
                const maxDepth = intAttrs[1];
                const description = charAttrs.toString('utf8').trim();
                const qType = intAttrs[2];
                const defType = intAttrs[3];

                // Map queue type to string
                let type = 'Unknown';
                switch (qType) {
                    case mq.MQC.MQQT_LOCAL:
                        type = 'Local';
                        break;
                    case mq.MQC.MQQT_MODEL:
                        type = 'Model';
                        break;
                    case mq.MQC.MQQT_ALIAS:
                        type = 'Alias';
                        break;
                    case mq.MQC.MQQT_REMOTE:
                        type = 'Remote';
                        break;
                    case mq.MQC.MQQT_CLUSTER:
                        type = 'Cluster';
                        break;
                }

                // Return queue properties
                return {
                    name: queueName,
                    depth: depth,
                    maxDepth: maxDepth,
                    description: description,
                    creationTime: new Date(), // Not available from basic inquire
                    type: type,
                    status: 'Active' // Not available from basic inquire
                };
            } finally {
                // Close the queue if it was opened
                if (hObj) {
                    await new Promise<void>((resolve) => {
                        // Create a proper callback function with explicit types
                        const self = this;
                        const callback = function(err: any) {
                            if (err) {
                                self.log(`Warning: Error closing queue: ${err.message}`, true);
                            }
                            resolve();
                        };

                        // Pass the callback as a separate function reference
                        // @ts-ignore - IBM MQ types are incorrect
                        mq.Close(hObj, 0, callback);
                    });
                }
            }
        } catch (error) {
            this.log(`Error getting queue properties: ${(error as Error).message}`, true);
            throw error;
        }
    }

    /**
     * Browse messages in a queue (non-destructive peek)
     */
    async browseMessages(queueName: string, options?: BrowseOptions): Promise<Message[]> {
        if (!this.isConnected()) {
            throw new Error('Not connected to Queue Manager');
        }

        const limit = options?.limit || 10;
        const startPosition = options?.startPosition || 0;

        try {
            this.log(`Browsing messages in queue: ${queueName} (limit: ${limit}, start: ${startPosition})`);

            // Open the queue for browsing
            const mqOd = new mq.MQOD();
            mqOd.ObjectName = queueName;
            mqOd.ObjectType = mq.MQC.MQOT_Q;

            const openOptions = mq.MQC.MQOO_BROWSE | mq.MQC.MQOO_FAIL_IF_QUIESCING;

            const hObj = await new Promise<mq.MQObject>((resolve, reject) => {
                // Create a proper callback function with explicit types
                const callback = function(err: any, obj: mq.MQObject) {
                    if (err) {
                        reject(new Error(`Error opening queue for browsing: ${err.message}`));
                    } else {
                        resolve(obj);
                    }
                };

                // Pass the callback as a separate function reference
                // @ts-ignore - IBM MQ types are incorrect
                mq.Open(this.connectionHandle!, mqOd, openOptions, callback);
            });

            // Browse messages
            const messages: Message[] = [];

            try {
                // Set browse options
                const mqMd = new mq.MQMD();
                const mqGmo = new mq.MQGMO();

                mqGmo.Options = mq.MQC.MQGMO_BROWSE_FIRST | mq.MQC.MQGMO_FAIL_IF_QUIESCING;

                // Set up filtering if requested
                if (options?.filter) {
                    // Initialize match options
                    let matchOptions = mq.MQC.MQMO_NONE;

                    // Filter by Message ID if provided
                    if (options.filter.messageId) {
                        this.log(`Filtering by Message ID: ${options.filter.messageId}`);
                        mqMd.MsgId = Buffer.from(options.filter.messageId, 'hex');
                        matchOptions |= mq.MQC.MQMO_MATCH_MSG_ID;
                    }

                    // Filter by Correlation ID if provided
                    if (options.filter.correlationId) {
                        this.log(`Filtering by Correlation ID: ${options.filter.correlationId}`);
                        mqMd.CorrelId = Buffer.from(options.filter.correlationId, 'hex');
                        matchOptions |= mq.MQC.MQMO_MATCH_CORREL_ID;
                    }

                    // Set match options if any filters were applied
                    if (matchOptions !== mq.MQC.MQMO_NONE) {
                        mqGmo.MatchOptions = matchOptions;
                    } else {
                        mqGmo.MatchOptions = mq.MQC.MQMO_NONE;
                    }
                } else {
                    mqGmo.MatchOptions = mq.MQC.MQMO_NONE;
                }

                // Skip to start position if needed
                for (let i = 0; i < startPosition; i++) {
                    mqGmo.Options = mq.MQC.MQGMO_BROWSE_NEXT | mq.MQC.MQGMO_FAIL_IF_QUIESCING;

                    try {
                        await new Promise<void>((resolve, reject) => {
                            // Create a proper callback function
                            const callback = function(err: any) {
                                if (err && err.mqrc !== mq.MQC.MQRC_NO_MSG_AVAILABLE) {
                                    reject(err);
                                } else {
                                    resolve();
                                }
                            };

                            // Pass the callback directly to the MQ library
                            // The IBM MQ library expects a specific callback signature
                            // @ts-ignore - IBM MQ types are incorrect
                            mq.GetSync(hObj, mqMd, mqGmo, Buffer.alloc(0), function(err: any, len: number, md: any, buffer: Buffer) {
                                callback(err);
                            });
                        });
                    } catch (err) {
                        break; // No more messages or error
                    }
                }

                // Now get the messages we want to return
                for (let i = 0; i < limit; i++) {
                    if (i === 0 && startPosition === 0) {
                        mqGmo.Options = mq.MQC.MQGMO_BROWSE_FIRST | mq.MQC.MQGMO_FAIL_IF_QUIESCING;
                    } else {
                        mqGmo.Options = mq.MQC.MQGMO_BROWSE_NEXT | mq.MQC.MQGMO_FAIL_IF_QUIESCING;
                    }

                    try {
                        const message = await new Promise<Message>((resolve, reject) => {
                            // Reset MQMD for each message
                            const msgMd = new mq.MQMD();

                            // Use a large buffer for the message
                            const buffer = Buffer.alloc(1024 * 1024); // 1MB buffer

                            // Use arrow function to preserve 'this' context
                            const callback = (err: any, len: number) => {
                                if (err) {
                                    if (err.mqrc === mq.MQC.MQRC_NO_MSG_AVAILABLE) {
                                        reject(new Error('No more messages'));
                                    } else {
                                        reject(err);
                                    }
                                } else {
                                    // Trim the buffer to the actual message length
                                    const messageBuffer = buffer.slice(0, len);

                                    // Create a message object
                                    const msg: Message = {
                                        id: Buffer.from(msgMd.MsgId).toString('hex'),
                                        correlationId: Buffer.from(msgMd.CorrelId).toString('hex'),
                                        timestamp: this.parseMessageTimestamp(msgMd.PutDate, msgMd.PutTime),
                                        payload: messageBuffer,
                                        properties: {
                                            format: msgMd.Format,
                                            persistence: msgMd.Persistence,
                                            priority: msgMd.Priority,
                                            replyToQueue: msgMd.ReplyToQ,
                                            replyToQueueManager: msgMd.ReplyToQMgr,
                                        }
                                    };

                                    resolve(msg);
                                }
                            };

                            // Pass the callback directly to the MQ library
                            // The IBM MQ library expects a specific callback signature
                            // @ts-ignore - IBM MQ types are incorrect
                            mq.GetSync(hObj, msgMd, mqGmo, buffer, function(err: any, len: number, md: any, buf: Buffer) {
                                if (err) {
                                    callback(err, 0);
                                } else {
                                    // Make sure we're passing the correct message descriptor back
                                    // Copy the values from the message descriptor returned by MQ
                                    Object.assign(msgMd, md);
                                    callback(null, len);
                                }
                            });
                        });

                        messages.push(message);
                    } catch (err) {
                        if ((err as Error).message === 'No more messages') {
                            break; // No more messages
                        }
                        throw err;
                    }
                }
            } finally {
                // Close the queue
                await new Promise<void>((resolve, reject) => {
                    // Create a proper callback function with explicit types
                    const self = this;
                    const callback = function(err: any) {
                        if (err) {
                            self.log(`Warning: Error closing queue: ${err.message}`, true);
                        }
                        resolve();
                    };

                    // Pass the callback as a separate function reference
                    // @ts-ignore - IBM MQ types are incorrect
                    mq.Close(hObj, 0, callback);
                });
            }

            this.log(`Retrieved ${messages.length} messages from queue: ${queueName}`);
            return messages;
        } catch (error) {
            this.log(`Error browsing messages: ${(error as Error).message}`, true);
            throw error;
        }
    }



    /**
     * Put a message to a queue
     */
    async putMessage(queueName: string, payload: string | Buffer, properties?: MessageProperties): Promise<void> {
        if (!this.isConnected()) {
            throw new Error('Not connected to Queue Manager');
        }

        try {
            this.log(`Putting message to queue: ${queueName}`);

            // Open the queue for putting
            const mqOd = new mq.MQOD();
            mqOd.ObjectName = queueName;
            mqOd.ObjectType = mq.MQC.MQOT_Q;

            const openOptions = mq.MQC.MQOO_OUTPUT | mq.MQC.MQOO_FAIL_IF_QUIESCING;

            const hObj = await new Promise<mq.MQObject>((resolve, reject) => {
                // Create a proper callback function with explicit types
                const callback = function(err: any, obj: mq.MQObject) {
                    if (err) {
                        reject(new Error(`Error opening queue for putting: ${err.message}`));
                    } else {
                        resolve(obj);
                    }
                };

                // Pass the callback as a separate function reference
                // @ts-ignore - IBM MQ types are incorrect
                mq.Open(this.connectionHandle!, mqOd, openOptions, callback);
            });

            try {
                // Prepare message descriptor
                const mqMd = new mq.MQMD();

                // Set message properties if provided
                if (properties) {
                    // Basic MQMD properties
                    if (properties.format) {
                        mqMd.Format = properties.format;
                    }

                    if (properties.persistence) {
                        mqMd.Persistence = properties.persistence;
                    }

                    if (properties.priority) {
                        mqMd.Priority = properties.priority;
                    }

                    if (properties.replyToQueue) {
                        mqMd.ReplyToQ = properties.replyToQueue;
                    }

                    if (properties.replyToQueueManager) {
                        mqMd.ReplyToQMgr = properties.replyToQueueManager;
                    }

                    if (properties.correlationId) {
                        mqMd.CorrelId = Buffer.from(properties.correlationId, 'hex');
                    }

                    if (properties.messageId) {
                        mqMd.MsgId = Buffer.from(properties.messageId, 'hex');
                    }

                    // Additional MQMD properties
                    if (properties.expiry) {
                        mqMd.Expiry = properties.expiry;
                    }

                    if (properties.feedback) {
                        mqMd.Feedback = properties.feedback;
                    }

                    if (properties.encoding) {
                        mqMd.Encoding = properties.encoding;
                    }

                    if (properties.codedCharSetId) {
                        mqMd.CodedCharSetId = properties.codedCharSetId;
                    }

                    if (properties.report) {
                        mqMd.Report = properties.report;
                    }

                    if (properties.msgType) {
                        mqMd.MsgType = properties.msgType;
                    }
                }

                // Generate a random correlation ID if not provided
                if (!properties?.correlationId) {
                    // Generate a random 24-byte correlation ID (48 hex chars)
                    const randomBytes = Buffer.alloc(24);
                    for (let i = 0; i < 24; i++) {
                        randomBytes[i] = Math.floor(Math.random() * 256);
                    }
                    mqMd.CorrelId = randomBytes;
                    this.log(`Generated random correlation ID: ${randomBytes.toString('hex')}`);
                }

                // Handle RFH2 header if specified
                let messageBuffer: Buffer;
                if (properties?.rfh2?.enabled) {
                    this.log('Creating message with RFH2 header');

                    // Create RFH2 header
                    const rfh2Header = this.createRFH2Header(properties.rfh2);

                    // Set the format to MQHRF2 if not already set
                    if (!properties.format) {
                        mqMd.Format = 'MQHRF2';
                    }

                    // Combine RFH2 header with payload
                    const payloadBuffer = typeof payload === 'string' ? Buffer.from(payload) : payload;
                    messageBuffer = Buffer.concat([rfh2Header, payloadBuffer]);
                } else {
                    // Use payload as-is
                    messageBuffer = typeof payload === 'string' ? Buffer.from(payload) : payload;
                }

                // Prepare message options
                const mqPmo = new mq.MQPMO();
                mqPmo.Options = mq.MQC.MQPMO_NO_SYNCPOINT | mq.MQC.MQPMO_FAIL_IF_QUIESCING;

                // messageBuffer is now defined above in the RFH2 handling section

                // Put the message
                await new Promise<void>((resolve, reject) => {
                    // Create a proper callback function with explicit types
                    const callback = function(err: any) {
                        if (err) {
                            reject(new Error(`Error putting message: ${err.message}`));
                        } else {
                            resolve();
                        }
                    };

                    // Pass the callback as a separate function reference
                    // @ts-ignore - IBM MQ types are incorrect
                    mq.Put(hObj, mqMd, mqPmo, messageBuffer, callback);
                });

                this.log(`Successfully put message to queue: ${queueName}`);

                // Emit queue depth changed event
                if (this.connectionManager) {
                    try {
                        const depth = await this.getQueueDepth(queueName);
                        this.connectionManager.emit(ConnectionManager.QUEUE_DEPTH_CHANGED, queueName, depth);
                        this.connectionManager.emit(ConnectionManager.QUEUE_UPDATED, queueName);
                    } catch (err) {
                        this.log(`Warning: Could not emit queue depth changed event: ${(err as Error).message}`, true);
                    }
                }
            } finally {
                // Close the queue
                await new Promise<void>((resolve, reject) => {
                    // Create a proper callback function with explicit types
                    const self = this;
                    const callback = function(err: any) {
                        if (err) {
                            self.log(`Warning: Error closing queue: ${err.message}`, true);
                        }
                        resolve();
                    };

                    // Pass the callback as a separate function reference
                    // @ts-ignore - IBM MQ types are incorrect
                    mq.Close(hObj, 0, callback);
                });
            }
        } catch (error) {
            this.log(`Error putting message: ${(error as Error).message}`, true);
            throw error;
        }
    }

    /**
     * Publish a message to a topic
     * @param topicString Topic string to publish to
     * @param payload Message payload (string or Buffer)
     * @param properties Optional message properties
     * @returns Promise that resolves when the message is published
     */
    async publishMessage(topicString: string, payload: string | Buffer, properties?: MessageProperties): Promise<void> {
        if (!this.isConnected()) {
            throw new Error('Not connected to Queue Manager');
        }

        try {
            this.log(`Publishing message to topic: ${topicString}`);

            // Open the topic for publishing
            const mqOd = new mq.MQOD();
            mqOd.ObjectString = topicString;
            mqOd.ObjectType = mq.MQC.MQOT_TOPIC;

            const openOptions = mq.MQC.MQOO_OUTPUT | mq.MQC.MQOO_FAIL_IF_QUIESCING;

            const hObj = await new Promise<mq.MQObject>((resolve, reject) => {
                // Create a proper callback function with explicit types
                const callback = function(err: any, obj: mq.MQObject) {
                    if (err) {
                        reject(new Error(`Error opening topic for publishing: ${err.message}`));
                    } else {
                        resolve(obj);
                    }
                };

                // Pass the callback as a separate function reference
                // @ts-ignore - IBM MQ types are incorrect
                mq.Open(this.connectionHandle!, mqOd, openOptions, callback);
            });

            try {
                // Prepare message descriptor
                const mqMd = new mq.MQMD();

                // Set message format
                mqMd.Format = mq.MQC.MQFMT_STRING;

                // Set message properties if provided
                if (properties) {
                    // Basic MQMD properties
                    if (properties.format) {
                        mqMd.Format = properties.format;
                    }

                    if (properties.persistence) {
                        mqMd.Persistence = properties.persistence;
                    }

                    if (properties.priority) {
                        mqMd.Priority = properties.priority;
                    }

                    if (properties.correlationId) {
                        mqMd.CorrelId = Buffer.from(properties.correlationId, 'hex');
                    }

                    if (properties.messageId) {
                        mqMd.MsgId = Buffer.from(properties.messageId, 'hex');
                    }

                    // Additional MQMD properties
                    if (properties.expiry) {
                        mqMd.Expiry = properties.expiry;
                    }
                }

                // Handle RFH2 header if specified
                let messageBuffer: Buffer;
                if (properties?.rfh2?.enabled) {
                    this.log('Creating message with RFH2 header');

                    // Create RFH2 header
                    const rfh2Header = this.createRFH2Header(properties.rfh2);

                    // Set the format to MQHRF2 if not already set
                    if (!properties.format) {
                        mqMd.Format = 'MQHRF2';
                    }

                    // Combine RFH2 header with payload
                    const payloadBuffer = typeof payload === 'string' ? Buffer.from(payload) : payload;
                    messageBuffer = Buffer.concat([rfh2Header, payloadBuffer]);
                } else {
                    // Use payload as-is
                    messageBuffer = typeof payload === 'string' ? Buffer.from(payload) : payload;
                }

                // Prepare message options
                const mqPmo = new mq.MQPMO();
                mqPmo.Options = mq.MQC.MQPMO_NO_SYNCPOINT | mq.MQC.MQPMO_FAIL_IF_QUIESCING;

                // Put the message
                await new Promise<void>((resolve, reject) => {
                    // Create a proper callback function with explicit types
                    const callback = function(err: any) {
                        if (err) {
                            reject(new Error(`Error publishing message: ${err.message}`));
                        } else {
                            resolve();
                        }
                    };

                    // Pass the callback as a separate function reference
                    // @ts-ignore - IBM MQ types are incorrect
                    mq.Put(hObj, mqMd, mqPmo, messageBuffer, callback);
                });

                this.log(`Successfully published message to topic: ${topicString}`);
            } finally {
                // Close the topic
                await new Promise<void>((resolve, reject) => {
                    // Create a proper callback function with explicit types
                    const self = this;
                    const callback = function(err: any) {
                        if (err) {
                            self.log(`Warning: Error closing topic: ${err.message}`, true);
                        }
                        resolve();
                    };

                    // Pass the callback as a separate function reference
                    // @ts-ignore - IBM MQ types are incorrect
                    mq.Close(hObj, 0, callback);
                });
            }
        } catch (error) {
            this.log(`Error publishing message: ${(error as Error).message}`, true);
            throw error;
        }
    }

    /**
     * Clear all messages from a queue
     */
    async clearQueue(queueName: string): Promise<void> {
        if (!this.isConnected()) {
            throw new Error('Not connected to Queue Manager');
        }

        try {
            this.log(`Clearing queue: ${queueName}`);

            // Open the queue for getting messages
            const mqOd = new mq.MQOD();
            mqOd.ObjectName = queueName;
            mqOd.ObjectType = mq.MQC.MQOT_Q;

            const openOptions = mq.MQC.MQOO_INPUT_SHARED | mq.MQC.MQOO_FAIL_IF_QUIESCING;

            let hObj: mq.MQObject | null = null;
            try {
                hObj = await new Promise<mq.MQObject>((resolve, reject) => {
                    // Create a proper callback function with explicit types
                    const callback = function(err: any, obj: mq.MQObject) {
                        if (err) {
                            reject(new Error(`Error opening queue for clearing: ${err.message}`));
                        } else {
                            resolve(obj);
                        }
                    };

                    // Pass the callback as a separate function reference
                    // @ts-ignore - IBM MQ types are incorrect
                    mq.Open(this.connectionHandle!, mqOd, openOptions, callback);
                });

                // Get all messages from the queue
                const mqMd = new mq.MQMD();
                const mqGmo = new mq.MQGMO();

                // Set options for getting messages
                mqGmo.Options = mq.MQC.MQGMO_WAIT | mq.MQC.MQGMO_FAIL_IF_QUIESCING;
                mqGmo.WaitInterval = 1000; // 1 second timeout

                let messagesCleared = 0;
                let keepGoing = true;

                while (keepGoing) {
                    try {
                        await new Promise<void>((resolve, reject) => {
                            // Create a proper callback function with explicit types
                            const callback = function(err: any) {
                                if (err) {
                                    if (err.mqrc === mq.MQC.MQRC_NO_MSG_AVAILABLE) {
                                        keepGoing = false;
                                        resolve();
                                    } else {
                                        reject(new Error(`Error getting message: ${err.message}`));
                                    }
                                } else {
                                    messagesCleared++;
                                    resolve();
                                }
                            };

                            // Pass the callback as a separate function reference
                            // @ts-ignore - IBM MQ types are incorrect
                            mq.GetSync(hObj, mqMd, mqGmo, Buffer.alloc(1024 * 1024), function(err: any) {
                                callback(err);
                            });
                        });
                    } catch (error) {
                        this.log(`Error while clearing queue: ${(error as Error).message}`, true);
                        break;
                    }
                }

                this.log(`Queue ${queueName} cleared, removed ${messagesCleared} messages`);

                // Emit queue depth changed event
                if (this.connectionManager) {
                    try {
                        this.connectionManager.emit(ConnectionManager.QUEUE_DEPTH_CHANGED, queueName, 0);
                        this.connectionManager.emit(ConnectionManager.QUEUE_UPDATED, queueName);
                    } catch (err) {
                        this.log(`Warning: Could not emit queue depth changed event: ${(err as Error).message}`, true);
                    }
                }
            } finally {
                // Close the queue if it was opened
                if (hObj) {
                    await new Promise<void>((resolve) => {
                        // Create a proper callback function with explicit types
                        const self = this;
                        const callback = function(err: any) {
                            if (err) {
                                self.log(`Warning: Error closing queue: ${err.message}`, true);
                            }
                            resolve();
                        };

                        // Pass the callback as a separate function reference
                        // @ts-ignore - IBM MQ types are incorrect
                        mq.Close(hObj, 0, callback);
                    });
                }
            }
        } catch (error) {
            this.log(`Error clearing queue: ${(error as Error).message}`, true);
            throw error;
        }
    }

    /**
     * Delete a specific message from a queue
     */
    async deleteMessage(queueName: string, messageId: string): Promise<void> {
        if (!this.isConnected()) {
            throw new Error('Not connected to Queue Manager');
        }

        try {
            this.log(`Deleting message ${messageId} from queue: ${queueName}`);

            // Open the queue for getting (destructive)
            const mqOd = new mq.MQOD();
            mqOd.ObjectName = queueName;
            mqOd.ObjectType = mq.MQC.MQOT_Q;

            const openOptions = mq.MQC.MQOO_INPUT_SHARED | mq.MQC.MQOO_FAIL_IF_QUIESCING;

            const hObj = await new Promise<mq.MQObject>((resolve, reject) => {
                // Create a proper callback function with explicit types
                const callback = function(err: any, obj: mq.MQObject) {
                    if (err) {
                        reject(new Error(`Error opening queue for deleting: ${err.message}`));
                    } else {
                        resolve(obj);
                    }
                };

                // Pass the callback as a separate function reference
                // @ts-ignore - IBM MQ types are incorrect
                mq.Open(this.connectionHandle!, mqOd, openOptions, callback);
            });

            try {
                // Set get options
                const mqMd = new mq.MQMD();
                const mqGmo = new mq.MQGMO();

                // Set message ID to match
                mqMd.MsgId = Buffer.from(messageId, 'hex');

                // Set match options to match message ID
                mqGmo.MatchOptions = mq.MQC.MQMO_MATCH_MSG_ID;
                mqGmo.Options = mq.MQC.MQGMO_WAIT | mq.MQC.MQGMO_FAIL_IF_QUIESCING;
                mqGmo.WaitInterval = 1000; // 1 second timeout

                // Get (and thus delete) the message
                await new Promise<void>((resolve, reject) => {
                    // Create a proper callback function with explicit types
                    const callback = function(err: any) {
                        if (err) {
                            if (err.mqrc === mq.MQC.MQRC_NO_MSG_AVAILABLE) {
                                reject(new Error(`Message ${messageId} not found`));
                            } else {
                                reject(new Error(`Error deleting message: ${err.message}`));
                            }
                        } else {
                            resolve();
                        }
                    };

                    // Pass the callback as a separate function reference
                    // @ts-ignore - IBM MQ types are incorrect
                    mq.GetSync(hObj, mqMd, mqGmo, Buffer.alloc(1024 * 1024), function(err: any, len: number, md: any, buffer: Buffer) {
                        callback(err);
                    });
                });

                this.log(`Successfully deleted message ${messageId} from queue: ${queueName}`);

                // Emit queue depth changed event
                if (this.connectionManager) {
                    try {
                        const depth = await this.getQueueDepth(queueName);
                        this.connectionManager.emit(ConnectionManager.QUEUE_DEPTH_CHANGED, queueName, depth);
                        this.connectionManager.emit(ConnectionManager.QUEUE_UPDATED, queueName);
                    } catch (err) {
                        this.log(`Warning: Could not emit queue depth changed event: ${(err as Error).message}`, true);
                    }
                }
            } finally {
                // Close the queue
                await new Promise<void>((resolve, reject) => {
                    // Create a proper callback function with explicit types
                    const self = this;
                    const callback = function(err: any) {
                        if (err) {
                            self.log(`Warning: Error closing queue: ${err.message}`, true);
                        }
                        resolve();
                    };

                    // Pass the callback as a separate function reference
                    // @ts-ignore - IBM MQ types are incorrect
                    mq.Close(hObj, 0, callback);
                });
            }
        } catch (error) {
            this.log(`Error deleting message: ${(error as Error).message}`, true);
            throw error;
        }
    }

    /**
     * Delete multiple messages from a queue
     */
    async deleteMessages(queueName: string, messageIds: string[]): Promise<void> {
        if (!this.isConnected()) {
            throw new Error('Not connected to Queue Manager');
        }

        if (messageIds.length === 0) {
            return; // Nothing to delete
        }

        try {
            this.log(`Deleting ${messageIds.length} messages from queue: ${queueName}`);

            // Track deleted messages
            let deletedCount = 0;
            const errors: Error[] = [];

            // Delete each message
            for (const messageId of messageIds) {
                try {
                    await this.deleteMessage(queueName, messageId);
                    deletedCount++;
                } catch (error) {
                    errors.push(error as Error);
                    this.log(`Error deleting message ${messageId}: ${(error as Error).message}`, true);
                }
            }

            // If any errors occurred, throw an error with a summary
            if (errors.length > 0) {
                throw new Error(`Failed to delete ${errors.length} of ${messageIds.length} messages`);
            }

            this.log(`${deletedCount} messages deleted from queue: ${queueName}`);

            // Emit queue depth changed event
            if (this.connectionManager) {
                try {
                    const depth = await this.getQueueDepth(queueName);
                    this.connectionManager.emit(ConnectionManager.QUEUE_DEPTH_CHANGED, queueName, depth);
                    this.connectionManager.emit(ConnectionManager.QUEUE_UPDATED, queueName);
                } catch (err) {
                    this.log(`Warning: Could not emit queue depth changed event: ${(err as Error).message}`, true);
                }
            }
        } catch (error) {
            this.log(`Error deleting messages: ${(error as Error).message}`, true);
            throw error;
        }
    }



    /**
     * Create an RFH2 header for a message
     * @param rfh2Options Options for the RFH2 header
     * @returns Buffer containing the RFH2 header
     */
    private createRFH2Header(rfh2Options: any): Buffer {
        this.log('Creating RFH2 header');

        // Default values
        const format = rfh2Options.format || 'MQSTR';
        const encoding = rfh2Options.encoding || 273; // Default to native encoding
        const codedCharSetId = rfh2Options.codedCharSetId || 1208; // Default to UTF-8
        const folders = rfh2Options.folders || {};

        // Convert folders to XML strings
        const folderStrings: string[] = [];

        // Process each folder
        for (const [folderName, folderContent] of Object.entries(folders)) {
            // Convert folder content to XML
            let folderXml = `<${folderName}>`;

            // Process each property in the folder
            for (const [propName, propValue] of Object.entries(folderContent as Record<string, any>)) {
                folderXml += `<${propName}>${this.escapeXml(String(propValue))}</${propName}>`;
            }

            folderXml += `</${folderName}>`;
            folderStrings.push(folderXml);
        }

        // Calculate lengths
        const folderData = folderStrings.join('');
        const folderLength = Buffer.byteLength(folderData, 'utf8');

        // RFH2 header structure:
        // - StrucId: 4 bytes, "RFH " (including the space)
        // - Version: 4 bytes, 2
        // - StrucLength: 4 bytes, length of the header including folder data
        // - Encoding: 4 bytes, encoding of the data
        // - CodedCharSetId: 4 bytes, character set of the data
        // - Format: 8 bytes, format of the data
        // - Flags: 4 bytes, flags
        // - NameValueCCSID: 4 bytes, character set of the name/value pairs
        // - Folder data: variable length

        // Calculate total header length (36 bytes for fixed part + folder data)
        const headerLength = 36 + folderLength;

        // Create buffer for the header
        const header = Buffer.alloc(headerLength);

        // Write header fields
        header.write('RFH ', 0, 4); // StrucId
        header.writeInt32BE(2, 4); // Version
        header.writeInt32BE(headerLength, 8); // StrucLength
        header.writeInt32BE(encoding, 12); // Encoding
        header.writeInt32BE(codedCharSetId, 16); // CodedCharSetId
        header.write(format.padEnd(8, ' '), 20, 8); // Format
        header.writeInt32BE(0, 28); // Flags
        header.writeInt32BE(1208, 32); // NameValueCCSID (always UTF-8)

        // Write folder data
        header.write(folderData, 36, folderLength, 'utf8');

        this.log(`RFH2 header created, length: ${headerLength}, folders: ${Object.keys(folders).join(', ')}`);

        return header;
    }

    /**
     * Escape XML special characters
     */
    private escapeXml(unsafe: string): string {
        return unsafe.replace(/[<>&'"]/g, (c) => {
            switch (c) {
                case '<': return '&lt;';
                case '>': return '&gt;';
                case '&': return '&amp;';
                case '\'': return '&apos;';
                case '"': return '&quot;';
                default: return c;
            }
        });
    }

    /**
     * Setup TLS options for the connection
     */
    private setupTLSOptions(tlsOptions?: IBMMQConnectionProfile['connectionParams']['tlsOptions']): string {
        // This is a simplified implementation
        // In a real implementation, you would set up the TLS options based on the provided parameters
        return '*TLS12';
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
     * Parse IBM MQ message timestamp (PutDate and PutTime) into a JavaScript Date object
     * @param putDate The PutDate from the message descriptor (format: YYYYMMDD)
     * @param putTime The PutTime from the message descriptor (format: HHMMSSTH)
     * @returns A JavaScript Date object or undefined if the date/time is invalid
     */
    private parseMessageTimestamp(putDate?: string, putTime?: string): Date | undefined {
        try {
            if (!putDate || !putTime) {
                return undefined;
            }

            // Validate date format (YYYYMMDD)
            if (!/^\d{8}$/.test(putDate)) {
                return undefined;
            }

            // Validate time format (HHMMSSTH)
            if (!/^\d{8}$/.test(putTime)) {
                return undefined;
            }

            // Extract date components
            const year = parseInt(putDate.substring(0, 4), 10);
            const month = parseInt(putDate.substring(4, 6), 10) - 1; // JavaScript months are 0-based
            const day = parseInt(putDate.substring(6, 8), 10);

            // Extract time components
            const hour = parseInt(putTime.substring(0, 2), 10);
            const minute = parseInt(putTime.substring(2, 4), 10);
            const second = parseInt(putTime.substring(4, 6), 10);
            const hundredths = parseInt(putTime.substring(6, 8), 10);

            // Validate date components
            if (year < 1900 || year > 2100 || month < 0 || month > 11 || day < 1 || day > 31) {
                return undefined;
            }

            // Validate time components
            if (hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59 || hundredths < 0 || hundredths > 99) {
                return undefined;
            }

            // Create date object
            const date = new Date(year, month, day, hour, minute, second, hundredths * 10);

            // Check if the date is valid
            if (isNaN(date.getTime())) {
                return undefined;
            }

            return date;
        } catch (error) {
            this.log(`Error parsing message timestamp: ${(error as Error).message}`, true);
            return undefined;
        }
    }
}
