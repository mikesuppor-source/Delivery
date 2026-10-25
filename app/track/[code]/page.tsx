import { allRows } from '@/lib/pagination'
import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/server'
import { CustomerGpsShare } from '@/components/customer-gps-share'
import { formatUSD,formatDate,ORDER_STATUS_LABELS } from '@/lib/utils'
export const dynamic='force-dynamic'
export const metadata={title:'Delivery tracking',robots:{index:false,follow:false}}
export default async function TrackOrder({params}:{params:Promise<{code:string}>}){
 const {code}=await params
 if(!/^[a-f0-9]{64}$/.test(code))notFound()
 const db=createServiceClient()
 const {data:order}=await db.from('orders').select('id,code,status,collection_usd,created_at,delivered_at,recipient_address').eq('tracking_token',code).gt('created_at',new Date(Date.now()-30*86400000).toISOString()).maybeSingle()
 if(!order)notFound()
 const {data:events}=await allRows(db.from('order_events').select('new_status,created_at').eq('order_id',order.id).order('created_at'))
 return <main className="content" style={{maxWidth:600,margin:'40px auto'}}>
 <h1>Order {order.code}</h1><p>{ORDER_STATUS_LABELS[order.status]}</p><p>Cash due: {formatUSD(Number(order.collection_usd))}</p>
 <ol>{events?.map((event,i)=><li key={i}>{ORDER_STATUS_LABELS[event.new_status]} — {formatDate(event.created_at)}</li>)}</ol>
 {!['delivered','returned','cancelled'].includes(order.status)&&<CustomerGpsShare orderId={order.id} orderCode={code} />}
 <p>Contact your merchant for delivery assistance. Keep this link private.</p></main>
}
