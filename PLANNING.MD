# MQExplorer VS Code Extension - Planning Document

## 1. Vision & Mission

**Vision:** To be the leading, multi-provider Message Queue browser and management tool integrated directly within Visual Studio Code, enhancing developer and operator productivity.

**Mission:** To provide a seamless, intuitive, and powerful experience for connecting to, browsing, interacting with, and managing various Message Queueing systems, starting with IBM MQ and progressively adding support for other popular providers.

## 2. Goals

*   **Core IBM MQ Functionality (MVP):**
    *   Securely manage connection profiles for IBM MQ.
    *   Browse Queue Managers, Queues, and their properties.
    *   Browse messages on queues (peek), view payload and properties.
    *   Put messages to queues.
    *   Perform basic queue operations (clear, view properties).
*   **Usability & Developer Experience:**
    *   Intuitive and consistent UI within VS Code paradigms.
    *   Responsive and non-blocking operations.
    *   Clear error reporting and logging.
    *   Secure storage of credentials.
*   **Extensibility (Post-MVP):**
    *   Architect for adding support for other MQ providers (RabbitMQ, Kafka, ActiveMQ, Azure Service Bus, AWS SQS, etc.).
    *   Introduce advanced message and MQ object management features.
*   **Community & Adoption:**
    *   Become a go-to extension for developers working with MQs.
    *   Foster a community for feedback and contributions.

## 3. Target Audience

*   **Developers:** Building applications that interact with message queues.
*   **DevOps Engineers/SREs:** Monitoring and managing MQ systems.
*   **QA Engineers:** Testing message-driven applications.
*   **System Administrators:** Administering MQ instances.

## 4. Core Features (High-Level)

*   **Connection Management:** Define, save, connect, disconnect from MQ instances.
*   **Object Explorer:** Tree-view of MQ entities (Queues, Topics, Channels, etc.).
*   **Message Browser:** View messages, headers, and payload.
*   **Message Publisher:** Send messages to queues/topics.
*   **Basic Administration:** Clear queues, view properties, etc.
*   **Multi-Provider Support:** (Future) Abstracted backend to support various MQ systems.

## 5. Technical Architecture Overview

*   **Frontend (VS Code UI):**
    *   **Activity Bar & Sidebar Panel:** Primary entry point and navigation.
    *   **Tree View:** For displaying MQ objects.
    *   **Webviews:** For detailed views (message content, properties, connection forms).
    *   **Editor Tabs:** For displaying browsed messages or larger content.
    *   **VS Code API:** `vscode.window`, `vscode.commands`, `vscode.workspace`, `vscode.SecretStorage`, `vscode.TreeDataProvider`, `vscode.WebviewPanel`.
*   **Backend (Extension Host Process - Node.js):**
    *   **Connection Manager:** Handles connection logic, credential management.
    *   **Provider Abstraction Layer:**
        *   `IMQProvider` interface (defines connect, disconnect, listQueues, browseMessages, putMessage, etc.).
        *   Concrete Implementations: `IBMMQProvider`, `RabbitMQProvider` (future), etc.
    *   **MQ Client Libraries:**
        *   IBM MQ: `ibmmq` (Node.js client).
        *   Others: Corresponding Node.js client libraries.
    *   **State Management:** Manage active connections, cached data.
*   **Data Storage:**
    *   **`vscode.SecretStorage`:** For sensitive credentials (passwords, API keys).
    *   **`vscode.workspaceState` / `vscode.GlobalState`:** For non-sensitive connection profiles and user preferences.
*   **Communication:**
    *   UI (Webviews/Tree) <-> Extension Host via VS Code's message passing mechanisms and command execution.

## 6. Key Design Principles

*   **Security First:** Prioritize secure handling of credentials and connections.
*   **User-Centric:** Focus on intuitive workflows and clear feedback.
*   **Performance:** Ensure asynchronous operations and responsiveness.
*   **Modularity:** Design for easy addition of new MQ providers and features.
*   **Discoverability:** Make features easy to find and use.
*   **VS Code Native Feel:** Adhere to VS Code design guidelines and conventions.

## 7. Potential Risks & Mitigation

*   **Complexity of MQ Providers:** Each provider has unique APIs and concepts.
    *   **Mitigation:** Start with one provider (IBM MQ), develop a strong abstraction layer before adding others. Thoroughly research each new provider.
*   **Security Vulnerabilities:** Mishandling credentials or insecure communication.
    *   **Mitigation:** Strict use of `vscode.SecretStorage`, validate all inputs, prefer official client libraries, consider SSL/TLS by default where applicable.
*   **Performance Bottlenecks:** Slow MQ operations or handling large data.
    *   **Mitigation:** All I/O must be asynchronous. Implement pagination for message browsing. Optimize data fetching.
*   **Dependency Management:** Keeping MQ client libraries up-to-date and compatible.
    *   **Mitigation:** Regular dependency review, thorough testing with updates.
*   **User Experience for Diverse Providers:** Maintaining a consistent UX across different MQ models.
    *   **Mitigation:** Careful design of the common interface and UI elements, allowing for provider-specific extensions where necessary without cluttering the core experience.

## 8. Monetization Strategy (If any)

*   Initially, the extension will be free and open-source to encourage adoption and community contribution.
*   Future (Optional):
    *   Premium features for enterprise users (e.g., advanced analytics, audit logging, role-based access control if managing shared connections centrally - though this is complex).
    *   Sponsorships.
    *   *Note: Monetization should not compromise the core free offering.*

## 9. Release Plan (Phased Approach)

*   **Phase 1 (MVP - IBM MQ Focus): ✅ COMPLETED**
    *   Basic connection management for IBM MQ.
    *   Browse Queues.
    *   Peek/Browse messages (read-only, text/hex view).
    *   Put messages (text payload).
    *   Clear Queue.
*   **Phase 2 (IBM MQ Enhancements): ✅ COMPLETED**
    *   Advanced message properties for putting.
    *   More payload viewers (JSON, XML formatted).
    *   View Queue/QM properties.
    *   Basic Topic browsing/publishing for IBM MQ.
    *   Channel list/status for IBM MQ.
*   **Phase 3 (First Additional Provider - RabbitMQ): ✅ COMPLETED**
    *   Refactor to solidify the `IMQProvider` abstraction.
    *   Implement core functionality for RabbitMQ (connect, list queues, browse/put messages).
*   **Phase 4 (Further Providers & Advanced Features): ✅ COMPLETED**
    *   Add support for Kafka ✅, ActiveMQ ✅, Azure Service Bus ✅, AWS SQS ✅.
    *   Implement advanced features: message filtering ✅, DLQ handling ✅, batch operations ✅, etc.
*   **Ongoing:** Bug fixes, performance improvements, UX enhancements, documentation.

---