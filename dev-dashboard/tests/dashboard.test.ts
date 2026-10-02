import { expect, mock, test } from 'claude-code/testing'
import type { On, RenderPropsOf } from 'claude-code'

import { duration, fit, fitPath, isCheck, relative } from '../hooks/format'

const NOW = new Date(2026, 9, 2, 12, 17).getTime()

const PANE_PROPS: RenderPropsOf['Pane'] = {
  title: 'Dashboard',
  isFocused: false,
  bodyColumns: 60,
  placement: 'dock',
  scroll: { offset: 0, bodyRows: 40 },
  view: {},
}

const PANE = { plugin: 'dev-dashboard', component: 'Pane', requestId: 'dev-dashboard', props: PANE_PROPS } as const

// The engine beneath the plugin: tools answer, usage reads, the pane opens.
function world(on: On) {
  mock.clock(on, { now: NOW })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('session.usage', () => ({
    value: {
      startedAt: NOW,
      context: { tokens: 84_000, window: 200_000, percent: 42 },
      rateLimits: [{ kind: 'five_hour', percentUsed: 23, resetsAt: new Date(NOW + 2 * 3_600_000 + 13 * 60_000).toISOString() }],
      cost: { usd: 1.5 },
    },
  }))
  on('turn.complete', () => ({ text: '' }))
  on('tool.call', ($, e) => {
    if (e.tool === 'Bash' && e.command.startsWith('rm -rf /')) {
      return { deny: 'dev-guard: blocked rm -rf /' }
    }
    if (e.tool === 'Bash' && e.command === 'npm test') {
      return { isError: true as const, result: 'exit 1', text: 'exit 1' }
    }

    return { result: undefined as never, text: 'ok' }
  })
}

test('format keeps lines and paths inside the pane', () => {
  expect(fit('git   status\n--short', 40)).toBe('git status --short')
  expect(fit('a'.repeat(30), 10)).toBe(`${'a'.repeat(9)}…`)
  expect(fitPath('/very/long/path/to/file.ts', 10)).toBe('…o/file.ts')
  expect(relative('/repo/src/a.ts', '/repo')).toBe('src/a.ts')
  expect(duration(512_000)).toBe('8m32s')
  expect(isCheck('npm test')).toBe(true)
  expect(isCheck('npx tsc -p .')).toBe(true)
  expect(isCheck('git status')).toBe(false)
})

test('shows edits, commands, checks, denials, turns and usage on every surface', async ($, on) => {
  world(on)

  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'Edit', file_path: '/repo/src/a.ts', old_string: 'a', new_string: 'b' })
  await $.tool.call({ tool: 'Edit', file_path: '/repo/src/a.ts', old_string: 'b', new_string: 'c' })
  await $.tool.call({ tool: 'Write', file_path: '/repo/README.md', content: '# hi' })
  await $.tool.call({ tool: 'Bash', command: 'git status' })
  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  await $.tool.call({ tool: 'Bash', command: 'rm -rf /' })
  await $.turn.complete({ answer: 'done', durationMs: 42_000, isAborted: false, turnId: 't1', reason: 'answer' })

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })

    expect(await ui.find({ type: 'Text', text: '1 turns · รวม 42s · ล่าสุด 42s · $1.50' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^Context ใช้ไป 42% · เหลือ 58% · 84k\/200k tokens$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: `${'▰'.repeat(25)}${'▱'.repeat(35)}` })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^5-hour ใช้ไป 23% · เหลือ 77% · รีเซ็ต 14:30 · อีก 2ชม 13น$/ })).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /^▰{14}$/ }))?.props.color).toBe('green')
    expect(await ui.find({ type: 'Text', text: 'ไฟล์ที่แก้ (2)' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /×2 src\/a\.ts/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /✗ npm test/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /✓ git status/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /✗ พัง npm test/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Bash: dev-guard: blocked rm -rf \// })).toBeDefined()

    await ui.unmount()
  }
})

test('the clear button empties the lists', async ($, on) => {
  world(on)

  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  await $.tool.call({ tool: 'Edit', file_path: '/repo/src/a.ts', old_string: 'a', new_string: 'b' })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: 'ไฟล์ที่แก้ (1)' })).toBeDefined()

  await ui.press({ key: 'clear' })

  expect(await ui.find({ type: 'Text', text: 'ไฟล์ที่แก้ (0)' })).toBeDefined()
  expect(await ui.find({ type: 'Button', key: 'clear' })).toBeUndefined()
  await ui.unmount()
})

test('/dashboard opens the pane and /dashboard close closes it', async ($, on) => {
  world(on)
  const closed: string[] = []
  on('ui.close', ($, e) => {
    closed.push(e.id)

    return { value: undefined }
  })

  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true })
  const presentation = { isFullscreen: true, columns: 160 }
  const opened = await $.command.run({ command: 'dashboard', args: '', origin: { kind: 'composer' }, presentation })
  expect(opened.text).toBe('เปิด dashboard แล้ว')

  const shut = await $.command.run({ command: 'dashboard', args: 'close', origin: { kind: 'composer' }, presentation })
  expect(shut.text).toBe('ปิด dashboard แล้ว')
  expect(closed).toEqual(['dev-dashboard'])
})
