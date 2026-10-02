import type { Register } from 'claude-code'

// What the guard decided about one part of a tool call.
type Level = 'block' | 'ask'
type Finding = { level: Level; why: string }

type Ctx = {
  // The current git branch in a directory, or undefined outside a repository.
  branchIn: (dir: string) => Promise<string | undefined>
  home: string
  root: string
  cwd: string
}

const ALLOW = 'อนุญาตครั้งนี้'
const REFUSE = 'บล็อก'

// ---------------------------------------------------------------------------
// Files that hold secrets
// ---------------------------------------------------------------------------

const SECRET_FILES: { re: RegExp; what: string; isReadable?: true }[] = [
  { re: /(^|\/)\.env(\.(?!(example|sample|template|dist|defaults)$)[\w.-]+)?$/i, what: '.env file' },
  { re: /\.(pem|key|p12|pfx|jks|keystore)$/i, what: 'key/certificate file' },
  { re: /(^|\/)id_(rsa|dsa|ecdsa|ed25519)$/, what: 'SSH private key' },
  { re: /(^|\/)\.ssh\/(?!.*\.pub$|known_hosts|config$)/, what: '~/.ssh' },
  { re: /(^|\/)\.aws\/credentials$/, what: 'AWS credentials' },
  { re: /(^|\/)\.(netrc|npmrc|pypirc)$/, what: 'auth config' },
  { re: /(^|\/)\.git\/(config$|hooks\/)/, what: 'git internals', isReadable: true },
]

function secretFile(path: string, isRead = false): string | undefined {
  const hit = SECRET_FILES.find(f => f.re.test(path) && !(isRead && f.isReadable))

  return hit?.what
}

// ---------------------------------------------------------------------------
// Secrets inside text that is about to be written
// ---------------------------------------------------------------------------

const SECRETS: { re: RegExp; what: string }[] = [
  { re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/, what: 'AWS access key' },
  { re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/, what: 'GitHub token' },
  { re: /\bgithub_pat_[A-Za-z0-9_]{50,}/, what: 'GitHub token' },
  { re: /\bglpat-[A-Za-z0-9_-]{20,}/, what: 'GitLab token' },
  { re: /\bsk-ant-[A-Za-z0-9_-]{20,}/, what: 'Anthropic API key' },
  { re: /\bsk-(?!ant-)(?:proj-|svcacct-)?[A-Za-z0-9_-]{32,}/, what: 'OpenAI API key' },
  { re: /\bxox[abprs]-[A-Za-z0-9-]{10,}/, what: 'Slack token' },
  { re: /\bAIza[0-9A-Za-z_-]{35}\b/, what: 'Google API key' },
  { re: /\b[rs]k_live_[0-9A-Za-z]{20,}/, what: 'Stripe live key' },
  { re: /\bATATT[A-Za-z0-9_=-]{20,}/, what: 'Atlassian API token' },
  { re: /\bnpm_[A-Za-z0-9]{36}\b/, what: 'npm token' },
  { re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY(?: BLOCK)?-----/, what: 'private key' },
  { re: /\beyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{20,}/, what: 'JWT' },
]

const DB_URL = /\b(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|redis|rediss|amqps?):\/\/[^:\s/@'"]+:([^@\s'"]{6,})@/g
const ASSIGNED = /\b(?:password|passwd|secret|api[_-]?key|access[_-]?token|auth[_-]?token|client[_-]?secret|private[_-]?key)["']?\s*[:=]\s*["']([^"'\s]{12,})["']/gi
const PLACEHOLDER = /x{4,}|\*{3,}|your|example|change.?me|placeholder|dummy|fake|sample|test|redacted|<|>|\$\{|\{\{|process\.env|os\.environ|getenv/i
const DEV_PASSWORDS = /^(postgres|password|root|admin|secret|mysql|pass|localdev|guest)$/i

function mask(value: string): string {
  return value.length <= 8 ? '****' : `${value.slice(0, 4)}…`
}

function scanSecrets(text: string): string[] {
  const found: string[] = []

  for (const { re, what } of SECRETS) {
    const hit = re.exec(text)

    if (hit && !PLACEHOLDER.test(hit[0])) {
      found.push(`${what} (${mask(hit[0])})`)
    }
  }

  for (const hit of text.matchAll(DB_URL)) {
    const pass = hit[1] ?? ''

    if (!PLACEHOLDER.test(pass) && !DEV_PASSWORDS.test(pass)) {
      found.push(`database URL with password (${mask(pass)})`)
      break
    }
  }

  for (const hit of text.matchAll(ASSIGNED)) {
    const value = hit[1] ?? ''

    if (!PLACEHOLDER.test(value)) {
      found.push(`hardcoded credential (${mask(value)})`)
      break
    }
  }

  return [...new Set(found)]
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

function resolvePath(base: string, path: string): string {
  const parts = (path.startsWith('/') ? path : `${base}/${path}`).split('/')
  const out: string[] = []

  for (const part of parts) {
    if (part === '' || part === '.') continue
    if (part === '..') out.pop()
    else out.push(part)
  }

  return `/${out.join('/')}`
}

function isUnder(path: string, dir: string): boolean {
  return dir === '/' || path === dir || path.startsWith(`${dir}/`)
}

function expandHome(word: string, home: string): string {
  return word
    .replace(/^~(?=\/|$)/, home)
    .replace(/^\$\{?HOME\}?(?=\/|$)/, home)
}

const TEMP_DIRS = ['/tmp', '/private/tmp', '/var/folders', '/private/var/folders']

function systemDirs(home: string): Set<string> {
  const top = [
    '/System', '/Library', '/Applications', '/Users', '/usr', '/bin', '/sbin', '/etc',
    '/var', '/private', '/private/var', '/private/etc', '/opt', '/Volumes', '/home',
    '/root', '/boot', '/dev', '/lib', '/proc', '/sys', '/cores', '/opt/homebrew',
  ]
  const personal = ['Library', 'Documents', 'Desktop', 'Downloads', 'Pictures', 'Movies',
    'Music', '.ssh', '.config', '.claude', '.aws', '.gnupg']

  return new Set([...top, ...personal.map(dir => `${home}/${dir}`)])
}

// ---------------------------------------------------------------------------
// Shell commands
// ---------------------------------------------------------------------------

function unquote(word: string): string {
  return word.replace(/^(['"])(.*)\1$/, '$2')
}

function splitSegments(command: string): string[] {
  return command
    .split(/\n|;|&&|\|\||\|/)
    .map(part => part.trim())
    .filter(Boolean)
}

const WRAPPERS = new Set(['sudo', 'env', 'command', 'nohup', 'time', 'nice', 'exec', 'builtin'])

// The words of a segment with leading wrappers and VAR=value assignments dropped.
function commandWords(segment: string): string[] {
  const words = segment.split(/\s+/).map(unquote)
  let i = 0

  while (i < words.length && (WRAPPERS.has(words[i] ?? '') || /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[i] ?? '') || /^-/.test(words[i] ?? '') && i > 0 && WRAPPERS.has(words[i - 1] ?? ''))) {
    i += 1
  }

  return words.slice(i)
}

function checkRm(args: string[], dir: string, ctx: Ctx): Finding[] {
  let isRecursive = false
  let isEndOfOptions = false
  const targets: string[] = []

  for (const arg of args) {
    if (!isEndOfOptions && arg === '--') {
      isEndOfOptions = true
    } else if (!isEndOfOptions && arg.startsWith('--')) {
      if (arg === '--recursive') isRecursive = true
    } else if (!isEndOfOptions && arg.startsWith('-') && arg.length > 1) {
      if (/[rR]/.test(arg)) isRecursive = true
    } else {
      targets.push(arg)
    }
  }

  if (!isRecursive) return []

  const system = systemDirs(ctx.home)
  const findings: Finding[] = []

  for (const target of targets) {
    const expanded = expandHome(target, ctx.home)

    if (/[$`]/.test(expanded)) {
      findings.push({ level: 'ask', why: `rm -r with a variable path (${target}): if it is empty this can wipe /` })
      continue
    }

    const path = resolvePath(dir, expanded).replace(/\/\.?\*$/, '') || '/'

    if (path === '/' || path === ctx.home || system.has(path)) {
      findings.push({ level: 'block', why: `rm -r on ${path === ctx.home ? 'your home directory' : path}` })
    } else if (TEMP_DIRS.some(tmp => isUnder(path, tmp))) {
      continue
    } else if (isUnder(ctx.root, path) && path !== ctx.root) {
      findings.push({ level: 'block', why: `rm -r on ${path}, which contains the whole project` })
    } else if (path === ctx.root) {
      findings.push({ level: 'ask', why: 'rm -r on the whole project folder' })
    } else if (!isUnder(path, ctx.root)) {
      findings.push({ level: 'ask', why: `rm -r outside the project: ${path}` })
    }
  }

  return findings
}

const PROTECTED_BRANCH = /^(main|master|production|prod)$/

async function checkPush(args: string[], dir: string, ctx: Ctx): Promise<Finding[]> {
  const flags = args.filter(arg => arg.startsWith('-'))
  const positional = args.filter(arg => !arg.startsWith('-'))
  const refspecs = positional.slice(1)
  const isLease = flags.some(flag => flag.startsWith('--force-with-lease') || flag === '--force-if-includes')
  const isForce = flags.some(flag => flag === '--force' || /^-[a-zA-Z]*f/.test(flag) && !flag.startsWith('--')) ||
    refspecs.some(ref => ref.startsWith('+'))
  const isDelete = flags.some(flag => flag === '--delete' || flag === '-d') || refspecs.some(ref => ref.startsWith(':'))

  if (!isForce && !isLease && !isDelete) return []

  let branches = refspecs
    .map(ref => (ref.replace(/^\+/, '').split(':').pop() ?? '').replace(/^refs\/heads\//, ''))
    .filter(Boolean)

  if (branches.length === 0) {
    const branch = await ctx.branchIn(dir)
    branches = branch ? [branch] : []
  }

  const main = branches.find(branch => PROTECTED_BRANCH.test(branch))
  const named = branches.join(', ') || 'the current branch'

  if (isDelete) {
    return [{ level: main ? 'block' : 'ask', why: `deletes remote branch ${named}` }]
  }

  if (main) {
    return [{ level: isForce ? 'block' : 'ask', why: `force-push to ${main}` }]
  }

  return isForce ? [{ level: 'ask', why: `force-push to ${named} (rewrites remote history)` }] : []
}

// Patterns checked on each segment of a command.
const SEGMENT_RULES: { level: Level; re: RegExp; why: string }[] = [
  { level: 'block', re: /^mkfs(\.\w+)?\b/, why: 'formats a disk' },
  { level: 'block', re: /^dd\b.*\bof=\/dev\/(r?disk|sd|nvme|hd|mmcblk)/, why: 'writes raw bytes onto a disk' },
  { level: 'block', re: /^diskutil\s+(eraseDisk|eraseVolume|partitionDisk|zeroDisk|secureErase|reformat)\b/i, why: 'erases a disk' },
  { level: 'block', re: /^chmod\s+(-\S+\s+)*-\S*R\S*\s+(0?777|a\+rwx)\s+(\/|~|\$HOME)\/?$/, why: 'chmod 777 on / or home' },
  { level: 'block', re: /^chown\s+(-\S+\s+)*-\S*R\S*\s+\S+\s+(\/|~|\$HOME)\/?$/, why: 'chown -R on / or home' },
  { level: 'ask', re: /^git\s+reset\s+(.*\s)?--hard\b/, why: 'git reset --hard discards uncommitted work' },
  { level: 'ask', re: /^git\s+clean\s+(.*\s)?-[a-zA-Z]*f/, why: 'git clean deletes untracked files' },
  { level: 'ask', re: /^git\s+(checkout|restore)\s+(.*\s)?(--\s+)?\.\s*$/, why: 'discards every local change' },
  { level: 'ask', re: /^git\s+branch\s+(.*\s)?-D\b/, why: 'force-deletes a branch' },
  { level: 'ask', re: /^git\s+stash\s+(drop|clear)\b/, why: 'drops stashed work' },
  { level: 'ask', re: /^git\s+(filter-branch|filter-repo)\b/, why: 'rewrites git history' },
  { level: 'ask', re: /^git\s+update-ref\s+-d\b/, why: 'deletes a git ref' },
  { level: 'ask', re: /^find\s+(\/|~|\$HOME|\.\.)\S*\s.*-delete\b/, why: 'find -delete over a wide tree' },
  { level: 'ask', re: /^xargs\s+(.*\s)?rm\s+(.*\s)?-\S*[rR]/, why: 'rm -r through xargs (targets unknown)' },
  { level: 'ask', re: /^docker\s+((system|volume|image|container|builder|network)\s+prune|volume\s+rm)\b/, why: 'docker prune/volume removal' },
  { level: 'ask', re: /^kubectl\s+delete\b/, why: 'kubectl delete' },
  { level: 'ask', re: /^terraform\s+(destroy|apply\b.*-auto-approve)/, why: 'terraform destroy/auto-approve' },
  { level: 'ask', re: /^helm\s+(uninstall|delete)\b/, why: 'helm uninstall' },
  { level: 'ask', re: /^(npm|pnpm|yarn|bun)\s+publish\b|^cargo\s+publish\b|^twine\s+upload\b|^gem\s+push\b/, why: 'publishes a package publicly' },
  { level: 'ask', re: /^gh\s+(repo|release)\s+delete\b/, why: 'deletes a GitHub repo/release' },
  { level: 'ask', re: /^railway\s+(down|delete)\b/, why: 'removes a Railway deployment/project' },
  { level: 'ask', re: /^truncate\s/, why: 'truncates a file' },
]

// Patterns checked on the whole command.
const COMMAND_RULES: { level: Level; re: RegExp; why: string }[] = [
  { level: 'block', re: /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/, why: 'fork bomb' },
  { level: 'block', re: />\s*\/dev\/(r?disk|sd|nvme|hd)\w*/, why: 'writes onto a raw disk' },
  { level: 'ask', re: /\b(curl|wget)\b[^|;&]*\|\s*(sudo\s+)?(ba|z|da|fi)?sh\b/, why: 'pipes a download straight into a shell' },
  { level: 'ask', re: /\bprisma\s+migrate\s+reset\b|\bdb:(drop|reset)\b|\bmanage\.py\s+flush\b/, why: 'resets a database' },
]

// SQL checked case-insensitively inside a database client, else only when
// written in capitals, so a commit message saying "delete from cache" passes.
const SQL_CLIENT = /\b(psql|mysql|mariadb|sqlite3|duckdb|clickhouse-client|cqlsh|mongosh|redis-cli|snowsql|supabase\s+db|prisma\s+db\s+execute)\b/
const SQL_RULES: { re: RegExp; why: string }[] = [
  { re: /\bDROP\s+(DATABASE|SCHEMA)\b/, why: 'DROP DATABASE/SCHEMA' },
  { re: /\bDROP\s+TABLE\b/, why: 'DROP TABLE' },
  { re: /\bTRUNCATE\s+(TABLE\s+)?[\w."`]+/, why: 'TRUNCATE TABLE' },
  { re: /\bDELETE\s+FROM\s+[\w."`]+(?![^;'"]*\bWHERE\b)\s*(;|'|"|$)/, why: 'DELETE without WHERE' },
  { re: /\bFLUSH(ALL|DB)\b/, why: 'wipes a Redis database' },
]

function checkSql(command: string): Finding[] {
  const flags = SQL_CLIENT.test(command) ? 'i' : ''

  return SQL_RULES
    .filter(rule => new RegExp(rule.re.source, flags).test(command))
    .map(rule => ({ level: 'ask' as const, why: rule.why }))
}

const LOOKS_ONLY = new Set(['ls', 'test', '[', 'stat', 'file', 'wc', 'touch', 'cp', 'source', '.'])
const WRITES = /(>|\btee\b|\bgit\s+commit\b|\bsed\s+-i)/

async function checkBash(command: string, ctx: Ctx): Promise<Finding[]> {
  const findings: Finding[] = []
  let dir = ctx.cwd

  for (const rule of COMMAND_RULES) {
    if (rule.re.test(command)) findings.push({ level: rule.level, why: rule.why })
  }

  findings.push(...checkSql(command))

  for (const segment of splitSegments(command)) {
    const words = commandWords(segment)
    const [name, ...args] = words
    const rest = words.join(' ')

    if (name === undefined) continue

    if (name === 'cd' && args[0] !== undefined) {
      dir = resolvePath(dir, expandHome(args[0], ctx.home))
      continue
    }

    if (segment.split(/\s+/).includes('sudo')) {
      findings.push({ level: 'ask', why: 'runs as root (sudo)' })
    }

    if (name === 'rm') {
      findings.push(...checkRm(args, dir, ctx))
    }

    if (name === 'git' && args.includes('push')) {
      findings.push(...(await checkPush(args.slice(args.indexOf('push') + 1), dir, ctx)))
    }

    for (const rule of SEGMENT_RULES) {
      if (rule.re.test(rest)) findings.push({ level: rule.level, why: rule.why })
    }

    if (!LOOKS_ONLY.has(name)) {
      const touched = args
        .map(arg => arg.replace(/^[<>]+/, ''))
        .map(arg => ({ arg, what: secretFile(arg) }))
        .find(hit => hit.what !== undefined)

      if (touched) {
        findings.push({ level: 'ask', why: `touches ${touched.what} ${touched.arg} (its secrets would enter the conversation or change)` })
      }
    }
  }

  if (WRITES.test(command)) {
    for (const secret of scanSecrets(command)) {
      findings.push({ level: 'ask', why: `writes a ${secret}` })
    }
  }

  return findings
}

// ---------------------------------------------------------------------------
// The hook
// ---------------------------------------------------------------------------

function dedupe(findings: Finding[]): Finding[] {
  const seen = new Set<string>()

  return findings.filter(one => !seen.has(one.why) && seen.add(one.why))
}

function clip(text: string, max: number): string {
  const line = text.replace(/\s+/g, ' ').trim()

  return line.length > max ? `${line.slice(0, max - 1)}…` : line
}

export const register: Register = on => {
  on('tool.call', async ($, e, next) => {
    let findings: Finding[] = []
    let subject = ''

    if (e.tool === 'Bash') {
      subject = e.command
      findings = await checkBash(e.command, {
        branchIn: async dir => {
          try {
            const { exitCode, stdout } = await $.process.run(['git', 'rev-parse', '--abbrev-ref', 'HEAD'], { cwd: dir, timeoutMs: 5000 })

            return exitCode === 0 ? stdout.trim() : undefined
          } catch {
            return undefined
          }
        },
        home: (await $.env.get('HOME')) ?? '/nonexistent-home',
        root: await $.session.root(),
        cwd: await $.session.cwd(),
      })
    } else if (e.tool === 'Read') {
      subject = e.file_path
      const what = secretFile(e.file_path, true)

      if (what) findings.push({ level: 'ask', why: `reads a ${what}: its secrets would enter the conversation` })
    } else if (e.tool === 'Edit' || e.tool === 'Write' || e.tool === 'NotebookEdit') {
      const path = e.tool === 'NotebookEdit' ? e.notebook_path : e.file_path
      const text = e.tool === 'Edit' ? e.new_string : e.tool === 'Write' ? e.content : e.new_source
      const what = secretFile(path)
      subject = path

      if (what) {
        findings.push({ level: 'ask', why: `changes a ${what}` })
      } else {
        for (const secret of scanSecrets(text)) {
          findings.push({ level: 'ask', why: `writes a ${secret} into code — use an env var instead` })
        }
      }
    }

    findings = dedupe(findings)

    if (findings.length === 0) {
      return next(e)
    }

    const whys = findings.map(one => one.why).join('; ')
    const isBlocked = findings.some(one => one.level === 'block')

    if (isBlocked) {
      const blocked = findings.filter(one => one.level === 'block').map(one => one.why).join('; ')
      $.ui.toast(`🛡️ บล็อกแล้ว: ${clip(blocked, 80)}`, { timeoutMs: 8000 })

      return {
        deny: `dev-guard blocked this ${e.tool} call: ${blocked}. This is a hard block for safety. Do not look for another way to do the same thing; tell the user what you were trying to do and let them run it themselves if they really mean it.`,
      }
    }

    let answer = ''

    try {
      answer = await $.ui.ask(
        `🛡️ ${clip(whys, 160)} — ${clip(subject, 140)} ให้ทำต่อไหม?`,
        { header: 'dev-guard', options: [ALLOW, REFUSE] },
      )
    } catch {
      return { deny: `dev-guard: ${whys}. Nobody was available to confirm it, so it was not run.` }
    }

    if (answer !== ALLOW) {
      const note = answer && answer !== REFUSE ? ` They said: "${clip(answer, 300)}".` : ''

      return { deny: `dev-guard: the user declined this ${e.tool} call (${whys}).${note} Ask the user how they want to proceed.` }
    }

    $.ui.log(`dev-guard: allowed by you — ${clip(whys, 120)}`)

    return next(e)
  })
}
