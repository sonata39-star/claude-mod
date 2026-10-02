import type { SessionMessage } from 'claude-code'

export type Range = { since: string; label: string }

const TODAY: Range = { since: 'midnight', label: 'วันนี้' }

/** `/standup` args → a git approxidate (`--since=`) and a Thai label. */
export function parseRange(args: string): Range {
  const arg = args.trim().toLowerCase()

  if (arg === '' || arg === 'today' || arg === 'วันนี้') {
    return TODAY
  }

  if (arg === 'yesterday' || arg === 'เมื่อวาน') {
    return { since: 'yesterday.midnight', label: 'ตั้งแต่เมื่อวาน' }
  }

  const days = /^(\d{1,3})\s*(?:d|days?|วัน)?$/.exec(arg)

  if (days) {
    const n = Math.min(Number(days[1]), 30)

    return n === 0 ? TODAY : { since: `${n}.days.ago.midnight`, label: `${n} วันที่ผ่านมา` }
  }

  return TODAY
}

/** Cuts text to `max` characters, saying how much was left out. */
export function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}\n… (ตัดออก ${text.length - max} ตัวอักษร)`
}

/** Unique non-empty lines, first `max` of them, with a count of the rest. */
export function uniqueLines(text: string, max: number): { lines: string[]; total: number } {
  const all = [...new Set(text.split('\n').map(line => line.trim()).filter(Boolean))]

  return { lines: all.slice(0, max), total: all.length }
}

const FILE_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit'])

/** What happened in this Claude session, as short plain text for the model. */
export function summarizeSession(messages: readonly SessionMessage[]): string {
  const prompts: string[] = []
  const tools = new Map<string, number>()
  const files = new Set<string>()
  const commands: string[] = []
  let errors = 0

  for (const message of messages) {
    const text = message.text.trim()

    // the person's own prompts; skip injected reminders and command records
    if (message.role === 'user' && text && !text.startsWith('<') && !text.startsWith('/standup')) {
      prompts.push(text.replace(/\s+/g, ' ').slice(0, 200))
    }

    for (const use of message.toolUses) {
      tools.set(use.tool, (tools.get(use.tool) ?? 0) + 1)
      errors += use.isError ? 1 : 0

      const path = use.input.file_path ?? use.input.notebook_path

      if (FILE_TOOLS.has(use.tool) && typeof path === 'string') {
        files.add(path)
      }

      if (use.tool === 'Bash') {
        const label = typeof use.input.description === 'string' ? use.input.description : use.input.command

        if (typeof label === 'string') {
          commands.push(label.replace(/\s+/g, ' ').slice(0, 100))
        }
      }
    }
  }

  if (prompts.length === 0 && tools.size === 0) {
    return ''
  }

  const toolLine = [...tools.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([tool, count]) => `${tool}×${count}`)
    .join(', ')

  return [
    `คำสั่งที่ผู้ใช้สั่ง (ล่าสุด ${Math.min(prompts.length, 15)} จาก ${prompts.length}):`,
    ...prompts.slice(-15).map(p => `- ${p}`),
    `เครื่องมือที่ใช้: ${toolLine || '-'}${errors ? ` (error ${errors} ครั้ง)` : ''}`,
    files.size ? `ไฟล์ที่ Claude แก้ (${files.size}): ${[...files].slice(0, 25).join(', ')}` : '',
    commands.length ? `คำสั่ง shell ล่าสุด:\n${commands.slice(-12).map(c => `- ${c}`).join('\n')}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

export type Facts = {
  range: Range
  date: string
  repo: string
  branch: string
  commits: string
  files: { lines: string[]; total: number }
  pending: { lines: string[]; total: number }
  session: string
}

export function hasWork(facts: Facts): boolean {
  return Boolean(facts.commits || facts.files.total || facts.pending.total || facts.session)
}

/** The one user message the standup is written from, kept small. */
export function buildPrompt(facts: Facts): string {
  const more = (list: { lines: string[]; total: number }) =>
    list.total > list.lines.length ? `\n… และอีก ${list.total - list.lines.length} รายการ` : ''

  return clip(
    [
      `ช่วงเวลา: ${facts.range.label} (${facts.date})${facts.repo ? ` · repo: ${facts.repo}` : ''}${facts.branch ? ` · branch: ${facts.branch}` : ''}`,
      '',
      '## Commits ของผู้ใช้',
      clip(facts.commits || '(ไม่มี)', 3000),
      '',
      `## ไฟล์ที่เปลี่ยนใน commits (${facts.files.total})`,
      facts.files.lines.length ? facts.files.lines.join('\n') + more(facts.files) : '(ไม่มี)',
      '',
      `## งานที่ยังไม่ commit (${facts.pending.total})`,
      facts.pending.lines.length ? facts.pending.lines.join('\n') + more(facts.pending) : '(ไม่มี)',
      '',
      '## งานใน Claude session นี้',
      clip(facts.session || '(ไม่มี)', 4000),
      '',
      'เขียน standup จากข้อมูลข้างบนเท่านั้น ในรูปแบบนี้เป๊ะๆ:',
      `**Standup — ${facts.date}**`,
      '✅ ทำอะไรไปแล้ว',
      '- ...',
      '🎯 จะทำอะไรต่อ',
      '- ... (อนุมานจากงานที่ยังไม่ commit / งานที่ค้างใน session)',
      '🚧 ติดอะไร',
      '- ... (ถ้าไม่เห็นว่าติดอะไร ให้เขียน "ไม่มี")',
      '',
      'แต่ละหัวข้อไม่เกิน 5 bullet สั้นๆ รวม commit ที่เกี่ยวกันเป็นข้อเดียว ชื่อไฟล์/ศัพท์เทคนิคใช้ภาษาอังกฤษได้ ห้ามแต่งเรื่องที่ไม่มีในข้อมูล',
    ].join('\n'),
    12000,
  )
}

export const SYSTEM =
  'You write short, factual daily standup notes in Thai for a software developer. ' +
  'Use only the facts given. Output only the standup, no preamble.'

/** What /standup shows when the model could not write it: the facts, plainly. */
export function rawStandup(facts: Facts, reason: string): string {
  return [
    `**Standup — ${facts.date}** (${facts.range.label})`,
    `⚠️ สรุปด้วย AI ไม่สำเร็จ (${reason}) — นี่คือข้อมูลดิบ:`,
    '✅ Commits',
    facts.commits ? clip(facts.commits, 2000) : '- ไม่มี',
    facts.pending.total ? `🎯 ยังไม่ commit (${facts.pending.total})\n${facts.pending.lines.join('\n')}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}
