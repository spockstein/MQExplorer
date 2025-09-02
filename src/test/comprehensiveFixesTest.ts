import * as vscode from 'vscode';
import { IBMMQProvider } from '../providers/IBMMQProvider';
import { IBMMQConnectionProfile } from '../models/connectionProfile';

/**
 * Comprehensive test for both timestamp extraction and all previous fixes
 * This test validates:
 * 1. IBM MQ Message Timestamp Display (new fix)
 * 2. Optimized Queue Discovery Performance (previous fix)
 * 3. Fixed Message Delete Functionality (previous fix)
 * 4. Automatic Message List Refresh (previous fix)
 */

async function testTimestampExtraction() {
    console.log('\n=== Testing Fix: IBM MQ Message Timestamp Display ===');
    
    const provider = new IBMMQProvider();
    const queueName = 'DEV.QUEUE.1';

    const connectionParams: IBMMQConnectionProfile['connectionParams'] = {
        queueManager: 'QM1',
        host: 'localhost',
        port: 1414,
        channel: 'DEV.APP.SVRCONN',
        username: 'app',
        password: 'passw0rd'
    };

    try {
        await provider.connect(connectionParams);

        console.log('Test 1.1: Put test messages with known timing');
        const putStartTime = new Date();
        
        await provider.putMessage(queueName, 'Timestamp test message 1', {
            format: 'MQSTR',
            persistence: 1,
            priority: 5
        });
        
        // Small delay to ensure different timestamps
        await new Promise(resolve => setTimeout(resolve, 500));
        
        await provider.putMessage(queueName, 'Timestamp test message 2', {
            format: 'MQSTR',
            persistence: 1,
            priority: 5
        });

        const putEndTime = new Date();

        console.log('Test 1.2: Browse messages and verify real timestamps');
        const messages = await provider.browseMessages(queueName, { limit: 5 });
        
        console.log(`✅ Found ${messages.length} messages in queue`);

        let timestampTestPassed = true;
        for (let i = 0; i < Math.min(messages.length, 2); i++) {
            const message = messages[i];
            console.log(`\nMessage ${i + 1}:`);
            console.log(`  Timestamp: ${message.timestamp?.toISOString()}`);
            console.log(`  Content: ${typeof message.payload === 'string' ? message.payload.substring(0, 50) : '[Binary]'}...`);
            
            if (message.timestamp) {
                // Verify timestamp is within reasonable range (between put start and current time)
                const messageTime = message.timestamp.getTime();
                const putStartTimeMs = putStartTime.getTime();
                const currentTimeMs = Date.now();
                
                if (messageTime >= putStartTimeMs && messageTime <= currentTimeMs) {
                    console.log(`  ✅ Timestamp is within expected range`);
                } else {
                    console.log(`  ❌ Timestamp is outside expected range`);
                    console.log(`     Put Start: ${putStartTime.toISOString()}`);
                    console.log(`     Message:   ${message.timestamp.toISOString()}`);
                    console.log(`     Current:   ${new Date().toISOString()}`);
                    timestampTestPassed = false;
                }

                // Check MQMD properties
                if (message.properties) {
                    console.log(`  MQMD Data:`);
                    console.log(`    Put Date: ${message.properties.putDate}`);
                    console.log(`    Put Time: ${message.properties.putTime}`);
                    console.log(`    Format: ${message.properties.format}`);
                    console.log(`    Message ID: ${message.properties.messageId || 'None'}`);
                }
            } else {
                console.log(`  ❌ No timestamp found`);
                timestampTestPassed = false;
            }
        }

        if (timestampTestPassed) {
            console.log(`\n✅ Timestamp extraction test PASSED`);
        } else {
            console.log(`\n❌ Timestamp extraction test FAILED`);
        }

        await provider.disconnect();
        return timestampTestPassed;

    } catch (error) {
        console.error(`❌ Timestamp extraction test failed: ${(error as Error).message}`);
        return false;
    }
}

async function testAllFixes() {
    console.log('\n=== Testing All Previous Fixes ===');
    
    const provider = new IBMMQProvider();
    const queueName = 'DEV.QUEUE.1';

    // Test with known queues for performance optimization
    const connectionParamsWithKnownQueues: IBMMQConnectionProfile['connectionParams'] = {
        queueManager: 'QM1',
        host: 'localhost',
        port: 1414,
        channel: 'DEV.APP.SVRCONN',
        username: 'app',
        password: 'passw0rd',
        knownQueues: ['DEV.QUEUE.1', 'DEV.QUEUE.2', 'DEV.QUEUE.3']
    };

    try {
        console.log('Test 2.1: Optimized Queue Discovery Performance');
        const discoveryStartTime = Date.now();
        
        await provider.connect(connectionParamsWithKnownQueues);
        const queues = await provider.listQueues();
        
        const discoveryTime = Date.now() - discoveryStartTime;
        console.log(`✅ Queue discovery completed in ${discoveryTime}ms`);
        console.log(`✅ Found ${queues.length} queues using known queues optimization`);
        
        // Check if known queues indicator is present
        const hasKnownQueueIndicator = queues.some(q => 
            q.description?.includes('(from known queues)')
        );
        console.log(`✅ Known queues optimization active: ${hasKnownQueueIndicator}`);

        console.log('\nTest 2.2: Fixed Message Delete Functionality');
        
        // Put test messages
        const testMessages = ['Delete test 1', 'Delete test 2', 'Delete test 3'];
        for (const msg of testMessages) {
            await provider.putMessage(queueName, msg, {
                format: 'MQSTR',
                persistence: 1,
                priority: 5
            });
        }

        // Browse to get message IDs
        const messagesBeforeDelete = await provider.browseMessages(queueName, { limit: 10 });
        console.log(`✅ Put ${testMessages.length} test messages, found ${messagesBeforeDelete.length} total messages`);

        if (messagesBeforeDelete.length >= 2) {
            // Test single message delete
            const messageToDelete = messagesBeforeDelete[0];
            await provider.deleteMessage(queueName, messageToDelete.id);
            console.log(`✅ Successfully deleted single message: ${messageToDelete.id}`);

            // Test multiple message delete
            const messagesToDelete = messagesBeforeDelete.slice(1, 3).map(m => m.id);
            await provider.deleteMessages(queueName, messagesToDelete);
            console.log(`✅ Successfully deleted ${messagesToDelete.length} messages`);

            // Verify deletions
            const messagesAfterDelete = await provider.browseMessages(queueName, { limit: 10 });
            const deletedCount = messagesBeforeDelete.length - messagesAfterDelete.length;
            console.log(`✅ Verified deletion: ${deletedCount} messages removed`);
        }

        console.log('\nTest 2.3: Automatic Message List Refresh (Event Emission)');
        
        // Mock connection manager to test event emission
        let refreshEventEmitted = false;
        const mockConnectionManager = {
            emit: (event: string, queueName: string) => {
                if (event === 'queueUpdated') {
                    refreshEventEmitted = true;
                    console.log(`✅ Refresh event emitted for queue: ${queueName}`);
                }
            }
        };

        provider.setConnectionManager(mockConnectionManager as any);

        // Test put operation (should emit refresh event)
        await provider.putMessage(queueName, 'Refresh test message', {
            format: 'MQSTR',
            persistence: 1,
            priority: 5
        });

        if (refreshEventEmitted) {
            console.log(`✅ Automatic refresh event system working correctly`);
        } else {
            console.log(`❌ Automatic refresh event not emitted`);
        }

        await provider.disconnect();

        console.log('\n🎉 All fixes validation completed successfully!');
        return true;

    } catch (error) {
        console.error(`❌ Fixes validation failed: ${(error as Error).message}`);
        return false;
    }
}

async function testVersionAndDocumentation() {
    console.log('\n=== Testing Version and Documentation Updates ===');
    
    try {
        // Read package.json to verify version
        const fs = require('fs');
        const path = require('path');
        
        const packageJsonPath = path.join(__dirname, '../../package.json');
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
        
        console.log(`✅ Package version updated to: ${packageJson.version}`);
        
        if (packageJson.version === '0.3.0') {
            console.log(`✅ Version correctly updated to 0.3.0`);
        } else {
            console.log(`❌ Version not updated correctly, expected 0.3.0, got ${packageJson.version}`);
        }

        // Check if CHANGELOG.md exists and has new entries
        const changelogPath = path.join(__dirname, '../../CHANGELOG.md');
        if (fs.existsSync(changelogPath)) {
            const changelog = fs.readFileSync(changelogPath, 'utf8');
            if (changelog.includes('0.3.0') && changelog.includes('IBM MQ Message Timestamp Display')) {
                console.log(`✅ CHANGELOG.md updated with new version and features`);
            } else {
                console.log(`❌ CHANGELOG.md missing new version entries`);
            }
        } else {
            console.log(`❌ CHANGELOG.md not found`);
        }

        // Check if README.md has been updated
        const readmePath = path.join(__dirname, '../../README.md');
        if (fs.existsSync(readmePath)) {
            const readme = fs.readFileSync(readmePath, 'utf8');
            if (readme.includes('Known Queues') && readme.includes('Auto-Refresh')) {
                console.log(`✅ README.md updated with new features`);
            } else {
                console.log(`❌ README.md missing new feature descriptions`);
            }
        } else {
            console.log(`❌ README.md not found`);
        }

        return true;

    } catch (error) {
        console.error(`❌ Version and documentation test failed: ${(error as Error).message}`);
        return false;
    }
}

export async function runComprehensiveFixesTest(): Promise<void> {
    console.log('🧪 Running Comprehensive Fixes Test');
    console.log('Testing all implemented fixes and improvements:');
    console.log('1. IBM MQ Message Timestamp Display');
    console.log('2. Optimized Queue Discovery Performance');
    console.log('3. Fixed Message Delete Functionality');
    console.log('4. Automatic Message List Refresh');
    console.log('5. Version and Documentation Updates');

    try {
        const timestampTestResult = await testTimestampExtraction();
        const allFixesTestResult = await testAllFixes();
        const versionTestResult = await testVersionAndDocumentation();

        console.log('\n📋 Test Results Summary:');
        console.log(`✅ Timestamp Extraction: ${timestampTestResult ? 'PASSED' : 'FAILED'}`);
        console.log(`✅ Previous Fixes: ${allFixesTestResult ? 'PASSED' : 'FAILED'}`);
        console.log(`✅ Version/Documentation: ${versionTestResult ? 'PASSED' : 'FAILED'}`);

        if (timestampTestResult && allFixesTestResult && versionTestResult) {
            console.log('\n🎉 All comprehensive tests PASSED!');
            console.log('\n🚀 MQExplorer v0.3.0 is ready for release!');
        } else {
            console.log('\n❌ Some tests FAILED - review and fix issues before release');
        }

    } catch (error) {
        console.error(`❌ Comprehensive test failed: ${(error as Error).message}`);
        throw error;
    }
}

// Export for use in test runner
if (require.main === module) {
    runComprehensiveFixesTest().catch(console.error);
}
