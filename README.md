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

<p align="center">
  <b>Your universal messaging system explorer directly in VS Code</b>
</p>

MQExplorer is a powerful Visual Studio Code extension for browsing and managing message queues across multiple messaging providers, including IBM MQ, RabbitMQ, Kafka, ActiveMQ, Azure Service Bus, and AWS SQS.

## ✨ Key Features

### 🌐 Multi-Provider Support
Connect to all major messaging systems from a single interface:

- **IBM MQ** - Connect to queue managers with full authentication options
- **RabbitMQ** - Connect to brokers with vhost support
- **Apache Kafka** - Connect to Kafka clusters with SASL authentication
- **ActiveMQ** - Connect to brokers with STOMP protocol
- **Azure Service Bus** - Connect using connection strings or Azure AD
- **AWS SQS** - Connect using AWS credentials or IAM profiles

<p align="center">
  <i>[Screenshot: MQExplorer provider selection interface]</i>
</p>

### 📋 Queue and Topic Management
- Browse queues and topics across all connected messaging systems
- View queue properties, depth, and status information
- Filter and search for specific queues/topics
- Clear queues with a single click
- Refresh queue information on demand

<p align="center">
  <i>[Screenshot: MQExplorer queue browser interface]</i>
</p>

### 📨 Message Operations
- **Browse Messages** - Non-destructively view messages with real timestamps
- **Put Messages** - Send new messages with customizable properties
- **Delete Messages** - Remove individual messages or clear entire queues with improved reliability
- **Save Messages** - Export message content to files
- **View Formats** - See messages in text, hex, JSON, or XML formats
- **Auto-Refresh** - Message lists automatically update after put/delete/clear operations

<p align="center">
  <i>[Screenshot: MQExplorer message browser interface]</i>
</p>

### 🔒 Secure Connection Management
- Create and save connection profiles for all supported providers
- Test connections before saving
- Securely store credentials using VS Code's Secret Storage
- Import/export connection profiles for team sharing

## 📋 Requirements

- Visual Studio Code 1.100.0 or higher
- For specific messaging systems:
  - **IBM MQ**: Access to an IBM MQ server and appropriate permissions
  - **RabbitMQ**: Access to a RabbitMQ broker
  - **Kafka**: Access to a Kafka cluster
  - **ActiveMQ**: Access to an ActiveMQ broker with STOMP support
  - **Azure Service Bus**: An Azure subscription with Service Bus namespace
  - **AWS SQS**: AWS account with SQS access

## 🚀 Installation

1. Install the extension from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=PraxAI.mqexplorer)
2. Click the MQExplorer icon in the Activity Bar
3. Click the "+" button to add a new connection profile
4. Select the messaging provider type you want to connect to
5. Fill in the connection details for your messaging system
6. Click "Test Connection" to verify your settings
7. Click "Save" to save the connection profile
8. Click the "Connect" button to connect to the messaging system

<p align="center">
  <i>[Screenshot: MQExplorer installation steps]</i>
</p>

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
   - **Known Queues** (optional): Pre-configure queue names for faster discovery and fallback when dynamic discovery fails

```
Example:
Queue Manager: QM1
Host: localhost
Port: 1414
Channel: DEV.APP.SVRCONN
```

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

## 💻 Usage Examples

### Browsing Messages

1. Connect to your messaging system
2. Click on a queue/topic in the tree view
3. Click "Browse Messages" in the context menu
4. View message content and properties in the message browser
5. Use the format selector to view in different formats (Text, Hex, JSON, XML)

<p align="center">
  <i>[Screenshot: Browsing messages in MQExplorer]</i>
</p>

### Putting Messages

1. Connect to your messaging system
2. Click on a queue/topic in the tree view
3. Click "Put Message" in the context menu
4. Enter message content in the editor
5. Set message properties as needed
6. Click "Send" to put the message to the queue/topic

<p align="center">
  <i>[Screenshot: Putting messages with MQExplorer]</i>
</p>

### Deleting Messages

1. Connect to your messaging system
2. Browse messages in a queue/topic
3. Select one or more messages in the message browser
4. Right-click and select "Delete Selected Messages"
5. Confirm the deletion when prompted

## ⚙️ Configuration Options

| Setting | Description | Default |
|---------|-------------|---------|
| `mqexplorer.messageSizeLimit` | Maximum size of messages to display | `1048576` (1MB) |
| `mqexplorer.defaultMessageFormat` | Default format for message display | `text` |
| `mqexplorer.autoRefreshInterval` | Auto-refresh interval in seconds | `0` (disabled) |
| `mqexplorer.connectionTimeout` | Connection timeout in seconds | `30` |
| `mqexplorer.showStatusBarItem` | Show/hide the status bar item | `true` |

## 🔧 Commands

| Command | Description |
|---------|-------------|
| `mqexplorer.addConnectionProfile` | Add a new connection profile |
| `mqexplorer.connect` | Connect to a messaging system |
| `mqexplorer.disconnect` | Disconnect from a messaging system |
| `mqexplorer.browseMessages` | Browse messages in a queue/topic |
| `mqexplorer.putMessage` | Put a message to a queue/topic |
| `mqexplorer.clearQueue` | Clear all messages from a queue |
| `mqexplorer.refreshTreeView` | Refresh the tree view |

## 🔒 Privacy & Security

- **Secure Credential Storage**: All connection credentials are stored securely using VS Code's Secret Storage
- **No Telemetry**: MQExplorer does not collect usage data
- **Local Processing**: All message operations are performed directly between your machine and the messaging systems

## 📝 Release Notes

See the [CHANGELOG.md](CHANGELOG.md) for detailed release notes.

### Latest Release: v0.2.0

Major improvements and new features:
- **Known Queues Configuration**: Pre-configure queue names for faster discovery and fallback
- **Optimized Queue Discovery**: Significant performance improvements for IBM MQ connections
- **Fixed Message Delete Operations**: Reliable message deletion with proper error handling
- **Automatic Message List Refresh**: UI automatically updates after put/delete/clear operations
- **Real IBM MQ Timestamps**: Display actual message timestamps from MQMD instead of browse time
- Enhanced connection management for all supported messaging systems
- Improved error handling and user feedback

## 📄 License

This extension is licensed under the [MIT License](LICENSE).

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request or open an Issue on our [GitHub repository](https://github.com/spockstein/mqexplorer).

---

<p align="center">
  <b>Simplify your messaging system management with MQExplorer - all your queues, one tool.</b>
</p>

> **Note:** This extension is actively maintained. Visit our [GitHub repository](https://github.com/spockstein/mqexplorer) to contribute, report issues, or learn more.
>
> **Note:** Screenshots in this README will be updated with actual images in the next release.

**Enjoy messaging made easy with MQExplorer!**
