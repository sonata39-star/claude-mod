import { expect, test } from 'claude-code/testing'
import type { On, ProcessRunResult } from 'claude-code'

const TREE: Record<string, string[]> = {
  '/proj': ['eslint.config.js', 'tsconfig.json', 'node_modules', 'package.json', 'src'],
  '/proj/src': ['a.ts', 'b.ts', 'data.json'],
}

const ESLINT_FAIL = `
/proj/src/a.ts
  3:7  error  'x' is assigned a value but never used  no-unused-vars

✖ 1 problem (1 error, 0 warnings)
`

const TSC_FAIL = [
  "src/a.ts(3,7): error TS2322: Type 'number' is not assignable to type 'string'.",
  "src/old.ts(1,1): error TS2304: Cannot find name 'legacy'.",
].join('\n')

const done = (exitCode: number, stdout = ''): ProcessRunResult => ({
  exitCode,
  stdout,
  stderr: '',
  isStdoutTruncated: false,
  isStderrTruncated: false,
})

function world(on: On, files: Record<string, string> = {}) {
  const runs: string[][] = []
  const toasts: string[] = []
  on('session.cwd', () => ({ value: '/proj' }))
  on('fs.list', ($, e) => ({
    value: (TREE[e.path] ?? []).map(name => ({ name, kind: 'file' as const, size: 0, mtimeMs: 0, isLink: false })),
  }))
  on('fs.exists', ($, e) => ({ value: e.path.startsWith('/proj/node_modules/.bin/') }))
  on('fs.read', ($, e) => ({ value: files[e.path] ?? '{}' }))
  on('process.run', ($, e) => {
    runs.push([...e.argv])
    const bin = e.argv[0] ?? ''
    if (bin.endsWith('/eslint')) {
      return { value: e.argv.includes('/proj/src/a.ts') ? done(1, ESLINT_FAIL) : done(0) }
    }
    if (bin.endsWith('/tsc')) {
      return { value: done(2, TSC_FAIL) }
    }
    return { value: done(1) }
  })
  on('ui.toast', ($, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.status', () => ({ value: undefined }))
  on('ui.log', () => ({ value: undefined }))
  on('tool.call', { tool: 'Write' }, ($, e) => ({
    result: { type: 'create' as const, filePath: e.file_path, content: e.content, structuredPatch: [], originalFile: null },
  }))
  on('classic.Stop', () => ({}))
  return { runs, toasts }
}

test('a failing eslint run rides back on the edit as context', async ($, on) => {
  const { toasts } = world(on)

  const ran = await $.tool.call({ tool: 'Write', file_path: '/proj/src/a.ts', content: 'const x = 1' })

  expect(ran.deny).toBeUndefined()
  expect(ran.context?.[0]).toContain('[auto-check] eslint reported 1 problem(s) in src/a.ts')
  expect(ran.context?.[0]).toContain('no-unused-vars')
  expect(toasts).toEqual(['❌ eslint: 1 error ใน a.ts'])
})

test('a clean file stays quiet', async ($, on) => {
  const { toasts } = world(on)

  const ran = await $.tool.call({ tool: 'Write', file_path: '/proj/src/b.ts', content: 'export const y = 1' })

  expect(ran.context).toBeUndefined()
  expect(toasts).toEqual([])
})

test('tsc runs once at stop, reports only errors in edited files, then lets go', async ($, on) => {
  const { runs } = world(on)

  await $.tool.call({ tool: 'Write', file_path: '/proj/src/b.ts', content: 'a' })
  await $.tool.call({ tool: 'Write', file_path: '/proj/src/a.ts', content: 'b' })
  expect(runs.filter(argv => argv[0]?.endsWith('/tsc'))).toHaveLength(0)

  const stopped = await $.classic.Stop({ stop_hook_active: false })
  expect(runs.filter(argv => argv[0]?.endsWith('/tsc'))).toHaveLength(1)
  expect(stopped.block).toContain('TS2322')
  expect(stopped.block).not.toContain('TS2304')

  const again = await $.classic.Stop({ stop_hook_active: true })
  expect(again.block).toBeUndefined()
  expect(runs.filter(argv => argv[0]?.endsWith('/tsc'))).toHaveLength(1)
})

test('invalid JSON is caught in-module', async ($, on) => {
  world(on, { '/proj/src/data.json': '{ "a": 1,, }' })

  const ran = await $.tool.call({ tool: 'Write', file_path: '/proj/src/data.json', content: '' })

  expect(ran.context?.[0]).toContain('[auto-check] json')
})

test('turned off, it checks nothing', { options: { enabled: false } }, async ($, on) => {
  const { runs } = world(on)

  const ran = await $.tool.call({ tool: 'Write', file_path: '/proj/src/a.ts', content: 'x' })

  expect(ran.context).toBeUndefined()
  expect(runs).toEqual([])
})
