import type { EngineInterface, Register } from 'claude-code'

// Two stages, so a run of edits never runs a whole-project checker per edit:
// - per-file checkers (eslint, ruff, gofmt, JSON) run right after each edit
//   and their failures ride back on that edit's result as context;
// - project-wide checkers (tsc, go vet) only mark their project dirty, and run
//   once when Claude is about to stop (classic.Stop). New errors block the
//   stop, so Claude keeps going and fixes them, at most MAX_STOP_BLOCKS times
//   a turn.

type $ = EngineInterface
type Failure = { checker: string; file: string; errors: number; output: string }
type TscProject = { dir: string; config: string; bin: string; files: Set<string> }
type GoModule = { dir: string; packages: Set<string> }

const TIMEOUT_MS = 60_000
const PROJECT_TIMEOUT_MS = 180_000
const MAX_CONTEXT = 2000
const MAX_STOP_BLOCKS = 2

const SKIPPED = /(^|\/)(node_modules|dist|build|out|\.next|\.nuxt|\.git|coverage|vendor|target|__pycache__)\//
const JS = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/
const TS = /\.(ts|tsx|mts|cts)$/
const PY = /\.(py|pyi)$/
const JSONC = /(^|\/)(tsconfig[^/]*|jsconfig[^/]*|devcontainer|\.vscode\/[^/]+|[^/]+\.jsonc)$/
const ESLINT_CONFIGS = [
  'eslint.config.js', 'eslint.config.mjs', 'eslint.config.cjs',
  'eslint.config.ts', 'eslint.config.mts', 'eslint.config.cts',
  '.eslintrc', '.eslintrc.js', '.eslintrc.cjs', '.eslintrc.json', '.eslintrc.yml', '.eslintrc.yaml',
]
const AST_CHECK = 'import ast,sys; ast.parse(open(sys.argv[1], encoding="utf-8").read(), sys.argv[1])'

const dirname = (p: string) => {
  const i = p.lastIndexOf('/')
  return i <= 0 ? '/' : p.slice(0, i)
}
const basename = (p: string) => p.slice(p.lastIndexOf('/') + 1)
const join = (a: string, b: string) => (a === '/' ? `/${b}` : `${a}/${b}`)
const clean = (text: string) => text.replace(/\x1b\[[0-9;]*m/g, '').trim()

const trim = (text: string) =>
  text.length <= MAX_CONTEXT ? text : `${text.slice(0, MAX_CONTEXT - 60)}\n… (${text.length - MAX_CONTEXT + 60} more chars)`

let typecheckOnStop = true
const listings = new Map<string, Set<string>>()
const which = new Map<string, string | null>()
const failing = new Map<string, string>()
const tscProjects = new Map<string, TscProject>()
const goModules = new Map<string, GoModule>()
const tscBaseline = new Map<string, Set<string>>()
let stopBlocks = 0

async function names($: $, dir: string) {
  const cached = listings.get(dir)
  if (cached) {
    return cached
  }
  let found = new Set<string>()
  try {
    found = new Set((await $.fs.list(dir)).map(entry => entry.name))
  } catch {}
  listings.set(dir, found)
  return found
}

async function findUp($: $, start: string, wanted: readonly string[]) {
  let dir = start
  for (let depth = 0; depth < 25; depth++) {
    const here = await names($, dir)
    const name = wanted.find(one => here.has(one))
    if (name) {
      return { dir, name }
    }
    if (dir === '/') {
      return null
    }
    dir = dirname(dir)
  }
  return null
}

async function nodeBin($: $, start: string, bin: string) {
  let dir = start
  for (let depth = 0; depth < 25; depth++) {
    if ((await names($, dir)).has('node_modules') && (await $.fs.exists(join(dir, `node_modules/.bin/${bin}`)))) {
      return join(dir, `node_modules/.bin/${bin}`)
    }
    if (dir === '/') {
      return null
    }
    dir = dirname(dir)
  }
  return null
}

async function onPath($: $, bin: string) {
  if (!which.has(bin)) {
    try {
      const found = await $.process.run(['which', bin], { timeoutMs: 5000 })
      which.set(bin, found.exitCode === 0 ? found.stdout.trim() : null)
    } catch {
      which.set(bin, null)
    }
  }
  return which.get(bin) ?? null
}

async function run($: $, argv: string[], cwd: string, timeoutMs = TIMEOUT_MS) {
  try {
    const ran = await $.process.run(argv, { cwd, timeoutMs })
    return { exitCode: ran.exitCode, output: clean(`${ran.stdout}\n${ran.stderr}`) }
  } catch (error) {
    $.ui.log(`auto-check: ${argv[0]} did not finish: ${String(error)}`, { to: 'debug' })
    return null
  }
}

const relativeTo = (root: string, text: string) => text.split(`${root}/`).join('')

async function eslint($: $, file: string): Promise<Failure | null> {
  const config = await findUp($, dirname(file), ESLINT_CONFIGS)
  if (!config) {
    return null
  }
  const bin = await nodeBin($, config.dir, 'eslint')
  if (!bin) {
    return null
  }
  const ran = await run($, [bin, '--quiet', '--no-color', file], config.dir)
  // 1 is "problems found"; 2 is eslint itself failing (config, parser), not the edit's fault.
  if (!ran || ran.exitCode !== 1) {
    return null
  }
  const summary = ran.output.match(/\((\d+) errors?/)
  const errors = summary ? Number(summary[1]) : ran.output.split('\n').filter(line => /^\s+\d+:\d+\s+error/.test(line)).length
  return { checker: 'eslint', file, errors: Math.max(errors, 1), output: relativeTo(config.dir, ran.output) }
}

async function python($: $, file: string, cwd: string): Promise<Failure | null> {
  const ruff = await onPath($, 'ruff')
  if (ruff) {
    const ran = await run($, [ruff, 'check', '--output-format', 'concise', '--no-cache', file], cwd)
    if (!ran || ran.exitCode !== 1) {
      return null
    }
    const errors = ran.output.split('\n').filter(line => /:\d+:\d+: /.test(line)).length
    return { checker: 'ruff', file, errors: Math.max(errors, 1), output: relativeTo(cwd, ran.output) }
  }
  if (!PY.test(file)) {
    return null
  }
  const ran = await run($, ['python3', '-c', AST_CHECK, file], cwd)
  if (!ran || ran.exitCode === 0) {
    return null
  }
  const lines = ran.output.split('\n')
  return { checker: 'python', file, errors: 1, output: relativeTo(cwd, lines.slice(-6).join('\n')) }
}

async function gofmt($: $, file: string, cwd: string): Promise<Failure | null> {
  const bin = await onPath($, 'gofmt')
  if (!bin) {
    return null
  }
  const ran = await run($, [bin, '-e', '-l', file], cwd)
  if (!ran) {
    return null
  }
  if (ran.exitCode !== 0) {
    return { checker: 'gofmt', file, errors: ran.output.split('\n').filter(Boolean).length, output: relativeTo(cwd, ran.output) }
  }
  if (ran.output.length > 0) {
    return { checker: 'gofmt', file, errors: 1, output: `${basename(file)} is not gofmt-formatted: run \`gofmt -w ${file}\`.` }
  }
  return null
}

async function json($: $, file: string): Promise<Failure | null> {
  if (JSONC.test(file)) {
    return null
  }
  let text: string
  try {
    text = await $.fs.read(file)
  } catch {
    return null
  }
  try {
    JSON.parse(text)
    return null
  } catch (error) {
    return { checker: 'json', file, errors: 1, output: `Invalid JSON: ${error instanceof Error ? error.message : String(error)}` }
  }
}

async function markProject($: $, file: string) {
  if (!typecheckOnStop) {
    return
  }
  if (TS.test(file)) {
    const config = await findUp($, dirname(file), ['tsconfig.json'])
    if (!config) {
      return
    }
    const bin = await nodeBin($, config.dir, 'tsc')
    if (!bin) {
      return
    }
    const project = tscProjects.get(config.dir) ?? { dir: config.dir, config: join(config.dir, 'tsconfig.json'), bin, files: new Set() }
    project.files.add(file)
    tscProjects.set(config.dir, project)
    return
  }
  if (file.endsWith('.go') && (await onPath($, 'go'))) {
    const mod = await findUp($, dirname(file), ['go.mod'])
    if (!mod) {
      return
    }
    const module = goModules.get(mod.dir) ?? { dir: mod.dir, packages: new Set() }
    const pkg = dirname(file)
    module.packages.add(pkg === mod.dir ? '.' : `./${pkg.slice(mod.dir.length + 1)}`)
    goModules.set(mod.dir, module)
  }
}

function showStatus($: $) {
  $.ui.status(failing.size === 0 ? undefined : `❌ auto-check: ${failing.size} ไฟล์ยังมีปัญหา`)
}

async function checkFile($: $, file: string, cwd: string): Promise<Failure | null> {
  if (JS.test(file)) {
    return eslint($, file)
  }
  if (PY.test(file) || file.endsWith('.ipynb')) {
    return python($, file, cwd)
  }
  if (file.endsWith('.go')) {
    return gofmt($, file, cwd)
  }
  if (file.endsWith('.json')) {
    return json($, file)
  }
  return null
}

const tscErrors = (output: string) => {
  // `file(line,col): error TSxxxx: message`, continuation lines indented beneath.
  const errors: { key: string; text: string }[] = []
  for (const line of output.split('\n')) {
    const head = line.match(/^(.+?)\(\d+,\d+\): error (TS\d+): (.*)$/)
    if (head) {
      errors.push({ key: `${head[1]}|${head[2]}|${head[3]}`, text: line })
    } else if (errors.length > 0 && /^\s/.test(line)) {
      const last = errors[errors.length - 1]!
      last.text += `\n${line}`
    }
  }
  return errors
}

async function runProjects($: $) {
  const failures: Failure[] = []
  for (const project of tscProjects.values()) {
    const ran = await run($, [project.bin, '--noEmit', '--pretty', 'false', '-p', project.config], project.dir, PROJECT_TIMEOUT_MS)
    if (!ran) {
      continue
    }
    const errors = tscErrors(ran.output)
    const known = tscBaseline.get(project.dir)
    const edited = new Set([...project.files].map(file => (file.startsWith(`${project.dir}/`) ? file.slice(project.dir.length + 1) : file)))
    // New since the last run; on the first run, those in the files Claude edited.
    const fresh = errors.filter(one => (known ? !known.has(one.key) : edited.has(one.key.split('|')[0]!)))
    tscBaseline.set(project.dir, new Set(errors.map(one => one.key)))
    if (fresh.length > 0) {
      failures.push({ checker: 'tsc', file: project.config, errors: fresh.length, output: fresh.map(one => one.text).join('\n') })
    }
  }
  for (const module of goModules.values()) {
    const go = await onPath($, 'go')
    if (!go) {
      break
    }
    const ran = await run($, [go, 'vet', ...module.packages], module.dir, PROJECT_TIMEOUT_MS)
    if (ran && ran.exitCode !== 0) {
      const lines = ran.output.split('\n').filter(line => line && !line.startsWith('#'))
      failures.push({ checker: 'go vet', file: join(module.dir, 'go.mod'), errors: lines.length, output: ran.output })
    }
  }
  tscProjects.clear()
  goModules.clear()
  return failures
}

export const register: Register = (on, options) => {
  if (options.enabled === false) {
    return
  }
  typecheckOnStop = options.typecheckOnStop !== false

  on('turn.start', ($, e, next) => {
    stopBlocks = 0
    listings.clear()
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    if (e.tool !== 'Edit' && e.tool !== 'Write' && e.tool !== 'NotebookEdit') {
      return next(e)
    }
    const ran = await next(e)
    if (ran.deny !== undefined || ran.isError) {
      return ran
    }
    const cwd = await $.session.cwd()
    const given = e.tool === 'NotebookEdit' ? e.notebook_path : e.file_path
    const file = given.startsWith('/') ? given : join(cwd, given)
    if (SKIPPED.test(file)) {
      return ran
    }
    listings.delete(dirname(file))

    await markProject($, file)
    const failure = await checkFile($, file, cwd)
    if (!failure) {
      if (failing.delete(file)) {
        showStatus($)
      }
      return ran
    }

    failing.set(file, failure.checker)
    showStatus($)
    const where = file.startsWith(`${cwd}/`) ? file.slice(cwd.length + 1) : file
    $.ui.toast(`❌ ${failure.checker}: ${failure.errors} error${failure.errors === 1 ? '' : 's'} ใน ${basename(file)}`)
    const note = [
      `[auto-check] ${failure.checker} reported ${failure.errors} problem(s) in ${where} after this edit (the edit was applied):`,
      trim(failure.output),
      'Fix these before moving on.',
    ].join('\n')

    return { ...ran, context: [...(ran.context ?? []), note] }
  })

  on('classic.Stop', async ($, e, next) => {
    if (tscProjects.size === 0 && goModules.size === 0) {
      return next(e)
    }
    if (stopBlocks >= MAX_STOP_BLOCKS) {
      tscProjects.clear()
      goModules.clear()
      return next(e)
    }
    $.ui.status('⏳ auto-check: type-checking…')
    const failures = await runProjects($)
    showStatus($)
    if (failures.length === 0) {
      return next(e)
    }

    stopBlocks += 1
    const total = failures.reduce((sum, one) => sum + one.errors, 0)
    $.ui.toast(`❌ ${failures.map(one => one.checker).join(' + ')}: ${total} error ใหม่ — ให้ Claude แก้ต่อ`)
    const reason = [
      `[auto-check] The project no longer type-checks after this turn's edits (${total} new error(s)):`,
      ...failures.map(one => `${one.checker} (${one.file}):\n${trim(one.output)}`),
      'Fix these, or tell the user why they should stay.',
    ].join('\n\n')
    const ran = await next(e)

    return { ...ran, block: ran.block ? `${ran.block}\n\n${reason}` : reason }
  })
}
