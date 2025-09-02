import * as vscode from 'vscode';
// import { IBMMQProvider } from '../providers/IBMMQProvider'; // Temporarily disabled for optional dependency
import { IBMMQConnectionProfile } from '../models/connectionProfile';

/**
 * Test Put Message functionality
 */
export async function testPutMessage(): Promise<void> {
    const outputChannel = vscode.window.createOutputChannel('MQExplorer Put Message Test');
    outputChannel.show();

    function log(message: string): void {
        const timestamp = new Date().toISOString();
        outputChannel.appendLine(`[${timestamp}] ${message}`);
        console.log(`[${timestamp}] ${message}`);
    }

    try {
        log('=== IBM MQ Put Message Test ===');

        // Create provider
        // const provider = new IBMMQProvider(); // Temporarily disabled for optional dependency
        console.log('❌ Put Message test temporarily disabled due to optional dependency');
        return;

        /*
        // Connection parameters - using the same as your working connection
        const connectionParams: IBMMQConnectionProfile['connectionParams'] = {
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

        // Test 1: Put a simple text message
        const queueName = 'DEV.QUEUE.1';
        const testMessage = `Test message from VS Code extension - ${new Date().toISOString()}`;
        
        log(`Test 1: Putting simple text message to queue: ${queueName}`);
        log(`Message content: ${testMessage}`);

        await provider.putMessage(queueName, testMessage, {
            format: 'MQSTR',
            persistence: 1,
            priority: 5
        });

        log('✅ Successfully put simple text message to queue');

        // Test 2: Put a message with properties
        const testMessage2 = `Test message with properties - ${new Date().toISOString()}`;
        
        log(`Test 2: Putting message with properties to queue: ${queueName}`);
        log(`Message content: ${testMessage2}`);

        await provider.putMessage(queueName, testMessage2, {
            format: 'MQSTR',
            persistence: 2, // Persistent
            priority: 8,
            correlationId: 'TEST-CORRELATION-ID-123',
            replyToQueue: 'DEV.REPLY.QUEUE',
            replyToQueueManager: 'QM1'
        });

        log('✅ Successfully put message with properties to queue');

        // Test 3: Put a JSON message
        const jsonMessage = {
            timestamp: new Date().toISOString(),
            messageType: 'TEST',
            data: {
                testId: 'PUT-MESSAGE-TEST',
                value: 42,
                description: 'Test message from MQExplorer extension'
            }
        };
        
        const jsonPayload = JSON.stringify(jsonMessage, null, 2);
        
        log(`Test 3: Putting JSON message to queue: ${queueName}`);
        log(`JSON content: ${jsonPayload}`);

        await provider.putMessage(queueName, jsonPayload, {
            format: 'MQSTR',
            persistence: 1,
            priority: 5,
            correlationId: 'JSON-TEST-MESSAGE'
        });

        log('✅ Successfully put JSON message to queue');

        // Test 4: Browse messages to verify they were put
        log(`Test 4: Browsing messages from queue to verify put operations`);
        
        const messages = await provider.browseMessages(queueName, {
            limit: 10,
            startPosition: 0
        });

        log(`Found ${messages.length} messages in queue`);
        
        // Look for our test messages
        let foundMessages = 0;
        for (const message of messages) {
            const payload = message.payload.toString();
            if (payload.includes('Test message from VS Code extension') || 
                payload.includes('Test message with properties') ||
                payload.includes('PUT-MESSAGE-TEST')) {
                foundMessages++;
                log(`✅ Found test message: ${message.id} - ${payload.substring(0, 100)}...`);
            }
        }

        if (foundMessages > 0) {
            log(`✅ Successfully verified ${foundMessages} test messages were put to the queue`);
        } else {
            log(`⚠️  No test messages found in queue - they may have been consumed or not put successfully`);
        }

        // Disconnect
        await provider.disconnect();
        log('Disconnected from queue manager');

        log('=== Put Message Test Completed Successfully ===');
        vscode.window.showInformationMessage('Put Message test completed successfully! Check the output channel for details.');

    } catch (error) {
        */
    } catch (error) {
        console.log(`❌ Error during put message test: ${(error as Error).message}`);
        console.log(`Stack trace: ${(error as Error).stack}`);
        throw error;
    }
}
