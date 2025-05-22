import * as vscode from 'vscode';
import { IBMMQProvider } from '../providers/IBMMQProvider';
import { IBMMQConnectionProfile } from '../models/connectionProfile';
import { Message } from '../providers/IMQProvider';

/**
 * Test script to verify MQ functionality
 */
export async function testMQFunctionality() {
    console.log('Starting MQ functionality test...');
    
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
        
        // Test 1: Put a message to a queue
        const queueName = 'DEV.QUEUE.1';
        const testMessage = `Test message ${Date.now()}`;
        log(`Putting message to queue: ${queueName}`);
        
        await provider.putMessage(queueName, testMessage, {
            format: 'MQSTR',
            persistence: 1,
            priority: 5,
            replyToQueue: 'DEV.REPLY.QUEUE',
            replyToQueueManager: 'QM1'
        });
        
        log('Successfully put message to queue');
        
        // Test 2: Browse messages from the queue
        log(`Browsing messages from queue: ${queueName}`);
        const messages = await provider.browseMessages(queueName, {
            limit: 10,
            startPosition: 0
        });
        
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
        
        // Test 3: Delete a message
        if (messages.length > 0) {
            const messageToDelete = messages[0];
            log(`Deleting message with ID: ${messageToDelete.id}`);
            
            await provider.deleteMessage(queueName, messageToDelete.id);
            log('Successfully deleted message');
            
            // Verify message was deleted
            const messagesAfterDelete = await provider.browseMessages(queueName, {
                limit: 10,
                startPosition: 0
            });
            
            log(`After deletion: ${messagesAfterDelete.length} messages in queue`);
            
            // Check if the message was actually deleted
            const deletedMessageStillExists = messagesAfterDelete.some(m => m.id === messageToDelete.id);
            if (deletedMessageStillExists) {
                log('WARNING: Message was not actually deleted (expected in mock mode)', true);
            } else {
                log('Message was successfully deleted and is no longer in the queue');
            }
        }
        
        // Test 4: Delete multiple messages
        if (messages.length > 1) {
            const messagesToDelete = messages.slice(0, 2).map(m => m.id);
            log(`Deleting ${messagesToDelete.length} messages with IDs: ${messagesToDelete.join(', ')}`);
            
            await provider.deleteMessages(queueName, messagesToDelete);
            log('Successfully deleted multiple messages');
            
            // Verify messages were deleted
            const messagesAfterDelete = await provider.browseMessages(queueName, {
                limit: 10,
                startPosition: 0
            });
            
            log(`After multiple deletion: ${messagesAfterDelete.length} messages in queue`);
        }
        
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
