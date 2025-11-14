'use strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
const jestCliPath = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'node_modules', 'jest', 'bin', 'jest.js')

const run = (args) => {
  const result = spawnSync(process.execPath, [jestCliPath, ...args], {
    stdio: 'inherit',
    env: {
      ...process.env,
      FORCE_COLOR: process.env.FORCE_COLOR || '1'
    }
  })
  if (result.error) {
    throw result.error
  }
  return result.status ?? 0
}

const main = () => {
  const argv = process.argv.slice(2)
  const list_only = argv.includes('--list-only') || argv.length === 0
  const base = ['--bail=1', '--maxWorkers=50%']
  if (list_only) return run([...base, '--listTests'])
  // To avoid regex surprises, prefer exact files first:
  const use_by_path = argv.every(a => a.endsWith('.test.js') || a.endsWith('.spec.js') || a.endsWith('.test.ts') || a.endsWith('.spec.ts'))
  const mode = use_by_path ? ['--runTestsByPath'] : []
  return run([...base, ...mode, ...argv])
}

const status = main()
if (typeof status === 'number') {
  process.exit(status)
}