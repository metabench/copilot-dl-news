'use strict';

/**
 * Tests for StripeClient
 * 
 * @module tests/billing/StripeClient
 */

const { StripeClient } = require('../../src/billing');

describe('StripeClient', () => {
  let client;

  beforeEach(() => {
    // Create client in test mode (no real Stripe API)
    client = new StripeClient({
      secretKey: null, // Forces test mode
      webhookSecret: 'whsec_test',
      logger: { log: jest.fn(), error: jest.fn(), warn: jest.fn() }
    });
  });

  describe('Test mode detection', () => {
    test('enters test mode without secret key', () => {
      expect(client.isTestMode()).toBe(true);
    });
  });

  describe('Customer operations', () => {
    test('createCustomer returns mock customer', async () => {
      const customer = await client.createCustomer('test@example.com', { name: 'Test User' });

      expect(customer).toBeDefined();
      expect(customer.id).toMatch(/^cus_mock_/);
      expect(customer.email).toBe('test@example.com');
    });

    test('getCustomer returns null for non-existent customer', async () => {
      const customer = await client.getCustomer('cus_nonexistent');
      expect(customer).toBeNull();
    });

    test('getCustomer returns created customer', async () => {
      const created = await client.createCustomer('test@example.com');
      const retrieved = await client.getCustomer(created.id);
      
      expect(retrieved).toBeDefined();
      expect(retrieved.id).toBe(created.id);
    });
  });

  describe('Checkout sessions', () => {
    test('createCheckoutSession returns mock session', async () => {
      const customer = await client.createCustomer('test@example.com');
      
      const session = await client.createCheckoutSession({
        customerId: customer.id,
        priceId: 'price_pro',
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
        metadata: { userId: 'user-1' }
      });

      expect(session).toBeDefined();
      expect(session.id).toMatch(/^cs_mock_/);
      expect(session.url).toContain('checkout.stripe.com');
      expect(session.customer).toBe(customer.id);
      expect(session.metadata.userId).toBe('user-1');
    });
  });

  describe('Portal sessions', () => {
    test('createPortalSession returns mock portal session', async () => {
      const customer = await client.createCustomer('test@example.com');
      
      const session = await client.createPortalSession(
        customer.id,
        'https://example.com/billing'
      );

      expect(session).toBeDefined();
      expect(session.id).toMatch(/^bps_mock_/);
      expect(session.url).toContain('billing.stripe.com');
    });

    test('createPortalSession throws without customer ID', async () => {
      await expect(
        client.createPortalSession(null, 'https://example.com')
      ).rejects.toThrow('Customer ID is required');
    });

    test('createPortalSession throws without return URL', async () => {
      await expect(
        client.createPortalSession('cus_123', null)
      ).rejects.toThrow('Return URL is required');
    });
  });

  describe('Subscription operations', () => {
    test('cancelSubscription throws for non-existent subscription', async () => {
      await expect(
        client.cancelSubscription('sub_nonexistent')
      ).rejects.toThrow('Subscription not found');
    });
  });

  describe('Webhook handling', () => {
    test('handleWebhook accepts mock events', async () => {
      const mockPayload = JSON.stringify({
        id: 'evt_mock_123',
        type: 'checkout.session.completed',
        data: {
          object: {
            id: 'cs_123',
            customer: 'cus_456',
            subscription: 'sub_789',
            metadata: { userId: 'user-1', plan: 'pro' }
          }
        }
      });

      const event = await client.handleWebhook(mockPayload, 'mock_signature');

      expect(event).toBeDefined();
      expect(event.type).toBe('checkout.session.completed');
      expect(event.data.object.id).toBe('cs_123');
    });
  });

  describe('Mock event creation', () => {
    test('createMockEvent creates custom event', () => {
      const event = client.createMockEvent('custom.event', {
        foo: 'bar',
        count: 42
      });

      expect(event.type).toBe('custom.event');
      expect(event.data.object.foo).toBe('bar');
      expect(event.data.object.count).toBe(42);
      expect(event.id).toMatch(/^evt_mock_/);
    });
  });

  describe('Checkout flow simulation', () => {
    test('simulateCheckoutComplete requires existing session', async () => {
      expect(() => {
        client.simulateCheckoutComplete('cs_nonexistent');
      }).toThrow('Session not found');
    });

    test('full checkout flow works', async () => {
      // Create customer
      const customer = await client.createCustomer('test@example.com');
      
      // Create checkout session
      const session = await client.createCheckoutSession({
        customerId: customer.id,
        priceId: 'price_pro',
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel',
        metadata: { userId: 'user-1', plan: 'pro' }
      });
      
      // Simulate checkout completion
      const result = client.simulateCheckoutComplete(session.id, 'pro');
      
      expect(result.event).toBeDefined();
      expect(result.event.type).toBe('checkout.session.completed');
      expect(result.subscription).toBeDefined();
    });
  });
});
