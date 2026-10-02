import type { EngineInterface, Register } from 'claude-code'

type $ = EngineInterface
type Sound = 'done' | 'error' | 'attention'

// Waiting-for-you pings come in bursts (a permission prompt, then a question);
// one per this window is enough.
const ATTENTION_QUIET_MS = 10_000
const SILENT_NOTIFICATIONS = new Set(['idle_prompt', 'auth_success'])
// `display notification` takes its text from argv, so nothing is spliced into the script.
const BANNER_SCRIPT = ['-e', 'on run argv', '-e', 'display notification (item 1 of argv) with title (item 2 of argv)', '-e', 'end run']

let minMs = 30_000
let withSound = true
let withBanner = true
let hasOsascript: boolean | undefined
let lastAttentionAt = 0

const took = (ms: number) => {
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) {
    return `${seconds}s`
  }
  if (seconds < 3600) {
    return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
  }
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
}

const gist = (answer: string) => {
  const line = answer
    .split('\n')
    .map(one => one.replace(/[#*_`>|]/g, '').trim())
    .find(one => one.length > 0)
  if (!line) {
    return ''
  }
  return line.length > 60 ? `${line.slice(0, 59)}…` : line
}

async function alert($: $, sound: Sound, title: string, body: string) {
  if (withSound) {
    void $.audio.play({ asset: `sounds/${sound}.wav` }).catch(() => {})
  }
  if (!withBanner) {
    return
  }
  if (hasOsascript === undefined) {
    hasOsascript = await $.fs.exists('/usr/bin/osascript').catch(() => false)
  }
  if (hasOsascript) {
    void $.process.run(['/usr/bin/osascript', ...BANNER_SCRIPT, body || title, title], { timeoutMs: 10_000 }).catch(() => {})
  }
}

async function attention($: $, body: string) {
  const now = await $.clock.now()
  if (now - lastAttentionAt < ATTENTION_QUIET_MS) {
    return
  }
  lastAttentionAt = now
  await alert($, 'attention', 'Claude Code รอคุณอยู่', body)
}

export const register: Register = (on, options) => {
  minMs = (typeof options.minSeconds === 'number' ? options.minSeconds : 30) * 1000
  withSound = options.sound !== false
  withBanner = options.systemNotification !== false

  on('turn.complete', async ($, e, next) => {
    const ran = await next(e)
    if (e.agentId !== undefined || e.isAborted || e.durationMs < minMs) {
      return ran
    }

    const time = took(e.durationMs)
    if (e.reason === 'answer') {
      const line = gist(e.answer)
      $.ui.toast(line ? `✅ เสร็จแล้ว (${time}) — ${line}` : `✅ เสร็จแล้ว (${time})`, { timeoutMs: 8000 })
      await alert($, 'done', `✅ เสร็จแล้ว (${time})`, line)
    } else if (e.reason === 'error') {
      $.ui.toast(`⚠️ จบด้วย error (${time})`, { timeoutMs: 8000 })
      await alert($, 'error', `⚠️ จบด้วย error (${time})`, 'เทิร์นนี้จบเพราะ API error')
    } else if (e.reason === 'refusal') {
      $.ui.toast(`⚠️ Claude ปฏิเสธคำขอ (${time})`, { timeoutMs: 8000 })
      await alert($, 'error', `⚠️ Claude ปฏิเสธคำขอ (${time})`, e.refusal.explanation ?? '')
    }

    return ran
  })

  on('classic.Notification', async ($, e, next) => {
    if (!SILENT_NOTIFICATIONS.has(e.notification_type)) {
      await attention($, e.message)
    }
    return next(e)
  })

  on('tool.call', { tool: 'AskUserQuestion' }, async ($, e, next) => {
    await attention($, '❓ Claude มีคำถามรอคุณตอบ')
    return next(e)
  })
}
