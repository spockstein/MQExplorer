import * as vscode from 'vscode';
import { MockMQProvider } from './mocks/MockMQProvider';

/**
 * Test script to verify queue depth count display
 */
export async function testQueueDepth(context: vscode.ExtensionContext) {
    console.log('Starting queue depth test with mock provider...');

    // Create output channel for logging
    const outputChannel = vscode.window.createOutputChannel('Queue Depth Test');
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
        // We don't need the connection manager for the mock test

        // Create Mock MQ provider
        log('Creating Mock MQ provider...');
        const provider = new MockMQProvider();

        // Connection parameters (these are mock parameters and won't actually connect to a real queue manager)
        const connectionParams = {
            queueManager: 'MOCK_QM',
            host: 'mock-host',
            port: 1414,
            channel: 'MOCK.CHANNEL',
            username: 'mock-user',
            password: 'mock-password',
            useTLS: false
        };

        // Connect to mock queue manager
        log(`Connecting to mock queue manager ${connectionParams.queueManager}...`);
        await provider.connect(connectionParams, context);
        log('Successfully connected to mock queue manager');

        // Test queue
        const queueName = 'MOCK.QUEUE.1';

        // Test 1: Get initial queue depth
        log('Test 1: Get initial queue depth');
        const initialProps = await provider.getQueueProperties(queueName);
        log(`Initial queue depth: ${initialProps.depth}`);

        // Test 2: Put a message and verify depth increases
        log('Test 2: Put a message and verify depth increases');
        const testMessage = `Test message ${Date.now()}`;
        await provider.putMessage(queueName, testMessage);
        log('Message put operation completed');

        // Get updated queue depth
        const afterPutProps = await provider.getQueueProperties(queueName);
        log(`Queue depth after put: ${afterPutProps.depth}`);

        // Verify depth increased
        if (afterPutProps.depth! > initialProps.depth!) {
            log('SUCCESS: Queue depth increased after putting a message');
        } else {
            log('ERROR: Queue depth did not increase after putting a message', true);
        }

        // Test 3: Delete a message and verify depth decreases
        log('Test 3: Delete a message and verify depth decreases');

        // Get messages
        const messages = await provider.browseMessages(queueName, { limit: 1 });

        if (messages.length > 0) {
            const messageToDelete = messages[0];
            log(`Deleting message with ID: ${messageToDelete.id}`);

            await provider.deleteMessage(queueName, messageToDelete.id);
            log('Delete operation completed');

            // Get updated queue depth
            const afterDeleteProps = await provider.getQueueProperties(queueName);
            log(`Queue depth after delete: ${afterDeleteProps.depth}`);

            // Verify depth decreased
            if (afterDeleteProps.depth! < afterPutProps.depth!) {
                log('SUCCESS: Queue depth decreased after deleting a message');
            } else {
                log('ERROR: Queue depth did not decrease after deleting a message', true);
            }
        } else {
            log('No messages to delete', true);
        }

        // Test 4: Clear queue and verify depth is zero
        log('Test 4: Clear queue and verify depth is zero');
        await provider.clearQueue(queueName);
        log('Clear queue operation completed');

        // Get updated queue depth
        const afterClearProps = await provider.getQueueProperties(queueName);
        log(`Queue depth after clear: ${afterClearProps.depth}`);

        // Verify depth is zero
        if (afterClearProps.depth === 0) {
            log('SUCCESS: Queue depth is zero after clearing the queue');
        } else {
            log('ERROR: Queue depth is not zero after clearing the queue', true);
        }

        // Disconnect from mock queue manager
        log('Disconnecting from mock queue manager...');
        await provider.disconnect();
        log('Successfully disconnected from mock queue manager');

        log('Test with mock provider completed successfully!');
    } catch (error) {
        log(`Error: ${(error as Error).message}`, true);
        log(`Stack trace: ${(error as Error).stack}`, true);
        log('Test with mock provider failed!', true);
    }
}
