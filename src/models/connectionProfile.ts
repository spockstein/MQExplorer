/**
 * Represents a connection profile for an MQ provider
 */
export interface ConnectionProfile {
    id: string;
    name: string;
    providerType: string;
    connectionParams: Record<string, any>;
}

/**
 * Represents an IBM MQ connection profile
 */
export interface IBMMQConnectionProfile extends ConnectionProfile {
    providerType: 'ibmmq';
    connectionParams: {
        queueManager: string;
        host: string;
        port: number;
        channel: string;
        username?: string;
        password?: string; // password is stored separately in SecretStorage
        useTLS?: boolean;
        tlsOptions?: {
            keystore?: string;
            keystorePassword?: string; // stored in SecretStorage
            truststore?: string;
        };
    };
}

/**
 * Represents a RabbitMQ connection profile
 */
export interface RabbitMQConnectionProfile extends ConnectionProfile {
    providerType: 'rabbitmq';
    connectionParams: {
        host: string;
        port: number;
        vhost?: string;
        username?: string;
        password?: string; // password is stored separately in SecretStorage
        useTLS?: boolean;
        tlsOptions?: {
            ca?: string;
            cert?: string;
            key?: string;
            passphrase?: string; // stored in SecretStorage
            rejectUnauthorized?: boolean;
        };
    };
}

/**
 * Represents a Kafka connection profile
 */
export interface KafkaConnectionProfile extends ConnectionProfile {
    providerType: 'kafka';
    connectionParams: {
        brokers: string[]; // Array of broker addresses (host:port)
        clientId?: string;
        ssl?: boolean;
        sasl?: {
            mechanism: 'plain' | 'scram-sha-256' | 'scram-sha-512';
            username: string;
            password: string; // password is stored separately in SecretStorage
        };
        connectionTimeout?: number; // in milliseconds
        authenticationTimeout?: number; // in milliseconds
    };
}

/**
 * Represents an ActiveMQ connection profile
 */
export interface ActiveMQConnectionProfile extends ConnectionProfile {
    providerType: 'activemq';
    connectionParams: {
        host: string;
        port: number;
        connectHeaders?: {
            host?: string;
            login?: string;
            passcode?: string; // password is stored separately in SecretStorage
            'heart-beat'?: string;
            'accept-version'?: string;
        };
        ssl?: boolean;
        connectTimeout?: number;
        reconnectOpts?: {
            maxReconnects?: number;
            initialReconnectDelay?: number;
            maxReconnectDelay?: number;
            useExponentialBackOff?: boolean;
            maxReconnectAttempts?: number;
        };
    };
}

/**
 * Represents an Azure Service Bus connection profile
 */
export interface AzureServiceBusConnectionProfile extends ConnectionProfile {
    providerType: 'azureservicebus';
    connectionParams: {
        connectionString?: string; // Connection string is stored separately in SecretStorage
        fullyQualifiedNamespace?: string;
        entityPath?: string; // Queue or topic name
        credential?: {
            clientId?: string;
            clientSecret?: string; // Client secret is stored separately in SecretStorage
            tenantId?: string;
        };
        retryOptions?: {
            maxRetries?: number;
            maxRetryDelayInMs?: number;
            retryDelayInMs?: number;
            mode?: 'exponential' | 'fixed';
        };
        useAadAuth?: boolean; // Whether to use Azure Active Directory authentication
    };
}

/**
 * Represents an AWS SQS connection profile
 */
export interface AWSSQSConnectionProfile extends ConnectionProfile {
    providerType: 'awssqs';
    connectionParams: {
        region: string;
        credentials?: {
            accessKeyId: string;
            secretAccessKey: string; // Secret key is stored separately in SecretStorage
            sessionToken?: string;
        };
        endpoint?: string; // Custom endpoint URL (for local testing or non-AWS endpoints)
        queueUrlPrefix?: string; // Prefix for queue URLs (e.g., https://sqs.us-east-1.amazonaws.com/123456789012)
        maxRetries?: number;
        retryMode?: 'standard' | 'adaptive';
        useProfileCredentials?: boolean; // Whether to use AWS credentials from the shared credentials file
        profile?: string; // Profile name in the shared credentials file
    };
}
