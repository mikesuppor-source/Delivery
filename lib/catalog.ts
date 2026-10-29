import type { Database } from './supabase/database.types'
import { NextResponse, NextRequest } from 'next/server'
import { api,ApiError,checked,uuid } from './api'
import { authenticated,workspaceAccess,validateReferences } from './access'
import { driverPin,generateDriverPin } from './driver-session'
import { id,money,optionalId,parseBody,requiredText,text,z } from './validation'
// One schema covers shops, drivers and areas; each table only reads its own fields.
const CreateCatalog=z.object({
 workspaceId:id,name:requiredText(200),phone:text(40),address:text(1000),
 pinCode:z.string().optional(),userId:optionalId,feeUsd:money(),assignedDriverIds:z.array(z.unknown()).optional(),
 // Zone pricing (Phase 1): null means use the workspace default
 driverPayUsd:money().optional(),returnFeeUsd:money().optional(),returnDriverPayUsd:money().optional(),
 storageFeePerDayUsd:money().optional(),freeStorageDays:z.number().int().min(0).max(365).optional(),
})
const ChangeCatalog=z.object({
 workspaceId:id,id:id.optional(),areaId:id.optional(),
 name:requiredText(200).optional(),phone:text(40).optional(),address:text(1000).optional(),
 pinCode:z.string().optional(),resetPin:z.boolean().optional(),active:z.boolean().optional(),
 feeUsd:money().optional(),defaultDriverId:optionalId.optional(),assignedDriverIds:z.array(z.unknown()).optional(),
 // Zone pricing (Phase 1)
 driverPayUsd:money().optional(),returnFeeUsd:money().optional(),returnDriverPayUsd:money().optional(),
 storageFeePerDayUsd:money().optional(),freeStorageDays:z.number().int().min(0).max(365).optional(),
})
type Db=Awaited<ReturnType<typeof workspaceAccess>>['db']
// Area driver pools may only contain this workspace's couriers.
async function workspaceDriverIds(db:Db,workspaceId:string,value:unknown){
 if(!Array.isArray(value))throw new ApiError(400,'assignedDriverIds must be an array')
 const list=[...new Set(value.filter(Boolean).map(v=>uuid(v,'driver ID')))]
 if(list.length){
  const {data}=await db.from('drivers').select('id').eq('workspace_id',workspaceId).in('id',list)
  if((data||[]).length!==list.length)throw new ApiError(400,'Invalid drivers reference for this workspace')
 }
 return list
}
async function issuePin(db:Db,driverId:string,requested:unknown){
 const pin=requested?driverPin(requested):generateDriverPin()
 checked(await db.rpc('set_driver_pin',{p_driver:driverId,p_pin:pin}))
 return pin
}
type Table='shops'|'drivers'|'delivery_areas'
export function createCatalog(table:Table) {
 return api(async req=>{
  const body=await parseBody(req,CreateCatalog)
  const {db,workspaceId}=await workspaceAccess(body.workspaceId)
  const row:Record<string,unknown>={workspace_id:workspaceId,name:body.name}
  if(table==='delivery_areas'){
   row.fee_usd=body.feeUsd
   if(body.driverPayUsd!==undefined)row.driver_pay_usd=body.driverPayUsd
   if(body.returnFeeUsd!==undefined)row.return_fee_usd=body.returnFeeUsd
   if(body.returnDriverPayUsd!==undefined)row.return_driver_pay_usd=body.returnDriverPayUsd
   if(body.storageFeePerDayUsd!==undefined)row.storage_fee_per_day_usd=body.storageFeePerDayUsd
   if(body.freeStorageDays!==undefined)row.free_storage_days=body.freeStorageDays
   if(body.assignedDriverIds){
    const cleanDriverIds = await workspaceDriverIds(db,workspaceId,body.assignedDriverIds)
    row.assigned_driver_ids = cleanDriverIds
    if(!row.default_driver_id && cleanDriverIds.length > 0) {
      row.default_driver_id = cleanDriverIds[0]
    }
   }
  }
  else row.phone=body.phone
  if(table==='shops')row.address=body.address
  // Validate the PIN before creating the courier so a weak PIN never leaves a half-made record
  if(table==='drivers'&&body.pinCode)driverPin(body.pinCode)
  if(table==='drivers'&&body.userId){
   const member=checked(await db.from('workspace_members').select('id').eq('workspace_id',workspaceId).eq('user_id',body.userId).eq('role','driver').maybeSingle())
   if(!member)throw new ApiError(400,'Select an invited driver in this workspace')
   row.user_id=body.userId
  }
  const record=checked(await db.from(table as 'shops').insert(row as Database['public']['Tables']['shops']['Insert']).select().single())
  if(table==='drivers'){
   // The PIN is returned once so dispatch can hand it over; only its hash is stored.
   const pin=await issuePin(db,record.id,body.pinCode)
   return NextResponse.json({success:true,driver:{...record,has_pin:true},pin})
  }
  return NextResponse.json({success:true,[table==='delivery_areas'?'area':table.slice(0,-1)]:record})
 })
}
export async function changeCatalog(req:NextRequest,table:Table,recordId?:string) {
 const body=await parseBody(req,ChangeCatalog)
 const target=uuid(recordId||body.areaId||body.id)
 const {db,workspaceId}=await workspaceAccess(body.workspaceId)
 const updates:Record<string,unknown>={}
 if(req.method==='DELETE')updates.active=false
 else{
  if(body.name!==undefined)updates.name=body.name
  if(body.phone!==undefined)updates.phone=body.phone
  if(body.address!==undefined)updates.address=body.address
  if(table==='drivers'&&body.pinCode)driverPin(body.pinCode)
  if(body.active!==undefined)updates.active=body.active
  if(table==='delivery_areas'){
   if(body.feeUsd!==undefined)updates.fee_usd=body.feeUsd
   if(body.driverPayUsd!==undefined)updates.driver_pay_usd=body.driverPayUsd
   if(body.returnFeeUsd!==undefined)updates.return_fee_usd=body.returnFeeUsd
   if(body.returnDriverPayUsd!==undefined)updates.return_driver_pay_usd=body.returnDriverPayUsd
   if(body.storageFeePerDayUsd!==undefined)updates.storage_fee_per_day_usd=body.storageFeePerDayUsd
   if(body.freeStorageDays!==undefined)updates.free_storage_days=body.freeStorageDays
   if(body.defaultDriverId!==undefined){
    await validateReferences(db,workspaceId,{drivers:body.defaultDriverId})
    updates.default_driver_id=body.defaultDriverId
   }
   if(body.assignedDriverIds!==undefined){
    const validDriverIds = await workspaceDriverIds(db,workspaceId,body.assignedDriverIds)
    updates.assigned_driver_ids = validDriverIds
    if(validDriverIds.length > 0 && !updates.default_driver_id){
      updates.default_driver_id = validDriverIds[0]
    } else if(validDriverIds.length === 0){
      updates.default_driver_id = null
    }
   }
  }
 }
 const record=checked(await (Object.keys(updates).length
  ? db.from(table as 'shops').update(updates as Database['public']['Tables']['shops']['Update']).eq('id',target).eq('workspace_id',workspaceId).select().maybeSingle()
  : db.from(table as 'shops').select().eq('id',target).eq('workspace_id',workspaceId).maybeSingle()))
 if(!record)throw new ApiError(404,'Record not found')
 if(table==='drivers'&&req.method!=='DELETE'&&(body.pinCode||body.resetPin)){
  // Setting a new PIN also signs the courier out of every device.
  const pin=await issuePin(db,record.id,body.pinCode)
  return NextResponse.json({success:true,driver:{...record,has_pin:true},pin})
 }
 return NextResponse.json({success:true,[table==='delivery_areas'?'area':table.slice(0,-1)]:record,message:req.method==='DELETE'?'Archived; historical records retained':undefined})
}
export async function readCatalog(table:Table,id:string){
 const {client}=await authenticated()
 const record=checked(await client.from(table as 'shops').select('*').eq('id',uuid(id)).maybeSingle())
 if(!record)throw new ApiError(404,'Record not found')
 return NextResponse.json({[table.slice(0,-1)]:record})
}
