# MQExplorer User Guide

This comprehensive guide will help you get the most out of the MQExplorer extension for Visual Studio Code. MQExplorer allows you to connect to, browse, and manage messages across multiple messaging systems directly from your VS Code environment.

## Table of Contents

1. [Installation](#installation)
2. [Getting Started](#getting-started)
3. [Connection Management](#connection-management)
   - [IBM MQ Connections](#ibm-mq-connections)
   - [RabbitMQ Connections](#rabbitmq-connections)
   - [Kafka Connections](#kafka-connections)
   - [ActiveMQ Connections](#activemq-connections)
   - [Azure Service Bus Connections](#azure-service-bus-connections)
   - [AWS SQS Connections](#aws-sqs-connections)
4. [Browsing Queues and Topics](#browsing-queues-and-topics)
5. [Working with Messages](#working-with-messages)
   - [Browsing Messages](#browsing-messages)
   - [Putting Messages](#putting-messages)
   - [Deleting Messages](#deleting-messages)
6. [Queue Management](#queue-management)
7. [Troubleshooting](#troubleshooting)
8. [Advanced Features](#advanced-features)

## Installation

1. Open Visual Studio Code
2. Go to the Extensions view by clicking on the Extensions icon in the Activity Bar or pressing `Ctrl+Shift+X`
3. Search for "MQExplorer"
4. Click the Install button
5. Once installed, you'll see the MQExplorer icon in the Activity Bar

## Getting Started

After installing MQExplorer, you'll need to create a connection profile to connect to your messaging system:

1. Click on the MQExplorer icon in the Activity Bar
2. Click the "+" button in the MQExplorer view to add a new connection profile
3. Select the messaging provider type you want to connect to
4. Fill in the connection details (see provider-specific sections below)
5. Click "Test Connection" to verify your settings
6. Click "Save" to save the connection profile
7. Right-click on the saved profile and select "Connect" to establish a connection

## Connection Management

### IBM MQ Connections

To connect to an IBM MQ queue manager:

1. Select "IBM MQ" as the provider type
2. Enter the following details:
   - **Queue Manager**: The name of the queue manager
   - **Host**: The hostname or IP address of the MQ server
   - **Port**: The listener port (default: 1414)
   - **Channel**: The server connection channel (e.g., "SYSTEM.DEF.SVRCONN")
   - **Username** (optional): Your MQ username if authentication is required
   - **Password** (optional): Your MQ password
   - **Use TLS**: Check this if you need to use a secure connection

Example:
```
Queue Manager: QM1
Host: localhost
Port: 1414
Channel: DEV.APP.SVRCONN
Username: app
Password: password
```

### RabbitMQ Connections

To connect to a RabbitMQ broker:

1. Select "RabbitMQ" as the provider type
2. Enter the following details:
   - **Host**: The hostname or IP address of the RabbitMQ server
   - **Port**: The AMQP port (default: 5672)
   - **Virtual Host**: The virtual host to connect to (default: "/")
   - **Username**: Your RabbitMQ username (default: "guest")
   - **Password**: Your RabbitMQ password (default: "guest")
   - **Use TLS**: Check this if you need to use a secure connection

Example:
```
Host: localhost
Port: 5672
Virtual Host: /
Username: guest
Password: guest
```

### Kafka Connections

To connect to a Kafka cluster:

1. Select "Kafka" as the provider type
2. Enter the following details:
   - **Brokers**: Comma-separated list of broker addresses (host:port)
   - **Client ID**: A unique identifier for your client (default: "mqexplorer")
   - **Use SSL/TLS**: Check this if you need to use a secure connection
   - **Use SASL Authentication**: Check this if you need to authenticate
   - **SASL Mechanism**: Select the authentication mechanism (PLAIN, SCRAM-SHA-256, SCRAM-SHA-512)
   - **Username**: Your Kafka username
   - **Password**: Your Kafka password
   - **Connection Timeout**: Timeout in milliseconds (default: 30000)
   - **Authentication Timeout**: Timeout in milliseconds (default: 10000)

Example:
```
Brokers: localhost:9092
Client ID: mqexplorer
Use SSL/TLS: No
Use SASL Authentication: No
```

### ActiveMQ Connections

To connect to an ActiveMQ broker:

1. Select "ActiveMQ" as the provider type
2. Enter the following details:
   - **Host**: The hostname or IP address of the ActiveMQ server
   - **Port**: The STOMP port (default: 61613)
   - **Use SSL/TLS**: Check this if you need to use a secure connection
   - **Login** (optional): Your ActiveMQ username
   - **Passcode** (optional): Your ActiveMQ password
   - **Host Header** (optional): The host header value
   - **Heart Beat**: Heart beat interval in milliseconds (default: "10000,10000")
   - **Accept Version**: STOMP protocol versions (default: "1.0,1.1,1.2")
   - **Connection Timeout**: Timeout in milliseconds (default: 10000)
   - **Reconnect Options**: Configure reconnection behavior

Example:
```
Host: localhost
Port: 61613
Login: admin
Passcode: admin
```

### Azure Service Bus Connections

To connect to Azure Service Bus:

1. Select "Azure Service Bus" as the provider type
2. Choose one of the authentication methods:
   - **Connection String**: Use a connection string from the Azure portal
   - **Azure Active Directory**: Use Azure AD authentication
3. For Connection String authentication:
   - **Connection String**: The connection string from the Azure portal
4. For Azure AD authentication:
   - **Fully Qualified Namespace**: The namespace (e.g., "myservicebus.servicebus.windows.net")
   - **Tenant ID**: Your Azure AD tenant ID
   - **Client ID**: Your application's client ID
   - **Client Secret**: Your application's client secret
5. Configure retry options as needed

Example (Connection String):
```
Connection String: Endpoint=sb://myservicebus.servicebus.windows.net/;SharedAccessKeyName=RootManageSharedAccessKey;SharedAccessKey=yourkey
```

### AWS SQS Connections

To connect to AWS SQS:

1. Select "AWS SQS" as the provider type
2. Enter the following details:
   - **Region**: The AWS region (e.g., "us-east-1")
   - **Authentication Method**: Choose between profile credentials or direct credentials
   - For profile credentials:
     - **Profile Name**: The name of the AWS profile (default: "default")
   - For direct credentials:
     - **Access Key ID**: Your AWS access key ID
     - **Secret Access Key**: Your AWS secret access key
     - **Session Token** (optional): Your AWS session token
   - **Custom Endpoint URL** (optional): For local development or custom endpoints
   - **Queue URL Prefix** (optional): Custom queue URL prefix
   - Configure retry options as needed

Example:
```
Region: us-east-1
Access Key ID: AKIAIOSFODNN7EXAMPLE
Secret Access Key: wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
```

## Browsing Queues and Topics

After connecting to a messaging system:

1. The queues/topics will be displayed in the MQExplorer view
2. Click on a queue/topic to see its properties in the details panel
3. Use the search box to filter queues/topics by name
4. Right-click on a queue/topic to see available actions:
   - **Browse Messages**: View messages in the queue/topic
   - **Put Message**: Send a message to the queue/topic
   - **Clear Queue**: Remove all messages from the queue
   - **Refresh**: Update the queue/topic information

## Working with Messages

### Browsing Messages

To browse messages in a queue/topic:

1. Right-click on a queue/topic and select "Browse Messages"
2. The message browser will open, showing a list of messages
3. Click on a message to view its content and properties
4. Use the format selector to view the message in different formats (Text, Hex, JSON, XML)
5. Use the "Save" button to save the message content to a file

### Putting Messages

To put a message to a queue/topic:

1. Right-click on a queue/topic and select "Put Message"
2. The message editor will open
3. Enter the message content in the editor
4. Set message properties as needed (varies by provider)
5. Click "Send" to put the message to the queue/topic
6. Alternatively, use "Load from File" to load message content from a file

### Deleting Messages

To delete messages:

1. In the message browser, select one or more messages
2. Right-click and select "Delete Selected Messages"
3. Confirm the deletion when prompted
4. To clear all messages from a queue, right-click on the queue and select "Clear Queue"

## Queue Management

MQExplorer provides various queue management features:

1. **View Queue Properties**: Click on a queue to see its properties
2. **Clear Queue**: Right-click on a queue and select "Clear Queue"
3. **Refresh Queue**: Right-click on a queue and select "Refresh"

## Troubleshooting

If you encounter issues with MQExplorer:

1. **Connection Problems**:
   - Verify your connection details
   - Check that the messaging server is running and accessible
   - Ensure you have the necessary permissions
   - Check firewall settings

2. **Message Browsing Issues**:
   - For large messages, try increasing the message size limit in settings
   - If messages appear corrupted, check the message format

3. **Performance Issues**:
   - For large queues, use filtering to limit the number of messages displayed
   - Close unused connections to free up resources

## Advanced Features

MQExplorer includes several advanced features:

1. **Export/Import Connection Profiles**: Share connection profiles between team members
2. **Message Filtering**: Filter messages by properties or content
3. **Batch Operations**: Perform operations on multiple messages at once
4. **Custom Message Properties**: Set provider-specific message properties

For more detailed information, please refer to the provider-specific documentation.
