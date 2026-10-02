import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { TeamPhase, TeamSnapshot } from '../types'
import { LABEL, buildSnapshot, describe, newestSlug, parseName, phaseOfAgent } from './pipeline'
import type { TeamFile } from './pipeline'

const snapshotAtom = atom({ plugin: 'team-flow', key: 'snapshot' } as const, null)
const runningAtom = atom({ plugin: 'team-flow', key: 'running' } as const, [])
const isHiddenAtom = atom({ plugin: 'team-flow', key: 'isHidden' } as const, false)

const TEAM_PATH = /(^|\/)\.team\//

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

// Agent tool calls in flight (foreground ones resolve only when the agent ends)
const inflight = new Map<string, string>()

async function refresh($: EngineInterface) {
  let snapshot: TeamSnapshot | null = null

  try {
    const dir = `${await $.session.cwd()}/.team`

    if (await $.fs.exists(dir)) {
      const entries = (await $.fs.list(dir)).filter(entry => entry.kind === 'file' && parseName(entry.name))
      const newest = newestSlug(entries)

      if (newest) {
        const mine = entries.filter(entry => parseName(entry.name)?.slug === newest.slug)
        const files: TeamFile[] = await Promise.all(
          mine.map(async entry => ({
            name: entry.name,
            mtimeMs: entry.mtimeMs,
            text: await $.fs.read(`${dir}/${entry.name}`),
          })),
        )
        snapshot = buildSnapshot(newest.slug, files, newest.others)
      }
    }
  } catch {
    snapshot = null
  }

  const current = await read($, snapshotAtom)

  if (!same(current, snapshot)) {
    await update($, snapshotAtom, () => snapshot)
  }
}

async function syncAgents($: EngineInterface) {
  const snapshot = await read($, snapshotAtom)
  const types = [...inflight.values()]

  try {
    for (const agent of await $.agent.list()) {
      if (agent.status === 'running') {
        types.push(agent.type)
      }
    }
  } catch {
    // the list is best effort; the in-flight calls still show
  }

  const phases = [...new Set(types.map(type => phaseOfAgent(type, snapshot)).filter(p => p !== null))]
  const current = await read($, runningAtom)

  if (!same(current, phases)) {
    await update($, runningAtom, () => phases)
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)

    await $.command.register({
      name: 'team-flow',
      description: 'แสดง/ซ่อนแถบ pipeline ของทีม (BA → Lead → Dev → Review → Sec)',
    })
    await refresh($)
    await syncAgents($)

    // light poll: catches background agents and files changed outside this session
    $.clock.every(5000, () => {
      void (async () => {
        await syncAgents($)

        if ((await read($, runningAtom)).length > 0) {
          await refresh($)
        }
      })()
    })

    return started
  })

  on('command.run', { command: 'team-flow' }, async $ => {
    await refresh($)
    const isHidden = await update($, isHiddenAtom, hidden => !hidden)
    const snapshot = await read($, snapshotAtom)
    const line = snapshot ? describe(snapshot) : 'ยังไม่มีไฟล์ใน .team/ ของโปรเจกต์นี้'

    return { text: `${isHidden ? 'ซ่อนแถบ team-flow แล้ว' : 'แสดงแถบ team-flow'}\n${line}` }
  })

  on('tool.call', { tool: 'Agent' }, async ($, e, next) => {
    const type = e.subagent_type ?? ''

    if (phaseOfAgent(type, null) === null) {
      return next(e)
    }

    inflight.set(e.tool_use_id, type)
    await syncAgents($)

    try {
      return await next(e)
    } finally {
      inflight.delete(e.tool_use_id)
      await refresh($)
      await syncAgents($)
    }
  })

  on('tool.call', { tool: ['Write', 'Edit', 'NotebookEdit'] }, async ($, e, next) => {
    const ran = await next(e)
    const path = 'file_path' in e ? e.file_path : 'notebook_path' in e ? e.notebook_path : ''

    if (typeof path === 'string' && TEAM_PATH.test(path)) {
      await refresh($)
    }

    return ran
  })

  on('classic.SubagentStart', async ($, e, next) => {
    const result = await next(e)
    await syncAgents($)

    return result
  })

  on('classic.SubagentStop', async ($, e, next) => {
    const result = await next(e)
    await refresh($)
    await syncAgents($)

    return result
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    await refresh($)
    await syncAgents($)

    return result
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey || (await read($, isHiddenAtom))) {
      return next(e)
    }

    const snapshot = await read($, snapshotAtom)
    const running: TeamPhase[] = await read($, runningAtom)

    if (snapshot === null && running.length === 0) {
      return next(e)
    }

    const { Box, Button, Text } = $.ui.resolve(e)
    const width = e.props.bodyColumns

    const steps = snapshot?.steps ?? []
    const pieces = steps.map((step, index) => {
      const isRunning = running.includes(step.phase)
      const label = `${LABEL[step.phase]}${step.note ? ` ${step.note}` : ''}`
      const arrow = index < steps.length - 1 ? ' → ' : ''

      if (step.state === 'done') {
        return (
          <Text color="green" dimColor={!isRunning}>
            {label} ✓<Text dimColor>{arrow}</Text>
          </Text>
        )
      }

      if (step.state === 'active' || isRunning) {
        return (
          <Text color={isRunning ? 'yellow' : 'cyan'} bold>
            {label}
            {isRunning ? ' ⏳' : ' ◀'}
            <Text dimColor>{arrow}</Text>
          </Text>
        )
      }

      return (
        <Text dimColor>
          {label}
          {step.state === 'skip' ? ' –' : ''}
          {arrow}
        </Text>
      )
    })

    const workers = running.map(phase => `${LABEL[phase]} กำลังทำงาน…`).join('  ')
    const title = snapshot ? `👥 ${snapshot.slug}${snapshot.others > 0 ? ` (+${snapshot.others})` : ''}  ` : '👥 '

    const mine = (
      <Box flexDirection="column" width={width}>
        <Box flexDirection="row">
          <Box flexGrow={1} flexShrink={1}>
            <Text wrap="truncate">
              <Text dimColor>{title}</Text>
              {pieces}
              {snapshot?.isDone && <Text color="green"> ✅ เสร็จครบ</Text>}
            </Text>
          </Box>
          <Button
            key="team-flow-hide"
            label="ซ่อน"
            plain
            onPress={async () => {
              await update($, isHiddenAtom, () => true)
              $.ui.toast('ซ่อนแถบแล้ว — พิมพ์ /team-flow เพื่อแสดงอีกครั้ง')
            }}
          />
        </Box>
        {workers.length > 0 && (
          <Text color="yellow" wrap="truncate">
            ⚡ {workers}
          </Text>
        )}
      </Box>
    )

    // other plugins (neko) draw in this band too: keep what is beneath under ours
    const below = await next(e)

    return (
      <Box flexDirection="column">
        {mine}
        {below}
      </Box>
    )
  })
}
