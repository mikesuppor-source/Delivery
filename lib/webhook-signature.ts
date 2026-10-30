import { createHmac, timingSafeEqual } from 'node:crypto'

// Every webhook message carries "X-Cedar-Signature: t=<unix seconds>,v1=<hex>".
// v1 is HMAC-SHA256 of "<t>.<exact body>" with the shop's webhook secret. The time is part of what is signed, so a
// captured message cannot be replayed later: a receiver rejects any message older than the tolerance (5 minutes).
export function signWebhook(secret: string, body: string, timestampSeconds: number) {
  return `t=${timestampSeconds},v1=${createHmac('sha256', secret).update(`${timestampSeconds}.${body}`).digest('hex')}`
}

export function verifyWebhookSignature(
  secret: string,
  body: string,
  header: string,
  { nowSeconds = Math.floor(Date.now() / 1000), toleranceSeconds = 300 }: { nowSeconds?: number; toleranceSeconds?: number } = {},
) {
  const match = /^t=(\d{1,12}),v1=([0-9a-f]{64})$/.exec(header ?? '')
  if (!match) return false
  const timestamp = Number(match[1])
  if (Math.abs(nowSeconds - timestamp) > toleranceSeconds) return false
  const expected = Buffer.from(signWebhook(secret, body, timestamp).slice(-64), 'hex')
  const supplied = Buffer.from(match[2], 'hex')
  return expected.length === supplied.length && timingSafeEqual(expected, supplied)
}
