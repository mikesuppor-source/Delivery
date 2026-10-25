import type { Database } from './supabase/database.types'
import { NextResponse, NextRequest } from 'next/server'
import { api,ApiError,checked,money,textField,uuid } from './api'
import { authenticated,workspaceAccess,validateReferences } from './access'
type Table='shops'|'drivers'|'delivery_areas'
export function createCatalog(table:Table) {
 return api(async req=>{
  const body=await req.json()
  const {db,workspaceId}=await workspaceAccess(body.workspaceId)
  const row:Record<string,unknown>={workspace_id:workspaceId,name:textField(body.name,'name',200,true)}
  if(table==='delivery_areas')row.fee_usd=money(body.feeUsd,'fee')
  else row.phone=textField(body.phone,'phone',40)
  if(table==='shops')row.address=textField(body.address,'address',1000)
  if(table==='drivers'&&body.userId){
   const member=checked(await db.from('workspace_members').select('id').eq('workspace_id',workspaceId).eq('user_id',uuid(body.userId)).eq('role','driver').maybeSingle())
   if(!member)throw new ApiError(400,'Select an invited driver in this workspace')
   row.user_id=body.userId
  }
  const record=checked(await db.from(table as 'shops').insert(row as Database['public']['Tables']['shops']['Insert']).select().single())
  return NextResponse.json({success:true,[table==='delivery_areas'?'area':table.slice(0,-1)]:record})
 })
}
export async function changeCatalog(req:NextRequest,table:Table,id?:string) {
 const body=await req.json()
 const target=uuid(id||body.areaId||body.id)
 const {db,workspaceId}=await workspaceAccess(body.workspaceId)
 const updates:Record<string,unknown>={}
 if(req.method==='DELETE')updates.active=false
 else{
  if(body.name!==undefined)updates.name=textField(body.name,'name',200,true)
  if(body.phone!==undefined)updates.phone=textField(body.phone,'phone',40)
  if(body.address!==undefined)updates.address=textField(body.address,'address',1000)
  if(body.active!==undefined){
   if(typeof body.active!=='boolean')throw new ApiError(400,'Invalid active flag')
   updates.active=body.active
  }
  if(table==='delivery_areas'){
   if(body.feeUsd!==undefined)updates.fee_usd=money(body.feeUsd,'fee')
   if(body.defaultDriverId!==undefined){
    await validateReferences(db,workspaceId,{drivers:body.defaultDriverId})
    updates.default_driver_id=body.defaultDriverId||null
   }
  }
 }
 const record=checked(await db.from(table as 'shops').update(updates as Database['public']['Tables']['shops']['Update']).eq('id',target).eq('workspace_id',workspaceId).select().maybeSingle())
 if(!record)throw new ApiError(404,'Record not found')
 return NextResponse.json({success:true,[table==='delivery_areas'?'area':table.slice(0,-1)]:record,message:req.method==='DELETE'?'Archived; historical records retained':undefined})
}
export async function readCatalog(table:Table,id:string){
 const {client}=await authenticated()
 const record=checked(await client.from(table as 'shops').select('*').eq('id',uuid(id)).maybeSingle())
 if(!record)throw new ApiError(404,'Record not found')
 return NextResponse.json({[table.slice(0,-1)]:record})
}
