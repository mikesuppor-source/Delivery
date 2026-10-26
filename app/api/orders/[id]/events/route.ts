import { NextResponse } from 'next/server'
import { api, uuid } from '@/lib/api'
import { createClient } from '@/lib/supabase/server'

interface Context {
  params: Promise<{ id: string }>
}

export const GET = api(async (req, ctx) => {
  const { id } = await (ctx as Context).params
  const orderId = uuid(id)
  const db = await createClient()

  const { data: events, error } = await db
    .from('order_events')
    .select('id, old_status, new_status, created_at')
    .eq('order_id', orderId)
    .order('created_at', { ascending: true })

  if (error) {
    return NextResponse.json({ success: false, events: [] })
  }

  return NextResponse.json({ success: true, events: events || [] })
})
