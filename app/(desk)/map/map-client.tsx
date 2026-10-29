'use client'

import React, { useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { Button } from '@/components/ui'
import type { DriverMarkerData, StopMarkerData } from '@/components/leaflet-map'
import { driverStatus, type DriverStatus } from '@/lib/map'
import { formatUSD } from '@/lib/utils'

const LeafletMap = dynamic(() => import('@/components/leaflet-map'), {
  ssr: false,
  loading: () => <div className="ui-map-loading">Loading the map...</div>,
})

export interface OrderStop extends StopMarkerData {
  driver_id?: string | null
  collection_usd?: number | null
}

interface MapClientProps {
  drivers: DriverMarkerData[]
  orders: OrderStop[]
}

type Filter = 'all' | DriverStatus

const STATUS_LABEL: Record<DriverStatus, string> = { active: 'Active', idle: 'Idle', offline: 'Offline' }
const STATUS_DOT: Record<DriverStatus, string> = {
  active: 'var(--ui-success)',
  idle: 'var(--ui-warning)',
  offline: 'var(--ui-text-subtle)',
}

const vehicleIcon = (driver: DriverMarkerData) => (driver.vehicle_type === 'moto' ? '🛵' : '🚗')

const searchStyle: React.CSSProperties = {
  padding: '7px 12px',
  fontSize: 13,
  borderRadius: 8,
  border: '1px solid var(--ui-border)',
  background: 'var(--ui-surface-2)',
  color: 'var(--ui-text)',
  minWidth: 220,
}

const cardStyle: React.CSSProperties = {
  padding: 10,
  borderRadius: 10,
  border: '1px solid var(--ui-border)',
  background: 'var(--ui-surface-2)',
}

function StatusPill({ status }: { status: DriverStatus }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '2px 9px',
        borderRadius: 99,
        fontSize: 11,
        fontWeight: 700,
        border: '1px solid var(--ui-border)',
        background: 'var(--ui-surface)',
        color: 'var(--ui-text)',
      }}
    >
      <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS_DOT[status] }} />
      {STATUS_LABEL[status]}
    </span>
  )
}

export function MapClient({ drivers, orders }: MapClientProps) {
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<Filter>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Kept in step with their inputs so the map is not redrawn on every keystroke elsewhere
  const filteredDrivers = useMemo(
    () =>
      drivers.filter(d => {
        if (statusFilter !== 'all' && driverStatus(d) !== statusFilter) return false
        const query = searchQuery.trim().toLowerCase()
        return !query || d.name.toLowerCase().includes(query)
      }),
    [drivers, statusFilter, searchQuery],
  )
  const selectedDriver = drivers.find(d => d.id === selectedDriverId) || null
  const selectedDriverStops = useMemo(
    () => orders.filter(o => o.driver_id === selectedDriverId),
    [orders, selectedDriverId],
  )

  const counts: Record<Filter, number> = {
    all: drivers.length,
    active: drivers.filter(d => driverStatus(d) === 'active').length,
    idle: drivers.filter(d => driverStatus(d) === 'idle').length,
    offline: drivers.filter(d => driverStatus(d) === 'offline').length,
  }
  const onMap = drivers.filter(d => d.current_lat != null && d.current_lng != null).length

  return (
    <div>
      {/* Filter bar */}
      <div
        className="ui-box"
        style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 16px', marginBottom: 12 }}
      >
        <div role="group" aria-label="Filter couriers by status" style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {(['all', 'active', 'idle', 'offline'] as const).map(f => (
            <Button key={f} size="sm" variant={statusFilter === f ? 'primary' : 'subtle'} aria-pressed={statusFilter === f} onClick={() => setStatusFilter(f)}>
              <span style={{ textTransform: 'capitalize' }}>{f}</span>
              <span style={{ opacity: 0.8 }}>{counts[f]}</span>
            </Button>
          ))}
        </div>
        <input
          type="search"
          aria-label="Search couriers"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search couriers..."
          style={searchStyle}
        />
      </div>

      {/* Why the map may be empty */}
      <p role="status" style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--ui-text-muted)' }}>
        {onMap === 0
          ? 'No courier has shared a GPS position yet. A courier appears on the map once they open the courier app and allow location access.'
          : `${onMap} of ${drivers.length} courier${drivers.length === 1 ? '' : 's'} ${onMap === 1 ? 'has' : 'have'} a GPS position on the map.`}
      </p>

      <div className="ui-map-layout">
        <div className="ui-map-canvas">
          <LeafletMap
            drivers={filteredDrivers}
            selectedDriverId={selectedDriverId}
            selectedDriverStops={selectedDriverStops}
            onSelectDriver={setSelectedDriverId}
          />
        </div>

        <aside className="ui-box ui-map-side" aria-label="Couriers">
          {selectedDriver ? (
            <>
              <div className="ui-map-side__head" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <span
                    aria-hidden="true"
                    style={{ width: 38, height: 38, flexShrink: 0, borderRadius: 10, background: 'var(--ui-surface)', border: '1px solid var(--ui-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}
                  >
                    {vehicleIcon(selectedDriver)}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: 'var(--ui-text)' }}>{selectedDriver.name}</h3>
                    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                      <StatusPill status={driverStatus(selectedDriver)} />
                      {selectedDriver.phone && <span style={{ fontSize: 12, color: 'var(--ui-text-muted)' }}>{selectedDriver.phone}</span>}
                    </div>
                  </div>
                </div>
                <Button size="sm" variant="subtle" onClick={() => setSelectedDriverId(null)}>
                  <span aria-hidden="true">✕</span> Close
                </Button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 16px', borderBottom: '1px solid var(--ui-border)', fontSize: 12 }}>
                <span style={{ color: 'var(--ui-text-muted)' }}>
                  Last GPS:{' '}
                  <strong style={{ color: 'var(--ui-text)' }}>
                    {selectedDriver.last_seen_at
                      ? new Date(selectedDriver.last_seen_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                      : 'Never'}
                  </strong>
                </span>
                {selectedDriver.phone && (
                  <a className="ui-btn ui-btn--success ui-btn--sm" href={`tel:${selectedDriver.phone}`}>
                    Call
                  </a>
                )}
              </div>

              <div className="ui-map-side__body">
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 700, color: 'var(--ui-text)' }}>
                  <span>Assigned deliveries ({selectedDriverStops.length})</span>
                  <span style={{ color: 'var(--ui-text-muted)', fontWeight: 600 }}>In stop order</span>
                </div>

                {selectedDriverStops.length === 0 ? (
                  <p style={{ margin: 0, padding: '24px 8px', textAlign: 'center', fontSize: 12, fontStyle: 'italic', color: 'var(--ui-text-muted)' }}>
                    No active delivery stops are assigned to this courier.
                  </p>
                ) : (
                  selectedDriverStops.map((stop, index) => (
                    <div key={stop.id} style={{ ...cardStyle, fontSize: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span
                            aria-hidden="true"
                            style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--ui-info)', color: '#fff', fontSize: 11, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                          >
                            {index + 1}
                          </span>
                          <span style={{ fontFamily: 'monospace', fontWeight: 800, color: 'var(--ui-text)' }}>{stop.code}</span>
                        </span>
                        <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 700, background: stop.status === 'picked_up' ? 'var(--ui-success-soft)' : 'var(--ui-info-soft)', color: 'var(--ui-text)' }}>
                          {stop.status === 'picked_up' ? 'In transit' : 'Assigned'}
                        </span>
                      </div>
                      <div style={{ fontWeight: 600, color: 'var(--ui-text)' }}>{stop.recipient_name || 'Customer'}</div>
                      <div
                        style={{ color: 'var(--ui-text-muted)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                      >
                        {stop.recipient_address || 'Address not listed'}
                      </div>
                      {stop.collection_usd != null && Number(stop.collection_usd) > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 6, borderTop: '1px solid var(--ui-border)', fontWeight: 600, color: 'var(--ui-text-muted)' }}>
                          <span>Cash to collect</span>
                          <span style={{ color: 'var(--ui-text)' }}>{formatUSD(Number(stop.collection_usd))}</span>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </>
          ) : (
            <>
              <div className="ui-map-side__head">
                <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: 'var(--ui-text)' }}>Fleet Directory</h3>
                <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--ui-text-muted)' }}>Choose a courier to see their route stops</p>
              </div>

              <div className="ui-map-side__body">
                {filteredDrivers.length === 0 ? (
                  <p style={{ margin: 0, padding: '24px 8px', textAlign: 'center', fontSize: 12, fontStyle: 'italic', color: 'var(--ui-text-muted)' }}>
                    No couriers match the selected filter.
                  </p>
                ) : (
                  filteredDrivers.map(driver => {
                    const stops = orders.filter(o => o.driver_id === driver.id).length
                    return (
                      <button
                        key={driver.id}
                        type="button"
                        onClick={() => setSelectedDriverId(driver.id)}
                        style={{ ...cardStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, width: '100%', textAlign: 'start', font: 'inherit', color: 'inherit', cursor: 'pointer' }}
                      >
                        <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                          <span aria-hidden="true" style={{ width: 32, height: 32, flexShrink: 0, borderRadius: 8, background: 'var(--ui-surface)', border: '1px solid var(--ui-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 }}>
                            {vehicleIcon(driver)}
                          </span>
                          <span style={{ minWidth: 0 }}>
                            <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--ui-text)' }}>{driver.name}</span>
                            <span style={{ display: 'block', fontSize: 11, color: 'var(--ui-text-muted)', marginTop: 2 }}>
                              {stops} active stop{stops === 1 ? '' : 's'}
                            </span>
                          </span>
                        </span>
                        <StatusPill status={driverStatus(driver)} />
                      </button>
                    )
                  })
                )}
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  )
}
