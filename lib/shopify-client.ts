export async function syncShopify(shopId:string){
 let cursor:string|null=null, imported=0, failed=0
 const seen=new Set<string>()
 do{
  if(cursor && seen.has(cursor))throw new Error('Shopify repeated a page cursor. Please retry.')
  if(cursor)seen.add(cursor)
  const response: Response = await fetch('/api/shops/shopify/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ shopId, cursor }),
  })
  const data: any = await response.json()
  if(!response.ok)throw new Error(data.error||'Sync failed')
  imported+=data.importedCount||0;failed+=data.failures?.length||0
  cursor=data.nextCursor||null
 }while(cursor)
 if(failed)throw new Error(imported+' orders imported; '+failed+' orders need review. Check currency/payment data and retry; existing orders will not be duplicated.')
 return {importedCount:imported,message:imported+' new orders imported across all pages'}
}
