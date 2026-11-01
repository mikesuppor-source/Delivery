import QRCode from 'qrcode'
import { createServiceClient } from '@/lib/supabase/server'

/**
 * The customer's delivery code and its QR, shown only on their private tracking link while the parcel is on its way.
 * The courier asks for it at the door: it proves the customer was there and has the parcel.
 */
export async function DeliveryCodeCard({ orderId, orderCode }: { orderId: string; orderCode: string }) {
  const { data } = await createServiceClient().from('order_delivery_codes').select('code').eq('order_id', orderId).maybeSingle()
  if (!data) return null
  const qr = await QRCode.toDataURL(`CEDAR-DC:${orderCode}:${data.code}`, { margin: 1, width: 220 })
  return (
    <div
      data-testid="delivery-code-card"
      style={{ marginTop: 16, background: 'var(--surface)', border: '1.5px solid var(--brand)', borderRadius: 12, padding: '18px', textAlign: 'center' }}
    >
      <p style={{ margin: 0, fontSize: 12, fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase', color: 'var(--brand)' }}>Your delivery code · رمز التسليم</p>
      <div data-testid="delivery-code" style={{ margin: '8px 0', fontSize: 44, fontWeight: 800, letterSpacing: 10, fontFamily: 'monospace', color: 'var(--text)' }}>{data.code}</div>
      <img src={qr} alt="Delivery code QR" width={160} height={160} style={{ background: '#fff', borderRadius: 8, padding: 6 }} />
      <p style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>
        Give this code to the courier, or show the QR, <strong>only when you have your parcel in your hands</strong>. Do not share it before.
      </p>
      <p dir="rtl" style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>
        أعطِ هذا الرمز للسائق أو أظهر الرمز المربع <strong>فقط عند استلام الطرد بيدك</strong>، ولا تشاركه قبل ذلك.
      </p>
    </div>
  )
}
