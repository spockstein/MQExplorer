# MQExplorer for VS Code

<p align="center">
  <pre>
 __  __  ___  _____            _                     
|  \/  |/ _ \| ____|_  ___ __ | | ___  _ __ ___ _ __ 
| |\/| | | | |  _| \ \/ / '_ \| |/ _ \| '__/ _ \ '__|
| |  | | |_| | |___ >  <| |_) | | (_) | | |  __/ |   
|_|  |_|\__\_\_____/_/\_\ .__/|_|\___/|_|  \___|_|   
                        |_|                          
  </pre>
</p>          

**Your universal messaging system explorer directly in VS Code**

MQExplorer is a powerful Visual Studio Code extension that brings comprehensive message queue management capabilities directly into your development environment. Connect to multiple messaging systems, browse queues/topics, view and manipulate messages, all without leaving your editor.

## ✨ Key Features

### 🌐 Multi-Provider Support

Connect to all major messaging systems from a single interface:

* **IBM MQ** - Connect to queue managers with full authentication options
* **RabbitMQ** - Connect to brokers with vhost support
* **Apache Kafka** - Connect to Kafka clusters with SASL authentication
* **ActiveMQ** - Connect to brokers with STOMP protocol
* **Azure Service Bus** - Connect using connection strings or Azure AD
* **AWS SQS** - Connect using AWS credentials or IAM profiles

![Provider Selection](images/provider-selection.png)

### 📋 Queue and Topic Management

* Browse queues and topics across all connected messaging systems
* View queue properties, depth, and status information
* Filter and search for specific queues/topics
* Clear queues with a single click
* Refresh queue information on demand

![Queue Browser](images/queue-browser.png)

### 📨 Message Operations

* **Browse Messages** - Non-destructively view messages in queues/topics
* **Put Messages** - Send new messages with customizable properties
* **Delete Messages** - Remove individual messages or clear entire queues
* **Save Messages** - Export message content to files
* **View Formats** - See messages in text, hex, JSON, or XML formats

![Message Browser](images/message-browser.png)

### 🔒 Secure Connection Management

* Create and save connection profiles for all supported providers
* Test connections before saving
* Securely store credentials using VS Code's Secret Storage
* Import/export connection profiles for team sharing

![Connection Management](images/connection-management.png)

## 📋 Requirements

* Visual Studio Code 1.100.0 or higher
* For specific messaging systems:
  * **IBM MQ**: Access to an IBM MQ server and appropriate permissions
  * **RabbitMQ**: Access to a RabbitMQ broker
  * **Kafka**: Access to a Kafka cluster
  * **ActiveMQ**: Access to an ActiveMQ broker with STOMP support
  * **Azure Service Bus**: An Azure subscription with Service Bus namespace
  * **AWS SQS**: AWS account with SQS access

## 🚀 Installation

1. Install the extension from the VS Code Marketplace
2. Click the MQExplorer icon in the Activity Bar
3. Click the "+" button to add a new connection profile
4. Select the messaging provider type you want to connect to
5. Fill in the connection details for your messaging system
6. Click "Test Connection" to verify your settings
7. Click "Save" to save the connection profile
8. Click the "Connect" button to connect to the messaging system

![Installation Steps](images/installation-steps.png)

## 🛠️ Setup Guide

### IBM MQ Connection

1. Select "IBM MQ" as the provider type
2. Enter the following details:
   - **Queue Manager**: The name of the queue manager
   - **Host**: The hostname or IP address of the MQ server
   - **Port**: The listener port (default: 1414)
   - **Channel**: The server connection channel (e.g., "SYSTEM.DEF.SVRCONN")
   - **Username** (optional): Your MQ username if authentication is required
   - **Password** (optional): Your MQ password
   - **Use TLS**: Check this if you need to use a secure connection

### RabbitMQ Connection

1. Select "RabbitMQ" as the provider type
2. Enter the following details:
   - **Host**: The hostname or IP address of the RabbitMQ server
   - **Port**: The AMQP port (default: 5672)
   - **Virtual Host**: The virtual host to connect to (default: "/")
   - **Username**: Your RabbitMQ username (default: "guest")
   - **Password**: Your RabbitMQ password (default: "guest")
   - **Use TLS**: Check this if you need to use a secure connection

### Kafka Connection

1. Select "Kafka" as the provider type
2. Enter the following details:
   - **Brokers**: Comma-separated list of broker addresses (host:port)
   - **Client ID**: A unique identifier for your client (default: "mqexplorer")
   - **Use SSL/TLS**: Check this if you need to use a secure connection
   - **Use SASL Authentication**: Check this if you need to authenticate
   - **SASL Mechanism**: Select the authentication mechanism
   - **Username**: Your Kafka username
   - **Password**: Your Kafka password

### ActiveMQ Connection

1. Select "ActiveMQ" as the provider type
2. Enter the following details:
   - **Host**: The hostname or IP address of the ActiveMQ server
   - **Port**: The STOMP port (default: 61613)
   - **Use SSL/TLS**: Check this if you need to use a secure connection
   - **Login** (optional): Your ActiveMQ username
   - **Passcode** (optional): Your ActiveMQ password

### Azure Service Bus Connection

1. Select "Azure Service Bus" as the provider type
2. Choose one of the authentication methods:
   - **Connection String**: Use a connection string from the Azure portal
   - **Azure Active Directory**: Use Azure AD authentication
3. Configure retry options as needed

### AWS SQS Connection

1. Select "AWS SQS" as the provider type
2. Enter the following details:
   - **Region**: The AWS region (e.g., "us-east-1")
   - **Authentication Method**: Choose between profile credentials or direct credentials
   - Configure retry options as needed

## 💻 Usage Examples

### Browsing Messages

1. Connect to your messaging system
2. Click on a queue/topic in the tree view
3. Click "Browse Messages" in the context menu
4. View message content and properties in the message browser
5. Use the format selector to view in different formats (Text, Hex, JSON, XML)

![Browsing Messages](images/browsing-messages.png)

### Putting Messages

1. Connect to your messaging system
2. Click on a queue/topic in the tree view
3. Click "Put Message" in the context menu
4. Enter message content in the editor
5. Set message properties as needed
6. Click "Send" to put the message to the queue/topic

![Putting Messages](images/putting-messages.png)

### Deleting Messages

1. Connect to your messaging system
2. Browse messages in a queue/topic
3. Select one or more messages in the message browser
4. Right-click and select "Delete Selected Messages"
5. Confirm the deletion when prompted

![Deleting Messages](images/deleting-messages.png)

## ⚙️ Configuration Options

MQExplorer provides several configuration options to customize your experience:

* **Message View Size Limit**: Control the maximum size of messages to display
* **Default Message Format**: Set your preferred message format (Text, Hex, JSON, XML)
* **Auto-Refresh Interval**: Configure how often queue information is refreshed
* **Connection Timeout**: Set the timeout for connection attempts

## 📚 Documentation

For more detailed information, please refer to:

* [User Guide](https://example.com/mqexplorer/docs/user-guide)
* [Provider-Specific Guides](https://example.com/mqexplorer/docs/providers)
* [Common Use Cases](https://example.com/mqexplorer/docs/use-cases)
* [Troubleshooting](https://example.com/mqexplorer/docs/troubleshooting)

## 📝 Release Notes

### 1.0.0

Full release with multi-provider support:
* Connection management for all supported messaging systems
* Queue/Topic browsing across providers
* Message browsing and manipulation
* Message publishing with advanced properties
* Queue management operations
* Performance improvements and bug fixes

### 0.5.0

Beta release with additional providers:
* Added support for RabbitMQ, Kafka, ActiveMQ
* Added support for Azure Service Bus and AWS SQS
* Improved message browsing and manipulation
* Enhanced error handling and connection management

### 0.0.1

Initial alpha release with basic IBM MQ functionality:
* Connection management
* Queue browsing
* Message browsing
* Message putting
* Queue clearing

## 🔒 Privacy & Security

* **Secure Credential Storage**: All connection credentials are stored securely using VS Code's Secret Storage
* **No Telemetry**: MQExplorer does not collect usage data
* **Local Processing**: All message operations are performed directly between your machine and the messaging systems

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request or open an Issue on our [GitHub repository](https://github.com/yourusername/mqexplorer).

## 📄 License

This extension is licensed under the [MIT License](LICENSE).

---

**Simplify your messaging system management with MQExplorer - all your queues, one tool.**

> **Note:** This extension is actively maintained. Visit our [GitHub repository](https://github.com/yourusername/mqexplorer) to contribute, report issues, or learn more.

**Enjoy messaging made easy with MQExplorer!**
