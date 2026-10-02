import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

function world(on: On) {
  const sounds: string[] = []
  const toasts: string[] = []
  const banners: string[][] = []
  const clock = mock.clock(on, { now: 1_000_000 })
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('audio.play', ($, e) => {
    sounds.push(e.clip.asset ?? '')
    return { value: undefined }
  })
  on('fs.exists', () => ({ value: true }))
  on('process.run', ($, e) => {
    banners.push([...e.argv])
    return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('ui.toast', ($, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('classic.Notification', () => ({}))
  on('tool.call', { tool: 'AskUserQuestion' }, () => ({ result: { questions: [], answers: {} } }))
  return { sounds, toasts, banners, clock }
}

const turn = { turnId: 't1', isAborted: false, reason: 'answer' as const }

test('a long answered turn toasts, plays and posts a banner', async ($, on) => {
  const { sounds, toasts, banners } = world(on)

  await $.turn.complete({ ...turn, answer: '## Done\nFixed the **login** bug.', durationMs: 133_000 })

  expect(toasts).toEqual(['✅ เสร็จแล้ว (2m 13s) — Done'])
  expect(sounds).toEqual(['sounds/done.wav'])
  expect(banners).toHaveLength(1)
  expect(banners[0]?.slice(-2)).toEqual(['Done', '✅ เสร็จแล้ว (2m 13s)'])
})

test('short, aborted and subagent turns stay quiet', async ($, on) => {
  const { sounds, toasts } = world(on)

  await $.turn.complete({ ...turn, answer: 'hi', durationMs: 5_000 })
  await $.turn.complete({ ...turn, answer: '', durationMs: 90_000, isAborted: true, reason: 'aborted' })
  await $.turn.complete({ ...turn, answer: 'sub', durationMs: 90_000, agentId: 'a1' })

  expect(toasts).toEqual([])
  expect(sounds).toEqual([])
})

test('a turn that dies on an API error sounds different', async ($, on) => {
  const { sounds, toasts } = world(on)

  await $.turn.complete({ ...turn, answer: '', durationMs: 45_000, reason: 'error' })

  expect(toasts).toEqual(['⚠️ จบด้วย error (45s)'])
  expect(sounds).toEqual(['sounds/error.wav'])
})

test('waiting for the person pings once per burst', async ($, on) => {
  const { sounds, clock } = world(on)

  await $.classic.Notification({ message: 'Claude needs your permission to use Bash', notification_type: 'permission_prompt' })
  await $.tool.call({ tool: 'AskUserQuestion', questions: [] } as never)
  expect(sounds).toEqual(['sounds/attention.wav'])

  await clock.advance(11_000)
  await $.classic.Notification({ message: 'idle', notification_type: 'idle_prompt' })
  await $.tool.call({ tool: 'AskUserQuestion', questions: [] } as never)
  expect(sounds).toEqual(['sounds/attention.wav', 'sounds/attention.wav'])
})

test('sound and banner can be turned off', { options: { sound: false, systemNotification: false, minSeconds: 10 } }, async ($, on) => {
  const { sounds, toasts, banners } = world(on)

  await $.turn.complete({ ...turn, answer: 'ok', durationMs: 12_000 })

  expect(toasts).toEqual(['✅ เสร็จแล้ว (12s) — ok'])
  expect(sounds).toEqual([])
  expect(banners).toEqual([])
})
