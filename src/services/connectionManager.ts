import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { EventEmitter } from 'events';
import { ConnectionProfile, IBMMQConnectionProfile, RabbitMQConnectionProfile, KafkaConnectionProfile, ActiveMQConnectionProfile, AzureServiceBusConnectionProfile, AWSSQSConnectionProfile } from '../models/connectionProfile';
// import { IBMMQProvider } from '../providers/IBMMQProvider.simple';
import { RabbitMQProvider } from '../providers/RabbitMQProvider';
import { KafkaProvider } from '../providers/KafkaProvider';
import { ActiveMQProvider } from '../providers/ActiveMQProvider';
import { AzureServiceBusProvider } from '../providers/AzureServiceBusProvider';
import { AWSSQSProvider } from '../providers/AWSSQSProvider';
import { IMQProvider } from '../providers/IMQProvider';

/**
 * Manages connection profiles and active connections
 */
export class ConnectionManager {
    private static instance: ConnectionManager;
    private context: vscode.ExtensionContext;
    private activeConnections: Map<string, IMQProvider> = new Map();
    private outputChannel: vscode.OutputChannel;

    // Event emitter for queue depth changes
    private eventEmitter: EventEmitter = new EventEmitter();

    // Event names
    public static readonly QUEUE_DEPTH_CHANGED = 'queueDepthChanged';
    public static readonly QUEUE_UPDATED = 'queueUpdated';

    // Private constructor for singleton pattern
    private constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.outputChannel = vscode.window.createOutputChannel('MQExplorer: Connection Manager');
    }

    /**
     * Subscribe to events
     * @param event Event name
     * @param listener Callback function
     */
    public on(event: string, listener: (...args: any[]) => void): void {
        this.eventEmitter.on(event, listener);
    }

    /**
     * Emit an event
     * @param event Event name
     * @param args Event arguments
     */
    public emit(event: string, ...args: any[]): void {
        this.eventEmitter.emit(event, ...args);
    }

    /**
     * Get the singleton instance of ConnectionManager
     */
    public static getInstance(context: vscode.ExtensionContext): ConnectionManager {
        if (!ConnectionManager.instance) {
            ConnectionManager.instance = new ConnectionManager(context);
        }
        return ConnectionManager.instance;
    }

    /**
     * Save a connection profile
     */
    public async saveConnectionProfile(profile: ConnectionProfile): Promise<void> {
        try {
            this.log(`Saving connection profile: ${profile.name}`);

            // Generate ID if not provided
            if (!profile.id) {
                profile.id = crypto.randomUUID();
            }

            // Get existing profiles
            const profiles = await this.getConnectionProfiles();

            // Check if profile with same ID already exists
            const existingIndex = profiles.findIndex(p => p.id === profile.id);

            if (existingIndex >= 0) {
                // Update existing profile
                profiles[existingIndex] = profile;
            } else {
                // Add new profile
                profiles.push(profile);
            }

            // Save profiles to workspace state
            await this.context.workspaceState.update('mqexplorer.connectionProfiles', profiles);

            // Handle passwords based on provider type
            switch (profile.providerType) {
                case 'ibmmq':
                    // If this is an IBM MQ profile with a password, save it securely
                    if ((profile as IBMMQConnectionProfile).connectionParams.password) {
                        const password = (profile as IBMMQConnectionProfile).connectionParams.password;
                        if (password) {
                            await this.context.secrets.store(`mqexplorer.password.${profile.id}`, password);
                        }

                        // Remove password from the profile object before storing
                        delete (profile as IBMMQConnectionProfile).connectionParams.password;
                    }
                    break;

                case 'rabbitmq':
                    // If this is a RabbitMQ profile with a password, save it securely
                    if ((profile as RabbitMQConnectionProfile).connectionParams.password) {
                        const password = (profile as RabbitMQConnectionProfile).connectionParams.password;
                        if (password) {
                            await this.context.secrets.store(`mqexplorer.password.${profile.id}`, password);
                        }

                        // Remove password from the profile object before storing
                        delete (profile as RabbitMQConnectionProfile).connectionParams.password;
                    }

                    // If TLS is enabled and there's a passphrase, save it securely
                    if ((profile as RabbitMQConnectionProfile).connectionParams.useTLS &&
                        (profile as RabbitMQConnectionProfile).connectionParams.tlsOptions &&
                        (profile as RabbitMQConnectionProfile).connectionParams.tlsOptions!.passphrase) {
                        const passphrase = (profile as RabbitMQConnectionProfile).connectionParams.tlsOptions!.passphrase;
                        if (passphrase) {
                            await this.context.secrets.store(`mqexplorer.tlspassphrase.${profile.id}`, passphrase);
                        }

                        // Remove passphrase from the profile object before storing
                        if ((profile as RabbitMQConnectionProfile).connectionParams.tlsOptions) {
                            delete (profile as RabbitMQConnectionProfile).connectionParams.tlsOptions!.passphrase;
                        }
                    }
                    break;

                case 'kafka':
                    // If this is a Kafka profile with SASL authentication, save the password securely
                    if ((profile as KafkaConnectionProfile).connectionParams.sasl &&
                        (profile as KafkaConnectionProfile).connectionParams.sasl!.password) {
                        const password = (profile as KafkaConnectionProfile).connectionParams.sasl!.password;
                        if (password) {
                            await this.context.secrets.store(`mqexplorer.password.${profile.id}`, password);
                        }

                        // Remove password from the profile object before storing
                        if ((profile as KafkaConnectionProfile).connectionParams.sasl) {
                            // Set to empty string instead of using delete
                            (profile as KafkaConnectionProfile).connectionParams.sasl!.password = '';
                        }
                    }
                    break;

                case 'activemq':
                    // If this is an ActiveMQ profile with a passcode, save it securely
                    if ((profile as ActiveMQConnectionProfile).connectionParams.connectHeaders &&
                        (profile as ActiveMQConnectionProfile).connectionParams.connectHeaders!.passcode) {
                        const passcode = (profile as ActiveMQConnectionProfile).connectionParams.connectHeaders!.passcode;
                        if (passcode) {
                            await this.context.secrets.store(`mqexplorer.password.${profile.id}`, passcode);
                        }

                        // Remove passcode from the profile object before storing
                        if ((profile as ActiveMQConnectionProfile).connectionParams.connectHeaders) {
                            // Use delete instead of setting to undefined to avoid type issues
                            delete (profile as ActiveMQConnectionProfile).connectionParams.connectHeaders!.passcode;
                        }
                    }
                    break;

                case 'azureservicebus':
                    // If this is an Azure Service Bus profile with a connection string, save it securely
                    if ((profile as AzureServiceBusConnectionProfile).connectionParams.connectionString) {
                        const connectionString = (profile as AzureServiceBusConnectionProfile).connectionParams.connectionString;
                        if (connectionString) {
                            await this.context.secrets.store(`mqexplorer.connectionstring.${profile.id}`, connectionString);
                        }

                        // Remove connection string from the profile object before storing
                        delete (profile as AzureServiceBusConnectionProfile).connectionParams.connectionString;
                    }

                    // If this is an Azure Service Bus profile with AAD credentials, save the client secret securely
                    if ((profile as AzureServiceBusConnectionProfile).connectionParams.credential &&
                        (profile as AzureServiceBusConnectionProfile).connectionParams.credential!.clientSecret) {
                        const clientSecret = (profile as AzureServiceBusConnectionProfile).connectionParams.credential!.clientSecret;
                        if (clientSecret) {
                            await this.context.secrets.store(`mqexplorer.clientsecret.${profile.id}`, clientSecret);
                        }

                        // Remove client secret from the profile object before storing
                        if ((profile as AzureServiceBusConnectionProfile).connectionParams.credential) {
                            // Use delete instead of setting to undefined to avoid type issues
                            delete (profile as AzureServiceBusConnectionProfile).connectionParams.credential!.clientSecret;
                        }
                    }
                    break;

                case 'awssqs':
                    // If this is an AWS SQS profile with credentials, save the secret access key securely
                    if ((profile as AWSSQSConnectionProfile).connectionParams.credentials &&
                        (profile as AWSSQSConnectionProfile).connectionParams.credentials!.secretAccessKey) {
                        const secretAccessKey = (profile as AWSSQSConnectionProfile).connectionParams.credentials!.secretAccessKey;
                        if (secretAccessKey) {
                            await this.context.secrets.store(`mqexplorer.secretaccesskey.${profile.id}`, secretAccessKey);
                        }

                        // Remove secret access key from the profile object before storing
                        if ((profile as AWSSQSConnectionProfile).connectionParams.credentials) {
                            // Set to empty string instead of using delete
                            (profile as AWSSQSConnectionProfile).connectionParams.credentials!.secretAccessKey = '';
                        }
                    }
                    break;
            }

            this.log(`Connection profile saved: ${profile.name}`);
        } catch (error) {
            this.log(`Error saving connection profile: ${(error as Error).message}`, true);
            throw error;
        }
    }

    /**
     * Get all saved connection profiles
     */
    public async getConnectionProfiles(): Promise<ConnectionProfile[]> {
        const profiles = this.context.workspaceState.get<ConnectionProfile[]>('mqexplorer.connectionProfiles', []);
        return profiles;
    }

    /**
     * Delete a connection profile
     */
    public async deleteConnectionProfile(profileId: string): Promise<void> {
        try {
            this.log(`Deleting connection profile: ${profileId}`);

            // Get existing profiles
            const profiles = await this.getConnectionProfiles();

            // Filter out the profile to delete
            const updatedProfiles = profiles.filter(p => p.id !== profileId);

            // Save updated profiles to workspace state
            await this.context.workspaceState.update('mqexplorer.connectionProfiles', updatedProfiles);

            // Delete any stored secrets for this profile
            await this.context.secrets.delete(`mqexplorer.password.${profileId}`);

            // If there's an active connection for this profile, disconnect it
            if (this.activeConnections.has(profileId)) {
                await this.disconnect(profileId);
            }

            this.log(`Connection profile deleted: ${profileId}`);
        } catch (error) {
            this.log(`Error deleting connection profile: ${(error as Error).message}`, true);
            throw error;
        }
    }

    /**
     * Connect to a message queue system using a saved profile
     */
    public async connect(profileId: string): Promise<IMQProvider> {
        try {
            this.log(`Connecting using profile: ${profileId}`);

            // Check if already connected
            if (this.activeConnections.has(profileId)) {
                this.log(`Already connected to profile: ${profileId}`);
                return this.activeConnections.get(profileId)!;
            }

            // Get the profile
            const profiles = await this.getConnectionProfiles();
            const profile = profiles.find(p => p.id === profileId);

            if (!profile) {
                throw new Error(`Connection profile not found: ${profileId}`);
            }

            // Create provider based on profile type
            let provider: IMQProvider;

            switch (profile.providerType) {
                case 'ibmmq':
                    const { IBMMQProvider } = require('../providers/IBMMQProvider');
                    provider = new IBMMQProvider();

                    // Set connection manager reference for event emission
                    if ('setConnectionManager' in provider) {
                        (provider as any).setConnectionManager(this);
                    }

                    // Get the password from secure storage if needed
                    const ibmProfile = profile as IBMMQConnectionProfile;
                    const password = await this.context.secrets.get(`mqexplorer.password.${profile.id}`);

                    // Create a copy of the connection params with the password
                    const connectionParams = {
                        ...ibmProfile.connectionParams,
                        password
                    };

                    // Connect to IBM MQ
                    await provider.connect(connectionParams, this.context);
                    break;

                case 'rabbitmq':
                    provider = new RabbitMQProvider();

                    // Get the password from secure storage if needed
                    const rabbitProfile = profile as RabbitMQConnectionProfile;
                    const rabbitPassword = await this.context.secrets.get(`mqexplorer.password.${profile.id}`);

                    // Create a copy of the connection params with the password
                    const rabbitConnectionParams = {
                        ...rabbitProfile.connectionParams,
                        password: rabbitPassword
                    };

                    // If TLS is enabled, get the passphrase from secure storage if needed
                    if (rabbitConnectionParams.useTLS && rabbitConnectionParams.tlsOptions) {
                        const passphrase = await this.context.secrets.get(`mqexplorer.tlspassphrase.${profile.id}`);
                        if (passphrase) {
                            rabbitConnectionParams.tlsOptions = {
                                ...rabbitConnectionParams.tlsOptions,
                                passphrase
                            };
                        }
                    }

                    // Connect to RabbitMQ
                    await provider.connect(rabbitConnectionParams, this.context);
                    break;

                case 'kafka':
                    provider = new KafkaProvider();

                    // Get the Kafka profile
                    const kafkaProfile = profile as KafkaConnectionProfile;

                    // Create a copy of the connection params
                    const kafkaConnectionParams = {
                        ...kafkaProfile.connectionParams
                    };

                    // If SASL is enabled, get the password from secure storage
                    if (kafkaConnectionParams.sasl) {
                        const kafkaPassword = await this.context.secrets.get(`mqexplorer.password.${profile.id}`);
                        if (kafkaPassword) {
                            kafkaConnectionParams.sasl = {
                                ...kafkaConnectionParams.sasl,
                                password: kafkaPassword
                            };
                        }
                    }

                    // Connect to Kafka
                    await provider.connect(kafkaConnectionParams, this.context);
                    break;

                case 'activemq':
                    provider = new ActiveMQProvider();

                    // Get the ActiveMQ profile
                    const activeMQProfile = profile as ActiveMQConnectionProfile;

                    // Create a copy of the connection params
                    const activeMQConnectionParams = {
                        ...activeMQProfile.connectionParams
                    };

                    // If connect headers are provided and we need to get the passcode
                    if (activeMQConnectionParams.connectHeaders) {
                        const passcode = await this.context.secrets.get(`mqexplorer.password.${profile.id}`);
                        if (passcode) {
                            activeMQConnectionParams.connectHeaders = {
                                ...activeMQConnectionParams.connectHeaders,
                                passcode
                            };
                        }
                    }

                    // Connect to ActiveMQ
                    await provider.connect(activeMQConnectionParams, this.context);
                    break;

                case 'azureservicebus':
                    provider = new AzureServiceBusProvider();

                    // Get the Azure Service Bus profile
                    const azureProfile = profile as AzureServiceBusConnectionProfile;

                    // Create a copy of the connection params
                    const azureConnectionParams = {
                        ...azureProfile.connectionParams
                    };

                    // If using connection string, get it from secure storage
                    const connectionString = await this.context.secrets.get(`mqexplorer.connectionstring.${profile.id}`);
                    if (connectionString) {
                        azureConnectionParams.connectionString = connectionString;
                    }

                    // If using AAD credentials, get the client secret from secure storage
                    if (azureConnectionParams.useAadAuth && azureConnectionParams.credential) {
                        const clientSecret = await this.context.secrets.get(`mqexplorer.clientsecret.${profile.id}`);
                        if (clientSecret) {
                            azureConnectionParams.credential = {
                                ...azureConnectionParams.credential,
                                clientSecret
                            };
                        }
                    }

                    // Connect to Azure Service Bus
                    await provider.connect(azureConnectionParams, this.context);
                    break;

                case 'awssqs':
                    provider = new AWSSQSProvider();

                    // Get the AWS SQS profile
                    const awsProfile = profile as AWSSQSConnectionProfile;

                    // Create a copy of the connection params
                    const awsConnectionParams = {
                        ...awsProfile.connectionParams
                    };

                    // If using credentials, get the secret access key from secure storage
                    if (awsConnectionParams.credentials) {
                        const secretAccessKey = await this.context.secrets.get(`mqexplorer.secretaccesskey.${profile.id}`);
                        if (secretAccessKey) {
                            awsConnectionParams.credentials = {
                                ...awsConnectionParams.credentials,
                                secretAccessKey
                            };
                        }
                    }

                    // Connect to AWS SQS
                    await provider.connect(awsConnectionParams, this.context);
                    break;

                // Add cases for other provider types here

                default:
                    throw new Error(`Unsupported provider type: ${profile.providerType}`);
            }

            // Store the active connection
            this.activeConnections.set(profileId, provider);

            this.log(`Connected to profile: ${profileId}`);
            return provider;
        } catch (error) {
            this.log(`Error connecting to profile: ${profileId} - ${(error as Error).message}`, true);
            throw error;
        }
    }

    /**
     * Disconnect from a message queue system
     */
    public async disconnect(profileId: string): Promise<void> {
        try {
            this.log(`Disconnecting from profile: ${profileId}`);

            // Check if connected
            if (!this.activeConnections.has(profileId)) {
                this.log(`Not connected to profile: ${profileId}`);
                return;
            }

            // Get the provider
            const provider = this.activeConnections.get(profileId)!;

            // Disconnect
            await provider.disconnect();

            // Remove from active connections
            this.activeConnections.delete(profileId);

            this.log(`Disconnected from profile: ${profileId}`);
        } catch (error) {
            this.log(`Error disconnecting from profile: ${profileId} - ${(error as Error).message}`, true);
            throw error;
        }
    }

    /**
     * Get an active connection provider
     */
    public getProvider(profileId: string): IMQProvider | undefined {
        return this.activeConnections.get(profileId);
    }

    /**
     * Check if connected to a profile
     */
    public isConnected(profileId: string): boolean {
        return this.activeConnections.has(profileId) &&
               this.activeConnections.get(profileId)!.isConnected();
    }

    /**
     * Get all active connections
     */
    public getActiveConnections(): Map<string, IMQProvider> {
        return this.activeConnections;
    }

    /**
     * Export connection profiles to a JSON file
     * @param includePasswords Whether to include passwords in the export (not recommended)
     * @returns JSON string of connection profiles
     */
    public async exportConnectionProfiles(includePasswords: boolean = false): Promise<string> {
        try {
            this.log('Exporting connection profiles');

            // Get all profiles
            const profiles = await this.getConnectionProfiles();

            // Create a deep copy of the profiles
            const exportProfiles = JSON.parse(JSON.stringify(profiles));

            // If including passwords, retrieve them from secure storage
            if (includePasswords) {
                for (const profile of exportProfiles) {
                    switch (profile.providerType) {
                        case 'ibmmq':
                            const ibmPassword = await this.context.secrets.get(`mqexplorer.password.${profile.id}`);
                            if (ibmPassword) {
                                profile.connectionParams = profile.connectionParams || {};
                                profile.connectionParams.password = ibmPassword;
                            }
                            break;

                        case 'rabbitmq':
                            const rabbitPassword = await this.context.secrets.get(`mqexplorer.password.${profile.id}`);
                            if (rabbitPassword) {
                                profile.connectionParams = profile.connectionParams || {};
                                profile.connectionParams.password = rabbitPassword;
                            }

                            // If TLS is enabled, also include the passphrase
                            if (profile.connectionParams.useTLS && profile.connectionParams.tlsOptions) {
                                const passphrase = await this.context.secrets.get(`mqexplorer.tlspassphrase.${profile.id}`);
                                if (passphrase && profile.connectionParams.tlsOptions) {
                                    profile.connectionParams.tlsOptions = profile.connectionParams.tlsOptions || {};
                                    profile.connectionParams.tlsOptions.passphrase = passphrase;
                                }
                            }
                            break;

                        case 'kafka':
                            // If SASL is enabled, include the password
                            if (profile.connectionParams.sasl) {
                                const kafkaPassword = await this.context.secrets.get(`mqexplorer.password.${profile.id}`);
                                if (kafkaPassword) {
                                    profile.connectionParams.sasl = profile.connectionParams.sasl || {};
                                    profile.connectionParams.sasl.password = kafkaPassword;
                                }
                            }
                            break;

                        case 'activemq':
                            // If connect headers are provided, include the passcode
                            if (profile.connectionParams.connectHeaders) {
                                const passcode = await this.context.secrets.get(`mqexplorer.password.${profile.id}`);
                                if (passcode) {
                                    profile.connectionParams.connectHeaders = profile.connectionParams.connectHeaders || {};
                                    profile.connectionParams.connectHeaders.passcode = passcode;
                                }
                            }
                            break;

                        case 'azureservicebus':
                            // Include the connection string if it exists
                            const connectionString = await this.context.secrets.get(`mqexplorer.connectionstring.${profile.id}`);
                            if (connectionString) {
                                profile.connectionParams.connectionString = connectionString;
                            }

                            // If using AAD credentials, include the client secret
                            if (profile.connectionParams.useAadAuth && profile.connectionParams.credential) {
                                const clientSecret = await this.context.secrets.get(`mqexplorer.clientsecret.${profile.id}`);
                                if (clientSecret) {
                                    profile.connectionParams.credential = profile.connectionParams.credential || {};
                                    profile.connectionParams.credential.clientSecret = clientSecret;
                                }
                            }
                            break;

                        case 'awssqs':
                            // Include the secret access key if it exists
                            if (profile.connectionParams.credentials) {
                                const secretAccessKey = await this.context.secrets.get(`mqexplorer.secretaccesskey.${profile.id}`);
                                if (secretAccessKey) {
                                    profile.connectionParams.credentials = profile.connectionParams.credentials || {};
                                    profile.connectionParams.credentials.secretAccessKey = secretAccessKey;
                                }
                            }
                            break;
                    }
                }
            }

            this.log(`Exported ${profiles.length} connection profiles`);
            return JSON.stringify(exportProfiles, null, 2);
        } catch (error) {
            this.log(`Error exporting connection profiles: ${(error as Error).message}`, true);
            throw error;
        }
    }

    /**
     * Import connection profiles from a JSON string
     * @param json JSON string of connection profiles
     * @returns Number of profiles imported
     */
    public async importConnectionProfiles(json: string): Promise<number> {
        try {
            this.log('Importing connection profiles');

            // Parse the JSON
            const importedProfiles = JSON.parse(json) as ConnectionProfile[];

            if (!Array.isArray(importedProfiles)) {
                throw new Error('Invalid import format: expected an array of connection profiles');
            }

            // Get existing profiles
            const existingProfiles = await this.getConnectionProfiles();

            // Track imported profiles
            let importCount = 0;

            // Process each imported profile
            for (const importedProfile of importedProfiles) {
                // Validate required fields
                if (!importedProfile.name || !importedProfile.providerType) {
                    this.log(`Skipping invalid profile: ${importedProfile.name || 'unnamed'}`, true);
                    continue;
                }

                // Generate ID if not provided
                if (!importedProfile.id) {
                    importedProfile.id = crypto.randomUUID();
                }

                // Check if profile with same ID already exists
                const existingIndex = existingProfiles.findIndex(p => p.id === importedProfile.id);

                if (existingIndex >= 0) {
                    // Update existing profile
                    existingProfiles[existingIndex] = importedProfile;
                } else {
                    // Add new profile
                    existingProfiles.push(importedProfile);
                }

                // Save password and other secrets based on provider type
                switch (importedProfile.providerType) {
                    case 'ibmmq':
                        if ((importedProfile as IBMMQConnectionProfile).connectionParams?.password) {
                            const password = (importedProfile as IBMMQConnectionProfile).connectionParams.password;
                            if (password) {
                                await this.context.secrets.store(`mqexplorer.password.${importedProfile.id}`, password);
                            }

                            // Remove password from the profile object
                            delete (importedProfile as IBMMQConnectionProfile).connectionParams.password;
                        }
                        break;

                    case 'rabbitmq':
                        if ((importedProfile as RabbitMQConnectionProfile).connectionParams?.password) {
                            const password = (importedProfile as RabbitMQConnectionProfile).connectionParams.password;
                            if (password) {
                                await this.context.secrets.store(`mqexplorer.password.${importedProfile.id}`, password);
                            }

                            // Remove password from the profile object
                            delete (importedProfile as RabbitMQConnectionProfile).connectionParams.password;
                        }

                        // If TLS is enabled and there's a passphrase, save it securely
                        if ((importedProfile as RabbitMQConnectionProfile).connectionParams?.useTLS &&
                            (importedProfile as RabbitMQConnectionProfile).connectionParams?.tlsOptions &&
                            (importedProfile as RabbitMQConnectionProfile).connectionParams.tlsOptions!.passphrase) {
                            const passphrase = (importedProfile as RabbitMQConnectionProfile).connectionParams.tlsOptions!.passphrase;
                            if (passphrase) {
                                await this.context.secrets.store(`mqexplorer.tlspassphrase.${importedProfile.id}`, passphrase);
                            }

                            // Remove passphrase from the profile object
                            if ((importedProfile as RabbitMQConnectionProfile).connectionParams.tlsOptions) {
                                // Use delete instead of setting to undefined to avoid type issues
                                delete (importedProfile as RabbitMQConnectionProfile).connectionParams.tlsOptions!.passphrase;
                            }
                        }
                        break;

                    case 'kafka':
                        // If SASL is enabled and there's a password, save it securely
                        if ((importedProfile as KafkaConnectionProfile).connectionParams?.sasl &&
                            (importedProfile as KafkaConnectionProfile).connectionParams.sasl!.password) {
                            const password = (importedProfile as KafkaConnectionProfile).connectionParams.sasl!.password;
                            if (password) {
                                await this.context.secrets.store(`mqexplorer.password.${importedProfile.id}`, password);
                            }

                            // Remove password from the profile object
                            if ((importedProfile as KafkaConnectionProfile).connectionParams.sasl) {
                                // Set to empty string instead of using delete
                                (importedProfile as KafkaConnectionProfile).connectionParams.sasl!.password = '';
                            }
                        }
                        break;

                    case 'activemq':
                        // If connect headers are provided and there's a passcode, save it securely
                        if ((importedProfile as ActiveMQConnectionProfile).connectionParams?.connectHeaders &&
                            (importedProfile as ActiveMQConnectionProfile).connectionParams.connectHeaders!.passcode) {
                            const passcode = (importedProfile as ActiveMQConnectionProfile).connectionParams.connectHeaders!.passcode;
                            if (passcode) {
                                await this.context.secrets.store(`mqexplorer.password.${importedProfile.id}`, passcode);
                            }

                            // Remove passcode from the profile object
                            if ((importedProfile as ActiveMQConnectionProfile).connectionParams.connectHeaders) {
                                // Use delete instead of setting to undefined to avoid type issues
                                delete (importedProfile as ActiveMQConnectionProfile).connectionParams.connectHeaders!.passcode;
                            }
                        }
                        break;

                    case 'azureservicebus':
                        // If connection string is provided, save it securely
                        if ((importedProfile as AzureServiceBusConnectionProfile).connectionParams?.connectionString) {
                            const connectionString = (importedProfile as AzureServiceBusConnectionProfile).connectionParams.connectionString;
                            if (connectionString) {
                                await this.context.secrets.store(`mqexplorer.connectionstring.${importedProfile.id}`, connectionString);
                            }

                            // Remove connection string from the profile object
                            delete (importedProfile as AzureServiceBusConnectionProfile).connectionParams.connectionString;
                        }

                        // If using AAD credentials and there's a client secret, save it securely
                        if ((importedProfile as AzureServiceBusConnectionProfile).connectionParams?.useAadAuth &&
                            (importedProfile as AzureServiceBusConnectionProfile).connectionParams?.credential &&
                            (importedProfile as AzureServiceBusConnectionProfile).connectionParams.credential!.clientSecret) {
                            const clientSecret = (importedProfile as AzureServiceBusConnectionProfile).connectionParams.credential!.clientSecret;
                            if (clientSecret) {
                                await this.context.secrets.store(`mqexplorer.clientsecret.${importedProfile.id}`, clientSecret);
                            }

                            // Remove client secret from the profile object
                            if ((importedProfile as AzureServiceBusConnectionProfile).connectionParams.credential) {
                                // Use delete instead of setting to undefined to avoid type issues
                                delete (importedProfile as AzureServiceBusConnectionProfile).connectionParams.credential!.clientSecret;
                            }
                        }
                        break;

                    case 'awssqs':
                        // If credentials are provided and there's a secret access key, save it securely
                        if ((importedProfile as AWSSQSConnectionProfile).connectionParams?.credentials &&
                            (importedProfile as AWSSQSConnectionProfile).connectionParams.credentials!.secretAccessKey) {
                            const secretAccessKey = (importedProfile as AWSSQSConnectionProfile).connectionParams.credentials!.secretAccessKey;
                            if (secretAccessKey) {
                                await this.context.secrets.store(`mqexplorer.secretaccesskey.${importedProfile.id}`, secretAccessKey);
                            }

                            // Remove secret access key from the profile object
                            if ((importedProfile as AWSSQSConnectionProfile).connectionParams.credentials) {
                                // Set to empty string instead of using delete
                                (importedProfile as AWSSQSConnectionProfile).connectionParams.credentials!.secretAccessKey = '';
                            }
                        }
                        break;
                }

                importCount++;
            }

            // Save updated profiles
            await this.context.workspaceState.update('mqexplorer.connectionProfiles', existingProfiles);

            this.log(`Imported ${importCount} connection profiles`);
            return importCount;
        } catch (error) {
            this.log(`Error importing connection profiles: ${(error as Error).message}`, true);
            throw error;
        }
    }

    /**
     * Log a message to the output channel
     */
    private log(message: string, isError: boolean = false): void {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] ${message}`;

        this.outputChannel.appendLine(logMessage);

        if (isError) {
            console.error(logMessage);
        } else {
            console.log(logMessage);
        }
    }
}
