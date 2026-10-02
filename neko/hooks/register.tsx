import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderElement } from 'claude-code'

import type { NekoAction, NekoMood, NekoPet } from '../types'
import {
  artWidth,
  eyeOf,
  eyeShape,
  findPet,
  miniFace,
  PET_IDS,
  PETS,
  pieces,
  spriteFaceRow,
  spriteRows,
  spriteWidth,
  widthOf,
} from './pets'
import type { Cell, Pet } from './pets'

const line = atom({ plugin: 'neko', key: 'line' } as const, null)
const mood = atom({ plugin: 'neko', key: 'mood' } as const, 'idle')
const isHidden = atom({ plugin: 'neko', key: 'isHidden' } as const, false)
const action = atom({ plugin: 'neko', key: 'action' } as const, null)
const isBlinking = atom({ plugin: 'neko', key: 'isBlinking' } as const, false)
const tail = atom({ plugin: 'neko', key: 'tail' } as const, 0)
const sparkle = atom({ plugin: 'neko', key: 'sparkle' } as const, -1)
const pet = atom({ plugin: 'neko', key: 'pet' } as const, 'cat')

const HAIKU = 'claude-haiku-4-5-20251001'
const MAX_LINE = 120
const MINUTE = 60_000
const SLEEPY_AFTER = 10 * MINUTE
const BREAK_EVERY = 90 * MINUTE
const COMMIT_NUDGE_EVERY = 30 * MINUTE
const LATE_NUDGE_EVERY = 60 * MINUTE
const RULES_EVERY = 2 * MINUTE
const UNCOMMITTED_LIMIT = 8
const TIP_EVERY_TURNS = 3
const LONG_TURN_MS = 2 * MINUTE

function persona(p: Pet): string {
  return [
    `คุณคือ "${p.call}" ${p.label}ผู้ช่วยนักพัฒนา แบบ Jarvis แต่เป็น${p.label} ฉลาด เป็นมิตร พูดภาษาไทย`,
    'ให้คำแนะนำที่ทำได้จริงเรื่องโค้ด วิธีทำงาน git การทดสอบ และสุขภาพนักพัฒนา ไม่น้ำ ไม่ใช้ markdown',
    `บางครั้งลงท้ายด้วย "${p.flourish}" แต่ไม่ต้องทุกครั้ง`,
  ].join('\n')
}

const ONE_LINE = 'ตอบเป็นประโยคเดียว ภาษาไทย ไม่เกิน 90 ตัวอักษร'

const SPARKLE = '#ff8fb8'
const TICK_MS = 3500
const BLINK_MS = 220
const FLOAT_STEP_MS = 450

const BLINKS: ReadonlySet<NekoMood> = new Set(['idle', 'thinking'])

const MOOD_COLOR: Record<NekoMood, string | undefined> = {
  idle: undefined,
  working: 'yellow',
  happy: 'green',
  worried: 'red',
  sleepy: 'gray',
  thinking: 'cyan',
}

/** What floats beside the face for each mood. */
const MOOD_MARK: Record<NekoMood, string> = {
  idle: '♡',
  working: '',
  happy: '♪',
  worried: '!',
  sleepy: 'zZ',
  thinking: '?',
}

/** What the companion holds while Claude is busy with something. */
const HELD: Record<NekoAction, string> = {
  type: '✎',
  test: '⌕',
  commit: '□',
  push: '↑',
  install: '↓',
  read: '≡',
  web: '@',
  agent: '»',
}

/** The pet the `pet` option names; `random` picks one each session. */
function petOption(value: unknown): NekoPet | 'random' {
  return value === 'random' ? 'random' : (findPet(String(value ?? '')) ?? 'cat')
}

const ACTION_LABEL: Record<NekoAction, string> = {
  type: ' · กำลังเขียนโค้ด',
  test: ' · กำลังส่อง test',
  commit: ' · กำลังแพ็ก commit',
  push: ' · กำลัง push ขึ้นไป',
  install: ' · กำลังติดตั้ง',
  read: ' · กำลังอ่านไฟล์',
  web: ' · กำลังค้นเว็บ',
  agent: ' · ส่งงานให้ทีม',
}

const INSTALL_COMMAND = /\b(npm|pnpm|yarn|bun)\s+(i|install|add|ci)\b|\bpip3?\s+install\b|\bbrew\s+install\b|\bcargo\s+add\b|\bgo\s+get\b|\buv\s+(add|sync|pip)\b/

const MOOD_LABEL: Record<NekoMood, string> = {
  idle: '',
  working: ' · กำลังดูอยู่นะ',
  happy: ' · เยี่ยม!',
  worried: ' · อุ๊ย',
  sleepy: ' · zZ',
  thinking: ' · กำลังคิด…',
}

const greeting = (p: Pet) => `สวัสดี${p.call}~ ติดตรงไหนพิมพ์ /neko <คำถาม> ถามได้เลยนะ`

const TEST_COMMAND = /\b(test|jest|vitest|pytest|mocha|playwright|go test|cargo test|phpunit|rspec)\b/

type TurnStats = {
  tools: Map<string, number>
  failures: string[]
  testFailures: number
  denies: number
  files: Set<string>
}

const newTurn = (): TurnStats => ({
  tools: new Map(),
  failures: [],
  testFailures: 0,
  denies: 0,
  files: new Set(),
})

/** What the module keeps between hooks; a reload starts it over, as it should. */
const memo = {
  autoTips: true,
  animate: true,
  isPixel: true,
  ticks: 0,
  actionToken: 0,
  tipModel: HAIKU,
  turn: newTurn(),
  turnsSinceTip: 0,
  isTipRunning: false,
  lastActiveAt: 0,
  lastRulesAt: 0,
  lastBreakAt: 0,
  lastCommitNudgeAt: 0,
  lastLateNudgeAt: 0,
  lastContextBucket: 0,
  lastSummary: '',
}

/** One line, no markdown, no wrapping quotes, at most MAX_LINE characters. */
function tidy(text: string): string {
  const first =
    text
      .split('\n')
      .map(one => one.trim())
      .find(one => one.length > 0) ?? ''
  const plain = first
    .replace(/^[-*>#\d.)\s]+/, '')
    .replace(/[*_`]/g, '')
    .replace(/^["'“”]+|["'“”]+$/g, '')
    .trim()

  return plain.length > MAX_LINE ? `${plain.slice(0, MAX_LINE - 1)}…` : plain
}

function formatMinutes(ms: number): string {
  const minutes = Math.round(ms / MINUTE)

  return minutes >= 60 ? `${Math.floor(minutes / 60)} ชม. ${minutes % 60} นาที` : `${minutes} นาที`
}

function summarize(stats: TurnStats, durationMs: number, reason: string, answer: string, contextPercent?: number): string {
  const tools = [...stats.tools].map(([name, count]) => `${name}×${count}`).join(', ') || 'ไม่มี'
  const parts = [
    `เทิร์นล่าสุดใช้เวลา ${Math.round(durationMs / 1000)} วินาที จบแบบ: ${reason}`,
    `เครื่องมือที่ใช้: ${tools}`,
  ]

  if (stats.failures.length > 0) {
    parts.push(`ที่ล้มเหลว (${stats.failures.length}): ${stats.failures.slice(-5).join(' | ')}`)
  }
  if (stats.testFailures > 0) {
    parts.push(`test fail ${stats.testFailures} ครั้ง`)
  }
  if (stats.denies > 0) {
    parts.push(`ถูกบล็อก/ปฏิเสธ ${stats.denies} ครั้ง`)
  }
  if (stats.files.size > 0) {
    parts.push(`ไฟล์ที่แก้: ${[...stats.files].slice(-8).join(', ')}`)
  }
  if (contextPercent !== undefined) {
    parts.push(`context ใช้ไป ${contextPercent}%`)
  }
  if (answer.trim().length > 0) {
    parts.push(`คำตอบสุดท้ายของ Claude (ย่อ): ${answer.trim().slice(0, 300)}`)
  }

  return parts.join('\n')
}

function tipPrompt(): string {
  const context = memo.lastSummary.length > 0 ? `สถานการณ์ล่าสุด:\n${memo.lastSummary}\n\n` : ''

  return `${context}ดูจากงานที่ทำใน session นี้ ให้คำแนะนำที่มีประโยชน์ที่สุดตอนนี้ 1 ข้อ`
}

/** True for what the band's bottom hands back when no other plugin drew there. */
function isEmpty(tree: RenderElement | null | undefined): boolean {
  if (tree === null || tree === undefined) {
    return true
  }
  if (tree.type !== 'Box' && tree.type !== 'Text') {
    return false
  }
  const children = tree.children ?? []

  return children.every(child =>
    typeof child === 'string' ? child.trim().length === 0 : isEmpty(child as RenderElement),
  )
}

async function say($: EngineInterface, text: string, next?: NekoMood): Promise<void> {
  const at = await $.clock.now()
  await update($, line, () => ({ text, at }))
  if (next !== undefined) {
    await update($, mood, () => next)
  }
}

async function setMood($: EngineInterface, next: NekoMood): Promise<void> {
  await update($, mood, () => next)
}

async function setHidden($: EngineInterface, value: boolean): Promise<void> {
  await update($, isHidden, () => value)
  await $.store.set('isHidden', value)
}

/** Asks the model for one tip; keeps the previous mood when it does not answer. */
async function tip($: EngineInterface, prompt: string, useFork: boolean): Promise<void> {
  if (memo.isTipRunning) {
    return
  }
  memo.isTipRunning = true
  const voice = persona(PETS[await read($, pet)])
  const before = await read($, mood)
  const after: NekoMood = before === 'thinking' ? 'idle' : before
  await update($, mood, () => 'thinking')

  try {
    let result = useFork ? await $.model.fork({ prompt: `${voice}\n\n${prompt}\n\n${ONE_LINE}` }) : undefined

    if (result === undefined || (!result.isAnswered && result.reason === 'nothing-to-fork')) {
      result = await $.model.complete({
        model: memo.tipModel,
        system: voice,
        prompt: `${prompt}\n\n${ONE_LINE}`,
        maxTokens: 200,
        effort: 'low',
        timeoutMs: 15_000,
      })
    }

    const text = result.isAnswered ? tidy(result.text) : ''
    if (text.length > 0) {
      await say($, text, after)
      memo.turnsSinceTip = 0
    } else {
      await update($, mood, () => after)
    }
  } finally {
    memo.isTipRunning = false
  }
}

/** Lines the cat says without a model call; the first that applies wins. */
async function ruleLine($: EngineInterface, now: number, contextPercent: number | undefined): Promise<string | undefined> {
  const { flourish } = PETS[await read($, pet)]
  if (contextPercent !== undefined && contextPercent >= 80) {
    const bucket = Math.floor(contextPercent / 10)
    if (bucket > memo.lastContextBucket) {
      memo.lastContextBucket = bucket
      return `context ใช้ไป ${contextPercent}% แล้ว ลอง /compact ก่อนเริ่มงานถัดไปไหม ${flourish}`
    }
  }

  if (now - memo.lastRulesAt < RULES_EVERY) {
    return undefined
  }
  memo.lastRulesAt = now

  if (now - memo.lastBreakAt >= BREAK_EVERY) {
    const worked = now - memo.lastBreakAt
    memo.lastBreakAt = now
    return `ทำงานมา ${formatMinutes(worked)} แล้ว ลุกยืดเส้นพักสายตาซัก 5 นาทีนะ ${flourish}`
  }

  if (now - memo.lastCommitNudgeAt >= COMMIT_NUDGE_EVERY && (await $.session.repo()) !== null) {
    try {
      const status = await $.process.run(['git', 'status', '--porcelain'], { timeoutMs: 5000 })
      const changed =
        status.exitCode === 0 ? status.stdout.split('\n').filter(one => one.trim().length > 0).length : 0
      if (changed >= UNCOMMITTED_LIMIT) {
        memo.lastCommitNudgeAt = now
        return `แก้ค้างไว้ ${changed} ไฟล์แล้วยังไม่ commit ลอง commit เป็นก้อนเล็กๆ ก่อนไหม`
      }
    } catch {
      // git missing or slow: say nothing
    }
  }

  if (now - memo.lastLateNudgeAt >= LATE_NUDGE_EVERY) {
    try {
      const clock = await $.process.run(['date', '+%H:%M'], { timeoutMs: 2000 })
      const hour = Number(clock.stdout.slice(0, 2))
      if (clock.exitCode === 0 && (hour >= 23 || hour < 5)) {
        memo.lastLateNudgeAt = now
        return `${clock.stdout.trim()} แล้วนะ ดึกมากแล้ว เก็บงานให้จบ step นี้แล้วไปพักดีไหม`
      }
    } catch {
      // no clock: say nothing
    }
  }

  return undefined
}

/** What the cat holds while a tool runs, or null when nothing fits. */
function actionOf(tool: string, command: string | undefined): NekoAction | null {
  if (tool === 'Edit' || tool === 'Write' || tool === 'NotebookEdit') return 'type'
  if (tool === 'Read' || tool === 'Grep' || tool === 'Glob' || tool === 'LSP') return 'read'
  if (tool === 'WebFetch' || tool === 'WebSearch') return 'web'
  if (tool === 'Agent') return 'agent'
  if (command === undefined) return null
  if (TEST_COMMAND.test(command)) return 'test'
  if (/\bgit\s+commit\b/.test(command)) return 'commit'
  if (/\bgit\s+push\b/.test(command)) return 'push'
  if (INSTALL_COMMAND.test(command)) return 'install'

  return null
}

/** One beat of the idle animation: the tail swings, and every other beat the cat blinks. */
async function tick($: EngineInterface): Promise<void> {
  if (await read($, isHidden)) return

  memo.ticks += 1
  await update($, tail, n => (n + 1) % 2)

  if (memo.ticks % 2 === 0 && BLINKS.has(await read($, mood))) {
    await update($, isBlinking, () => true)
    $.clock.after(BLINK_MS, () => {
      void update($, isBlinking, () => false)
    })
  }
}

/** Hearts and notes rising beside the cat after a turn that went well. */
function floatHearts($: EngineInterface): void {
  void update($, sparkle, () => 0)
  $.clock.after(FLOAT_STEP_MS, () => {
    void update($, sparkle, () => 1)
  })
  $.clock.after(FLOAT_STEP_MS * 2, () => {
    void update($, sparkle, () => 2)
  })
  $.clock.after(FLOAT_STEP_MS * 3, () => {
    void update($, sparkle, () => -1)
  })
}

async function checkSleepy($: EngineInterface): Promise<void> {
  const current = await read($, mood)
  const now = await $.clock.now()
  if (now - memo.lastActiveAt >= SLEEPY_AFTER && (current === 'idle' || current === 'happy' || current === 'worried')) {
    await update($, mood, () => 'sleepy')
  }
}

async function askNeko($: EngineInterface, question: string): Promise<string> {
  const p = PETS[await read($, pet)]
  await update($, mood, () => 'thinking')
  let result = await $.model.fork({
    prompt: `${persona(p)}\n\nผู้ใช้ถาม${p.call}ว่า: ${question}\n\nตอบสั้น กระชับ ทำได้จริง เป็นภาษาไทย ไม่เกิน 8 บรรทัด อ้างอิงงานใน session นี้ถ้าเกี่ยวข้อง`,
  })
  if (!result.isAnswered && result.reason === 'nothing-to-fork') {
    result = await $.model.complete({
      model: memo.tipModel,
      system: persona(p),
      prompt: question,
      maxTokens: 800,
      timeoutMs: 60_000,
    })
  }

  if (!result.isAnswered) {
    await update($, mood, () => 'worried')
    return `${miniFace(p, 'worried')}  ${p.call}ตอบไม่ได้ตอนนี้ (${result.reason}) ลองใหม่อีกทีนะ`
  }

  const text = result.text.trim()
  await say($, tidy(text), 'happy')

  return `${miniFace(p, 'happy')}  ${p.call}ตอบ:\n\n${text}`
}

export const register: Register = (on, options) => {
  memo.autoTips = options.autoTips !== false
  memo.tipModel = typeof options.tipModel === 'string' && options.tipModel.length > 0 ? options.tipModel : HAIKU
  memo.animate = options.animate !== false
  memo.isPixel = options.style !== 'ascii'
  const chosen = petOption(options.pet)

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'neko',
      description: 'ถามสัตว์ผู้ช่วย: /neko <คำถาม>, /neko (ขอคำแนะนำ), /neko pet <ชนิด>, /neko hide|show',
      argumentHint: '[คำถาม | pet <ชนิด> | hide | show]',
    })

    // The `pet` option wins when it changed since last time; otherwise the
    // pet picked with /neko pet stays, across sessions.
    const seenOption = await $.store.get('petOption')
    const picked = await $.store.get('pet')
    let current: NekoPet | 'random' = chosen
    if (seenOption === chosen && typeof picked === 'string') {
      current = findPet(picked) ?? chosen
    } else {
      await $.store.set('petOption', chosen)
      await $.store.delete('pet')
    }
    const resolved: NekoPet =
      current === 'random' ? (PET_IDS[Math.floor(Math.random() * PET_IDS.length)] ?? 'cat') : current
    await update($, pet, () => resolved)

    const stored = await $.store.get('isHidden')
    if (typeof stored === 'boolean') {
      await update($, isHidden, () => stored)
    }

    const now = await $.clock.now()
    memo.lastActiveAt = now
    memo.lastBreakAt = now
    memo.lastRulesAt = now

    $.clock.every(MINUTE, () => {
      void checkSleepy($)
    })

    if (memo.animate) {
      $.clock.every(TICK_MS, () => {
        void tick($)
      })
    }

    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    memo.turn = newTurn()
    memo.lastActiveAt = await $.clock.now()
    if ((await read($, mood)) !== 'thinking') {
      await update($, mood, () => 'working')
    }

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const turn = memo.turn
    turn.tools.set(e.tool, (turn.tools.get(e.tool) ?? 0) + 1)
    if (e.tool === 'Edit' || e.tool === 'Write') {
      turn.files.add(e.file_path)
    } else if (e.tool === 'NotebookEdit') {
      turn.files.add(e.notebook_path)
    }

    const holding = actionOf(String(e.tool), e.tool === 'Bash' ? e.command : undefined)
    const token = ++memo.actionToken
    if (holding !== null) {
      await update($, action, () => holding)
    }

    const ran = await next(e)

    if (holding !== null && memo.actionToken === token) {
      await update($, action, () => null)
    }

    if (ran.deny !== undefined) {
      turn.denies += 1
      turn.failures.push(`${e.tool} ถูกปฏิเสธ`)
    } else if (ran.isError === true) {
      if (e.tool === 'Bash') {
        turn.failures.push(`Bash \`${e.command.slice(0, 60)}\``)
        if (TEST_COMMAND.test(e.command)) {
          turn.testFailures += 1
        }
      } else {
        turn.failures.push(String(e.tool))
      }
    }

    return ran
  })

  on('turn.complete', async ($, e, next) => {
    const out = await next(e)
    if (e.agentId !== undefined) {
      return out
    }

    const turn = memo.turn
    const now = await $.clock.now()
    memo.lastActiveAt = now
    memo.turnsSinceTip += 1

    const hasTrouble = turn.failures.length > 0 || e.reason === 'error'
    await update($, action, () => null)
    if ((await read($, mood)) !== 'thinking') {
      await update($, mood, () => (e.isAborted ? 'idle' : hasTrouble ? 'worried' : 'happy'))
      if (!e.isAborted && !hasTrouble && memo.animate) {
        floatHearts($)
      }
    }

    const usage = await $.session.usage()
    const contextPercent = usage.context.percent
    memo.lastSummary = summarize(turn, e.durationMs, e.reason, e.answer, contextPercent)

    const rule = await ruleLine($, now, contextPercent)
    if (rule !== undefined) {
      await say($, rule)
      memo.turnsSinceTip = 0
      return out
    }

    const isInteresting =
      hasTrouble || e.durationMs >= LONG_TURN_MS || turn.files.size >= 3 || memo.turnsSinceTip >= TIP_EVERY_TURNS
    if (!memo.autoTips || (await read($, isHidden)) || e.isAborted || !isInteresting) {
      if (turn.testFailures >= 3) {
        await say($, `test fail ${turn.testFailures} รอบติดแล้ว ลองอ่าน error ช้าๆ ก่อนแก้รอบใหม่นะ`)
      }
      return out
    }

    const prompt = `สถานการณ์ตอนนี้:\n${memo.lastSummary}\n\nให้คำแนะนำ 1 ข้อที่เจาะจงกับสถานการณ์นี้ ถ้าไม่มีอะไรน่าเตือน ให้แนะนำ next step สั้นๆ`
    $.clock.after(1, () => {
      void tip($, prompt, false)
    })

    return out
  })

  on('command.run', { command: 'neko' }, async ($, e) => {
    const args = e.args.trim()

    if (args === 'pet' || args.startsWith('pet ')) {
      const wanted = args.slice(3).trim()
      const now = PETS[await read($, pet)]

      if (wanted === '') {
        const list = PET_IDS.map(id => `  ${id.padEnd(9)}${PETS[id].label.padEnd(8)}${miniFace(PETS[id], 'idle')}`)
        return { text: `ตอนนี้: ${now.label} ${miniFace(now, 'idle')}\nเปลี่ยนด้วย /neko pet <ชนิด> (ชื่ออังกฤษหรือไทยก็ได้)\n\n${list.join('\n')}` }
      }

      const found = wanted === 'random' ? PET_IDS[Math.floor(Math.random() * PET_IDS.length)] : findPet(wanted)
      if (found === undefined) {
        return { text: `ไม่รู้จัก "${wanted}" ลองพิมพ์ /neko pet เพื่อดูรายชื่อ` }
      }

      await update($, pet, () => found)
      await $.store.set('pet', found)
      const p = PETS[found]
      await say($, greeting(p), 'happy')
      return { text: `${miniFace(p, 'happy')}  ${p.call}มาแล้ว! ${p.flourish}` }
    }

    if (args === 'hide' || args === 'show') {
      await setHidden($, args === 'hide')
      const p = PETS[await read($, pet)]
      return {
        text: args === 'hide' ? `${p.call}ไปนอนแล้ว (พิมพ์ /neko show เพื่อเรียกกลับ)` : `${p.call}กลับมาแล้ว ${p.flourish}`,
      }
    }

    if (args.length === 0) {
      await tip($, tipPrompt(), true)
      const said = await read($, line)
      const p = PETS[await read($, pet)]
      return { text: `${miniFace(p, 'happy')}  ${p.call}: ${said?.text ?? greeting(p)}` }
    }

    return { text: await askNeko($, args) }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await read($, isHidden))) {
      return next(e)
    }

    const below = await next(e)
    const said = await read($, line)
    const stored = await read($, mood)
    const current: NekoMood = e.props.isWorking && stored !== 'thinking' ? 'working' : stored
    const holding = await read($, action)
    const blinking = await read($, isBlinking)
    const swing = await read($, tail)
    const float = await read($, sparkle)
    const p = PETS[await read($, pet)]
    const text = said?.text ?? greeting(p)
    const eye = eyeOf(p, current, blinking && BLINKS.has(current))
    const tint = MOOD_COLOR[current]
    const label = holding === null ? MOOD_LABEL[current] : ACTION_LABEL[holding]
    const held = holding === null ? ' ' : HELD[holding]
    const wag = p.tails[memo.animate ? swing % 2 : 0] ?? ''
    const columns = e.props.bodyColumns
    // A terminal draws the pet in pixels; another surface, or style ascii, in characters.
    const sprite = memo.isPixel && e.surface === 'terminal' ? p.sprite : undefined
    const width = sprite === undefined ? artWidth(p) : spriteWidth(sprite)
    const faceRow = sprite === undefined ? (p.faceRow ?? 1) : spriteFaceRow(sprite)

    const { Box, Button, Text } = $.ui.resolve(e)

    // The column beside the art: rising hearts after a good turn, else the mood's mark by the face.
    const beside = (row: number): RenderElement | string =>
      float >= 0 ? (
        3 - float === row ? <Text color={SPARKLE}>{float === 1 ? '♪' : '♡'}</Text> : ''
      ) : row === faceRow ? (
        <Text color={tint}>{MOOD_MARK[current]}</Text>
      ) : (
        ''
      )

    // One row of the art: the outline in the pet's colour, the eyes by mood.
    const drawRow = (template: string, row: number): RenderElement => {
      const parts = pieces(template, eye, held, wag)
      const pad = ' '.repeat(Math.max(0, width - widthOf(parts)) + 2)

      return (
        <Text>
          {parts.map(part =>
            part.kind === 'eye' ? (
              <Text color={tint} bold>
                {part.text}
              </Text>
            ) : part.kind === 'held' ? (
              <Text bold>{part.text}</Text>
            ) : (
              <Text color={p.color}>{part.text}</Text>
            ),
          )}
          {pad}
          {beside(row)}
        </Text>
      )
    }

    // One row of the sprite: runs of half blocks, then the column beside it.
    const drawPixels = (runs: readonly Cell[], row: number): RenderElement => (
      <Text>
        {runs.map(run => (
          <Text color={run.color} backgroundColor={run.backgroundColor} bold={run.bold}>
            {run.text}
          </Text>
        ))}
        {'  '}
        {beside(row)}
      </Text>
    )

    const art =
      sprite === undefined
        ? p.rows.map((template, row) => drawRow(template, row))
        : spriteRows(sprite, tint, eyeShape(eye), memo.animate ? swing : 0, holding === null ? undefined : HELD[holding]).map(
            (runs, row) => drawPixels(runs, row),
          )

    const mine: RenderElement =
      columns < 60 ? (
        <Box key="neko" flexDirection="row" gap={1}>
          <Text>
            {pieces(p.mini, eye, ' ', '').map(part =>
              part.kind === 'eye' ? <Text color={tint}>{part.text}</Text> : <Text color={p.color}>{part.text}</Text>,
            )}
          </Text>
          <Text wrap="truncate-end">{text}</Text>
        </Box>
      ) : (
        <Box key="neko" flexDirection="row" gap={1}>
          <Box key="art" flexDirection="column" width={width + 5} flexShrink={0}>
            {art}
          </Box>
          <Box flexDirection="column" width={Math.max(20, columns - width - 6)}>
            <Text>
              <Text bold color={p.color}>
                {p.call}
              </Text>
              <Text dimColor>{label}</Text>
            </Text>
            <Text wrap="truncate-end">{text}</Text>
            <Box flexDirection="row" gap={2}>
              <Button key="tip" label="แนะนำหน่อย" hotkey="t" plain dimColor onPress={() => tip($, tipPrompt(), true)} />
              <Button key="hide" label="ซ่อน" hotkey="h" plain dimColor onPress={() => setHidden($, true)} />
            </Box>
          </Box>
        </Box>
      )

    return isEmpty(below) ? (
      mine
    ) : (
      <Box flexDirection="column">
        {below}
        {mine}
      </Box>
    )
  })
}
