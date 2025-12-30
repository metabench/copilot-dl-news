# Subscription Tiers UI Integration

## Overview

The Subscription Tiers system manages user access levels, feature gates, and usage tracking. Currently implemented as backend services only.

## Current Implementation

**Location**: `src/billing/`

**Existing Files**:
- `SubscriptionService.js` - Subscription lifecycle management
- `FeatureGate.js` - Feature access control
- `UsageTracker.js` - Usage metering
- `StripeClient.js` - Payment integration
- `index.js` - Module exports

**Existing Features**:
- Tier definitions (Free, Pro, Enterprise)
- Feature gating by tier
- Usage tracking per feature
- Stripe subscription management

## Full Feature Set for UI

### 1. Subscription Overview Dashboard

**Purpose**: Admin view of all subscriptions

**Data Points**:
- Total subscribers by tier (pie chart)
- MRR (Monthly Recurring Revenue)
- Churn rate
- Active vs cancelled
- Trial conversions

**Quick Stats**:
- Free users: X
- Pro users: X  
- Enterprise users: X
- Revenue this month: $X

### 2. Subscriber Management

**Subscriber List**:
- Search by email/name/org
- Filter by tier, status, created date
- Sort by usage, revenue, activity

**Subscriber Detail**:
- Current tier & billing cycle
- Feature usage breakdown
- Payment history
- Upgrade/downgrade controls
- Manual tier override

### 3. Tier Configuration

**Tier Editor**:
- Define tier names and pricing
- Set feature limits per tier
- Configure overage pricing
- Set trial duration
- Define upgrade paths

**Feature Matrix**:
- Visual grid of features × tiers
- Toggle feature access
- Set usage limits (quota)
- Configure rate limits

### 4. Usage Analytics

**Usage Dashboard**:
- Top features by usage
- Users approaching limits
- Overage charges incurred
- Feature adoption rates

**Per-User Usage**:
- Feature usage vs limits
- Usage trend over time
- Projected overage

### 5. Billing Operations

**Admin Actions**:
- Issue credits/refunds
- Apply discount codes
- Extend trials
- Pause subscription
- Cancel subscription
- Force upgrade/downgrade

---

## Work To Be Done

### Phase 1: Data Layer Enhancement (4 hours)

1. **Extend subscription schema**
   ```sql
   CREATE TABLE subscriptions (
     id INTEGER PRIMARY KEY,
     user_id TEXT NOT NULL,
     tier TEXT NOT NULL,
     status TEXT DEFAULT 'active',
     stripe_subscription_id TEXT,
     current_period_start TEXT,
     current_period_end TEXT,
     cancel_at TEXT,
     created_at TEXT DEFAULT CURRENT_TIMESTAMP,
     updated_at TEXT
   );
   
   CREATE TABLE feature_usage (
     id INTEGER PRIMARY KEY,
     user_id TEXT NOT NULL,
     feature_key TEXT NOT NULL,
     usage_count INTEGER DEFAULT 0,
     period_start TEXT NOT NULL,
     period_end TEXT NOT NULL,
     UNIQUE(user_id, feature_key, period_start)
   );
   
   CREATE TABLE tier_definitions (
     id INTEGER PRIMARY KEY,
     tier_key TEXT UNIQUE NOT NULL,
     name TEXT NOT NULL,
     price_monthly INTEGER,
     price_yearly INTEGER,
     features_json TEXT,
     limits_json TEXT,
     created_at TEXT DEFAULT CURRENT_TIMESTAMP
   );
   ```

2. **Create subscription stats service**
   - File: `src/billing/SubscriptionStatsService.js`
   - Aggregate subscription metrics
   - Calculate MRR, churn, conversions

### Phase 2: API Endpoints (4 hours)

1. **GET /api/admin/subscriptions**
   - List all subscriptions
   - Filter by tier, status
   - Include usage summary

2. **GET /api/admin/subscriptions/:userId**
   - Detailed subscription info
   - Feature usage breakdown
   - Payment history

3. **PATCH /api/admin/subscriptions/:userId**
   - Change tier
   - Update status
   - Apply credits

4. **GET /api/admin/subscriptions/stats**
   - Aggregate metrics
   - MRR, churn, conversions
   - Tier distribution

5. **GET /api/admin/tiers**
   - List tier definitions

6. **PUT /api/admin/tiers/:tierKey**
   - Update tier configuration
   - Modify limits/features

7. **GET /api/admin/features**
   - List all features
   - Usage stats per feature

### Phase 3: UI Components (8 hours)

1. **SubscriptionDashboard control**
   - File: `src/ui/server/adminDashboard/controls/SubscriptionDashboard.js`
   - Tier distribution pie chart
   - MRR trend line
   - Quick stats cards
   - Recent activity feed

2. **SubscriberList control**
   - Searchable/filterable table
   - Inline tier badge
   - Usage progress bars
   - Quick actions menu

3. **SubscriberDetail control**
   - Full subscription info
   - Usage by feature
   - Payment history table
   - Admin action buttons

4. **TierEditor control**
   - Tier configuration form
   - Feature matrix grid
   - Limit inputs
   - Pricing fields

5. **UsageAnalytics control**
   - Feature usage charts
   - Users at limit warnings
   - Overage projections

### Phase 4: Integration (4 hours)

1. **Connect to Stripe webhooks**
2. **Add to admin dashboard navigation**
3. **Email notifications for limit warnings**
4. **Export subscriber reports**

---

## Estimated Total: 20 hours

## Dependencies

- Existing: `src/billing/SubscriptionService.js`
- Existing: `src/billing/FeatureGate.js`
- Existing: `src/billing/UsageTracker.js`
- New: SubscriptionStatsService
- New: Admin API routes
- New: Database schema extensions

## Success Criteria

- [ ] Admin can view all subscribers by tier
- [ ] Individual subscriber details accessible
- [ ] Admin can upgrade/downgrade users
- [ ] Tier definitions are editable
- [ ] Feature limits displayed per tier
- [ ] Usage tracking visible per user
- [ ] MRR and churn metrics accurate
- [ ] Credits and refunds can be issued
