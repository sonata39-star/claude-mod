import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { DashboardCommand, DashboardFile, DashboardUsage } from '../types'
import { clockTime, duration, exactPercent, fit, fitPath, isCheck, relative, usageMeters } from './format'
import { barRuns, levelColor } from './meter'

const PANE = 'dev-dashboard'
const TITLE = 'Dashboard'

const MAX_FILES = 50
const MAX_COMMANDS = 10
const MAX_DENIES = 10
const MAX_CHECKS = 8
const SHOWN_FILES = 12
const REFRESH_MS = 30_000

const files = atom({ plugin: 'dev-dashboard', key: 'files' } as const, [])
const commands = atom({ plugin: 'dev-dashboard', key: 'commands' } as const, [])
const denies = atom({ plugin: 'dev-dashboard', key: 'denies' } as const, [])
const checks = atom({ plugin: 'dev-dashboard', key: 'checks' } as const, [])
const turns = atom({ plugin: 'dev-dashboard', key: 'turns' } as const, { count: 0, totalMs: 0, lastMs: 0 })
const usage = atom({ plugin: 'dev-dashboard', key: 'usage' } as const, null)

// The session's directory, so paths under it show short; set again on every
// load, as `session.start` fires after each reload.
let cwd = ''

async function refreshUsage($: EngineInterface) {
  try {
    const now = await $.session.usage()
    const at = await $.clock.now()
    const next: DashboardUsage = {
      at,
      contextPercent: now.context.percent,
      contextTokens: now.context.tokens,
      window: now.context.window,
      costUsd: now.cost?.usd,
      limits: now.rateLimits.map(limit => ({ ...limit })),
    }
    await update($, usage, () => next)
  } catch {
    // Figures the engine cannot give now stay as they were.
  }
}

async function clearAll($: EngineInterface) {
  await update($, files, () => [])
  await update($, commands, () => [])
  await update($, denies, () => [])
  await update($, checks, () => [])
  await update($, turns, () => ({ count: 0, totalMs: 0, lastMs: 0 }))
}

function editedPath(e: { tool: string; file_path?: unknown; notebook_path?: unknown }): string | undefined {
  if ((e.tool === 'Edit' || e.tool === 'Write') && typeof e.file_path === 'string') {
    return e.file_path
  }
  if (e.tool === 'NotebookEdit' && typeof e.notebook_path === 'string') {
    return e.notebook_path
  }

  return undefined
}

function touch(list: DashboardFile[], path: string, at: number): DashboardFile[] {
  const seen = list.find(one => one.path === path)
  const rest = list.filter(one => one.path !== path)

  return [{ path, edits: (seen?.edits ?? 0) + 1, lastAt: at }, ...rest].slice(0, MAX_FILES)
}

function finish(list: DashboardCommand[], id: string, isFailed: boolean): DashboardCommand[] {
  return list.map(one => (one.id === id ? { ...one, isDone: true, isFailed } : one))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    cwd = e.cwd

    await $.command.register({
      name: 'dashboard',
      description: 'เปิด pane สรุป session: ไฟล์ที่แก้, คำสั่ง, ผล test, สิ่งที่ถูกบล็อก, usage',
      argumentHint: '[close]',
    })
    await refreshUsage($)
    if (e.isInteractive) {
      // Keeps the meters and their reset countdowns current between turns.
      $.clock.every(REFRESH_MS, () => {
        void refreshUsage($)
      })
      // Unasked: the surface seats it only where it fits as a sidebar.
      void $.ui.open({ id: PANE, title: TITLE })
    }

    return started
  })

  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') {
      await clearAll($)
    }

    return next(e)
  })

  on('command.run', { command: 'dashboard' }, async ($, e) => {
    if (e.args.trim() === 'close') {
      await $.ui.close({ id: PANE })

      return { text: 'ปิด dashboard แล้ว' }
    }

    const opened = await $.ui.open({ id: PANE, title: TITLE })

    return { text: opened.isPlaced ? 'เปิด dashboard แล้ว' : `dashboard รอที่อยู่: ${opened.reason}` }
  })

  on('tool.call', async ($, e, next) => {
    const at = await $.clock.now()
    const command = e.tool === 'Bash' ? e.command : undefined

    if (command !== undefined) {
      const row: DashboardCommand = { id: e.tool_use_id, command, isDone: false, isFailed: false, at }
      await update($, commands, list => [...list, row].slice(-MAX_COMMANDS))
    }

    let ran: Awaited<ReturnType<typeof next>>
    try {
      ran = await next(e)
    } catch (error) {
      if (command !== undefined) {
        await update($, commands, list => finish(list, e.tool_use_id, true))
      }
      throw error
    }

    const isDenied = ran.deny !== undefined
    const isFailed = isDenied || ran.isError === true

    if (ran.deny !== undefined) {
      const reason = ran.deny
      await update($, denies, list => [...list, { tool: String(e.tool), reason, at }].slice(-MAX_DENIES))
    }
    if (command !== undefined) {
      await update($, commands, list => finish(list, e.tool_use_id, isFailed))
      if (!isDenied && isCheck(command)) {
        await update($, checks, list => [...list, { command, isPassed: !isFailed, at }].slice(-MAX_CHECKS))
      }
    }

    const path = editedPath(e)
    if (path !== undefined && !isFailed) {
      await update($, files, list => touch(list, path, at))
    }

    return ran
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)

    if (e.agentId === undefined) {
      await update($, turns, now => ({ count: now.count + 1, totalMs: now.totalMs + e.durationMs, lastMs: e.durationMs }))
      await refreshUsage($)
    }

    return done
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const width = Math.max(20, e.props.bodyColumns)
    const fileList = await read($, files)
    const commandList = await read($, commands)
    const denyList = await read($, denies)
    const checkList = await read($, checks)
    const turnStats = await read($, turns)
    const usageNow = await read($, usage)

    const turnLine =
      turnStats.count === 0
        ? 'ยังไม่มี turn'
        : `${turnStats.count} turns · รวม ${duration(turnStats.totalMs)} · ล่าสุด ${duration(turnStats.lastMs)}`
    const isEmpty = fileList.length + commandList.length + denyList.length + checkList.length === 0
    const cost = usageNow?.costUsd === undefined ? '' : ` · $${usageNow.costUsd.toFixed(2)}`

    return (
      <Box flexDirection="column">
        <Text bold>{fit(`${turnLine}${cost}`, width)}</Text>

        {usageNow !== null && (
          <Box flexDirection="column" marginTop={1}>
            {usageMeters(usageNow).map(meter => (
              <Box key={meter.key} flexDirection="column">
                <Text>
                  <Text bold>{meter.label}</Text>
                  {meter.percentUsed === undefined ? (
                    <Text dimColor> –</Text>
                  ) : (
                    <Text>
                      {' '}
                      <Text color={levelColor(meter.percentUsed)}>ใช้ไป {exactPercent(meter.percentUsed)}</Text>
                      <Text dimColor> · เหลือ {exactPercent(Math.max(0, 100 - meter.percentUsed))}</Text>
                    </Text>
                  )}
                  {meter.tail !== undefined && <Text dimColor> · {meter.tail}</Text>}
                </Text>
                <Text wrap="truncate-end">
                  {barRuns(meter.percentUsed ?? 0, width).map(run =>
                    run.color ? <Text color={run.color}>{run.text}</Text> : <Text dimColor>{run.text}</Text>,
                  )}
                </Text>
              </Box>
            ))}
          </Box>
        )}

        <Box flexDirection="column" marginTop={1}>
          <Text bold>ไฟล์ที่แก้ ({fileList.length})</Text>
          {fileList.length === 0 && <Text dimColor> ยังไม่มี</Text>}
          {fileList.slice(0, SHOWN_FILES).map(file => (
            <Text>
              {' '}
              <Text color="cyan">×{file.edits}</Text> {fitPath(relative(file.path, cwd), width - 12)}{' '}
              <Text dimColor>{clockTime(file.lastAt)}</Text>
            </Text>
          ))}
          {fileList.length > SHOWN_FILES && <Text dimColor> +{fileList.length - SHOWN_FILES} ไฟล์</Text>}
        </Box>

        <Box flexDirection="column" marginTop={1}>
          <Text bold>คำสั่งล่าสุด</Text>
          {commandList.length === 0 && <Text dimColor> ยังไม่มี</Text>}
          {[...commandList].reverse().map(row => (
            <Text dimColor={row.isDone && !row.isFailed}>
              {' '}
              {row.isDone ? (
                row.isFailed ? (
                  <Text color="red">✗</Text>
                ) : (
                  <Text color="green">✓</Text>
                )
              ) : (
                <Text color="yellow">…</Text>
              )}{' '}
              {fit(row.command, width - 4)}
            </Text>
          ))}
        </Box>

        {checkList.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            <Text bold>ผล test / check</Text>
            {[...checkList].reverse().map(check => (
              <Text>
                {' '}
                {check.isPassed ? <Text color="green">✓ ผ่าน</Text> : <Text color="red">✗ พัง</Text>}{' '}
                {fit(check.command, width - 16)} <Text dimColor>{clockTime(check.at)}</Text>
              </Text>
            ))}
          </Box>
        )}

        {denyList.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            <Text bold>ถูกบล็อก ({denyList.length})</Text>
            {[...denyList].reverse().map(deny => (
              <Text>
                {' '}
                <Text color="red">⛔</Text> {fit(`${deny.tool}: ${deny.reason}`, width - 4)}
              </Text>
            ))}
          </Box>
        )}

        {!isEmpty && (
          <Box marginTop={1}>
            <Button key="clear" label="ล้างรายการ" hotkey="c" onPress={() => clearAll($)} />
          </Box>
        )}
      </Box>
    )
  })
}
