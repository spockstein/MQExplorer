import * as vscode from 'vscode';
// import { IBMMQProvider } from '../providers/IBMMQProvider'; // Temporarily disabled for optional dependency

const mq = require('ibmmq');

/**
 * Debug test to isolate and fix the browsing issue
 */
export async function debugBrowseTest(): Promise<void> {
    const log = (message: string) => {
        console.log(`[DebugBrowseTest] ${message}`);
        vscode.window.showInformationMessage(`[DebugBrowseTest] ${message}`);
    };

    try {
        log('Starting debug browse test...');

        // Create IBM MQ provider
        // const provider = new IBMMQProvider(); // Temporarily disabled for optional dependency
        console.log('❌ Debug Browse test temporarily disabled due to optional dependency');
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
        log(`Connecting to queue manager ${connectionParams.queueManager}...`);
        await provider.connect(connectionParams);
        log('Successfully connected to queue manager');

        const queueName = 'DEV.QUEUE.1';

        // Test 1: Direct IBM MQ browse using raw API
        log('=== Test 1: Raw IBM MQ Browse ===');
        await testRawBrowse(queueName, log);

        // Test 2: Put a message first, then browse
        log('=== Test 2: Put Message then Browse ===');
        await testPutThenBrowse(provider, queueName, log);

        // Test 3: Test PCF inquiry method
        log('=== Test 3: PCF Inquiry Method ===');
        await testPCFInquiry(queueName, log);

        // Test 4: Test different browse options
        log('=== Test 4: Different Browse Options ===');
        await testDifferentBrowseOptions(queueName, log);

        // Disconnect
        await provider.disconnect();
        log('✅ Debug browse test completed');
        */

    } catch (error) {
        const errorMessage = `❌ Debug browse test failed: ${(error as Error).message}`;
        log(errorMessage);
        console.error('[DebugBrowseTest] Error:', error);
        throw error;
    }
}

// Debug browse test functions are commented out due to optional IBM MQ dependency
// Test raw IBM MQ browse using direct API calls
async function testRawBrowse(queueName: string, log: (msg: string) => void): Promise<void> {
    try {
        log(`Testing raw browse for queue: ${queueName}`);

        // Get connection handle from the provider (we'll need to expose this)
        const cno = new mq.MQCNO();
        cno.Options = mq.MQC.MQCNO_CLIENT_BINDING;

        const cd = new mq.MQCD();
        cd.ConnectionName = 'localhost(1414)';
        cd.ChannelName = 'DEV.APP.SVRCONN';
        cno.ClientConn = cd;

        const csp = new mq.MQCSP();
        csp.UserId = 'app';
        csp.Password = 'passw0rd';
        cno.SecurityParms = csp;

        // Connect to queue manager
        const hConn = await new Promise<any>((resolve, reject) => {
            mq.Connx('QM1', cno, function(err: any, hConn: any) {
                if (err) {
                    reject(new Error(`Connection failed: ${err.message}`));
                } else {
                    resolve(hConn);
                }
            });
        });

        log('Raw connection established');

        // Open queue for browsing
        const od = new mq.MQOD();
        od.ObjectName = queueName;
        od.ObjectType = mq.MQC.MQOT_Q;

        const openOptions = mq.MQC.MQOO_BROWSE | mq.MQC.MQOO_FAIL_IF_QUIESCING;

        const hObj = await new Promise<any>((resolve, reject) => {
            mq.Open(hConn, od, openOptions, function(err: any, hObj: any) {
                if (err) {
                    reject(new Error(`Queue open failed: ${err.message} (MQRC: ${err.mqrc})`));
                } else {
                    resolve(hObj);
                }
            });
        });

        log('Queue opened for raw browsing');

        // Try to browse first message with minimal options
        const md = new mq.MQMD();
        const gmo = new mq.MQGMO();
        gmo.Options = mq.MQC.MQGMO_BROWSE_FIRST | mq.MQC.MQGMO_NO_WAIT;

        log('Attempting raw browse...');

        const result = await new Promise<{success: boolean, error?: string, data?: any}>((resolve) => {
            const timeout = setTimeout(() => {
                log('Raw browse timeout after 5 seconds');
                resolve({success: false, error: 'Timeout'});
            }, 5000);

            try {
                mq.Get(hObj, md, gmo, function(err: any, hObj2: any, gmo2: any, buf: Buffer) {
                    clearTimeout(timeout);
                    if (err) {
                        if (err.mqrc === mq.MQC.MQRC_NO_MSG_AVAILABLE) {
                            log('Raw browse: No messages available');
                            resolve({success: true, data: null});
                        } else {
                            log(`Raw browse error: ${err.message} (MQRC: ${err.mqrc})`);
                            resolve({success: false, error: err.message});
                        }
                    } else {
                        log('Raw browse: Message found!');
                        log(`Message ID: ${md.MsgId ? md.MsgId.toString('hex') : 'N/A'}`);
                        log(`Message length: ${buf ? buf.length : 0}`);
                        log(`Message content: ${buf ? buf.toString('utf8').substring(0, 100) : 'N/A'}`);
                        resolve({success: true, data: {md, buf}});
                    }
                });
            } catch (syncError) {
                clearTimeout(timeout);
                log(`Raw browse sync error: ${(syncError as Error).message}`);
                resolve({success: false, error: (syncError as Error).message});
            }
        });

        if (result.success && result.data) {
            log('✅ Raw browse successful - message found');
        } else if (result.success && !result.data) {
            log('✅ Raw browse successful - no messages');
        } else {
            log(`❌ Raw browse failed: ${result.error}`);
        }

        // Close queue and disconnect
        await new Promise<void>((resolve) => {
            mq.Close(hObj, 0, function(err: any) {
                if (err) {
                    log(`Warning: Error closing queue: ${err.message}`);
                }
                resolve();
            });
        });

        await new Promise<void>((resolve) => {
            mq.Disc(hConn, function(err: any) {
                if (err) {
                    log(`Warning: Error disconnecting: ${err.message}`);
                }
                resolve();
            });
        });

        log('Raw browse test completed');

    } catch (error) {
        log(`Raw browse test error: ${(error as Error).message}`);
    }
}

// Test putting a message then browsing
// async function testPutThenBrowse(provider: IBMMQProvider, queueName: string, log: (msg: string) => void): Promise<void> {
//     try {
//         log('Putting a test message...');

//         const testMessage = `Debug test message - ${new Date().toISOString()}`;
//         await provider.putMessage(queueName, testMessage, {
//             format: 'MQSTR',
//             persistence: 1,
//             priority: 5
//         });
//
//         log('Test message put successfully');
//
//         // Wait a moment
//         await new Promise(resolve => setTimeout(resolve, 500));
//
//         log('Now trying to browse...');
//         const messages = await provider.browseMessages(queueName, { limit: 5 });
//         log(`Browse result: ${messages.length} messages found`);
//
//         if (messages.length > 0) {
//             log('✅ Browse after put successful');
//             messages.forEach((msg, index) => {
//                 const payloadStr = typeof msg.payload === 'string' ? msg.payload : msg.payload.toString('utf8');
//                 log(`Message ${index + 1}: ${payloadStr.substring(0, 50)}...`);
//             });
//         } else {
//             log('❌ Browse after put failed - no messages found');
//         }
//
//     } catch (error) {
//         log(`Put then browse test error: ${(error as Error).message}`);
//     }
// }

/**
 * Test PCF inquiry method for getting queue depth
 */
async function testPCFInquiry(queueName: string, log: (msg: string) => void): Promise<void> {
    try {
        log('Testing PCF inquiry method for queue depth...');

        // Get connection handle
        const cno = new mq.MQCNO();
        cno.Options = mq.MQC.MQCNO_CLIENT_BINDING;

        const cd = new mq.MQCD();
        cd.ConnectionName = 'localhost(1414)';
        cd.ChannelName = 'DEV.APP.SVRCONN';
        cno.ClientConn = cd;

        const csp = new mq.MQCSP();
        csp.UserId = 'app';
        csp.Password = 'passw0rd';
        cno.SecurityParms = csp;

        const hConn = await new Promise<any>((resolve, reject) => {
            mq.Connx('QM1', cno, function(err: any, hConn: any) {
                if (err) {
                    reject(new Error(`Connection failed: ${err.message}`));
                } else {
                    resolve(hConn);
                }
            });
        });

        log('PCF connection established');

        // Open queue for inquiry
        const od = new mq.MQOD();
        od.ObjectName = queueName;
        od.ObjectType = mq.MQC.MQOT_Q;

        const openOptions = mq.MQC.MQOO_INQUIRE | mq.MQC.MQOO_FAIL_IF_QUIESCING;

        const hObj = await new Promise<any>((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('PCF queue open timeout'));
            }, 3000);

            mq.Open(hConn, od, openOptions, function(err: any, hObj: any) {
                clearTimeout(timeout);
                if (err) {
                    reject(new Error(`PCF queue open failed: ${err.message} (MQRC: ${err.mqrc})`));
                } else {
                    resolve(hObj);
                }
            });
        });

        log('Queue opened for PCF inquiry');

        // Use mq.Inq to get queue attributes
        const selectors = [mq.MQC.MQIA_CURRENT_Q_DEPTH];

        const result = await new Promise<{success: boolean, depth?: number, error?: string}>((resolve) => {
            const timeout = setTimeout(() => {
                log('PCF inquiry timeout after 3 seconds');
                resolve({success: false, error: 'Timeout'});
            }, 3000);

            try {
                mq.Inq(hObj, selectors, function(err: any, _selectors: any, intAttrs: any, _charAttrs: any) {
                    clearTimeout(timeout);
                    if (err) {
                        log(`PCF inquiry error: ${err.message} (MQRC: ${err.mqrc})`);
                        resolve({success: false, error: `${err.message} (MQRC: ${err.mqrc})`});
                    } else {
                        const depth = intAttrs && intAttrs[0] ? intAttrs[0] : 0;
                        log(`PCF inquiry successful: queue depth = ${depth}`);
                        resolve({success: true, depth: depth});
                    }
                });
            } catch (syncError) {
                clearTimeout(timeout);
                log(`PCF inquiry sync error: ${(syncError as Error).message}`);
                resolve({success: false, error: (syncError as Error).message});
            }
        });

        if (result.success) {
            log(`✅ PCF inquiry WORKED! Queue depth: ${result.depth}`);
        } else {
            log(`❌ PCF inquiry failed: ${result.error}`);
        }

        // Close queue and disconnect
        await new Promise<void>((resolve) => {
            mq.Close(hObj, 0, function(err: any) {
                if (err) {
                    log(`Warning: Error closing queue: ${err.message}`);
                }
                resolve();
            });
        });

        await new Promise<void>((resolve) => {
            mq.Disc(hConn, function(err: any) {
                if (err) {
                    log(`Warning: Error disconnecting: ${err.message}`);
                }
                resolve();
            });
        });

        log('PCF inquiry test completed');

    } catch (error) {
        log(`PCF inquiry test error: ${(error as Error).message}`);
    }
}

/**
 * Test different browse options
 */
async function testDifferentBrowseOptions(queueName: string, log: (msg: string) => void): Promise<void> {
    try {
        log('=== Testing Different Browse Options ===');

        // Get connection handle
        const cno = new mq.MQCNO();
        cno.Options = mq.MQC.MQCNO_CLIENT_BINDING;

        const cd = new mq.MQCD();
        cd.ConnectionName = 'localhost(1414)';
        cd.ChannelName = 'DEV.APP.SVRCONN';
        cno.ClientConn = cd;

        const csp = new mq.MQCSP();
        csp.UserId = 'app';
        csp.Password = 'passw0rd';
        cno.SecurityParms = csp;

        const hConn = await new Promise<any>((resolve, reject) => {
            mq.Connx('QM1', cno, function(err: any, hConn: any) {
                if (err) {
                    reject(new Error(`Connection failed: ${err.message}`));
                } else {
                    resolve(hConn);
                }
            });
        });

        // Test different combinations of options
        const testCases = [
            {
                name: 'Minimal Browse',
                openOptions: mq.MQC.MQOO_BROWSE,
                gmoOptions: mq.MQC.MQGMO_BROWSE_FIRST | mq.MQC.MQGMO_NO_WAIT
            },
            {
                name: 'Browse with Input Shared',
                openOptions: mq.MQC.MQOO_BROWSE | mq.MQC.MQOO_INPUT_SHARED,
                gmoOptions: mq.MQC.MQGMO_BROWSE_FIRST | mq.MQC.MQGMO_NO_WAIT
            },
            {
                name: 'Browse with Convert',
                openOptions: mq.MQC.MQOO_BROWSE,
                gmoOptions: mq.MQC.MQGMO_BROWSE_FIRST | mq.MQC.MQGMO_NO_WAIT | mq.MQC.MQGMO_CONVERT
            },
            {
                name: 'Browse with Accept Truncated',
                openOptions: mq.MQC.MQOO_BROWSE,
                gmoOptions: mq.MQC.MQGMO_BROWSE_FIRST | mq.MQC.MQGMO_NO_WAIT | mq.MQC.MQGMO_ACCEPT_TRUNCATED_MSG
            },
            {
                name: 'Browse with Wait (1 second)',
                openOptions: mq.MQC.MQOO_BROWSE,
                gmoOptions: mq.MQC.MQGMO_BROWSE_FIRST | mq.MQC.MQGMO_WAIT,
                waitInterval: 1000
            }
        ];

        for (const testCase of testCases) {
            log(`--- Testing: ${testCase.name} ---`);

            try {
                // Open queue
                const od = new mq.MQOD();
                od.ObjectName = queueName;
                od.ObjectType = mq.MQC.MQOT_Q;

                const hObj = await new Promise<any>((resolve, reject) => {
                    const timeout = setTimeout(() => {
                        reject(new Error('Queue open timeout'));
                    }, 3000);

                    mq.Open(hConn, od, testCase.openOptions, function(err: any, hObj: any) {
                        clearTimeout(timeout);
                        if (err) {
                            reject(new Error(`Queue open failed: ${err.message} (MQRC: ${err.mqrc})`));
                        } else {
                            resolve(hObj);
                        }
                    });
                });

                log(`Queue opened successfully with options: ${testCase.openOptions}`);

                // Try to browse
                const md = new mq.MQMD();
                const gmo = new mq.MQGMO();
                gmo.Options = testCase.gmoOptions;

                if (testCase.waitInterval) {
                    gmo.WaitInterval = testCase.waitInterval;
                }

                const result = await new Promise<{success: boolean, error?: string, data?: any}>((resolve) => {
                    const timeout = setTimeout(() => {
                        log(`${testCase.name}: Browse timeout after 2 seconds`);
                        resolve({success: false, error: 'Timeout'});
                    }, 2000);

                    try {
                        mq.Get(hObj, md, gmo, function(err: any, hObj2: any, gmo2: any, buf: Buffer) {
                            clearTimeout(timeout);
                            if (err) {
                                if (err.mqrc === mq.MQC.MQRC_NO_MSG_AVAILABLE) {
                                    log(`${testCase.name}: No messages available (MQRC: ${err.mqrc})`);
                                    resolve({success: true, data: null});
                                } else {
                                    log(`${testCase.name}: Browse error: ${err.message} (MQRC: ${err.mqrc})`);
                                    resolve({success: false, error: `${err.message} (MQRC: ${err.mqrc})`});
                                }
                            } else {
                                log(`${testCase.name}: SUCCESS! Message found`);
                                log(`Message ID: ${md.MsgId ? md.MsgId.toString('hex') : 'N/A'}`);
                                log(`Message length: ${buf ? buf.length : 0}`);
                                if (buf && buf.length > 0) {
                                    log(`Message content: ${buf.toString('utf8').substring(0, 50)}...`);
                                }
                                resolve({success: true, data: {md, buf}});
                            }
                        });
                    } catch (syncError) {
                        clearTimeout(timeout);
                        log(`${testCase.name}: Sync error: ${(syncError as Error).message}`);
                        resolve({success: false, error: (syncError as Error).message});
                    }
                });

                if (result.success && result.data) {
                    log(`✅ ${testCase.name} WORKED! Found message.`);
                } else if (result.success && !result.data) {
                    log(`⚠️ ${testCase.name} succeeded but no messages found.`);
                } else {
                    log(`❌ ${testCase.name} failed: ${result.error}`);
                }

                // Close queue
                await new Promise<void>((resolve) => {
                    mq.Close(hObj, 0, function(err: any) {
                        if (err) {
                            log(`Warning: Error closing queue: ${err.message}`);
                        }
                        resolve();
                    });
                });

            } catch (error) {
                log(`❌ ${testCase.name} failed with exception: ${(error as Error).message}`);
            }
        }

        // Disconnect
        await new Promise<void>((resolve) => {
            mq.Disc(hConn, function(err: any) {
                if (err) {
                    log(`Warning: Error disconnecting: ${err.message}`);
                }
                resolve();
            });
        });

        log('=== Browse Options Testing Complete ===');

    } catch (error) {
        log(`Browse options test error: ${(error as Error).message}`);
    }
}

/**
 * Register the debug test command
 */
export function registerDebugBrowseTest(context: vscode.ExtensionContext): void {
    const command = vscode.commands.registerCommand('mqexplorer.debugBrowseTest', async () => {
        try {
            await debugBrowseTest();
        } catch (error) {
            vscode.window.showErrorMessage(`Debug browse test failed: ${(error as Error).message}`);
        }
    });

    context.subscriptions.push(command);
}
// End of commented out debug browse test functions
