import { NextResponse } from 'next/server'
import { api,ApiError,checked } from '@/lib/api'
import { createServiceClient } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rate-limit'
export const GET=api(async req=>{
 const token=new URL(req.url).searchParams.get('token')
 if(!token||!/^[a-f0-9]{64}$/.test(token))throw new ApiError(404,'Invalid invitation')
 await rateLimit('invite:'+token,20)
 const invite=checked(await createServiceClient().from('invitations').select('email,role,workspace_id,expires_at,accepted_at').eq('token',token).is('accepted_at',null).gt('expires_at',new Date().toISOString()).maybeSingle())
 return NextResponse.json({invitation:invite})
})
