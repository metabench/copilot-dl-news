/**
 * Tests for ProposedAction class
 */

const ProposedAction = require('../ProposedAction');
const Action = require('../Action');

describe('ProposedAction', () => {
  describe('constructor', () => {
    test('should create proposed action with required properties', () => {
      const action = new Action({
        id: 'stop-task-123',
        type: 'stop-task',
        label: 'Stop Task',
        parameters: { taskId: 123 }
      });
      
      const proposedAction = new ProposedAction({
        action,
        reason: 'Another task is already running',
        severity: 'warning',
        priority: 10
      });
      
      expect(proposedAction.action).toBe(action);
      expect(proposedAction.reason).toBe('Another task is already running');
      expect(proposedAction.severity).toBe('warning');
      expect(proposedAction.priority).toBe(10);
    });
    
    test('should throw error if action is not an Action instance', () => {
      expect(() => {
        new ProposedAction({
          action: { id: 'test', type: 'test', label: 'Test' },
          reason: 'Test reason'
        });
      }).toThrow('ProposedAction action must be an Action instance');
    });
    
    test('should throw error if reason is missing', () => {
      const action = new Action({ id: 'test', type: 'test', label: 'Test' });
      
      expect(() => {
        new ProposedAction({ action });
      }).toThrow('ProposedAction reason is required');
    });
    
    test('should throw error if reason is not a string', () => {
      const action = new Action({ id: 'test', type: 'test', label: 'Test' });
      
      expect(() => {
        new ProposedAction({ action, reason: 123 });
      }).toThrow('ProposedAction reason must be a string');
    });
    
    test('should default severity to info if not provided', () => {
      const action = new Action({ id: 'test', type: 'test', label: 'Test' });
      const proposedAction = new ProposedAction({ action, reason: 'Test' });
      
      expect(proposedAction.severity).toBe('info');
    });
    
    test('should accept valid severity values', () => {
      const action = new Action({ id: 'test', type: 'test', label: 'Test' });
      
      const infoAction = new ProposedAction({ action, reason: 'Test', severity: 'info' });
      expect(infoAction.severity).toBe('info');
      
      const warningAction = new ProposedAction({ action, reason: 'Test', severity: 'warning' });
      expect(warningAction.severity).toBe('warning');
      
      const errorAction = new ProposedAction({ action, reason: 'Test', severity: 'error' });
      expect(errorAction.severity).toBe('error');
    });
    
    test('should throw error for invalid severity', () => {
      const action = new Action({ id: 'test', type: 'test', label: 'Test' });
      
      expect(() => {
        new ProposedAction({ action, reason: 'Test', severity: 'critical' });
      }).toThrow('ProposedAction severity must be one of: info, warning, error');
    });
    
    test('should default priority to 0 if not provided', () => {
      const action = new Action({ id: 'test', type: 'test', label: 'Test' });
      const proposedAction = new ProposedAction({ action, reason: 'Test' });
      
      expect(proposedAction.priority).toBe(0);
    });
    
    test('should accept numeric priority', () => {
      const action = new Action({ id: 'test', type: 'test', label: 'Test' });
      const proposedAction = new ProposedAction({ action, reason: 'Test', priority: 42 });
      
      expect(proposedAction.priority).toBe(42);
    });
    
    test('should throw error if priority is not a number', () => {
      const action = new Action({ id: 'test', type: 'test', label: 'Test' });
      
      expect(() => {
        new ProposedAction({ action, reason: 'Test', priority: 'high' });
      }).toThrow('ProposedAction priority must be a number');
    });
    
    test('should accept optional description', () => {
      const action = new Action({ id: 'test', type: 'test', label: 'Test' });
      const proposedAction = new ProposedAction({
        action,
        reason: 'Test',
        description: 'Additional details'
      });
      
      expect(proposedAction.description).toBe('Additional details');
    });
    
    test('should default description to null if not provided', () => {
      const action = new Action({ id: 'test', type: 'test', label: 'Test' });
      const proposedAction = new ProposedAction({ action, reason: 'Test' });
      
      expect(proposedAction.description).toBeNull();
    });
    
    test('should throw error if description is not a string', () => {
      const action = new Action({ id: 'test', type: 'test', label: 'Test' });
      
      expect(() => {
        new ProposedAction({ action, reason: 'Test', description: 123 });
      }).toThrow('ProposedAction description must be a string');
    });
  });
  
  describe('toJSON', () => {
    test('should serialize proposed action to JSON', () => {
      const action = new Action({
        id: 'stop-456',
        type: 'stop-task',
        label: 'Stop Task',
        parameters: { taskId: 456 }
      });
      
      const proposedAction = new ProposedAction({
        action,
        reason: 'Rate limit exceeded',
        severity: 'warning',
        priority: 5,
        description: 'Stop the currently running task'
      });
      
      const json = proposedAction.toJSON();
      
      expect(json).toEqual({
        action: {
          id: 'stop-456',
          type: 'stop-task',
          label: 'Stop Task',
          parameters: { taskId: 456 }
        },
        reason: 'Rate limit exceeded',
        severity: 'warning',
        priority: 5,
        description: 'Stop the currently running task'
      });
    });
    
    test('should serialize with null description', () => {
      const action = new Action({ id: 'test', type: 'test', label: 'Test' });
      const proposedAction = new ProposedAction({ action, reason: 'Test' });
      
      const json = proposedAction.toJSON();
      
      expect(json.description).toBeNull();
    });
  });
  
  describe('fromJSON', () => {
    test('should deserialize proposed action from JSON', () => {
      const json = {
        action: {
          id: 'resume-789',
          type: 'resume-task',
          label: 'Resume Task',
          parameters: { taskId: 789 }
        },
        reason: 'Task was paused',
        severity: 'info',
        priority: 3,
        description: 'Continue where you left off'
      };
      
      const proposedAction = ProposedAction.fromJSON(json);
      
      expect(proposedAction).toBeInstanceOf(ProposedAction);
      expect(proposedAction.action).toBeInstanceOf(Action);
      expect(proposedAction.action.id).toBe('resume-789');
      expect(proposedAction.reason).toBe('Task was paused');
      expect(proposedAction.severity).toBe('info');
      expect(proposedAction.priority).toBe(3);
      expect(proposedAction.description).toBe('Continue where you left off');
    });
    
    test('should throw error if JSON is invalid', () => {
      expect(() => {
        ProposedAction.fromJSON({ action: { id: 'test', type: 'test', label: 'Test' } });
      }).toThrow('ProposedAction reason is required');
    });
  });
  
  describe('accessor methods', () => {
    test('should return action ID via getActionId', () => {
      const action = new Action({ id: 'test-123', type: 'test', label: 'Test' });
      const proposedAction = new ProposedAction({ action, reason: 'Test' });
      
      expect(proposedAction.getActionId()).toBe('test-123');
    });
    
    test('should return action type via getActionType', () => {
      const action = new Action({ id: 'test', type: 'stop-task', label: 'Stop' });
      const proposedAction = new ProposedAction({ action, reason: 'Test' });
      
      expect(proposedAction.getActionType()).toBe('stop-task');
    });
    
    test('should return action label via getActionLabel', () => {
      const action = new Action({ id: 'test', type: 'test', label: 'Stop Running Task' });
      const proposedAction = new ProposedAction({ action, reason: 'Test' });
      
      expect(proposedAction.getActionLabel()).toBe('Stop Running Task');
    });
    
    test('should return action parameters via getActionParameters', () => {
      const action = new Action({
        id: 'test',
        type: 'test',
        label: 'Test',
        parameters: { key: 'value', count: 42 }
      });
      const proposedAction = new ProposedAction({ action, reason: 'Test' });
      
      expect(proposedAction.getActionParameters()).toEqual({ key: 'value', count: 42 });
    });
  });
  
  describe('complex scenarios', () => {
    test('should handle proposed action with complex action parameters', () => {
      const action = new Action({
        id: 'configure',
        type: 'configure-system',
        label: 'Configure System',
        parameters: {
          settings: {
            workers: 4,
            timeout: 30000,
            retries: 3
          },
          flags: ['verbose', 'debug']
        }
      });
      
      const proposedAction = new ProposedAction({
        action,
        reason: 'System needs reconfiguration',
        severity: 'error',
        priority: 100,
        description: 'Apply new configuration to fix issues'
      });
      
      expect(proposedAction.getActionParameters()).toEqual({
        settings: { workers: 4, timeout: 30000, retries: 3 },
        flags: ['verbose', 'debug']
      });
    });
    
    test('should survive JSON round-trip', () => {
      const action = new Action({
        id: 'test',
        type: 'test-action',
        label: 'Test Action',
        parameters: { value: 123 }
      });
      
      const original = new ProposedAction({
        action,
        reason: 'Test reason',
        severity: 'warning',
        priority: 7,
        description: 'Test description'
      });
      
      const json = original.toJSON();
      const restored = ProposedAction.fromJSON(json);
      
      expect(restored.action.id).toBe(original.action.id);
      expect(restored.reason).toBe(original.reason);
      expect(restored.severity).toBe(original.severity);
      expect(restored.priority).toBe(original.priority);
      expect(restored.description).toBe(original.description);
    });
    
    test('should maintain Action instance identity', () => {
      const action = new Action({ id: 'test', type: 'test', label: 'Test' });
      const proposedAction = new ProposedAction({ action, reason: 'Test' });
      
      // Should be the same instance
      expect(proposedAction.action).toBe(action);
      
      // Should be an Action instance
      expect(proposedAction.action).toBeInstanceOf(Action);
    });
  });
});
