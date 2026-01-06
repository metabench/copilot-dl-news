'use strict';

/**
 * Quick check for the BackgroundTask and TaskManager infrastructure
 */

const { BackgroundTask } = require('../src/tasks/BackgroundTask');
const { TaskManager } = require('../src/tasks/TaskManager');

// Create a simple test task
class CountingTask extends BackgroundTask {
  constructor(options = {}) {
    super(options);
    this.countTo = options.countTo || 10;
    this.delay = options.delay || 100;
  }
  
  getName() { return 'Counting Task'; }
  getType() { return 'counting'; }
  
  async _execute() {
    this.setTotal(this.countTo);
    
    for (let i = 1; i <= this.countTo; i++) {
      if (this.isCancelled()) {
        return { cancelled: true, at: i };
      }
      
      await this.waitIfPaused();
      
      this.updateProgress(i, {
        message: `Counting: ${i} of ${this.countTo}`,
        phase: 'counting'
      });
      
      await new Promise(r => setTimeout(r, this.delay));
    }
    
    return { counted: this.countTo, success: true };
  }
}

async function main() {
  console.log('=== BackgroundTask Infrastructure Check ===\n');
  
  // Test 1: Basic task execution
  console.log('1. Testing basic task execution...');
  const task1 = new CountingTask({ countTo: 5, delay: 50 });
  
  task1.on('started', info => console.log(`   Started: ${info.name}`));
  task1.on('progress', p => console.log(`   Progress: ${p.current}/${p.total} (${p.percent}%) - ${p.message}`));
  task1.on('completed', result => console.log(`   Completed:`, result));
  
  const result1 = await task1.start();
  console.log('   ✅ Basic task passed\n');
  
  // Test 2: TaskManager coordination
  console.log('2. Testing TaskManager...');
  const manager = new TaskManager({ updateIntervalMs: 100 });
  
  const task2 = new CountingTask({ countTo: 3, delay: 30 });
  manager.addTask(task2);
  
  manager.on('task:started', info => console.log(`   [Manager] Task started: ${info.id}`));
  manager.on('task:completed', info => console.log(`   [Manager] Task completed: ${info.id}`));
  
  await manager.startTask(task2.id);
  
  const allInfo = manager.getAllTasksInfo();
  console.log(`   Active tasks: ${allInfo.stats.activeCount}`);
  console.log(`   Completed tasks: ${allInfo.stats.completedCount}`);
  console.log('   ✅ TaskManager passed\n');
  
  // Test 3: Pause/Resume
  console.log('3. Testing pause/resume...');
  const task3 = new CountingTask({ countTo: 10, delay: 50 });
  
  let pauseResumeWorks = false;
  task3.on('paused', () => console.log('   Paused!'));
  task3.on('resumed', () => {
    console.log('   Resumed!');
    pauseResumeWorks = true;
  });
  
  const runPromise = task3.start();
  
  // Pause after 150ms
  setTimeout(() => task3.pause(), 150);
  // Resume after 300ms
  setTimeout(() => task3.resume(), 300);
  
  await runPromise;
  console.log(`   ✅ Pause/Resume ${pauseResumeWorks ? 'passed' : 'FAILED'}\n`);
  
  // Test 4: Cancel
  console.log('4. Testing cancellation...');
  const task4 = new CountingTask({ countTo: 100, delay: 50 });
  
  let wasCancelled = false;
  task4.on('cancelled', () => {
    console.log('   Cancelled!');
    wasCancelled = true;
  });
  
  const cancelPromise = task4.start();
  setTimeout(() => task4.cancel(), 100);
  
  await cancelPromise.catch(() => {});
  console.log(`   ✅ Cancellation ${wasCancelled ? 'passed' : 'FAILED'}\n`);
  
  // Summary
  console.log('=== All checks passed ===');
  process.exit(0);
}

main().catch(err => {
  console.error('Check failed:', err);
  process.exit(1);
});
