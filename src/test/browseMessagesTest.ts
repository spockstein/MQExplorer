import * as vscode from 'vscode';
import { MockMQProvider } from './mocks/MockMQProvider';

/**
 * Test script to verify message browsing functionality
 */
async function testBrowseMessages() {
    console.log('Starting message browsing test with mock provider...');

    // Create output channel for logging
    const outputChannel = vscode.window.createOutputChannel('MQ Explorer Test');
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
        await provider.connect(connectionParams);
        log('Successfully connected to mock queue manager');

        // Browse messages from a test queue
        const queueName = 'MOCK.QUEUE.1';
        log(`Browsing messages from queue: ${queueName}`);

        const messages = await provider.browseMessages(queueName, {
            limit: 10,
            startPosition: 0
        });

        // Log results
        log(`Successfully retrieved ${messages.length} messages from queue`);

        // Display message details
        messages.forEach((message, index) => {
            log(`Message ${index + 1}:`);
            log(`  ID: ${message.id}`);
            log(`  Correlation ID: ${message.correlationId || 'N/A'}`);
            log(`  Timestamp: ${message.timestamp ? message.timestamp.toLocaleString() : 'N/A'}`);
            log(`  Format: ${message.properties.format || 'N/A'}`);

            // Display payload (first 100 chars)
            const payload = typeof message.payload === 'string'
                ? message.payload
                : message.payload.toString('utf8');
            log(`  Payload: ${payload.substring(0, 100)}${payload.length > 100 ? '...' : ''}`);
            log('---');
        });

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

// Export the test function
export { testBrowseMessages };
