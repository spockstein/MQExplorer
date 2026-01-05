import * as vscode from 'vscode';
import { ConnectionManager } from '../services/connectionManager';
import { MessageProperties } from '../providers/IMQProvider';

/**
 * Manages the webview for putting messages
 */
export class MessagePutWebview {
    private panel: vscode.WebviewPanel | undefined;
    private context: vscode.ExtensionContext;
    private connectionManager: ConnectionManager;
    private profileId: string;
    private queueName: string;
    private providerType: string = '';
    // For topic publishing
    private isTopicPublish: boolean = false;
    private topicName: string = '';

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.connectionManager = ConnectionManager.getInstance(context);
        this.profileId = '';
        this.queueName = '';
    }

    /**
     * Get the provider type for the profile
     */
    private async getProviderType(): Promise<string> {
        try {
            const profiles = await this.connectionManager.getConnectionProfiles();
            const profile = profiles.find(p => p.id === this.profileId);
            return profile?.providerType || '';
        } catch {
            return '';
        }
    }

    /**
     * Show the message put webview
     */
    public async show(profileId: string, queueName: string): Promise<void> {
        this.profileId = profileId;
        this.queueName = queueName;
        this.isTopicPublish = false;
        this.providerType = await this.getProviderType();

        // If panel already exists, reveal it
        if (this.panel) {
            this.panel.reveal();
            return;
        }

        // Create a new panel
        this.panel = vscode.window.createWebviewPanel(
            'mqexplorerMessagePut',
            `Put Message: ${queueName}`,
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        // Set initial content
        this.updateWebviewContent();

        // Handle messages from the webview
        this.panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'putMessage':
                        await this.putMessage(message.payload, message.properties);
                        break;
                    case 'loadFromFile':
                        await this.loadFromFile();
                        break;
                    case 'cancel':
                        this.panel?.dispose();
                        break;
                    case 'showError':
                        vscode.window.showErrorMessage(message.message);
                        break;
                }
            },
            undefined,
            this.context.subscriptions
        );

        // Handle panel disposal
        this.panel.onDidDispose(
            () => {
                this.panel = undefined;
            },
            null,
            this.context.subscriptions
        );
    }

    /**
     * Update the webview content
     */
    private updateWebviewContent(): void {
        if (!this.panel) {
            return;
        }

        // Use provider-specific content
        if (this.providerType === 'azureservicebus') {
            this.panel.webview.html = this.getASBWebviewContent();
        } else {
            this.panel.webview.html = this.getWebviewContent();
        }
    }

    /**
     * Get the HTML content for the webview
     */
    private getWebviewContent(): string {
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Put Message: ${this.queueName}</title>
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    padding: 20px;
                    color: var(--vscode-foreground);
                }
                .form-group {
                    margin-bottom: 15px;
                }
                label {
                    display: block;
                    margin-bottom: 5px;
                    font-weight: bold;
                }
                input, select, textarea {
                    width: 100%;
                    padding: 8px;
                    box-sizing: border-box;
                    background-color: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border: 1px solid var(--vscode-input-border);
                }
                textarea {
                    min-height: 200px;
                    font-family: monospace;
                }
                button {
                    padding: 8px 16px;
                    margin-right: 10px;
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    cursor: pointer;
                }
                button:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }
                .actions {
                    margin-top: 20px;
                    display: flex;
                }
                .properties {
                    margin-top: 20px;
                    border-top: 1px solid var(--vscode-input-border);
                    padding-top: 20px;
                }
                h2 {
                    margin-top: 0;
                }
                .toggle-properties {
                    margin-top: 10px;
                    cursor: pointer;
                    color: var(--vscode-textLink-foreground);
                    text-decoration: underline;
                }
                .tabs {
                    display: flex;
                    margin-bottom: 20px;
                    border-bottom: 1px solid var(--vscode-panel-border);
                }
                .tab {
                    padding: 8px 16px;
                    cursor: pointer;
                    margin-right: 5px;
                    border: 1px solid var(--vscode-panel-border);
                    border-bottom: none;
                    border-top-left-radius: 4px;
                    border-top-right-radius: 4px;
                }
                .tab.active {
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                }
                .tab-content {
                    display: none;
                    padding-top: 10px;
                }
                .tab-content.active {
                    display: block;
                }
                .small-button {
                    padding: 2px 8px;
                    margin-left: 8px;
                    font-size: 0.8em;
                }
                .hint {
                    display: block;
                    font-size: 0.8em;
                    color: var(--vscode-descriptionForeground);
                    margin-top: 4px;
                }
                h3 {
                    margin-top: 0;
                    margin-bottom: 15px;
                    font-size: 1.1em;
                }
            </style>
        </head>
        <body>
            <h1>Put Message to ${this.queueName}</h1>

            <div class="form-group">
                <label for="payload">Message Payload</label>
                <textarea id="payload" placeholder="Enter message payload"></textarea>
            </div>

            <div class="form-group">
                <button id="loadFromFileBtn">Load From File</button>
            </div>

            <div class="toggle-properties" id="toggleProperties">Show Advanced Properties</div>

            <div class="properties" id="propertiesSection" style="display: none;">
                <h2>Message Properties</h2>

                <div class="tabs">
                    <div class="tab active" data-tab="mqmd">MQMD</div>
                    <div class="tab" data-tab="rfh2">RFH2</div>
                </div>

                <div class="tab-content active" id="mqmdTab">
                    <h3>Message Descriptor (MQMD)</h3>

                    <div class="form-group">
                        <label for="correlationId">Correlation ID (hex)</label>
                        <input type="text" id="correlationId" placeholder="e.g., 414D5120514D31202020202020202020012EF35E20046C40">
                        <button type="button" id="generateCorrelIdBtn" class="small-button">Generate</button>
                    </div>

                    <div class="form-group">
                        <label for="messageId">Message ID (hex)</label>
                        <input type="text" id="messageId" placeholder="Leave empty for system-generated ID">
                        <button type="button" id="generateMsgIdBtn" class="small-button">Generate</button>
                    </div>

                    <div class="form-group">
                        <label for="replyToQueue">Reply To Queue</label>
                        <input type="text" id="replyToQueue">
                    </div>

                    <div class="form-group">
                        <label for="replyToQueueManager">Reply To Queue Manager</label>
                        <input type="text" id="replyToQueueManager">
                    </div>

                    <div class="form-group">
                        <label for="format">Format</label>
                        <select id="format">
                            <option value="">Default</option>
                            <option value="MQSTR">String (MQSTR)</option>
                            <option value="MQHRF2">Rules and Formatting Header 2 (MQHRF2)</option>
                            <option value="MQFMT_NONE">None (MQFMT_NONE)</option>
                            <option value="MQFMT_ADMIN">Admin (MQFMT_ADMIN)</option>
                            <option value="MQFMT_STRING">String (MQFMT_STRING)</option>
                            <option value="MQFMT_EVENT">Event (MQFMT_EVENT)</option>
                            <option value="MQFMT_PCF">PCF (MQFMT_PCF)</option>
                            <option value="MQFMT_JSON">JSON (MQFMT_JSON)</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label for="persistence">Persistence</label>
                        <select id="persistence">
                            <option value="">Default</option>
                            <option value="1">Persistent (MQPER_PERSISTENT)</option>
                            <option value="0">Not Persistent (MQPER_NOT_PERSISTENT)</option>
                            <option value="2">Persistence as Queue Definition (MQPER_PERSISTENCE_AS_Q_DEF)</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label for="priority">Priority</label>
                        <select id="priority">
                            <option value="">Default</option>
                            <option value="0">0 (Lowest)</option>
                            <option value="1">1</option>
                            <option value="2">2</option>
                            <option value="3">3</option>
                            <option value="4">4</option>
                            <option value="5">5</option>
                            <option value="6">6</option>
                            <option value="7">7</option>
                            <option value="8">8</option>
                            <option value="9">9 (Highest)</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label for="expiry">Expiry (in tenths of a second)</label>
                        <input type="number" id="expiry" placeholder="Leave empty for unlimited">
                        <span class="hint">Set to 0 for unlimited</span>
                    </div>

                    <div class="form-group">
                        <label for="feedback">Feedback Code</label>
                        <input type="number" id="feedback" placeholder="Numeric feedback code">
                    </div>

                    <div class="form-group">
                        <label for="encoding">Encoding</label>
                        <select id="encoding">
                            <option value="">Default</option>
                            <option value="273">Native (273)</option>
                            <option value="546">Reversed (546)</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label for="codedCharSetId">Coded Character Set ID</label>
                        <input type="number" id="codedCharSetId" placeholder="e.g., 1208 for UTF-8">
                    </div>

                    <div class="form-group">
                        <label for="report">Report Options</label>
                        <select id="report">
                            <option value="">Default</option>
                            <option value="0">None</option>
                            <option value="1">On Exception</option>
                            <option value="2">On Expiry</option>
                            <option value="4">On Confirm</option>
                            <option value="8">Copy Message ID on Reply</option>
                            <option value="16">Copy Correlation ID on Reply</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label for="msgType">Message Type</label>
                        <select id="msgType">
                            <option value="">Default</option>
                            <option value="1">Request (MQMT_REQUEST)</option>
                            <option value="2">Reply (MQMT_REPLY)</option>
                            <option value="4">Report (MQMT_REPORT)</option>
                            <option value="8">Datagram (MQMT_DATAGRAM)</option>
                        </select>
                    </div>
                </div>

                <div class="tab-content" id="rfh2Tab">
                    <h3>Rules and Formatting Header 2 (RFH2)</h3>
                    <p class="hint">RFH2 headers are used for JMS messages and other advanced scenarios.</p>

                    <div class="form-group">
                        <label for="rfh2Enabled">Enable RFH2 Header</label>
                        <input type="checkbox" id="rfh2Enabled">
                    </div>

                    <div id="rfh2Fields" style="display: none;">
                        <div class="form-group">
                            <label for="rfh2Format">RFH2 Format</label>
                            <select id="rfh2Format">
                                <option value="MQSTR">String (MQSTR)</option>
                                <option value="MQFMT_NONE">None (MQFMT_NONE)</option>
                                <option value="MQFMT_STRING">String (MQFMT_STRING)</option>
                            </select>
                        </div>

                        <div class="form-group">
                            <label for="rfh2Encoding">RFH2 Encoding</label>
                            <select id="rfh2Encoding">
                                <option value="273">Native (273)</option>
                                <option value="546">Reversed (546)</option>
                            </select>
                        </div>

                        <div class="form-group">
                            <label for="rfh2CodedCharSetId">RFH2 Coded Character Set ID</label>
                            <input type="number" id="rfh2CodedCharSetId" value="1208" placeholder="e.g., 1208 for UTF-8">
                        </div>

                        <div class="form-group">
                            <label for="rfh2Folders">RFH2 Folders (JSON format)</label>
                            <textarea id="rfh2Folders" placeholder='{"jms":{"Dst":"queue:///DEST.QUEUE","Tms":1234567890000},"usr":{"customField":"customValue"}}'></textarea>
                            <span class="hint">Enter folders as JSON objects. Common folders: jms, usr, mcd, psc</span>
                        </div>
                    </div>
                </div>
            </div>

            <div class="actions">
                <button id="putBtn">Put Message</button>
                <button id="cancelBtn">Cancel</button>
            </div>

            <script>
                (function() {
                    const vscode = acquireVsCodeApi();

                    // Handle put button
                    document.getElementById('putBtn').addEventListener('click', () => {
                        const payload = document.getElementById('payload').value;

                        // Get MQMD properties
                        const properties = {};

                        // Basic MQMD properties
                        const correlationId = document.getElementById('correlationId').value;
                        if (correlationId) {
                            properties.correlationId = correlationId;
                        }

                        const messageId = document.getElementById('messageId').value;
                        if (messageId) {
                            properties.messageId = messageId;
                        }

                        const replyToQueue = document.getElementById('replyToQueue').value;
                        if (replyToQueue) {
                            properties.replyToQueue = replyToQueue;
                        }

                        const replyToQueueManager = document.getElementById('replyToQueueManager').value;
                        if (replyToQueueManager) {
                            properties.replyToQueueManager = replyToQueueManager;
                        }

                        const format = document.getElementById('format').value;
                        if (format) {
                            properties.format = format;
                        }

                        const persistence = document.getElementById('persistence').value;
                        if (persistence) {
                            properties.persistence = parseInt(persistence, 10);
                        }

                        const priority = document.getElementById('priority').value;
                        if (priority) {
                            properties.priority = parseInt(priority, 10);
                        }

                        // Additional MQMD properties
                        const expiry = document.getElementById('expiry').value;
                        if (expiry) {
                            properties.expiry = parseInt(expiry, 10);
                        }

                        const feedback = document.getElementById('feedback').value;
                        if (feedback) {
                            properties.feedback = parseInt(feedback, 10);
                        }

                        const encoding = document.getElementById('encoding').value;
                        if (encoding) {
                            properties.encoding = parseInt(encoding, 10);
                        }

                        const codedCharSetId = document.getElementById('codedCharSetId').value;
                        if (codedCharSetId) {
                            properties.codedCharSetId = parseInt(codedCharSetId, 10);
                        }

                        const report = document.getElementById('report').value;
                        if (report) {
                            properties.report = parseInt(report, 10);
                        }

                        const msgType = document.getElementById('msgType').value;
                        if (msgType) {
                            properties.msgType = parseInt(msgType, 10);
                        }

                        // RFH2 properties
                        const rfh2Enabled = document.getElementById('rfh2Enabled').checked;
                        if (rfh2Enabled) {
                            properties.rfh2 = {
                                enabled: true
                            };

                            const rfh2Format = document.getElementById('rfh2Format').value;
                            if (rfh2Format) {
                                properties.rfh2.format = rfh2Format;
                            }

                            const rfh2Encoding = document.getElementById('rfh2Encoding').value;
                            if (rfh2Encoding) {
                                properties.rfh2.encoding = parseInt(rfh2Encoding, 10);
                            }

                            const rfh2CodedCharSetId = document.getElementById('rfh2CodedCharSetId').value;
                            if (rfh2CodedCharSetId) {
                                properties.rfh2.codedCharSetId = parseInt(rfh2CodedCharSetId, 10);
                            }

                            const rfh2Folders = document.getElementById('rfh2Folders').value;
                            if (rfh2Folders) {
                                try {
                                    properties.rfh2.folders = JSON.parse(rfh2Folders);
                                } catch (e) {
                                    vscode.postMessage({
                                        command: 'showError',
                                        message: 'Invalid RFH2 folders JSON: ' + e.message
                                    });
                                    return;
                                }
                            }
                        }

                        vscode.postMessage({
                            command: 'putMessage',
                            payload,
                            properties
                        });
                    });

                    // Handle load from file button
                    document.getElementById('loadFromFileBtn').addEventListener('click', () => {
                        vscode.postMessage({
                            command: 'loadFromFile'
                        });
                    });

                    // Handle cancel button
                    document.getElementById('cancelBtn').addEventListener('click', () => {
                        vscode.postMessage({
                            command: 'cancel'
                        });
                    });

                    // Handle toggle properties
                    document.getElementById('toggleProperties').addEventListener('click', () => {
                        const propertiesSection = document.getElementById('propertiesSection');
                        const toggleButton = document.getElementById('toggleProperties');

                        if (propertiesSection.style.display === 'none') {
                            propertiesSection.style.display = 'block';
                            toggleButton.textContent = 'Hide Advanced Properties';
                        } else {
                            propertiesSection.style.display = 'none';
                            toggleButton.textContent = 'Show Advanced Properties';
                        }
                    });

                    // Handle tabs
                    document.querySelectorAll('.tab').forEach(tab => {
                        tab.addEventListener('click', () => {
                            const tabName = tab.getAttribute('data-tab');
                            if (tabName) {
                                // Hide all tab contents
                                document.querySelectorAll('.tab-content').forEach(content => {
                                    content.classList.remove('active');
                                });

                                // Deactivate all tabs
                                document.querySelectorAll('.tab').forEach(t => {
                                    t.classList.remove('active');
                                });

                                // Activate selected tab and content
                                document.getElementById(tabName + 'Tab').classList.add('active');
                                tab.classList.add('active');
                            }
                        });
                    });

                    // Handle RFH2 enable/disable
                    document.getElementById('rfh2Enabled').addEventListener('change', (e) => {
                        const rfh2Fields = document.getElementById('rfh2Fields');
                        rfh2Fields.style.display = e.target.checked ? 'block' : 'none';

                        // If enabled, set format to MQHRF2
                        if (e.target.checked) {
                            document.getElementById('format').value = 'MQHRF2';
                        }
                    });

                    // Generate random correlation ID
                    document.getElementById('generateCorrelIdBtn').addEventListener('click', () => {
                        const correlId = generateRandomHexString(48);
                        document.getElementById('correlationId').value = correlId;
                    });

                    // Generate random message ID
                    document.getElementById('generateMsgIdBtn').addEventListener('click', () => {
                        const msgId = generateRandomHexString(48);
                        document.getElementById('messageId').value = msgId;
                    });

                    // Helper function to generate random hex string
                    function generateRandomHexString(length) {
                        let result = '';
                        const characters = '0123456789ABCDEF';
                        for (let i = 0; i < length; i++) {
                            result += characters.charAt(Math.floor(Math.random() * characters.length));
                        }
                        return result;
                    }

                    // Handle messages from extension
                    window.addEventListener('message', event => {
                        const message = event.data;

                        switch (message.command) {
                            case 'setPayload':
                                document.getElementById('payload').value = message.payload;
                                break;
                            case 'showError':
                                vscode.postMessage({
                                    command: 'showError',
                                    message: message.message
                                });
                                break;
                        }
                    });
                })();
            </script>
        </body>
        </html>`;
    }

    /**
     * Put a message to the queue
     */
    private async putMessage(payload: string, properties: MessageProperties): Promise<void> {
        try {
            const provider = this.connectionManager.getProvider(this.profileId);

            if (!provider) {
                throw new Error('Provider not found');
            }

            await provider.putMessage(this.queueName, payload, properties);

            vscode.window.showInformationMessage(`Message put to queue: ${this.queueName}`);

            // Emit queue updated event to trigger UI refresh
            this.connectionManager.emit('queueUpdated', this.queueName);

            // Close the panel
            this.panel?.dispose();
        } catch (error) {
            vscode.window.showErrorMessage(`Error putting message: ${(error as Error).message}`);
        }
    }

    /**
     * Load message payload from a file
     */
    private async loadFromFile(): Promise<void> {
        try {
            // Show open dialog
            const uris = await vscode.window.showOpenDialog({
                canSelectMany: false,
                filters: {
                    'All Files': ['*']
                }
            });

            if (uris && uris.length > 0) {
                // Read file content
                const fileContent = await vscode.workspace.fs.readFile(uris[0]);

                // Convert to string
                const payload = Buffer.from(fileContent).toString('utf8');

                // Update the webview
                if (this.panel) {
                    this.panel.webview.postMessage({
                        command: 'setPayload',
                        payload
                    });
                }
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Error loading file: ${(error as Error).message}`);
        }
    }

    /**
     * Get the HTML content for Azure Service Bus webview
     */
    private getASBWebviewContent(): string {
        const targetLabel = this.isTopicPublish ? `Topic: ${this.topicName}` : `Queue: ${this.queueName}`;
        const title = this.isTopicPublish ? 'Publish Message' : 'Put Message';

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${title}: ${this.queueName}</title>
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    padding: 20px;
                    color: var(--vscode-foreground);
                }
                .form-group {
                    margin-bottom: 15px;
                }
                label {
                    display: block;
                    margin-bottom: 5px;
                    font-weight: bold;
                }
                input, select, textarea {
                    width: 100%;
                    padding: 8px;
                    box-sizing: border-box;
                    background-color: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border: 1px solid var(--vscode-input-border);
                }
                textarea {
                    min-height: 150px;
                    font-family: monospace;
                }
                button {
                    padding: 8px 16px;
                    margin-right: 10px;
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    cursor: pointer;
                }
                button:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }
                .actions {
                    margin-top: 20px;
                    display: flex;
                }
                .properties {
                    margin-top: 20px;
                    border-top: 1px solid var(--vscode-input-border);
                    padding-top: 20px;
                }
                h2 {
                    margin-top: 0;
                    margin-bottom: 15px;
                }
                .toggle-properties {
                    margin-top: 10px;
                    cursor: pointer;
                    color: var(--vscode-textLink-foreground);
                    text-decoration: underline;
                }
                .hint {
                    display: block;
                    font-size: 0.8em;
                    color: var(--vscode-descriptionForeground);
                    margin-top: 4px;
                }
                .section {
                    margin-bottom: 20px;
                    padding: 15px;
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 4px;
                }
                .section h3 {
                    margin-top: 0;
                    margin-bottom: 15px;
                    font-size: 1em;
                    color: var(--vscode-textLink-foreground);
                }
                .two-col {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 15px;
                }
            </style>
        </head>
        <body>
            <h1>${title} to ${targetLabel}</h1>

            <div class="form-group">
                <label for="payload">Message Payload</label>
                <textarea id="payload" placeholder="Enter message payload (JSON, XML, or plain text)"></textarea>
            </div>

            <div class="form-group">
                <button id="loadFromFileBtn">Load From File</button>
            </div>

            <div class="toggle-properties" id="toggleProperties">Show Message Properties</div>

            <div class="properties" id="propertiesSection" style="display: none;">
                <h2>Azure Service Bus Message Properties</h2>

                <div class="section">
                    <h3>Content Properties</h3>
                    <div class="two-col">
                        <div class="form-group">
                            <label for="contentType">Content Type</label>
                            <select id="contentType">
                                <option value="">Default</option>
                                <option value="application/json">application/json</option>
                                <option value="application/xml">application/xml</option>
                                <option value="text/plain">text/plain</option>
                                <option value="application/octet-stream">application/octet-stream</option>
                            </select>
                        </div>
                        <div class="form-group">
                            <label for="subject">Subject (Label)</label>
                            <input type="text" id="subject" placeholder="Message subject/label">
                        </div>
                    </div>
                </div>

                <div class="section">
                    <h3>Routing Properties</h3>
                    <div class="two-col">
                        <div class="form-group">
                            <label for="to">To</label>
                            <input type="text" id="to" placeholder="Destination address">
                        </div>
                        <div class="form-group">
                            <label for="replyTo">Reply To</label>
                            <input type="text" id="replyTo" placeholder="Reply address">
                        </div>
                        <div class="form-group">
                            <label for="correlationId">Correlation ID</label>
                            <input type="text" id="correlationId" placeholder="Correlation identifier">
                        </div>
                        <div class="form-group">
                            <label for="replyToSessionId">Reply To Session ID</label>
                            <input type="text" id="replyToSessionId" placeholder="Reply session ID">
                        </div>
                    </div>
                </div>

                <div class="section">
                    <h3>Session & Partition Properties</h3>
                    <div class="two-col">
                        <div class="form-group">
                            <label for="sessionId">Session ID</label>
                            <input type="text" id="sessionId" placeholder="Session identifier">
                            <span class="hint">Required for session-enabled queues</span>
                        </div>
                        <div class="form-group">
                            <label for="partitionKey">Partition Key</label>
                            <input type="text" id="partitionKey" placeholder="Partition key">
                            <span class="hint">For partitioned entities</span>
                        </div>
                    </div>
                </div>

                <div class="section">
                    <h3>Timing Properties</h3>
                    <div class="two-col">
                        <div class="form-group">
                            <label for="timeToLive">Time To Live (ms)</label>
                            <input type="number" id="timeToLive" placeholder="e.g., 60000 for 1 minute">
                            <span class="hint">Leave empty for default TTL</span>
                        </div>
                        <div class="form-group">
                            <label for="scheduledEnqueueTime">Scheduled Enqueue Time</label>
                            <input type="datetime-local" id="scheduledEnqueueTime">
                            <span class="hint">Schedule message for future delivery</span>
                        </div>
                    </div>
                </div>

                <div class="section">
                    <h3>Application Properties (Custom Headers)</h3>
                    <div class="form-group">
                        <label for="applicationProperties">Application Properties (JSON)</label>
                        <textarea id="applicationProperties" style="min-height: 80px;" placeholder='{"key1": "value1", "key2": "value2"}'></textarea>
                        <span class="hint">Enter custom properties as JSON object</span>
                    </div>
                </div>
            </div>

            <div class="actions">
                <button id="putBtn">${title}</button>
                <button id="cancelBtn">Cancel</button>
            </div>

            <script>
                (function() {
                    const vscode = acquireVsCodeApi();

                    // Handle put button
                    document.getElementById('putBtn').addEventListener('click', () => {
                        const payload = document.getElementById('payload').value;
                        const properties = {};

                        // Content properties
                        const contentType = document.getElementById('contentType').value;
                        if (contentType) properties.contentType = contentType;

                        const subject = document.getElementById('subject').value;
                        if (subject) properties.subject = subject;

                        // Routing properties
                        const to = document.getElementById('to').value;
                        if (to) properties.to = to;

                        const replyTo = document.getElementById('replyTo').value;
                        if (replyTo) properties.replyTo = replyTo;

                        const correlationId = document.getElementById('correlationId').value;
                        if (correlationId) properties.correlationId = correlationId;

                        const replyToSessionId = document.getElementById('replyToSessionId').value;
                        if (replyToSessionId) properties.replyToSessionId = replyToSessionId;

                        // Session & Partition properties
                        const sessionId = document.getElementById('sessionId').value;
                        if (sessionId) properties.sessionId = sessionId;

                        const partitionKey = document.getElementById('partitionKey').value;
                        if (partitionKey) properties.partitionKey = partitionKey;

                        // Timing properties
                        const timeToLive = document.getElementById('timeToLive').value;
                        if (timeToLive) properties.timeToLive = timeToLive;

                        const scheduledEnqueueTime = document.getElementById('scheduledEnqueueTime').value;
                        if (scheduledEnqueueTime) properties.scheduledEnqueueTime = scheduledEnqueueTime;

                        // Application properties
                        const applicationPropertiesStr = document.getElementById('applicationProperties').value;
                        if (applicationPropertiesStr) {
                            try {
                                properties.applicationProperties = JSON.parse(applicationPropertiesStr);
                            } catch (e) {
                                vscode.postMessage({
                                    command: 'showError',
                                    message: 'Invalid Application Properties JSON: ' + e.message
                                });
                                return;
                            }
                        }

                        vscode.postMessage({
                            command: 'putMessage',
                            payload,
                            properties
                        });
                    });

                    // Handle load from file button
                    document.getElementById('loadFromFileBtn').addEventListener('click', () => {
                        vscode.postMessage({ command: 'loadFromFile' });
                    });

                    // Handle cancel button
                    document.getElementById('cancelBtn').addEventListener('click', () => {
                        vscode.postMessage({ command: 'cancel' });
                    });

                    // Handle toggle properties
                    document.getElementById('toggleProperties').addEventListener('click', () => {
                        const propertiesSection = document.getElementById('propertiesSection');
                        const toggleButton = document.getElementById('toggleProperties');

                        if (propertiesSection.style.display === 'none') {
                            propertiesSection.style.display = 'block';
                            toggleButton.textContent = 'Hide Message Properties';
                        } else {
                            propertiesSection.style.display = 'none';
                            toggleButton.textContent = 'Show Message Properties';
                        }
                    });

                    // Handle messages from extension
                    window.addEventListener('message', event => {
                        const message = event.data;
                        if (message.command === 'setPayload') {
                            document.getElementById('payload').value = message.payload;
                        }
                    });
                })();
            </script>
        </body>
        </html>`;
    }

    /**
     * Show the message publish webview for a topic (ASB)
     */
    public async showTopicPublish(profileId: string, topicName: string): Promise<void> {
        this.profileId = profileId;
        this.queueName = topicName;
        this.topicName = topicName;
        this.isTopicPublish = true;
        this.providerType = await this.getProviderType();

        // If panel already exists, reveal it
        if (this.panel) {
            this.panel.reveal();
            return;
        }

        // Create a new panel
        this.panel = vscode.window.createWebviewPanel(
            'mqexplorerMessagePut',
            `Publish Message: ${topicName}`,
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        // Set content
        this.updateWebviewContent();

        // Handle messages from the webview
        this.panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'putMessage':
                        await this.publishToTopic(message.payload, message.properties);
                        break;
                    case 'loadFromFile':
                        await this.loadFromFile();
                        break;
                    case 'cancel':
                        this.panel?.dispose();
                        break;
                    case 'showError':
                        vscode.window.showErrorMessage(message.message);
                        break;
                }
            },
            undefined,
            this.context.subscriptions
        );

        // Handle panel disposal
        this.panel.onDidDispose(
            () => {
                this.panel = undefined;
                this.isTopicPublish = false;
            },
            null,
            this.context.subscriptions
        );
    }

    /**
     * Publish a message to a topic
     */
    private async publishToTopic(payload: string, properties: MessageProperties): Promise<void> {
        try {
            const provider = this.connectionManager.getProvider(this.profileId);

            if (!provider) {
                throw new Error('Provider not found');
            }

            if (!provider.publishMessage) {
                throw new Error('Provider does not support topic publishing');
            }

            await provider.publishMessage(this.topicName, payload, properties);

            vscode.window.showInformationMessage(`Message published to topic: ${this.topicName}`);

            // Close the panel
            this.panel?.dispose();
        } catch (error) {
            vscode.window.showErrorMessage(`Error publishing message: ${(error as Error).message}`);
        }
    }
}
