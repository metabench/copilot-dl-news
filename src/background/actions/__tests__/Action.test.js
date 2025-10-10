/**
 * Tests for Action class
 */

const { Action } = require('../Action');

describe('Action', () => {
  describe('constructor', () => {
    test('should create action with required properties', () => {
      const action = new Action({
        id: 'stop-task-123',
        type: 'stop-task',
        label: 'Stop Running Task',
        parameters: { taskId: 123 }
      });
      
      expect(action.id).toBe('stop-task-123');
      expect(action.type).toBe('stop-task');
      expect(action.label).toBe('Stop Running Task');
      expect(action.parameters).toEqual({ taskId: 123 });
    });
    
    test('should throw error if id is missing', () => {
      expect(() => {
        new Action({
          type: 'stop-task',
          label: 'Stop Task',
          parameters: {}
        });
      }).toThrow('Action id is required');
    });
    
    test('should throw error if id is not a string', () => {
      expect(() => {
        new Action({
          id: 123,
          type: 'stop-task',
          label: 'Stop Task',
          parameters: {}
        });
      }).toThrow('Action id must be a string');
    });
    
    test('should throw error if type is missing', () => {
      expect(() => {
        new Action({
          id: 'stop-123',
          label: 'Stop Task',
          parameters: {}
        });
      }).toThrow('Action type is required');
    });
    
    test('should throw error if type is not a string', () => {
      expect(() => {
        new Action({
          id: 'stop-123',
          type: 456,
          label: 'Stop Task',
          parameters: {}
        });
      }).toThrow('Action type must be a string');
    });
    
    test('should throw error if label is missing', () => {
      expect(() => {
        new Action({
          id: 'stop-123',
          type: 'stop-task',
          parameters: {}
        });
      }).toThrow('Action label is required');
    });
    
    test('should throw error if label is not a string', () => {
      expect(() => {
        new Action({
          id: 'stop-123',
          type: 'stop-task',
          label: 789,
          parameters: {}
        });
      }).toThrow('Action label must be a string');
    });
    
    test('should default parameters to empty object if not provided', () => {
      const action = new Action({
        id: 'test-action',
        type: 'test-type',
        label: 'Test Action'
      });
      
      expect(action.parameters).toEqual({});
    });
    
    test('should throw error if parameters is not an object', () => {
      expect(() => {
        new Action({
          id: 'test-action',
          type: 'test-type',
          label: 'Test Action',
          parameters: 'not-an-object'
        });
      }).toThrow('Action parameters must be an object');
    });
  });
  
  describe('toJSON', () => {
    test('should serialize action to JSON', () => {
      const action = new Action({
        id: 'pause-task-456',
        type: 'pause-task',
        label: 'Pause Task',
        parameters: { taskId: 456, reason: 'user-request' }
      });
      
      const json = action.toJSON();
      
      expect(json).toEqual({
        id: 'pause-task-456',
        type: 'pause-task',
        label: 'Pause Task',
        parameters: { taskId: 456, reason: 'user-request' }
      });
    });
    
    test('should serialize action with empty parameters', () => {
      const action = new Action({
        id: 'refresh',
        type: 'refresh',
        label: 'Refresh Page'
      });
      
      const json = action.toJSON();
      
      expect(json).toEqual({
        id: 'refresh',
        type: 'refresh',
        label: 'Refresh Page',
        parameters: {}
      });
    });
  });
  
  describe('fromJSON', () => {
    test('should deserialize action from JSON', () => {
      const json = {
        id: 'resume-task-789',
        type: 'resume-task',
        label: 'Resume Task',
        parameters: { taskId: 789 }
      };
      
      const action = Action.fromJSON(json);
      
      expect(action).toBeInstanceOf(Action);
      expect(action.id).toBe('resume-task-789');
      expect(action.type).toBe('resume-task');
      expect(action.label).toBe('Resume Task');
      expect(action.parameters).toEqual({ taskId: 789 });
    });
    
    test('should throw error if JSON is invalid', () => {
      expect(() => {
        Action.fromJSON({ type: 'test', label: 'Test' }); // missing id
      }).toThrow('Action id is required');
    });
  });
  
  describe('isType', () => {
    test('should return true for matching type', () => {
      const action = new Action({
        id: 'stop-1',
        type: 'stop-task',
        label: 'Stop'
      });
      
      expect(action.isType('stop-task')).toBe(true);
    });
    
    test('should return false for non-matching type', () => {
      const action = new Action({
        id: 'stop-1',
        type: 'stop-task',
        label: 'Stop'
      });
      
      expect(action.isType('pause-task')).toBe(false);
    });
  });
  
  describe('getParameter', () => {
    test('should return parameter value if exists', () => {
      const action = new Action({
        id: 'test',
        type: 'test',
        label: 'Test',
        parameters: { taskId: 123, userName: 'alice' }
      });
      
      expect(action.getParameter('taskId')).toBe(123);
      expect(action.getParameter('userName')).toBe('alice');
    });
    
    test('should return undefined if parameter does not exist', () => {
      const action = new Action({
        id: 'test',
        type: 'test',
        label: 'Test',
        parameters: { taskId: 123 }
      });
      
      expect(action.getParameter('nonexistent')).toBeUndefined();
    });
    
    test('should return default value if parameter does not exist', () => {
      const action = new Action({
        id: 'test',
        type: 'test',
        label: 'Test',
        parameters: { taskId: 123 }
      });
      
      expect(action.getParameter('nonexistent', 'default-value')).toBe('default-value');
    });
    
    test('should return parameter value even if it is falsy', () => {
      const action = new Action({
        id: 'test',
        type: 'test',
        label: 'Test',
        parameters: { count: 0, enabled: false, message: '' }
      });
      
      expect(action.getParameter('count')).toBe(0);
      expect(action.getParameter('enabled')).toBe(false);
      expect(action.getParameter('message')).toBe('');
    });
  });
  
  describe('complex scenarios', () => {
    test('should handle action with nested parameters', () => {
      const action = new Action({
        id: 'complex-action',
        type: 'configure',
        label: 'Configure Settings',
        parameters: {
          config: {
            database: { host: 'localhost', port: 5432 },
            cache: { enabled: true, ttl: 3600 }
          },
          metadata: ['tag1', 'tag2']
        }
      });
      
      expect(action.getParameter('config')).toEqual({
        database: { host: 'localhost', port: 5432 },
        cache: { enabled: true, ttl: 3600 }
      });
      expect(action.getParameter('metadata')).toEqual(['tag1', 'tag2']);
    });
    
    test('should survive JSON round-trip', () => {
      const original = new Action({
        id: 'round-trip',
        type: 'test',
        label: 'Test Round Trip',
        parameters: { value: 42, nested: { key: 'value' } }
      });
      
      const json = original.toJSON();
      const restored = Action.fromJSON(json);
      
      expect(restored.id).toBe(original.id);
      expect(restored.type).toBe(original.type);
      expect(restored.label).toBe(original.label);
      expect(restored.parameters).toEqual(original.parameters);
    });
  });
});
