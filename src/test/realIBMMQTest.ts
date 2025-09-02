import * as vscode from 'vscode';
// import { IBMMQProvider } from '../providers/IBMMQProvider'; // Temporarily disabled for optional dependency

/**
 * Test script to verify real IBM MQ operations with production queue manager
 * This test verifies:
 * 1. Real queue depth detection (no hardcoded values)
 * 2. Real message browsing (no placeholder messages)
 * 3. Proper error handling for browse operations
 */
export async function testRealIBMMQ(context: vscode.ExtensionContext) {
    console.log('Starting real IBM MQ test...');

    // Create output channel for logging
    const outputChannel = vscode.window.createOutputChannel('Real IBM MQ Test');
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
        // Create real IBM MQ provider
        log('Creating real IBM MQ provider...');
        // const provider = new IBMMQProvider(); // Temporarily disabled for optional dependency
        log('❌ Real IBM MQ test temporarily disabled due to optional dependency');
        return;

        /*
        // Real connection parameters - these should match your actual IBM MQ setup
        const connectionParams = {
            queueManager: 'QM1',
            host: 'localhost',
            port: 1414,
            channel: 'DEV.APP.SVRCONN',
            username: 'app',
            password: 'passw0rd',
            useTLS: false
        };

        // Connect to real queue manager
        log(`Connecting to real queue manager ${connectionParams.queueManager}...`);
        await provider.connect(connectionParams, context);
        log('Successfully connected to real queue manager');

        // Test 1: List queues with real discovery (no hardcoded queues)
        log('Test 1: List queues with real discovery');
        const queues = await provider.listQueues();
        log(`Found ${queues.length} queues:`);
        queues.forEach(queue => {
            log(`  - ${queue.name}: depth=${queue.depth}, type=${queue.type}`);
        });

        if (queues.length === 0) {
            log('WARNING: No queues found - this might indicate a discovery issue', true);
        }

        // Test 2: Test real queue depth detection for each queue
        log('Test 2: Test real queue depth detection');
        for (const queue of queues) {
            try {
                const realDepth = await provider.getQueueDepth(queue.name);
                log(`Real depth for ${queue.name}: ${realDepth}`);

                // Verify depth is not hardcoded
                if (realDepth >= 0) {
                    log(`✅ Real depth detection working for ${queue.name}`);
                } else {
                    log(`❌ Invalid depth for ${queue.name}: ${realDepth}`, true);
                }
            } catch (error) {
                log(`❌ Error getting depth for ${queue.name}: ${(error as Error).message}`, true);
            }
        }

        // Test 3: Test real message browsing (no placeholders)
        log('Test 3: Test real message browsing');
        for (const queue of queues) {
            if ((queue.depth || 0) > 0) {
                log(`Testing browse for queue ${queue.name} with depth ${queue.depth || 0}`);
                try {
                    const messages = await provider.browseMessages(queue.name, { limit: 5 });
                    log(`Browsed ${messages.length} messages from ${queue.name}`);

                    // Check for placeholder messages (should not exist)
                    const placeholderCount = messages.filter(msg =>
                        msg.id.startsWith('PLACEHOLDER_') ||
                        (msg.correlationId || '').startsWith('CORR_') ||
                        (typeof msg.payload === 'string' && msg.payload.includes('[Message') && msg.payload.includes('cannot be browsed'))
                    ).length;

                    if (placeholderCount === 0) {
                        log(`✅ No placeholder messages found in ${queue.name} - all real messages`);

                        // Log first message details
                        if (messages.length > 0) {
                            const firstMsg = messages[0];
                            const payloadStr = typeof firstMsg.payload === 'string' ? firstMsg.payload : '[Binary data]';
                            log(`  First message: ID=${firstMsg.id.substring(0, 16)}..., payload="${payloadStr.substring(0, 50)}..."`);
                        }
                    } else {
                        log(`❌ Found ${placeholderCount} placeholder messages in ${queue.name}`, true);
                    }
                } catch (error) {
                    log(`❌ Error browsing ${queue.name}: ${(error as Error).message}`, true);
                }
            } else {
                log(`Skipping browse for empty queue: ${queue.name}`);
            }
        }

        // Test 4: Test put message and verify real depth increase
        log('Test 4: Test put message and verify real depth increase');
        if (queues.length > 0) {
            const testQueue = queues[0];
            const initialDepth = await provider.getQueueDepth(testQueue.name);
            log(`Initial depth for ${testQueue.name}: ${initialDepth}`);

            const testMessage = `Real test message ${Date.now()}`;
            await provider.putMessage(testQueue.name, testMessage);
            log(`Put test message to ${testQueue.name}`);

            // Wait a moment for the message to be committed
            await new Promise(resolve => setTimeout(resolve, 500));

            const newDepth = await provider.getQueueDepth(testQueue.name);
            log(`New depth for ${testQueue.name}: ${newDepth}`);

            if (newDepth > initialDepth) {
                log(`✅ Real depth increased after put: ${initialDepth} -> ${newDepth}`);
            } else {
                log(`⚠️ Depth did not increase: ${initialDepth} -> ${newDepth} (message may have been consumed)`);
            }
        }

        // Disconnect from real queue manager
        log('Disconnecting from real queue manager...');
        await provider.disconnect();
        log('Successfully disconnected from real queue manager');

        log('Real IBM MQ test completed successfully!');
        */
    } catch (error) {
        log(`Error: ${(error as Error).message}`, true);
        log(`Stack trace: ${(error as Error).stack}`, true);
        log('Real IBM MQ test failed!', true);
    }
}
