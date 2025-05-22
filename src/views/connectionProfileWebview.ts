import * as vscode from 'vscode';
import { ConnectionManager } from '../services/connectionManager';
import { ConnectionProfile, IBMMQConnectionProfile, RabbitMQConnectionProfile, KafkaConnectionProfile, ActiveMQConnectionProfile, AzureServiceBusConnectionProfile, AWSSQSConnectionProfile } from '../models/connectionProfile';

/**
 * Manages the webview for connection profile management
 */
export class ConnectionProfileWebview {
    private panel: vscode.WebviewPanel | undefined;
    private context: vscode.ExtensionContext;
    private connectionManager: ConnectionManager;
    private editingProfile: ConnectionProfile | undefined;
    private defaultProviderType: string = 'ibmmq';

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.connectionManager = ConnectionManager.getInstance(context);
    }

    /**
     * Show the connection profile webview
     * @param profile Optional connection profile to edit
     * @param defaultProviderType Optional default provider type for new profiles
     */
    public show(profile?: ConnectionProfile, defaultProviderType: string = 'ibmmq'): void {
        this.editingProfile = profile;
        this.defaultProviderType = defaultProviderType;

        // If panel already exists, reveal it
        if (this.panel) {
            this.panel.reveal();
            this.updateWebviewContent();
            return;
        }

        // Create a new panel
        this.panel = vscode.window.createWebviewPanel(
            'mqexplorerConnectionProfile',
            profile ? `Edit Connection: ${profile.name}` : 'New Connection Profile',
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
                    case 'saveProfile':
                        await this.saveProfile(message.profile);
                        break;
                    case 'testConnection':
                        await this.testConnection(message.profile);
                        break;
                    case 'cancel':
                        this.panel?.dispose();
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

        this.panel.webview.html = this.getWebviewContent();
    }

    /**
     * Get default connection parameters for a provider type
     * @param providerType The provider type
     * @returns Default connection parameters for the provider type
     */
    private getDefaultConnectionParams(providerType: string): any {
        switch (providerType) {
            case 'ibmmq':
                return {
                    queueManager: '',
                    host: '',
                    port: 1414,
                    channel: 'SYSTEM.DEF.SVRCONN',
                    username: '',
                    useTLS: false
                };
            case 'rabbitmq':
                return {
                    host: '',
                    port: 5672,
                    vhost: '/',
                    username: 'guest',
                    password: 'guest',
                    useTLS: false
                };
            case 'kafka':
                return {
                    brokers: ['localhost:9092'],
                    clientId: 'mqexplorer',
                    ssl: false,
                    connectionTimeout: 30000,
                    authenticationTimeout: 10000
                };
            case 'activemq':
                return {
                    host: 'localhost',
                    port: 61613,
                    ssl: false,
                    connectTimeout: 10000,
                    reconnectOpts: {
                        maxReconnects: 10,
                        initialReconnectDelay: 1000,
                        maxReconnectDelay: 30000,
                        useExponentialBackOff: true,
                        maxReconnectAttempts: 10
                    }
                };
            case 'azureservicebus':
                return {
                    connectionString: '',
                    useAadAuth: false,
                    entityPath: '',
                    retryOptions: {
                        maxRetries: 3,
                        retryDelayInMs: 1000,
                        maxRetryDelayInMs: 30000
                    }
                };
            case 'awssqs':
                return {
                    region: 'us-east-1',
                    useProfileCredentials: false,
                    maxRetries: 3,
                    retryMode: 'standard'
                };
            default:
                return {};
        }
    }

    /**
     * Get the HTML content for the webview
     */
    private getWebviewContent(): string {
        const isEditing = !!this.editingProfile;
        const profile = this.editingProfile || {
            id: '',
            name: '',
            providerType: this.defaultProviderType,
            connectionParams: this.getDefaultConnectionParams(this.defaultProviderType)
        };

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${isEditing ? 'Edit' : 'New'} Connection Profile</title>
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
                input, select {
                    width: 100%;
                    padding: 8px;
                    box-sizing: border-box;
                    background-color: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border: 1px solid var(--vscode-input-border);
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
                .checkbox-group {
                    display: flex;
                    align-items: center;
                }
                .checkbox-group input {
                    width: auto;
                    margin-right: 10px;
                }
                .actions {
                    margin-top: 20px;
                    display: flex;
                }
                .provider-specific {
                    margin-top: 20px;
                    border-top: 1px solid var(--vscode-input-border);
                    padding-top: 20px;
                }
                h2 {
                    margin-top: 0;
                }
            </style>
        </head>
        <body>
            <h1>${isEditing ? 'Edit' : 'New'} Connection Profile</h1>

            <div class="form-group">
                <label for="name">Profile Name</label>
                <input type="text" id="name" value="${profile.name}" required>
            </div>

            <div class="form-group">
                <label for="providerType">Provider Type</label>
                <select id="providerType" disabled>
                    <option value="ibmmq" ${profile.providerType === 'ibmmq' ? 'selected' : ''}>IBM MQ</option>
                    <option value="rabbitmq" ${profile.providerType === 'rabbitmq' ? 'selected' : ''}>RabbitMQ</option>
                    <option value="kafka" ${profile.providerType === 'kafka' ? 'selected' : ''}>Kafka</option>
                    <option value="activemq" ${profile.providerType === 'activemq' ? 'selected' : ''}>ActiveMQ</option>
                    <option value="azureservicebus" ${profile.providerType === 'azureservicebus' ? 'selected' : ''}>Azure Service Bus</option>
                    <option value="awssqs" ${profile.providerType === 'awssqs' ? 'selected' : ''}>AWS SQS</option>
                </select>
            </div>

            <div id="ibmmqParams" class="provider-specific" style="display: ${profile.providerType === 'ibmmq' ? 'block' : 'none'}">
                <h2>IBM MQ Connection Parameters</h2>

                <div class="form-group">
                    <label for="queueManager">Queue Manager</label>
                    <input type="text" id="queueManager" value="${profile.providerType === 'ibmmq' ? (profile as IBMMQConnectionProfile).connectionParams.queueManager || '' : ''}" required>
                </div>

                <div class="form-group">
                    <label for="ibmmq_host">Host</label>
                    <input type="text" id="ibmmq_host" value="${profile.providerType === 'ibmmq' ? (profile as IBMMQConnectionProfile).connectionParams.host || '' : ''}" required>
                </div>

                <div class="form-group">
                    <label for="ibmmq_port">Port</label>
                    <input type="number" id="ibmmq_port" value="${profile.providerType === 'ibmmq' ? (profile as IBMMQConnectionProfile).connectionParams.port || 1414 : 1414}" required>
                </div>

                <div class="form-group">
                    <label for="channel">Channel</label>
                    <input type="text" id="channel" value="${profile.providerType === 'ibmmq' ? (profile as IBMMQConnectionProfile).connectionParams.channel || 'SYSTEM.DEF.SVRCONN' : 'SYSTEM.DEF.SVRCONN'}" required>
                </div>

                <div class="form-group">
                    <label for="ibmmq_username">Username (optional)</label>
                    <input type="text" id="ibmmq_username" value="${profile.providerType === 'ibmmq' ? (profile as IBMMQConnectionProfile).connectionParams.username || '' : ''}">
                </div>

                <div class="form-group">
                    <label for="ibmmq_password">Password (optional)</label>
                    <input type="password" id="ibmmq_password" placeholder="Enter password">
                </div>

                <div class="form-group checkbox-group">
                    <input type="checkbox" id="ibmmq_useTLS" ${profile.providerType === 'ibmmq' && (profile as IBMMQConnectionProfile).connectionParams.useTLS ? 'checked' : ''}>
                    <label for="ibmmq_useTLS">Use TLS</label>
                </div>
            </div>

            <div id="rabbitmqParams" class="provider-specific" style="display: ${profile.providerType === 'rabbitmq' ? 'block' : 'none'}">
                <h2>RabbitMQ Connection Parameters</h2>

                <div class="form-group">
                    <label for="rabbitmq_host">Host</label>
                    <input type="text" id="rabbitmq_host" value="${profile.providerType === 'rabbitmq' ? (profile as RabbitMQConnectionProfile).connectionParams.host || '' : ''}" required>
                </div>

                <div class="form-group">
                    <label for="rabbitmq_port">Port</label>
                    <input type="number" id="rabbitmq_port" value="${profile.providerType === 'rabbitmq' ? (profile as RabbitMQConnectionProfile).connectionParams.port || 5672 : 5672}" required>
                </div>

                <div class="form-group">
                    <label for="vhost">Virtual Host (optional)</label>
                    <input type="text" id="vhost" value="${profile.providerType === 'rabbitmq' ? (profile as RabbitMQConnectionProfile).connectionParams.vhost || '/' : '/'}">
                </div>

                <div class="form-group">
                    <label for="rabbitmq_username">Username (optional)</label>
                    <input type="text" id="rabbitmq_username" value="${profile.providerType === 'rabbitmq' ? (profile as RabbitMQConnectionProfile).connectionParams.username || 'guest' : 'guest'}">
                </div>

                <div class="form-group">
                    <label for="rabbitmq_password">Password (optional)</label>
                    <input type="password" id="rabbitmq_password" placeholder="Enter password" value="${profile.providerType === 'rabbitmq' ? '' : 'guest'}">
                </div>

                <div class="form-group checkbox-group">
                    <input type="checkbox" id="rabbitmq_useTLS" ${profile.providerType === 'rabbitmq' && (profile as RabbitMQConnectionProfile).connectionParams.useTLS ? 'checked' : ''}>
                    <label for="rabbitmq_useTLS">Use TLS</label>
                </div>
            </div>

            <div id="kafkaParams" class="provider-specific" style="display: ${profile.providerType === 'kafka' ? 'block' : 'none'}">
                <h2>Kafka Connection Parameters</h2>

                <div class="form-group">
                    <label for="kafka_brokers">Brokers (comma-separated list of host:port)</label>
                    <input type="text" id="kafka_brokers" value="${profile.providerType === 'kafka' ? (profile as KafkaConnectionProfile).connectionParams.brokers?.join(',') || 'localhost:9092' : 'localhost:9092'}" required>
                </div>

                <div class="form-group">
                    <label for="kafka_clientId">Client ID (optional)</label>
                    <input type="text" id="kafka_clientId" value="${profile.providerType === 'kafka' ? (profile as KafkaConnectionProfile).connectionParams.clientId || 'mqexplorer' : 'mqexplorer'}">
                </div>

                <div class="form-group checkbox-group">
                    <input type="checkbox" id="kafka_ssl" ${profile.providerType === 'kafka' && (profile as KafkaConnectionProfile).connectionParams.ssl ? 'checked' : ''}>
                    <label for="kafka_ssl">Use SSL/TLS</label>
                </div>

                <div class="form-group checkbox-group">
                    <input type="checkbox" id="kafka_sasl" ${profile.providerType === 'kafka' && (profile as KafkaConnectionProfile).connectionParams.sasl ? 'checked' : ''}>
                    <label for="kafka_sasl">Use SASL Authentication</label>
                </div>

                <div id="kafka_sasl_params" style="display: ${profile.providerType === 'kafka' && (profile as KafkaConnectionProfile).connectionParams.sasl ? 'block' : 'none'}">
                    <div class="form-group">
                        <label for="kafka_sasl_mechanism">SASL Mechanism</label>
                        <select id="kafka_sasl_mechanism">
                            <option value="plain" ${profile.providerType === 'kafka' && (profile as KafkaConnectionProfile).connectionParams.sasl?.mechanism === 'plain' ? 'selected' : ''}>PLAIN</option>
                            <option value="scram-sha-256" ${profile.providerType === 'kafka' && (profile as KafkaConnectionProfile).connectionParams.sasl?.mechanism === 'scram-sha-256' ? 'selected' : ''}>SCRAM-SHA-256</option>
                            <option value="scram-sha-512" ${profile.providerType === 'kafka' && (profile as KafkaConnectionProfile).connectionParams.sasl?.mechanism === 'scram-sha-512' ? 'selected' : ''}>SCRAM-SHA-512</option>
                        </select>
                    </div>

                    <div class="form-group">
                        <label for="kafka_sasl_username">Username</label>
                        <input type="text" id="kafka_sasl_username" value="${profile.providerType === 'kafka' && (profile as KafkaConnectionProfile).connectionParams.sasl ? (profile as KafkaConnectionProfile).connectionParams.sasl!.username || '' : ''}">
                    </div>

                    <div class="form-group">
                        <label for="kafka_sasl_password">Password</label>
                        <input type="password" id="kafka_sasl_password" placeholder="Enter password">
                    </div>
                </div>

                <div class="form-group">
                    <label for="kafka_connectionTimeout">Connection Timeout (ms)</label>
                    <input type="number" id="kafka_connectionTimeout" value="${profile.providerType === 'kafka' ? (profile as KafkaConnectionProfile).connectionParams.connectionTimeout || 30000 : 30000}">
                </div>

                <div class="form-group">
                    <label for="kafka_authenticationTimeout">Authentication Timeout (ms)</label>
                    <input type="number" id="kafka_authenticationTimeout" value="${profile.providerType === 'kafka' ? (profile as KafkaConnectionProfile).connectionParams.authenticationTimeout || 10000 : 10000}">
                </div>
            </div>

            <div id="activemqParams" class="provider-specific" style="display: ${profile.providerType === 'activemq' ? 'block' : 'none'}">
                <h2>ActiveMQ Connection Parameters</h2>

                <div class="form-group">
                    <label for="activemq_host">Host</label>
                    <input type="text" id="activemq_host" value="${profile.providerType === 'activemq' ? (profile as ActiveMQConnectionProfile).connectionParams.host || 'localhost' : 'localhost'}" required>
                </div>

                <div class="form-group">
                    <label for="activemq_port">Port</label>
                    <input type="number" id="activemq_port" value="${profile.providerType === 'activemq' ? (profile as ActiveMQConnectionProfile).connectionParams.port || 61613 : 61613}" required>
                </div>

                <div class="form-group checkbox-group">
                    <input type="checkbox" id="activemq_ssl" ${profile.providerType === 'activemq' && (profile as ActiveMQConnectionProfile).connectionParams.ssl ? 'checked' : ''}>
                    <label for="activemq_ssl">Use SSL/TLS</label>
                </div>

                <h3>Connect Headers</h3>

                <div class="form-group">
                    <label for="activemq_login">Login (optional)</label>
                    <input type="text" id="activemq_login" value="${profile.providerType === 'activemq' && (profile as ActiveMQConnectionProfile).connectionParams.connectHeaders ? (profile as ActiveMQConnectionProfile).connectionParams.connectHeaders!.login || '' : ''}">
                </div>

                <div class="form-group">
                    <label for="activemq_passcode">Passcode (optional)</label>
                    <input type="password" id="activemq_passcode" placeholder="Enter passcode">
                </div>

                <div class="form-group">
                    <label for="activemq_host_header">Host Header (optional)</label>
                    <input type="text" id="activemq_host_header" value="${profile.providerType === 'activemq' && (profile as ActiveMQConnectionProfile).connectionParams.connectHeaders ? (profile as ActiveMQConnectionProfile).connectionParams.connectHeaders!.host || '' : ''}">
                </div>

                <div class="form-group">
                    <label for="activemq_heart_beat">Heart Beat (optional, format: cx,cy)</label>
                    <input type="text" id="activemq_heart_beat" value="${profile.providerType === 'activemq' && (profile as ActiveMQConnectionProfile).connectionParams.connectHeaders ? (profile as ActiveMQConnectionProfile).connectionParams.connectHeaders!['heart-beat'] || '10000,10000' : '10000,10000'}">
                </div>

                <div class="form-group">
                    <label for="activemq_accept_version">Accept Version (optional)</label>
                    <input type="text" id="activemq_accept_version" value="${profile.providerType === 'activemq' && (profile as ActiveMQConnectionProfile).connectionParams.connectHeaders ? (profile as ActiveMQConnectionProfile).connectionParams.connectHeaders!['accept-version'] || '1.0,1.1,1.2' : '1.0,1.1,1.2'}">
                </div>

                <div class="form-group">
                    <label for="activemq_connect_timeout">Connection Timeout (ms)</label>
                    <input type="number" id="activemq_connect_timeout" value="${profile.providerType === 'activemq' ? (profile as ActiveMQConnectionProfile).connectionParams.connectTimeout || 10000 : 10000}">
                </div>

                <h3>Reconnect Options</h3>

                <div class="form-group">
                    <label for="activemq_max_reconnects">Max Reconnects</label>
                    <input type="number" id="activemq_max_reconnects" value="${profile.providerType === 'activemq' && (profile as ActiveMQConnectionProfile).connectionParams.reconnectOpts ? (profile as ActiveMQConnectionProfile).connectionParams.reconnectOpts!.maxReconnects || 10 : 10}">
                </div>

                <div class="form-group">
                    <label for="activemq_initial_reconnect_delay">Initial Reconnect Delay (ms)</label>
                    <input type="number" id="activemq_initial_reconnect_delay" value="${profile.providerType === 'activemq' && (profile as ActiveMQConnectionProfile).connectionParams.reconnectOpts ? (profile as ActiveMQConnectionProfile).connectionParams.reconnectOpts!.initialReconnectDelay || 1000 : 1000}">
                </div>

                <div class="form-group">
                    <label for="activemq_max_reconnect_delay">Max Reconnect Delay (ms)</label>
                    <input type="number" id="activemq_max_reconnect_delay" value="${profile.providerType === 'activemq' && (profile as ActiveMQConnectionProfile).connectionParams.reconnectOpts ? (profile as ActiveMQConnectionProfile).connectionParams.reconnectOpts!.maxReconnectDelay || 30000 : 30000}">
                </div>

                <div class="form-group checkbox-group">
                    <input type="checkbox" id="activemq_use_exponential_backoff" ${profile.providerType === 'activemq' && (profile as ActiveMQConnectionProfile).connectionParams.reconnectOpts?.useExponentialBackOff ? 'checked' : 'checked'}>
                    <label for="activemq_use_exponential_backoff">Use Exponential Backoff</label>
                </div>

                <div class="form-group">
                    <label for="activemq_max_reconnect_attempts">Max Reconnect Attempts</label>
                    <input type="number" id="activemq_max_reconnect_attempts" value="${profile.providerType === 'activemq' && (profile as ActiveMQConnectionProfile).connectionParams.reconnectOpts ? (profile as ActiveMQConnectionProfile).connectionParams.reconnectOpts!.maxReconnectAttempts || 10 : 10}">
                </div>
            </div>

            <div id="azureservicebusParams" class="provider-specific" style="display: ${profile.providerType === 'azureservicebus' ? 'block' : 'none'}">
                <h2>Azure Service Bus Connection Parameters</h2>

                <div class="form-group checkbox-group">
                    <input type="checkbox" id="azure_use_connection_string" ${profile.providerType === 'azureservicebus' && (profile as AzureServiceBusConnectionProfile).connectionParams.connectionString ? 'checked' : 'checked'}>
                    <label for="azure_use_connection_string">Use Connection String</label>
                </div>

                <div id="azure_connection_string_params" style="display: ${profile.providerType === 'azureservicebus' && (profile as AzureServiceBusConnectionProfile).connectionParams.connectionString ? 'block' : 'block'}">
                    <div class="form-group">
                        <label for="azure_connection_string">Connection String</label>
                        <input type="password" id="azure_connection_string" placeholder="Enter connection string" required>
                    </div>
                </div>

                <div class="form-group checkbox-group">
                    <input type="checkbox" id="azure_use_aad_auth" ${profile.providerType === 'azureservicebus' && (profile as AzureServiceBusConnectionProfile).connectionParams.useAadAuth ? 'checked' : ''}>
                    <label for="azure_use_aad_auth">Use Azure Active Directory Authentication</label>
                </div>

                <div id="azure_aad_params" style="display: ${profile.providerType === 'azureservicebus' && (profile as AzureServiceBusConnectionProfile).connectionParams.useAadAuth ? 'block' : 'none'}">
                    <div class="form-group">
                        <label for="azure_namespace">Fully Qualified Namespace</label>
                        <input type="text" id="azure_namespace" value="${profile.providerType === 'azureservicebus' ? (profile as AzureServiceBusConnectionProfile).connectionParams.fullyQualifiedNamespace || '' : ''}" placeholder="e.g., myservicebus.servicebus.windows.net">
                    </div>

                    <div class="form-group">
                        <label for="azure_tenant_id">Tenant ID</label>
                        <input type="text" id="azure_tenant_id" value="${profile.providerType === 'azureservicebus' && (profile as AzureServiceBusConnectionProfile).connectionParams.credential ? (profile as AzureServiceBusConnectionProfile).connectionParams.credential!.tenantId || '' : ''}">
                    </div>

                    <div class="form-group">
                        <label for="azure_client_id">Client ID</label>
                        <input type="text" id="azure_client_id" value="${profile.providerType === 'azureservicebus' && (profile as AzureServiceBusConnectionProfile).connectionParams.credential ? (profile as AzureServiceBusConnectionProfile).connectionParams.credential!.clientId || '' : ''}">
                    </div>

                    <div class="form-group">
                        <label for="azure_client_secret">Client Secret</label>
                        <input type="password" id="azure_client_secret" placeholder="Enter client secret">
                    </div>
                </div>

                <div class="form-group">
                    <label for="azure_entity_path">Entity Path (Queue or Topic name, optional)</label>
                    <input type="text" id="azure_entity_path" value="${profile.providerType === 'azureservicebus' ? (profile as AzureServiceBusConnectionProfile).connectionParams.entityPath || '' : ''}">
                </div>

                <h3>Retry Options</h3>

                <div class="form-group">
                    <label for="azure_max_retries">Max Retries</label>
                    <input type="number" id="azure_max_retries" value="${profile.providerType === 'azureservicebus' && (profile as AzureServiceBusConnectionProfile).connectionParams.retryOptions ? (profile as AzureServiceBusConnectionProfile).connectionParams.retryOptions!.maxRetries || 3 : 3}">
                </div>

                <div class="form-group">
                    <label for="azure_retry_delay">Retry Delay (ms)</label>
                    <input type="number" id="azure_retry_delay" value="${profile.providerType === 'azureservicebus' && (profile as AzureServiceBusConnectionProfile).connectionParams.retryOptions ? (profile as AzureServiceBusConnectionProfile).connectionParams.retryOptions!.retryDelayInMs || 1000 : 1000}">
                </div>

                <div class="form-group">
                    <label for="azure_max_retry_delay">Max Retry Delay (ms)</label>
                    <input type="number" id="azure_max_retry_delay" value="${profile.providerType === 'azureservicebus' && (profile as AzureServiceBusConnectionProfile).connectionParams.retryOptions ? (profile as AzureServiceBusConnectionProfile).connectionParams.retryOptions!.maxRetryDelayInMs || 30000 : 30000}">
                </div>

                <div class="form-group">
                    <label for="azure_retry_mode">Retry Mode</label>
                    <select id="azure_retry_mode">
                        <option value="exponential" ${profile.providerType === 'azureservicebus' && (profile as AzureServiceBusConnectionProfile).connectionParams.retryOptions?.mode === 'exponential' ? 'selected' : 'selected'}>Exponential</option>
                        <option value="fixed" ${profile.providerType === 'azureservicebus' && (profile as AzureServiceBusConnectionProfile).connectionParams.retryOptions?.mode === 'fixed' ? 'selected' : ''}>Fixed</option>
                    </select>
                </div>
            </div>

            <div id="awssqsParams" class="provider-specific" style="display: ${profile.providerType === 'awssqs' ? 'block' : 'none'}">
                <h2>AWS SQS Connection Parameters</h2>

                <div class="form-group">
                    <label for="aws_region">Region</label>
                    <input type="text" id="aws_region" value="${profile.providerType === 'awssqs' ? (profile as AWSSQSConnectionProfile).connectionParams.region || 'us-east-1' : 'us-east-1'}" required>
                </div>

                <div class="form-group checkbox-group">
                    <input type="checkbox" id="aws_use_profile_credentials" ${profile.providerType === 'awssqs' && (profile as AWSSQSConnectionProfile).connectionParams.useProfileCredentials ? 'checked' : ''}>
                    <label for="aws_use_profile_credentials">Use AWS Credentials from Shared Credentials File</label>
                </div>

                <div id="aws_profile_params" style="display: ${profile.providerType === 'awssqs' && (profile as AWSSQSConnectionProfile).connectionParams.useProfileCredentials ? 'block' : 'none'}">
                    <div class="form-group">
                        <label for="aws_profile">Profile Name</label>
                        <input type="text" id="aws_profile" value="${profile.providerType === 'awssqs' ? (profile as AWSSQSConnectionProfile).connectionParams.profile || 'default' : 'default'}">
                    </div>
                </div>

                <div id="aws_credentials_params" style="display: ${profile.providerType === 'awssqs' && !(profile as AWSSQSConnectionProfile).connectionParams.useProfileCredentials ? 'block' : 'block'}">
                    <div class="form-group">
                        <label for="aws_access_key_id">Access Key ID</label>
                        <input type="text" id="aws_access_key_id" value="${profile.providerType === 'awssqs' && (profile as AWSSQSConnectionProfile).connectionParams.credentials ? (profile as AWSSQSConnectionProfile).connectionParams.credentials!.accessKeyId || '' : ''}">
                    </div>

                    <div class="form-group">
                        <label for="aws_secret_access_key">Secret Access Key</label>
                        <input type="password" id="aws_secret_access_key" placeholder="Enter secret access key">
                    </div>

                    <div class="form-group">
                        <label for="aws_session_token">Session Token (optional)</label>
                        <input type="password" id="aws_session_token" value="${profile.providerType === 'awssqs' && (profile as AWSSQSConnectionProfile).connectionParams.credentials ? (profile as AWSSQSConnectionProfile).connectionParams.credentials!.sessionToken || '' : ''}">
                    </div>
                </div>

                <div class="form-group">
                    <label for="aws_endpoint">Custom Endpoint URL (optional)</label>
                    <input type="text" id="aws_endpoint" value="${profile.providerType === 'awssqs' ? (profile as AWSSQSConnectionProfile).connectionParams.endpoint || '' : ''}" placeholder="e.g., http://localhost:4566 for LocalStack">
                </div>

                <div class="form-group">
                    <label for="aws_queue_url_prefix">Queue URL Prefix (optional)</label>
                    <input type="text" id="aws_queue_url_prefix" value="${profile.providerType === 'awssqs' ? (profile as AWSSQSConnectionProfile).connectionParams.queueUrlPrefix || '' : ''}" placeholder="e.g., https://sqs.us-east-1.amazonaws.com/123456789012">
                </div>

                <h3>Retry Options</h3>

                <div class="form-group">
                    <label for="aws_max_retries">Max Retries</label>
                    <input type="number" id="aws_max_retries" value="${profile.providerType === 'awssqs' ? (profile as AWSSQSConnectionProfile).connectionParams.maxRetries || 3 : 3}">
                </div>

                <div class="form-group">
                    <label for="aws_retry_mode">Retry Mode</label>
                    <select id="aws_retry_mode">
                        <option value="standard" ${profile.providerType === 'awssqs' && (profile as AWSSQSConnectionProfile).connectionParams.retryMode === 'standard' ? 'selected' : 'selected'}>Standard</option>
                        <option value="adaptive" ${profile.providerType === 'awssqs' && (profile as AWSSQSConnectionProfile).connectionParams.retryMode === 'adaptive' ? 'selected' : ''}>Adaptive</option>
                    </select>
                </div>
            </div>

            <div class="actions">
                <button id="saveBtn">Save</button>
                <button id="testBtn">Test Connection</button>
                <button id="cancelBtn">Cancel</button>
            </div>

            <script>
                (function() {
                    const vscode = acquireVsCodeApi();

                    // Initialize form based on selected provider type when page loads
                    // Run immediately since the DOM is already loaded in a webview
                    const providerType = document.getElementById('providerType').value;

                    // Show only the parameters for the selected provider type
                    updateProviderSpecificParams(providerType);

                    // If this is a new profile (not editing), initialize form fields with default values
                    if (!('${profile.id}')) {
                        // We'll initialize the form fields after all functions are defined
                        setTimeout(() => {
                            if (typeof setDefaultValues === 'function') {
                                setDefaultValues(providerType);
                            }
                        }, 0);
                    }

                    // Function to update provider-specific parameters visibility
                    function updateProviderSpecificParams(providerType) {
                        // Hide all provider-specific sections
                        document.getElementById('ibmmqParams').style.display = 'none';
                        document.getElementById('rabbitmqParams').style.display = 'none';
                        document.getElementById('kafkaParams').style.display = 'none';
                        document.getElementById('activemqParams').style.display = 'none';
                        document.getElementById('azureservicebusParams').style.display = 'none';
                        document.getElementById('awssqsParams').style.display = 'none';

                        // Show the selected provider's section
                        if (providerType === 'ibmmq') {
                            document.getElementById('ibmmqParams').style.display = 'block';
                        } else if (providerType === 'rabbitmq') {
                            document.getElementById('rabbitmqParams').style.display = 'block';
                        } else if (providerType === 'kafka') {
                            document.getElementById('kafkaParams').style.display = 'block';
                        } else if (providerType === 'activemq') {
                            document.getElementById('activemqParams').style.display = 'block';
                        } else if (providerType === 'azureservicebus') {
                            document.getElementById('azureservicebusParams').style.display = 'block';
                        } else if (providerType === 'awssqs') {
                            document.getElementById('awssqsParams').style.display = 'block';
                        }
                    }

                    // Handle save button
                    document.getElementById('saveBtn').addEventListener('click', () => {
                        const name = document.getElementById('name').value;
                        const providerType = document.getElementById('providerType').value;

                        if (!name) {
                            vscode.postMessage({
                                command: 'error',
                                message: 'Profile name is required'
                            });
                            return;
                        }

                        let profile = {
                            id: '${profile.id}',
                            name,
                            providerType
                        };

                        // Add provider-specific parameters
                        if (providerType === 'ibmmq') {
                            const queueManager = document.getElementById('queueManager').value;
                            const host = document.getElementById('ibmmq_host').value;
                            const port = parseInt(document.getElementById('ibmmq_port').value, 10);
                            const channel = document.getElementById('channel').value;
                            const username = document.getElementById('ibmmq_username').value;
                            const password = document.getElementById('ibmmq_password').value;
                            const useTLS = document.getElementById('ibmmq_useTLS').checked;

                            if (!queueManager || !host || !channel) {
                                vscode.postMessage({
                                    command: 'error',
                                    message: 'Queue Manager, Host, and Channel are required'
                                });
                                return;
                            }

                            profile.connectionParams = {
                                queueManager,
                                host,
                                port,
                                channel,
                                username: username || undefined,
                                password: password || undefined,
                                useTLS
                            };
                        } else if (providerType === 'rabbitmq') {
                            const host = document.getElementById('rabbitmq_host').value;
                            const port = parseInt(document.getElementById('rabbitmq_port').value, 10);
                            const vhost = document.getElementById('vhost').value;
                            const username = document.getElementById('rabbitmq_username').value;
                            const password = document.getElementById('rabbitmq_password').value;
                            const useTLS = document.getElementById('rabbitmq_useTLS').checked;

                            if (!host) {
                                vscode.postMessage({
                                    command: 'error',
                                    message: 'Host is required'
                                });
                                return;
                            }

                            profile.connectionParams = {
                                host,
                                port,
                                vhost: vhost || '/',
                                username: username || 'guest',
                                password: password || 'guest',
                                useTLS
                            };
                        } else if (providerType === 'kafka') {
                            const brokersString = document.getElementById('kafka_brokers').value;
                            const clientId = document.getElementById('kafka_clientId').value;
                            const ssl = document.getElementById('kafka_ssl').checked;
                            const useSasl = document.getElementById('kafka_sasl').checked;
                            const connectionTimeout = parseInt(document.getElementById('kafka_connectionTimeout').value, 10);
                            const authenticationTimeout = parseInt(document.getElementById('kafka_authenticationTimeout').value, 10);

                            if (!brokersString) {
                                vscode.postMessage({
                                    command: 'error',
                                    message: 'At least one broker is required'
                                });
                                return;
                            }

                            // Parse brokers string into array
                            const brokers = brokersString.split(',').map(broker => broker.trim());

                            // Create connection params
                            profile.connectionParams = {
                                brokers,
                                clientId: clientId || 'mqexplorer',
                                ssl,
                                connectionTimeout,
                                authenticationTimeout
                            };

                            // Add SASL if enabled
                            if (useSasl) {
                                const mechanism = document.getElementById('kafka_sasl_mechanism').value;
                                const saslUsername = document.getElementById('kafka_sasl_username').value;
                                const saslPassword = document.getElementById('kafka_sasl_password').value;

                                if (!saslUsername) {
                                    vscode.postMessage({
                                        command: 'error',
                                        message: 'SASL username is required when SASL is enabled'
                                    });
                                    return;
                                }

                                profile.connectionParams.sasl = {
                                    mechanism: mechanism as 'plain' | 'scram-sha-256' | 'scram-sha-512',
                                    username: saslUsername,
                                    password: saslPassword
                                };
                            }
                        } else if (providerType === 'activemq') {
                            const host = document.getElementById('activemq_host').value;
                            const port = parseInt(document.getElementById('activemq_port').value, 10);
                            const ssl = document.getElementById('activemq_ssl').checked;
                            const connectTimeout = parseInt(document.getElementById('activemq_connect_timeout').value, 10);

                            // Get connect headers
                            const login = document.getElementById('activemq_login').value;
                            const passcode = document.getElementById('activemq_passcode').value;
                            const hostHeader = document.getElementById('activemq_host_header').value;
                            const heartBeat = document.getElementById('activemq_heart_beat').value;
                            const acceptVersion = document.getElementById('activemq_accept_version').value;

                            // Get reconnect options
                            const maxReconnects = parseInt(document.getElementById('activemq_max_reconnects').value, 10);
                            const initialReconnectDelay = parseInt(document.getElementById('activemq_initial_reconnect_delay').value, 10);
                            const maxReconnectDelay = parseInt(document.getElementById('activemq_max_reconnect_delay').value, 10);
                            const useExponentialBackOff = document.getElementById('activemq_use_exponential_backoff').checked;
                            const maxReconnectAttempts = parseInt(document.getElementById('activemq_max_reconnect_attempts').value, 10);

                            if (!host) {
                                vscode.postMessage({
                                    command: 'error',
                                    message: 'Host is required'
                                });
                                return;
                            }

                            // Create connection params
                            profile.connectionParams = {
                                host,
                                port,
                                ssl,
                                connectTimeout
                            };

                            // Add connect headers if any are provided
                            if (login || passcode || hostHeader || heartBeat || acceptVersion) {
                                profile.connectionParams.connectHeaders = {};

                                if (login) {
                                    profile.connectionParams.connectHeaders.login = login;
                                }

                                if (passcode) {
                                    profile.connectionParams.connectHeaders.passcode = passcode;
                                }

                                if (hostHeader) {
                                    profile.connectionParams.connectHeaders.host = hostHeader;
                                }

                                if (heartBeat) {
                                    profile.connectionParams.connectHeaders['heart-beat'] = heartBeat;
                                }

                                if (acceptVersion) {
                                    profile.connectionParams.connectHeaders['accept-version'] = acceptVersion;
                                }
                            }

                            // Add reconnect options
                            profile.connectionParams.reconnectOpts = {
                                maxReconnects,
                                initialReconnectDelay,
                                maxReconnectDelay,
                                useExponentialBackOff,
                                maxReconnectAttempts
                            };
                        } else if (providerType === 'azureservicebus') {
                            // Get connection method
                            const useConnectionString = document.getElementById('azure_use_connection_string').checked;
                            const useAadAuth = document.getElementById('azure_use_aad_auth').checked;

                            // Get common parameters
                            const entityPath = document.getElementById('azure_entity_path').value;

                            // Get retry options
                            const maxRetries = parseInt(document.getElementById('azure_max_retries').value, 10);
                            const retryDelay = parseInt(document.getElementById('azure_retry_delay').value, 10);
                            const maxRetryDelay = parseInt(document.getElementById('azure_max_retry_delay').value, 10);
                            const retryMode = document.getElementById('azure_retry_mode').value;

                            // Create connection params
                            profile.connectionParams = {
                                entityPath: entityPath || undefined,
                                useAadAuth,
                                retryOptions: {
                                    maxRetries,
                                    retryDelayInMs: retryDelay,
                                    maxRetryDelayInMs: maxRetryDelay,
                                    mode: retryMode as 'exponential' | 'fixed'
                                }
                            };

                            // Add connection string if using it
                            if (useConnectionString) {
                                const connectionString = document.getElementById('azure_connection_string').value;

                                if (!connectionString) {
                                    vscode.postMessage({
                                        command: 'error',
                                        message: 'Connection string is required when using connection string authentication'
                                    });
                                    return;
                                }

                                profile.connectionParams.connectionString = connectionString;
                            }

                            // Add AAD credentials if using them
                            if (useAadAuth) {
                                const namespace = document.getElementById('azure_namespace').value;
                                const tenantId = document.getElementById('azure_tenant_id').value;
                                const clientId = document.getElementById('azure_client_id').value;
                                const clientSecret = document.getElementById('azure_client_secret').value;

                                if (!namespace || !tenantId || !clientId || !clientSecret) {
                                    vscode.postMessage({
                                        command: 'error',
                                        message: 'Namespace, Tenant ID, Client ID, and Client Secret are required when using AAD authentication'
                                    });
                                    return;
                                }

                                profile.connectionParams.fullyQualifiedNamespace = namespace;
                                profile.connectionParams.credential = {
                                    tenantId,
                                    clientId,
                                    clientSecret
                                };
                            }

                            // Ensure we have at least one authentication method
                            if (!useConnectionString && !useAadAuth) {
                                vscode.postMessage({
                                    command: 'error',
                                    message: 'You must select at least one authentication method (Connection String or AAD)'
                                });
                                return;
                            }
                        } else if (providerType === 'awssqs') {
                            // Get region
                            const region = document.getElementById('aws_region').value;

                            if (!region) {
                                vscode.postMessage({
                                    command: 'error',
                                    message: 'Region is required'
                                });
                                return;
                            }

                            // Get authentication method
                            const useProfileCredentials = document.getElementById('aws_use_profile_credentials').checked;

                            // Get optional parameters
                            const endpoint = document.getElementById('aws_endpoint').value;
                            const queueUrlPrefix = document.getElementById('aws_queue_url_prefix').value;
                            const maxRetries = parseInt(document.getElementById('aws_max_retries').value, 10);
                            const retryMode = document.getElementById('aws_retry_mode').value;

                            // Create connection params
                            profile.connectionParams = {
                                region,
                                useProfileCredentials,
                                endpoint: endpoint || undefined,
                                queueUrlPrefix: queueUrlPrefix || undefined,
                                maxRetries,
                                retryMode: retryMode as 'standard' | 'adaptive'
                            };

                            // Add profile name if using profile credentials
                            if (useProfileCredentials) {
                                const profileName = document.getElementById('aws_profile').value;
                                profile.connectionParams.profile = profileName || 'default';
                            } else {
                                // Add credentials if not using profile credentials
                                const accessKeyId = document.getElementById('aws_access_key_id').value;
                                const secretAccessKey = document.getElementById('aws_secret_access_key').value;
                                const sessionToken = document.getElementById('aws_session_token').value;

                                if (!accessKeyId || !secretAccessKey) {
                                    vscode.postMessage({
                                        command: 'error',
                                        message: 'Access Key ID and Secret Access Key are required when not using profile credentials'
                                    });
                                    return;
                                }

                                profile.connectionParams.credentials = {
                                    accessKeyId,
                                    secretAccessKey,
                                    sessionToken: sessionToken || undefined
                                };
                            }
                        }

                        vscode.postMessage({
                            command: 'saveProfile',
                            profile
                        });
                    });

                    // Handle test connection button
                    document.getElementById('testBtn').addEventListener('click', () => {
                        const name = document.getElementById('name').value;
                        const providerType = document.getElementById('providerType').value;

                        let profile = {
                            id: '${profile.id}',
                            name,
                            providerType
                        };

                        // Add provider-specific parameters
                        if (providerType === 'ibmmq') {
                            const queueManager = document.getElementById('queueManager').value;
                            const host = document.getElementById('ibmmq_host').value;
                            const port = parseInt(document.getElementById('ibmmq_port').value, 10);
                            const channel = document.getElementById('channel').value;
                            const username = document.getElementById('ibmmq_username').value;
                            const password = document.getElementById('ibmmq_password').value;
                            const useTLS = document.getElementById('ibmmq_useTLS').checked;

                            profile.connectionParams = {
                                queueManager,
                                host,
                                port,
                                channel,
                                username: username || undefined,
                                password: password || undefined,
                                useTLS
                            };
                        } else if (providerType === 'rabbitmq') {
                            const host = document.getElementById('rabbitmq_host').value;
                            const port = parseInt(document.getElementById('rabbitmq_port').value, 10);
                            const vhost = document.getElementById('vhost').value;
                            const username = document.getElementById('rabbitmq_username').value;
                            const password = document.getElementById('rabbitmq_password').value;
                            const useTLS = document.getElementById('rabbitmq_useTLS').checked;

                            profile.connectionParams = {
                                host,
                                port,
                                vhost: vhost || '/',
                                username: username || 'guest',
                                password: password || 'guest',
                                useTLS
                            };
                        } else if (providerType === 'kafka') {
                            const brokersString = document.getElementById('kafka_brokers').value;
                            const clientId = document.getElementById('kafka_clientId').value;
                            const ssl = document.getElementById('kafka_ssl').checked;
                            const useSasl = document.getElementById('kafka_sasl').checked;
                            const connectionTimeout = parseInt(document.getElementById('kafka_connectionTimeout').value, 10);
                            const authenticationTimeout = parseInt(document.getElementById('kafka_authenticationTimeout').value, 10);

                            // Parse brokers string into array
                            const brokers = brokersString.split(',').map(broker => broker.trim());

                            // Create connection params
                            profile.connectionParams = {
                                brokers,
                                clientId: clientId || 'mqexplorer',
                                ssl,
                                connectionTimeout,
                                authenticationTimeout
                            };

                            // Add SASL if enabled
                            if (useSasl) {
                                const mechanism = document.getElementById('kafka_sasl_mechanism').value;
                                const saslUsername = document.getElementById('kafka_sasl_username').value;
                                const saslPassword = document.getElementById('kafka_sasl_password').value;

                                profile.connectionParams.sasl = {
                                    mechanism: mechanism as 'plain' | 'scram-sha-256' | 'scram-sha-512',
                                    username: saslUsername,
                                    password: saslPassword
                                };
                            }
                        } else if (providerType === 'activemq') {
                            const host = document.getElementById('activemq_host').value;
                            const port = parseInt(document.getElementById('activemq_port').value, 10);
                            const ssl = document.getElementById('activemq_ssl').checked;
                            const connectTimeout = parseInt(document.getElementById('activemq_connect_timeout').value, 10);

                            // Get connect headers
                            const login = document.getElementById('activemq_login').value;
                            const passcode = document.getElementById('activemq_passcode').value;
                            const hostHeader = document.getElementById('activemq_host_header').value;
                            const heartBeat = document.getElementById('activemq_heart_beat').value;
                            const acceptVersion = document.getElementById('activemq_accept_version').value;

                            // Get reconnect options
                            const maxReconnects = parseInt(document.getElementById('activemq_max_reconnects').value, 10);
                            const initialReconnectDelay = parseInt(document.getElementById('activemq_initial_reconnect_delay').value, 10);
                            const maxReconnectDelay = parseInt(document.getElementById('activemq_max_reconnect_delay').value, 10);
                            const useExponentialBackOff = document.getElementById('activemq_use_exponential_backoff').checked;
                            const maxReconnectAttempts = parseInt(document.getElementById('activemq_max_reconnect_attempts').value, 10);

                            // Create connection params
                            profile.connectionParams = {
                                host,
                                port,
                                ssl,
                                connectTimeout
                            };

                            // Add connect headers if any are provided
                            if (login || passcode || hostHeader || heartBeat || acceptVersion) {
                                profile.connectionParams.connectHeaders = {};

                                if (login) {
                                    profile.connectionParams.connectHeaders.login = login;
                                }

                                if (passcode) {
                                    profile.connectionParams.connectHeaders.passcode = passcode;
                                }

                                if (hostHeader) {
                                    profile.connectionParams.connectHeaders.host = hostHeader;
                                }

                                if (heartBeat) {
                                    profile.connectionParams.connectHeaders['heart-beat'] = heartBeat;
                                }

                                if (acceptVersion) {
                                    profile.connectionParams.connectHeaders['accept-version'] = acceptVersion;
                                }
                            }

                            // Add reconnect options
                            profile.connectionParams.reconnectOpts = {
                                maxReconnects,
                                initialReconnectDelay,
                                maxReconnectDelay,
                                useExponentialBackOff,
                                maxReconnectAttempts
                            };
                        } else if (providerType === 'azureservicebus') {
                            // Get connection method
                            const useConnectionString = document.getElementById('azure_use_connection_string').checked;
                            const useAadAuth = document.getElementById('azure_use_aad_auth').checked;

                            // Get common parameters
                            const entityPath = document.getElementById('azure_entity_path').value;

                            // Get retry options
                            const maxRetries = parseInt(document.getElementById('azure_max_retries').value, 10);
                            const retryDelay = parseInt(document.getElementById('azure_retry_delay').value, 10);
                            const maxRetryDelay = parseInt(document.getElementById('azure_max_retry_delay').value, 10);
                            const retryMode = document.getElementById('azure_retry_mode').value;

                            // Create connection params
                            profile.connectionParams = {
                                entityPath: entityPath || undefined,
                                useAadAuth,
                                retryOptions: {
                                    maxRetries,
                                    retryDelayInMs: retryDelay,
                                    maxRetryDelayInMs: maxRetryDelay,
                                    mode: retryMode as 'exponential' | 'fixed'
                                }
                            };

                            // Add connection string if using it
                            if (useConnectionString) {
                                const connectionString = document.getElementById('azure_connection_string').value;
                                profile.connectionParams.connectionString = connectionString;
                            }

                            // Add AAD credentials if using them
                            if (useAadAuth) {
                                const namespace = document.getElementById('azure_namespace').value;
                                const tenantId = document.getElementById('azure_tenant_id').value;
                                const clientId = document.getElementById('azure_client_id').value;
                                const clientSecret = document.getElementById('azure_client_secret').value;

                                profile.connectionParams.fullyQualifiedNamespace = namespace;
                                profile.connectionParams.credential = {
                                    tenantId,
                                    clientId,
                                    clientSecret
                                };
                            }
                        } else if (providerType === 'awssqs') {
                            // Get region
                            const region = document.getElementById('aws_region').value;

                            // Get authentication method
                            const useProfileCredentials = document.getElementById('aws_use_profile_credentials').checked;

                            // Get optional parameters
                            const endpoint = document.getElementById('aws_endpoint').value;
                            const queueUrlPrefix = document.getElementById('aws_queue_url_prefix').value;
                            const maxRetries = parseInt(document.getElementById('aws_max_retries').value, 10);
                            const retryMode = document.getElementById('aws_retry_mode').value;

                            // Create connection params
                            profile.connectionParams = {
                                region,
                                useProfileCredentials,
                                endpoint: endpoint || undefined,
                                queueUrlPrefix: queueUrlPrefix || undefined,
                                maxRetries,
                                retryMode: retryMode as 'standard' | 'adaptive'
                            };

                            // Add profile name if using profile credentials
                            if (useProfileCredentials) {
                                const profileName = document.getElementById('aws_profile').value;
                                profile.connectionParams.profile = profileName || 'default';
                            } else {
                                // Add credentials if not using profile credentials
                                const accessKeyId = document.getElementById('aws_access_key_id').value;
                                const secretAccessKey = document.getElementById('aws_secret_access_key').value;
                                const sessionToken = document.getElementById('aws_session_token').value;

                                profile.connectionParams.credentials = {
                                    accessKeyId,
                                    secretAccessKey,
                                    sessionToken: sessionToken || undefined
                                };
                            }
                        }

                        vscode.postMessage({
                            command: 'testConnection',
                            profile
                        });
                    });

                    // Handle cancel button
                    document.getElementById('cancelBtn').addEventListener('click', () => {
                        vscode.postMessage({
                            command: 'cancel'
                        });
                    });

                    // Function to set default values based on provider type
                    function setDefaultValues(providerType) {
                        // Set default values based on provider type
                        switch (providerType) {
                            case 'ibmmq':
                                document.getElementById('ibmmq_port').value = '1414';
                                document.getElementById('channel').value = 'SYSTEM.DEF.SVRCONN';
                                document.getElementById('ibmmq_useTLS').checked = false;
                                break;

                            case 'rabbitmq':
                                document.getElementById('rabbitmq_port').value = '5672';
                                document.getElementById('vhost').value = '/';
                                document.getElementById('rabbitmq_username').value = 'guest';
                                document.getElementById('rabbitmq_password').value = 'guest';
                                document.getElementById('rabbitmq_useTLS').checked = false;
                                break;

                            case 'kafka':
                                document.getElementById('kafka_brokers').value = 'localhost:9092';
                                document.getElementById('kafka_clientId').value = 'mqexplorer';
                                document.getElementById('kafka_ssl').checked = false;
                                document.getElementById('kafka_sasl').checked = false;
                                document.getElementById('kafka_connectionTimeout').value = '30000';
                                document.getElementById('kafka_authenticationTimeout').value = '10000';
                                document.getElementById('kafka_sasl_params').style.display = 'none';
                                break;

                            case 'activemq':
                                document.getElementById('activemq_host').value = 'localhost';
                                document.getElementById('activemq_port').value = '61613';
                                document.getElementById('activemq_ssl').checked = false;
                                document.getElementById('activemq_heart_beat').value = '10000,10000';
                                document.getElementById('activemq_accept_version').value = '1.0,1.1,1.2';
                                document.getElementById('activemq_connect_timeout').value = '10000';
                                document.getElementById('activemq_max_reconnects').value = '10';
                                document.getElementById('activemq_initial_reconnect_delay').value = '1000';
                                document.getElementById('activemq_max_reconnect_delay').value = '30000';
                                document.getElementById('activemq_use_exponential_backoff').checked = true;
                                document.getElementById('activemq_max_reconnect_attempts').value = '10';
                                break;

                            case 'azureservicebus':
                                document.getElementById('azure_use_connection_string').checked = true;
                                document.getElementById('azure_use_aad_auth').checked = false;
                                document.getElementById('azure_connection_string_params').style.display = 'block';
                                document.getElementById('azure_aad_params').style.display = 'none';
                                document.getElementById('azure_max_retries').value = '3';
                                document.getElementById('azure_retry_delay').value = '1000';
                                document.getElementById('azure_max_retry_delay').value = '30000';
                                document.getElementById('azure_retry_mode').value = 'exponential';
                                break;

                            case 'awssqs':
                                document.getElementById('aws_region').value = 'us-east-1';
                                document.getElementById('aws_use_profile_credentials').checked = false;
                                document.getElementById('aws_profile_params').style.display = 'none';
                                document.getElementById('aws_credentials_params').style.display = 'block';
                                document.getElementById('aws_max_retries').value = '3';
                                document.getElementById('aws_retry_mode').value = 'standard';
                                break;
                        }
                    }

                    // Handle Kafka SASL checkbox
                    document.getElementById('kafka_sasl').addEventListener('change', (event) => {
                        const useSasl = event.target.checked;
                        document.getElementById('kafka_sasl_params').style.display = useSasl ? 'block' : 'none';
                    });

                    // Handle Azure Service Bus connection string checkbox
                    document.getElementById('azure_use_connection_string').addEventListener('change', (event) => {
                        const useConnectionString = event.target.checked;
                        document.getElementById('azure_connection_string_params').style.display = useConnectionString ? 'block' : 'none';

                        // If using connection string, disable AAD auth
                        if (useConnectionString) {
                            document.getElementById('azure_use_aad_auth').checked = false;
                            document.getElementById('azure_aad_params').style.display = 'none';
                        }
                    });

                    // Handle Azure Service Bus AAD auth checkbox
                    document.getElementById('azure_use_aad_auth').addEventListener('change', (event) => {
                        const useAadAuth = event.target.checked;
                        document.getElementById('azure_aad_params').style.display = useAadAuth ? 'block' : 'none';

                        // If using AAD auth, disable connection string
                        if (useAadAuth) {
                            document.getElementById('azure_use_connection_string').checked = false;
                            document.getElementById('azure_connection_string_params').style.display = 'none';
                        }
                    });

                    // Handle AWS SQS profile credentials checkbox
                    document.getElementById('aws_use_profile_credentials').addEventListener('change', (event) => {
                        const useProfileCredentials = event.target.checked;
                        document.getElementById('aws_profile_params').style.display = useProfileCredentials ? 'block' : 'none';
                        document.getElementById('aws_credentials_params').style.display = useProfileCredentials ? 'none' : 'block';
                    });
                })();
            </script>
        </body>
        </html>`;
    }

    /**
     * Save a connection profile
     */
    private async saveProfile(profile: ConnectionProfile): Promise<void> {
        try {
            await this.connectionManager.saveConnectionProfile(profile);

            vscode.window.showInformationMessage(`Connection profile "${profile.name}" saved`);

            // Refresh the tree view
            vscode.commands.executeCommand('mqexplorer.refreshTreeView');

            // Close the panel
            this.panel?.dispose();
        } catch (error) {
            vscode.window.showErrorMessage(`Error saving connection profile: ${(error as Error).message}`);
        }
    }

    /**
     * Test a connection
     */
    private async testConnection(profile: ConnectionProfile): Promise<void> {
        try {
            // Create a temporary provider based on the profile type
            let provider;

            switch (profile.providerType) {
                case 'ibmmq':
                    const { IBMMQProvider } = require('../providers/IBMMQProvider');
                    provider = new IBMMQProvider();
                    break;

                case 'rabbitmq':
                    const { RabbitMQProvider } = require('../providers/RabbitMQProvider');
                    provider = new RabbitMQProvider();
                    break;

                case 'kafka':
                    const { KafkaProvider } = require('../providers/KafkaProvider');
                    provider = new KafkaProvider();
                    break;

                case 'activemq':
                    const { ActiveMQProvider } = require('../providers/ActiveMQProvider');
                    provider = new ActiveMQProvider();
                    break;

                case 'azureservicebus':
                    const { AzureServiceBusProvider } = require('../providers/AzureServiceBusProvider');
                    provider = new AzureServiceBusProvider();
                    break;

                case 'awssqs':
                    const { AWSSQSProvider } = require('../providers/AWSSQSProvider');
                    provider = new AWSSQSProvider();
                    break;

                default:
                    throw new Error(`Unsupported provider type: ${profile.providerType}`);
            }

            // Connect
            await provider.connect(profile.connectionParams);

            // Disconnect
            await provider.disconnect();

            vscode.window.showInformationMessage(`Connection test successful for "${profile.name}"`);
        } catch (error) {
            vscode.window.showErrorMessage(`Connection test failed: ${(error as Error).message}`);
        }
    }
}
