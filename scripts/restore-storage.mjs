// Restores a folder made by scripts/backup-storage.mjs into a Supabase project's Storage.
// Buckets that are missing are created with the settings saved in manifest.json. Files are
// checked against the manifest (size and SHA-256) before upload and read back after upload.
// A file that already exists is left alone if identical; if it differs the restore stops.
//
//   RESTORE_SUPABASE_URL=https://<ref>.supabase.co RESTORE_SERVICE_ROLE_KEY=... \
//   node scripts/restore-storage.mjs <backup folder> --target=<ref or localhost>
//
// --target must match the URL's host, so a stray variable cannot restore into the wrong
// project. Practise on the test project (cedar-staging) or the local stack, never on live
// unless the owner asks for it. Exit code 1 if anything fails.
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const sha256 = buffer => createHash('sha256').update(buffer).digest('hex')

const url = process.env.RESTORE_SUPABASE_URL
const serviceKey = process.env.RESTORE_SERVICE_ROLE_KEY
const dir = process.argv[2] && !process.argv[2].startsWith('--') ? path.resolve(process.argv[2]) : null
const target = process.argv.find(a => a.startsWith('--target='))?.slice('--target='.length)
if (!url || !serviceKey || !dir || !target) {
  console.error('Usage: RESTORE_SUPABASE_URL=... RESTORE_SERVICE_ROLE_KEY=... node scripts/restore-storage.mjs <backup folder> --target=<ref or localhost>')
  process.exit(2)
}
const host = new URL(url).hostname
if (host !== target && host !== `${target}.supabase.co`) {
  console.error(`--target=${target} does not match the URL host ${host}; nothing was changed.`)
  process.exit(2)
}

const manifest = JSON.parse(await readFile(path.join(dir, 'manifest.json'), 'utf8'))
if (manifest.failures?.length) {
  console.error(`This backup is incomplete (${manifest.failures.length} file(s) failed when it was made); refusing to restore it.`)
  process.exit(2)
}
console.log(`restoring ${manifest.files.length} files from a backup of ${manifest.source} (${manifest.createdAt}) into ${host}`)

const client = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
const { data: existing, error: listError } = await client.storage.listBuckets()
if (listError) throw new Error('could not list buckets: ' + listError.message)
const have = new Set(existing.map(b => b.name))

for (const b of manifest.buckets) {
  if (have.has(b.name)) continue
  const { error } = await client.storage.createBucket(b.name, {
    public: b.public,
    fileSizeLimit: b.fileSizeLimit ?? undefined,
    allowedMimeTypes: b.allowedMimeTypes ?? undefined,
  })
  if (error) throw new Error(`could not create bucket ${b.name}: ${error.message}`)
  console.log(`created bucket ${b.name} (${b.public ? 'public' : 'private'})`)
}

let uploaded = 0
let unchanged = 0
const problems = []
for (const file of manifest.files) {
  const label = `${file.bucket}/${file.path}`
  try {
    const buffer = await readFile(path.join(dir, 'files', file.bucket, ...file.path.split('/')))
    if (buffer.length !== file.bytes || sha256(buffer) !== file.sha256) throw new Error('backup copy does not match the manifest')
    const bucket = client.storage.from(file.bucket)
    const { data: current } = await bucket.download(file.path)
    if (current) {
      if (sha256(Buffer.from(await current.arrayBuffer())) !== file.sha256) throw new Error('a different file already exists there; not overwriting')
      unchanged++
      continue
    }
    const { error } = await bucket.upload(file.path, buffer, { contentType: file.contentType ?? undefined, upsert: false })
    if (error) throw new Error(error.message)
    const { data: back, error: backError } = await bucket.download(file.path)
    if (backError || sha256(Buffer.from(await back.arrayBuffer())) !== file.sha256) throw new Error('read-back check failed')
    uploaded++
  } catch (err) {
    problems.push(`${label}: ${err.message}`)
  }
}
console.log(`done: ${uploaded} uploaded, ${unchanged} already identical, ${problems.length} problem(s)`)
if (problems.length) {
  console.error(problems.join('\n'))
  process.exit(1)
}
