# Cedar Delivery Desk: handover and pending list

Written 2026-10-30 for the next person or AI. Read this first, then `docs/BUILD_PLAN.md` (the full product plan and the rules).
This file holds no secrets and must never get any: the repository is public.

## 1. What this is

A delivery-company system for Lebanon: orders, couriers, shops, warehouse, dispatch, customer tracking, finance.
Stack: Next.js 15, React 19, Supabase (Postgres, Auth, Storage), Vercel. The owner is not technical: explain things in plain words, give direct links, one step at a time.

## 2. Where things live

| Thing | Value |
|---|---|
| Repository | `mikesuppor-source/Delivery` (public), branch `main` is what runs live |
| Live site | https://delivery-five-roan.vercel.app (Vercel project `delivery`, team `jads-projects-dbc564fe`) |
| Live database | Supabase project `supabase-erin-nest`, ref `uzembxddgpwiibgxnigd` |
| Test database | Supabase project `cedar-staging`, ref `mkqtxqkivtouucrtfgyz` (used by Vercel preview deployments) |
| Local test stack | Docker Desktop, Supabase CLI project `cedar` (API on port 64321). Its database is out of step with the migrations (see section 8) |
| Nightly backup | `.github/workflows/backup.yml`, 01:00 UTC, encrypted, kept 30 days as workflow artifacts: job `backup` (database) and job `storage` (files, see section 6B.1) |

Live state on 2026-10-30: migrations 001 to 031 applied on both live and test databases; `main` is at the commit that holds the courier access fix.

## 3. How to work here (rules that were followed and must continue)

1. Commit, push and merge only when the owner says so, in chat, for that exact action. Production changes (database push to live, merge to `main`, storing secrets on Vercel) are blocked by a safety check until the owner approves them by name.
2. Never print, paste or store secret values. Never ask for passwords in chat. If the owner pastes a secret anyway, use it only for what they asked, never repeat it, and tell them to replace it.
3. One branch per change. Checks before shipping: `npm run typecheck`, `npm run lint`, `npm test`, `npm run test:db`, `npm run build`, and the browser tests (`npm run test:e2e`, needs Docker; GitHub runs them on every push).
4. Shipping route used so far: push the branch, wait for GitHub's `Verify` run (jobs `check` and `e2e`) to be green, then fast-forward `main` with `git push origin <sha>:refs/heads/main` (no force). Vercel then builds production in about 3 minutes. Confirm by comparing the deployment id the live address points to (`npx vercel inspect delivery-five-roan.vercel.app`, output is on stderr, capture with `2>&1`).
5. Database changes are new numbered files in `supabase/migrations/`. Never edit 001 to 031. Every `security definer` function must be revoked from `public, anon, authenticated` and granted to `service_role` unless it checks the caller itself. A test enforces this.
6. Never write a key, token or password in code, not even as a fallback. A test enforces this.
7. Keep line endings as each file has them (some files are CRLF, most are LF).
8. Verify what you claim: prove a bug with a failing test first, then fix, then show it passing. Real checks beat assumptions (for example the sign-in redirect test in section 6).

## 4. Useful commands and tricks

- Live database, read only: `npx supabase db query --linked --workdir <folder linked to the live ref> "<one-line sql>"` (a scratch folder with `supabase/config.toml` and a copy of `supabase/migrations`, linked with `supabase link --project-ref <ref> --workdir <folder>`; never relink the main folder away from the test database).
- Apply migrations: `supabase db push --linked --workdir <folder> --yes` after a dry run (`--dry-run`) that lists exactly the expected files.
- Supabase's own security checker: `npx supabase db advisors --linked --type security`.
- Run one browser test locally against the local stack: a small launcher takes the keys from `npx supabase status -o env` in memory and runs `npx playwright test <spec>`; it must refuse any non-localhost URL.
- GitHub without a token: read runs with `https://api.github.com/repos/mikesuppor-source/Delivery/actions/runs?head_sha=<sha>` (60 requests per hour). There is no `gh`. Never poll in a loop from the foreground; use a background command that reports once.
- Vercel settings: `npx vercel env add NAME --environment production --sensitive --yes` with the value on stdin from a script that never prints it.
- The site redirects every signed-out visitor, so a 307 or 401 on a page does not prove the page exists. Compare deployment ids.

## 5. What is done (all live)

- Phases 1 to 6 of `docs/BUILD_PLAN.md`: pricing and profit report, design foundation, warehouse, dispatch, customer experience, finance (payout runs, courier pay, expenses with receipts, P&L, shop statements as PDF in English and Arabic, emailing statements, weekly bonus cron).
- Security fixes: server-only database functions closed to the public (migration 031), courier push signing key moved out of the code into Vercel settings (new keys stored for Production and Preview), push registrations table protected.
- Waybill printing from the desk prints only the receipt (opens the print page).
- Courier access: blocking a courier or resetting a PIN signs the open courier screen out; Block / Unblock button in the courier profile.
- Supabase sign-in web address: Site URL and redirect list set to the live address.
- Both live couriers have a PIN.
- Vercel settings stored for email (`SMTP_URL`, `EMAIL_FROM`).

## 6. Pending list

### A. Owner tasks (an AI can explain and then verify, but cannot do them)

1. **Backup after password change: verified 2026-10-30.** The scheduled run of 2026-10-30 06:39 UTC has "Dump and encrypt" green and a new artifact (`cedar-backup-41015336427`), made after the owner changed the secrets. Left for the owner: delete the two older artifacts made with the old passphrase (`cedar-backup-40830474577`, `cedar-backup-40791003745`) in GitHub, Actions, the run, Artifacts.
2. **Email.** Brevo must activate the SMTP account (contact@brevo.com). The Supabase email form (Authentication, Emails, SMTP) already holds Brevo host, port 587, login and sender; its password must be the current Brevo SMTP key. After activation: send a password-reset test through the live project (`/auth/v1/recover`) and expect HTTP 200. The Brevo key was pasted in chat twice: the owner must generate a new one, put it in the Supabase form, and an AI must replace `SMTP_URL` on Vercel (use a local file the owner creates, not chat) and redeploy. Brevo's "Authorised IPs" blocking for SMTP keys is already deactivated. Sender is a Gmail address, so mail may land in spam until the owner has their own domain.
3. **Dispatch WhatsApp number** (skipped): set `NEXT_PUBLIC_SUPPORT_PHONE` on Vercel for Production and Preview (plain value), redeploy, then check `/track` shows a `wa.me` contact link.
4. **One real test delivery** (checklist item 7): owner creates an order, a courier delivers it on a real phone, cash handover recorded, shop paid. An AI then checks the live numbers with read-only queries (order, ledger, settlements, balances) and also learns whether courier sign-in and push alerts work on a real phone (never tried). After the merge of the push key change each courier must switch alerts on again once.
5. **Plans and hosting decisions:** Supabase Pro (daily backups, no pausing; the live project has none of its own), Vercel paid plan (the free plan is not for commercial use), custom web address (then update Supabase Auth URLs and the Vercel domain).
6. **WhatsApp Business:** Meta account and approved message templates; then set `WHATSAPP_API_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID` (or per-workspace values). The template texts are in `lib/messaging.ts`.
7. **Supabase dashboard:** turn on leaked-password protection (Authentication settings; may need a paid plan).

### B. Engineering work for an AI

1. **Storage files backup: live and verified 2026-10-30.** `backup.yml` has a second job `storage` that runs `scripts/backup-storage.mjs` (copies every file of every bucket plus a `manifest.json` with size and SHA-256, fails if any file cannot be copied), encrypts it like the database dump and keeps it 30 days as artifact `cedar-storage-<run id>`. `scripts/restore-storage.mjs` puts a backup back (recreates missing buckets as they were, checks every file against the manifest before and after upload, never overwrites a different file, refuses a `--target` that does not match the URL). GitHub secrets `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set; run 41129267083 made `cedar-storage-41129267083` (154 KB, step "Copy files and encrypt" green). Restore practised once: a live backup (2 proof files) was restored into the test project `cedar-staging` with read-back checks and no problems. Lesson: a missing secret makes the job skip itself and the run still shows green; the first attempt skipped because `SUPABASE_URL` had not been added. **Still to do:** repeat the restore practice monthly (download the artifact, decrypt, run the restore script with `--target=mkqtxqkivtouucrtfgyz` and the test project's own URL and key; commands are at the top of `backup.yml`). A restore of the database dump has never been tried.
2. **Phase 7 (integrations):** merchant REST API under `/api/v1` with hashed API keys, OpenAPI document, signed webhooks with retries, WooCommerce import. Nothing exists yet. See `docs/BUILD_PLAN.md` section 5, Phase 7.
3. **Phase 8 (selling to other delivery companies):** plans and billing, super-admin console, detailed permissions, onboarding wizard, branding and custom domains, Sentry, `/api/health` uptime route, terms and privacy pages, data export and deletion. Nothing exists yet.
4. **Invoices (plan item 6.6, optional):** not built, rules unclear; ask the owner first.
5. **Arabic:** most older screens have no Arabic yet; the finance screens and statements do.
6. **Desk top bar** overflows at phone width on every page.
7. **Tidy-ups:** Supabase's checker still warns about trigger functions executable by anon, mutable search paths on two functions; revoking execute on trigger functions is safe (Postgres checks it only when a trigger is created) but test first. Delete the unused `POSTGRES_*` variables on Vercel only if the owner agrees.
8. **Not audited this session:** Phases 1 to 5 were not re-checked line by line against the plan; earlier notes say they are built and tested.

## 7. Lessons that cost time

- A green backup run does not prove a copy was made: the job skips itself when secrets are missing. Check the step "Dump and encrypt" and the artifact.
- `pg_stat_user_tables` row estimates can read 0 on a database with data; count exactly before deleting or resetting anything.
- Vercel's CLI prints its tables on stderr. Suppressing stderr hides everything.
- Brevo refuses unknown IP addresses unless blocking is deactivated, and a new Brevo account needs SMTP activation before Supabase can send.
- A fixed pattern for security-sensitive publics: the repo is public, so keep commit messages and comments for open vulnerabilities short until the fix is live.

## 8. Known oddities

- The local Docker database on the owner's PC is out of step (migration 027 fails there, 65 old test orders). It can be reset with `npx supabase db reset --local` after asking the owner. GitHub's browser tests use a fresh stack and are unaffected.
- Other containers on that PC (`mdm-*`, `delivery_*`) belong to other projects; leave them alone.
