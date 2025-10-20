/**
 * Unit tests for JobControlService
 * 
 * Tests control operations (pause, resume, stop) on running crawler jobs.
 */

const { JobControlService } = require('../JobControlService');

describe('JobControlService', () => {
  // ===== Constructor Tests =====
  describe('constructor', () => {
    test('should require jobRegistry', () => {
      expect(() => new JobControlService()).toThrow('JobControlService requires jobRegistry');
      expect(() => new JobControlService({})).toThrow('JobControlService requires jobRegistry');
    });

    test('should accept valid jobRegistry', () => {
      const mockRegistry = { jobCount: () => 0 };
      const service = new JobControlService({ jobRegistry: mockRegistry });
      expect(service.jobRegistry).toBe(mockRegistry);
    });
  });

  // ===== Helper Methods Tests =====
  describe('getJobCount', () => {
    test('should return job count from registry', () => {
      const mockRegistry = { jobCount: jest.fn(() => 3) };
      const service = new JobControlService({ jobRegistry: mockRegistry });
      
      expect(service.getJobCount()).toBe(3);
      expect(mockRegistry.jobCount).toHaveBeenCalled();
    });
  });

  describe('getJob', () => {
    test('should return job from registry', () => {
      const mockJob = { id: 'abc123', paused: false };
      const mockRegistry = { getJob: jest.fn(() => mockJob) };
      const service = new JobControlService({ jobRegistry: mockRegistry });
      
      expect(service.getJob('abc123')).toBe(mockJob);
      expect(mockRegistry.getJob).toHaveBeenCalledWith('abc123');
    });

    test('should return null for non-existent job', () => {
      const mockRegistry = { getJob: jest.fn(() => null) };
      const service = new JobControlService({ jobRegistry: mockRegistry });
      
      expect(service.getJob('nonexistent')).toBeNull();
    });
  });

  describe('getFirstJob', () => {
    test('should return first job from registry', () => {
      const mockJob = { id: 'first', paused: false };
      const mockRegistry = { getFirstJob: jest.fn(() => mockJob) };
      const service = new JobControlService({ jobRegistry: mockRegistry });
      
      expect(service.getFirstJob()).toBe(mockJob);
      expect(mockRegistry.getFirstJob).toHaveBeenCalled();
    });
  });

  // ===== Stop Job Tests =====
  describe('stopJob', () => {
    test('should stop job successfully', () => {
      const mockJob = { id: 'abc123', child: { pid: 1234 } };
      const mockRegistry = {
        jobCount: jest.fn(() => 1),
        getJob: jest.fn(() => mockJob),
        stopJob: jest.fn(() => ({ ok: true, escalatesInMs: 800, job: mockJob }))
      };
      const service = new JobControlService({ jobRegistry: mockRegistry });
      
      const result = service.stopJob({ jobId: 'abc123' });
      
      expect(result).toEqual({
        ok: true,
        stopped: true,
        escalatesInMs: 800,
        job: mockJob
      });
      expect(mockRegistry.stopJob).toHaveBeenCalledWith('abc123', undefined);
    });

    test('should stop job with custom escalate delay', () => {
      const mockJob = { id: 'abc123', child: { pid: 1234 } };
      const mockRegistry = {
        jobCount: jest.fn(() => 1),
        getJob: jest.fn(() => mockJob),
        stopJob: jest.fn(() => ({ ok: true, escalatesInMs: 1500, job: mockJob }))
      };
      const service = new JobControlService({ jobRegistry: mockRegistry });
      
      const result = service.stopJob({ jobId: 'abc123', escalateDelayMs: 1500 });
      
      expect(result.escalatesInMs).toBe(1500);
      expect(mockRegistry.stopJob).toHaveBeenCalledWith('abc123', { escalateDelayMs: 1500 });
    });

    test('should stop only job when jobId is null', () => {
      const mockJob = { id: 'only', child: { pid: 1234 } };
      const mockRegistry = {
        jobCount: jest.fn(() => 1),
        stopJob: jest.fn(() => ({ ok: true, escalatesInMs: 800, job: mockJob }))
      };
      const service = new JobControlService({ jobRegistry: mockRegistry });
      
      const result = service.stopJob({ jobId: null });
      
      expect(result.ok).toBe(true);
      expect(mockRegistry.stopJob).toHaveBeenCalledWith(null, undefined);
    });

    test('should fail when no jobs running', () => {
      const mockRegistry = {
        jobCount: jest.fn(() => 0)
      };
      const service = new JobControlService({ jobRegistry: mockRegistry });
      
      const result = service.stopJob({ jobId: 'abc123' });
      
      expect(result).toEqual({
        ok: false,
        error: 'not-running',
        message: 'No jobs currently running'
      });
    });

    test('should fail when multiple jobs and no jobId', () => {
      const mockRegistry = {
        jobCount: jest.fn(() => 3)
      };
      const service = new JobControlService({ jobRegistry: mockRegistry });
      
      const result = service.stopJob({ jobId: null });
      
      expect(result).toEqual({
        ok: false,
        error: 'ambiguous',
        message: 'Multiple jobs running; specify jobId'
      });
    });

    test('should fail when job not found', () => {
      const mockRegistry = {
        jobCount: jest.fn(() => 2),
        getJob: jest.fn(() => null)
      };
      const service = new JobControlService({ jobRegistry: mockRegistry });
      
      const result = service.stopJob({ jobId: 'nonexistent' });
      
      expect(result).toEqual({
        ok: false,
        error: 'not-found',
        message: 'Job not found'
      });
    });

    test('should handle registry stopJob failure', () => {
      const mockRegistry = {
        jobCount: jest.fn(() => 1),
        getJob: jest.fn(() => ({ id: 'abc123' })),
        stopJob: jest.fn(() => ({ ok: false }))
      };
      const service = new JobControlService({ jobRegistry: mockRegistry });
      
      const result = service.stopJob({ jobId: 'abc123' });
      
      expect(result).toEqual({
        ok: false,
        error: 'not-found',
        message: 'Job not found'
      });
    });
  });

  // ===== Pause Job Tests =====
  describe('pauseJob', () => {
    test('should pause job successfully', () => {
      const mockJob = { id: 'abc123', paused: false, stdin: { write: jest.fn() } };
      const mockRegistry = {
        jobCount: jest.fn(() => 1),
        getJob: jest.fn(() => mockJob),
        pauseJob: jest.fn(() => ({ ok: true, job: { ...mockJob, paused: true } }))
      };
      const service = new JobControlService({ jobRegistry: mockRegistry });
      
      const result = service.pauseJob({ jobId: 'abc123' });
      
      expect(result).toEqual({
        ok: true,
        paused: true,
        job: expect.objectContaining({ id: 'abc123', paused: true })
      });
      expect(mockRegistry.pauseJob).toHaveBeenCalledWith('abc123');
    });

    test('should pause only job when jobId is null', () => {
      const mockJob = { id: 'only', paused: false, stdin: { write: jest.fn() } };
      const mockRegistry = {
        jobCount: jest.fn(() => 1),
        pauseJob: jest.fn(() => ({ ok: true, job: { ...mockJob, paused: true } }))
      };
      const service = new JobControlService({ jobRegistry: mockRegistry });
      
      const result = service.pauseJob({ jobId: null });
      
      expect(result.ok).toBe(true);
      expect(result.paused).toBe(true);
    });

    test('should fail when no jobs running', () => {
      const mockRegistry = {
        jobCount: jest.fn(() => 0)
      };
      const service = new JobControlService({ jobRegistry: mockRegistry });
      
      const result = service.pauseJob({ jobId: 'abc123' });
      
      expect(result).toEqual({
        ok: false,
        error: 'not-running',
        message: 'No jobs currently running',
        paused: false
      });
    });

    test('should fail when multiple jobs and no jobId', () => {
      const mockRegistry = {
        jobCount: jest.fn(() => 3)
      };
      const service = new JobControlService({ jobRegistry: mockRegistry });
      
      const result = service.pauseJob({ jobId: null });
      
      expect(result).toEqual({
        ok: false,
        error: 'ambiguous',
        message: 'Multiple jobs running; specify jobId',
        paused: false
      });
    });

    test('should fail when job not found', () => {
      const mockRegistry = {
        jobCount: jest.fn(() => 2),
        getJob: jest.fn(() => null)
      };
      const service = new JobControlService({ jobRegistry: mockRegistry });
      
      const result = service.pauseJob({ jobId: 'nonexistent' });
      
      expect(result.ok).toBe(false);
      expect(result.error).toBe('not-found');
      expect(result.paused).toBe(false);
    });

    test('should fail when stdin unavailable', () => {
      const mockJob = { id: 'abc123', stdin: null };
      const mockRegistry = {
        jobCount: jest.fn(() => 1),
        getJob: jest.fn(() => mockJob),
        pauseJob: jest.fn(() => ({ ok: false, error: 'stdin-unavailable', job: mockJob }))
      };
      const service = new JobControlService({ jobRegistry: mockRegistry });
      
      const result = service.pauseJob({ jobId: 'abc123' });
      
      expect(result).toEqual({
        ok: false,
        error: 'stdin-unavailable',
        paused: false,
        message: 'Job stdin unavailable (process may have exited)',
        job: mockJob
      });
    });

    test('should handle registry not-found error', () => {
      const mockRegistry = {
        jobCount: jest.fn(() => 1),
        getJob: jest.fn(() => ({ id: 'abc123' })),
        pauseJob: jest.fn(() => ({ ok: false, error: 'not-found' }))
      };
      const service = new JobControlService({ jobRegistry: mockRegistry });
      
      const result = service.pauseJob({ jobId: 'abc123' });
      
      expect(result.error).toBe('not-found');
      expect(result.message).toBe('Job not found');
      expect(result.paused).toBe(false);
    });
  });

  // ===== Resume Job Tests =====
  describe('resumeJob', () => {
    test('should resume job successfully', () => {
      const mockJob = { id: 'abc123', paused: true, stdin: { write: jest.fn() } };
      const mockRegistry = {
        jobCount: jest.fn(() => 1),
        getJob: jest.fn(() => mockJob),
        resumeJob: jest.fn(() => ({ ok: true, job: { ...mockJob, paused: false } }))
      };
      const service = new JobControlService({ jobRegistry: mockRegistry });
      
      const result = service.resumeJob({ jobId: 'abc123' });
      
      expect(result).toEqual({
        ok: true,
        paused: false,
        job: expect.objectContaining({ id: 'abc123', paused: false })
      });
      expect(mockRegistry.resumeJob).toHaveBeenCalledWith('abc123');
    });

    test('should resume only job when jobId is null', () => {
      const mockJob = { id: 'only', paused: true, stdin: { write: jest.fn() } };
      const mockRegistry = {
        jobCount: jest.fn(() => 1),
        resumeJob: jest.fn(() => ({ ok: true, job: { ...mockJob, paused: false } }))
      };
      const service = new JobControlService({ jobRegistry: mockRegistry });
      
      const result = service.resumeJob({ jobId: null });
      
      expect(result.ok).toBe(true);
      expect(result.paused).toBe(false);
    });

    test('should fail when no jobs running', () => {
      const mockRegistry = {
        jobCount: jest.fn(() => 0)
      };
      const service = new JobControlService({ jobRegistry: mockRegistry });
      
      const result = service.resumeJob({ jobId: 'abc123' });
      
      expect(result).toEqual({
        ok: false,
        error: 'not-running',
        message: 'No jobs currently running',
        paused: false
      });
    });

    test('should fail when multiple jobs and no jobId', () => {
      const mockRegistry = {
        jobCount: jest.fn(() => 3)
      };
      const service = new JobControlService({ jobRegistry: mockRegistry });
      
      const result = service.resumeJob({ jobId: null });
      
      expect(result).toEqual({
        ok: false,
        error: 'ambiguous',
        message: 'Multiple jobs running; specify jobId',
        paused: false
      });
    });

    test('should fail when job not found', () => {
      const mockRegistry = {
        jobCount: jest.fn(() => 2),
        getJob: jest.fn(() => null)
      };
      const service = new JobControlService({ jobRegistry: mockRegistry });
      
      const result = service.resumeJob({ jobId: 'nonexistent' });
      
      expect(result.ok).toBe(false);
      expect(result.error).toBe('not-found');
      expect(result.paused).toBe(false);
    });

    test('should fail when stdin unavailable', () => {
      const mockJob = { id: 'abc123', stdin: null };
      const mockRegistry = {
        jobCount: jest.fn(() => 1),
        getJob: jest.fn(() => mockJob),
        resumeJob: jest.fn(() => ({ ok: false, error: 'stdin-unavailable', job: mockJob }))
      };
      const service = new JobControlService({ jobRegistry: mockRegistry });
      
      const result = service.resumeJob({ jobId: 'abc123' });
      
      expect(result).toEqual({
        ok: false,
        error: 'stdin-unavailable',
        paused: false,
        message: 'Job stdin unavailable (process may have exited)',
        job: mockJob
      });
    });

    test('should handle registry not-found error', () => {
      const mockRegistry = {
        jobCount: jest.fn(() => 1),
        getJob: jest.fn(() => ({ id: 'abc123' })),
        resumeJob: jest.fn(() => ({ ok: false, error: 'not-found' }))
      };
      const service = new JobControlService({ jobRegistry: mockRegistry });
      
      const result = service.resumeJob({ jobId: 'abc123' });
      
      expect(result.error).toBe('not-found');
      expect(result.message).toBe('Job not found');
      expect(result.paused).toBe(false);
    });
  });

  // ===== Edge Cases Tests =====
  describe('edge cases', () => {
    test('should handle empty options object', () => {
      const mockRegistry = {
        jobCount: jest.fn(() => 0)
      };
      const service = new JobControlService({ jobRegistry: mockRegistry });
      
      // All methods should accept empty options
      expect(service.stopJob({})).toHaveProperty('ok', false);
      expect(service.pauseJob({})).toHaveProperty('ok', false);
      expect(service.resumeJob({})).toHaveProperty('ok', false);
    });

    test('should handle undefined options', () => {
      const mockRegistry = {
        jobCount: jest.fn(() => 0)
      };
      const service = new JobControlService({ jobRegistry: mockRegistry });
      
      // All methods should accept undefined (use defaults)
      expect(service.stopJob()).toHaveProperty('ok', false);
      expect(service.pauseJob()).toHaveProperty('ok', false);
      expect(service.resumeJob()).toHaveProperty('ok', false);
    });

    test('should preserve error details from registry', () => {
      const mockJob = { id: 'abc123' };
      const mockRegistry = {
        jobCount: jest.fn(() => 1),
        getJob: jest.fn(() => mockJob),
        pauseJob: jest.fn(() => ({ ok: false, error: 'custom-error', job: mockJob }))
      };
      const service = new JobControlService({ jobRegistry: mockRegistry });
      
      const result = service.pauseJob({ jobId: 'abc123' });
      
      expect(result.error).toBe('custom-error');
      expect(result.message).toBe('custom-error');
      expect(result.job).toBe(mockJob);
    });
  });
});
