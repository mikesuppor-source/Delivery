import { api } from '@/lib/api'
import { createCatalog,changeCatalog } from '@/lib/catalog'
export const POST=createCatalog('delivery_areas')
export const PATCH=api(req=>changeCatalog(req,'delivery_areas'))
export const DELETE=PATCH
