/**
 * Tests for ActionRegistry
 */

const { ActionRegistry, createActionRegistry } = require('../ActionRegistry');
const Action = require('../Action');

describe('ActionRegistry', () => {
  let registry;
  
  beforeEach(() => {
    registry = new ActionRegistry();
  });
  
  describe('constructor', () => {
    test('should create empty registry', () => {
      expect(registry.handlers).toEqual({});
    });
  });
  
  describe('register', () => {
    test('should register action handler', () => {
      const handler = jest.fn();
      
      registry.register('test-action', handler);
      
      expect(registry.handlers['test-action']).toBeDefined();
      expect(registry.handlers['test-action'].handler).toBe(handler);
    });
    
    test('should register handler with required parameters', () => {
      const handler = jest.fn();
      const requiredParams = ['taskId', 'reason'];
      
      registry.register('test-action', handler, requiredParams);
      
      expect(registry.handlers['test-action'].requiredParams).toEqual(requiredParams);
    });
    
    test('should default required parameters to empty array', () => {
      const handler = jest.fn();
      
      registry.register('test-action', handler);
      
      expect(registry.handlers['test-action'].requiredParams).toEqual([]);
    });
    
    test('should throw error if action type is not a string', () => {
      expect(() => {
        registry.register(123, jest.fn());
      }).toThrow('Action type must be a string');
    });
    
    test('should throw error if handler is not a function', () => {
      expect(() => {
        registry.register('test-action', 'not-a-function');
      }).toThrow('Handler must be a function');
    });
    
    test('should throw error if required parameters is not an array', () => {
      expect(() => {
        registry.register('test-action', jest.fn(), 'not-an-array');
      }).toThrow('Required parameters must be an array');
    });
    
    test('should allow overwriting existing handler', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      
      registry.register('test-action', handler1);
      registry.register('test-action', handler2);
      
      expect(registry.handlers['test-action'].handler).toBe(handler2);
    });
  });
  
  describe('execute', () => {
    test('should execute registered handler with action and context', async () => {
      const handler = jest.fn().mockResolvedValue({ success: true });
      registry.register('test-action', handler);
      
      const action = new Action({
        id: 'test-1',
        type: 'test-action',
        label: 'Test',
        parameters: { value: 42 }
      });
      
      const context = { user: 'alice' };
      
      const result = await registry.execute(action, context);
      
      expect(handler).toHaveBeenCalledWith(action, context);
      expect(result).toEqual({ success: true });
    });
    
    test('should throw error if action type is not registered', async () => {
      const action = new Action({
        id: 'unknown',
        type: 'unknown-action',
        label: 'Unknown'
      });
      
      await expect(registry.execute(action, {}))
        .rejects
        .toThrow('No handler registered for action type: unknown-action');
    });
    
    test('should validate required parameters', async () => {
      const handler = jest.fn();
      registry.register('test-action', handler, ['taskId', 'reason']);
      
      const action = new Action({
        id: 'test',
        type: 'test-action',
        label: 'Test',
        parameters: { taskId: 123 } // missing 'reason'
      });
      
      await expect(registry.execute(action, {}))
        .rejects
        .toThrow('Action test-action missing required parameter: reason');
    });
    
    test('should pass validation if all required parameters present', async () => {
      const handler = jest.fn().mockResolvedValue({ success: true });
      registry.register('test-action', handler, ['taskId', 'reason']);
      
      const action = new Action({
        id: 'test',
        type: 'test-action',
        label: 'Test',
        parameters: { taskId: 123, reason: 'test' }
      });
      
      await registry.execute(action, {});
      
      expect(handler).toHaveBeenCalled();
    });
    
    test('should propagate handler errors', async () => {
      const handler = jest.fn().mockRejectedValue(new Error('Handler failed'));
      registry.register('test-action', handler);
      
      const action = new Action({
        id: 'test',
        type: 'test-action',
        label: 'Test'
      });
      
      await expect(registry.execute(action, {}))
        .rejects
        .toThrow('Handler failed');
    });
  });
  
  describe('isRegistered', () => {
    test('should return true if action type is registered', () => {
      registry.register('test-action', jest.fn());
      
      expect(registry.isRegistered('test-action')).toBe(true);
    });
    
    test('should return false if action type is not registered', () => {
      expect(registry.isRegistered('unknown-action')).toBe(false);
    });
  });
  
  describe('getRegisteredTypes', () => {
    test('should return list of registered action types', () => {
      registry.register('action-1', jest.fn());
      registry.register('action-2', jest.fn());
      registry.register('action-3', jest.fn());
      
      const types = registry.getRegisteredTypes();
      
      expect(types).toEqual(['action-1', 'action-2', 'action-3']);
    });
    
    test('should return empty array if no actions registered', () => {
      const types = registry.getRegisteredTypes();
      
      expect(types).toEqual([]);
    });
  });
});

describe('createActionRegistry', () => {
  test('should create registry with standard actions', () => {
    const registry = createActionRegistry();
    
    expect(registry).toBeInstanceOf(ActionRegistry);
    expect(registry.isRegistered('stop-task')).toBe(true);
    expect(registry.isRegistered('pause-task')).toBe(true);
    expect(registry.isRegistered('resume-task')).toBe(true);
    expect(registry.isRegistered('start-task')).toBe(true);
  });
  
  describe('stop-task handler', () => {
    test('should stop task via BackgroundTaskManager', async () => {
      const mockManager = {
        cancelTask: jest.fn().mockResolvedValue(undefined)
      };
      
      const registry = createActionRegistry();
      const action = new Action({
        id: 'stop-123',
        type: 'stop-task',
        label: 'Stop Task',
        parameters: { taskId: 123 }
      });
      
      const result = await registry.execute(action, { backgroundTaskManager: mockManager });
      
      expect(mockManager.cancelTask).toHaveBeenCalledWith(123);
      expect(result).toEqual({ success: true, message: 'Task stopped successfully' });
    });
    
    test('should throw error if BackgroundTaskManager not in context', async () => {
      const registry = createActionRegistry();
      const action = new Action({
        id: 'stop-123',
        type: 'stop-task',
        label: 'Stop',
        parameters: { taskId: 123 }
      });
      
      await expect(registry.execute(action, {}))
        .rejects
        .toThrow('BackgroundTaskManager not found in context');
    });
    
    test('should validate taskId parameter', async () => {
      const registry = createActionRegistry();
      const action = new Action({
        id: 'stop',
        type: 'stop-task',
        label: 'Stop',
        parameters: {} // missing taskId
      });
      
      await expect(registry.execute(action, { backgroundTaskManager: {} }))
        .rejects
        .toThrow('Action stop-task missing required parameter: taskId');
    });
  });
  
  describe('pause-task handler', () => {
    test('should pause task via BackgroundTaskManager', async () => {
      const mockManager = {
        pauseTask: jest.fn().mockResolvedValue(undefined)
      };
      
      const registry = createActionRegistry();
      const action = new Action({
        id: 'pause-456',
        type: 'pause-task',
        label: 'Pause Task',
        parameters: { taskId: 456 }
      });
      
      const result = await registry.execute(action, { backgroundTaskManager: mockManager });
      
      expect(mockManager.pauseTask).toHaveBeenCalledWith(456);
      expect(result).toEqual({ success: true, message: 'Task paused successfully' });
    });
  });
  
  describe('resume-task handler', () => {
    test('should resume task via BackgroundTaskManager', async () => {
      const mockManager = {
        resumeTask: jest.fn().mockResolvedValue(undefined)
      };
      
      const registry = createActionRegistry();
      const action = new Action({
        id: 'resume-789',
        type: 'resume-task',
        label: 'Resume Task',
        parameters: { taskId: 789 }
      });
      
      const result = await registry.execute(action, { backgroundTaskManager: mockManager });
      
      expect(mockManager.resumeTask).toHaveBeenCalledWith(789);
      expect(result).toEqual({ success: true, message: 'Task resumed successfully' });
    });
  });
  
  describe('start-task handler', () => {
    test('should start task via BackgroundTaskManager', async () => {
      const mockManager = {
        startTask: jest.fn().mockResolvedValue(undefined)
      };
      
      const registry = createActionRegistry();
      const action = new Action({
        id: 'start-321',
        type: 'start-task',
        label: 'Start Task',
        parameters: { taskId: 321 }
      });
      
      const result = await registry.execute(action, { backgroundTaskManager: mockManager });
      
      expect(mockManager.startTask).toHaveBeenCalledWith(321);
      expect(result).toEqual({ success: true, message: 'Task started successfully' });
    });
  });
  
  describe('error handling', () => {
    test('should propagate errors from task manager methods', async () => {
      const mockManager = {
        stopTask: jest.fn().mockRejectedValue(new Error('Task not found'))
      };
      
      const registry = createActionRegistry();
      const action = new Action({
        id: 'stop-999',
        type: 'stop-task',
        label: 'Stop',
        parameters: { taskId: 999 }
      });
      
      await expect(registry.execute(action, { backgroundTaskManager: mockManager }))
        .rejects
        .toThrow('Task not found');
    });
  });
});
