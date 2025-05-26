import * as vscode from 'vscode';
import { IBMMQProvider } from '../providers/IBMMQProvider';

/**
 * Test script to verify message browsing functionality
 */
export async function testBrowseMessages(): Promise<void> {
    const log = (message: string) => {
        console.log(`[BrowseMessageTest] ${message}`);
        vscode.window.showInformationMessage(`[BrowseMessageTest] ${message}`);
    };

    try {
        log('Starting browse message test...');

        // Create IBM MQ provider
        const provider = new IBMMQProvider();

        // Connection parameters for local IBM MQ
        const connectionParams = {
            host: 'localhost',
            port: 1414,
            queueManager: 'QM1',
            channel: 'DEV.APP.SVRCONN',
            username: 'app',
            password: 'passw0rd'
        };

        // Connect to queue manager
        log(`Connecting to queue manager ${connectionParams.queueManager}...`);
        await provider.connect(connectionParams);
        log('Successfully connected to queue manager');

        // Test queue name
        const queueName = 'DEV.QUEUE.1';

        // Test 1: Get queue depth
        log(`Test 1: Getting queue depth for: ${queueName}`);
        const queues = await provider.listQueues();
        const queue = queues.find(q => q.name === queueName);
        log(`Queue depth: ${queue ? queue.depth : 'Queue not found'}`);

        // Test 2: Browse messages
        log(`Test 2: Browsing messages in queue: ${queueName}`);
        const messages = await provider.browseMessages(queueName, { limit: 10 });
        log(`Found ${messages.length} messages in queue`);

        // Display message details
        messages.forEach((message, index) => {
            log(`Message ${index + 1}:`);
            log(`  ID: ${message.id}`);
            log(`  Correlation ID: ${message.correlationId}`);
            log(`  Timestamp: ${message.timestamp}`);
            const payloadStr = typeof message.payload === 'string' ? message.payload : message.payload.toString('utf8');
            log(`  Payload: ${payloadStr.substring(0, 100)}${payloadStr.length > 100 ? '...' : ''}`);
            log(`  Format: ${message.properties.format}`);
        });

        // Test 3: Put a test message and verify it appears
        log(`Test 3: Putting a test message to verify browsing works`);
        const testPayload = `Browse test message - ${new Date().toISOString()}`;
        await provider.putMessage(queueName, testPayload, {
            format: 'MQSTR',
            persistence: 1,
            priority: 5
        });
        log('Test message put successfully');

        // Wait a moment for the message to be committed
        await new Promise(resolve => setTimeout(resolve, 200));

        // Browse again to see if the new message appears
        log(`Test 4: Browsing again to verify new message appears`);
        const updatedMessages = await provider.browseMessages(queueName, { limit: 10 });
        log(`Found ${updatedMessages.length} messages after put (should be +1)`);

        // Check if our test message is there
        const testMessage = updatedMessages.find(msg => {
            const payloadStr = typeof msg.payload === 'string' ? msg.payload : msg.payload.toString('utf8');
            return payloadStr.includes('Browse test message');
        });
        if (testMessage) {
            log('✅ Test message found in browse results!');
            log(`Test message ID: ${testMessage.id}`);
        } else {
            log('❌ Test message NOT found in browse results');
        }

        // Test 5: Get updated queue depth
        log(`Test 5: Getting updated queue depth`);
        const updatedQueues = await provider.listQueues();
        const updatedQueue = updatedQueues.find(q => q.name === queueName);
        log(`Updated queue depth: ${updatedQueue ? updatedQueue.depth : 'Queue not found'}`);

        // Disconnect
        await provider.disconnect();
        log('✅ Browse message test completed successfully');

    } catch (error) {
        const errorMessage = `❌ Browse message test failed: ${(error as Error).message}`;
        log(errorMessage);
        console.error('[BrowseMessageTest] Error:', error);
        throw error;
    }
}

/**
 * Register the test command
 */
export function registerBrowseMessageTest(context: vscode.ExtensionContext): void {
    const command = vscode.commands.registerCommand('mqexplorer.testBrowseMessages', async () => {
        try {
            await testBrowseMessages();
        } catch (error) {
            vscode.window.showErrorMessage(`Browse message test failed: ${(error as Error).message}`);
        }
    });

    context.subscriptions.push(command);
}
