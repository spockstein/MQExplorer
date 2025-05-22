import * as vscode from 'vscode';
import { KafkaProvider } from '../providers/KafkaProvider';
import { KafkaConnectionProfile } from '../models/connectionProfile';
import { Message } from '../providers/IMQProvider';

/**
 * Test script to verify Kafka operations (put and delete)
 */
export async function testKafkaOperations(context: vscode.ExtensionContext) {
    console.log('Starting Kafka operations test...');

    // Create output channel for logging
    const outputChannel = vscode.window.createOutputChannel('Kafka Operations Test');
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
        // Create Kafka provider
        log('Creating Kafka provider...');
        const provider = new KafkaProvider();

        // Connection parameters (adjust these for your environment)
        const connectionParams: KafkaConnectionProfile['connectionParams'] = {
            brokers: ['localhost:9092'],
            clientId: 'mqexplorer-test',
            ssl: false,
            connectionTimeout: 30000,
            authenticationTimeout: 10000
        };

        // Connect to Kafka
        log(`Connecting to Kafka brokers: ${connectionParams.brokers.join(', ')}...`);
        await provider.connect(connectionParams, context);
        log('Successfully connected to Kafka');

        // Test topic
        const topicName = 'test.topic';

        // Test 1: Browse initial messages
        log('Test 1: Browse initial messages');
        let messages = await provider.browseMessages(topicName, { limit: 10, startPosition: 0 });
        log(`Initial topic state: ${messages.length} messages`);
        logMessages(messages, log);

        // Test 2: Put a message
        log('Test 2: Put a message');
        const testMessage = `Test message ${Date.now()}`;
        await provider.putMessage(topicName, testMessage, {
            key: 'test-key',
            headers: {
                contentType: 'text/plain',
                priority: '5',
                correlationId: 'test-correlation-id'
            }
        });
        log('Message put operation completed');

        // Test 3: Verify message was added
        log('Test 3: Verify message was added');
        messages = await provider.browseMessages(topicName, { limit: 10, startPosition: 0 });
        log(`Topic state after put: ${messages.length} messages`);
        logMessages(messages, log);

        // Check if the new message is there
        const newMessage = messages.find(m => {
            const payload = typeof m.payload === 'string' ? m.payload : m.payload.toString('utf8');
            return payload.includes('Test message');
        });

        if (newMessage) {
            log('SUCCESS: New message was found in the topic');
        } else {
            log('ERROR: New message was not found in the topic', true);
        }

        // Test 4: Put multiple messages and verify
        log('Test 4: Put multiple messages and verify');
        for (let i = 0; i < 3; i++) {
            const testMessage = `Batch test message ${i + 1} - ${Date.now()}`;
            await provider.putMessage(topicName, testMessage, {
                key: `batch-key-${i}`,
                headers: {
                    batchId: `batch-${i}`,
                    index: `${i}`
                }
            });
            log(`Put message ${i + 1}`);
        }

        // Verify messages were added
        messages = await provider.browseMessages(topicName, { limit: 20, startPosition: 0 });
        log(`Topic state after multiple put: ${messages.length} messages`);
        logMessages(messages, log);

        // Test 5: Get topic properties
        log('Test 5: Get topic properties');
        const topicProperties = await provider.getTopicProperties(topicName);
        log('Topic properties:');
        log(`  Name: ${topicProperties.name}`);
        log(`  Description: ${topicProperties.description}`);
        log(`  Partition Count: ${topicProperties.partitionCount}`);
        log(`  Message Count: ${topicProperties.messageCount}`);
        log(`  Partitions: ${topicProperties.partitions.length}`);
        
        // Test 6: List topics
        log('Test 6: List topics');
        const topics = await provider.listTopics();
        log(`Found ${topics.length} topics:`);
        topics.forEach((topic, index) => {
            log(`  ${index + 1}. ${topic.name} (${topic.description})`);
        });

        // Test 7: List queues (same as topics in Kafka)
        log('Test 7: List queues (topics)');
        const queues = await provider.listQueues();
        log(`Found ${queues.length} queues (topics):`);
        queues.forEach((queue, index) => {
            log(`  ${index + 1}. ${queue.name} (${queue.description})`);
        });

        // Test 8: Publish a message to a topic
        log('Test 8: Publish a message to a topic');
        const publishMessage = `Published message - ${Date.now()}`;
        await provider.publishMessage(topicName, publishMessage, {
            key: 'publish-key',
            routingKey: 'test.routing.key',
            headers: {
                source: 'publish-test'
            }
        });
        log('Successfully published message to topic');

        // Verify published message
        messages = await provider.browseMessages(topicName, { limit: 10, startPosition: 0 });
        log(`Topic state after publish: ${messages.length} messages`);
        logMessages(messages, log);

        // Test 9: Clear topic (simulated in Kafka)
        log('Test 9: Clear topic (simulated in Kafka)');
        await provider.clearQueue(topicName);
        log('Topic clear operation completed (note: in Kafka, this is simulated by moving consumer offsets)');

        // Disconnect from Kafka
        log('Disconnecting from Kafka...');
        await provider.disconnect();
        log('Successfully disconnected from Kafka');

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
        
        // Display headers
        if (message.properties.headers) {
            log('  Headers:');
            for (const [key, value] of Object.entries(message.properties.headers)) {
                log(`    ${key}: ${value}`);
            }
        }
        
        // Display key if available
        if (message.properties.key) {
            log(`  Key: ${message.properties.key}`);
        }
        
        // Display partition and offset if available
        if (message.properties.partition !== undefined) {
            log(`  Partition: ${message.properties.partition}`);
        }
        
        if (message.properties.offset !== undefined) {
            log(`  Offset: ${message.properties.offset}`);
        }

        // Display payload (first 100 chars)
        const payload = typeof message.payload === 'string'
            ? message.payload
            : message.payload.toString('utf8');
        log(`  Payload: ${payload.substring(0, 100)}${payload.length > 100 ? '...' : ''}`);
    });
}
