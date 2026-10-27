import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { DriverLoginClient } from './driver-login-client'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Courier Sign In | Cedar Delivery',
  description: 'Enter your phone number and PIN to access your daily run sheet.',
}

export const dynamic = 'force-dynamic'

export default async function DriverPortalIndexPage() {
  const userSupabase = await createClient()
  const { data: { user } } = await userSupabase.auth.getUser()

  const serviceSupabase = await createClient()

  // 1. If logged in via user account, check if user is directly linked to a driver
  if (user?.id) {
    const { data: linkedDriver } = await serviceSupabase
      .from('drivers')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (linkedDriver?.id) {
      redirect(`/driver/${linkedDriver.id}`)
    }
  }

  // 2. Persistent Mobile App Session: If this device already has a saved courier cookie, open directly!
  const cookieStore = await cookies()
  const savedDriverId = cookieStore.get('cedar_saved_driver_id')?.value
  if (savedDriverId) {
    const { data: savedDriver } = await serviceSupabase
      .from('drivers')
      .select('id')
      .eq('id', savedDriverId)
      .eq('active', true)
      .maybeSingle()

    if (savedDriver?.id) {
      redirect(`/driver/${savedDriver.id}`)
    }
  }

  // 3. If not yet signed in on this device, present the Courier Sign-In Screen
  return <DriverLoginClient />
}
