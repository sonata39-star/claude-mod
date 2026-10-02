import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On } from 'claude-code'

const PLAN = `# Plan: Login
## Task Breakdown
1. [x] add route
2. [ ] wire API
`

const FILES: Record<string, { mtimeMs: number; text: string }> = {
  'req-login.md': { mtimeMs: 1, text: '# Requirement: Login' },
  'plan-login.md': { mtimeMs: 2, text: PLAN },
}

const BAND = {
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 120, scroll: { offset: 0, bodyRows: 10 }, view: {} },
} as const

// a stand-in for the engine beneath the plugins: a project with a .team folder
function project(on: On, hasTeam: boolean) {
  on('session.cwd', () => ({ value: '/proj' }))
  on('fs.exists', ($, e) => ({ value: hasTeam && e.path === '/proj/.team' }))
  on('fs.list', () => ({
    value: Object.entries(FILES).map(([name, f]) => ({ name, kind: 'file' as const, size: f.text.length, mtimeMs: f.mtimeMs, isLink: false })),
  }))
  on('fs.read', ($, e) => ({ value: FILES[e.path.split('/').pop() ?? '']?.text ?? '' }))
  on('agent.list', () => ({ value: [] }))
  on('ui.render', { component: 'AbovePrompt' }, () => ({ type: 'engine', ref: 0 }))
}

async function showBand($: Engine) {
  // /team-flow refreshes and toggles; twice leaves the band shown
  const run = { command: 'team-flow', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } } as const
  const first = await $.command.run(run)
  await $.command.run(run)

  return first.text ?? ''
}

test('draws the pipeline and keeps the engine (and other plugins) beneath', {
  plugins: [
    {
      name: 'neko-stub',
      register(on) {
        on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
          const { Box, Text } = $.ui.resolve(e)
          const below = await next(e)

          return (
            <Box flexDirection="column">
              <Text key="neko">=^.^= meow</Text>
              {below}
            </Box>
          )
        })
      },
    },
  ],
}, async ($, on) => {
  project(on, true)
  const text = await showBand($)

  expect(text).toContain('login: 📋 BA ✓ → 🧭 Lead ✓ → 🔨 Dev 1/2 ◀')

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'team-flow', surface, ...BAND })

    expect(await ui.find({ type: 'Text', text: /Dev 1\/2/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /meow/ })).toBeDefined()
    expect(await ui.find({ type: 'Button', key: 'team-flow-hide' })).toBeDefined()
    expect(JSON.stringify(await ui.drawn())).toContain('"engine"')
    await ui.unmount()
  }
})

test('hide button hides the band', async ($, on) => {
  project(on, true)
  await showBand($)
  const ui = await $.ui.mount({ plugin: 'team-flow', surface: 'terminal', ...BAND })

  await ui.press({ key: 'team-flow-hide' })
  expect(await ui.find({ type: 'Text', text: /Dev/ })).toBeUndefined()
  await ui.unmount()
})

test('stays out of the way without a .team folder', async ($, on) => {
  project(on, false)
  const text = await showBand($)

  expect(text).toContain('ยังไม่มีไฟล์')

  const ui = await $.ui.mount({ plugin: 'team-flow', surface: 'terminal', ...BAND })

  expect(await ui.drawn()).toEqual({ type: 'engine', ref: 0 })
  await ui.unmount()
})

test('shows a team agent while it runs', async ($, on) => {
  project(on, true)
  let finish: () => void = () => {}
  let reached: () => void = () => {}
  const done = new Promise<void>(resolve => {
    finish = resolve
  })
  const isReached = new Promise<void>(resolve => {
    reached = resolve
  })

  // beneath the plugin: by the time this runs, team-flow has marked the agent running
  on('tool.call', { tool: 'Agent' }, async () => {
    reached()
    await done

    return { result: { status: 'completed' } as never }
  })
  await showBand($)

  const call = $.tool.call({ tool: 'Agent', description: 'build login', prompt: 'implement plan', subagent_type: 'dev' })
  await isReached
  const ui = await $.ui.mount({ plugin: 'team-flow', surface: 'terminal', ...BAND })

  expect(await ui.find({ type: 'Text', text: /Dev กำลังทำงาน/ })).toBeDefined()

  finish()
  await call
  expect(await ui.find({ type: 'Text', text: /กำลังทำงาน/ })).toBeUndefined()
  await ui.unmount()
})

// A stand-in for dev-dashboard: it publishes whether its sidebar is docked.
async function startSession($: Engine, on: On) {
  mock.clock(on)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  await $.session.start({ cwd: '/proj', surface: 'terminal', isInteractive: true })
}

test('steps aside while the dashboard sidebar is docked (it draws the pipeline there)', {
  plugins: [
    {
      name: 'dev-dashboard',
      register(on) {
        on('session.start', async ($, e, next) => {
          await $.state.set({ plugin: 'dev-dashboard', key: 'isDocked' }, true)

          return next(e)
        })
      },
    },
  ],
}, async ($, on) => {
  project(on, true)
  await startSession($, on)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'team-flow', surface, ...BAND })

    expect(await ui.find({ type: 'Text', text: /Dev/ })).toBeUndefined()
    expect(await ui.drawn()).toEqual({ type: 'engine', ref: 0 })
    await ui.unmount()
  }
})

test('shows the band again when the sidebar is not docked', {
  plugins: [
    {
      name: 'dev-dashboard',
      register(on) {
        on('session.start', async ($, e, next) => {
          await $.state.set({ plugin: 'dev-dashboard', key: 'isDocked' }, false)

          return next(e)
        })
      },
    },
  ],
}, async ($, on) => {
  project(on, true)
  await startSession($, on)

  const ui = await $.ui.mount({ plugin: 'team-flow', surface: 'terminal', ...BAND })
  expect(await ui.find({ type: 'Text', text: /Dev 1\/2/ })).toBeDefined()
  await ui.unmount()
})
