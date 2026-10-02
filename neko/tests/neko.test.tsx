import { describe, expect, mock, test } from 'claude-code/testing'
import type { Mounted } from 'claude-code/testing'
import type { On } from 'claude-code'

import { DARK, PETS } from '../hooks/pets'

const USAGE = { input_tokens: 10, output_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

const band = (bodyColumns: number) => ({
  component: 'AbovePrompt' as const,
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
})

/** A slash command as the person typing it at the prompt runs it. */
const typed = (args: string) => ({
  command: 'neko',
  args,
  origin: { kind: 'composer' as const },
  presentation: { isFullscreen: false, columns: 100 },
})

/** The engine beneath the plugins: an empty band, a quiet session. */
/** The text of the art column, and its open eyes: full blocks in the dark eye colour. */
type Band = Mounted<'terminal' | 'desktop', 'AbovePrompt'>
const artOf = async (ui: Band) => (await ui.find({ key: 'art' }))?.text ?? ''
const openEyes = async (ui: Band) =>
  (await ui.findAll({ type: 'Text', text: '█' })).filter(one => one.props.color === DARK).length
const BLOCKS = /[▀▄█]/

const world = (on: On) => {
  mock.store(on)
  const clock = mock.clock(on, { now: 1_000 })
  on('ui.render', { component: 'AbovePrompt' }, () => ({ type: 'Box', children: [] }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200_000, percent: 30 }, rateLimits: [] } }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))

  return clock
}

/** Another plugin drawing in the band beneath neko, as team-flow would. */
const otherBand = {
  name: 'other-band',
  tier: 'append' as const,
  register: (on: On) => {
    on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
      const { Box, Text } = $.ui.resolve(e)
      return (
        <Box key="other">
          <Text>team-flow band</Text>
        </Box>
      )
    })
  },
}

describe('band', () => {
  test('draws the cat, its greeting and its buttons on every surface that has the band', async ($, on) => {
    world(on)
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ plugin: 'neko', surface, ...band(100) })
      expect(await ui.find({ type: 'Text', text: /สวัสดีเหมียว/ })).toBeDefined()
      expect(await ui.find({ key: 'tip' })).toBeDefined()
      expect(await ui.find({ key: 'hide' })).toBeDefined()
      await ui.unmount()
    }
  })

  test('draws the cat in pixels on a terminal and in characters elsewhere', async ($, on) => {
    world(on)
    const terminal = await $.ui.mount({ plugin: 'neko', surface: 'terminal', ...band(100) })
    expect(BLOCKS.test(await artOf(terminal))).toBe(true)
    expect((await artOf(terminal)).includes('ω')).toBe(false)
    expect(await openEyes(terminal)).toBe(2)
    await terminal.unmount()

    const desktop = await $.ui.mount({ plugin: 'neko', surface: 'desktop', ...band(100) })
    expect(await desktop.find({ type: 'Text', text: /\(=•ω•=\)/ })).toBeDefined()
    expect(await desktop.find({ type: 'Text', text: /ฅ\( {3}\)ฅ/ })).toBeDefined()
    expect(await desktop.find({ type: 'Text', text: /\("\)_\("\)/ })).toBeDefined()
    expect(BLOCKS.test(await artOf(desktop))).toBe(false)
  })

  test('style ascii keeps the characters on a terminal', { options: { style: 'ascii' } }, async ($, on) => {
    world(on)
    const ui = await $.ui.mount({ plugin: 'neko', surface: 'terminal', ...band(100) })
    expect(await ui.find({ type: 'Text', text: /\(=•ω•=\)/ })).toBeDefined()
    expect(BLOCKS.test(await artOf(ui))).toBe(false)
  })

  test('keeps the band of a plugin beneath it', { plugins: [otherBand] }, async ($, on) => {
    world(on)
    for (const surface of ['terminal', 'desktop'] as const) {
      const ui = await $.ui.mount({ plugin: 'neko', surface, ...band(100) })
      expect(await ui.find({ type: 'Text', text: 'team-flow band' })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /สวัสดีเหมียว/ })).toBeDefined()
      await ui.unmount()
    }
  })

  test('drops the art on a narrow band and keeps the line', async ($, on) => {
    world(on)
    const ui = await $.ui.mount({ plugin: 'neko', surface: 'terminal', ...band(40) })
    expect(await ui.find({ type: 'Text', text: '/\\_/\\' })).toBeUndefined()
    expect(await ui.find({ key: 'art' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: 'ฅ(=' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /สวัสดีเหมียว/ })).toBeDefined()
  })

  test('hide removes the cat, /neko show brings it back', async ($, on) => {
    world(on)
    const ui = await $.ui.mount({ plugin: 'neko', surface: 'terminal', ...band(100) })
    await ui.press({ key: 'hide' })
    expect(await ui.find({ type: 'Text', text: /สวัสดีเหมียว/ })).toBeUndefined()

    const shown = await $.command.run(typed('show'))
    expect(shown.text).toContain('กลับมาแล้ว')
    expect(await ui.find({ type: 'Text', text: /สวัสดีเหมียว/ })).toBeDefined()
  })
})

describe('advice', () => {
  test('/neko <question> answers through a fork and says it in the bubble', async ($, on) => {
    world(on)
    const prompts: string[] = []
    on('model.fork', ($, e) => {
      prompts.push(e.prompt)
      return { value: { isAnswered: true, text: 'commit ก่อนแล้วค่อย refactor นะ เมี้ยว~', usage: USAGE } }
    })

    const out = await $.command.run(typed('ควรทำอะไรต่อ'))
    expect(out.text).toContain('เหมียวตอบ')
    expect(out.text).toContain('commit ก่อนแล้วค่อย refactor')
    expect(prompts[0]).toContain('ควรทำอะไรต่อ')

    const ui = await $.ui.mount({ plugin: 'neko', surface: 'desktop', ...band(100) })
    expect(await ui.find({ type: 'Text', text: /commit ก่อนแล้วค่อย refactor/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /\(=\^ω\^=\)/ })).toBeDefined()
  })

  test('falls back to the tip model when there is nothing to fork', { options: { tipModel: 'haiku' } }, async ($, on) => {
    world(on)
    const models: string[] = []
    on('model.fork', () => ({ value: { isAnswered: false, reason: 'nothing-to-fork' } }))
    on('model.complete', ($, e) => {
      models.push(e.model)
      return { value: { isAnswered: true, text: 'เริ่มจากเขียน test ก่อนนะ', usage: USAGE } }
    })

    const out = await $.command.run(typed('เริ่มยังไงดี'))
    expect(out.text).toContain('เริ่มจากเขียน test ก่อน')
    expect(models).toEqual(['haiku'])
  })

  test('a turn with a failed test brings a worried cat and one automatic tip', async ($, on) => {
    const clock = world(on)
    const asked: string[] = []
    on('tool.call', { tool: 'Bash' }, () => ({ isError: true, result: 'exit 1', text: 'FAIL src/a.test.ts' }))
    on('model.complete', ($, e) => {
      asked.push(e.prompt)
      return { value: { isAnswered: true, text: '- "อ่าน stack trace บรรทัดแรกก่อนแก้นะ"', usage: USAGE } }
    })

    await $.turn.start({ text: 'แก้ test', turnId: 't1' })
    await $.tool.call({ tool: 'Bash', command: 'npm test' })
    await $.turn.complete({ answer: 'ยังไม่ผ่าน', durationMs: 5_000, isAborted: false, turnId: 't1', reason: 'answer' })
    await clock.advance(5)

    expect(asked).toHaveLength(1)
    expect(asked[0]).toContain('npm test')

    const ui = await $.ui.mount({ plugin: 'neko', surface: 'desktop', ...band(100) })
    expect(await ui.find({ type: 'Text', text: 'อ่าน stack trace บรรทัดแรกก่อนแก้นะ' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /\(=;ω;=\)/ })).toBeDefined()
  })

  test('a quiet, short turn makes no model call', { options: { autoTips: true } }, async ($, on) => {
    const clock = world(on)
    let calls = 0
    on('model.complete', () => {
      calls += 1
      return { value: { isAnswered: true, text: 'x', usage: USAGE } }
    })

    await $.turn.start({ text: 'hi', turnId: 't1' })
    await $.turn.complete({ answer: 'hello', durationMs: 1_000, isAborted: false, turnId: 't1', reason: 'answer' })
    await clock.advance(5)

    expect(calls).toBe(0)
    const ui = await $.ui.mount({ plugin: 'neko', surface: 'desktop', ...band(100) })
    expect(await ui.find({ type: 'Text', text: /\(=\^ω\^=\)/ })).toBeDefined()
  })

  test('autoTips off makes no model call even after a failure', { options: { autoTips: false } }, async ($, on) => {
    const clock = world(on)
    let calls = 0
    on('tool.call', { tool: 'Bash' }, () => ({ isError: true, result: 'exit 1', text: 'boom' }))
    on('model.complete', () => {
      calls += 1
      return { value: { isAnswered: true, text: 'x', usage: USAGE } }
    })

    await $.turn.start({ text: 'x', turnId: 't1' })
    await $.tool.call({ tool: 'Bash', command: 'make' })
    await $.turn.complete({ answer: '', durationMs: 1_000, isAborted: false, turnId: 't1', reason: 'answer' })
    await clock.advance(5)

    expect(calls).toBe(0)
  })
})

describe('looks', () => {
  test('holds a magnifier and says so while a test runs', async ($, on) => {
    world(on)
    const seen: boolean[] = []
    const looks: { find?: (text: RegExp) => Promise<boolean> } = {}
    on('tool.call', { tool: 'Bash' }, async () => {
      seen.push((await looks.find?.(/กำลังส่อง test/)) === true)
      seen.push((await looks.find?.(/ฅ\( ⌕ \)ฅ/)) === true)
      return { result: { stdout: 'ok', stderr: '', interrupted: false } }
    })
    const ui = await $.ui.mount({ plugin: 'neko', surface: 'desktop', ...band(100) })
    looks.find = async text => (await ui.find({ type: 'Text', text })) !== undefined

    await $.tool.call({ tool: 'Bash', command: 'npm test' })

    expect(seen).toEqual([true, true])
    expect(await ui.find({ type: 'Text', text: /กำลังส่อง test/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /ฅ\( {3}\)ฅ/ })).toBeDefined()
  })

  test('in pixels it holds the magnifier in its paws', async ($, on) => {
    world(on)
    const held: (string | undefined)[] = []
    const looks: { find?: () => Promise<string | undefined> } = {}
    on('tool.call', { tool: 'Bash' }, async () => {
      held.push(await looks.find?.())
      return { result: { stdout: 'ok', stderr: '', interrupted: false } }
    })
    const ui = await $.ui.mount({ plugin: 'neko', surface: 'terminal', ...band(100) })
    looks.find = async () => {
      const glyph = (await ui.findAll({ type: 'Text', text: '⌕' })).find(one => one.text === '⌕')
      return glyph === undefined ? undefined : String(glyph.props.backgroundColor)
    }

    await $.tool.call({ tool: 'Bash', command: 'npm test' })

    expect(held).toEqual([PETS.cat.sprite.colors.w])
    expect(await ui.find({ type: 'Text', text: '⌕' })).toBeUndefined()
  })

  test('a good turn floats a heart up beside the cat, then it is gone', async ($, on) => {
    const clock = world(on)
    await $.turn.start({ text: 'hi', turnId: 't1' })
    await $.turn.complete({ answer: 'done', durationMs: 1_000, isAborted: false, turnId: 't1', reason: 'answer' })

    const ui = await $.ui.mount({ plugin: 'neko', surface: 'terminal', ...band(100) })
    expect(await ui.find({ type: 'Text', text: '♡' })).toBeDefined()
    await clock.advance(450)
    expect(await ui.find({ type: 'Text', text: '♪' })).toBeDefined()
    await clock.advance(1_000)
    expect(await ui.find({ type: 'Text', text: '♡' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: '♪' })).toBeDefined()
  })

  test('blinks and swings its tail while idle', async ($, on) => {
    const clock = world(on)
    on('command.register', (_$, e) => ({ value: { command: e.name } }))
    on('session.start', (_$, e) => ({ cwd: e.cwd }))
    await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })

    const ui = await $.ui.mount({ plugin: 'neko', surface: 'desktop', ...band(100) })
    expect(await ui.find({ type: 'Text', text: /\("\)_\("\) ~/ })).toBeDefined()

    await clock.advance(3_500)
    expect(await ui.find({ type: 'Text', text: /\("\)_\("\) ʃ/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /\(=•ω•=\)/ })).toBeDefined()

    await clock.advance(3_500)
    expect(await ui.find({ type: 'Text', text: /\(=-ω-=\)/ })).toBeDefined()
    await clock.advance(300)
    expect(await ui.find({ type: 'Text', text: /\(=•ω•=\)/ })).toBeDefined()
  })

  test('in pixels it blinks and swings its tail too', async ($, on) => {
    const clock = world(on)
    on('command.register', (_$, e) => ({ value: { command: e.name } }))
    on('session.start', (_$, e) => ({ cwd: e.cwd }))
    await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })

    const ui = await $.ui.mount({ plugin: 'neko', surface: 'terminal', ...band(100) })
    const first = await artOf(ui)
    expect(await openEyes(ui)).toBe(2)

    await clock.advance(3_500)
    expect((await artOf(ui)) === first).toBe(false)
    expect(await openEyes(ui)).toBe(2)

    await clock.advance(3_500)
    expect(await openEyes(ui)).toBe(0)
    await clock.advance(300)
    expect(await openEyes(ui)).toBe(2)
  })

  test('a happy cat smiles in pixels: the top half of each eye, in green', async ($, on) => {
    world(on)
    await $.turn.start({ text: 'hi', turnId: 't1' })
    await $.turn.complete({ answer: 'done', durationMs: 1_000, isAborted: false, turnId: 't1', reason: 'answer' })

    const ui = await $.ui.mount({ plugin: 'neko', surface: 'terminal', ...band(100) })
    const smiles = (await ui.findAll({ type: 'Text', text: '▀' })).filter(one => one.props.color === 'green')
    expect(smiles).toHaveLength(2)
    expect(smiles[0]?.props.backgroundColor).toBe(PETS.cat.sprite.colors.b)
  })

  test('stays still with animate off', { options: { animate: false } }, async ($, on) => {
    const clock = world(on)
    on('command.register', (_$, e) => ({ value: { command: e.name } }))
    on('session.start', (_$, e) => ({ cwd: e.cwd }))
    await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })

    const ui = await $.ui.mount({ plugin: 'neko', surface: 'desktop', ...band(100) })
    await clock.advance(7_000)
    expect(await ui.find({ type: 'Text', text: /\("\)_\("\) ~/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /\(=-ω-=\)/ })).toBeUndefined()
  })
})

describe('pets', () => {
  const started = (on: On) => {
    const clock = world(on)
    on('command.register', (_$, e) => ({ value: { command: e.name } }))
    on('session.start', (_$, e) => ({ cwd: e.cwd }))

    return clock
  }

  test('/neko pet lists every companion and switches by English or Thai name', async ($, on) => {
    started(on)
    await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })

    const list = await $.command.run(typed('pet'))
    for (const face of ['ฅ(=•ω•=)ฅ', 'U(•ᴥ•)U', '(O,O)', '><(((•>', '((•ʃ•))']) {
      expect(list.text).toContain(face)
    }

    const dog = await $.command.run(typed('pet dog'))
    expect(dog.text).toContain('โฮ่งมาแล้ว')
    const ui = await $.ui.mount({ plugin: 'neko', surface: 'desktop', ...band(100) })
    expect(await ui.find({ type: 'Text', text: /U\(\^ᴥ\^\)U/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'โฮ่ง' })).toBeDefined()

    await $.command.run(typed('pet ปลาวาฬ'))
    expect(await ui.find({ type: 'Text', text: /\.-~~~~~-\./ })).toBeDefined()

    const unknown = await $.command.run(typed('pet dragon'))
    expect(unknown.text).toContain('ไม่รู้จัก')
  })

  test('the pet option picks the companion, owl eyes and all', { options: { pet: 'owl' } }, async ($, on) => {
    started(on)
    await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })

    const ui = await $.ui.mount({ plugin: 'neko', surface: 'desktop', ...band(100) })
    expect(await ui.find({ type: 'Text', text: /\( O,O \)/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'ฮูก' })).toBeDefined()
  })

  test("the wolf is the person's own drawing, eyes by mood and a curled tail", async ($, on) => {
    started(on)
    await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
    await $.command.run(typed('pet หมาป่า'))

    const ui = await $.ui.mount({ plugin: 'neko', surface: 'desktop', ...band(100) })
    expect(await ui.find({ type: 'Text', text: /႔ ႔ {7}⸝ {4},/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /ᠸ\^ \^ {3}𐅠 {3}\/ {4}ʃ/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /\| {5}\\ {3}꠹ {4}ʃ/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /woof|މ/ })).toBeUndefined()
  })

  test('every companion draws four rows on every surface', async ($, on) => {
    started(on)
    await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })

    for (const id of ['cat', 'dog', 'wolf', 'bird', 'owl', 'fish', 'whale', 'shark', 'elephant', 'horse', 'cow']) {
      await $.command.run(typed(`pet ${id}`))
      for (const surface of ['terminal', 'desktop'] as const) {
        const ui = await $.ui.mount({ plugin: 'neko', surface, ...band(100) })
        expect(await ui.find({ key: 'tip' })).toBeDefined()
        expect((await ui.find({ key: 'art' }))?.children).toHaveLength(4)
        expect(BLOCKS.test(await artOf(ui))).toBe(surface === 'terminal')
        await ui.unmount()
      }
    }
  })
})
