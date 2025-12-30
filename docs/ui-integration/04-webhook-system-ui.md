# Webhook System UI Integration

## Overview

The Webhook System enables external integrations by delivering events to configured endpoints with retry logic and signature verification. Currently backend-only.

## Current Implementation

**Location**: `src/integrations/`

**Existing Files**:
- `WebhookService.js` - Webhook lifecycle management
- `WebhookDelivery.js` - Event delivery with retries
- `SlackClient.js` - Slack-specific integration
- `IntegrationManager.js` - Integration orchestration
- `index.js` - Module exports

**Existing Features**:
- Endpoint registration
- Event delivery with retries
- Exponential backoff
- Signature verification (HMAC)
- Delivery logging

## Full Feature Set for UI

### 1. Webhook Endpoints Dashboard

**Purpose**: Manage all configured webhook endpoints

**Endpoint List View**:
- Endpoint URL (masked for security)
- Status (active/paused/failing)
- Events subscribed
- Success rate (24h)
- Last delivery timestamp

**Quick Actions**:
- Pause/resume endpoint
- Test delivery
- View logs
- Delete endpoint

### 2. Endpoint Configuration

**Create/Edit Endpoint**:
- Endpoint URL
- Secret key (auto-generate option)
- Events to subscribe
- Retry policy (max attempts, backoff)
- Headers to include
- Timeout settings

**Event Types**:
- `article.created` - New article crawled
- `article.updated` - Article content changed
- `crawl.started` - Crawl job started
- `crawl.completed` - Crawl job finished
- `crawl.error` - Crawl error occurred
- `domain.discovered` - New domain found
- `alert.triggered` - Alert condition met

### 3. Delivery History

**Delivery Log View**:
- Timestamp
- Event type
- Endpoint (masked)
- Status (delivered/retrying/failed)
- Response code
- Duration (ms)
- Retry count

**Delivery Detail**:
- Full request payload
- Request headers
- Response body
- Response headers
- Timing breakdown
- Error details (if failed)

### 4. Webhook Testing

**Test Panel**:
- Select event type
- Sample or custom payload
- Send test delivery
- View request/response
- Verify signature

### 5. Analytics

**Delivery Stats**:
- Total deliveries (24h/7d/30d)
- Success rate trend
- Average latency
- Retry distribution
- Failure reasons breakdown

**Per-Endpoint Stats**:
- Delivery success rate
- Average response time
- Events delivered by type
- Failure pattern analysis

---

## Work To Be Done

### Phase 1: Data Layer (3 hours)

1. **Create webhook tables**
   ```sql
   CREATE TABLE webhook_endpoints (
     id INTEGER PRIMARY KEY,
     user_id TEXT NOT NULL,
     url TEXT NOT NULL,
     secret TEXT NOT NULL,
     events_json TEXT NOT NULL,
     status TEXT DEFAULT 'active',
     retry_max INTEGER DEFAULT 5,
     timeout_ms INTEGER DEFAULT 30000,
     headers_json TEXT,
     created_at TEXT DEFAULT CURRENT_TIMESTAMP,
     updated_at TEXT
   );
   
   CREATE TABLE webhook_deliveries (
     id INTEGER PRIMARY KEY,
     endpoint_id INTEGER NOT NULL,
     event_type TEXT NOT NULL,
     payload_json TEXT NOT NULL,
     status TEXT NOT NULL,
     response_code INTEGER,
     response_body TEXT,
     duration_ms INTEGER,
     retry_count INTEGER DEFAULT 0,
     error_message TEXT,
     delivered_at TEXT DEFAULT CURRENT_TIMESTAMP,
     FOREIGN KEY(endpoint_id) REFERENCES webhook_endpoints(id)
   );
   
   CREATE INDEX idx_webhook_deliveries_endpoint ON webhook_deliveries(endpoint_id);
   CREATE INDEX idx_webhook_deliveries_status ON webhook_deliveries(status);
   ```

2. **Extend WebhookService for persistence**
   - Save endpoints to database
   - Log all deliveries
   - Query delivery history

### Phase 2: API Endpoints (4 hours)

1. **GET /api/webhooks**
   - List user's endpoints
   - Include success rates

2. **POST /api/webhooks**
   - Create new endpoint
   - Generate secret

3. **GET /api/webhooks/:id**
   - Endpoint details
   - Recent deliveries

4. **PATCH /api/webhooks/:id**
   - Update configuration
   - Pause/resume

5. **DELETE /api/webhooks/:id**
   - Remove endpoint

6. **POST /api/webhooks/:id/test**
   - Send test delivery
   - Return request/response

7. **GET /api/webhooks/:id/deliveries**
   - Paginated delivery history
   - Filter by status, event type

8. **GET /api/webhooks/:id/deliveries/:deliveryId**
   - Full delivery details

9. **GET /api/admin/webhooks/stats**
   - Aggregate delivery stats

### Phase 3: UI Components (8 hours)

1. **WebhookDashboard control**
   - File: `src/ui/server/adminDashboard/controls/WebhookDashboard.js`
   - Endpoint list table
   - Status badges
   - Success rate indicators
   - Quick action buttons

2. **WebhookEndpointForm control**
   - Create/edit endpoint
   - URL input with validation
   - Secret generation button
   - Event type checkboxes
   - Retry configuration

3. **WebhookDeliveryLog control**
   - Delivery history table
   - Status icons
   - Expandable rows for detail
   - Filter controls

4. **WebhookTester control**
   - Event type selector
   - Payload editor (JSON)
   - Send button
   - Request/response display
   - Signature verification display

5. **WebhookAnalytics control**
   - Delivery success chart
   - Latency histogram
   - Failure reasons pie

### Phase 4: Integration (3 hours)

1. **Connect to event emitters**
   - Crawler events
   - Article events
   - Alert events

2. **Add to user dashboard**
3. **Email alerts for failing webhooks**
4. **Webhook endpoint health checks**

---

## Estimated Total: 18 hours

## Dependencies

- Existing: `src/integrations/WebhookService.js`
- Existing: `src/integrations/WebhookDelivery.js`
- New: Database tables
- New: REST API routes
- New: jsgui3 controls

## Success Criteria

- [ ] Users can create webhook endpoints
- [ ] Events are selectable per endpoint
- [ ] Secrets are auto-generated and secure
- [ ] Delivery history is queryable
- [ ] Test deliveries show full request/response
- [ ] Failing endpoints show error details
- [ ] Success rate visible per endpoint
- [ ] Endpoints can be paused/resumed
