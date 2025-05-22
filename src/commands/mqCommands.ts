import * as vscode from 'vscode';
import { ConnectionManager } from '../services/connectionManager';
import { ConnectionProfileWebview } from '../views/connectionProfileWebview';
import { MessageBrowserWebview } from '../views/messageBrowserWebview';
import { MessagePutWebview } from '../views/messagePutWebview';
import { MQExplorerTreeDataProvider, MQTreeItem, MQTreeItemType } from '../views/mqExplorerTreeDataProvider';
import { ConnectionProfile } from '../models/connectionProfile';

/**
 * Register all MQ Explorer commands
 */
export function registerCommands(context: vscode.ExtensionContext, treeDataProvider: MQExplorerTreeDataProvider): void {
    const connectionManager = ConnectionManager.getInstance(context);

    // Register commands

    // Connection profile commands
    context.subscriptions.push(
        vscode.commands.registerCommand('mqexplorer.addConnectionProfile', async () => {
            // Show a quick pick to select the provider type
            const providerTypes = [
                { label: 'IBM MQ', value: 'ibmmq' },
                { label: 'RabbitMQ', value: 'rabbitmq' },
                { label: 'Kafka', value: 'kafka' },
                { label: 'ActiveMQ', value: 'activemq' },
                { label: 'Azure Service Bus', value: 'azureservicebus' },
                { label: 'AWS SQS', value: 'awssqs' }
            ];

            const selectedProvider = await vscode.window.showQuickPick(providerTypes, {
                placeHolder: 'Select provider type'
            });

            if (selectedProvider) {
                const webview = new ConnectionProfileWebview(context);
                webview.show(undefined, selectedProvider.value);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('mqexplorer.editConnectionProfile', (item: MQTreeItem) => {
            if (!item.profileId) {
                vscode.window.showErrorMessage('No profile selected');
                return;
            }

            connectionManager.getConnectionProfiles().then(profiles => {
                const profile = profiles.find(p => p.id === item.profileId);

                if (!profile) {
                    vscode.window.showErrorMessage('Profile not found');
                    return;
                }

                const webview = new ConnectionProfileWebview(context);
                webview.show(profile);
            });
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('mqexplorer.deleteConnectionProfile', async (item: MQTreeItem) => {
            if (!item.profileId) {
                vscode.window.showErrorMessage('No profile selected');
                return;
            }

            const profiles = await connectionManager.getConnectionProfiles();
            const profile = profiles.find(p => p.id === item.profileId);

            if (!profile) {
                vscode.window.showErrorMessage('Profile not found');
                return;
            }

            const result = await vscode.window.showWarningMessage(
                `Are you sure you want to delete the connection profile "${profile.name}"?`,
                { modal: true },
                'Delete',
                'Cancel'
            );

            if (result === 'Delete') {
                await connectionManager.deleteConnectionProfile(item.profileId);
                treeDataProvider.refresh();
            }
        })
    );

    // Connection commands
    context.subscriptions.push(
        vscode.commands.registerCommand('mqexplorer.connect', async (item: MQTreeItem) => {
            if (!item.profileId) {
                vscode.window.showErrorMessage('No profile selected');
                return;
            }

            try {
                await connectionManager.connect(item.profileId);
                treeDataProvider.refresh();
            } catch (error) {
                vscode.window.showErrorMessage(`Connection error: ${(error as Error).message}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('mqexplorer.disconnect', async (item: MQTreeItem) => {
            if (!item.profileId) {
                vscode.window.showErrorMessage('No profile selected');
                return;
            }

            try {
                await connectionManager.disconnect(item.profileId);
                treeDataProvider.refresh();
            } catch (error) {
                vscode.window.showErrorMessage(`Disconnection error: ${(error as Error).message}`);
            }
        })
    );

    // Queue commands
    context.subscriptions.push(
        vscode.commands.registerCommand('mqexplorer.refreshQueues', (item: MQTreeItem) => {
            treeDataProvider.refresh();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('mqexplorer.browseMessages', (item: MQTreeItem) => {
            if (!item.profileId || !item.queueName) {
                vscode.window.showErrorMessage('No queue selected');
                return;
            }

            const browser = new MessageBrowserWebview(context);
            browser.show(item.profileId, item.queueName);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('mqexplorer.putMessage', (item: MQTreeItem) => {
            if (!item.profileId || !item.queueName) {
                vscode.window.showErrorMessage('No queue selected');
                return;
            }

            const putWebview = new MessagePutWebview(context);
            putWebview.show(item.profileId, item.queueName);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('mqexplorer.clearQueue', async (item: MQTreeItem) => {
            if (!item.profileId || !item.queueName) {
                vscode.window.showErrorMessage('No queue selected');
                return;
            }

            const result = await vscode.window.showWarningMessage(
                `Are you sure you want to clear all messages from queue "${item.queueName}"?`,
                { modal: true },
                'Clear',
                'Cancel'
            );

            if (result === 'Clear') {
                try {
                    const provider = connectionManager.getProvider(item.profileId);

                    if (!provider) {
                        throw new Error('Provider not found');
                    }

                    await provider.clearQueue(item.queueName);

                    vscode.window.showInformationMessage(`Queue ${item.queueName} cleared`);

                    // Refresh the tree view
                    treeDataProvider.refresh();
                } catch (error) {
                    vscode.window.showErrorMessage(`Error clearing queue: ${(error as Error).message}`);
                }
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('mqexplorer.viewQueueProperties', async (item: MQTreeItem) => {
            if (!item.profileId || !item.queueName) {
                vscode.window.showErrorMessage('No queue selected');
                return;
            }

            try {
                const provider = connectionManager.getProvider(item.profileId);

                if (!provider) {
                    throw new Error('Provider not found');
                }

                const properties = await provider.getQueueProperties(item.queueName);

                // Create a simple webview to display properties
                const panel = vscode.window.createWebviewPanel(
                    'mqexplorerQueueProperties',
                    `Queue Properties: ${item.queueName}`,
                    vscode.ViewColumn.One,
                    { enableScripts: true }
                );

                // Generate HTML for properties
                let propertiesHtml = '';

                for (const [key, value] of Object.entries(properties)) {
                    propertiesHtml += `
                        <tr>
                            <td>${key}</td>
                            <td>${value}</td>
                        </tr>
                    `;
                }

                panel.webview.html = `
                    <!DOCTYPE html>
                    <html lang="en">
                    <head>
                        <meta charset="UTF-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <title>Queue Properties: ${item.queueName}</title>
                        <style>
                            body {
                                font-family: var(--vscode-font-family);
                                padding: 20px;
                                color: var(--vscode-foreground);
                            }
                            table {
                                width: 100%;
                                border-collapse: collapse;
                            }
                            th, td {
                                padding: 8px;
                                text-align: left;
                                border-bottom: 1px solid var(--vscode-panel-border);
                            }
                            th {
                                font-weight: bold;
                            }
                        </style>
                    </head>
                    <body>
                        <h1>Queue Properties: ${item.queueName}</h1>
                        <table>
                            <tr>
                                <th>Property</th>
                                <th>Value</th>
                            </tr>
                            ${propertiesHtml}
                        </table>
                    </body>
                    </html>
                `;
            } catch (error) {
                vscode.window.showErrorMessage(`Error getting queue properties: ${(error as Error).message}`);
            }
        })
    );

    // Topic commands
    context.subscriptions.push(
        vscode.commands.registerCommand('mqexplorer.refreshTopics', (item: MQTreeItem) => {
            treeDataProvider.refresh();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('mqexplorer.viewTopicProperties', async (item: MQTreeItem) => {
            if (!item.profileId || !item.queueName) {
                vscode.window.showErrorMessage('No topic selected');
                return;
            }

            try {
                const provider = connectionManager.getProvider(item.profileId);

                if (!provider) {
                    throw new Error('Provider not found');
                }

                // Check if the provider supports topic properties
                if (!provider.getTopicProperties) {
                    throw new Error('Topic properties not supported by this provider');
                }

                const properties = await provider.getTopicProperties(item.label);

                // Create a simple webview to display properties
                const panel = vscode.window.createWebviewPanel(
                    'mqexplorerTopicProperties',
                    `Topic Properties: ${item.label}`,
                    vscode.ViewColumn.One,
                    { enableScripts: true }
                );

                // Generate HTML for properties
                let propertiesHtml = '';

                for (const [key, value] of Object.entries(properties)) {
                    propertiesHtml += `
                        <tr>
                            <td>${key}</td>
                            <td>${value}</td>
                        </tr>
                    `;
                }

                panel.webview.html = `
                    <!DOCTYPE html>
                    <html lang="en">
                    <head>
                        <meta charset="UTF-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <title>Topic Properties: ${item.label}</title>
                        <style>
                            body {
                                font-family: var(--vscode-font-family);
                                padding: 20px;
                                color: var(--vscode-foreground);
                            }
                            table {
                                width: 100%;
                                border-collapse: collapse;
                            }
                            th, td {
                                padding: 8px;
                                text-align: left;
                                border-bottom: 1px solid var(--vscode-panel-border);
                            }
                            th {
                                font-weight: bold;
                            }
                        </style>
                    </head>
                    <body>
                        <h1>Topic Properties: ${item.label}</h1>
                        <table>
                            <tr>
                                <th>Property</th>
                                <th>Value</th>
                            </tr>
                            ${propertiesHtml}
                        </table>
                    </body>
                    </html>
                `;
            } catch (error) {
                vscode.window.showErrorMessage(`Error getting topic properties: ${(error as Error).message}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('mqexplorer.publishMessage', async (item: MQTreeItem) => {
            if (!item.profileId || !item.queueName) {
                vscode.window.showErrorMessage('No topic selected');
                return;
            }

            try {
                const provider = connectionManager.getProvider(item.profileId);

                if (!provider) {
                    throw new Error('Provider not found');
                }

                // Check if the provider supports publishing
                if (!provider.publishMessage) {
                    throw new Error('Publishing to topics not supported by this provider');
                }

                // Get the message payload from the user
                const payload = await vscode.window.showInputBox({
                    prompt: 'Enter message payload',
                    placeHolder: 'Message payload'
                });

                if (payload === undefined) {
                    return; // User cancelled
                }

                // Publish the message
                await provider.publishMessage(item.queueName, payload);

                vscode.window.showInformationMessage(`Message published to topic: ${item.label}`);
            } catch (error) {
                vscode.window.showErrorMessage(`Error publishing message: ${(error as Error).message}`);
            }
        })
    );

    // Channel commands
    context.subscriptions.push(
        vscode.commands.registerCommand('mqexplorer.refreshChannels', (item: MQTreeItem) => {
            treeDataProvider.refresh();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('mqexplorer.viewChannelProperties', async (item: MQTreeItem) => {
            if (!item.profileId || !item.queueName) {
                vscode.window.showErrorMessage('No channel selected');
                return;
            }

            try {
                const provider = connectionManager.getProvider(item.profileId);

                if (!provider) {
                    throw new Error('Provider not found');
                }

                // Check if the provider supports channel properties
                if (!provider.getChannelProperties) {
                    throw new Error('Channel properties not supported by this provider');
                }

                const properties = await provider.getChannelProperties(item.queueName);

                // Create a simple webview to display properties
                const panel = vscode.window.createWebviewPanel(
                    'mqexplorerChannelProperties',
                    `Channel Properties: ${item.label}`,
                    vscode.ViewColumn.One,
                    { enableScripts: true }
                );

                // Generate HTML for properties
                let propertiesHtml = '';

                for (const [key, value] of Object.entries(properties)) {
                    propertiesHtml += `
                        <tr>
                            <td>${key}</td>
                            <td>${value}</td>
                        </tr>
                    `;
                }

                panel.webview.html = `
                    <!DOCTYPE html>
                    <html lang="en">
                    <head>
                        <meta charset="UTF-8">
                        <meta name="viewport" content="width=device-width, initial-scale=1.0">
                        <title>Channel Properties: ${item.label}</title>
                        <style>
                            body {
                                font-family: var(--vscode-font-family);
                                padding: 20px;
                                color: var(--vscode-foreground);
                            }
                            table {
                                width: 100%;
                                border-collapse: collapse;
                            }
                            th, td {
                                padding: 8px;
                                text-align: left;
                                border-bottom: 1px solid var(--vscode-panel-border);
                            }
                            th {
                                font-weight: bold;
                            }
                        </style>
                    </head>
                    <body>
                        <h1>Channel Properties: ${item.label}</h1>
                        <table>
                            <tr>
                                <th>Property</th>
                                <th>Value</th>
                            </tr>
                            ${propertiesHtml}
                        </table>
                    </body>
                    </html>
                `;
            } catch (error) {
                vscode.window.showErrorMessage(`Error getting channel properties: ${(error as Error).message}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('mqexplorer.startChannel', async (item: MQTreeItem) => {
            if (!item.profileId || !item.queueName) {
                vscode.window.showErrorMessage('No channel selected');
                return;
            }

            try {
                const provider = connectionManager.getProvider(item.profileId);

                if (!provider) {
                    throw new Error('Provider not found');
                }

                // Check if the provider supports starting channels
                if (!provider.startChannel) {
                    throw new Error('Starting channels not supported by this provider');
                }

                // Confirm with the user
                const result = await vscode.window.showWarningMessage(
                    `Are you sure you want to start channel "${item.label}"?`,
                    { modal: true },
                    'Start',
                    'Cancel'
                );

                if (result !== 'Start') {
                    return;
                }

                // Start the channel
                await provider.startChannel(item.queueName);

                vscode.window.showInformationMessage(`Channel ${item.label} started successfully`);

                // Refresh the tree view
                treeDataProvider.refresh();
            } catch (error) {
                vscode.window.showErrorMessage(`Error starting channel: ${(error as Error).message}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('mqexplorer.stopChannel', async (item: MQTreeItem) => {
            if (!item.profileId || !item.queueName) {
                vscode.window.showErrorMessage('No channel selected');
                return;
            }

            try {
                const provider = connectionManager.getProvider(item.profileId);

                if (!provider) {
                    throw new Error('Provider not found');
                }

                // Check if the provider supports stopping channels
                if (!provider.stopChannel) {
                    throw new Error('Stopping channels not supported by this provider');
                }

                // Confirm with the user
                const result = await vscode.window.showWarningMessage(
                    `Are you sure you want to stop channel "${item.label}"?`,
                    { modal: true },
                    'Stop',
                    'Cancel'
                );

                if (result !== 'Stop') {
                    return;
                }

                // Stop the channel
                await provider.stopChannel(item.queueName);

                vscode.window.showInformationMessage(`Channel ${item.label} stopped successfully`);

                // Refresh the tree view
                treeDataProvider.refresh();
            } catch (error) {
                vscode.window.showErrorMessage(`Error stopping channel: ${(error as Error).message}`);
            }
        })
    );

    // General commands
    context.subscriptions.push(
        vscode.commands.registerCommand('mqexplorer.refreshTreeView', () => {
            treeDataProvider.refresh();
        })
    );

    // Search/Filter commands
    context.subscriptions.push(
        vscode.commands.registerCommand('mqexplorer.searchFilter', async () => {
            const currentFilter = treeDataProvider.getFilter();

            const filter = await vscode.window.showInputBox({
                prompt: 'Enter search filter',
                placeHolder: 'Filter by name, type, etc.',
                value: currentFilter
            });

            if (filter !== undefined) {
                if (filter) {
                    treeDataProvider.setFilter(filter);
                    vscode.window.showInformationMessage(`Filter applied: "${filter}"`);
                } else {
                    treeDataProvider.clearFilter();
                    vscode.window.showInformationMessage('Filter cleared');
                }
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('mqexplorer.clearFilter', () => {
            treeDataProvider.clearFilter();
            vscode.window.showInformationMessage('Filter cleared');
        })
    );

    // Import/Export commands
    context.subscriptions.push(
        vscode.commands.registerCommand('mqexplorer.exportConnectionProfiles', async () => {
            try {
                // Get the connection manager
                const connectionManager = ConnectionManager.getInstance(context);

                // Ask if passwords should be included
                const includePasswords = await vscode.window.showQuickPick(
                    [
                        { label: 'No', description: 'Export without passwords (recommended)', value: false },
                        { label: 'Yes', description: 'Export with passwords (security risk)', value: true }
                    ],
                    { placeHolder: 'Include passwords in export?' }
                );

                if (!includePasswords) {
                    return; // User cancelled
                }

                // Export profiles
                const json = await connectionManager.exportConnectionProfiles(includePasswords.value as boolean);

                // Show save dialog
                const uri = await vscode.window.showSaveDialog({
                    defaultUri: vscode.Uri.file('mqexplorer-profiles.json'),
                    filters: {
                        'JSON files': ['json'],
                        'All files': ['*']
                    },
                    title: 'Export Connection Profiles'
                });

                if (!uri) {
                    return; // User cancelled
                }

                // Write to file
                await vscode.workspace.fs.writeFile(uri, Buffer.from(json, 'utf8'));

                vscode.window.showInformationMessage(`Connection profiles exported to ${uri.fsPath}`);
            } catch (error) {
                vscode.window.showErrorMessage(`Error exporting connection profiles: ${(error as Error).message}`);
            }
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('mqexplorer.importConnectionProfiles', async () => {
            try {
                // Show open dialog
                const uri = await vscode.window.showOpenDialog({
                    canSelectFiles: true,
                    canSelectFolders: false,
                    canSelectMany: false,
                    filters: {
                        'JSON files': ['json'],
                        'All files': ['*']
                    },
                    title: 'Import Connection Profiles'
                });

                if (!uri || uri.length === 0) {
                    return; // User cancelled
                }

                // Read file
                const buffer = await vscode.workspace.fs.readFile(uri[0]);
                const json = new TextDecoder().decode(buffer);

                // Get the connection manager
                const connectionManager = ConnectionManager.getInstance(context);

                // Import profiles
                const count = await connectionManager.importConnectionProfiles(json);

                vscode.window.showInformationMessage(`Imported ${count} connection profiles`);

                // Refresh the tree view
                treeDataProvider.refresh();
            } catch (error) {
                vscode.window.showErrorMessage(`Error importing connection profiles: ${(error as Error).message}`);
            }
        })
    );
}
