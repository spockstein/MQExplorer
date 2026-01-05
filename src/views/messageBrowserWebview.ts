import * as vscode from 'vscode';
import { ConnectionManager } from '../services/connectionManager';
import { Message } from '../providers/IMQProvider';

/**
 * Manages the webview for browsing messages
 */
export class MessageBrowserWebview {
    private panel: vscode.WebviewPanel | undefined;
    private context: vscode.ExtensionContext;
    private connectionManager: ConnectionManager;
    private profileId: string;
    private queueName: string;
    private messages: Message[] = [];
    private currentPage: number = 0;
    private pageSize: number = 10;
    private queueDepth: number = 0;
    private filters: { messageId?: string; correlationId?: string } = {};
    // Subscription support (ASB)
    private topicName: string = '';
    private subscriptionName: string = '';
    private isSubscription: boolean = false;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.connectionManager = ConnectionManager.getInstance(context);
        this.profileId = '';
        this.queueName = '';

        // Listen for queue depth changes
        this.connectionManager.on(ConnectionManager.QUEUE_DEPTH_CHANGED, (queueName: string, depth: number) => {
            // Only update if this is the queue we're currently viewing
            if (this.queueName === queueName && this.panel) {
                console.log(`Queue depth changed for ${queueName}: ${depth}`);
                this.queueDepth = depth;

                // Update the depth count in the webview
                this.panel.webview.postMessage({
                    command: 'updateQueueDepth',
                    depth: depth
                });
            }
        });

        // Listen for queue updated events (after put/delete operations)
        this.connectionManager.on('queueUpdated', (queueName: string) => {
            // Only refresh if this is the queue we're currently viewing
            if (this.queueName === queueName && this.panel) {
                console.log(`Queue updated for ${queueName}, refreshing message list`);
                this.refreshMessageList();
            }
        });
    }

    /**
     * Show the message browser webview
     */
    public async show(profileId: string, queueName: string): Promise<void> {
        this.profileId = profileId;
        this.queueName = queueName;

        // If panel already exists, reveal it
        if (this.panel) {
            this.panel.reveal();
            await this.loadMessages();
            return;
        }

        // Create a new panel
        this.panel = vscode.window.createWebviewPanel(
            'mqexplorerMessageBrowser',
            `Messages: ${queueName}`,
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        // Load messages
        await this.loadMessages();

        // Handle messages from the webview
        this.panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'loadNextPage':
                        await this.loadNextPage();
                        break;
                    case 'loadPreviousPage':
                        await this.loadPreviousPage();
                        break;
                    case 'viewMessage':
                        this.viewMessageDetails(message.messageIndex);
                        break;
                    case 'copyToClipboard':
                        await vscode.env.clipboard.writeText(message.text);
                        vscode.window.showInformationMessage('Copied to clipboard');
                        break;
                    case 'saveToFile':
                        await this.saveMessageToFile(message.messageIndex, message.includeHeaders);
                        break;
                    case 'refresh':
                        await this.loadMessages();
                        break;
                    case 'deleteMessage':
                        await this.deleteMessage(message.messageIndex);
                        break;
                    case 'deleteSelectedMessages':
                        await this.deleteSelectedMessages(message.messageIndices);
                        break;
                    case 'applyFilters':
                        // Apply filters and reset to first page
                        this.filters = message.filters || {};
                        this.currentPage = 0;
                        await this.loadMessages();
                        break;
                    case 'clearFilters':
                        // Clear filters and reset to first page
                        this.filters = {};
                        this.currentPage = 0;
                        await this.loadMessages();
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
     * Show the message browser webview for a subscription (ASB)
     */
    public async showSubscription(profileId: string, topicName: string, subscriptionName: string): Promise<void> {
        this.profileId = profileId;
        this.topicName = topicName;
        this.subscriptionName = subscriptionName;
        this.queueName = `${topicName}/${subscriptionName}`;  // For display purposes
        this.isSubscription = true;

        // If panel already exists, reveal it
        if (this.panel) {
            this.panel.reveal();
            await this.loadMessages();
            return;
        }

        // Create a new panel
        this.panel = vscode.window.createWebviewPanel(
            'mqexplorerMessageBrowser',
            `Messages: ${topicName}/${subscriptionName}`,
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        // Load messages
        await this.loadMessages();

        // Handle messages from the webview (same handlers as queue browsing)
        this.panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.command) {
                    case 'loadNextPage':
                        await this.loadNextPage();
                        break;
                    case 'loadPreviousPage':
                        await this.loadPreviousPage();
                        break;
                    case 'viewMessage':
                        this.viewMessageDetails(message.messageIndex);
                        break;
                    case 'copyToClipboard':
                        await vscode.env.clipboard.writeText(message.text);
                        vscode.window.showInformationMessage('Copied to clipboard');
                        break;
                    case 'saveToFile':
                        await this.saveMessageToFile(message.messageIndex, message.includeHeaders);
                        break;
                    case 'refresh':
                        await this.loadMessages();
                        break;
                    case 'applyFilters':
                        this.filters = message.filters || {};
                        this.currentPage = 0;
                        await this.loadMessages();
                        break;
                    case 'clearFilters':
                        this.filters = {};
                        this.currentPage = 0;
                        await this.loadMessages();
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
                this.isSubscription = false;
            },
            null,
            this.context.subscriptions
        );
    }

    /**
     * Load messages from the queue
     */
    private async loadMessages(): Promise<void> {
        if (!this.panel) {
            return;
        }

        try {
            const provider = this.connectionManager.getProvider(this.profileId);

            if (!provider) {
                throw new Error('Provider not found');
            }

            // Load messages with pagination and filters
            const browseOptions: {
                limit: number;
                startPosition: number;
                filter?: { messageId?: string; correlationId?: string };
            } = {
                limit: this.pageSize,
                startPosition: this.currentPage * this.pageSize
            };

            // Only include non-empty filters
            if (Object.keys(this.filters).length > 0) {
                browseOptions.filter = { ...this.filters };
                console.log(`Applying filters: ${JSON.stringify(browseOptions.filter)}`);
            }

            // Handle subscription vs queue browsing
            if (this.isSubscription && provider.browseSubscriptionMessages) {
                // Browse subscription messages
                this.messages = await provider.browseSubscriptionMessages(this.topicName, this.subscriptionName, browseOptions);
                // For subscriptions, we don't have a direct depth API, estimate from messages
                this.queueDepth = this.messages.length + (this.currentPage * this.pageSize);
                console.log(`Loaded ${this.messages.length} messages from subscription: ${this.topicName}/${this.subscriptionName}`);
            } else {
                // Get the current queue depth directly
                try {
                    this.queueDepth = await provider.getQueueDepth(this.queueName);
                    console.log(`Queue depth for ${this.queueName}: ${this.queueDepth}`);
                } catch (error) {
                    console.error(`Error getting queue depth: ${(error as Error).message}`);
                    // Continue anyway, we'll just use the count of messages we get
                }

                this.messages = await provider.browseMessages(this.queueName, browseOptions);

                // If we couldn't get the queue depth directly, estimate it from the messages we got
                if (this.queueDepth === 0 && this.messages.length > 0) {
                    this.queueDepth = this.messages.length + (this.currentPage * this.pageSize);
                    console.log(`Estimated queue depth for ${this.queueName}: ${this.queueDepth}`);
                }
            }

            // Update the webview content
            this.updateWebviewContent();
        } catch (error) {
            vscode.window.showErrorMessage(`Error loading messages: ${(error as Error).message}`);

            // Show error in webview
            if (this.panel) {
                this.panel.webview.html = this.getErrorContent((error as Error).message);
            }
        }
    }

    /**
     * Load the next page of messages
     */
    private async loadNextPage(): Promise<void> {
        this.currentPage++;
        await this.loadMessages();
    }

    /**
     * Load the previous page of messages
     */
    private async loadPreviousPage(): Promise<void> {
        if (this.currentPage > 0) {
            this.currentPage--;
            await this.loadMessages();
        }
    }

    /**
     * Refresh the message list while maintaining current state
     */
    private async refreshMessageList(): Promise<void> {
        try {
            // Show refresh indicator in webview
            if (this.panel) {
                this.panel.webview.postMessage({
                    command: 'showRefreshIndicator',
                    message: 'Refreshing messages...'
                });
            }

            // Reload messages while preserving current page and filters
            await this.loadMessages();

            // Hide refresh indicator
            if (this.panel) {
                this.panel.webview.postMessage({
                    command: 'hideRefreshIndicator'
                });
            }

            console.log(`Message list refreshed for queue: ${this.queueName}`);
        } catch (error) {
            console.error(`Error refreshing message list: ${(error as Error).message}`);

            // Show error in webview
            if (this.panel) {
                this.panel.webview.postMessage({
                    command: 'showError',
                    message: `Error refreshing messages: ${(error as Error).message}`
                });
            }
        }
    }

    /**
     * View message details
     */
    private viewMessageDetails(messageIndex: number): void {
        if (messageIndex < 0 || messageIndex >= this.messages.length) {
            return;
        }

        const message = this.messages[messageIndex];

        // Update the webview to show message details
        if (this.panel) {
            this.panel.webview.postMessage({
                command: 'showMessageDetails',
                message: this.serializeMessage(message)
            });
        }
    }

    /**
     * Save message payload (and optionally headers) to a file
     */
    private async saveMessageToFile(messageIndex: number, includeHeaders: boolean = false): Promise<void> {
        if (messageIndex < 0 || messageIndex >= this.messages.length) {
            return;
        }

        const message = this.messages[messageIndex];

        // Determine file extension and filters based on whether we're including headers
        const defaultExtension = includeHeaders ? 'json' : 'txt';
        const filters: { [name: string]: string[] } = includeHeaders
            ? { 'JSON Files': ['json'], 'All Files': ['*'] }
            : { 'Text Files': ['txt'], 'All Files': ['*'] };

        // Show save dialog
        const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(`message_${message.id}.${defaultExtension}`),
            filters: filters
        });

        if (uri) {
            try {
                // Convert payload to string if it's a buffer
                const payload = typeof message.payload === 'string'
                    ? message.payload
                    : message.payload.toString('utf8');

                let content: string;

                if (includeHeaders) {
                    // Export full message with headers and payload
                    const fullMessage = {
                        headers: {
                            id: message.id,
                            correlationId: message.correlationId,
                            timestamp: message.timestamp,
                            properties: message.properties
                        },
                        payload: payload
                    };

                    // Try to parse payload as JSON for better formatting
                    try {
                        fullMessage.payload = JSON.parse(payload);
                    } catch {
                        // Keep as string if not valid JSON
                    }

                    content = JSON.stringify(fullMessage, null, 2);
                } else {
                    // Export payload only
                    content = payload;
                }

                // Write to file
                await vscode.workspace.fs.writeFile(uri, Buffer.from(content));

                vscode.window.showInformationMessage(includeHeaders ? 'Full message saved to file' : 'Message saved to file');
            } catch (error) {
                vscode.window.showErrorMessage(`Error saving message: ${(error as Error).message}`);
            }
        }
    }

    /**
     * Update the webview content
     */
    private updateWebviewContent(): void {
        if (!this.panel) {
            return;
        }

        this.panel.webview.html = this.getWebviewContent();
    }

    /**
     * Get the HTML content for the webview
     */
    private getWebviewContent(): string {
        // Create message rows HTML
        let messageRowsHtml = '';
        if (this.messages.length === 0) {
            messageRowsHtml = '<div class="no-messages">No messages found</div>';
        } else {
            for (let i = 0; i < this.messages.length; i++) {
                const message = this.messages[i];
                messageRowsHtml += `
                    <div class="message-row" data-index="${i}">
                        <div class="checkbox-cell">
                            <input type="checkbox" class="message-checkbox" data-index="${i}">
                        </div>
                        <div class="message-cell id-cell">${this.truncate(message.id, 20)}</div>
                        <div class="message-cell correl-cell">${this.truncate(message.correlationId || '', 20)}</div>
                        <div class="message-cell time-cell">${message.timestamp instanceof Date && !isNaN(message.timestamp.getTime()) ? message.timestamp.toLocaleString() : 'N/A'}</div>
                        <div class="message-cell format-cell">${message.properties.format || ''}</div>
                    </div>
                `;
            }
        }

        // Serialize messages for JavaScript
        const serializedMessages = JSON.stringify(this.messages.map(m => this.serializeMessage(m)));

        // Create pagination button states
        const prevBtnDisabled = this.currentPage === 0 ? 'disabled' : '';
        const nextBtnDisabled = this.messages.length < this.pageSize ? 'disabled' : '';

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Messages: ${this.queueName}</title>
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    padding: 20px;
                    color: var(--vscode-foreground);
                }
                .header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 20px;
                }
                .header-left {
                    display: flex;
                    flex-direction: column;
                }
                .queue-info {
                    font-size: 0.9em;
                    color: var(--vscode-descriptionForeground);
                    margin-top: -10px;
                    margin-bottom: 10px;
                }
                .depth-count {
                    font-weight: bold;
                    color: var(--vscode-foreground);
                }
                .message-list {
                    border: 1px solid var(--vscode-panel-border);
                    margin-bottom: 20px;
                }
                .message-row {
                    display: flex;
                    padding: 8px;
                    border-bottom: 1px solid var(--vscode-panel-border);
                    cursor: pointer;
                }
                .message-row:hover {
                    background-color: var(--vscode-list-hoverBackground);
                }
                .message-row.selected {
                    background-color: var(--vscode-list-activeSelectionBackground);
                    color: var(--vscode-list-activeSelectionForeground);
                }
                .message-cell {
                    padding: 0 10px;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }
                .checkbox-cell {
                    width: 30px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                }
                .id-cell {
                    width: 22%;
                }
                .correl-cell {
                    width: 22%;
                }
                .time-cell {
                    width: 22%;
                }
                .format-cell {
                    width: 22%;
                }
                .message-header {
                    font-weight: bold;
                    background-color: var(--vscode-editor-background);
                }
                .pagination {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 20px;
                }
                button {
                    padding: 8px 16px;
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    cursor: pointer;
                }
                button:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }
                button:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }
                .message-details {
                    border: 1px solid var(--vscode-panel-border);
                    padding: 20px;
                    display: none;
                }
                .details-header {
                    margin-bottom: 20px;
                    display: flex;
                    justify-content: space-between;
                }
                .details-section {
                    margin-bottom: 20px;
                }
                .details-section h3 {
                    margin-top: 0;
                    margin-bottom: 10px;
                }
                .properties-table {
                    width: 100%;
                    border-collapse: collapse;
                }
                .properties-table th, .properties-table td {
                    padding: 8px;
                    text-align: left;
                    border-bottom: 1px solid var(--vscode-panel-border);
                }
                .payload-content {
                    background-color: var(--vscode-editor-background);
                    padding: 10px;
                    overflow: auto;
                    max-height: 300px;
                    font-family: monospace;
                    white-space: pre-wrap;
                }
                /* JSON Syntax Highlighting */
                .json-key {
                    color: var(--vscode-symbolIcon-propertyForeground, #9cdcfe);
                }
                .json-string {
                    color: var(--vscode-symbolIcon-stringForeground, #ce9178);
                }
                .json-number {
                    color: var(--vscode-symbolIcon-numberForeground, #b5cea8);
                }
                .json-boolean {
                    color: var(--vscode-symbolIcon-booleanForeground, #569cd6);
                }
                .json-null {
                    color: var(--vscode-symbolIcon-nullForeground, #569cd6);
                }
                .json-bracket {
                    color: var(--vscode-editorBracketMatch-border, #ffd700);
                }
                .json-colon, .json-comma {
                    color: var(--vscode-foreground, #d4d4d4);
                }
                /* XML Syntax Highlighting */
                .xml-tag {
                    color: var(--vscode-symbolIcon-classForeground, #569cd6);
                }
                .xml-attr-name {
                    color: var(--vscode-symbolIcon-propertyForeground, #9cdcfe);
                }
                .xml-attr-value {
                    color: var(--vscode-symbolIcon-stringForeground, #ce9178);
                }
                .xml-content {
                    color: var(--vscode-foreground, #d4d4d4);
                }
                .xml-comment {
                    color: var(--vscode-symbolIcon-commentForeground, #6a9955);
                    font-style: italic;
                }
                .xml-declaration {
                    color: var(--vscode-symbolIcon-keywordForeground, #c586c0);
                }
                .tabs {
                    display: flex;
                    margin-bottom: 10px;
                }
                .tab {
                    padding: 8px 16px;
                    cursor: pointer;
                    border: 1px solid var(--vscode-panel-border);
                    margin-right: 5px;
                }
                .tab.active {
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                }
                .tab-content {
                    display: none;
                }
                .tab-content.active {
                    display: block;
                }
                .no-messages {
                    padding: 20px;
                    text-align: center;
                    font-style: italic;
                }
                .delete-btn {
                    background-color: var(--vscode-errorForeground);
                    color: white;
                }
                .delete-btn:hover {
                    background-color: darkred;
                }

                /* Filter styles */
                .filters {
                    margin: 10px 0;
                    padding: 10px;
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 4px;
                    background-color: var(--vscode-editor-background);
                }

                .filter-form {
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                }

                .filter-row {
                    display: flex;
                    gap: 20px;
                }

                .filter-group {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    gap: 5px;
                }

                .filter-actions {
                    display: flex;
                    gap: 10px;
                    justify-content: flex-end;
                }

                .filter-badge {
                    display: inline-block;
                    background-color: var(--vscode-badge-background);
                    color: var(--vscode-badge-foreground);
                    border-radius: 10px;
                    padding: 2px 8px;
                    font-size: 0.8em;
                    margin-left: 10px;
                }
            </style>
        </head>
        <body>
            <div class="header">
                <div class="header-left">
                    <h1>Messages: ${this.queueName}</h1>
                    <div class="queue-info">Queue Depth: <span class="depth-count">${this.queueDepth}</span></div>
                </div>
                <div>
                    <button id="deleteSelectedBtn" disabled>Delete Selected</button>
                    <button id="refreshBtn">Refresh</button>
                    <button id="toggleFiltersBtn">Filters</button>
                </div>
            </div>

            <div class="filters" id="filtersSection" style="display: none;">
                <h3>Message Filters</h3>
                <div class="filter-form">
                    <div class="filter-row">
                        <div class="filter-group">
                            <label for="messageIdFilter">Message ID (hex)</label>
                            <input type="text" id="messageIdFilter" placeholder="e.g., 414D5120514D31202020202020202020012EF35E20046C40">
                        </div>
                        <div class="filter-group">
                            <label for="correlationIdFilter">Correlation ID (hex)</label>
                            <input type="text" id="correlationIdFilter" placeholder="e.g., 414D5120514D31202020202020202020012EF35E20046C40">
                        </div>
                    </div>
                    <div class="filter-actions">
                        <button id="applyFiltersBtn">Apply Filters</button>
                        <button id="clearFiltersBtn">Clear Filters</button>
                    </div>
                </div>
            </div>

            <div class="pagination">
                <button id="prevBtn" ${prevBtnDisabled}>Previous Page</button>
                <span>Page ${this.currentPage + 1}</span>
                <button id="nextBtn" ${nextBtnDisabled}>Next Page</button>
            </div>

            <div class="message-list">
                <div class="message-row message-header">
                    <div class="checkbox-cell">
                        <input type="checkbox" id="selectAllCheckbox" title="Select All">
                    </div>
                    <div class="message-cell id-cell">Message ID</div>
                    <div class="message-cell correl-cell">Correlation ID</div>
                    <div class="message-cell time-cell">Timestamp</div>
                    <div class="message-cell format-cell">Format</div>
                </div>
                ${messageRowsHtml}
            </div>

            <div id="messageDetails" class="message-details">
                <div class="details-header">
                    <h2>Message Details</h2>
                    <div>
                        <button id="copyMsgIdBtn">Copy ID</button>
                        <button id="copyCorrelIdBtn">Copy Correl ID</button>
                        <button id="savePayloadBtn">Save Payload</button>
                        <button id="saveFullMessageBtn">Save Full Message</button>
                        <button id="deleteMessageBtn" class="delete-btn">Delete Message</button>
                    </div>
                </div>

                <div class="details-section">
                    <h3>Properties</h3>
                    <table class="properties-table" id="propertiesTable">
                        <tr>
                            <th>Property</th>
                            <th>Value</th>
                        </tr>
                    </table>
                </div>

                <div class="details-section">
                    <h3>Payload</h3>
                    <div class="tabs">
                        <div class="tab active" data-tab="text">Text</div>
                        <div class="tab" data-tab="hex">Hex</div>
                        <div class="tab" data-tab="json">JSON</div>
                        <div class="tab" data-tab="xml">XML</div>
                    </div>
                    <div class="tab-content active" id="textTab">
                        <div class="payload-content" id="textPayload"></div>
                    </div>
                    <div class="tab-content" id="hexTab">
                        <div class="payload-content" id="hexPayload"></div>
                    </div>
                    <div class="tab-content" id="jsonTab">
                        <div class="payload-content" id="jsonPayload"></div>
                    </div>
                    <div class="tab-content" id="xmlTab">
                        <div class="payload-content" id="xmlPayload"></div>
                    </div>
                </div>
            </div>

            <script>
                (function() {
                    const vscode = acquireVsCodeApi();
                    let selectedMessageIndex = -1;
                    let messages = ${serializedMessages};
                    let selectedMessageIndices = [];

                    // Handle message row click (excluding checkbox)
                    document.querySelectorAll('.message-row:not(.message-header)').forEach(row => {
                        row.addEventListener('click', (event) => {
                            // Ignore clicks on checkboxes
                            if (event.target.type === 'checkbox') {
                                return;
                            }

                            const index = parseInt(row.dataset.index, 10);
                            selectMessage(index);

                            vscode.postMessage({
                                command: 'viewMessage',
                                messageIndex: index
                            });
                        });
                    });

                    // Handle checkboxes
                    document.querySelectorAll('.message-checkbox').forEach(checkbox => {
                        checkbox.addEventListener('change', () => {
                            updateSelectedMessages();
                        });
                    });

                    // Handle select all checkbox
                    const selectAllCheckbox = document.getElementById('selectAllCheckbox');
                    selectAllCheckbox.addEventListener('change', () => {
                        const isChecked = selectAllCheckbox.checked;
                        document.querySelectorAll('.message-checkbox').forEach(checkbox => {
                            checkbox.checked = isChecked;
                        });
                        updateSelectedMessages();
                    });

                    // Handle delete selected button
                    document.getElementById('deleteSelectedBtn').addEventListener('click', () => {
                        if (selectedMessageIndices.length > 0) {
                            vscode.postMessage({
                                command: 'deleteSelectedMessages',
                                messageIndices: selectedMessageIndices
                            });
                        }
                    });

                    // Handle delete message button
                    document.getElementById('deleteMessageBtn').addEventListener('click', () => {
                        if (selectedMessageIndex >= 0) {
                            vscode.postMessage({
                                command: 'deleteMessage',
                                messageIndex: selectedMessageIndex
                            });
                        }
                    });

                    // Handle pagination
                    document.getElementById('prevBtn').addEventListener('click', () => {
                        vscode.postMessage({
                            command: 'loadPreviousPage'
                        });
                    });

                    document.getElementById('nextBtn').addEventListener('click', () => {
                        vscode.postMessage({
                            command: 'loadNextPage'
                        });
                    });

                    // Handle refresh
                    document.getElementById('refreshBtn').addEventListener('click', () => {
                        vscode.postMessage({
                            command: 'refresh'
                        });
                    });

                    // Handle toggle filters
                    document.getElementById('toggleFiltersBtn').addEventListener('click', () => {
                        const filtersSection = document.getElementById('filtersSection');
                        filtersSection.style.display = filtersSection.style.display === 'none' ? 'block' : 'none';
                    });

                    // Handle apply filters
                    document.getElementById('applyFiltersBtn').addEventListener('click', () => {
                        const messageIdFilter = document.getElementById('messageIdFilter').value.trim();
                        const correlationIdFilter = document.getElementById('correlationIdFilter').value.trim();

                        // Only apply filters if at least one is provided
                        if (messageIdFilter || correlationIdFilter) {
                            vscode.postMessage({
                                command: 'applyFilters',
                                filters: {
                                    messageId: messageIdFilter || undefined,
                                    correlationId: correlationIdFilter || undefined
                                }
                            });

                            // Add filter badge to the toggle button if not already present
                            const toggleBtn = document.getElementById('toggleFiltersBtn');
                            if (!toggleBtn.querySelector('.filter-badge')) {
                                const badge = document.createElement('span');
                                badge.className = 'filter-badge';
                                badge.textContent = 'Active';
                                toggleBtn.appendChild(badge);
                            }
                        } else {
                            // If no filters provided, clear filters
                            vscode.postMessage({
                                command: 'clearFilters'
                            });

                            // Remove filter badge if present
                            const badge = document.getElementById('toggleFiltersBtn').querySelector('.filter-badge');
                            if (badge) {
                                badge.remove();
                            }
                        }
                    });

                    // Handle clear filters
                    document.getElementById('clearFiltersBtn').addEventListener('click', () => {
                        // Clear filter inputs
                        document.getElementById('messageIdFilter').value = '';
                        document.getElementById('correlationIdFilter').value = '';

                        // Send clear filters command
                        vscode.postMessage({
                            command: 'clearFilters'
                        });

                        // Remove filter badge if present
                        const badge = document.getElementById('toggleFiltersBtn').querySelector('.filter-badge');
                        if (badge) {
                            badge.remove();
                        }
                    });

                    // Handle copy buttons
                    document.getElementById('copyMsgIdBtn').addEventListener('click', () => {
                        if (selectedMessageIndex >= 0) {
                            vscode.postMessage({
                                command: 'copyToClipboard',
                                text: messages[selectedMessageIndex].id
                            });
                        }
                    });

                    document.getElementById('copyCorrelIdBtn').addEventListener('click', () => {
                        if (selectedMessageIndex >= 0) {
                            vscode.postMessage({
                                command: 'copyToClipboard',
                                text: messages[selectedMessageIndex].correlationId || ''
                            });
                        }
                    });

                    // Handle save payload
                    document.getElementById('savePayloadBtn').addEventListener('click', () => {
                        if (selectedMessageIndex >= 0) {
                            vscode.postMessage({
                                command: 'saveToFile',
                                messageIndex: selectedMessageIndex,
                                includeHeaders: false
                            });
                        }
                    });

                    // Handle save full message (payload + headers)
                    document.getElementById('saveFullMessageBtn').addEventListener('click', () => {
                        if (selectedMessageIndex >= 0) {
                            vscode.postMessage({
                                command: 'saveToFile',
                                messageIndex: selectedMessageIndex,
                                includeHeaders: true
                            });
                        }
                    });

                    // Handle tabs
                    document.querySelectorAll('.tab').forEach(tab => {
                        tab.addEventListener('click', () => {
                            const tabName = tab.getAttribute('data-tab');
                            if (tabName) {
                                selectTab(tabName);
                            }
                        });
                    });

                    // Handle messages from extension
                    window.addEventListener('message', event => {
                        const message = event.data;

                        switch (message.command) {
                            case 'showMessageDetails':
                                showMessageDetails(message.message);
                                break;
                            case 'updateQueueDepth':
                                // Update the queue depth display
                                document.querySelector('.depth-count').textContent = message.depth;
                                break;
                            case 'showRefreshIndicator':
                                showRefreshIndicator(message.message);
                                break;
                            case 'hideRefreshIndicator':
                                hideRefreshIndicator();
                                break;
                            case 'showError':
                                showErrorMessage(message.message);
                                break;
                        }
                    });

                    // Function to show refresh indicator
                    function showRefreshIndicator(message) {
                        let indicator = document.getElementById('refreshIndicator');
                        if (!indicator) {
                            indicator = document.createElement('div');
                            indicator.id = 'refreshIndicator';
                            indicator.style.cssText = \`
                                position: fixed;
                                top: 10px;
                                right: 10px;
                                background: var(--vscode-notifications-background);
                                color: var(--vscode-notifications-foreground);
                                border: 1px solid var(--vscode-notifications-border);
                                padding: 8px 12px;
                                border-radius: 4px;
                                z-index: 1000;
                                font-size: 12px;
                                display: flex;
                                align-items: center;
                                gap: 8px;
                            \`;
                            document.body.appendChild(indicator);
                        }
                        indicator.innerHTML = \`
                            <div style="width: 12px; height: 12px; border: 2px solid var(--vscode-progressBar-background); border-top: 2px solid var(--vscode-progressBar-foreground); border-radius: 50%; animation: spin 1s linear infinite;"></div>
                            \${message}
                        \`;
                        indicator.style.display = 'flex';
                    }

                    // Function to hide refresh indicator
                    function hideRefreshIndicator() {
                        const indicator = document.getElementById('refreshIndicator');
                        if (indicator) {
                            indicator.style.display = 'none';
                        }
                    }

                    // Function to show error message
                    function showErrorMessage(message) {
                        hideRefreshIndicator();
                        let errorDiv = document.getElementById('errorMessage');
                        if (!errorDiv) {
                            errorDiv = document.createElement('div');
                            errorDiv.id = 'errorMessage';
                            errorDiv.style.cssText = \`
                                position: fixed;
                                top: 10px;
                                right: 10px;
                                background: var(--vscode-inputValidation-errorBackground);
                                color: var(--vscode-inputValidation-errorForeground);
                                border: 1px solid var(--vscode-inputValidation-errorBorder);
                                padding: 8px 12px;
                                border-radius: 4px;
                                z-index: 1000;
                                font-size: 12px;
                                max-width: 300px;
                            \`;
                            document.body.appendChild(errorDiv);
                        }
                        errorDiv.textContent = message;
                        errorDiv.style.display = 'block';

                        // Auto-hide after 5 seconds
                        setTimeout(() => {
                            if (errorDiv) {
                                errorDiv.style.display = 'none';
                            }
                        }, 5000);
                    }

                    // Add CSS for spinner animation
                    const style = document.createElement('style');
                    style.textContent = \`
                        @keyframes spin {
                            0% { transform: rotate(0deg); }
                            100% { transform: rotate(360deg); }
                        }
                    \`;
                    document.head.appendChild(style);

                    // Update selected messages
                    function updateSelectedMessages() {
                        selectedMessageIndices = [];
                        document.querySelectorAll('.message-checkbox:checked').forEach(checkbox => {
                            selectedMessageIndices.push(parseInt(checkbox.dataset.index, 10));
                        });

                        // Update delete selected button
                        const deleteSelectedBtn = document.getElementById('deleteSelectedBtn');
                        deleteSelectedBtn.disabled = selectedMessageIndices.length === 0;
                        deleteSelectedBtn.textContent = 'Delete Selected (' + selectedMessageIndices.length + ')';
                    }

                    function selectMessage(index) {
                        // Deselect all rows
                        document.querySelectorAll('.message-row:not(.message-header)').forEach(row => {
                            row.classList.remove('selected');
                        });

                        // Select the clicked row
                        const row = document.querySelector('.message-row[data-index="' + index + '"]');
                        if (row) {
                            row.classList.add('selected');
                        }

                        selectedMessageIndex = index;

                        // Show message details
                        showMessageDetails(messages[index]);
                    }

                    function showMessageDetails(message) {
                        // Show the details panel
                        document.getElementById('messageDetails').style.display = 'block';

                        // Populate properties table
                        const propertiesTable = document.getElementById('propertiesTable');
                        propertiesTable.innerHTML = '<tr><th>Property</th><th>Value</th></tr>';

                        // Add ID and correlation ID
                        addPropertyRow(propertiesTable, 'Message ID', message.id);
                        addPropertyRow(propertiesTable, 'Correlation ID', message.correlationId || '');
                        addPropertyRow(propertiesTable, 'Timestamp', message.timestamp ? new Date(message.timestamp).toLocaleString() : 'N/A');

                        // Add other properties
                        for (const [key, value] of Object.entries(message.properties)) {
                            addPropertyRow(propertiesTable, key, value);
                        }

                        // Set payload content
                        const textPayload = document.getElementById('textPayload');
                        const hexPayload = document.getElementById('hexPayload');
                        const jsonPayload = document.getElementById('jsonPayload');
                        const xmlPayload = document.getElementById('xmlPayload');

                        // Set hex payload
                        hexPayload.textContent = stringToHex(message.payload || '');

                        // Try to detect and format JSON in both Text and JSON tabs
                        let isValidJson = false;
                        let formattedJson = '';

                        if (message.payload) {
                            try {
                                // Strip BOM (Byte Order Mark) if present - BOM can appear at start of UTF-8/UTF-16 files
                                // and will cause JSON.parse to fail
                                let payloadToparse = message.payload;
                                if (payloadToparse.charCodeAt(0) === 0xFEFF) {
                                    payloadToparse = payloadToparse.substring(1);
                                }
                                // Also handle UTF-8 BOM which might appear as multiple characters
                                if (payloadToparse.startsWith('\xEF\xBB\xBF')) {
                                    payloadToparse = payloadToparse.substring(3);
                                }

                                // Try to parse as JSON
                                const jsonObj = JSON.parse(payloadToparse);
                                // Format with indentation
                                formattedJson = JSON.stringify(jsonObj, null, 2);
                                isValidJson = true;

                                // Apply syntax highlighting to JSON tab
                                // Wrap in a pre element to preserve whitespace and line breaks
                                jsonPayload.innerHTML = '<pre style="margin: 0; white-space: pre-wrap; word-wrap: break-word; font-family: inherit;">' + highlightJson(formattedJson) + '</pre>';
                                // Show the JSON tab if it's valid JSON
                                document.querySelector('.tab[data-tab="json"]').style.display = 'block';
                            } catch (e) {
                                // Not valid JSON
                                jsonPayload.textContent = 'Not valid JSON: ' + e.message;
                                // Hide the JSON tab if it's not valid JSON
                                document.querySelector('.tab[data-tab="json"]').style.display = 'none';
                            }
                        } else {
                            jsonPayload.textContent = '';
                            document.querySelector('.tab[data-tab="json"]').style.display = 'none';
                        }

                        // Set text payload - format JSON if valid, otherwise show raw
                        if (isValidJson) {
                            // Show formatted JSON with syntax highlighting in Text tab too
                            // Wrap in a pre-like element to preserve whitespace and line breaks
                            textPayload.innerHTML = '<pre style="margin: 0; white-space: pre-wrap; word-wrap: break-word; font-family: inherit;">' + highlightJson(formattedJson) + '</pre>';
                        } else {
                            textPayload.textContent = message.payload || '';
                        }

                        // Set XML payload with syntax highlighting
                        if (message.payload) {
                            try {
                                // Check if it looks like XML (starts with < and contains closing tags)
                                if (message.payload.trim().startsWith('<') && message.payload.includes('</')) {
                                    // Simple XML formatting (this is not a full XML parser)
                                    const formattedXml = formatXml(message.payload);
                                    // Apply syntax highlighting (using innerHTML for colored spans)
                                    xmlPayload.innerHTML = highlightXml(formattedXml);
                                    // Show the XML tab if it looks like XML
                                    document.querySelector('.tab[data-tab="xml"]').style.display = 'block';
                                } else {
                                    throw new Error('Not XML format');
                                }
                            } catch (e) {
                                // Not valid XML
                                xmlPayload.textContent = 'Not valid XML: ' + e.message;
                                // Hide the XML tab if it's not valid XML
                                document.querySelector('.tab[data-tab="xml"]').style.display = 'none';
                            }
                        } else {
                            xmlPayload.textContent = '';
                            document.querySelector('.tab[data-tab="xml"]').style.display = 'none';
                        }

                        // Auto-select the appropriate tab based on content
                        if (document.querySelector('.tab[data-tab="json"]').style.display !== 'none' &&
                            jsonPayload.textContent.indexOf('Not valid JSON') === -1) {
                            selectTab('json');
                        } else if (document.querySelector('.tab[data-tab="xml"]').style.display !== 'none' &&
                                   xmlPayload.textContent.indexOf('Not valid XML') === -1) {
                            selectTab('xml');
                        } else {
                            selectTab('text');
                        }
                    }

                    function addPropertyRow(table, name, value) {
                        const row = table.insertRow();
                        const nameCell = row.insertCell(0);
                        const valueCell = row.insertCell(1);

                        nameCell.textContent = name;

                        // Handle different value types
                        if (value === null || value === undefined) {
                            valueCell.textContent = '';
                        } else if (name === 'applicationProperties' && typeof value === 'object' && !Array.isArray(value)) {
                            // For applicationProperties, render as a sub-table for better readability
                            const entries = Object.entries(value);
                            if (entries.length === 0) {
                                valueCell.textContent = '(empty)';
                            } else {
                                const subTable = document.createElement('table');
                                subTable.style.width = '100%';
                                subTable.style.borderCollapse = 'collapse';
                                subTable.style.fontSize = '12px';
                                subTable.style.backgroundColor = 'var(--vscode-editor-background)';
                                subTable.style.borderRadius = '3px';

                                // Add header row
                                const headerRow = subTable.insertRow();
                                const headerName = headerRow.insertCell(0);
                                const headerValue = headerRow.insertCell(1);
                                headerName.textContent = 'Header';
                                headerValue.textContent = 'Value';
                                headerName.style.fontWeight = 'bold';
                                headerValue.style.fontWeight = 'bold';
                                headerName.style.padding = '4px 8px';
                                headerValue.style.padding = '4px 8px';
                                headerName.style.borderBottom = '1px solid var(--vscode-panel-border)';
                                headerValue.style.borderBottom = '1px solid var(--vscode-panel-border)';
                                headerName.style.backgroundColor = 'var(--vscode-editor-background)';
                                headerValue.style.backgroundColor = 'var(--vscode-editor-background)';

                                // Add each property as a row
                                for (const [propName, propValue] of entries) {
                                    const propRow = subTable.insertRow();
                                    const propNameCell = propRow.insertCell(0);
                                    const propValueCell = propRow.insertCell(1);

                                    propNameCell.textContent = propName;
                                    propNameCell.style.padding = '4px 8px';
                                    propNameCell.style.borderBottom = '1px solid var(--vscode-panel-border)';
                                    propNameCell.style.color = 'var(--vscode-textLink-foreground)';
                                    propNameCell.style.verticalAlign = 'top';

                                    propValueCell.style.padding = '4px 8px';
                                    propValueCell.style.borderBottom = '1px solid var(--vscode-panel-border)';
                                    propValueCell.style.wordBreak = 'break-word';

                                    // Handle nested objects/arrays in property values
                                    if (propValue !== null && typeof propValue === 'object') {
                                        try {
                                            propValueCell.textContent = JSON.stringify(propValue);
                                        } catch (e) {
                                            propValueCell.textContent = String(propValue);
                                        }
                                    } else {
                                        propValueCell.textContent = String(propValue ?? '');
                                    }
                                }

                                valueCell.appendChild(subTable);
                            }
                        } else if (typeof value === 'object') {
                            // For other objects and arrays, format as JSON with syntax highlighting
                            try {
                                const jsonStr = JSON.stringify(value, null, 2);
                                const pre = document.createElement('pre');
                                pre.style.margin = '0';
                                pre.style.whiteSpace = 'pre-wrap';
                                pre.style.wordBreak = 'break-word';
                                pre.style.maxHeight = '200px';
                                pre.style.overflow = 'auto';
                                pre.style.fontSize = '12px';
                                pre.style.backgroundColor = 'var(--vscode-editor-background)';
                                pre.style.padding = '4px';
                                pre.style.borderRadius = '3px';
                                pre.innerHTML = highlightJson(jsonStr);
                                valueCell.appendChild(pre);
                            } catch (e) {
                                // Fallback to string representation
                                valueCell.textContent = String(value);
                            }
                        } else {
                            valueCell.textContent = String(value);
                        }
                    }

                    function stringToHex(str) {
                        let result = '';
                        let offset = 0;

                        for (let i = 0; i < str.length; i++) {
                            const hex = str.charCodeAt(i).toString(16).padStart(2, '0');
                            result += hex + ' ';

                            // Add newline every 16 bytes
                            if (++offset % 16 === 0) {
                                result += '\\n';
                            }
                        }

                        return result;
                    }

                    function formatXml(xml) {
                        // Simple XML formatter
                        let formatted = '';
                        let indent = '';

                        // Remove whitespace between tags
                        xml = xml.replace(/>\\s*</g, '><');

                        // Add newlines and indentation
                        for (let i = 0; i < xml.length; i++) {
                            const char = xml.charAt(i);

                            if (char === '<') {
                                // Check if it's a closing tag
                                if (xml.charAt(i + 1) === '/') {
                                    indent = indent.substring(2); // Decrease indent
                                }

                                // Add newline and indent
                                formatted += '\\n' + indent + '<';

                                // Check if it's not a closing tag and not a self-closing tag
                                if (xml.charAt(i + 1) !== '/' && xml.charAt(i + 1) !== '?' &&
                                    !(xml.substring(i, i + 4) === '<!--')) {
                                    // Check if it's not a self-closing tag
                                    let j = i + 1;
                                    let tagContent = '';
                                    while (j < xml.length && xml.charAt(j) !== '>') {
                                        tagContent += xml.charAt(j);
                                        j++;
                                    }

                                    // If it doesn't end with '/', increase indent
                                    if (!tagContent.endsWith('/')) {
                                        indent += '  '; // Increase indent
                                    }
                                }
                            } else if (char === '>') {
                                formatted += '>';
                            } else {
                                formatted += char;
                            }
                        }

                        return formatted;
                    }

                    // JSON Syntax Highlighter - returns HTML with span elements for highlighting
                    function highlightJson(jsonStr) {
                        // Escape HTML entities first
                        const escapeHtml = (str) => str
                            .replace(/&/g, '&amp;')
                            .replace(/</g, '&lt;')
                            .replace(/>/g, '&gt;');

                        let result = '';
                        let i = 0;
                        let inString = false;
                        let stringChar = '';
                        let currentToken = '';

                        while (i < jsonStr.length) {
                            const char = jsonStr[i];

                            if (inString) {
                                currentToken += char;
                                if (char === stringChar && jsonStr[i - 1] !== '\\\\') {
                                    inString = false;
                                    // Check if this is a key (followed by :)
                                    let j = i + 1;
                                    while (j < jsonStr.length && /\\s/.test(jsonStr[j])) j++;
                                    const isKey = jsonStr[j] === ':';
                                    const className = isKey ? 'json-key' : 'json-string';
                                    result += '<span class="' + className + '">' + escapeHtml(currentToken) + '</span>';
                                    currentToken = '';
                                }
                            } else if (char === '"' || char === "'") {
                                inString = true;
                                stringChar = char;
                                currentToken = char;
                            } else if (char === '{' || char === '}' || char === '[' || char === ']') {
                                result += '<span class="json-bracket">' + char + '</span>';
                            } else if (char === ':') {
                                result += '<span class="json-colon">:</span>';
                            } else if (char === ',') {
                                result += '<span class="json-comma">,</span>';
                            } else if (/[0-9.\\-]/.test(char)) {
                                // Collect the full number
                                let num = char;
                                while (i + 1 < jsonStr.length && /[0-9.eE\\-+]/.test(jsonStr[i + 1])) {
                                    i++;
                                    num += jsonStr[i];
                                }
                                result += '<span class="json-number">' + num + '</span>';
                            } else if (jsonStr.substring(i, i + 4) === 'true') {
                                result += '<span class="json-boolean">true</span>';
                                i += 3;
                            } else if (jsonStr.substring(i, i + 5) === 'false') {
                                result += '<span class="json-boolean">false</span>';
                                i += 4;
                            } else if (jsonStr.substring(i, i + 4) === 'null') {
                                result += '<span class="json-null">null</span>';
                                i += 3;
                            } else {
                                result += char;
                            }
                            i++;
                        }

                        return result;
                    }

                    // XML Syntax Highlighter - returns HTML with span elements for highlighting
                    function highlightXml(xmlStr) {
                        // Escape HTML entities first, but we'll unescape for display
                        const escapeHtml = (str) => str
                            .replace(/&/g, '&amp;')
                            .replace(/</g, '&lt;')
                            .replace(/>/g, '&gt;')
                            .replace(/"/g, '&quot;');

                        let result = '';
                        let i = 0;

                        while (i < xmlStr.length) {
                            // Check for comments
                            if (xmlStr.substring(i, i + 4) === '<!--') {
                                let endComment = xmlStr.indexOf('-->', i);
                                if (endComment === -1) endComment = xmlStr.length;
                                const comment = xmlStr.substring(i, endComment + 3);
                                result += '<span class="xml-comment">' + escapeHtml(comment) + '</span>';
                                i = endComment + 3;
                                continue;
                            }

                            // Check for XML declaration
                            if (xmlStr.substring(i, i + 2) === '<?') {
                                let endDecl = xmlStr.indexOf('?>', i);
                                if (endDecl === -1) endDecl = xmlStr.length;
                                const decl = xmlStr.substring(i, endDecl + 2);
                                result += '<span class="xml-declaration">' + escapeHtml(decl) + '</span>';
                                i = endDecl + 2;
                                continue;
                            }

                            // Check for tags
                            if (xmlStr[i] === '<') {
                                let j = i + 1;
                                let isClosingTag = xmlStr[j] === '/';
                                if (isClosingTag) j++;

                                // Get tag name
                                let tagName = '';
                                while (j < xmlStr.length && /[a-zA-Z0-9_:\\-]/.test(xmlStr[j])) {
                                    tagName += xmlStr[j];
                                    j++;
                                }

                                result += '&lt;';
                                if (isClosingTag) result += '/';
                                result += '<span class="xml-tag">' + escapeHtml(tagName) + '</span>';

                                // Parse attributes
                                while (j < xmlStr.length && xmlStr[j] !== '>' && xmlStr[j] !== '/') {
                                    if (/\\s/.test(xmlStr[j])) {
                                        result += xmlStr[j];
                                        j++;
                                        continue;
                                    }

                                    // Get attribute name
                                    let attrName = '';
                                    while (j < xmlStr.length && /[a-zA-Z0-9_:\\-]/.test(xmlStr[j])) {
                                        attrName += xmlStr[j];
                                        j++;
                                    }

                                    if (attrName) {
                                        result += '<span class="xml-attr-name">' + escapeHtml(attrName) + '</span>';
                                    }

                                    // Skip whitespace and =
                                    while (j < xmlStr.length && (xmlStr[j] === '=' || /\\s/.test(xmlStr[j]))) {
                                        result += xmlStr[j];
                                        j++;
                                    }

                                    // Get attribute value
                                    if (xmlStr[j] === '"' || xmlStr[j] === "'") {
                                        const quote = xmlStr[j];
                                        let attrValue = quote;
                                        j++;
                                        while (j < xmlStr.length && xmlStr[j] !== quote) {
                                            attrValue += xmlStr[j];
                                            j++;
                                        }
                                        if (j < xmlStr.length) {
                                            attrValue += xmlStr[j];
                                            j++;
                                        }
                                        result += '<span class="xml-attr-value">' + escapeHtml(attrValue) + '</span>';
                                    }
                                }

                                // Handle self-closing or end of tag
                                if (xmlStr[j] === '/') {
                                    result += '/';
                                    j++;
                                }
                                if (xmlStr[j] === '>') {
                                    result += '&gt;';
                                    j++;
                                }

                                i = j;
                                continue;
                            }

                            // Regular content
                            let content = '';
                            while (i < xmlStr.length && xmlStr[i] !== '<') {
                                content += xmlStr[i];
                                i++;
                            }
                            if (content.trim()) {
                                result += '<span class="xml-content">' + escapeHtml(content) + '</span>';
                            } else {
                                result += content;
                            }
                        }

                        return result;
                    }

                    function selectTab(tabName) {
                        // Hide all tab contents
                        document.querySelectorAll('.tab-content').forEach(content => {
                            content.classList.remove('active');
                        });

                        // Deactivate all tabs
                        document.querySelectorAll('.tab').forEach(tab => {
                            tab.classList.remove('active');
                        });

                        // Activate selected tab and content
                        document.getElementById(tabName + 'Tab').classList.add('active');
                        document.querySelector('.tab[data-tab="' + tabName + '"]').classList.add('active');
                    }
                })();
            </script>
        </body>
        </html>`;
    }

    /**
     * Get error content for the webview
     */
    private getErrorContent(errorMessage: string): string {
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Error</title>
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    padding: 20px;
                    color: var(--vscode-foreground);
                }
                .error {
                    color: var(--vscode-errorForeground);
                    margin: 20px 0;
                    padding: 10px;
                    border: 1px solid var(--vscode-errorForeground);
                }
                button {
                    padding: 8px 16px;
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    cursor: pointer;
                }
            </style>
        </head>
        <body>
            <h1>Error Loading Messages</h1>
            <div class="error">${errorMessage}</div>
            <button id="retryBtn">Retry</button>

            <script>
                (function() {
                    const vscode = acquireVsCodeApi();

                    document.getElementById('retryBtn').addEventListener('click', () => {
                        vscode.postMessage({
                            command: 'refresh'
                        });
                    });
                })();
            </script>
        </body>
        </html>`;
    }

    /**
     * Truncate a string to a maximum length
     */
    private truncate(str: string, maxLength: number): string {
        if (str.length <= maxLength) {
            return str;
        }

        return str.substring(0, maxLength) + '...';
    }

    /**
     * Serialize a message for sending to the webview
     */
    private serializeMessage(message: Message): any {
        return {
            id: message.id,
            correlationId: message.correlationId,
            timestamp: message.timestamp instanceof Date && !isNaN(message.timestamp.getTime()) ? message.timestamp.toISOString() : null,
            payload: typeof message.payload === 'string' ? message.payload : message.payload.toString('utf8'),
            properties: message.properties
        };
    }

    /**
     * Delete a message from the queue
     */
    private async deleteMessage(messageIndex: number): Promise<void> {
        if (messageIndex < 0 || messageIndex >= this.messages.length) {
            return;
        }

        const message = this.messages[messageIndex];

        // Confirm deletion
        const result = await vscode.window.showWarningMessage(
            `Are you sure you want to delete this message from queue "${this.queueName}"?`,
            { modal: true },
            'Delete',
            'Cancel'
        );

        if (result !== 'Delete') {
            return;
        }

        try {
            const provider = this.connectionManager.getProvider(this.profileId);

            if (!provider) {
                throw new Error('Provider not found');
            }

            // Delete the message
            await provider.deleteMessage(this.queueName, message.id);

            vscode.window.showInformationMessage(`Message deleted from queue: ${this.queueName}`);

            // Emit queue updated event to trigger UI refresh
            this.connectionManager.emit('queueUpdated', this.queueName);

            // Refresh the tree view to update queue depth
            vscode.commands.executeCommand('mqexplorer.refreshTreeView');

            // Refresh the message list immediately
            await this.refreshMessageList();
        } catch (error) {
            vscode.window.showErrorMessage(`Error deleting message: ${(error as Error).message}`);
        }
    }

    /**
     * Delete multiple messages from the queue
     */
    private async deleteSelectedMessages(messageIndices: number[]): Promise<void> {
        if (messageIndices.length === 0) {
            return;
        }

        // Confirm deletion
        const result = await vscode.window.showWarningMessage(
            `Are you sure you want to delete ${messageIndices.length} messages from queue "${this.queueName}"?`,
            { modal: true },
            'Delete',
            'Cancel'
        );

        if (result !== 'Delete') {
            return;
        }

        try {
            const provider = this.connectionManager.getProvider(this.profileId);

            if (!provider) {
                throw new Error('Provider not found');
            }

            // Get message IDs
            const messageIds = messageIndices.map(index => this.messages[index].id);

            // Delete the messages
            await provider.deleteMessages(this.queueName, messageIds);

            vscode.window.showInformationMessage(`${messageIds.length} messages deleted from queue: ${this.queueName}`);

            // Emit queue updated event to trigger UI refresh
            this.connectionManager.emit('queueUpdated', this.queueName);

            // Refresh the tree view to update queue depth
            vscode.commands.executeCommand('mqexplorer.refreshTreeView');

            // Refresh the message list immediately
            await this.refreshMessageList();
        } catch (error) {
            vscode.window.showErrorMessage(`Error deleting messages: ${(error as Error).message}`);
        }
    }
}
