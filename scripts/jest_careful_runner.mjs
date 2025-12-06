'use strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const jestCliPath = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'node_modules', 'jest', 'bin', 'jest.js')

/**
 * Improved Jest runner with:
 * - Auto-forceExit for E2E/puppeteer tests
 * - Configurable max workers
 * - Timeout safety net
 */
const run = (args) => {
  const result = spawnSync(process.execPath, [jestCliPath, ...args], {
    stdio: 'inherit',
    env: {
      ...process.env,
      FORCE_COLOR: process.env.FORCE_COLOR || '1'
    },
    timeout: 300000  // 5 minute safety net for entire run
  })
  if (result.error) {
    if (result.error.code === 'ETIMEDOUT') {
      console.error('\n⏰ Test run exceeded 5 minute timeout limit')
      return 1
    }
    throw result.error
  }
  return result.status ?? 0
}

/**
 * Detect if test files are E2E/puppeteer based on path patterns
 */
const isE2ETest = (args) => {
  return args.some(arg => 
    arg.includes('e2e') || 
    arg.includes('puppeteer') || 
    arg.includes('.e2e.test') ||
    arg.includes('connection.e2e')
  )
}

const main = () => {
  const argv = process.argv.slice(2)
  const list_only = argv.includes('--list-only') || argv.length === 0
  
  // Base options
  const base = ['--bail=1', '--maxWorkers=50%']
  
  if (list_only) return run([...base, '--listTests'])
  
  // Check for explicit --forceExit in args
  const hasForceExit = argv.includes('--forceExit')
  
  // To avoid regex surprises, prefer exact files first:
  const testFiles = argv.filter(a => 
    a.endsWith('.test.js') || 
    a.endsWith('.spec.js') || 
    a.endsWith('.test.ts') || 
    a.endsWith('.spec.ts')
  )
  const use_by_path = testFiles.length > 0
  const mode = use_by_path ? ['--runTestsByPath'] : []
  
  // Auto-add forceExit for E2E tests if not already specified
  const forceExitArg = (hasForceExit || isE2ETest(argv)) ? ['--forceExit'] : []
  
  // Filter out --forceExit from argv if we're adding it
  const filteredArgv = hasForceExit ? argv.filter(a => a !== '--forceExit') : argv
  
  return run([...base, ...mode, ...forceExitArg, ...filteredArgv])
}

const status = main()
if (typeof status === 'number') {
  process.exit(status)
}