import { describe, expect, test } from 'claude-code/testing'

import { buildSnapshot, countTasks, describe as describeSnapshot, newestSlug, phaseOfAgent, verdict } from '../hooks/pipeline'

const PLAN = `# Plan: Login
**Status**: Ready for Dev | **Req**: .team/req-login.md

## Task Breakdown (เรียงลำดับ)
1. [x] add route
2. [x] add form
3. [ ] wire API

## Test Plan
- [ ] not a task
`

const file = (name: string, mtimeMs: number, text = '') => ({ name, mtimeMs, text })

describe('pipeline', () => {
  test('counts only the Task Breakdown checkboxes', () => {
    expect(countTasks(PLAN)).toEqual({ done: 2, total: 3 })
  })

  test('reads verdicts and ignores the unfilled template', () => {
    expect(verdict('**Verdict**: PASS', ['PASS', 'FAIL'])).toBe('PASS')
    expect(verdict('**Verdict**: PASS / FAIL', ['PASS', 'FAIL'])).toBeNull()
    expect(verdict('**Verdict**: APPROVE_WITH_NOTES', ['APPROVE_WITH_NOTES', 'APPROVE', 'BLOCK'])).toBe(
      'APPROVE_WITH_NOTES',
    )
    expect(verdict('**Verdict**: APPROVE / BLOCK / APPROVE_WITH_NOTES', ['APPROVE_WITH_NOTES', 'APPROVE', 'BLOCK'])).toBeNull()
  })

  test('picks the slug changed last', () => {
    expect(newestSlug([file('req-a.md', 1), file('plan-b.md', 5), file('notes.txt', 9)])).toEqual({ slug: 'b', others: 1 })
  })

  test('dev is active with task progress while there is no dev report', () => {
    const snap = buildSnapshot('login', [file('req-login.md', 1), file('plan-login.md', 2, PLAN)], 0)

    expect(snap.steps.map(s => s.state)).toEqual(['done', 'done', 'active', 'todo', 'todo'])
    expect(snap.steps[2]?.note).toBe('2/3')
    expect(describeSnapshot(snap)).toContain('🔨 Dev 2/3 ◀')
  })

  test('a FAIL review sends the work back to dev', () => {
    const snap = buildSnapshot(
      'login',
      [
        file('req-login.md', 1),
        file('plan-login.md', 2, PLAN),
        file('dev-report-login.md', 3),
        file('review-login.md', 4, '**Verdict**: FAIL'),
      ],
      0,
    )

    expect(snap.steps.find(s => s.state === 'active')?.phase).toBe('dev')
    expect(snap.steps[2]?.note).toContain('แก้ตาม review')
  })

  test('a PASS review moves on to sec, an APPROVE ends it', () => {
    const files = [
      file('req-login.md', 1),
      file('plan-login.md', 2, PLAN),
      file('dev-report-login.md', 3),
      file('review-login.md', 4, '**Verdict**: PASS'),
    ]

    expect(buildSnapshot('login', files, 0).steps.find(s => s.state === 'active')?.phase).toBe('sec')

    const done = buildSnapshot('login', [...files, file('sec-login.md', 5, '**Verdict**: APPROVE')], 0)

    expect(done.isDone).toBe(true)
    expect(done.steps.every(s => s.state === 'done')).toBe(true)
  })

  test('a newer dev report after FAIL goes back to review', () => {
    const snap = buildSnapshot(
      'login',
      [
        file('req-login.md', 1),
        file('plan-login.md', 2, PLAN),
        file('review-login.md', 3, '**Verdict**: FAIL'),
        file('dev-report-login.md', 4),
      ],
      0,
    )

    expect(snap.steps.find(s => s.state === 'active')?.phase).toBe('review')
  })

  test('a PM doc adds the PM step', () => {
    const snap = buildSnapshot('login', [file('dlc-login.md', 1)], 0)

    expect(snap.steps.map(s => `${s.phase}:${s.state}`)).toEqual([
      'pm:done',
      'ba:active',
      'lead:todo',
      'dev:todo',
      'review:todo',
      'sec:todo',
    ])
  })

  test('maps agent types to phases', () => {
    expect(phaseOfAgent('dev', null)).toBe('dev')
    expect(phaseOfAgent('general-purpose', null)).toBeNull()
    expect(phaseOfAgent('lead', null)).toBe('lead')

    const reviewing = buildSnapshot(
      'x',
      [file('req-x.md', 1), file('plan-x.md', 2, PLAN), file('dev-report-x.md', 3)],
      0,
    )

    expect(phaseOfAgent('lead', reviewing)).toBe('review')
  })
})
