'use client'

import React from 'react'
import Link from 'next/link'
import { useI18n } from '@/lib/i18n'
import { KpiCard, StatusBadge, MoneyText } from '@/components/ui'
import { WhatsAppIcon } from '@/components/whatsapp-icon'
import { getWhatsAppUrl, buildCustomerOrderMessage } from '@/lib/whatsapp'
import { GoogleMapsIcon } from '@/components/google-maps-icon'
import { getGoogleMapsDirectionsUrl } from '@/lib/maps'

export interface DashboardClientProps {
  workspace: {
    id: string
    name: string
    usd_to_lbp: number
  }
  userRole: string
  kpis: {
    todayNewOrders: number
    todayDelivered: number
    todaySuccessRate: number
    todayOnTimeRate: number
    cashWithCouriersUsd: number
    cashWithCouriersLbp: number
    todayProfitUsd: number
  }
  attention: {
    unassignedCount: number
    stuckTransitCount: number
    failedAttemptsCount: number
    pendingCashoutsCount: number
    overdueHoldsCount?: number
    inStorageCount?: number
  }
  couriersNow: Array<{
    id: string
    name: string
    phone: string
    status: 'on_route' | 'idle' | 'offline'
    ordersInHand: number
    cashHeldUsd: number
    lastActiveText: string
  }>
  chartData: {
    days: Array<{ date: string; label: string; count: number; isToday: boolean }>
    zones: Array<{ name: string; count: number; percentage: number }>
  }
  recentOrders: Array<{
    id: string
    code: string
    tracking_token: string | null
    recipient_name: string
    recipient_phone: string
    recipient_address: string
    status: string
    collection_usd: number
    usd_to_lbp_rate: number
    shop?: { name: string } | null
    driver?: { name: string } | null
  }>
}

export function DashboardClient({
  workspace,
  userRole,
  kpis,
  attention,
  couriersNow,
  chartData,
  recentOrders,
}: DashboardClientProps) {
  const { t } = useI18n()
  const canManage = userRole === 'owner' || userRole === 'manager'

  const totalAttentionCount =
    attention.unassignedCount +
    attention.stuckTransitCount +
    attention.failedAttemptsCount +
    attention.pendingCashoutsCount +
    (attention.overdueHoldsCount || 0)

  const maxDayCount = Math.max(1, ...chartData.days.map(d => d.count))

  return (
    <div className="content" style={{ padding: '24px 32px' }}>
      {/* ─── Page Header ─────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 16,
          marginBottom: 24,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: 'var(--ui-primary)',
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              marginBottom: 4,
            }}
          >
            {t('dashHeading')}
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--ui-text)', margin: 0 }}>
            {workspace.name}
          </h1>
          <p style={{ fontSize: 13, color: 'var(--ui-text-muted)', margin: '4px 0 0' }}>
            {t('dashSubheading')}
          </p>
        </div>

        {canManage && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Link href="/scan" className="ui-btn ui-btn--neutral ui-btn--sm">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />
                <line x1="7" y1="12" x2="17" y2="12" />
              </svg>
              <span>{t('navScan')}</span>
            </Link>
            <Link href="/orders/new" className="ui-btn ui-btn--primary ui-btn--sm">
              <span>＋</span>
              <span>{t('actionNewOrder')}</span>
            </Link>
          </div>
        )}
      </div>

      {/* ─── Today's 6 KPI Cards ─────────────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 14,
          marginBottom: 24,
        }}
      >
        <KpiCard
          title={t('dashNewOrdersToday')}
          value={kpis.todayNewOrders}
          subtext="Orders created today"
          icon="📦"
        />
        <KpiCard
          title={t('dashDeliveredToday')}
          value={kpis.todayDelivered}
          subtext="Successfully delivered"
          icon="✓"
          tone="success"
        />
        <KpiCard
          title={t('dashSuccessRate')}
          value={`${kpis.todaySuccessRate}%`}
          subtext="Delivered vs closed"
          icon="🎯"
        />
        <KpiCard
          title={t('dashOnTimeRate')}
          value={`${kpis.todayOnTimeRate}%`}
          subtext="Within dispatch SLAs"
          icon="⏱"
        />
        <KpiCard
          title={t('dashCashWithCouriers')}
          value={<MoneyText amount={kpis.cashWithCouriersUsd} size="lg" />}
          subtext={
            kpis.cashWithCouriersLbp > 0 ? (
              <MoneyText amount={kpis.cashWithCouriersLbp} currency="LBP" size="sm" />
            ) : (
              'Unremitted cash in pouches'
            )
          }
          icon="💵"
          tone="warning"
        />
        {canManage && (
          <KpiCard
            title={t('dashTodayProfit')}
            value={<MoneyText amount={kpis.todayProfitUsd} size="lg" highlightPositive />}
            subtext="Customer fees − courier pay"
            icon="📈"
            tone="primary"
          />
        )}
      </div>

      {/* ─── Needs Attention Action Center ────────────────────────── */}
      {totalAttentionCount > 0 ? (
        <div
          style={{
            background: 'var(--ui-surface)',
            border: '1.5px solid var(--ui-warning)',
            borderRadius: 'var(--ui-radius)',
            padding: '16px 20px',
            marginBottom: 24,
            boxShadow: 'var(--ui-shadow-card)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 18 }}>⚠️</span>
              <h2 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: 'var(--ui-text)' }}>
                {t('dashNeedsAttention')} ({totalAttentionCount})
              </h2>
            </div>
            <Link href="/orders" className="ui-btn ui-btn--subtle ui-btn--sm">
              Open Orders Desk →
            </Link>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
            {attention.unassignedCount > 0 && (
              <Link
                href="/orders?status=pending"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  background: 'var(--ui-surface-2)',
                  border: '1px solid var(--ui-border)',
                  borderRadius: 'var(--ui-radius-sm)',
                  textDecoration: 'none',
                  color: 'var(--ui-text)',
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                <span>{attention.unassignedCount} {t('dashUnassignedAlert')}</span>
                <span className="ui-btn ui-btn--primary ui-btn--sm" style={{ padding: '3px 8px', fontSize: 11 }}>
                  Assign
                </span>
              </Link>
            )}

            {attention.stuckTransitCount > 0 && (
              <Link
                href="/orders?status=assigned,picked_up"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  background: 'var(--ui-surface-2)',
                  border: '1px solid var(--ui-border)',
                  borderRadius: 'var(--ui-radius-sm)',
                  textDecoration: 'none',
                  color: 'var(--ui-text)',
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                <span>{attention.stuckTransitCount} {t('dashStuckOrdersAlert')}</span>
                <span className="ui-btn ui-btn--neutral ui-btn--sm" style={{ padding: '3px 8px', fontSize: 11 }}>
                  Review
                </span>
              </Link>
            )}

            {attention.failedAttemptsCount > 0 && (
              <Link
                href="/orders?status=failed"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  background: 'var(--ui-surface-2)',
                  border: '1px solid var(--ui-border)',
                  borderRadius: 'var(--ui-radius-sm)',
                  textDecoration: 'none',
                  color: 'var(--ui-text)',
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                <span>{attention.failedAttemptsCount} {t('dashFailedAlert')}</span>
                <span className="ui-btn ui-btn--warning ui-btn--sm" style={{ padding: '3px 8px', fontSize: 11 }}>
                  Retry
                </span>
              </Link>
            )}

            {attention.pendingCashoutsCount > 0 && (
              <Link
                href="/statements"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  background: 'var(--ui-surface-2)',
                  border: '1px solid var(--ui-border)',
                  borderRadius: 'var(--ui-radius-sm)',
                  textDecoration: 'none',
                  color: 'var(--ui-text)',
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                <span>{attention.pendingCashoutsCount} {t('dashCashoutAlert')}</span>
                <span className="ui-btn ui-btn--neutral ui-btn--sm" style={{ padding: '3px 8px', fontSize: 11 }}>
                  Payout
                </span>
              </Link>
            )}

            {(attention.overdueHoldsCount ?? 0) > 0 && (
              <Link
                href="/warehouse"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '10px 14px',
                  background: 'var(--ui-surface-2)',
                  border: '1px solid var(--ui-border)',
                  borderRadius: 'var(--ui-radius-sm)',
                  textDecoration: 'none',
                  color: 'var(--ui-text)',
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                <span>{attention.overdueHoldsCount} parcels in warehouse ready or overdue</span>
                <span className="ui-btn ui-btn--warning ui-btn--sm" style={{ padding: '3px 8px', fontSize: 11 }}>
                  Release
                </span>
              </Link>
            )}
          </div>
        </div>
      ) : (
        <div
          style={{
            background: 'var(--ui-surface)',
            border: '1px solid var(--ui-border)',
            borderRadius: 'var(--ui-radius)',
            padding: '12px 18px',
            marginBottom: 24,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontSize: 13,
            color: 'var(--ui-text-muted)',
          }}
        >
          <span style={{ color: 'var(--ui-success)' }}>✓</span>
          <span>{t('dashNoAlerts')}</span>
        </div>
      )}

      {/* ─── Couriers Now Grid ───────────────────────────────────── */}
      <div
        style={{
          background: 'var(--ui-surface)',
          border: '1px solid var(--ui-border)',
          borderRadius: 'var(--ui-radius)',
          padding: '20px',
          marginBottom: 24,
          boxShadow: 'var(--ui-shadow-card)',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 16,
          }}
        >
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--ui-text)' }}>
              {t('dashCouriersNow')} ({couriersNow.length})
            </h2>
            <small style={{ color: 'var(--ui-text-muted)', fontSize: 12 }}>
              Real-time driver location, active route packages, and COD cash held.
            </small>
          </div>
          <Link href="/drivers" className="ui-btn ui-btn--subtle ui-btn--sm">
            Manage Fleet →
          </Link>
        </div>

        {couriersNow.length > 0 ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
              gap: 14,
            }}
          >
            {couriersNow.map(c => {
              const statusColor =
                c.status === 'on_route'
                  ? 'var(--ui-success)'
                  : c.status === 'idle'
                  ? 'var(--ui-warning)'
                  : 'var(--ui-text-muted)'

              const statusLabel =
                c.status === 'on_route'
                  ? 'On Route'
                  : c.status === 'idle'
                  ? 'Idle / Available'
                  : 'Offline'

              return (
                <div
                  key={c.id}
                  style={{
                    background: 'var(--ui-surface-2)',
                    border: '1px solid var(--ui-border)',
                    borderRadius: 'var(--ui-radius-sm)',
                    padding: '14px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: 10,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Link
                      href={`/drivers/${c.id}`}
                      style={{ fontWeight: 700, fontSize: 14, color: 'var(--ui-text)', textDecoration: 'none' }}
                    >
                      {c.name}
                    </Link>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700 }}>
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          background: statusColor,
                          display: 'inline-block',
                        }}
                      />
                      <span style={{ color: statusColor }}>{statusLabel}</span>
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: 12,
                      color: 'var(--ui-text-muted)',
                    }}
                  >
                    <span>
                      Packages:{' '}
                      <strong style={{ color: 'var(--ui-text)' }}>{c.ordersInHand}</strong>
                    </span>
                    <span>
                      COD:{' '}
                      <strong style={{ color: 'var(--ui-text)' }}>
                        <MoneyText amount={c.cashHeldUsd} size="sm" />
                      </strong>
                    </span>
                  </div>

                  <div style={{ fontSize: 11, color: 'var(--ui-text-muted)', borderTop: '1px solid var(--ui-border)', paddingTop: 6 }}>
                    GPS: {c.lastActiveText}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <p style={{ color: 'var(--ui-text-muted)', fontSize: 13, margin: 0 }}>
            No couriers active in the system yet.
          </p>
        )}
      </div>

      {/* ─── Two Charts (14-Day Volume + Zone Distribution) ─────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
          gap: 20,
          marginBottom: 24,
        }}
      >
        {/* Chart 1: 14-Day Orders */}
        <div
          style={{
            background: 'var(--ui-surface)',
            border: '1px solid var(--ui-border)',
            borderRadius: 'var(--ui-radius)',
            padding: 20,
            boxShadow: 'var(--ui-shadow-card)',
          }}
        >
          <h3 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 16px', color: 'var(--ui-text)' }}>
            {t('dashOrdersPerDay')}
          </h3>
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              gap: 8,
              height: 140,
              paddingTop: 10,
              borderBottom: '1px solid var(--ui-border)',
            }}
          >
            {chartData.days.map((d, idx) => {
              const heightPct = Math.max(10, Math.round((d.count / maxDayCount) * 100))
              return (
                <div
                  key={idx}
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    height: '100%',
                    justifyContent: 'flex-end',
                    gap: 6,
                  }}
                  title={`${d.date}: ${d.count} orders`}
                >
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--ui-text-muted)' }}>
                    {d.count > 0 ? d.count : ''}
                  </span>
                  <div
                    style={{
                      width: '100%',
                      maxWidth: 24,
                      height: `${heightPct}%`,
                      background: d.isToday ? 'var(--ui-primary)' : 'var(--ui-surface-2)',
                      border: '1px solid ' + (d.isToday ? 'var(--ui-primary)' : 'var(--ui-border)'),
                      borderRadius: '4px 4px 0 0',
                      transition: 'height 0.2s ease',
                    }}
                  />
                  <span
                    style={{
                      fontSize: 10,
                      color: d.isToday ? 'var(--ui-primary)' : 'var(--ui-text-muted)',
                      fontWeight: d.isToday ? 800 : 500,
                    }}
                  >
                    {d.label}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Chart 2: Zone Deliveries */}
        <div
          style={{
            background: 'var(--ui-surface)',
            border: '1px solid var(--ui-border)',
            borderRadius: 'var(--ui-radius)',
            padding: 20,
            boxShadow: 'var(--ui-shadow-card)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: 'var(--ui-text)' }}>
              {t('dashDeliveriesByZone')}
            </h3>
            <Link href="/areas" className="ui-btn ui-btn--subtle ui-btn--sm">
              Tariffs →
            </Link>
          </div>

          {chartData.zones.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {chartData.zones.map((z, idx) => (
                <div key={idx}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: 12,
                      fontWeight: 600,
                      marginBottom: 4,
                    }}
                  >
                    <span style={{ color: 'var(--ui-text)' }}>{z.name}</span>
                    <span style={{ color: 'var(--ui-text-muted)' }}>
                      {z.count} orders ({z.percentage}%)
                    </span>
                  </div>
                  <div
                    style={{
                      width: '100%',
                      height: 8,
                      background: 'var(--ui-surface-2)',
                      borderRadius: 9999,
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: `${z.percentage}%`,
                        height: '100%',
                        background: 'var(--ui-primary)',
                        borderRadius: 9999,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: 'var(--ui-text-muted)', fontSize: 13 }}>No zone data yet.</p>
          )}
        </div>
      </div>

      {/* ─── Recent Orders Table ─────────────────────────────────── */}
      <div
        style={{
          background: 'var(--ui-surface)',
          border: '1px solid var(--ui-border)',
          borderRadius: 'var(--ui-radius)',
          boxShadow: 'var(--ui-shadow-card)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 20px',
            borderBottom: '1px solid var(--ui-border)',
          }}
        >
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--ui-text)' }}>
            {t('dashRecentOrders')}
          </h2>
          <Link href="/orders" className="ui-btn ui-btn--subtle ui-btn--sm">
            View All Orders →
          </Link>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="ui-table">
            <thead>
              <tr>
                <th>Order Code</th>
                <th>Recipient</th>
                <th>Shop</th>
                <th>Courier</th>
                <th>COD</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {recentOrders.length > 0 ? (
                recentOrders.map(o => (
                  <tr key={o.id}>
                    <td>
                      <Link
                        href={`/track/${o.tracking_token || o.code}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontWeight: 800, color: 'var(--ui-primary)', textDecoration: 'none' }}
                      >
                        {o.code} ↗
                      </Link>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600 }}>{o.recipient_name}</div>
                      {o.recipient_address && (
                        <div style={{ marginTop: 2 }}>
                          <a
                            href={getGoogleMapsDirectionsUrl(o.recipient_address)}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 4,
                              color: 'var(--ui-info)',
                              textDecoration: 'none',
                              fontSize: 11,
                            }}
                          >
                            <GoogleMapsIcon size={12} />
                            <span>{o.recipient_address}</span>
                          </a>
                        </div>
                      )}
                    </td>
                    <td>{o.shop?.name || '—'}</td>
                    <td>{o.driver?.name || <span style={{ color: 'var(--ui-text-muted)' }}>Unassigned</span>}</td>
                    <td>
                      <MoneyText amount={o.collection_usd} size="sm" />
                    </td>
                    <td>
                      <StatusBadge status={o.status} size="sm" />
                    </td>
                    <td>
                      {o.recipient_phone ? (
                        <a
                          href={getWhatsAppUrl(o.recipient_phone, buildCustomerOrderMessage(o as any))}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ui-btn ui-btn--subtle ui-btn--sm"
                          style={{ padding: '3px 8px', fontSize: 11, color: '#16a34a' }}
                          title="WhatsApp Customer"
                        >
                          <WhatsAppIcon size={13} />
                          <span>WhatsApp</span>
                        </a>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--ui-text-muted)' }}>
                    No recent orders.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
