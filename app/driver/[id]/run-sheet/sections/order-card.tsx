'use client'

import Link from 'next/link'
import { WhatsAppIcon } from '@/components/whatsapp-icon'
import { GoogleMapsIcon } from '@/components/google-maps-icon'
import { PackageIcon, CheckIcon, PhoneIcon, NavigationIcon } from '@/components/icons'
import { ActionTile, ActionTiles, Button, Callout, Card, SoftLink, StatusChip, Tag } from '@/components/ui'
import { formatUSD, formatLBP, usdToLbp, formatDate } from '@/lib/utils'
import { getGoogleMapsDirectionsUrl, getWazeDirectionsUrl, parseLocation, formatDisplayAddress, calculateDistanceKm, formatDistance } from '@/lib/maps'
import { buildCourierToCustomerMessage, getWhatsAppUrl } from '@/lib/whatsapp'
import { resolveOrderCoordinates, type DriverRunSheetOrder } from '../shared'
import { useRunSheet } from '../context'

export function OrderCard({
  order,
  idx,
  isFirst,
  isLast,
}: {
  order: DriverRunSheetOrder
  idx: number
  isFirst?: boolean
  isLast?: boolean
}) {
  const {
    driver,
    driverGps,
    getStatusLabel,
    handleUpdateStatus,
    handleMoveOrderPosition,
    lang,
    offlineQueue,
    rate,
    setFailModalOrder,
    setPodModalOrder,
    setViewPodOrder,
    setReturnHandoverOrder,
    t,
    updatingId,
  } = useRunSheet()
  const ar = lang === 'ar'
  const isUpdating = updatingId === order.id
  const parsedLoc = parseLocation(order.recipient_address)
  const orderCoords = resolveOrderCoordinates(order)
  const distanceKm = driverGps && orderCoords ? calculateDistanceKm(driverGps.lat, driverGps.lng, orderCoords.lat, orderCoords.lng) : null
  const orderRate = order.usd_to_lbp_rate || rate
  const cod = Number(order.collection_usd || 0)
  const isDelivered = order.status === 'delivered'
  const isFailed = order.status === 'failed' || order.status === 'returned'
  const phone = order.recipient_phone
  const customer = order.recipient_name || (ar ? 'العميل الكريم' : 'Customer')

  return (
    <Card tone={isDelivered ? 'success' : isFailed ? 'danger' : 'default'}>
      {/* Stop number, tracking code and status */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span
            aria-label={isDelivered ? 'Delivered' : 'Stop ' + (idx + 1)}
            style={{
              width: 26,
              height: 26,
              flexShrink: 0,
              borderRadius: '50%',
              background: isDelivered ? '#059669' : '#3b82f6',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12,
              fontWeight: 800,
            }}
          >
            {isDelivered ? '✓' : idx + 1}
          </span>
          {!isDelivered && !isFailed && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {!isFirst && (
                <button
                  type="button"
                  onClick={() => handleMoveOrderPosition(order.id, 'up')}
                  style={{
                    background: '#1e293b',
                    border: '1px solid #334155',
                    color: '#94a3b8',
                    borderRadius: 3,
                    padding: '0 4px',
                    fontSize: 8,
                    lineHeight: '10px',
                    cursor: 'pointer',
                  }}
                  title="Move stop earlier"
                >
                  ▲
                </button>
              )}
              {!isLast && (
                <button
                  type="button"
                  onClick={() => handleMoveOrderPosition(order.id, 'down')}
                  style={{
                    background: '#1e293b',
                    border: '1px solid #334155',
                    color: '#94a3b8',
                    borderRadius: 3,
                    padding: '0 4px',
                    fontSize: 8,
                    lineHeight: '10px',
                    cursor: 'pointer',
                  }}
                  title="Move stop later"
                >
                  ▼
                </button>
              )}
            </div>
          )}
          <Link
            href={`/track/${order.tracking_token || order.code}`}
            target="_blank"
            rel="noopener noreferrer"
            style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 800, color: '#38bdf8', textDecoration: 'none' }}
            title="View live public tracking"
          >
            #{order.code} ↗
          </Link>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {offlineQueue.some(q => q.orderId === order.id) && <Tag tone="warning">{t('pendingSync')}</Tag>}
          <StatusChip status={order.status}>{getStatusLabel(order.status)}</StatusChip>
        </div>
      </div>

      {order.service_type === 'replacement' && <Callout tone="warning" title={t('replacementTitle')}>{t('replacementDesc')}</Callout>}
      {order.service_type === 'pickup' && <Callout tone="purple" title={t('returnPickupTitle')}>{t('returnPickupDesc')}</Callout>}

      {/* Customer, shop, area and address */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
          <strong style={{ fontSize: 15, color: '#f8fafc' }}>{order.recipient_name || 'Customer'}</strong>
          <span style={{ fontSize: 12, color: '#94a3b8' }}>{order.shop?.name || 'Store'}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
          {order.area && <Tag tone="info">{order.area.name}</Tag>}
          {order.is_breakable && (
            <Tag tone="danger" title="Fragile / Breakable Content">
              {t('fragile')}
            </Tag>
          )}
          {order.weight_kg && order.weight_kg > 1 && <Tag tone="neutral">{order.weight_kg}kg</Tag>}
          {parsedLoc.isCoords && <Tag tone="success">GPS Pin</Tag>}
          {distanceKm !== null && (
            <Tag tone="success-soft">
              <NavigationIcon size={10} color="#34d399" />
              {formatDistance(distanceKm)}
            </Tag>
          )}
        </div>
        <div style={{ fontSize: 12.5, color: '#cbd5e1', marginTop: 4, lineHeight: 1.4 }}>{formatDisplayAddress(order.recipient_address)}</div>
        {order.notes && (
          <Callout tone="note">
            {t('notes')}: {order.notes}
          </Callout>
        )}
      </div>

      {/* Cash to collect */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'rgba(0,0,0,0.3)',
          padding: '8px 12px',
          borderRadius: 8,
          marginBottom: 12,
        }}
      >
        <div>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>{t('cod')}</span>
          <div style={{ fontSize: 18, fontWeight: 900, color: '#10b981' }}>{formatUSD(cod)}</div>
        </div>
        <div style={{ textAlign: 'end' }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>{t('inLbp')}</span>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#cbd5e1' }}>{formatLBP(usdToLbp(cod, orderRate))}</div>
        </div>
      </div>

      {/* Navigate and contact */}
      <ActionTiles>
        <ActionTile
          tone="waze"
          href={getWazeDirectionsUrl(order.recipient_address)}
          target="_blank"
          rel="noopener noreferrer"
          title="Navigate with Waze"
          icon={<NavigationIcon size={12} color="#ffffff" />}
          label={t('waze')}
        />
        <ActionTile
          tone="maps"
          href={getGoogleMapsDirectionsUrl(order.recipient_address)}
          target="_blank"
          rel="noopener noreferrer"
          title="Navigate with Google Maps"
          icon={<GoogleMapsIcon size={12} />}
          label={t('maps')}
        />
        <ActionTile
          tone="whatsapp"
          href={
            phone
              ? getWhatsAppUrl(
                  phone,
                  buildCourierToCustomerMessage(
                    {
                      code: order.code,
                      tracking_token: order.tracking_token,
                      recipient_name: order.recipient_name,
                      recipient_address: order.recipient_address,
                      collection_usd: cod,
                      usd_to_lbp_rate: rate,
                      shop: order.shop,
                      driverName: driver.name,
                    },
                    lang
                  )
                )
              : undefined
          }
          target="_blank"
          rel="noopener noreferrer"
          title={ar ? 'إرسال إشعار على واتساب' : 'Notify Customer on WhatsApp'}
          icon={<WhatsAppIcon size={12} color={phone ? '#ffffff' : '#64748b'} />}
          label={phone ? t('onTheWay') : '-'}
        />
        <ActionTile
          tone="neutral"
          href={phone ? `tel:${phone}` : undefined}
          title="Call Customer"
          icon={<PhoneIcon size={12} color={phone ? '#f8fafc' : '#64748b'} />}
          label={phone ? t('call') : '-'}
        />
      </ActionTiles>

      {/* Ready-made WhatsApp messages */}
      {phone && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          <SoftLink
            tone="green"
            href={getWhatsAppUrl(
              phone,
              ar
                ? `مرحباً ${customer}! معكم سائق التوصيل لطلبك #${order.code} من متجر ${order.shop?.name || ''}. يرجى إرسال موقعك المباشر (WhatsApp Location Pin) لنصلك بأسرع وقت.`
                : `Hello ${customer}! I am your Cedar courier with delivery #${order.code} from ${order.shop?.name || 'our store'}. Could you please send me your WhatsApp location pin to reach you quickly?`
            )}
            target="_blank"
            rel="noopener noreferrer"
            title={ar ? 'طلب اللوكيشن عبر واتساب' : 'Request location pin on WhatsApp'}
          >
            <WhatsAppIcon size={12} color="#4ade80" />
            <span>{t('askPin')}</span>
          </SoftLink>
          <SoftLink
            tone="blue"
            href={getWhatsAppUrl(
              phone,
              ar
                ? `مرحباً ${customer}! أنا بالخارج الآن لتسليم طلبك #${order.code}. المبلغ المطلوب (COD): ${formatUSD(cod)} (~ ${formatLBP(usdToLbp(cod, rate))}). يرجى الاستلام.`
                : `Hello ${customer}! I have arrived outside with your package #${order.code}. COD total: ${formatUSD(cod)} (${formatLBP(usdToLbp(cod, rate))}). Please meet me outside.`
            )}
            target="_blank"
            rel="noopener noreferrer"
            title={ar ? 'إشعار بالوصول خارج المبنى' : 'Notify customer you have arrived'}
          >
            <span>{t('arrivedOutside')}</span>
          </SoftLink>
        </div>
      )}

      {/* Next step for this delivery */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {order.status === 'assigned' && (
          <Button size="lg" grow disabled={isUpdating} onClick={() => handleUpdateStatus(order.id, 'picked_up')}>
            <PackageIcon size={14} color="#fff" />
            <span>{isUpdating ? (ar ? 'جارِ التحديث…' : 'Updating…') : ar ? 'استلام من المتجر' : 'Pick Up from Store'}</span>
          </Button>
        )}

        {order.status === 'picked_up' && (
          <>
            <Button variant="success" size="lg" style={{ flex: 2 }} disabled={isUpdating} onClick={() => setPodModalOrder(order)}>
              <CheckIcon size={14} color="#fff" />
              <span>
                {isUpdating
                  ? ar ? 'جارِ الحفظ…' : 'Saving…'
                  : ar ? `تأكيد التسليم والتوقيع ($${cod.toFixed(2)})` : `Delivered & POD ($${cod.toFixed(2)})`}
              </span>
            </Button>
            <Button variant="alert" size="lg" grow disabled={isUpdating} onClick={() => setFailModalOrder(order)}>
              {ar ? '✕ مشكلة / تأجيل' : '✕ Reschedule'}
            </Button>
          </>
        )}

        {isDelivered && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', flexWrap: 'wrap', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, color: '#6ee7b7', fontWeight: 700 }}>
                {ar
                  ? `✓ تم التوصيل في ${order.delivered_at ? formatDate(order.delivered_at) : 'اليوم'}`
                  : `✓ Delivered on ${order.delivered_at ? formatDate(order.delivered_at) : 'Today'}`}
              </span>
              {(order.pod_signature || order.pod_photo) && (
                <Button variant="on" size="sm" onClick={() => setViewPodOrder(order)}>
                  {t('viewPod')}
                </Button>
              )}
            </div>
            {/* Couriers cannot undo a delivery (it reverses the cash records); dispatch can */}
            <span style={{ fontSize: 11, color: '#94a3b8' }}>{ar ? 'خطأ؟ اطلب من الإدارة التعديل' : 'Mistake? Ask dispatch to undo'}</span>
          </div>
        )}

        {isFailed && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: 8, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, color: '#fca5a5', fontWeight: 700 }}>
                {order.status === 'returned' ? (ar ? 'تم الإرجاع للمتجر' : 'Returned') : ar ? 'تمت المحاولة / مؤجل' : 'Attempted / Postponed'}
              </span>
              {order.status === 'returned' && (
                order.returns_handed_at ? (
                  <span
                    style={{
                      background: 'rgba(16, 185, 129, 0.15)',
                      color: '#10b981',
                      border: '1px solid #059669',
                      borderRadius: 4,
                      padding: '1px 6px',
                      fontSize: 10,
                      fontWeight: 700,
                    }}
                  >
                    {ar ? '✓ تم التسليم للمتجر' : '✓ Handed to Shop'}
                  </span>
                ) : (
                  <span
                    style={{
                      background: 'rgba(245, 158, 11, 0.15)',
                      color: '#fbbf24',
                      border: '1px solid #d97706',
                      borderRadius: 4,
                      padding: '1px 6px',
                      fontSize: 10,
                      fontWeight: 700,
                    }}
                  >
                    {ar ? '⏳ بانتظار التسليم للمتجر' : '⏳ Waiting Shop Handover'}
                  </span>
                )
              )}
            </div>
            {/* Only failed attempts can be retried; returned parcels can be handed over to shop */}
            {order.status === 'failed' && (
              <Button size="sm" disabled={isUpdating} onClick={() => handleUpdateStatus(order.id, 'picked_up')}>
                {ar ? 'إعادة المحاولة' : 'Retry Delivery'}
              </Button>
            )}
            {order.status === 'returned' && !order.returns_handed_at && (
              <Button size="sm" variant="success" disabled={isUpdating} onClick={() => setReturnHandoverOrder(order)}>
                {ar ? '✍️ تسليم للمتجر وتوقيع' : '✍️ Handover & Sign'}
              </Button>
            )}
          </div>
        )}
      </div>
    </Card>
  )
}
