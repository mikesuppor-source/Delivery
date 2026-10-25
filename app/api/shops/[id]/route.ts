import { api } from '@/lib/api'
import { changeCatalog,readCatalog } from '@/lib/catalog'
type Context={params:Promise<{id:string}>}
export const GET=api(async(_req,ctx:Context)=>readCatalog('shops',(await ctx.params).id))
export const PATCH=api(async(req,ctx:Context)=>changeCatalog(req,'shops',(await ctx.params).id))
export const DELETE=PATCH
