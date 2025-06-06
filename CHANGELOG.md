# Change Log

All notable changes to the "mqexplorer" extension will be documented in this file.

## [0.0.1] - 2025-05-15

### Added
- Initial release with basic IBM MQ functionality
- Connection management for IBM MQ
  - Create, edit, and delete connection profiles
  - Securely store credentials
  - Connect to and disconnect from queue managers
- Queue Explorer
  - Browse queues in a connected queue manager
  - View queue properties
  - Clear queues
- Message Browsing
  - Browse messages in a queue (non-destructive peek)
  - View message payload in text or hex format
  - View message properties and headers
  - Save message payload to a file
- Message Publishing
  - Put messages to queues
  - Set message properties (correlation ID, reply-to queue, etc.)
  - Load message payload from a file

  ## [0.0.2] - 2025-05-16
  ### Added
  - Support for multiple messaging providers (RabbitMQ, Kafka, ActiveMQ, Azure Service Bus, AWS SQS)
  - Provider-specific connection profiles and forms
  - Provider-specific message browsing and putting
  - Provider-specific queue and topic management
  - Provider-specific channel management
  - Provider-specific message properties and headers
  - Provider-specific message formats (JSON, XML, etc.)
  - Provider-specific security features (TLS, authentication, etc.)

  ##  [0.0.3] - 2025-05-17
  ### Added
  - Support for message filtering and searching
  - Support for batch operations (delete multiple messages, etc.)
  - Support for message templates
  - Support for message tracing and debugging
  - Support for performance optimization (pagination, etc.)
  - Support for integration with development workflow (e.g., testing, debugging)
  - Support for customization and settings
  - Support for documentation and troubleshooting
  - Support for testing and refinement

  ## [0.0.6] - 2025-05-20
  ### Added 
  - Bug fixes
  - Refactoring
  - Code cleanup
  - Performance improvements
  - Documentation updates
  - Testing improvements

  ## [0.0.7] - 2025-05-21
  ### Added 
  - Bug fixes
  - Refactoring
  - Code cleanup
  - Performance improvements
  - Documentation updates
  - Testing improvements

  ## [0.0.8] - 2025-05-30
  ### Added
  - Enhance non-admin queue discovery with PCF pattern-based approach

  ## [0.0.9] - 2025-06-04
  ### Added
  - Bug fixes and icon update

### [0.1.3] - 2025-06-06
### Added
- Bug fixes and performance improvements
- known queues support for IBM MQ connection profile with validation and UI enhancements