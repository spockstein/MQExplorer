# MQExplorer Video Tutorial Plan

This document outlines the plan for creating video tutorials to help users get started with MQExplorer and learn how to use its features effectively.

## Tutorial Series Overview

The tutorial series will consist of the following videos:

1. **Introduction to MQExplorer**
2. **Getting Started with MQExplorer**
3. **Working with IBM MQ**
4. **Working with RabbitMQ**
5. **Working with Kafka**
6. **Working with ActiveMQ**
7. **Working with Azure Service Bus**
8. **Working with AWS SQS**
9. **Advanced Features and Tips**

## Video Specifications

- **Length**: 5-10 minutes per video
- **Resolution**: 1920x1080 (Full HD)
- **Format**: MP4
- **Audio**: Clear narration with minimal background noise
- **Captions**: Include subtitles for accessibility

## Detailed Video Outlines

### 1. Introduction to MQExplorer

**Duration**: 5 minutes

**Outline**:
1. Introduction (0:00-0:30)
   - Welcome and presenter introduction
   - Purpose of the tutorial series

2. What is MQExplorer? (0:30-1:30)
   - Overview of the extension
   - Key features and benefits
   - Supported messaging systems

3. Use Cases (1:30-3:00)
   - Application development
   - Testing and debugging
   - System monitoring
   - Message flow troubleshooting

4. Installation (3:00-4:00)
   - Installing from VS Code Marketplace
   - First-time setup

5. What's Coming Next (4:00-5:00)
   - Preview of the tutorial series
   - How to get support

### 2. Getting Started with MQExplorer

**Duration**: 8 minutes

**Outline**:
1. Introduction (0:00-0:30)
   - Brief recap of what MQExplorer is

2. The MQExplorer Interface (0:30-2:00)
   - Activity bar icon
   - Connection profiles view
   - Queue/topic browser
   - Message browser

3. Creating Your First Connection Profile (2:00-4:00)
   - Adding a new connection profile
   - Selecting a provider type
   - Filling in connection details
   - Testing the connection
   - Saving the profile

4. Connecting to a Messaging System (4:00-5:30)
   - Connecting to a saved profile
   - Browsing queues/topics
   - Viewing queue properties

5. Basic Operations (5:30-7:30)
   - Browsing messages
   - Putting a simple message
   - Refreshing queues

6. Conclusion (7:30-8:00)
   - Recap of what we've learned
   - Preview of next tutorial

### 3. Working with IBM MQ

**Duration**: 10 minutes

**Outline**:
1. Introduction (0:00-0:30)
   - Brief overview of IBM MQ

2. Setting Up an IBM MQ Connection (0:30-2:30)
   - Creating an IBM MQ connection profile
   - Queue manager details
   - Channel and authentication options
   - TLS configuration

3. Browsing IBM MQ Queues (2:30-4:00)
   - Local queues
   - Remote queues
   - Alias queues
   - Model queues

4. Working with Messages (4:00-7:00)
   - Browsing messages in a queue
   - Message formats and properties
   - Putting messages with IBM MQ-specific properties
   - Handling message headers

5. Queue Management (7:00-9:00)
   - Viewing queue properties
   - Clearing queues
   - Monitoring queue depth

6. Troubleshooting IBM MQ Connections (9:00-10:00)
   - Common connection issues
   - Checking channel status
   - Verifying permissions

### 4. Working with RabbitMQ

**Duration**: 8 minutes

**Outline**:
1. Introduction (0:00-0:30)
   - Brief overview of RabbitMQ

2. Setting Up a RabbitMQ Connection (0:30-2:00)
   - Creating a RabbitMQ connection profile
   - Host and virtual host configuration
   - Authentication options

3. Working with RabbitMQ Queues (2:00-4:00)
   - Browsing queues
   - Queue properties
   - Exchanges and bindings

4. Message Operations (4:00-6:30)
   - Browsing messages
   - Publishing messages with routing keys
   - Setting message properties

5. RabbitMQ-Specific Features (6:30-7:30)
   - Working with different exchange types
   - Message persistence options

6. Conclusion (7:30-8:00)
   - Recap and tips

### 5. Working with Kafka

**Duration**: 9 minutes

**Outline**:
1. Introduction (0:00-0:30)
   - Brief overview of Apache Kafka

2. Setting Up a Kafka Connection (0:30-2:30)
   - Creating a Kafka connection profile
   - Broker configuration
   - Authentication options (SASL)
   - SSL/TLS setup

3. Working with Kafka Topics (2:30-4:30)
   - Browsing topics
   - Viewing partitions
   - Consumer groups

4. Message Operations (4:30-7:00)
   - Browsing messages in topics
   - Publishing messages with keys
   - Setting message headers

5. Kafka-Specific Features (7:00-8:30)
   - Working with offsets
   - Partition selection
   - Message retention

6. Conclusion (8:30-9:00)
   - Recap and tips

### 6. Working with ActiveMQ

**Duration**: 7 minutes

**Outline**:
1. Introduction (0:00-0:30)
   - Brief overview of ActiveMQ

2. Setting Up an ActiveMQ Connection (0:30-2:00)
   - Creating an ActiveMQ connection profile
   - STOMP protocol configuration
   - Authentication options

3. Working with ActiveMQ Destinations (2:00-3:30)
   - Queues vs. topics
   - Browsing destinations
   - Destination properties

4. Message Operations (3:30-5:30)
   - Browsing messages
   - Publishing messages
   - Setting message properties

5. ActiveMQ-Specific Features (5:30-6:30)
   - Virtual topics
   - Composite destinations
   - Message selectors

6. Conclusion (6:30-7:00)
   - Recap and tips

### 7. Working with Azure Service Bus

**Duration**: 8 minutes

**Outline**:
1. Introduction (0:00-0:30)
   - Brief overview of Azure Service Bus

2. Setting Up an Azure Service Bus Connection (0:30-2:30)
   - Creating an Azure Service Bus connection profile
   - Connection string vs. Azure AD authentication
   - Namespace configuration

3. Working with Service Bus Entities (2:30-4:00)
   - Queues
   - Topics and subscriptions
   - Entity properties

4. Message Operations (4:00-6:00)
   - Browsing messages
   - Sending messages
   - Setting message properties
   - Sessions and partitioning

5. Azure-Specific Features (6:00-7:30)
   - Message scheduling
   - Dead-letter queues
   - Auto-forwarding

6. Conclusion (7:30-8:00)
   - Recap and tips

### 8. Working with AWS SQS

**Duration**: 7 minutes

**Outline**:
1. Introduction (0:00-0:30)
   - Brief overview of AWS SQS

2. Setting Up an AWS SQS Connection (0:30-2:00)
   - Creating an AWS SQS connection profile
   - Authentication options
   - Region configuration

3. Working with SQS Queues (2:00-3:30)
   - Standard vs. FIFO queues
   - Queue attributes
   - Visibility timeout

4. Message Operations (3:30-5:30)
   - Browsing messages
   - Sending messages
   - Message attributes
   - Message groups (FIFO)

5. AWS-Specific Features (5:30-6:30)
   - Long polling
   - Dead-letter queues
   - Message retention

6. Conclusion (6:30-7:00)
   - Recap and tips

### 9. Advanced Features and Tips

**Duration**: 10 minutes

**Outline**:
1. Introduction (0:00-0:30)
   - Overview of advanced features

2. Working with Multiple Providers (0:30-2:00)
   - Switching between connections
   - Comparing messaging systems
   - Migration strategies

3. Message Filtering and Search (2:00-3:30)
   - Filtering messages by properties
   - Searching message content
   - Regular expressions

4. Batch Operations (3:30-5:00)
   - Selecting multiple messages
   - Batch delete
   - Batch export

5. Performance Optimization (5:00-6:30)
   - Working with large queues
   - Pagination strategies
   - Connection management

6. Integration with Development Workflow (6:30-8:00)
   - Using MQExplorer during development
   - Testing message flows
   - Debugging with MQExplorer

7. Customization and Settings (8:00-9:30)
   - Configuring MQExplorer
   - Keyboard shortcuts
   - Theme integration

8. Conclusion (9:30-10:00)
   - Final tips and resources
   - Community support

## Production Plan

1. **Script Writing**: Create detailed scripts for each video
2. **Screen Recording**: Record VS Code with MQExplorer in action
3. **Narration**: Record clear audio narration
4. **Editing**: Combine screen recording with narration, add captions
5. **Review**: Test videos with users for clarity and completeness
6. **Publishing**: Upload to YouTube and link from documentation

## Distribution

- Embed videos in the documentation website
- Create a YouTube playlist
- Link videos from the VS Code Marketplace listing
- Share on social media and developer communities

## Timeline

- **Week 1**: Script writing and preparation
- **Week 2**: Recording and initial editing
- **Week 3**: Final editing, review, and revisions
- **Week 4**: Publishing and distribution

## Equipment and Software Needs

- **Screen Recording**: OBS Studio or Camtasia
- **Audio Recording**: Good quality microphone with pop filter
- **Video Editing**: Adobe Premiere Pro or DaVinci Resolve
- **Test Environments**: Set up all messaging systems for demonstrations
