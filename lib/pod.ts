import { ApiError, checked } from './api'
import type { createServiceClient } from './supabase/server'
export async function savePod(db: ReturnType<typeof createServiceClient>, orderId: string, value: unknown, kind: string) {
  if(typeof value!=='string') throw new ApiError(400,'Invalid proof of delivery')
  const match=value.match(/^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/)
  if(!match) throw new ApiError(400,'Proof must be a PNG or JPEG image')
  const bytes=Buffer.from(match[2],'base64')
  if(bytes.length>1_000_000) throw new ApiError(413,'Proof image must be under 1 MB')
  if(match[1]==='png' ? bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a' : bytes[0]!==255||bytes[1]!==216) throw new ApiError(400,'Invalid image')
  const path=orderId+'/'+kind+'-'+crypto.randomUUID()+'.'+match[1]
  checked(await db.storage.from('delivery-proof').upload(path,bytes,{contentType:'image/'+match[1],upsert:false}))
  return path
}
