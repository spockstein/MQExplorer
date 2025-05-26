// The module 'vscode' contains the VS Code extensibility API
import * as vscode from 'vscode';
import { MQExplorerTreeDataProvider } from './views/mqExplorerTreeDataProvider';
import { registerCommands } from './commands/mqCommands';
import { ConnectionManager } from './services/connectionManager';
import { ConnectionProfileWebview } from './views/connectionProfileWebview';
import { testBrowseMessages } from './test/browseMessagesTest';
import { testMQFunctionality } from './test/mqFunctionalityTest';
import { testMQOperations } from './test/mqOperationsTest';
import { testQueueDepth } from './test/queueDepthTest';
import { testRabbitMQOperations } from './test/rabbitmqOperationsTest';
import { testKafkaOperations } from './test/kafkaOperationsTest';
import { testActiveMQOperations } from './test/activemqOperationsTest';
import { testAzureServiceBusOperations } from './test/azureServiceBusOperationsTest';
import { testAWSSQSOperations } from './test/awsSQSOperationsTest';
import { testPutMessage } from './test/putMessageTest';

// This method is called when your extension is activated
export function activate(context: vscode.ExtensionContext) {
	console.log('MQExplorer extension is now active!');

	// Register the critical command first - directly in the activate function
	const addConnectionProfileCommand = vscode.commands.registerCommand('mqexplorer.addConnectionProfile', async () => {
		try {
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
		} catch (error) {
			vscode.window.showErrorMessage(`Error in addConnectionProfile command: ${(error as Error).message}`);
			console.error('Error in addConnectionProfile command:', error);
		}
	});

	// Add the command to context subscriptions immediately
	context.subscriptions.push(addConnectionProfileCommand);

	// Initialize the connection manager
	const connectionManager = ConnectionManager.getInstance(context);

	// Create the tree data provider
	const treeDataProvider = new MQExplorerTreeDataProvider(context);

	// Register the tree data provider
	const treeView = vscode.window.createTreeView('mqexplorer', {
		treeDataProvider,
		showCollapseAll: true
	});

	// Register the rest of the commands
	registerCommands(context, treeDataProvider);

	// Register the tree view
	context.subscriptions.push(treeView);

	// Add activity bar icon and view container
	// Note: This is actually defined in package.json, but we're setting it up here for clarity

	// Register the hello world command (will be removed in the final version)
	const helloDisposable = vscode.commands.registerCommand('mqexplorer.helloWorld', () => {
		vscode.window.showInformationMessage('Hello from MQExplorer!');
	});

	// Register the test command for browsing messages
	const { testBrowseMessages } = require('./test/browseMessageTest');
	const testBrowseDisposable = vscode.commands.registerCommand('mqexplorer.testBrowseMessages', async () => {
		vscode.window.showInformationMessage('Starting message browsing test...');
		await testBrowseMessages();
		vscode.window.showInformationMessage('Message browsing test completed. Check the output panel for results.');
	});

	// Register the debug browse test command
	const { debugBrowseTest } = require('./test/debugBrowseTest');
	const debugBrowseDisposable = vscode.commands.registerCommand('mqexplorer.debugBrowseTest', async () => {
		vscode.window.showInformationMessage('Starting debug browse test...');
		await debugBrowseTest();
		vscode.window.showInformationMessage('Debug browse test completed. Check the output panel for results.');
	});

	// Register the test command for MQ functionality
	const testMQDisposable = vscode.commands.registerCommand('mqexplorer.testMQFunctionality', async () => {
		vscode.window.showInformationMessage('Starting MQ functionality test...');
		await testMQFunctionality();
		vscode.window.showInformationMessage('MQ functionality test completed. Check the output panel for results.');
	});

	// Register the test command for MQ operations (put and delete)
	const testMQOperationsDisposable = vscode.commands.registerCommand('mqexplorer.testMQOperations', async () => {
		vscode.window.showInformationMessage('Starting MQ operations test...');
		await testMQOperations(context);
		vscode.window.showInformationMessage('MQ operations test completed. Check the output panel for results.');
	});

	// Register the test command for queue depth
	const testQueueDepthDisposable = vscode.commands.registerCommand('mqexplorer.testQueueDepth', async () => {
		vscode.window.showInformationMessage('Starting queue depth test...');
		await testQueueDepth(context);
		vscode.window.showInformationMessage('Queue depth test completed. Check the output panel for results.');
	});

	// Register the test command for RabbitMQ operations
	const testRabbitMQOperationsDisposable = vscode.commands.registerCommand('mqexplorer.testRabbitMQOperations', async () => {
		vscode.window.showInformationMessage('Starting RabbitMQ operations test...');
		await testRabbitMQOperations(context);
		vscode.window.showInformationMessage('RabbitMQ operations test completed. Check the output panel for results.');
	});

	// Register the test command for Kafka operations
	const testKafkaOperationsDisposable = vscode.commands.registerCommand('mqexplorer.testKafkaOperations', async () => {
		vscode.window.showInformationMessage('Starting Kafka operations test...');
		await testKafkaOperations(context);
		vscode.window.showInformationMessage('Kafka operations test completed. Check the output panel for results.');
	});

	// Register the test command for ActiveMQ operations
	const testActiveMQOperationsDisposable = vscode.commands.registerCommand('mqexplorer.testActiveMQOperations', async () => {
		vscode.window.showInformationMessage('Starting ActiveMQ operations test...');
		await testActiveMQOperations(context);
		vscode.window.showInformationMessage('ActiveMQ operations test completed. Check the output panel for results.');
	});

	// Register the test command for Azure Service Bus operations
	const testAzureServiceBusOperationsDisposable = vscode.commands.registerCommand('mqexplorer.testAzureServiceBusOperations', async () => {
		vscode.window.showInformationMessage('Starting Azure Service Bus operations test...');
		await testAzureServiceBusOperations(context);
		vscode.window.showInformationMessage('Azure Service Bus operations test completed. Check the output panel for results.');
	});

	// Register the test command for AWS SQS operations
	const testAWSSQSOperationsDisposable = vscode.commands.registerCommand('mqexplorer.testAWSSQSOperations', async () => {
		vscode.window.showInformationMessage('Starting AWS SQS operations test...');
		await testAWSSQSOperations(context);
		vscode.window.showInformationMessage('AWS SQS operations test completed. Check the output panel for results.');
	});

	// Register the test command for Put Message functionality
	const testPutMessageDisposable = vscode.commands.registerCommand('mqexplorer.testPutMessage', async () => {
		vscode.window.showInformationMessage('Starting Put Message test...');
		await testPutMessage();
		vscode.window.showInformationMessage('Put Message test completed. Check the output panel for results.');
	});

	// Register Command Palette integration
	const commandPaletteDisposable = vscode.commands.registerCommand('mqexplorer.openCommandPalette', async () => {
		// Show a quick pick with common MQExplorer commands
		const commands = [
			{ label: 'Add Connection Profile', command: 'mqexplorer.addConnectionProfile' },
			{ label: 'Search/Filter', command: 'mqexplorer.searchFilter' },
			{ label: 'Clear Filter', command: 'mqexplorer.clearFilter' },
			{ label: 'Refresh', command: 'mqexplorer.refreshTreeView' },
			{ label: 'Export Connection Profiles', command: 'mqexplorer.exportConnectionProfiles' },
			{ label: 'Import Connection Profiles', command: 'mqexplorer.importConnectionProfiles' }
		];

		const selectedCommand = await vscode.window.showQuickPick(commands, {
			placeHolder: 'Select MQExplorer command'
		});

		if (selectedCommand) {
			vscode.commands.executeCommand(selectedCommand.command);
		}
	});

	context.subscriptions.push(
		helloDisposable,
		testBrowseDisposable,
		debugBrowseDisposable,
		testMQDisposable,
		testMQOperationsDisposable,
		testQueueDepthDisposable,
		testRabbitMQOperationsDisposable,
		testKafkaOperationsDisposable,
		testActiveMQOperationsDisposable,
		testAzureServiceBusOperationsDisposable,
		testAWSSQSOperationsDisposable,
		testPutMessageDisposable,
		commandPaletteDisposable
	);
}

// This method is called when your extension is deactivated
export function deactivate() {
	// Clean up any resources
}
