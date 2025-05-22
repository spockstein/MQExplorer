import * as vscode from 'vscode';
import { AzureServiceBusProvider } from '../providers/AzureServiceBusProvider';
import { AzureServiceBusConnectionProfile } from '../models/connectionProfile';
import { Message } from '../providers/IMQProvider';

/**
 * Test script to verify Azure Service Bus operations (put and delete)
 */
export async function testAzureServiceBusOperations(context: vscode.ExtensionContext) {
    console.log('Starting Azure Service Bus operations test...');

    // Create output channel for logging
    const outputChannel = vscode.window.createOutputChannel('Azure Service Bus Operations Test');
    outputChannel.show();

    const log = (message: string, isError = false) => {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] ${message}`;
        outputChannel.appendLine(logMessage);

        if (isError) {
            console.error(logMessage);
        } else {
            console.log(logMessage);
        }
    };

    try {
        // Create Azure Service Bus provider
        log('Creating Azure Service Bus provider...');
        const provider = new AzureServiceBusProvider();

        // Get connection string from user
        const connectionString = await vscode.window.showInputBox({
            prompt: 'Enter Azure Service Bus connection string',
            password: true,
            ignoreFocusOut: true
        });

        if (!connectionString) {
            log('Connection string is required. Test aborted.', true);
            return;
        }

        // Connection parameters
        const connectionParams: AzureServiceBusConnectionProfile['connectionParams'] = {
            connectionString,
            retryOptions: {
                maxRetries: 3,
                retryDelayInMs: 1000,
                maxRetryDelayInMs: 30000,
                mode: 'exponential'
            }
        };

        // Connect to Azure Service Bus
        log('Connecting to Azure Service Bus...');
        await provider.connect(connectionParams, context);
        log('Successfully connected to Azure Service Bus');

        // Test queue
        const queueName = await vscode.window.showInputBox({
            prompt: 'Enter queue name to test',
            value: 'test-queue',
            ignoreFocusOut: true
        }) || 'test-queue';

        // Test 1: List queues
        log('Test 1: List queues');
        const queues = await provider.listQueues();
        log(`Found ${queues.length} queues:`);
        queues.forEach((queue, index) => {
            log(`  ${index + 1}. ${queue.name} (${queue.depth} messages)`);
        });

        // Check if the test queue exists
        const queueExists = queues.some(q => q.name === queueName);
        if (!queueExists) {
            log(`Warning: Test queue '${queueName}' does not exist. Some tests may fail.`, true);
        }

        // Test 2: Browse initial messages
        log(`Test 2: Browse initial messages in queue: ${queueName}`);
        let messages = await provider.browseMessages(queueName, { limit: 10, startPosition: 0 });
        log(`Initial queue state: ${messages.length} messages`);
        logMessages(messages, log);

        // Test 3: Put a message
        log('Test 3: Put a message');
        const testMessage = `Test message ${Date.now()}`;
        await provider.putMessage(queueName, testMessage, {
            contentType: 'text/plain',
            label: 'Test Message',
            messageId: `test-message-${Date.now()}`,
            correlationId: 'test-correlation-id',
            timeToLive: '300000', // 5 minutes
            headers: {
                'custom-property-1': 'value1',
                'custom-property-2': 'value2'
            }
        });
        log('Message put operation completed');

        // Test 4: Verify message was added
        log('Test 4: Verify message was added');
        messages = await provider.browseMessages(queueName, { limit: 10, startPosition: 0 });
        log(`Queue state after put: ${messages.length} messages`);
        logMessages(messages, log);

        // Check if the new message is there
        const newMessage = messages.find(m => {
            const payload = typeof m.payload === 'string' ? m.payload : m.payload.toString('utf8');
            return payload.includes('Test message');
        });

        if (newMessage) {
            log('SUCCESS: New message was found in the queue');
        } else {
            log('ERROR: New message was not found in the queue', true);
        }

        // Test 5: Delete a specific message
        log('Test 5: Delete a specific message');
        if (messages.length > 0) {
            const messageToDelete = messages[0];
            log(`Deleting message with ID: ${messageToDelete.id}`);

            try {
                await provider.deleteMessage(queueName, messageToDelete.id);
                log('Delete operation completed');

                // Verify message was deleted
                const messagesAfterDelete = await provider.browseMessages(queueName, { limit: 10, startPosition: 0 });
                log(`Queue state after delete: ${messagesAfterDelete.length} messages`);
                logMessages(messagesAfterDelete, log);

                // Check if the message was actually deleted
                const deletedMessageStillExists = messagesAfterDelete.some(m => m.id === messageToDelete.id);
                if (deletedMessageStillExists) {
                    log('ERROR: Message was not actually deleted', true);
                } else {
                    log('SUCCESS: Message was successfully deleted and is no longer in the queue');
                }
            } catch (error) {
                log(`Error deleting message: ${(error as Error).message}`, true);
            }
        } else {
            log('No messages to delete', true);
        }

        // Test 6: Put multiple messages and verify
        log('Test 6: Put multiple messages and verify');
        for (let i = 0; i < 3; i++) {
            const testMessage = `Batch test message ${i + 1} - ${Date.now()}`;
            await provider.putMessage(queueName, testMessage, {
                messageId: `batch-message-${i + 1}-${Date.now()}`,
                headers: {
                    'batch-id': `batch-${Date.now()}`,
                    'index': `${i + 1}`
                }
            });
            log(`Put message ${i + 1}`);
        }

        // Verify messages were added
        messages = await provider.browseMessages(queueName, { limit: 20, startPosition: 0 });
        log(`Queue state after multiple put: ${messages.length} messages`);
        logMessages(messages, log);

        // Test 7: Delete multiple messages
        log('Test 7: Delete multiple messages');
        if (messages.length >= 2) {
            const messagesToDelete = messages.slice(0, 2).map(m => m.id);
            log(`Deleting ${messagesToDelete.length} messages with IDs: ${messagesToDelete.join(', ')}`);

            try {
                await provider.deleteMessages(queueName, messagesToDelete);
                log('Multiple delete operation completed');

                // Verify messages were deleted
                const messagesAfterDelete = await provider.browseMessages(queueName, { limit: 10, startPosition: 0 });
                log(`Queue state after multiple delete: ${messagesAfterDelete.length} messages`);
                logMessages(messagesAfterDelete, log);

                // Check if the messages were actually deleted
                const deletedMessagesStillExist = messagesToDelete.some(id =>
                    messagesAfterDelete.some(m => m.id === id)
                );

                if (deletedMessagesStillExist) {
                    log('ERROR: Some messages were not actually deleted', true);
                } else {
                    log('SUCCESS: All messages were successfully deleted and are no longer in the queue');
                }
            } catch (error) {
                log(`Error deleting messages: ${(error as Error).message}`, true);
            }
        } else {
            log('Not enough messages to test multiple delete', true);
        }

        // Test 8: Get queue properties
        log('Test 8: Get queue properties');
        try {
            const queueProperties = await provider.getQueueProperties(queueName);
            log('Queue properties:');
            log(`  Name: ${queueProperties.name}`);
            log(`  Depth: ${queueProperties.depth}`);
            log(`  Description: ${queueProperties.description || 'N/A'}`);
            log(`  Max Size (MB): ${queueProperties.maxSizeInMegabytes || 'N/A'}`);
            log(`  Lock Duration: ${queueProperties.lockDuration || 'N/A'}`);
            log(`  Default TTL: ${queueProperties.defaultMessageTimeToLive || 'N/A'}`);
            log(`  Status: ${queueProperties.status || 'N/A'}`);
        } catch (error) {
            log(`Error getting queue properties: ${(error as Error).message}`, true);
        }

        // Test 9: List topics
        log('Test 9: List topics');
        try {
            const topics = await provider.listTopics();
            log(`Found ${topics.length} topics:`);
            topics.forEach((topic, index) => {
                log(`  ${index + 1}. ${topic.name} (${topic.description})`);
            });

            // If there are topics, test topic operations
            if (topics.length > 0) {
                const topicName = topics[0].name;
                
                // Test 10: Get topic properties
                log(`Test 10: Get topic properties for topic: ${topicName}`);
                const topicProperties = await provider.getTopicProperties(topicName);
                log('Topic properties:');
                log(`  Name: ${topicProperties.name}`);
                log(`  Description: ${topicProperties.description || 'N/A'}`);
                log(`  Status: ${topicProperties.status || 'N/A'}`);
                log(`  Max Size (MB): ${topicProperties.maxSizeInMegabytes || 'N/A'}`);
                log(`  Default TTL: ${topicProperties.defaultMessageTimeToLive || 'N/A'}`);
                log(`  Subscription Count: ${topicProperties.subscriptionCount || 0}`);
                
                // Test 11: Publish a message to a topic
                log(`Test 11: Publish a message to topic: ${topicName}`);
                const topicMessage = `Topic test message - ${Date.now()}`;
                await provider.publishMessage(topicName, topicMessage, {
                    contentType: 'text/plain',
                    label: 'Topic Test Message',
                    messageId: `topic-message-${Date.now()}`
                });
                log('Successfully published message to topic');
            }
        } catch (error) {
            log(`Error in topic operations: ${(error as Error).message}`, true);
        }

        // Test 12: Clear queue
        log('Test 12: Clear queue');
        try {
            await provider.clearQueue(queueName);
            
            // Verify queue was cleared
            messages = await provider.browseMessages(queueName, { limit: 10, startPosition: 0 });
            log(`Queue state after clear: ${messages.length} messages`);
            
            if (messages.length === 0) {
                log('SUCCESS: Queue was successfully cleared');
            } else {
                log('ERROR: Queue was not cleared', true);
            }
        } catch (error) {
            log(`Error clearing queue: ${(error as Error).message}`, true);
        }

        // Disconnect from Azure Service Bus
        log('Disconnecting from Azure Service Bus...');
        await provider.disconnect();
        log('Successfully disconnected from Azure Service Bus');

        log('Test completed successfully!');
    } catch (error) {
        log(`Error: ${(error as Error).message}`, true);
        log(`Stack trace: ${(error as Error).stack}`, true);
        log('Test failed!', true);
    }
}

/**
 * Helper function to log message details
 */
function logMessages(messages: Message[], log: (message: string, isError?: boolean) => void) {
    messages.forEach((message, index) => {
        log(`Message ${index + 1}:`);
        log(`  ID: ${message.id}`);
        log(`  Correlation ID: ${message.correlationId || 'N/A'}`);
        log(`  Timestamp: ${message.timestamp ? message.timestamp.toLocaleString() : 'N/A'}`);
        log(`  Content Type: ${message.properties.contentType || 'N/A'}`);
        log(`  Label: ${message.properties.label || 'N/A'}`);
        
        // Display sequence number if available
        if (message.properties.sequenceNumber) {
            log(`  Sequence Number: ${message.properties.sequenceNumber}`);
        }
        
        // Display application properties if available
        if (message.properties.applicationProperties) {
            log('  Application Properties:');
            for (const [key, value] of Object.entries(message.properties.applicationProperties)) {
                log(`    ${key}: ${value}`);
            }
        }
        
        // Display headers if available
        if (message.properties.headers) {
            log('  Headers:');
            for (const [key, value] of Object.entries(message.properties.headers)) {
                log(`    ${key}: ${value}`);
            }
        }

        // Display payload (first 100 chars)
        const payload = typeof message.payload === 'string'
            ? message.payload
            : message.payload.toString('utf8');
        log(`  Payload: ${payload.substring(0, 100)}${payload.length > 100 ? '...' : ''}`);
    });
}
