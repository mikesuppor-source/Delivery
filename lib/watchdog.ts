import type { SupabaseClient } from '@supabase/supabase-js'
import { emailConfigured, sendEmail } from './email'

export interface Problem { level: 'critical' | 'warning'; title: string; detail: string }

/** What the nightly backup workflow last did, read from GitHub (the repository is public, so no sign-in is needed). */
export interface GithubFacts {
  unavailable?: boolean
  /** The latest finished backup run: did it succeed, did its real steps run (a skipped job also shows green), and how old is it. */
  backup?: { succeeded: boolean; stepsRan: boolean; ageHours: number } | null
  /** Hours since the 5-minute sender workflow last finished a run. */
  senderAgeHours?: number | null
}

export interface Facts {
  dbOk: boolean
  webhooksBacklog: number
  webhooksFailed24h: number
  messagesBacklog: number
  messagesFailed24h: number
  errors24h: number
  errorPaths: Array<{ path: string; count: number }>
  github: GithubFacts
}

const HOUR = 3_600_000

/** Turns the facts into a list of problems. Quiet by design: an empty list means nothing needs the owner's attention. */
export function findProblems(f: Facts): Problem[] {
  const out: Problem[] = []
  if (!f.dbOk) out.push({ level: 'critical', title: 'The database does not answer', detail: 'Cedar could not read from its database. Check the Supabase project (it may be paused or down).' })
  if (f.errors24h > 0) {
    const where = f.errorPaths.slice(0, 3).map(p => `${p.path} (${p.count})`).join(', ')
    out.push({
      level: f.errors24h >= 20 ? 'critical' : 'warning',
      title: `${f.errors24h} server error${f.errors24h === 1 ? '' : 's'} in the last 24 hours`,
      detail: `Most affected: ${where || 'unknown'}. People saw "Request failed" on these.`,
    })
  }
  if (f.messagesBacklog > 0) out.push({ level: 'warning', title: `${f.messagesBacklog} customer message${f.messagesBacklog === 1 ? ' is' : 's are'} waiting for over an hour`, detail: 'The message sender may be stuck. Check the "Send webhooks" job on GitHub (Actions).' })
  if (f.messagesFailed24h > 0) out.push({ level: 'warning', title: `${f.messagesFailed24h} customer message${f.messagesFailed24h === 1 ? '' : 's'} failed for good in the last 24 hours`, detail: 'They were tried five times. Look in the message log for the reason.' })
  if (f.webhooksBacklog > 0) out.push({ level: 'warning', title: `${f.webhooksBacklog} shop webhook message${f.webhooksBacklog === 1 ? ' is' : 's are'} waiting for over 2 hours`, detail: 'The sender job may be stuck, or a shop\'s system is down.' })
  if (f.webhooksFailed24h >= 5) out.push({ level: 'warning', title: `${f.webhooksFailed24h} shop webhook messages gave up in the last 24 hours`, detail: 'A shop\'s system keeps refusing our messages. The shop can see the reason on its Connect Store page.' })

  const g = f.github
  if (!g.unavailable) {
    if (g.backup === null) out.push({ level: 'critical', title: 'The nightly backup has never run', detail: 'No finished run of the backup was found on GitHub.' })
    else if (g.backup) {
      if (!g.backup.succeeded) out.push({ level: 'critical', title: 'The last nightly backup failed', detail: 'Open GitHub, Actions, "Nightly backup", and read the failed step. Until it works there is no fresh backup.' })
      else if (!g.backup.stepsRan) out.push({ level: 'critical', title: 'The nightly backup ran but copied nothing', detail: 'The run is green but its real steps were skipped, usually because a GitHub secret is missing.' })
      else if (g.backup.ageHours > 36) out.push({ level: 'critical', title: `The last successful backup is ${Math.round(g.backup.ageHours)} hours old`, detail: 'The nightly backup should run every night. GitHub may have paused the schedule.' })
    }
    if (typeof g.senderAgeHours === 'number' && g.senderAgeHours > 24) out.push({ level: 'warning', title: `The message sender job has not run for ${Math.round(g.senderAgeHours)} hours`, detail: 'Retries of failed messages are not happening. Open GitHub, Actions, "Send webhooks".' })
  }
  return out
}

export function alertEmail(problems: Problem[], site: string) {
  const critical = problems.filter(p => p.level === 'critical').length
  const lines = problems.map(p => `${p.level === 'critical' ? 'URGENT' : 'Check'}: ${p.title}\n  ${p.detail}`)
  return {
    subject: `Cedar ${critical ? 'URGENT: ' : 'check: '}${problems.length} thing${problems.length === 1 ? '' : 's'} need attention`,
    text: [`The daily check of ${site} found:`, '', ...lines, '', 'This email is sent only when something needs attention. No email means all is well.'].join('\n\n'),
  }
}

type Fetcher = typeof fetch

/** Reads the backup and sender workflows' latest runs from GitHub's public API. */
export async function checkGithub(options: { repo: string; token?: string; fetcher?: Fetcher; now?: number }): Promise<GithubFacts> {
  const fetcher = options.fetcher ?? fetch
  const now = options.now ?? Date.now()
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json', 'User-Agent': 'cedar-watchdog', ...(options.token ? { Authorization: 'Bearer ' + options.token } : {}) }
  const get = async (path: string) => {
    const res = await fetcher(`https://api.github.com/repos/${options.repo}/${path}`, { headers })
    if (!res.ok) throw new Error('GitHub answered ' + res.status)
    return res.json() as Promise<any>
  }
  try {
    const latest = async (workflow: string) => ((await get(`actions/workflows/${workflow}/runs?per_page=1&status=completed`)).workflow_runs ?? [])[0] ?? null
    const [backupRun, senderRun] = await Promise.all([latest('backup.yml'), latest('webhooks.yml')])
    const age = (run: any) => (now - new Date(run.updated_at ?? run.created_at).getTime()) / HOUR
    let backup: GithubFacts['backup'] = null
    if (backupRun) {
      const jobs: any[] = (await get(`actions/runs/${backupRun.id}/jobs`)).jobs ?? []
      const ran = (jobName: string, step: string) => jobs.find(j => j.name === jobName)?.steps?.some((s: any) => s.name === step && s.conclusion === 'success') === true
      backup = { succeeded: backupRun.conclusion === 'success', stepsRan: ran('backup', 'Dump and encrypt') && ran('storage', 'Copy files and encrypt'), ageHours: age(backupRun) }
    }
    return { backup, senderAgeHours: senderRun ? age(senderRun) : null }
  } catch {
    return { unavailable: true }
  }
}

/** Counts what the database can tell us. Each count is independent, so one failing query does not hide the others. */
export async function gatherDbFacts(db: SupabaseClient, now = Date.now()): Promise<Omit<Facts, 'github'>> {
  const ago = (ms: number) => new Date(now - ms).toISOString()
  const count = async (query: PromiseLike<{ count: number | null; error: unknown }>) => { const r = await query; return r.error ? 0 : r.count ?? 0 }
  const head = { count: 'exact' as const, head: true }
  const alive = await db.from('workspaces').select('id', { count: 'exact', head: true })
  const errors = await db.from('error_log').select('path').gte('created_at', ago(24 * HOUR)).limit(500)
  const byPath = new Map<string, number>()
  for (const row of errors.data ?? []) byPath.set(row.path, (byPath.get(row.path) ?? 0) + 1)
  const [webhooksBacklog, webhooksFailed24h, messagesBacklog, messagesFailed24h] = await Promise.all([
    count(db.from('webhook_deliveries').select('id', head).eq('status', 'pending').lt('created_at', ago(2 * HOUR))),
    count(db.from('webhook_deliveries').select('id', head).eq('status', 'failed').gte('created_at', ago(24 * HOUR))),
    count(db.from('customer_message_queue').select('id', head).eq('status', 'pending').lt('created_at', ago(HOUR))),
    count(db.from('customer_message_queue').select('id', head).eq('status', 'failed').gte('finished_at', ago(24 * HOUR))),
  ])
  return {
    dbOk: !alive.error,
    webhooksBacklog, webhooksFailed24h, messagesBacklog, messagesFailed24h,
    errors24h: errors.data?.length ?? 0,
    errorPaths: [...byPath.entries()].map(([path, n]) => ({ path, count: n })).sort((a, b) => b.count - a.count),
  }
}

export const DEFAULT_REPO = 'mikesuppor-source/Delivery'

/** The daily check: gather the facts, find problems, and email the owner only when there are some. */
export async function runWatchdog(db: SupabaseClient, options: { site: string; send?: boolean; github?: boolean; to?: string | null } = { site: '' }) {
  const [dbFacts, github] = await Promise.all([
    gatherDbFacts(db),
    options.github === false ? Promise.resolve<GithubFacts>({ unavailable: true }) : checkGithub({ repo: process.env.WATCHDOG_REPO || DEFAULT_REPO, token: process.env.GITHUB_READ_TOKEN }),
  ])
  const problems = findProblems({ ...dbFacts, github })
  let emailed: boolean | 'not_configured' = false
  if (problems.length && options.send !== false) {
    const to = options.to ?? process.env.ALERT_EMAIL
    if (to && emailConfigured()) {
      try { await sendEmail({ to, ...alertEmail(problems, options.site) }); emailed = true } catch { emailed = false }
    } else emailed = 'not_configured'
  }
  // Old error records are not kept
  await db.from('error_log').delete().lt('created_at', new Date(Date.now() - 30 * 24 * HOUR).toISOString())
  return { ok: problems.length === 0, problems, emailed, githubChecked: !github.unavailable }
}
