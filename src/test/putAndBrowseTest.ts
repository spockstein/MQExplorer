import * as vscode from 'vscode';
// import { IBMMQProvider } from '../providers/IBMMQProvider'; // Temporarily disabled for optional dependency

/**
 * Comprehensive test for Put and Browse operations
 * This test verifies that both operations work correctly together
 */
export async function runPutAndBrowseTest(): Promise<void> {
    const log = (message: string) => {
        console.log(`[PutAndBrowseTest] ${message}`);
        vscode.window.showInformationMessage(`[PutAndBrowseTest] ${message}`);
    };

    try {
        log('🚀 Starting comprehensive Put and Browse test...');

        // Create IBM MQ provider
        // const provider = new IBMMQProvider(); // Temporarily disabled for optional dependency
        console.log('❌ Put and Browse test temporarily disabled due to optional dependency');
        return;

        /*
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
        log(`🔗 Connecting to queue manager ${connectionParams.queueManager}...`);
        await provider.connect(connectionParams);
        log('✅ Successfully connected to queue manager');

        const queueName = 'DEV.QUEUE.1';

        // Test 1: Check initial queue depth
        log('=== Test 1: Check Initial Queue Depth ===');
        const initialDepth = await provider.getQueueDepth(queueName);
        log(`📊 Initial queue depth: ${initialDepth}`);

        // Test 2: Put a test message
        log('=== Test 2: Put Test Message ===');
        const testMessage = `🧪 Test message from Put and Browse test - ${new Date().toISOString()}`;
        log(`📤 Putting message: "${testMessage}"`);
        
        await provider.putMessage(queueName, testMessage, {
            format: 'MQSTR',
            persistence: 1,
            priority: 5
        });
        
        log('✅ Message put successfully');

        // Test 3: Check queue depth after put
        log('=== Test 3: Check Queue Depth After Put ===');
        const depthAfterPut = await provider.getQueueDepth(queueName);
        log(`📊 Queue depth after put: ${depthAfterPut}`);
        
        if (depthAfterPut > initialDepth) {
            log('✅ Queue depth increased correctly after put');
        } else {
            log('❌ Queue depth did not increase after put');
        }

        // Test 4: Browse messages to find our test message
        log('=== Test 4: Browse Messages ===');
        log('📖 Browsing messages to find our test message...');
        
        const messages = await provider.browseMessages(queueName, { limit: 10 });
        log(`📋 Found ${messages.length} messages in queue`);

        // Look for our test message
        let foundTestMessage = false;
        for (let i = 0; i < messages.length; i++) {
            const message = messages[i];
            const payloadStr = typeof message.payload === 'string' ? message.payload : message.payload.toString('utf8');
            
            log(`📄 Message ${i + 1}: ID=${message.id}, Payload="${payloadStr.substring(0, 100)}..."`);
            
            if (payloadStr.includes('Test message from Put and Browse test')) {
                foundTestMessage = true;
                log('🎯 ✅ Found our test message!');
                log(`   - Message ID: ${message.id}`);
                log(`   - Correlation ID: ${message.correlationId}`);
                log(`   - Timestamp: ${message.timestamp}`);
                log(`   - Format: ${message.properties?.format}`);
                log(`   - Persistence: ${message.properties?.persistence}`);
                log(`   - Priority: ${message.properties?.priority}`);
            }
        }

        if (foundTestMessage) {
            log('🎉 ✅ SUCCESS: Put and Browse operations working correctly!');
        } else {
            log('❌ FAILURE: Test message not found in browse results');
        }

        // Test 5: Put another message with different properties
        log('=== Test 5: Put Message with Custom Properties ===');
        const jsonMessage = {
            testId: 'PUT-BROWSE-TEST',
            timestamp: new Date().toISOString(),
            data: {
                value: 42,
                description: 'JSON test message'
            }
        };
        
        const jsonPayload = JSON.stringify(jsonMessage, null, 2);
        log(`📤 Putting JSON message: ${jsonPayload.substring(0, 100)}...`);
        
        await provider.putMessage(queueName, jsonPayload, {
            format: 'MQSTR',
            persistence: 2, // Persistent
            priority: 8,
            correlationId: 'PUT-BROWSE-TEST-CORRELATION'
        });
        
        log('✅ JSON message put successfully');

        // Test 6: Browse again to verify both messages
        log('=== Test 6: Final Browse Verification ===');
        const finalMessages = await provider.browseMessages(queueName, { limit: 15 });
        log(`📋 Final browse found ${finalMessages.length} messages`);

        let foundTextMessage = false;
        let foundJsonMessage = false;

        for (let i = 0; i < finalMessages.length; i++) {
            const message = finalMessages[i];
            const payloadStr = typeof message.payload === 'string' ? message.payload : message.payload.toString('utf8');
            
            if (payloadStr.includes('Test message from Put and Browse test')) {
                foundTextMessage = true;
                log(`✅ Found text test message at position ${i + 1}`);
            }
            
            if (payloadStr.includes('PUT-BROWSE-TEST')) {
                foundJsonMessage = true;
                log(`✅ Found JSON test message at position ${i + 1}`);
                log(`   - Correlation ID: ${message.correlationId}`);
            }
        }

        // Final results
        log('=== FINAL RESULTS ===');
        log(`📊 Initial depth: ${initialDepth}`);
        log(`📊 Depth after put: ${depthAfterPut}`);
        log(`📊 Final message count: ${finalMessages.length}`);
        log(`🔍 Text message found: ${foundTextMessage ? '✅' : '❌'}`);
        log(`🔍 JSON message found: ${foundJsonMessage ? '✅' : '❌'}`);

        if (foundTextMessage && foundJsonMessage && depthAfterPut > initialDepth) {
            log('🎉 🎉 🎉 ALL TESTS PASSED! Put and Browse operations are working perfectly! 🎉 🎉 🎉');
        } else {
            log('❌ Some tests failed. Check the logs above for details.');
        }

        // Disconnect
        await provider.disconnect();
        log('🔌 Disconnected from queue manager');
        */

    } catch (error) {
        log(`❌ Test failed with error: ${(error as Error).message}`);
        throw error;
    }
}
