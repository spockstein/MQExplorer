import * as vscode from 'vscode';
import { IBMMQProvider } from '../providers/IBMMQProvider';
import { IBMMQConnectionProfile } from '../models/connectionProfile';

/**
 * Test script to verify message browsing functionality
 */
async function testBrowseMessages() {
    console.log('Starting message browsing test...');

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
        // Create IBM MQ provider
        log('Creating IBM MQ provider...');
        const provider = new IBMMQProvider();

        // Connection parameters (adjust these for your environment)
        const connectionParams: IBMMQConnectionProfile['connectionParams'] = {
            queueManager: 'QM1',
            host: 'localhost',
            port: 1414,
            channel: 'DEV.APP.SVRCONN',
            username: 'app',
            password: 'passw0rd',
            useTLS: false
        };

        // Connect to queue manager
        log(`Connecting to queue manager ${connectionParams.queueManager}...`);
        await provider.connect(connectionParams);
        log('Successfully connected to queue manager');

        // Browse messages from a test queue
        const queueName = 'DEV.QUEUE.1';
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

        // Disconnect from queue manager
        log('Disconnecting from queue manager...');
        await provider.disconnect();
        log('Successfully disconnected from queue manager');

        log('Test completed successfully!');
    } catch (error) {
        log(`Error: ${(error as Error).message}`, true);
        log(`Stack trace: ${(error as Error).stack}`, true);
        log('Test failed!', true);
    }
}

// Export the test function
export { testBrowseMessages };
