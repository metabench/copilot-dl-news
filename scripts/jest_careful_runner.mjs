'use strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const run = (args) => spawnSync('npx', ['jest', ...args], { stdio: 'inherit' })

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

main()