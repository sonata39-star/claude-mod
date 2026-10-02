import { describe, expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { ModelCompleteResult, On, SessionMessage } from 'claude-code'

import { parseRange, summarizeSession } from '../hooks/summary'

const MESSAGES: SessionMessage[] = [
  { role: 'user', text: 'เพิ่มหน้า login ให้หน่อย', toolUses: [] },
  {
    role: 'assistant',
    text: 'ok',
    toolUses: [
      { tool_use_id: 't1', tool: 'Edit', input: { file_path: 'src/login.tsx', old_string: 'a', new_string: 'b' } },
      { tool_use_id: 't2', tool: 'Bash', input: { command: 'npm test', description: 'Run tests' }, isError: true },
    ],
  },
  { role: 'user', text: '<system-reminder>ignore me</system-reminder>', toolUses: [] },
]

const GIT: Record<string, string> = {
  'config user.email': 'me@example.com',
  'rev-parse --abbrev-ref HEAD': 'feat/login',
  status: ' M src/login.tsx\n?? src/login.test.tsx',
}

// the engine beneath the plugin: a repo with one commit today, and a model
function machine(on: On, answer: ModelCompleteResult, seen: { prompt: string; argv: string[][] }) {
  on('session.repo', () => ({ value: { root: '/repo', remote: null, internal: false, name: 'acme/app' } }))
  on('session.cwd', () => ({ value: '/repo' }))
  on('session.messages', () => ({ value: MESSAGES }))
  on('process.run', ($, e) => {
    const argv = [...e.argv]
    seen.argv.push(argv)

    if (argv[0] === 'date') {
      return { value: { exitCode: 0, stdout: 'Fri 02 Oct 2026\n', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
    }

    const key = argv.slice(1).join(' ')
    const isLog = argv[1] === 'log'
    const stdout = isLog
      ? argv.includes('--name-only')
        ? 'src/login.tsx\nsrc/api.ts\n\nsrc/login.tsx'
        : '- abc123 Fri 10:00 feat: add login form'
      : (GIT[key] ?? GIT[argv[1] ?? ''] ?? '')

    return { value: { exitCode: 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('model.complete', ($, e) => {
    seen.prompt = e.prompt

    return { value: answer }
  })
  on('ui.copy', () => ({ value: { isCopied: true as const } }))
  on('ui.toast', () => ({ value: undefined }))
}

async function standup($: Engine, args = '') {
  const ran = await $.command.run({
    command: 'standup',
    args,
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 120 },
  })

  return ran.text ?? ''
}

const usage = { input_tokens: 10, output_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }

describe('standup', () => {
  test('parses ranges', () => {
    expect(parseRange('')).toEqual({ since: 'midnight', label: 'วันนี้' })
    expect(parseRange('yesterday').since).toBe('yesterday.midnight')
    expect(parseRange('3').since).toBe('3.days.ago.midnight')
    expect(parseRange('99d').since).toBe('30.days.ago.midnight')
  })

  test('summarizes the session without injected rows', () => {
    const text = summarizeSession(MESSAGES)

    expect(text).toContain('เพิ่มหน้า login')
    expect(text).toContain('src/login.tsx')
    expect(text).toContain('error 1')
    expect(text).not.toContain('ignore me')
  })

  test('writes the standup from commits, pending files and the session', async ($, on) => {
    const seen = { prompt: '', argv: [] as string[][] }
    machine(on, { isAnswered: true, text: '**Standup — Fri 02 Oct 2026**\n✅ ทำอะไรไปแล้ว\n- login form', usage }, seen)

    const text = await standup($)

    expect(text).toContain('✅ ทำอะไรไปแล้ว')
    expect(seen.prompt).toContain('feat: add login form')
    expect(seen.prompt).toContain('?? src/login.test.tsx')
    expect(seen.prompt).toContain('เพิ่มหน้า login')
    expect(seen.prompt).toContain('branch: feat/login')
    expect(seen.argv.some(argv => argv.includes('--author=me@example.com') && argv.includes('--since=midnight'))).toBe(true)
  })

  test('falls back to the raw facts when the model fails', async ($, on) => {
    const seen = { prompt: '', argv: [] as string[][] }
    machine(on, { isAnswered: false, reason: 'api-error', status: 529, error: 'overloaded', usage }, seen)

    const text = await standup($, 'yesterday')

    expect(text).toContain('สรุปด้วย AI ไม่สำเร็จ (api-error)')
    expect(text).toContain('feat: add login form')
    expect(seen.argv.some(argv => argv.includes('--since=yesterday.midnight'))).toBe(true)
  })
})
