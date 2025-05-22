# MQExplorer VS Code Extension - Task Breakdown

This document breaks down the development tasks for the MQExplorer extension. Tasks are organized by phase and feature.

## Legend:
*   `[ ]`: To Do
*   `[x]`: Done
*   `P1`: Priority 1 (Must-have for the phase)
*   `P2`: Priority 2 (Should-have for the phase)
*   `P3`: Priority 3 (Nice-to-have for the phase)

---

## Phase 1: MVP - IBM MQ Focus

### 1.1. Core Extension Setup
*   `[x] P1` Initialize VS Code Extension Project (TypeScript)
*   `[x] P1` Setup linter (ESLint), formatter (Prettier), and build scripts
*   `[x] P1` Define basic extension structure (activation, deactivation)
*   `[x] P1` Add Activity Bar icon and empty sidebar panel for MQExplorer

### 1.2. Connection Management (IBM MQ)
*   `[x] P1` Design UI for connection profile form (Webview or VS Code Quick Input)
    *   Fields: Profile Name, QM Name, Host, Port, Channel, User, Password
*   `[x] P1` Implement secure storage for passwords using `vscode.SecretStorage`
*   `[x] P1` Implement storage for connection profiles (non-sensitive parts) using `vscode.workspaceState` or `vscode.GlobalState`
*   `[x] P1` Develop `IBMMQProvider.connect()` method using `ibmmq` library
*   `[x] P1` Develop `IBMMQProvider.disconnect()` method
*   `[x] P1` UI: List saved connection profiles in the sidebar
*   `[x] P1` UI: "Add New Connection" button
*   `[x] P1` UI: "Connect/Disconnect" button per profile
*   `[x] P1` UI: "Test Connection" button for a profile
*   `[x] P2` UI: "Edit/Delete Connection Profile"

### 1.3. Queue Manager & Queue Explorer (IBM MQ)
*   `[x] P1` Implement `vscode.TreeDataProvider` for the MQ object explorer
*   `[x] P1` On successful connection, display QM as root node
*   `[x] P1` Develop `IBMMQProvider.listQueues(filter?)` method
*   `[x] P1` Display a "Queues" folder under the QM node
*   `[x] P1` List queues under the "Queues" folder
    *   Display queue name and current depth (if easily available)
*   `[x] P2` UI: Context menu on "Queues" folder: "Refresh"
*   `[x] P3` Basic filtering for queue list (e.g., by prefix)

### 1.4. Message Browsing (IBM MQ - Peek)
*   `[x] P1` UI: Context menu on Queue node: "Browse Messages (Peek)"
*   `[x] P1` Develop `IBMMQProvider.browseMessages(queueName, browseOptions)` (non-destructive peek)
*   `[x] P1` Open a new Webview or Editor Tab to display browsed messages
*   `[x] P1` Display messages in a list/table: Message ID, Correlation ID, Put Time (basic info)
*   `[x] P1` On selecting a message, display its payload (raw text) and properties/headers
*   `[x] P2` Implement basic pagination for message browsing (e.g., "Browse Next 10")
*   `[x] P2` Payload viewer: Hex View
*   `[x] P3` UI: Ability to copy Message ID, Correlation ID, payload to clipboard
*   `[x] P3` UI: Ability to save message payload to a file

### 1.5. Message Putting (IBM MQ)
*   `[x] P1` UI: Context menu on Queue node: "Put Message"
*   `[x] P1` Create a simple Webview or Quick Input dialog for putting a message
    *   Input for payload (textarea)
    *   Basic MQMD fields (e.g., ReplyToQ, CorrelId - optional for MVP)
*   `[x] P1` Develop `IBMMQProvider.putMessage(queueName, payload, properties)`
*   `[x] P2` Option to load payload from file

### 1.6. Basic Queue Operations (IBM MQ)
*   `[x] P1` UI: Context menu on Queue node: "Clear Queue" (with confirmation dialog)
*   `[x] P1` Develop `IBMMQProvider.clearQueue(queueName)`
*   `[x] P2` UI: Context menu on Queue node: "View Properties" (read-only display in webview)
*   `[x] P2` Develop `IBMMQProvider.getQueueProperties(queueName)`

### 1.7. General MVP Tasks
*   `[x] P1` Basic error handling and display messages to the user
*   `[x] P1` Add basic logging to an Output Channel
*   `[x] P1` Create `README.md` with setup and basic usage instructions
*   `[x] P1` Test MVP functionality thoroughly

---

## Phase 2: IBM MQ Enhancements

### 2.1. Advanced Message Handling
*   `[x] P2` Message Putting: Allow setting more MQMD properties and RFH2 headers
*   `[x] P1` Message Browser: Formatted viewers for JSON, XML payloads
*   `[x] P2` Message Browser: Filter messages by Message ID, Correlation ID (client-side after fetch)
*   `[ ] P3` Message Browser: Ability to get (consume) messages (with confirmation)
*   `[ ] P3` Message Templates: Save/load common message structures for putting

### 2.2. Expanded IBM MQ Object Support
*   `[x] P2` Topics: List topics under a "Topics" folder in the tree view
*   `[x] P2` Topics: Implement "Publish Message" to a topic
*   `[ ] P3` Topics: View Subscriptions for a topic
*   `[ ] P2` Channels: List channels (Client, Server Conn) under a "Channels" folder
*   `[ ] P2` Channels: Display channel status (inactive, running, retrying)
*   `[ ] P3` Channels: Start/Stop channel (if permissions allow, with strong warnings)
*   `[ ] P2` Queue/QM Properties: Display more comprehensive properties

### 2.3. UI/UX Improvements
*   `[ ] P2` Search/Filter in the main object explorer tree view
*   `[ ] P2` Command Palette integration for common actions (e.g., "MQExplorer: Connect to...")
*   `[ ] P2` Import/Export connection profiles (JSON format)
*   `[ ] P3` Settings for default browse limits, display preferences

---

## Phase 3: First Additional Provider (e.g., RabbitMQ)

### 3.1. Provider Abstraction Layer
*   `[ ] P1` Define `IMQProvider` interface (connect, disconnect, listQueues, browseMessages, putMessage, etc.)
*   `[ ] P1` Refactor existing `IBMMQProvider` to implement `IMQProvider`
*   `[ ] P1` Modify Connection Management UI to select "Provider Type" (IBM MQ, RabbitMQ)
*   `[ ] P1` Adapt connection form fields based on selected provider

### 3.2. RabbitMQ Provider Implementation
*   `[ ] P1` Add `amqplib` (or similar) as a dependency
*   `[ ] P1` Implement `RabbitMQProvider.connect()`
    *   Connection params: Host, Port, VHost, User, Password, SSL options
*   `[ ] P1` Implement `RabbitMQProvider.disconnect()`
*   `[ ] P1` Implement `RabbitMQProvider.listQueues()`
*   `[ ] P1` Implement `RabbitMQProvider.browseMessages()` (using basic.get with requeue for peek)
*   `[ ] P1` Implement `RabbitMQProvider.putMessage()`
*   `[ ] P2` Implement `RabbitMQProvider.clearQueue()`
*   `[ ] P2` Implement `RabbitMQProvider.getQueueProperties()`
*   `[ ] P2` RabbitMQ Specifics: List Exchanges, Bindings (if feasible in tree view)

### 3.3. Testing & Refinement
*   `[ ] P1` Thoroughly test both IBM MQ and RabbitMQ functionality
*   `[ ] P1` Refine UI/UX for multi-provider experience

---

## Phase 4: Further Providers & Advanced Features (Future)

*   `[ ]` **Kafka Support:**
    *   `[ ]` Add `kafkajs` dependency
    *   `[ ]` Implement `KafkaProvider` (Topics, Partitions, Consumer Groups, Publish, Consume - UI will need adaptation)
*   `[ ]` **ActiveMQ Support:**
    *   `[ ]` Add STOMP/AMQP client
    *   `[ ]` Implement `ActiveMQProvider`
*   `[ ]` **Azure Service Bus Support:**
    *   `[ ]` Add Azure SDK
    *   `[ ]` Implement `AzureSBProvider`
*   `[ ]` **AWS SQS Support:**
    *   `[ ]` Add AWS SDK
    *   `[ ]` Implement `AWSSQSProvider`
*   `[ ]` **Advanced Features:**
    *   `[ ]` DLQ Management helpers (re-put, view DLQ header)
    *   `[ ]` Batch message operations (move, delete multiple)
    *   `[ ]` Scripting interface for message manipulation/testing
    *   `[ ]` Monitoring/Dashboard elements (e.g., queue depth charts - might require external storage or be transient)
*   `[ ]` **Documentation:**
    *   `[ ]` Comprehensive user guide
    *   `[ ]` Developer guide for adding new providers
*   `[ ]` **Community Building:**
    *   `[ ]` Setup GitHub issues for bug tracking and feature requests
    *   `[ ]` Consider a Gitter/Discord channel

---
