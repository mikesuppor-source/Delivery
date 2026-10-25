/** Fetch complete filtered reports in bounded database pages; never silently accept the API row cap. */
export async function allRows<T extends {data: unknown[] | null;error: unknown}>(query: PromiseLike<T> & {range:(start:number,end:number)=>PromiseLike<T>;order:(column:string)=>unknown}):Promise<T>{
 const rows:unknown[]=[]
 query.order('id')
 for(let start=0;;){
  const result=await query.range(start,start+499)
  if(result.error)throw new Error('Unable to load complete report')
  const batch=result.data||[]
  rows.push(...batch)
  if(batch.length===0)return {...result,data:rows} as T
  start+=batch.length
  // Continue to an empty page even if a deployment caps pages below 500.
 }
}
