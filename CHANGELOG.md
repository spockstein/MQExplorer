# Change Log

All notable changes to the "mqexplorer" extension will be documented in this file.

## [0.0.1] - 2023-10-15

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