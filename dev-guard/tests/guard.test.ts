import { describe, expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const HOME = '/Users/me'
const ROOT = '/Users/me/work/app'

// The world beneath the guard: a project folder, a shell that only says it
// ran, git on a branch, and a person who answers the guard's question.
function world(on: On, options: { branch?: string; answer?: string } = {}): { asked: string[]; ran: string[] } {
  const asked: string[] = []
  const ran: string[] = []

  mock.env(on, { HOME })
  on('session.root', () => ({ value: ROOT }))
  on('session.cwd', () => ({ value: ROOT }))
  on('process.run', () => ({ value: { exitCode: 0, stdout: `${options.branch ?? 'feature/x'}\n`, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.log', () => ({ value: undefined }))
  on('tool.call', { tool: 'AskUserQuestion' }, (_$, e) => {
    const question = e.questions[0]?.question ?? ''
    asked.push(question)

    return { result: { questions: e.questions, answers: { [question]: options.answer ?? 'บล็อก' } } }
  })
  on('tool.call', { tool: 'Bash' }, (_$, e) => {
    ran.push(e.command)

    return { result: { stdout: 'ok', stderr: '', interrupted: false } }
  })
  on('tool.call', { tool: 'Write' }, (_$, e) => {
    ran.push(e.file_path)

    return { result: { type: 'create', filePath: e.file_path, content: e.content, structuredPatch: [], originalFile: null } }
  })

  return { asked, ran }
}

describe('hard blocks', () => {
  for (const command of ['rm -rf /', 'rm -rf ~', 'sudo rm -fr $HOME/', 'rm -rf ~/Desktop', 'cd .. && rm -rf ..', 'rm -r -f /Users/me/work']) {
    test(`blocks ${command}`, async ($, on) => {
      const { asked, ran } = world(on)
      const done = await $.tool.call({ tool: 'Bash', command })

      expect(done.deny).toContain('dev-guard blocked')
      expect(asked).toEqual([])
      expect(ran).toEqual([])
    })
  }

  test('blocks a force-push to main named outright', async ($, on) => {
    const { ran } = world(on)
    const done = await $.tool.call({ tool: 'Bash', command: 'git push --force origin main' })

    expect(done.deny).toContain('force-push to main')
    expect(ran).toEqual([])
  })

  test('blocks a bare force-push while on main', async ($, on) => {
    world(on, { branch: 'main' })
    const done = await $.tool.call({ tool: 'Bash', command: 'git push -f' })

    expect(done.deny).toContain('force-push to main')
  })
})

describe('asks first', () => {
  test('git reset --hard runs once the person allows it', async ($, on) => {
    const { asked, ran } = world(on, { answer: 'อนุญาตครั้งนี้' })
    const done = await $.tool.call({ tool: 'Bash', command: 'git reset --hard HEAD~1' })

    expect(done.deny).toBeUndefined()
    expect(asked.length).toBe(1)
    expect(ran).toEqual(['git reset --hard HEAD~1'])
  })

  test('a declined question denies the call', async ($, on) => {
    const { ran } = world(on, { answer: 'บล็อก' })
    const done = await $.tool.call({ tool: 'Bash', command: 'git clean -fdx' })

    expect(done.deny).toContain('the user declined')
    expect(ran).toEqual([])
  })

  test('rm -r outside the project asks', async ($, on) => {
    const { asked } = world(on)
    await $.tool.call({ tool: 'Bash', command: 'rm -rf /Users/me/other-project' })

    expect(asked[0]).toContain('outside the project')
  })

  test('force-push to a feature branch asks, with-lease does not', async ($, on) => {
    const { asked, ran } = world(on, { answer: 'อนุญาตครั้งนี้' })
    await $.tool.call({ tool: 'Bash', command: 'git push --force origin feature/x' })
    await $.tool.call({ tool: 'Bash', command: 'git push --force-with-lease' })

    expect(asked.length).toBe(1)
    expect(ran.length).toBe(2)
  })

  test('SQL in a client asks, a commit message saying it does not', async ($, on) => {
    const { asked } = world(on, { answer: 'อนุญาตครั้งนี้' })
    await $.tool.call({ tool: 'Bash', command: 'psql -c "drop table users"' })
    await $.tool.call({ tool: 'Bash', command: 'git commit -m "delete from cache when stale"' })

    expect(asked.length).toBe(1)
    expect(asked[0]).toContain('DROP TABLE')
  })

  test('cat .env asks; cp .env.example .env does not', async ($, on) => {
    const { asked } = world(on, { answer: 'อนุญาตครั้งนี้' })
    await $.tool.call({ tool: 'Bash', command: 'cat .env.local' })
    await $.tool.call({ tool: 'Bash', command: 'cp .env.example .env' })

    expect(asked.length).toBe(1)
  })
})

describe('secrets', () => {
  test('a GitHub token written into code is asked about', async ($, on) => {
    const { asked, ran } = world(on, { answer: 'บล็อก' })
    const done = await $.tool.call({
      tool: 'Write',
      file_path: `${ROOT}/src/config.ts`,
      content: `export const token = "ghp_${'a1B2'.repeat(9)}"\n`,
    })

    expect(asked[0]).toContain('GitHub token')
    expect(asked[0]).not.toContain('a1B2a1B2')
    expect(done.deny).toContain('the user declined')
    expect(ran).toEqual([])
  })

  test('placeholders and env lookups pass untouched', async ($, on) => {
    const { asked, ran } = world(on)
    await $.tool.call({
      tool: 'Write',
      file_path: `${ROOT}/src/config.ts`,
      content: 'const apiKey = process.env.API_KEY\nconst password = "your-password-here"\nconst db = "postgres://postgres:postgres@localhost:5432/app"\n',
    })

    expect(asked).toEqual([])
    expect(ran.length).toBe(1)
  })
})

describe('everyday work passes', () => {
  for (const command of ['npm test', 'rm -rf node_modules dist', 'git push origin feature/x', 'rm -rf /tmp/build-cache', 'ls -la .env']) {
    test(`runs ${command}`, async ($, on) => {
      const { asked, ran } = world(on)
      const done = await $.tool.call({ tool: 'Bash', command })

      expect(done.deny).toBeUndefined()
      expect(asked).toEqual([])
      expect(ran).toEqual([command])
    })
  }
})
