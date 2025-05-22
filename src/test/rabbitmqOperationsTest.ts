import * as vscode from 'vscode';
import { RabbitMQProvider } from '../providers/RabbitMQProvider';
import { RabbitMQConnectionProfile } from '../models/connectionProfile';
import { Message } from '../providers/IMQProvider';

/**
 * Test script to verify RabbitMQ operations (put and delete)
 */
export async function testRabbitMQOperations(context: vscode.ExtensionContext) {
    console.log('Starting RabbitMQ operations test...');

    // Create output channel for logging
    const outputChannel = vscode.window.createOutputChannel('RabbitMQ Operations Test');
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
        // Create RabbitMQ provider
        log('Creating RabbitMQ provider...');
        const provider = new RabbitMQProvider();

        // Connection parameters (adjust these for your environment)
        const connectionParams: RabbitMQConnectionProfile['connectionParams'] = {
            host: 'localhost',
            port: 5672,
            vhost: '/',
            username: 'guest',
            password: 'guest',
            useTLS: false
        };

        // Connect to RabbitMQ
        log(`Connecting to RabbitMQ at ${connectionParams.host}:${connectionParams.port}...`);
        await provider.connect(connectionParams, context);
        log('Successfully connected to RabbitMQ');

        // Test queue
        const queueName = 'test.queue';

        // Test 1: Browse initial messages
        log('Test 1: Browse initial messages');
        let messages = await provider.browseMessages(queueName, { limit: 10, startPosition: 0 });
        log(`Initial queue state: ${messages.length} messages`);
        logMessages(messages, log);

        // Test 2: Put a message
        log('Test 2: Put a message');
        const testMessage = `Test message ${Date.now()}`;
        await provider.putMessage(queueName, testMessage, {
            contentType: 'text/plain',
            deliveryMode: 2, // persistent
            priority: 5,
            replyTo: 'test.reply.queue',
            correlationId: 'test-correlation-id'
        });
        log('Message put operation completed');

        // Test 3: Verify message was added
        log('Test 3: Verify message was added');
        messages = await provider.browseMessages(queueName, { limit: 10, startPosition: 0 });
        log(`Queue state after put: ${messages.length} messages`);
        logMessages(messages, log);

        // Check if the new message is there (should be the last one)
        const newMessage = messages[messages.length - 1];
        if (newMessage && typeof newMessage.payload === 'string' ?
            newMessage.payload.includes('Test message') :
            newMessage.payload.toString('utf8').includes('Test message')) {
            log('SUCCESS: New message was found in the queue');
        } else {
            log('ERROR: New message was not found in the queue', true);
        }

        // Test 4: Delete a specific message
        log('Test 4: Delete a specific message');
        if (messages.length > 0) {
            const messageToDelete = messages[0];
            log(`Deleting message with ID: ${messageToDelete.id}`);

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
        } else {
            log('No messages to delete', true);
        }

        // Test 5: Delete multiple messages
        log('Test 5: Delete multiple messages');
        messages = await provider.browseMessages(queueName, { limit: 10, startPosition: 0 });
        if (messages.length >= 2) {
            const messagesToDelete = messages.slice(0, 2).map(m => m.id);
            log(`Deleting ${messagesToDelete.length} messages with IDs: ${messagesToDelete.join(', ')}`);

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
        } else {
            log('Not enough messages to test multiple delete', true);
        }

        // Test 6: Put multiple messages and verify
        log('Test 6: Put multiple messages and verify');
        for (let i = 0; i < 3; i++) {
            const testMessage = `Batch test message ${i + 1} - ${Date.now()}`;
            await provider.putMessage(queueName, testMessage);
            log(`Put message ${i + 1}`);
        }

        // Verify messages were added
        messages = await provider.browseMessages(queueName, { limit: 10, startPosition: 0 });
        log(`Queue state after multiple put: ${messages.length} messages`);
        logMessages(messages, log);

        // Test 7: Clear queue
        log('Test 7: Clear queue');
        await provider.clearQueue(queueName);
        
        // Verify queue was cleared
        messages = await provider.browseMessages(queueName, { limit: 10, startPosition: 0 });
        log(`Queue state after clear: ${messages.length} messages`);
        
        if (messages.length === 0) {
            log('SUCCESS: Queue was successfully cleared');
        } else {
            log('ERROR: Queue was not cleared', true);
        }

        // Test 8: Test topic operations
        log('Test 8: Test topic operations');
        const topicName = 'test.topic';
        
        // Publish a message to the topic
        const topicMessage = `Topic test message - ${Date.now()}`;
        await provider.publishMessage(topicName, topicMessage, {
            contentType: 'text/plain',
            deliveryMode: 1, // non-persistent
            routingKey: 'test.routing.key'
        });
        log('Successfully published message to topic');

        // Disconnect from RabbitMQ
        log('Disconnecting from RabbitMQ...');
        await provider.disconnect();
        log('Successfully disconnected from RabbitMQ');

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

        // Display payload (first 100 chars)
        const payload = typeof message.payload === 'string'
            ? message.payload
            : message.payload.toString('utf8');
        log(`  Payload: ${payload.substring(0, 100)}${payload.length > 100 ? '...' : ''}`);
    });
}
