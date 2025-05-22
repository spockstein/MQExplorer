import * as vscode from 'vscode';
import { AWSSQSProvider } from '../providers/AWSSQSProvider';
import { AWSSQSConnectionProfile } from '../models/connectionProfile';
import { Message } from '../providers/IMQProvider';

/**
 * Test script to verify AWS SQS operations (put and delete)
 */
export async function testAWSSQSOperations(context: vscode.ExtensionContext) {
    console.log('Starting AWS SQS operations test...');

    // Create output channel for logging
    const outputChannel = vscode.window.createOutputChannel('AWS SQS Operations Test');
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
        // Create AWS SQS provider
        log('Creating AWS SQS provider...');
        const provider = new AWSSQSProvider();

        // Get AWS region from user
        const region = await vscode.window.showInputBox({
            prompt: 'Enter AWS region',
            value: 'us-east-1',
            ignoreFocusOut: true
        });

        if (!region) {
            log('Region is required. Test aborted.', true);
            return;
        }

        // Get authentication method
        const useProfileCredentials = await vscode.window.showQuickPick(['Yes', 'No'], {
            placeHolder: 'Use AWS credentials from shared credentials file?',
            ignoreFocusOut: true
        }) === 'Yes';

        let connectionParams: AWSSQSConnectionProfile['connectionParams'];

        if (useProfileCredentials) {
            // Get profile name
            const profile = await vscode.window.showInputBox({
                prompt: 'Enter AWS profile name',
                value: 'default',
                ignoreFocusOut: true
            }) || 'default';

            connectionParams = {
                region,
                useProfileCredentials: true,
                profile
            };
        } else {
            // Get access key ID
            const accessKeyId = await vscode.window.showInputBox({
                prompt: 'Enter AWS Access Key ID',
                ignoreFocusOut: true
            });

            // Get secret access key
            const secretAccessKey = await vscode.window.showInputBox({
                prompt: 'Enter AWS Secret Access Key',
                password: true,
                ignoreFocusOut: true
            });

            if (!accessKeyId || !secretAccessKey) {
                log('Access Key ID and Secret Access Key are required. Test aborted.', true);
                return;
            }

            connectionParams = {
                region,
                credentials: {
                    accessKeyId,
                    secretAccessKey
                }
            };
        }

        // Ask if using LocalStack or custom endpoint
        const useCustomEndpoint = await vscode.window.showQuickPick(['Yes', 'No'], {
            placeHolder: 'Use custom endpoint (e.g., LocalStack)?',
            ignoreFocusOut: true
        }) === 'Yes';

        if (useCustomEndpoint) {
            const endpoint = await vscode.window.showInputBox({
                prompt: 'Enter custom endpoint URL',
                value: 'http://localhost:4566',
                ignoreFocusOut: true
            });

            if (endpoint) {
                connectionParams.endpoint = endpoint;
            }
        }

        // Connect to AWS SQS
        log(`Connecting to AWS SQS in region: ${region}...`);
        await provider.connect(connectionParams, context);
        log('Successfully connected to AWS SQS');

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
            correlationId: 'test-correlation-id',
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
            log(`  URL: ${queueProperties.url || 'N/A'}`);
            log(`  ARN: ${queueProperties.arn || 'N/A'}`);
            log(`  Visibility Timeout: ${queueProperties.visibilityTimeout || 'N/A'} seconds`);
            log(`  Maximum Message Size: ${queueProperties.maximumMessageSize || 'N/A'} bytes`);
            log(`  Message Retention Period: ${queueProperties.messageRetentionPeriod || 'N/A'} seconds`);
            log(`  Delay Seconds: ${queueProperties.delaySeconds || 'N/A'} seconds`);
            log(`  FIFO Queue: ${queueProperties.fifoQueue ? 'Yes' : 'No'}`);
            
            if (queueProperties.deadLetterTargetArn) {
                log(`  Dead Letter Queue ARN: ${queueProperties.deadLetterTargetArn}`);
                log(`  Max Receive Count: ${queueProperties.maxReceiveCount || 'N/A'}`);
            }
        } catch (error) {
            log(`Error getting queue properties: ${(error as Error).message}`, true);
        }

        // Test 9: Clear queue
        log('Test 9: Clear queue');
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

        // Disconnect from AWS SQS
        log('Disconnecting from AWS SQS...');
        await provider.disconnect();
        log('Successfully disconnected from AWS SQS');

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
        
        // Display receipt handle if available
        if (message.properties.receiptHandle) {
            log(`  Receipt Handle: ${message.properties.receiptHandle.substring(0, 20)}...`);
        }
        
        // Display message attributes if available
        if (message.properties.messageAttributes) {
            log('  Message Attributes:');
            for (const [key, value] of Object.entries(message.properties.messageAttributes)) {
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
