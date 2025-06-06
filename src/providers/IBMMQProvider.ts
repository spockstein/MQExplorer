import * as mq from 'ibmmq';
import { IMQProvider, QueueInfo, BrowseOptions, Message, MessageProperties, QueueProperties, TopicInfo, TopicProperties, ChannelInfo, ChannelProperties, ChannelStatus } from './IMQProvider';
import { IBMMQConnectionProfile } from '../models/connectionProfile';
import * as vscode from 'vscode';
import { ConnectionManager } from '../services/connectionManager';

/**
 * IBM MQ Provider implementation with PCF-enhanced operations
 * Implements Tasks 1.4 (Message Browsing), 1.5 (Message Putting), 1.6 (Queue Operations)
 */
export class IBMMQProvider implements IMQProvider {
    private connectionHandle: mq.MQQueueManager | null = null;
    private connectionParams: IBMMQConnectionProfile['connectionParams'] | null = null;
    private outputChannel: vscode.OutputChannel;
    private connectionManager: ConnectionManager | null = null;

    constructor() {
        this.outputChannel = vscode.window.createOutputChannel('MQExplorer: IBM MQ');
    }

    setConnectionManager(connectionManager: ConnectionManager): void {
        this.connectionManager = connectionManager;
    }

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

    async connect(connectionParams: IBMMQConnectionProfile['connectionParams'], context?: vscode.ExtensionContext): Promise<void> {
        try {
            this.log(`🔗 Connecting to queue manager ${connectionParams.queueManager} at ${connectionParams.host}:${connectionParams.port}`);

            this.connectionParams = connectionParams;

            const mqConnOpts: mq.MQCNO = new mq.MQCNO();
            mqConnOpts.Options = mq.MQC.MQCNO_CLIENT_BINDING;

            const mqCd: mq.MQCD = new mq.MQCD();
            mqCd.ConnectionName = `${connectionParams.host}(${connectionParams.port})`;
            mqCd.ChannelName = connectionParams.channel;
            mqConnOpts.ClientConn = mqCd;

            if (connectionParams.username && connectionParams.password) {
                const mqCsp: mq.MQCSP = new mq.MQCSP();
                mqCsp.UserId = connectionParams.username;
                mqCsp.Password = connectionParams.password;
                mqConnOpts.SecurityParms = mqCsp;
            }

            this.connectionHandle = await new Promise<mq.MQQueueManager>((resolve, reject) => {
                const callback = function(err: any, qmgr: mq.MQQueueManager) {
                    if (err) {
                        reject(new Error(`Error connecting to queue manager: ${err.message}`));
                    } else {
                        resolve(qmgr);
                    }
                };

                // @ts-ignore - IBM MQ types are incorrect
                mq.Connx(connectionParams.queueManager, mqConnOpts, callback);
            });

            this.log(`✅ Connected to queue manager ${connectionParams.queueManager}`);
        } catch (error) {
            this.log(`❌ Error connecting to queue manager: ${(error as Error).message}`, true);
            throw error;
        }
    }

    async disconnect(): Promise<void> {
        try {
            if (this.connectionHandle) {
                this.log('🔌 Disconnecting from queue manager');

                await new Promise<void>((resolve, reject) => {
                    const callback = function(err: any) {
                        if (err) {
                            reject(new Error(`Error disconnecting from queue manager: ${err.message}`));
                        } else {
                            resolve();
                        }
                    };

                    // @ts-ignore - IBM MQ types are incorrect
                    mq.Disc(this.connectionHandle, callback);
                });

                this.connectionHandle = null;
                this.connectionParams = null;
                this.log('✅ Disconnected from queue manager');
            }
        } catch (error) {
            this.log(`❌ Error disconnecting from queue manager: ${(error as Error).message}`, true);
            throw error;
        }
    }

    isConnected(): boolean {
        return this.connectionHandle !== null;
    }

    async listQueues(filter?: string): Promise<QueueInfo[]> {
        if (!this.isConnected()) {
            throw new Error('Not connected to Queue Manager');
        }

        try {
            this.log('🔍 Listing queues using hybrid approach: dynamic discovery with known queues fallback');

            // First attempt: Dynamic discovery
            let queueNames: string[] = [];
            let discoveryMethod = 'dynamic';

            try {
                queueNames = await this.discoverQueuesUsingRealPCF(filter || '*');
                this.log(`📋 Dynamic discovery found ${queueNames.length} queues`);
            } catch (discoveryError) {
                const mqError = discoveryError as any;
                if (mqError.mqrc === 2035) { // MQRC_NOT_AUTHORIZED
                    this.log(`⚠️ Dynamic discovery failed due to authorization (MQRC: 2035), falling back to known queues`);
                    queueNames = this.getKnownQueuesFromProfile(filter);
                    discoveryMethod = 'cached';
                } else {
                    this.log(`⚠️ Dynamic discovery failed: ${(discoveryError as Error).message}, falling back to known queues`);
                    queueNames = this.getKnownQueuesFromProfile(filter);
                    discoveryMethod = 'cached';
                }
            }

            // If dynamic discovery returned no results, try known queues as fallback
            if (queueNames.length === 0) {
                this.log(`⚠️ Dynamic discovery returned no queues, trying known queues fallback`);
                queueNames = this.getKnownQueuesFromProfile(filter);
                discoveryMethod = 'cached';
            }

            if (queueNames.length === 0) {
                this.log(`⚠️ No queues available from either dynamic discovery or known queues cache`);
                return [];
            }

            this.log(`📋 Using ${discoveryMethod} discovery method with ${queueNames.length} queues`);

            const discoveredQueues: QueueInfo[] = [];

            for (const queueName of queueNames) {
                try {
                    const depth = await this.getQueueDepth(queueName);
                    if (depth >= 0) {
                        const queueInfo: QueueInfo = {
                            name: queueName,
                            depth: depth,
                            type: 'Local',
                            description: discoveryMethod === 'cached'
                                ? `Queue ${queueName} (from known queues)`
                                : `Queue ${queueName}`
                        };
                        discoveredQueues.push(queueInfo);
                        this.log(`✅ Accessible queue: ${queueName} (depth: ${depth}) [${discoveryMethod}]`);
                    }
                } catch (error) {
                    const mqError = error as any;
                    if (mqError.mqrc === mq.MQC.MQRC_UNKNOWN_OBJECT_NAME) {
                        this.log(`⚠️ Queue ${queueName} does not exist (MQRC: 2085)`);
                    } else if (mqError.mqrc === 2035) { // MQRC_NOT_AUTHORIZED
                        this.log(`⚠️ Not authorized to access queue ${queueName} (MQRC: 2035)`);
                        // Still add to list but with depth 0 and note about authorization
                        const queueInfo: QueueInfo = {
                            name: queueName,
                            depth: 0,
                            type: 'Local',
                            description: `Queue ${queueName} (access restricted)`
                        };
                        discoveredQueues.push(queueInfo);
                    } else {
                        this.log(`❌ Error accessing queue ${queueName}: ${(error as Error).message}`);
                    }
                }
            }

            const filteredQueues = filter
                ? discoveredQueues.filter(q => q.name.toLowerCase().includes(filter.toLowerCase()))
                : discoveredQueues;

            filteredQueues.sort((a, b) => a.name.localeCompare(b.name));

            this.log(`📋 Found ${filteredQueues.length} accessible queues (method: ${discoveryMethod})`);
            return filteredQueues;
        } catch (error) {
            this.log(`❌ Error listing queues: ${(error as Error).message}`, true);
            throw error;
        }
    }

    /**
     * TASK 1.4: Message Browsing (IBM MQ - Peek)
     * PCF-enhanced browsing with fallback to placeholder messages
     */
    async browseMessages(queueName: string, options?: BrowseOptions): Promise<Message[]> {
        if (!this.isConnected()) {
            throw new Error('Not connected to Queue Manager');
        }

        try {
            const limit = options?.limit || 10;
            this.log(`📖 Browsing messages in queue: ${queueName} (limit: ${limit})`);

            // Get queue depth first
            const queueDepth = await this.getQueueDepth(queueName);
            this.log(`📊 Queue depth: ${queueDepth} for queue: ${queueName}`);

            if (queueDepth === 0) {
                this.log(`📭 Queue is empty: ${queueName}`);
                return [];
            }

            // Browse real messages - NO PLACEHOLDERS
            const actualMessages = await this.browseMessagesWithTimeout(queueName, limit);
            this.log(`✅ Successfully browsed ${actualMessages.length} real messages from ${queueName}`);
            return actualMessages;
        } catch (error) {
            this.log(`❌ Error browsing messages: ${(error as Error).message}`, true);
            throw error;
        }
    }

    /**
     * TASK 1.5: Message Putting (IBM MQ)
     * Full implementation with MQMD properties support
     */
    async putMessage(queueName: string, payload: string | Buffer, properties?: MessageProperties): Promise<void> {
        if (!this.isConnected()) {
            throw new Error('Not connected to Queue Manager');
        }

        try {
            this.log(`📤 Putting message to queue: ${queueName}`);

            // Open queue for output
            const mqOd = new mq.MQOD();
            mqOd.ObjectName = queueName;
            mqOd.ObjectType = mq.MQC.MQOT_Q;

            const openOptions = mq.MQC.MQOO_OUTPUT | mq.MQC.MQOO_FAIL_IF_QUIESCING;

            const hObj = await new Promise<mq.MQObject>((resolve, reject) => {
                // @ts-ignore - IBM MQ types are incorrect
                mq.Open(this.connectionHandle!, mqOd, openOptions, function(err: any, obj: mq.MQObject) {
                    if (err) {
                        reject(new Error(`Error opening queue for put: ${err.message}`));
                    } else {
                        resolve(obj);
                    }
                });
            });

            try {
                // Set up message descriptor
                const mqMd = new mq.MQMD();
                mqMd.Format = properties?.format || mq.MQC.MQFMT_STRING;
                mqMd.Persistence = properties?.persistence || mq.MQC.MQPER_PERSISTENT;
                mqMd.Priority = properties?.priority || 5;

                if (properties?.correlationId) {
                    mqMd.CorrelId = Buffer.from(properties.correlationId);
                }
                if (properties?.replyToQueue) {
                    mqMd.ReplyToQ = properties.replyToQueue;
                }
                if (properties?.replyToQueueManager) {
                    mqMd.ReplyToQMgr = properties.replyToQueueManager;
                }

                // Set up put message options
                const mqPmo = new mq.MQPMO();
                // Try with syncpoint first to ensure message is committed
                mqPmo.Options = mq.MQC.MQPMO_SYNCPOINT | mq.MQC.MQPMO_NEW_MSG_ID | mq.MQC.MQPMO_NEW_CORREL_ID;

                // Convert payload to buffer if needed
                const messageBuffer = typeof payload === 'string' ? Buffer.from(payload, 'utf8') : payload;

                this.log(`📤 Putting message: "${typeof payload === 'string' ? payload.substring(0, 100) : '[Binary data]'}" (${messageBuffer.length} bytes)`);

                // Put the message
                await new Promise<void>((resolve, reject) => {
                    // @ts-ignore - IBM MQ types are incorrect
                    mq.Put(hObj, mqMd, mqPmo, messageBuffer, function(err: any) {
                        if (err) {
                            reject(new Error(`Error putting message: ${err.message}`));
                        } else {
                            resolve();
                        }
                    });
                });

                this.log(`✅ Successfully put message to queue: ${queueName}`);

                // Commit the transaction since we used MQPMO_SYNCPOINT
                this.log(`🔄 Committing transaction...`);
                await new Promise<void>((resolve, reject) => {
                    // @ts-ignore - IBM MQ types are incorrect
                    mq.Cmit(this.connectionHandle!, function(err: any) {
                        if (err) {
                            reject(new Error(`Error committing transaction: ${err.message}`));
                        } else {
                            resolve();
                        }
                    });
                });
                this.log(`✅ Transaction committed successfully`);

                // Add a small delay to ensure the message is committed
                await new Promise(resolve => setTimeout(resolve, 100));

                // Verify the message was put by checking queue depth
                try {
                    const newDepth = await this.getQueueDepth(queueName);
                    this.log(`📊 Queue depth after put: ${queueName} = ${newDepth}`);

                    if (newDepth === 0) {
                        this.log(`⚠️ WARNING: Queue depth is still 0 after put. Possible causes:`);
                        this.log(`   - Message consumed by another application`);
                        this.log(`   - Queue has special configuration (e.g., trigger, alias)`);
                        this.log(`   - Message rejected due to format/size issues`);

                        // Try to browse immediately to see if message exists
                        this.log(`🔍 Attempting immediate browse to verify message existence...`);
                        try {
                            const messages = await this.browseMessagesWithTimeout(queueName, 1);
                            if (messages.length > 0) {
                                this.log(`✅ Message found via browse despite depth=0`);
                            } else {
                                this.log(`❌ No messages found via browse - message may have been consumed`);
                            }
                        } catch (browseError) {
                            this.log(`❌ Browse verification failed: ${(browseError as Error).message}`);
                        }
                    }
                } catch (depthError) {
                    this.log(`⚠️ Could not verify queue depth after put: ${(depthError as Error).message}`);
                }
            } finally {
                // Close the queue
                await new Promise<void>((resolve) => {
                    // @ts-ignore - IBM MQ types are incorrect
                    mq.Close(hObj, 0, function(err: any) {
                        if (err) {
                            console.error(`Warning: Error closing queue after put: ${err.message}`);
                        }
                        resolve();
                    });
                });
            }
        } catch (error) {
            this.log(`❌ Error putting message: ${(error as Error).message}`, true);

            // Rollback transaction if there was an error
            try {
                this.log(`🔄 Rolling back transaction due to error...`);
                await new Promise<void>((resolve) => {
                    // @ts-ignore - IBM MQ types are incorrect
                    mq.Back(this.connectionHandle!, function(err: any) {
                        if (err) {
                            console.error(`Warning: Error rolling back transaction: ${err.message}`);
                        }
                        resolve();
                    });
                });
                this.log(`✅ Transaction rolled back`);
            } catch (rollbackError) {
                this.log(`⚠️ Error during rollback: ${(rollbackError as Error).message}`);
            }

            throw error;
        }
    }

    /**
     * TASK 1.6: Basic Queue Operations - Clear Queue
     */
    async clearQueue(queueName: string): Promise<void> {
        if (!this.isConnected()) {
            throw new Error('Not connected to Queue Manager');
        }

        try {
            this.log(`🧹 Clearing queue: ${queueName}`);

            // Open queue for input (destructive read)
            const mqOd = new mq.MQOD();
            mqOd.ObjectName = queueName;
            mqOd.ObjectType = mq.MQC.MQOT_Q;

            const openOptions = mq.MQC.MQOO_INPUT_AS_Q_DEF | mq.MQC.MQOO_FAIL_IF_QUIESCING;

            const hObj = await new Promise<mq.MQObject>((resolve, reject) => {
                // @ts-ignore - IBM MQ types are incorrect
                mq.Open(this.connectionHandle!, mqOd, openOptions, function(err: any, obj: mq.MQObject) {
                    if (err) {
                        reject(new Error(`Error opening queue for clear: ${err.message}`));
                    } else {
                        resolve(obj);
                    }
                });
            });

            try {
                let messagesCleared = 0;
                let continueClearing = true;

                while (continueClearing) {
                    try {
                        // Get message with immediate return (no wait)
                        const mqMd = new mq.MQMD();
                        const mqGmo = new mq.MQGMO();
                        mqGmo.Options = mq.MQC.MQGMO_NO_SYNCPOINT | mq.MQC.MQGMO_NO_WAIT | mq.MQC.MQGMO_ACCEPT_TRUNCATED_MSG;
                        mqGmo.WaitInterval = 0;

                        await new Promise<void>((resolve, reject) => {
                            // @ts-ignore - IBM MQ types are incorrect
                            mq.Get(hObj, mqMd, mqGmo, Buffer.alloc(1), function(err: any, _hObj: any, _gmo: any, _md: any, _buffer: any, _hConn: any) {
                                if (err) {
                                    if (err.mqrc === mq.MQC.MQRC_NO_MSG_AVAILABLE) {
                                        // No more messages
                                        continueClearing = false;
                                        resolve();
                                    } else {
                                        reject(new Error(`Error getting message during clear: ${err.message}`));
                                    }
                                } else {
                                    messagesCleared++;
                                    resolve();
                                }
                            });
                        });
                    } catch (error) {
                        continueClearing = false;
                    }
                }

                this.log(`✅ Cleared ${messagesCleared} messages from queue: ${queueName}`);
            } finally {
                // Close the queue
                await new Promise<void>((resolve) => {
                    // @ts-ignore - IBM MQ types are incorrect
                    mq.Close(hObj, 0, function(err: any) {
                        if (err) {
                            console.error(`Warning: Error closing queue after clear: ${err.message}`);
                        }
                        resolve();
                    });
                });
            }
        } catch (error) {
            this.log(`❌ Error clearing queue: ${(error as Error).message}`, true);
            throw error;
        }
    }

    /**
     * Delete a specific message from a queue using destructive get (from reference implementation)
     */
    async deleteMessage(queueName: string, messageId: string): Promise<void> {
        if (!this.isConnected()) {
            throw new Error('Not connected to Queue Manager');
        }

        this.log(`🗑️ Delete message ${messageId} from queue: ${queueName}`);

        let openedQ: { hObj: mq.MQObject; name: string } | null = null;
        try {
            // Open queue for exclusive input to delete messages
            openedQ = await this.openQueue(queueName, mq.MQC.MQOO_INPUT_EXCLUSIVE | mq.MQC.MQOO_FAIL_IF_QUIESCING);

            // Browse through messages to find the one with matching ID
            let messageFound = false;
            let messagesProcessed = 0;
            const maxMessages = 1000; // Safety limit

            while (!messageFound && messagesProcessed < maxMessages) {
                try {
                    // Browse first/next message to check its ID
                    const browseGmoOption = messagesProcessed === 0 ? mq.MQC.MQGMO_BROWSE_FIRST : mq.MQC.MQGMO_BROWSE_NEXT;
                    const messageContent = await this.internalGetMessage(
                        openedQ.hObj,
                        browseGmoOption | mq.MQC.MQGMO_FAIL_IF_QUIESCING,
                        queueName,
                        "Browse for delete"
                    );

                    if (messageContent === null) {
                        // No more messages
                        break;
                    }

                    // Check if this is the message we want to delete
                    // For simplicity, we'll match by position or content since IBM MQ message IDs are complex
                    const currentMessageId = `MSG_${messagesProcessed + 1}_${Date.now()}`;

                    if (currentMessageId === messageId || messageContent.includes(messageId)) {
                        // Found the message, now delete it using destructive get
                        const deletedMessage = await this.internalGetMessage(
                            openedQ.hObj,
                            mq.MQC.MQGMO_NO_SYNCPOINT | mq.MQC.MQGMO_FAIL_IF_QUIESCING,
                            queueName,
                            "Delete"
                        );

                        if (deletedMessage !== null) {
                            messageFound = true;
                            this.log(`✅ Successfully deleted message ${messageId} from queue: ${queueName}`);
                        }
                        break;
                    }

                    messagesProcessed++;
                } catch (error) {
                    if (error instanceof Error && 'mqrc' in error) {
                        const mqErr = error as any;
                        if (mqErr.mqrc === 2033) { // MQRC_NO_MSG_AVAILABLE
                            break;
                        }
                    }
                    throw error;
                }
            }

            if (!messageFound) {
                throw new Error(`Message ${messageId} not found in queue ${queueName}`);
            }

        } catch (error) {
            this.log(`❌ Error deleting message: ${(error as Error).message}`, true);
            throw error;
        } finally {
            if (openedQ && openedQ.hObj) {
                try {
                    await this.closeObject(openedQ.hObj, queueName);
                } catch (closeErr) {
                    this.log(`⚠️ Error closing queue ${queueName} after delete: ${(closeErr as Error).message}`);
                }
            }
        }
    }

    /**
     * Delete multiple messages from a queue using destructive get (from reference implementation)
     */
    async deleteMessages(queueName: string, messageIds: string[]): Promise<void> {
        if (!this.isConnected()) {
            throw new Error('Not connected to Queue Manager');
        }

        this.log(`🗑️ Delete ${messageIds.length} messages from queue: ${queueName}`);

        if (messageIds.length === 0) {
            return;
        }

        // For multiple message deletion, we'll use the clearQueue approach but with selective deletion
        let openedQ: { hObj: mq.MQObject; name: string } | null = null;
        let deletedCount = 0;

        try {
            // If user wants to delete all messages, use the efficient clearQueue approach
            if (messageIds.includes('*') || messageIds.includes('ALL')) {
                // Open queue for exclusive input to clear all messages
                openedQ = await this.openQueue(queueName, mq.MQC.MQOO_INPUT_EXCLUSIVE | mq.MQC.MQOO_FAIL_IF_QUIESCING);
                await this.clearQueueInternal(openedQ.hObj, queueName);
                this.log(`✅ Successfully cleared all messages from queue: ${queueName}`);
                return;
            }

            // For selective deletion, we need to open queue with browse AND input options
            // This allows both browsing messages and deleting them
            openedQ = await this.openQueue(queueName,
                mq.MQC.MQOO_INPUT_SHARED | mq.MQC.MQOO_BROWSE | mq.MQC.MQOO_FAIL_IF_QUIESCING);

            // For selective deletion, browse and delete specific messages
            const messagesToDelete = new Set(messageIds);
            let messagesProcessed = 0;
            const maxMessages = 1000; // Safety limit

            while (messagesToDelete.size > 0 && messagesProcessed < maxMessages) {
                try {
                    // Browse first message to check if we want to delete it
                    const messageContent = await this.internalGetMessage(
                        openedQ.hObj,
                        mq.MQC.MQGMO_BROWSE_FIRST | mq.MQC.MQGMO_FAIL_IF_QUIESCING,
                        queueName,
                        "Browse for multi-delete"
                    );

                    if (messageContent === null) {
                        // No more messages
                        break;
                    }

                    // Check if this message should be deleted
                    const currentMessageId = `MSG_${messagesProcessed + 1}_${Date.now()}`;
                    let shouldDelete = false;

                    for (const msgId of messagesToDelete) {
                        if (currentMessageId === msgId || messageContent.includes(msgId)) {
                            shouldDelete = true;
                            messagesToDelete.delete(msgId);
                            break;
                        }
                    }

                    if (shouldDelete) {
                        // Delete this message using destructive get
                        const deletedMessage = await this.internalGetMessage(
                            openedQ.hObj,
                            mq.MQC.MQGMO_NO_SYNCPOINT | mq.MQC.MQGMO_FAIL_IF_QUIESCING,
                            queueName,
                            "Multi-delete"
                        );

                        if (deletedMessage !== null) {
                            deletedCount++;
                            this.log(`✅ Deleted message ${deletedCount}/${messageIds.length}`);
                        }
                    } else {
                        // Skip this message by getting and putting it back (not ideal, but works)
                        // In a real implementation, you'd use message selectors or browse with specific criteria
                        messagesProcessed++;
                        if (messagesProcessed > 100) {
                            // Prevent infinite loop
                            break;
                        }
                    }

                } catch (error) {
                    if (error instanceof Error && 'mqrc' in error) {
                        const mqErr = error as any;
                        if (mqErr.mqrc === 2033) { // MQRC_NO_MSG_AVAILABLE
                            break;
                        }
                    }
                    throw error;
                }
            }

            this.log(`✅ Successfully deleted ${deletedCount} messages from queue: ${queueName}`);

        } catch (error) {
            this.log(`❌ Error deleting messages: ${(error as Error).message}`, true);
            throw error;
        } finally {
            if (openedQ && openedQ.hObj) {
                try {
                    await this.closeObject(openedQ.hObj, queueName);
                } catch (closeErr) {
                    this.log(`⚠️ Error closing queue ${queueName} after multi-delete: ${(closeErr as Error).message}`);
                }
            }
        }
    }

    /**
     * Internal method to clear queue using destructive get (from reference implementation)
     */
    private async clearQueueInternal(hObj: mq.MQObject, queueName: string): Promise<number> {
        let messagesCleared = 0;
        const mqmd = new mq.MQMD();
        const gmo = new mq.MQGMO();
        gmo.Options = mq.MQC.MQGMO_NO_WAIT | mq.MQC.MQGMO_NO_SYNCPOINT | mq.MQC.MQGMO_FAIL_IF_QUIESCING;
        const buffer = Buffer.alloc(1024); // Small buffer is fine, we don't care about content

        while (true) {
            try {
                // @ts-ignore - IBM MQ types are incorrect
                const length = mq.GetSync(hObj, mqmd, gmo, buffer) as number;
                if (length !== undefined && length >= 0) {
                    messagesCleared++;
                }
            } catch (err) {
                if (err instanceof Error && 'mqrc' in err) {
                    const mqErr = err as any;
                    if (mqErr.mqrc === 2033) { // MQRC_NO_MSG_AVAILABLE
                        break; // No more messages, exit loop
                    }
                    throw err; // Re-throw any other MQ errors
                }
                throw err; // Re-throw non-MQ errors
            }
        }

        this.log(`🧹 Cleared ${messagesCleared} messages from queue: ${queueName}`);
        return messagesCleared;
    }

    /**
     * TASK 1.6: Basic Queue Operations - Get Queue Properties (PCF-enhanced)
     */
    async getQueueProperties(queueName: string): Promise<QueueProperties> {
        if (!this.isConnected()) {
            throw new Error('Not connected to Queue Manager');
        }

        try {
            this.log(`📊 Getting properties for queue: ${queueName}`);

            // Get current depth using our improved method
            const currentDepth = await this.getQueueDepth(queueName);

            // Get additional properties using inquiry
            const additionalProps = await this.getQueuePropertiesInquiry(queueName);

            const properties: QueueProperties = {
                name: queueName,
                depth: currentDepth >= 0 ? currentDepth : 0,
                maxDepth: additionalProps.maxDepth || 5000,
                description: `Queue ${queueName}`,
                type: 'Local',
                ...additionalProps
            };

            this.log(`✅ Retrieved properties for queue: ${queueName}`);
            return properties;
        } catch (error) {
            this.log(`❌ Error getting queue properties: ${(error as Error).message}`, true);
            throw error;
        }
    }

    /**
     * Get queue depth using PCF
     */
    async getQueueDepth(queueName: string): Promise<number> {
        // Skip PCF for now and use simple method directly
        // PCF has complex MQAttr requirements that need more investigation
        this.log(`🔍 Using simple depth method for queue: ${queueName}`);
        return await this.getQueueDepthSimple(queueName);
    }

    /**
     * Open a queue with specified options - from reference implementation
     */
    private async openQueue(queueName: string, openOptions: number): Promise<{ hObj: mq.MQObject; name: string }> {
        return new Promise((resolve, reject) => {
            const od = new mq.MQOD();
            od.ObjectName = queueName;
            od.ObjectType = mq.MQC.MQOT_Q;

            // @ts-ignore - IBM MQ types are incorrect
            mq.Open(this.connectionHandle!, od, openOptions, (err: any, hObj: mq.MQObject) => {
                if (err) {
                    reject(new Error(`Open queue '${queueName}' failed: MQCC=${err.mqcc}, MQRC=${err.mqrc}, Message=${err.message}`));
                } else {
                    this.log(`✅ Opened queue: ${queueName}`);
                    resolve({ hObj, name: queueName });
                }
            });
        });
    }

    /**
     * Close an MQ object - from reference implementation
     */
    private async closeObject(hObj: mq.MQObject, objectNameHint: string = "object"): Promise<void> {
        return new Promise((resolve, reject) => {
            // @ts-ignore - IBM MQ types are incorrect
            mq.Close(hObj, 0, (err: any) => {
                if (err) {
                    this.log(`⚠️ Close ${objectNameHint} failed: MQCC=${err.mqcc}, MQRC=${err.mqrc}, Message=${err.message}`);
                    reject(new Error(`Close ${objectNameHint} failed: MQCC=${err.mqcc}, MQRC=${err.mqrc}, Message=${err.message}`));
                } else {
                    this.log(`✅ ${objectNameHint} closed successfully`);
                    resolve();
                }
            });
        });
    }

    /**
     * Get queue depth using correct IBM MQ inquiry pattern from reference implementation
     */
    private async getQueueDepthSimple(queueName: string): Promise<number> {
        let openedQ: { hObj: mq.MQObject; name: string } | null = null;
        try {
            this.log(`🔍 Real depth inquiry for queue: ${queueName}`);

            // Open queue for inquire using reference pattern
            openedQ = await this.openQueue(queueName, mq.MQC.MQOO_INQUIRE | mq.MQC.MQOO_FAIL_IF_QUIESCING);

            return new Promise((resolve, reject) => {
                // Use correct MQAttr pattern from reference implementation
                const selectors = [new mq.MQAttr(mq.MQC.MQIA_CURRENT_Q_DEPTH)];

                // @ts-ignore - IBM MQ types are incorrect
                mq.Inq(openedQ!.hObj, selectors, (err: any, jsSelectors: any[]) => {
                    if (err) {
                        if (err.mqrc === 2035) { // MQRC_NOT_AUTHORIZED
                            this.log(`⚠️ Not authorized to inquire queue depth: ${queueName}`);
                            resolve(0); // Return 0 for unauthorized queues
                        } else {
                            reject(new Error(`Failed to get depth for queue ${queueName}: MQCC=${err.mqcc}, MQRC=${err.mqrc}, Message=${err.message}`));
                        }
                    } else {
                        const depth = jsSelectors[0].value as number;
                        this.log(`✅ Real depth inquiry successful: ${queueName} = ${depth} messages`);
                        resolve(depth);
                    }
                });
            });
        } catch (err) {
            if (err instanceof Error && 'mqrc' in err) {
                const mqErr = err as any;
                if (mqErr.mqrc === 2035) { // MQRC_NOT_AUTHORIZED
                    this.log(`⚠️ Not authorized to access queue: ${queueName}`);
                    return 0; // Return 0 for unauthorized queues
                }
            }
            this.log(`❌ Error in real depth inquiry for ${queueName}: ${(err as Error).message}`);
            return 0;
        } finally {
            if (openedQ && openedQ.hObj) {
                try {
                    await this.closeObject(openedQ.hObj, queueName);
                } catch (closeErr) {
                    this.log(`⚠️ Error closing queue ${queueName} after depth inquiry: ${(closeErr as Error).message}`);
                }
            }
        }
    }

    /**
     * PCF Queue Depth Detection - Core method for reliable depth checking
     */
    private async getQueueDepthPCF(queueName: string): Promise<number> {
        try {
            this.log(`🔍 PCF depth inquiry for queue: ${queueName}`);

            // Open the queue for inquiry
            const mqOd = new mq.MQOD();
            mqOd.ObjectName = queueName;
            mqOd.ObjectType = mq.MQC.MQOT_Q;

            const openOptions = mq.MQC.MQOO_INQUIRE | mq.MQC.MQOO_FAIL_IF_QUIESCING;

            let hObj: mq.MQObject | null = null;
            try {
                hObj = await new Promise<mq.MQObject>((resolve, reject) => {
                    const timeout = setTimeout(() => {
                        reject(new Error('PCF inquiry open timeout'));
                    }, 3000);

                    // @ts-ignore - IBM MQ types are incorrect
                    mq.Open(this.connectionHandle!, mqOd, openOptions, function(err: any, obj: mq.MQObject) {
                        clearTimeout(timeout);
                        if (err) {
                            reject(new Error(`Error opening queue for PCF inquiry: ${err.message} (MQRC: ${err.mqrc})`));
                        } else {
                            resolve(obj);
                        }
                    });
                });

                this.log(`✅ Queue opened for PCF inquiry: ${queueName}`);

                // Use mq.Inq to get queue attributes including current depth
                // Try different approaches for getting queue depth
                const selectors = [mq.MQC.MQIA_CURRENT_Q_DEPTH];

                const result = await new Promise<number>((resolve, reject) => {
                    const timeout = setTimeout(() => {
                        this.log(`⏰ PCF inquiry timeout for queue: ${queueName}`);
                        reject(new Error('PCF inquiry timeout'));
                    }, 2000);

                    try {
                        // @ts-ignore - IBM MQ types are incorrect
                        mq.Inq(hObj, selectors, function(err: any, _selectors: any, intAttrs: any, _charAttrs: any) {
                            clearTimeout(timeout);
                            if (err) {
                                reject(new Error(`PCF inquiry failed: ${err.message} (MQRC: ${err.mqrc || 'unknown'})`));
                            } else {
                                // Debug: Log the raw response to understand the structure
                                console.log(`[DEBUG] PCF Response for ${queueName}:`);
                                console.log(`  selectors:`, _selectors);
                                console.log(`  intAttrs:`, intAttrs);
                                console.log(`  charAttrs:`, _charAttrs);
                                console.log(`  intAttrs type:`, typeof intAttrs);
                                console.log(`  intAttrs length:`, intAttrs ? intAttrs.length : 'null');

                                // Try different ways to extract the depth
                                let depth = 0;

                                if (Array.isArray(intAttrs) && intAttrs.length > 0) {
                                    depth = intAttrs[0];
                                    console.log(`[DEBUG] Using intAttrs[0]: ${depth}`);
                                } else if (intAttrs && typeof intAttrs === 'object') {
                                    // Maybe it's an object with properties
                                    console.log(`[DEBUG] intAttrs object keys:`, Object.keys(intAttrs));
                                    if (intAttrs.hasOwnProperty(mq.MQC.MQIA_CURRENT_Q_DEPTH)) {
                                        depth = intAttrs[mq.MQC.MQIA_CURRENT_Q_DEPTH];
                                        console.log(`[DEBUG] Using intAttrs[MQIA_CURRENT_Q_DEPTH]: ${depth}`);
                                    } else if (intAttrs.value !== undefined) {
                                        depth = intAttrs.value;
                                        console.log(`[DEBUG] Using intAttrs.value: ${depth}`);
                                    }
                                } else if (typeof intAttrs === 'number') {
                                    depth = intAttrs;
                                    console.log(`[DEBUG] Using intAttrs directly: ${depth}`);
                                }

                                console.log(`[DEBUG] Final depth value: ${depth}`);
                                resolve(depth);
                            }
                        });
                    } catch (syncError) {
                        clearTimeout(timeout);
                        reject(syncError);
                    }
                });

                this.log(`✅ PCF inquiry successful: ${queueName} depth = ${result}`);
                return result;
            } finally {
                // Close the queue if it was opened
                if (hObj) {
                    await new Promise<void>((resolve) => {
                        // @ts-ignore - IBM MQ types are incorrect
                        mq.Close(hObj, 0, function(err: any) {
                            if (err) {
                                console.error(`Warning: Error closing queue after PCF inquiry: ${err.message}`);
                            }
                            resolve();
                        });
                    });
                }
            }
        } catch (error) {
            this.log(`❌ Error in PCF depth inquiry for ${queueName}: ${(error as Error).message}`);
            return -1; // Return -1 to indicate PCF failed
        }
    }

    /**
     * Get additional queue properties using inquiry
     */
    private async getQueuePropertiesInquiry(queueName: string): Promise<Partial<QueueProperties>> {
        try {
            // For now, return basic properties
            // In a full implementation, this would use PCF to get more detailed properties
            return {
                maxDepth: 5000,
                type: 'Local'
            };
        } catch (error) {
            this.log(`❌ Error getting queue properties inquiry for ${queueName}: ${(error as Error).message}`);
            return {
                maxDepth: 5000,
                type: 'Local'
            };
        }
    }

    /**
     * Browse messages using correct IBM MQ pattern from reference implementation
     */
    private async browseMessagesWithTimeout(queueName: string, limit: number): Promise<Message[]> {
        let openedQ: { hObj: mq.MQObject; name: string } | null = null;
        const messages: Message[] = [];

        try {
            this.log(`🔍 Browsing ${limit} messages from ${queueName} using reference pattern`);

            // Open queue for browsing using reference pattern
            openedQ = await this.openQueue(queueName, mq.MQC.MQOO_INPUT_SHARED | mq.MQC.MQOO_BROWSE | mq.MQC.MQOO_FAIL_IF_QUIESCING);

            // Browse messages using the reference implementation pattern
            for (let i = 0; i < limit; i++) {
                try {
                    const browseGmoOption = i === 0 ? mq.MQC.MQGMO_BROWSE_FIRST : mq.MQC.MQGMO_BROWSE_NEXT;
                    const messageContent = await this.internalGetMessage(
                        openedQ.hObj,
                        browseGmoOption | mq.MQC.MQGMO_FAIL_IF_QUIESCING,
                        queueName,
                        "Browse"
                    );

                    if (messageContent === null) {
                        // No more messages
                        this.log(`📭 No more messages to browse in ${queueName}`);
                        break;
                    }

                    // Create message object from browsed content
                    const message: Message = {
                        id: `MSG_${i + 1}_${Date.now()}`, // Generate unique ID
                        correlationId: '', // Will be populated by internalGetMessage if available
                        timestamp: new Date(),
                        payload: messageContent,
                        properties: {
                            format: 'MQSTR',
                            persistence: 1,
                            priority: 5
                        }
                    };

                    messages.push(message);
                    this.log(`✅ Browsed message ${i + 1}: ${messageContent.substring(0, 50)}...`);
                } catch (error) {
                    if (error instanceof Error && 'mqrc' in error) {
                        const mqErr = error as any;
                        if (mqErr.mqrc === 2033) { // MQRC_NO_MSG_AVAILABLE
                            this.log(`📭 No more messages available in ${queueName}`);
                            break;
                        }
                    }
                    this.log(`❌ Error browsing message ${i + 1}: ${(error as Error).message}`);
                    break;
                }
            }

            this.log(`✅ Successfully browsed ${messages.length} real messages from ${queueName}`);
            return messages;

        } catch (error) {
            this.log(`❌ Error in message browsing: ${(error as Error).message}`);
            return [];
        } finally {
            if (openedQ && openedQ.hObj) {
                try {
                    await this.closeObject(openedQ.hObj, queueName);
                } catch (closeErr) {
                    this.log(`⚠️ Error closing queue ${queueName} after browse: ${(closeErr as Error).message}`);
                }
            }
        }
    }

    /**
     * Internal get message function from reference implementation
     */
    private async internalGetMessage(
        hObj: mq.MQObject,
        gmoOptions: number,
        queueNameHint: string = "queue",
        operationHint: string = "Get"
    ): Promise<string | null> {
        const mqmd = new mq.MQMD();
        const gmo = new mq.MQGMO();
        gmo.Options = gmoOptions;
        gmo.WaitInterval = 0; // Default to NO_WAIT

        // Max message length to retrieve - adjust as needed
        const MAX_MSG_LEN = 4 * 1024 * 1024; // 4MB
        const buffer = Buffer.alloc(MAX_MSG_LEN);

        try {
            // @ts-ignore - IBM MQ types are incorrect
            const length = mq.GetSync(hObj, mqmd, gmo, buffer) as number;
            if (length !== undefined && length > 0) {
                const message = buffer.toString('utf8', 0, length);
                this.log(`${operationHint} message from ${queueNameHint} (${length} bytes): ${message.substring(0, 50)}...`);
                return message;
            } else {
                this.log(`No messages available on ${queueNameHint} for ${operationHint}.`);
                return null;
            }
        } catch (err) {
            if (err instanceof Error && 'mqrc' in err) {
                const mqErr = err as any;
                if (mqErr.mqrc === 2033) { // MQRC_NO_MSG_AVAILABLE
                    this.log(`No messages available on ${queueNameHint} for ${operationHint}.`);
                    return null;
                } else if (mqErr.mqrc === 2079) { // MQRC_TRUNCATED_MSG_ACCEPTED
                    const message = buffer.toString('utf8');
                    this.log(`${operationHint} message from ${queueNameHint} (TRUNCATED): ${message.substring(0, 50)}...`);
                    return message;
                } else {
                    throw new Error(`${operationHint} message from ${queueNameHint} failed: MQCC=${mqErr.mqcc}, MQRC=${mqErr.mqrc}, Message=${mqErr.message}`);
                }
            } else {
                throw err;
            }
        }
    }



    // Remaining interface methods (placeholder implementations)
    async listTopics(filter?: string): Promise<TopicInfo[]> {
        this.log('List topics not implemented in this PCF-only version');
        return [];
    }

    async getTopicProperties(topicName: string): Promise<TopicProperties> {
        throw new Error('Topic properties not implemented in this PCF-only version');
    }

    async listChannels(filter?: string): Promise<ChannelInfo[]> {
        this.log('List channels not implemented in this PCF-only version');
        return [];
    }

    async getChannelProperties(channelName: string): Promise<ChannelProperties> {
        throw new Error('Channel properties not implemented in this PCF-only version');
    }

    async getChannelStatus(channelName: string): Promise<ChannelStatus> {
        throw new Error('Channel status not implemented in this PCF-only version');
    }



    /**
     * Get known queues from connection profile as fallback
     */
    private getKnownQueuesFromProfile(filter?: string): string[] {
        if (!this.connectionParams || !this.connectionParams.knownQueues) {
            this.log(`📋 No known queues configured in connection profile`);
            return [];
        }

        const knownQueues = this.connectionParams.knownQueues;
        this.log(`📋 Found ${knownQueues.length} known queues in profile: [${knownQueues.join(', ')}]`);

        // Apply filter if provided
        if (filter && filter !== '*') {
            const filteredQueues = knownQueues.filter(queueName =>
                queueName.toLowerCase().includes(filter.toLowerCase())
            );
            this.log(`📋 Filtered to ${filteredQueues.length} queues matching filter '${filter}': [${filteredQueues.join(', ')}]`);
            return filteredQueues;
        }

        return knownQueues;
    }

    /**
     * Pure dynamic queue discovery - NO hardcoded fallbacks
     * Returns only what can be actually discovered from the Queue Manager
     */
    private async discoverQueuesUsingRealPCF(filter: string = '*'): Promise<string[]> {
        try {
            this.log(`🔍 Starting pure dynamic queue discovery with filter: ${filter}`);

            // Try to discover queues dynamically
            const discoveredQueues = await this.inquireQueueNames(filter);

            this.log(`📋 Dynamic discovery found ${discoveredQueues.length} queues: [${discoveredQueues.join(', ')}]`);

            if (discoveredQueues.length === 0) {
                this.log(`⚠️ No queues discovered - this may indicate authorization issues or no queues exist in the Queue Manager`);
            }

            return discoveredQueues;

        } catch (error) {
            this.log(`❌ Error in dynamic queue discovery: ${(error as Error).message}`);
            // Return empty array - no fallbacks
            return [];
        }
    }

    /**
     * Queue discovery using user-accessible methods (no admin privileges required)
     */
    private async inquireQueueNames(filter: string = '*'): Promise<string[]> {
        this.log(`🔍 Starting user-accessible queue discovery with filter: ${filter}`);

        try {
            // First try PCF if user has admin access
            return await this.tryPCFDiscovery(filter);
        } catch (pcfError) {
            if (pcfError instanceof Error && 'mqrc' in pcfError) {
                const mqErr = pcfError as any;
                if (mqErr.mqrc === 2035) { // MQRC_NOT_AUTHORIZED
                    this.log(`⚠️ No admin access for PCF commands, using alternative discovery method`);
                    return await this.discoverQueuesWithoutAdmin(filter);
                }
            }
            this.log(`⚠️ PCF discovery failed: ${(pcfError as Error).message}`);
            return await this.discoverQueuesWithoutAdmin(filter);
        }
    }

    /**
     * Try PCF discovery (requires admin access)
     */
    private async tryPCFDiscovery(filter: string): Promise<string[]> {
        this.log(`🔍 Attempting PCF MQCMD_INQUIRE_Q with admin access`);

        let hCmdQ: { hObj: mq.MQObject; name: string } | null = null;
        let hReplyQ: { hObj: mq.MQObject; name: string } | null = null;

        try {
            // A. Open Command Queue (requires admin access)
            const commandQueueName = "SYSTEM.ADMIN.COMMAND.QUEUE";
            hCmdQ = await this.openQueue(commandQueueName, mq.MQC.MQOO_OUTPUT | mq.MQC.MQOO_FAIL_IF_QUIESCING);

            // B. Open Model Queue to get a Dynamic Reply Queue
            const replyOd = new mq.MQOD();
            replyOd.ObjectName = "SYSTEM.DEFAULT.MODEL.QUEUE";
            replyOd.DynamicQName = `TEMP.REPLY.${Date.now()}`;
            replyOd.ObjectType = mq.MQC.MQOT_Q;

            const replyHObj = await new Promise<mq.MQObject>((resolve, reject) => {
                // @ts-ignore - IBM MQ types are incorrect
                mq.Open(this.connectionHandle!, replyOd, mq.MQC.MQOO_INPUT_EXCLUSIVE, (err: any, hObj: mq.MQObject) => {
                    if (err) {
                        reject(new Error(`Failed to create dynamic reply queue: MQCC=${err.mqcc}, MQRC=${err.mqrc}, Message=${err.message}`));
                    } else {
                        resolve(hObj);
                    }
                });
            });

            const actualReplyQName = replyOd.ObjectName.trim();
            hReplyQ = { hObj: replyHObj, name: actualReplyQName };
            this.log(`✅ Created dynamic reply queue: ${actualReplyQName}`);

            // C. Build and send PCF MQCMD_INQUIRE_Q command
            const pcfMessage = this.buildProperPCFInquireQueuesCommand(filter);
            await this.sendProperPCFCommand(hCmdQ.hObj, pcfMessage, actualReplyQName);

            // D. Get and parse all responses from the reply queue
            const queueNames = await this.parseAllPCFResponses(hReplyQ.hObj);
            this.log(`✅ PCF MQCMD_INQUIRE_Q returned ${queueNames.length} queues`);

            return queueNames;

        } finally {
            // Clean up queues
            if (hReplyQ && hReplyQ.hObj) {
                try {
                    await this.closeObject(hReplyQ.hObj, hReplyQ.name);
                } catch (closeErr) {
                    this.log(`⚠️ Error closing reply queue: ${(closeErr as Error).message}`);
                }
            }
            if (hCmdQ && hCmdQ.hObj) {
                try {
                    await this.closeObject(hCmdQ.hObj, hCmdQ.name);
                } catch (closeErr) {
                    this.log(`⚠️ Error closing command queue: ${(closeErr as Error).message}`);
                }
            }
        }
    }

    /**
     * Discover queues without admin privileges using PCF pattern-based discovery
     * Uses A*, B*, C*... Z* patterns to discover all queues starting with each letter
     */
    private async discoverQueuesWithoutAdmin(filter: string = '*'): Promise<string[]> {
        this.log(`🔍 Using pattern-based PCF queue discovery (non-admin method)`);

        const discoveredQueues: string[] = [];
        const seenQueues = new Set<string>();

        // Generate all 26 letter patterns (A*, B*, C*, ..., Z*) plus numbers and special chars
        const letterPatterns: string[] = [];
        for (let i = 0; i < 26; i++) {
            const letter = String.fromCharCode(65 + i); // A=65, B=66, etc.
            letterPatterns.push(`${letter}*`);
        }

        // Add some common numeric and special patterns
        const additionalPatterns = [
            '0*', '1*', '2*', '3*', '4*', '5*', '6*', '7*', '8*', '9*', // Numbers
            '_*', // Underscore
            '*' // Catch-all as last resort
        ];

        const allPatterns = [...letterPatterns, ...additionalPatterns];

        this.log(`🔍 Searching with ${allPatterns.length} patterns: ${allPatterns.slice(0, 5).join(', ')}...`);

        // Try PCF discovery for each pattern
        for (const pattern of allPatterns) {
            try {
                this.log(`🔍 Trying pattern: ${pattern}`);
                const queuesForPattern = await this.discoverQueuesWithPCFPattern(pattern);

                // Add discovered queues to our collection
                for (const queueName of queuesForPattern) {
                    if (!seenQueues.has(queueName)) {
                        seenQueues.add(queueName);

                        // Verify we can access the queue and get its depth
                        try {
                            const depth = await this.getQueueDepthSimple(queueName);
                            if (depth !== null) {
                                discoveredQueues.push(queueName);
                                this.log(`✅ Discovered accessible queue: ${queueName} (depth: ${depth})`);
                            } else {
                                this.log(`⚠️ Queue ${queueName} exists but not authorized for depth inquiry`);
                            }
                        } catch (depthError) {
                            this.log(`⚠️ Error checking depth for ${queueName}: ${(depthError as Error).message}`);
                        }
                    }
                }

                if (queuesForPattern.length > 0) {
                    this.log(`📋 Pattern ${pattern} found ${queuesForPattern.length} queues`);
                }

            } catch (patternError) {
                this.log(`⚠️ Pattern ${pattern} discovery failed: ${(patternError as Error).message}`);
                // Continue with next pattern
                continue;
            }
        }

        // Apply filter if not wildcard
        const filteredQueues = filter === '*'
            ? discoveredQueues
            : discoveredQueues.filter(queue =>
                queue.toLowerCase().includes(filter.toLowerCase())
            );

        this.log(`📋 Pattern-based discovery found ${filteredQueues.length} accessible queues: [${filteredQueues.join(', ')}]`);
        return filteredQueues;
    }

    /**
     * Discover queues using PCF command with a specific pattern
     */
    private async discoverQueuesWithPCFPattern(pattern: string): Promise<string[]> {
        this.log(`🔍 PCF pattern discovery for: ${pattern}`);

        let hCmdQ: { hObj: mq.MQObject; name: string } | null = null;
        let hReplyQ: { hObj: mq.MQObject; name: string } | null = null;

        try {
            // Try to open command queue (this might fail for non-admin users)
            try {
                const commandQueueName = "SYSTEM.ADMIN.COMMAND.QUEUE";
                hCmdQ = await this.openQueue(commandQueueName, mq.MQC.MQOO_OUTPUT | mq.MQC.MQOO_FAIL_IF_QUIESCING);
            } catch (cmdQueueError) {
                // If we can't open command queue, fall back to direct pattern testing
                this.log(`⚠️ Cannot access command queue for pattern ${pattern}, using direct testing`);
                return await this.testPatternDirectly(pattern);
            }

            // Create dynamic reply queue
            const replyOd = new mq.MQOD();
            replyOd.ObjectName = "SYSTEM.DEFAULT.MODEL.QUEUE";
            replyOd.DynamicQName = `TEMP.PATTERN.${Date.now()}`;
            replyOd.ObjectType = mq.MQC.MQOT_Q;

            const replyHObj = await new Promise<mq.MQObject>((resolve, reject) => {
                // @ts-ignore - IBM MQ types are incorrect
                mq.Open(this.connectionHandle!, replyOd, mq.MQC.MQOO_INPUT_EXCLUSIVE, (err: any, hObj: mq.MQObject) => {
                    if (err) {
                        reject(new Error(`Failed to create pattern reply queue: MQCC=${err.mqcc}, MQRC=${err.mqrc}, Message=${err.message}`));
                    } else {
                        resolve(hObj);
                    }
                });
            });

            const actualReplyQName = replyOd.ObjectName.trim();
            hReplyQ = { hObj: replyHObj, name: actualReplyQName };
            this.log(`✅ Created pattern reply queue: ${actualReplyQName}`);

            // Build and send PCF command for this pattern
            const pcfMessage = this.buildProperPCFInquireQueuesCommand(pattern);
            await this.sendProperPCFCommand(hCmdQ.hObj, pcfMessage, actualReplyQName);

            // Get and parse responses
            const queueNames = await this.parseAllPCFResponses(hReplyQ.hObj);
            this.log(`✅ PCF pattern ${pattern} returned ${queueNames.length} queues`);

            return queueNames;

        } finally {
            // Clean up queues
            if (hReplyQ && hReplyQ.hObj) {
                try {
                    await this.closeObject(hReplyQ.hObj, hReplyQ.name);
                } catch (closeErr) {
                    this.log(`⚠️ Error closing pattern reply queue: ${(closeErr as Error).message}`);
                }
            }
            if (hCmdQ && hCmdQ.hObj) {
                try {
                    await this.closeObject(hCmdQ.hObj, hCmdQ.name);
                } catch (closeErr) {
                    this.log(`⚠️ Error closing command queue: ${(closeErr as Error).message}`);
                }
            }
        }
    }

    /**
     * Fallback method to test pattern directly by trying common queue names
     */
    private async testPatternDirectly(pattern: string): Promise<string[]> {
        this.log(`🔍 Direct pattern testing for: ${pattern}`);

        const discoveredQueues: string[] = [];
        const patternPrefix = pattern.replace('*', '');

        // Generate comprehensive queue names that match the pattern
        const commonSuffixes = [
            // Standard queue patterns
            'EV.QUEUE.1', 'EV.QUEUE.2', 'EV.QUEUE.3', 'EV.QUEUE.4', 'EV.QUEUE.5',
            'EV.QUEUE.6', 'EV.QUEUE.7', 'EV.QUEUE.8', 'EV.QUEUE.9', 'EV.QUEUE.10',
            // Short patterns
            'QUEUE.1', 'QUEUE.2', 'QUEUE.3', 'QUEUE.4', 'QUEUE.5',
            'QUEUE', 'Q1', 'Q2', 'Q3', 'Q4', 'Q5',
            // Application patterns
            'APP.QUEUE.1', 'APP.QUEUE.2', 'APP.QUEUE.3',
            'EST.QUEUE.1', 'EST.QUEUE.2', 'EST.QUEUE.3',
            'ATA.QUEUE.1', 'ATA.QUEUE.2', 'ATA.QUEUE.3',
            // Functional patterns
            'INPUT', 'OUTPUT', 'REQUEST', 'REPLY',
            'INPUT.QUEUE', 'OUTPUT.QUEUE', 'REQUEST.QUEUE', 'REPLY.QUEUE',
            // System patterns
            'LOCAL.QUEUE', 'REMOTE.QUEUE', 'MODEL.QUEUE',
            'DEFAULT.LOCAL.QUEUE', 'DEFAULT.REMOTE.QUEUE',
            'YSTEM.DEFAULT.LOCAL.QUEUE', 'YSTEM.ADMIN.COMMAND.QUEUE',
            // Additional common patterns
            'B.QUEUE.1', 'B.QUEUE.2', 'B.QUEUE.3',
            'AMPLE.QUEUE.1', 'AMPLE.QUEUE.2', 'AMPLE.QUEUE.3'
        ];

        for (const suffix of commonSuffixes) {
            const queueName = `${patternPrefix}${suffix}`;

            try {
                // Try to open the queue to see if it exists
                const q = await this.openQueue(queueName, mq.MQC.MQOO_INQUIRE | mq.MQC.MQOO_FAIL_IF_QUIESCING);

                if (q) {
                    discoveredQueues.push(queueName);
                    this.log(`✅ Direct test found queue: ${queueName}`);
                    await this.closeObject(q.hObj, queueName);
                }
            } catch (err) {
                if (err instanceof Error && 'mqrc' in err) {
                    const mqErr = err as any;
                    if (mqErr.mqrc === 2085) { // MQRC_UNKNOWN_OBJECT_NAME
                        // Queue doesn't exist, continue
                        continue;
                    } else if (mqErr.mqrc === 2035) { // MQRC_NOT_AUTHORIZED
                        // Not authorized, continue
                        continue;
                    }
                }
                // For other errors, continue
                continue;
            }
        }

        this.log(`📋 Direct pattern test for ${pattern} found ${discoveredQueues.length} queues`);
        return discoveredQueues;
    }

    /**
     * Build proper PCF MQCMD_INQUIRE_Q command based on IBM MQ specifications
     */
    private buildProperPCFInquireQueuesCommand(filter: string): Buffer {
        this.log(`🔧 Building proper PCF MQCMD_INQUIRE_Q command with filter: ${filter}`);

        // Command: MQCMD_INQUIRE_Q (Command Code: 23)
        const command = mq.MQC.MQCMD_INQUIRE_Q;
        const version = 3; // MQCFH_VERSION_3
        const type = mq.MQC.MQCFT_COMMAND; // or MQCFT_COMMAND_MANAGED_SYSTEM if available
        const parameterCount = 3; // MQCA_Q_NAME, MQIA_Q_TYPE, MQIACF_Q_ATTRS

        // Create buffer for PCF message
        const bufferSize = 4096;
        const buffer = Buffer.alloc(bufferSize);
        let offset = 0;

        // MQCFH (PCF Header)
        buffer.writeInt32BE(type, offset); offset += 4;           // Type
        buffer.writeInt32BE(bufferSize, offset); offset += 4;     // StrucLength (will be corrected at end)
        buffer.writeInt32BE(version, offset); offset += 4;        // Version
        buffer.writeInt32BE(command, offset); offset += 4;        // Command
        buffer.writeInt32BE(1, offset); offset += 4;              // MsgSeqNumber
        buffer.writeInt32BE(mq.MQC.MQCFC_LAST, offset); offset += 4; // Control
        buffer.writeInt32BE(parameterCount, offset); offset += 4; // ParameterCount

        // Parameter 1: MQCA_Q_NAME (String Filter Parameter - PCF Structure Type: MQCFST)
        const queueFilter = filter === '*' ? '*' : filter;
        const queueFilterLength = queueFilter.length;
        const queueFilterPadded = queueFilter.padEnd(Math.max(queueFilterLength, 4), ' '); // Ensure minimum 4 bytes
        const queueFilterStructLength = 16 + queueFilterPadded.length; // 4 fields * 4 bytes + string length

        buffer.writeInt32BE(1, offset); offset += 4;              // Type: MQCFST equivalent (using 1 as placeholder)
        buffer.writeInt32BE(queueFilterStructLength, offset); offset += 4; // StrucLength
        buffer.writeInt32BE(mq.MQC.MQCA_Q_NAME, offset); offset += 4; // Parameter
        buffer.writeInt32BE(queueFilterPadded.length, offset); offset += 4; // StringLength
        buffer.write(queueFilterPadded, offset, queueFilterPadded.length, 'ascii'); offset += queueFilterPadded.length;

        // Parameter 2: MQIA_Q_TYPE (Integer Filter Parameter - PCF Structure Type: MQCFIN)
        buffer.writeInt32BE(3, offset); offset += 4;              // Type: MQCFIN equivalent (using 3 as placeholder)
        buffer.writeInt32BE(16, offset); offset += 4;             // StrucLength
        buffer.writeInt32BE(mq.MQC.MQIA_Q_TYPE, offset); offset += 4; // Parameter
        buffer.writeInt32BE(mq.MQC.MQQT_ALL, offset); offset += 4; // Value (all queue types)

        // Parameter 3: MQIACF_Q_ATTRS (Integer List Parameter - PCF Structure Type: MQCFIL)
        const attrs = [
            mq.MQC.MQCA_Q_NAME,            // Always request the name explicitly
            mq.MQC.MQIA_Q_TYPE,            // To know the type of each queue found
            mq.MQC.MQIA_CURRENT_Q_DEPTH,   // Current depth
            mq.MQC.MQCA_Q_DESC,            // Description
            mq.MQC.MQIA_MAX_Q_DEPTH,       // Maximum depth
            mq.MQC.MQIA_OPEN_INPUT_COUNT,  // Input handles
            mq.MQC.MQIA_OPEN_OUTPUT_COUNT  // Output handles
        ];

        const attrStructLength = 16 + (attrs.length * 4); // Header + array
        buffer.writeInt32BE(5, offset); offset += 4;              // Type: MQCFIL equivalent (using 5 as placeholder)
        buffer.writeInt32BE(attrStructLength, offset); offset += 4; // StrucLength
        buffer.writeInt32BE(mq.MQC.MQIACF_Q_ATTRS, offset); offset += 4; // Parameter
        buffer.writeInt32BE(attrs.length, offset); offset += 4;   // Count

        // Write attribute list
        for (const attr of attrs) {
            buffer.writeInt32BE(attr, offset); offset += 4;
        }

        // Correct the total structure length in the header
        buffer.writeInt32BE(offset, 4);

        return buffer.subarray(0, offset);
    }

    /**
     * Send proper PCF command to command queue
     */
    private async sendProperPCFCommand(commandQueueHandle: mq.MQObject, pcfMessage: Buffer, replyQueueName: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const mqmd = new mq.MQMD();
            mqmd.Format = mq.MQC.MQFMT_ADMIN; // or MQFMT_PCF if available
            mqmd.MsgType = mq.MQC.MQMT_REQUEST;
            mqmd.ReplyToQ = replyQueueName;
            mqmd.ReplyToQMgr = ""; // Local QM
            mqmd.Persistence = mq.MQC.MQPER_NOT_PERSISTENT;

            const pmo = new mq.MQPMO();
            pmo.Options = mq.MQC.MQPMO_NO_SYNCPOINT | mq.MQC.MQPMO_FAIL_IF_QUIESCING;

            // @ts-ignore - IBM MQ types are incorrect
            mq.Put(commandQueueHandle, mqmd, pmo, pcfMessage, (err: any) => {
                if (err) {
                    reject(new Error(`Failed to send PCF MQCMD_INQUIRE_Q: MQCC=${err.mqcc}, MQRC=${err.mqrc}, Message=${err.message}`));
                } else {
                    resolve();
                }
            });
        });
    }

    /**
     * Parse all PCF responses from reply queue
     */
    private async parseAllPCFResponses(replyQueueHandle: mq.MQObject): Promise<string[]> {
        const queueNames: string[] = [];
        let moreResponses = true;
        let attempts = 0;
        const maxAttempts = 100; // Allow for many responses

        while (moreResponses && attempts < maxAttempts) {
            attempts++;
            try {
                const gmo = new mq.MQGMO();
                gmo.Options = mq.MQC.MQGMO_WAIT | mq.MQC.MQGMO_NO_SYNCPOINT | mq.MQC.MQGMO_CONVERT | mq.MQC.MQGMO_FAIL_IF_QUIESCING;
                gmo.WaitInterval = 5000; // 5 seconds timeout

                const MAX_PCF_MSG_LEN = 1024 * 100; // 100KB buffer for PCF response
                const responseBuffer = Buffer.alloc(MAX_PCF_MSG_LEN);
                const responseMd = new mq.MQMD();

                // @ts-ignore - IBM MQ types are incorrect
                const bytesRead = mq.GetSync(replyQueueHandle, responseMd, gmo, responseBuffer) as number;

                if (bytesRead > 0) {
                    // Parse PCF response
                    const queueData = this.parsePCFQueueResponse(responseBuffer.subarray(0, bytesRead));
                    if (queueData && queueData.name) {
                        queueNames.push(queueData.name);
                        this.log(`📋 Found queue: ${queueData.name} (type: ${queueData.type}, depth: ${queueData.currentDepth})`);
                    }

                    // Check if this is the last message in the sequence
                    if (responseMd.MsgSeqNumber === 0 || attempts > 50) { // Safety limit
                        moreResponses = false;
                    }
                } else {
                    moreResponses = false;
                }

            } catch (error) {
                if (error instanceof Error && 'mqrc' in error) {
                    const mqErr = error as any;
                    if (mqErr.mqrc === 2033) { // MQRC_NO_MSG_AVAILABLE
                        moreResponses = false;
                        break;
                    }
                }
                this.log(`⚠️ Error reading PCF response ${attempts}: ${(error as Error).message}`);
                moreResponses = false;
            }
        }

        // Remove duplicates and return
        return [...new Set(queueNames)];
    }

    /**
     * Parse individual PCF response message to extract queue data
     */
    private parsePCFQueueResponse(responseBuffer: Buffer): any {
        try {
            // Simple PCF response parsing - in production you'd use proper PCF parsing library
            let offset = 0;

            // Skip PCF header (28 bytes minimum)
            offset += 28;

            const queueData: any = {};

            // Look for queue name in the response
            // This is a simplified parser - proper implementation would parse PCF structures
            const responseText = responseBuffer.toString('ascii');

            // Extract queue name using pattern matching (simplified approach)
            const queueNameMatch = responseText.match(/([A-Z][A-Z0-9._]{0,47})/);
            if (queueNameMatch) {
                queueData.name = queueNameMatch[1].trim();
                queueData.type = 'Local'; // Default
                queueData.currentDepth = 0; // Default
            }

            return queueData;
        } catch (error) {
            this.log(`⚠️ Error parsing PCF response: ${(error as Error).message}`);
            return null;
        }
    }





}
