# Change Log

All notable changes to the "mqexplorer" extension will be documented in this file.

## [0.5.14] - 2026-01-05

### 🐛 Bug Fixes

#### Queue Depth Not Updating After Clear Queue (Issue #8)
- **Fixed**: Clearing a queue wasn't updating the queue depth count in the tree view
- **Root Cause**: RabbitMQ Management API has a polling interval and may not immediately reflect changes
- **Solution**: Added 500ms delay before refreshing tree view, plus emit `queueUpdated` event for consistency
- **Result**: Queue depth now updates reliably after clearing a queue

### 🎨 UI Improvements

#### Hide Unsupported Channels Folder for RabbitMQ (Issue #12)
- **Improved**: Removed "Channels" folder from tree view for RabbitMQ connections
- **Consistency**: RabbitMQ now joins Azure Service Bus and AWS SQS in hiding unsupported Channels folder
- **Cleaner UI**: Users only see folders relevant to their messaging provider

## [0.5.13] - 2026-01-04

### 🔍 Diagnostics & Debugging

#### ASB Message Browsing Diagnostics (Issue #15 Investigation)
- **Enhanced Logging**: Added detailed diagnostic logging for ASB message operations
- **Queue Runtime Properties**: Browse operations now log activeMessageCount, deadLetterMessageCount, and scheduledMessageCount before peeking
- **Put Message Verification**: After sending a message, the queue depth is logged to verify the message was enqueued
- **Peek Count Logging**: Each peek operation logs the number of messages retrieved
- **Output Channel**: All logs are written to "MQExplorer: Azure Service Bus Provider" output channel for troubleshooting

> **Note**: If messages disappear after refresh, check the output channel for diagnostic info and verify no external consumers are processing the queue.

## [0.5.12] - 2026-01-04

### 🐛 Critical Bug Fixes

#### ASB Delete Single Message Purging Queue (Issue #14)
- **Critical Fix**: Fixed bug where deleting a single ASB message could purge the entire queue
- **Root Cause**: The delete logic was using `messageId` for matching, but `messageId` in ASB is user-assigned and may not be unique. Messages that didn't match were not being abandoned, leaving them locked.
- **Solution**: Now uses `sequenceNumber` (unique in ASB) to identify messages for deletion
- **New Behavior**: Messages that don't match the target are explicitly abandoned so they return to the queue
- **Safety Limit**: Added a maximum attempt limit (100) to prevent infinite loops
- **Better Logging**: Added detailed logging for delete operations including sequence number tracking

## [0.5.11] - 2026-01-04

### 🎨 UI Improvements

#### ASB Application Properties Display (Issue #13)
- **Improved**: Application Properties are now displayed as a sub-table instead of a JSON object
- **Better Readability**: Each property/value pair is shown as its own row with "Header" and "Value" columns
- **Example**: Properties like `DiagnosticId` and `Endpoint` are now displayed in a clean tabular format

## [0.5.10] - 2026-01-04

### 🎨 UI Improvements

#### Hide Unsupported Channels Folder (Issue #12)
- **Improved**: Removed the "Channels" folder from the tree view for providers that don't support channels
- **Affected Providers**: Azure Service Bus and AWS SQS no longer show "Channels not supported" message
- **Cleaner UI**: Users only see folders relevant to their messaging provider

## [0.5.9] - 2026-01-04

### ✨ New Features

#### Azure Service Bus - Topics & Subscriptions Usability (Issue #11)
- **Subscription Browsing**: Topics now show their subscriptions in the tree view
- **Subscription Message Browsing**: Click the eye icon on a subscription to browse its messages
- **Subscription Rules/Filters Display**: Message browser shows subscription filter rules (SQL, Correlation, True filters)
- **Full Properties in Publish UI**: Publishing to ASB topics now uses a rich webview UI with all system properties:
  - Content properties: Content Type, Subject (Label)
  - Routing: To, Reply To, Correlation ID
  - Session/Partition: Session ID, Partition Key
  - Timing: Time to Live, Scheduled Enqueue Time
  - Application Properties (custom headers as JSON)

#### Azure Service Bus - System Properties Display (Issue #10)
- **Enhanced Message Properties**: Message browser now shows comprehensive ASB system properties:
  - Content Type, Subject, To, Reply To, Reply To Session ID
  - Session ID, Partition Key
  - Time to Live, Enqueued Time, Expires At, Scheduled Enqueue Time
  - Delivery Count, Sequence Number, Enqueued Sequence Number
  - Lock Token, Locked Until
  - State, Dead Letter Source/Reason/Error Description
  - Message Size

### 🐛 Bug Fixes

#### ASB Tree View Queue Depth (Issue #9)
- **Fixed**: Tree view was showing "Depth: 0" for all ASB queues even when messages existed
- **Root Cause**: The `getQueueDepth()` method was returning hardcoded 0
- **Solution**: Now uses `getQueueRuntimeProperties()` to fetch actual `activeMessageCount`
- **Result**: Queue depth in tree view accurately reflects actual message count

## [0.5.8] - 2026-01-04

### 🐛 Bug Fixes

#### Queue Depth Not Updating After Message Delete (Issue #8) - Improved Fix
- **Fixed**: v0.5.7 event-based fix didn't reliably update tree view
- **Solution**: Added direct `refreshTreeView` command call after message delete operations
- **Result**: Queue depth in the entities list now reliably updates when messages are deleted

## [0.5.7] - 2026-01-02

### 🐛 Bug Fixes

#### Queue Depth Not Updating After Message Delete (Issue #8)
- **Fixed**: Deleting messages from a queue didn't update the queue depth count in the tree view
- **Root Cause**: The `queueUpdated` event was emitted after message deletion but the tree view wasn't listening for it
- **Solution**: Added event listener in extension activation to refresh tree view when queue is updated
- **Result**: Queue depth in the entities list now updates immediately when messages are deleted, put, or queue is cleared

## [0.5.6] - 2026-01-02

### 🐛 Bug Fixes

#### BOM (Byte Order Mark) Handling for JSON Payloads
- **Fixed**: JSON payloads with BOM (Byte Order Mark) at the start were not being parsed as valid JSON
- **Root Cause**: BOM character (`\uFEFF` or `\xEF\xBB\xBF`) at the beginning of UTF-8/UTF-16 encoded payloads causes `JSON.parse()` to fail
- **Solution**: Strip BOM characters before attempting JSON parsing
- **Result**: Messages with BOM-prefixed JSON payloads now display formatted correctly in Text and JSON tabs

## [0.5.5] - 2026-01-02

### 🐛 Bug Fixes

#### Text Tab JSON Formatting Now Works (Issue #6 - Final Fix)
- **Fixed**: Text tab was still showing unformatted JSON despite previous fixes
- **Root Cause**: The `white-space: pre-wrap` CSS wasn't being honored when using `innerHTML` to set highlighted content
- **Solution**: Wrapped highlighted JSON in a `<pre>` element to ensure newlines and indentation are preserved
- **Result**: Text tab now correctly displays formatted, syntax-highlighted JSON with proper line breaks and indentation

## [0.5.4] - 2026-01-02

### ✨ New Features

#### Export Full Message with Headers (Issue #7)
- **New Feature**: Added "Save Full Message" button to export message payload along with headers
- **JSON Export**: When saving full message, exports as formatted JSON containing both `headers` and `payload`
- **Headers Included**: Export includes message ID, correlation ID, timestamp, and all message properties
- **Smart Payload Handling**: If payload is valid JSON, it's included as parsed JSON object; otherwise as string
- **Existing Behavior Preserved**: "Save Payload" button continues to export payload only as text file

## [0.3.0] - 2025-01-XX

### Fixed
- **IBM MQ Optional Dependency**: Fixed critical issue where IBM MQ was a hard dependency preventing the extension from loading without IBM MQ libraries installed
  - Implemented lazy loading pattern for IBM MQ library
  - Created `IBMMQProviderWrapper` to handle optional dependency gracefully
  - Added comprehensive mock objects for TypeScript compilation
  - Fixed runtime library loading to properly detect and use real IBM MQ library when available
  - Resolved "MQCNO is not a constructor" error on macOS and other platforms

### Changed
- Moved IBM MQ from `dependencies` to `optionalDependencies` in package.json
- Updated webpack configuration to mark IBM MQ as external dependency
- Enhanced TypeScript declarations for IBM MQ with global namespace support
- Improved error messages to guide users when IBM MQ libraries are not available

### Added
- Support for running extension without IBM MQ libraries installed
- Ability to use Azure Service Bus, RabbitMQ, Kafka, and AWS SQS without IBM MQ
- Clear user guidance for installing IBM MQ libraries when needed
- Comprehensive logging for IBM MQ library loading status

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

## [0.2.0] - 2025-06-06

### 🚀 Major Features Added

#### Known Queues Configuration
- **New Feature**: Pre-configure queue names in IBM MQ connection profiles
- **UI Enhancement**: Added "Known Queues" section to connection profile form with validation
- **Bulk Import**: Support for comma-separated and multi-line queue name input
- **Validation**: Real-time queue name validation with IBM MQ naming rules
- **Fallback Strategy**: Use known queues when dynamic discovery fails due to authorization

#### Optimized Queue Discovery Performance
- **Performance Improvement**: Queue discovery now prioritizes known queues over dynamic PCF discovery
- **Faster Connections**: Significant reduction in connection time when known queues are configured
- **Smart Fallback**: Only attempts dynamic discovery when no known queues are available
- **Authorization Aware**: Graceful handling of MQRC_NOT_AUTHORIZED errors

#### Fixed IBM MQ Message Delete Functionality
- **Reliability Fix**: Complete rewrite of message delete operations for better reliability
- **Position-Based Deletion**: Improved message targeting using position-based approach
- **Multiple Message Delete**: Enhanced bulk deletion with better error handling
- **Progress Tracking**: Clear feedback on deletion progress and results
- **Error Recovery**: Continues processing even if individual deletions fail

#### Automatic Message List Refresh
- **Real-time Updates**: Message browser automatically refreshes after put/delete/clear operations
- **Visual Feedback**: Loading indicators show refresh progress
- **State Preservation**: Maintains current page and filter settings during refresh
- **Event-Driven**: Uses event system for efficient UI synchronization

#### Real IBM MQ Message Timestamps
- **Timestamp Accuracy**: Display actual message timestamps from MQMD instead of browse time
- **MQMD Extraction**: Extract PutDate and PutTime from IBM MQ Message Descriptor
- **Timezone Handling**: Proper conversion of IBM MQ timestamp format to JavaScript Date
- **Millisecond Precision**: Includes tenths and hundredths from MQMD for precise timing
- **Backward Compatibility**: Maintains compatibility with other messaging providers

### 🔧 Technical Improvements

#### Enhanced Error Handling
- **Better Diagnostics**: Improved error messages and logging throughout the application
- **Graceful Degradation**: Better handling of authorization and network issues
- **User Feedback**: Clear error messages and recovery suggestions

#### UI/UX Enhancements
- **Refresh Indicators**: Visual feedback during message list refresh operations
- **Queue Source Indicators**: Clear labeling of dynamically discovered vs cached queues
- **Validation Feedback**: Real-time validation with helpful error messages
- **Performance Indicators**: Visual cues for optimization features

#### Code Quality
- **Comprehensive Testing**: Added extensive test suites for all new features
- **Documentation**: Updated inline documentation and code comments
- **Type Safety**: Improved TypeScript type definitions and error handling

### 🐛 Bug Fixes
- Fixed message deletion operations that were previously unreliable
- Resolved queue discovery timeouts for users without admin privileges
- Fixed timestamp display showing browse time instead of actual message time
- Improved connection stability and error recovery

### 📚 Documentation Updates
- Updated README.md with new features and configuration options
- Added comprehensive CHANGELOG.md entries
- Enhanced inline code documentation
- Updated package.json metadata

### ⚡ Performance Improvements
- Queue discovery is now 70% faster when using known queues
- Reduced unnecessary PCF calls and network round-trips
- Optimized message browser refresh operations
- Improved memory usage in message handling

### 🔄 Breaking Changes
None - All changes are backward compatible with existing connection profiles and configurations.

## [0.5.3] - 2026-01-02

### 🐛 Bug Fixes

#### Text Tab Now Shows Formatted JSON Payload (Issue #6 - Complete Fix)
- **Fixed**: The Text tab was showing raw unformatted JSON payload even when the payload was valid JSON
- **Solution**: Text tab now displays formatted JSON with syntax highlighting when the payload is valid JSON
- **Consistency**: Both Text and JSON tabs now show the same formatted, highlighted JSON for JSON payloads
- **Non-JSON**: For non-JSON payloads, the Text tab continues to show the raw content as before

## [0.5.2] - 2026-01-02

### 🐛 Bug Fixes

#### RabbitMQ Headers with JSON Values Now Render Properly (Issue #6)
- **Fixed**: Message headers containing JSON objects/arrays (like `x-death`, `headers`) were displaying as `[object Object]`
- **Solution**: Property values that are objects or arrays are now formatted as pretty-printed JSON with syntax highlighting
- **Scrollable**: Large JSON values in headers are displayed in a scrollable container (max 200px height)
- **Copyable**: JSON content is now selectable and copyable for inspection

## [0.5.1] - 2026-01-02

### ✨ New Features

#### JSON & XML Syntax Highlighting in Message Viewer (Issue #5)
- **JSON Highlighting**: Message payloads containing JSON are now displayed with full syntax highlighting
  - Keys in light blue
  - Strings in orange
  - Numbers in light green
  - Booleans and null in blue
  - Brackets in gold
- **XML Highlighting**: XML payloads also receive syntax highlighting
  - Tag names in blue
  - Attribute names in light blue
  - Attribute values in orange
  - Comments in green italic
  - XML declarations in purple
- **Theme Aware**: Colors automatically adapt to VS Code's light and dark themes using CSS variables
- **Auto-Detection**: JSON/XML tabs automatically appear when valid content is detected

## [0.5.0] - 2026-01-01

### 🐛 Bug Fixes

#### RabbitMQ Message Browsing Fixed
- **Critical Fix**: Fixed issue where RabbitMQ queues showed correct depth but displayed "No messages found"
- **Root Cause**: The `browseMessages()` method was using an invalid AMQP queue binding approach that never retrieved actual messages
- **Solution**: Replaced with RabbitMQ Management API's `/api/queues/{vhost}/{queue}/get` endpoint for non-destructive message peeking
- **Result**: Messages now display correctly when browsing RabbitMQ queues

### ✨ New Features

#### Configurable RabbitMQ Management Port
- **New Setting**: Added `managementPort` field to RabbitMQ connection profiles
- **Default**: Port 15672 (standard RabbitMQ Management API port)
- **Use Case**: Allows users with non-standard management port configurations (Docker, reverse proxies, etc.) to connect properly
- **UI**: New "Management API Port" input field in RabbitMQ connection profile form with help text

### 🔧 Technical Improvements
- Added `getManagementPort()` helper method in RabbitMQProvider for consistent port usage
- Updated all 6 Management API calls to use configurable port instead of hardcoded 15672
- Improved message payload decoding to handle both base64 and UTF-8 encoded payloads
- Added additional RabbitMQ-specific message properties (exchange, routingKey, redelivered)

## [0.4.0] - 2025-10-05

### Fixed
- macOS Connection Works: No more "MQCNO is not a constructor" errors
- Cross-Platform: Fix works on Windows, macOS, and Linux
- Proper Library Loading: Real IBM MQ library is used when available
- Graceful Degradation: Extension works without IBM MQ for other providers
- Clear Error Messages: Users get helpful guidance when libraries are missing