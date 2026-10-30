// Copies every file in every Supabase Storage bucket into a folder, plus a manifest.json that
// records each file's size and SHA-256, so a backup can be checked and restored later.
// Used by the nightly workflow (.github/workflows/backup.yml); it can also be run by hand:
//
//   BACKUP_SUPABASE_URL=https://<ref>.supabase.co BACKUP_SERVICE_ROLE_KEY=... \
//   node scripts/backup-storage.mjs <output folder>
//
// Local stack: the URL and key come from `npx supabase status -o env` (API_URL, SERVICE_ROLE_KEY).
// The output holds customer files (proof photos, signatures, receipts): never commit it, and
// encrypt it before it leaves your machine (the workflow does). Exit code 1 if anything fails.
import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const PAGE = 1000

async function listFiles(bucket, prefix = '') {
  const files = []
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await bucket.list(prefix, { limit: PAGE, offset, sortBy: { column: 'name', order: 'asc' } })
    if (error) throw new Error(`list "${prefix}": ${error.message}`)
    for (const entry of data) {
      const full = prefix ? `${prefix}/${entry.name}` : entry.name
      // Folders come back without an id; files have one
      if (entry.id) files.push({ path: full, contentType: entry.metadata?.mimetype ?? null })
      else files.push(...(await listFiles(bucket, full)))
    }
    if (data.length < PAGE) break
  }
  return files
}

function safeJoin(root, ...parts) {
  const target = path.resolve(root, ...parts)
  if (target !== root && !target.startsWith(root + path.sep)) throw new Error('refusing a path outside the output folder: ' + parts.join('/'))
  return target
}

async function backupStorage({ url, serviceKey, outDir }) {
  const client = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const root = path.resolve(outDir)
  await mkdir(root, { recursive: true })

  const { data: buckets, error } = await client.storage.listBuckets()
  if (error) throw new Error('could not list buckets: ' + error.message)

  const manifest = { createdAt: new Date().toISOString(), source: new URL(url).host, buckets: [], files: [] }
  const failures = []

  for (const info of buckets) {
    manifest.buckets.push({
      name: info.name,
      public: info.public,
      fileSizeLimit: info.file_size_limit ?? null,
      allowedMimeTypes: info.allowed_mime_types ?? null,
    })
    const bucket = client.storage.from(info.name)
    const files = await listFiles(bucket)
    let bytes = 0
    for (const file of files) {
      try {
        const { data, error: downloadError } = await bucket.download(file.path)
        if (downloadError) throw new Error(downloadError.message)
        const buffer = Buffer.from(await data.arrayBuffer())
        const target = safeJoin(root, 'files', info.name, file.path)
        await mkdir(path.dirname(target), { recursive: true })
        await writeFile(target, buffer)
        bytes += buffer.length
        manifest.files.push({
          bucket: info.name,
          path: file.path,
          contentType: file.contentType ?? data.type ?? null,
          bytes: buffer.length,
          sha256: createHash('sha256').update(buffer).digest('hex'),
        })
      } catch (err) {
        failures.push(`${info.name}/${file.path}: ${err.message}`)
      }
    }
    console.log(`bucket ${info.name}: ${files.length} files, ${bytes} bytes`)
  }

  manifest.failures = failures
  await writeFile(path.join(root, 'manifest.json'), JSON.stringify(manifest, null, 2))
  return manifest
}

{
  const url = process.env.BACKUP_SUPABASE_URL
  const serviceKey = process.env.BACKUP_SERVICE_ROLE_KEY
  const outDir = process.argv[2]
  if (!url || !serviceKey || !outDir) {
    console.error('Usage: BACKUP_SUPABASE_URL=... BACKUP_SERVICE_ROLE_KEY=... node scripts/backup-storage.mjs <output folder>')
    process.exit(2)
  }
  const manifest = await backupStorage({ url, serviceKey, outDir })
  console.log(`done: ${manifest.files.length} files in ${manifest.buckets.length} buckets from ${manifest.source}`)
  if (manifest.failures.length) {
    console.error(`${manifest.failures.length} file(s) could not be copied:\n` + manifest.failures.join('\n'))
    process.exit(1)
  }
}
