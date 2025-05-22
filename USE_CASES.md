# MQExplorer Common Use Cases

This document provides examples of common use cases for the MQExplorer extension, demonstrating how to accomplish specific tasks across different messaging systems.

## Table of Contents

1. [Application Development](#application-development)
2. [Testing and Debugging](#testing-and-debugging)
3. [System Monitoring](#system-monitoring)
4. [Message Flow Troubleshooting](#message-flow-troubleshooting)
5. [Data Migration](#data-migration)
6. [Provider-Specific Examples](#provider-specific-examples)

## Application Development

### Creating a Test Message Queue

When developing applications that use message queues, you often need to create and test with sample queues:

1. **IBM MQ Example**:
   ```
   1. Connect to your IBM MQ queue manager
   2. Use the MQ Explorer to verify the queue exists
   3. Put test messages to the queue
   4. Verify your application can process these messages
   ```

2. **RabbitMQ Example**:
   ```
   1. Connect to your RabbitMQ broker
   2. Browse existing queues
   3. Put test messages with specific routing keys
   4. Verify message delivery to the correct queues
   ```

3. **Kafka Example**:
   ```
   1. Connect to your Kafka cluster
   2. Browse topics and partitions
   3. Put test messages with specific keys
   4. Verify consumer group offsets
   ```

### Developing Message Producers

When developing applications that produce messages:

1. **Testing Message Format**:
   ```
   1. Put a message using MQExplorer
   2. Set appropriate headers and properties
   3. Browse the message to verify format
   4. Adjust your producer code based on the results
   ```

2. **Testing with Different Payload Types**:
   ```
   1. Create messages with JSON, XML, and binary payloads
   2. Put these messages to your queue/topic
   3. Verify your consumer can handle all formats
   ```

### Developing Message Consumers

When developing applications that consume messages:

1. **Verifying Message Processing**:
   ```
   1. Put test messages with MQExplorer
   2. Run your consumer application
   3. Verify messages are processed correctly
   4. Check if messages are removed from the queue
   ```

2. **Testing Error Handling**:
   ```
   1. Put malformed messages using MQExplorer
   2. Run your consumer application
   3. Verify error handling behavior
   4. Check if messages go to dead-letter queues
   ```

## Testing and Debugging

### Simulating Production Scenarios

Use MQExplorer to simulate production scenarios in your development environment:

1. **Load Testing**:
   ```
   1. Create a script to put multiple messages
   2. Monitor queue depth during processing
   3. Identify performance bottlenecks
   ```

2. **Error Scenario Testing**:
   ```
   1. Put messages with invalid formats or properties
   2. Monitor application behavior
   3. Verify error handling and recovery
   ```

### Debugging Message Flow Issues

When messages aren't flowing as expected:

1. **Tracing Message Path**:
   ```
   1. Put a message with a unique correlation ID
   2. Monitor queues along the expected path
   3. Identify where the message stops or deviates
   ```

2. **Checking Message Properties**:
   ```
   1. Browse messages in the queue
   2. Examine headers and properties
   3. Verify routing information is correct
   ```

## System Monitoring

### Monitoring Queue Depths

Keep an eye on queue depths to prevent bottlenecks:

1. **Regular Monitoring**:
   ```
   1. Connect to your messaging system
   2. Check queue depths periodically
   3. Set up alerts for queues exceeding thresholds
   ```

2. **Identifying Stuck Queues**:
   ```
   1. Look for queues with growing depth
   2. Browse messages to identify patterns
   3. Check consumer applications
   ```

### Checking Dead Letter Queues

Regularly monitor dead letter queues for failed messages:

1. **IBM MQ Example**:
   ```
   1. Connect to your queue manager
   2. Browse the SYSTEM.DEAD.LETTER.QUEUE
   3. Examine message headers for reason codes
   4. Reprocess or handle failed messages
   ```

2. **RabbitMQ Example**:
   ```
   1. Connect to your RabbitMQ broker
   2. Check queues with ".dlq" or ".dead" suffixes
   3. Examine message headers for failure information
   ```

## Message Flow Troubleshooting

### Finding Lost Messages

When messages appear to be lost in the system:

1. **Tracing with Correlation IDs**:
   ```
   1. Put a test message with a unique correlation ID
   2. Check all queues in the message flow path
   3. Look for the message in dead letter queues
   4. Check application logs for processing errors
   ```

2. **Checking Alternate Destinations**:
   ```
   1. Identify all possible routing paths
   2. Check queues on alternate paths
   3. Verify routing rules and conditions
   ```

### Diagnosing Slow Processing

When message processing is slower than expected:

1. **Queue Depth Analysis**:
   ```
   1. Monitor queue depths over time
   2. Identify queues with growing backlogs
   3. Check consumer applications for those queues
   ```

2. **Message Age Analysis**:
   ```
   1. Browse messages and check timestamps
   2. Identify old messages that haven't been processed
   3. Check consumer application performance
   ```

## Data Migration

### Migrating Between Queue Managers

When migrating messages between queue managers:

1. **Export-Import Process**:
   ```
   1. Browse messages from the source queue
   2. Save messages to files
   3. Connect to the destination queue manager
   4. Put messages from files to the destination queue
   ```

### Migrating Between Different Messaging Systems

When migrating from one messaging system to another:

1. **IBM MQ to RabbitMQ Example**:
   ```
   1. Connect to IBM MQ
   2. Browse and save messages
   3. Connect to RabbitMQ
   4. Put messages with appropriate property mapping
   ```

2. **RabbitMQ to Kafka Example**:
   ```
   1. Connect to RabbitMQ
   2. Browse and save messages
   3. Connect to Kafka
   4. Put messages with appropriate key mapping
   ```

## Provider-Specific Examples

### IBM MQ

1. **Working with Topics**:
   ```
   1. Connect to your queue manager
   2. Browse the topic tree
   3. Publish messages to specific topics
   4. Verify subscription delivery
   ```

2. **Managing Channels**:
   ```
   1. View channel status
   2. Identify problematic channels
   3. Check channel authentication records
   ```

### RabbitMQ

1. **Working with Exchanges**:
   ```
   1. Connect to your RabbitMQ broker
   2. View exchange bindings
   3. Publish messages to exchanges
   4. Verify routing to queues
   ```

2. **Managing Vhosts**:
   ```
   1. Connect to different vhosts
   2. Compare queue configurations
   3. Migrate messages between vhosts
   ```

### Kafka

1. **Working with Consumer Groups**:
   ```
   1. Connect to your Kafka cluster
   2. View consumer group offsets
   3. Reset offsets for testing
   4. Monitor consumer lag
   ```

2. **Managing Partitions**:
   ```
   1. View partition distribution
   2. Put messages to specific partitions
   3. Monitor partition balance
   ```

### Azure Service Bus

1. **Working with Topics and Subscriptions**:
   ```
   1. Connect to your Service Bus namespace
   2. Browse topics and subscriptions
   3. Publish messages with specific properties
   4. Verify subscription filtering
   ```

2. **Using Sessions**:
   ```
   1. Put messages with session IDs
   2. Browse messages by session
   3. Verify session handling
   ```

### AWS SQS

1. **Working with Standard and FIFO Queues**:
   ```
   1. Connect to your SQS queues
   2. Compare message delivery in standard vs. FIFO queues
   3. Test message deduplication in FIFO queues
   ```

2. **Using Message Attributes**:
   ```
   1. Put messages with custom attributes
   2. Browse messages and view attributes
   3. Test filtering by attribute
   ```

These examples demonstrate how MQExplorer can be used in various scenarios across different messaging systems. For more detailed instructions on specific tasks, please refer to the [User Guide](USERGUIDE.md).
