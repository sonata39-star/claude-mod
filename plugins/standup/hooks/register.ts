import type { Register } from 'claude-code'

import { SYSTEM, buildPrompt, hasWork, parseRange, rawStandup, summarizeSession, uniqueLines } from './summary'
import type { Facts } from './summary'

const MODEL = 'claude-haiku-4-5-20251001'

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)

    await $.command.register({
      name: 'standup',
      description: 'สรุป standup ภาษาไทยจาก git commits + งานใน session นี้ แล้วคัดลอกให้',
      argumentHint: '[today|yesterday|<days>]',
    })

    return started
  })

  on('command.run', { command: 'standup' }, async ($, e) => {
    const range = parseRange(e.args)
    const repo = await $.session.repo()
    const cwd = repo?.root ?? (await $.session.cwd())

    const run = async (argv: string[]) => {
      try {
        const ran = await $.process.run(argv, { cwd, timeoutMs: 15000 })

        return ran.exitCode === 0 ? ran.stdout.trim() : ''
      } catch {
        return ''
      }
    }

    const facts: Facts = {
      range,
      date: (await run(['date', '+%a %d %b %Y'])) || 'วันนี้',
      repo: repo ? (repo.name ?? repo.root.split('/').pop() ?? '') : '',
      branch: '',
      commits: '',
      files: { lines: [], total: 0 },
      pending: { lines: [], total: 0 },
      session: '',
    }

    if (repo) {
      const email = await run(['git', 'config', 'user.email'])
      const mine = [`--since=${range.since}`, '--all', '--no-merges', ...(email ? [`--author=${email}`] : [])]

      facts.branch = await run(['git', 'rev-parse', '--abbrev-ref', 'HEAD'])
      facts.commits = await run(['git', 'log', ...mine, '-n', '60', '--date=format:%a %H:%M', '--pretty=format:- %h %ad %s'])
      facts.files = uniqueLines(await run(['git', 'log', ...mine, '-n', '200', '--pretty=format:', '--name-only']), 30)
      facts.pending = uniqueLines(await run(['git', 'status', '--porcelain']), 25)
    }

    try {
      facts.session = summarizeSession(await $.session.messages())
    } catch {
      facts.session = ''
    }

    if (!hasWork(facts)) {
      return { text: `ยังไม่พบงาน${range.label}: ไม่มี commit ของคุณ ไม่มีไฟล์ค้าง และ session นี้ยังไม่มีงาน` }
    }

    $.ui.toast('กำลังเขียน standup…', { timeoutMs: 3000 })

    const answer = await $.model.complete({
      model: MODEL,
      system: SYSTEM,
      prompt: buildPrompt(facts),
      maxTokens: 900,
      timeoutMs: 60000,
    })

    const text = answer.isAnswered && answer.text.trim() ? answer.text.trim() : rawStandup(facts, answer.isAnswered ? 'empty-reply' : answer.reason)

    try {
      const copied = await $.ui.copy({ text })

      if (copied.isCopied) {
        $.ui.toast('คัดลอกแล้ว 📋 วางใน Slack/Jira ได้เลย')
      }
    } catch {
      // no clipboard: the text is still in the transcript
    }

    return { text }
  })
}
