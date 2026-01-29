# 6. Supporting Services & Foundation

While the Radial Architecture focuses on the flow of data (Core -> Intelligence -> UI), the system relies on a set of critical supporting services and foundational libraries to function.

## Subscriptions & Identity

Located in `src/billing` and `src/users`, these services sit "off to the side" of the main crawl loop. They do not block the acquisition of data but govern the *access* to it.

### 1. Identity (`src/users`)
*   **Role:** Manages User Profiles and Preferences (`PreferenceLearner.js`).
*   **Integration:** The API Gateway validates tokens against this service before serving data.

### 2. Billing (`src/billing`)
*   **Role:** Manages Subscriptions, Usage Tracking, and Feature Gates (`FeatureGate.js`).
*   **Stripe Integration:** Handles the checkout flow and webhooks (`StripeClient.js`).
*   **Constraint:** Billing logic is decoupled from the Crawler. A crawling error does not stop billing; a billing error does not stop the crawler (though it might stop the user from seeing the result).

## Foundation Packages

The system is built on top of a set of specialized libraries that provide the "Language" of the application.

### 1. `jsgui3` (UI Framework)
*   **Role:** Provides the component model for all UIs (Server-Side Rendering + Client-Side Hydration).
*   **Key Concept:** `Control`. Every UI element is a Control that renders HTML and activates on the client.
*   **Usage:** Used extensively in `src/ui`.

### 2. `lang-tools` (Data Structures)
*   **Role:** Provides enhanced data structures (`Collection`, `Evented_Class`) that power the reactive nature of the system.
*   **Usage:** Used for in-memory graph management and event propagation.

### 3. Planned Abstractions
The v5 Architecture envisions extracting further reusable logic:

*   **`@news/protocol` (Concept):** A shared package for strict API Contracts (TypeScript Interfaces) shared between Client and Server. Currently, these live in `src/shared` and API route definitions.
*   **`ta-tensor` (Concept):** A proposed library for high-performance n-dimensional array operations, intended to power the next generation of Vector Search and Similarity matching in the Intelligence Layer.

> "A strong foundation allows the castle to grow tall."
