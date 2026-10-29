'use client'

import React, { useState } from 'react'
import dynamic from 'next/dynamic'
import type { DriverMarkerData, StopMarkerData } from '@/components/leaflet-map'
import { formatUSD } from '@/lib/utils'

const LeafletMap = dynamic(() => import('@/components/leaflet-map'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full min-h-[500px] flex items-center justify-center bg-slate-100 rounded-2xl text-slate-400 font-semibold text-sm">
      Loading OpenStreetMap Leaflet Engine...
    </div>
  ),
})

export interface OrderStop extends StopMarkerData {
  driver_id?: string | null
  collection_usd?: number | null
}

interface MapClientProps {
  drivers: DriverMarkerData[]
  orders: OrderStop[]
}

export function MapClient({ drivers, orders }: MapClientProps) {
  const [selectedDriverId, setSelectedDriverId] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'idle' | 'offline'>('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Compute status for driver
  function getStatus(d: DriverMarkerData): 'active' | 'idle' | 'offline' {
    if (!d.last_seen_at || !d.current_lat || !d.current_lng) return 'offline'
    const diff = (Date.now() - new Date(d.last_seen_at).getTime()) / (1000 * 60)
    if (diff <= 15) return 'active'
    if (diff <= 45) return 'idle'
    return 'offline'
  }

  // Filter drivers
  const filteredDrivers = drivers.filter(d => {
    const status = getStatus(d)
    if (statusFilter !== 'all' && status !== statusFilter) return false
    if (searchQuery.trim() && !d.name.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false
    }
    return true
  })

  const selectedDriver = drivers.find(d => d.id === selectedDriverId) || null
  const selectedDriverStops = orders.filter(o => o.driver_id === selectedDriverId)

  // Status counts
  const counts = {
    all: drivers.length,
    active: drivers.filter(d => getStatus(d) === 'active').length,
    idle: drivers.filter(d => getStatus(d) === 'idle').length,
    offline: drivers.filter(d => getStatus(d) === 'offline').length,
  }

  return (
    <div className="space-y-4">
      {/* Top Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          {(['all', 'active', 'idle', 'offline'] as const).map(f => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 whitespace-nowrap ${
                statusFilter === f
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <span className="capitalize">{f}</span>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                  statusFilter === f ? 'bg-slate-700 text-white' : 'bg-slate-200 text-slate-700'
                }`}
              >
                {counts[f]}
              </span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search couriers..."
            className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 w-full sm:w-48"
          />
        </div>
      </div>

      {/* Main Map View Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-[750px]">
        {/* Leaflet Map Column */}
        <div className="lg:col-span-2 h-full rounded-2xl overflow-hidden border border-slate-200 shadow-sm relative">
          <LeafletMap
            drivers={filteredDrivers}
            selectedDriverId={selectedDriverId}
            selectedDriverStops={selectedDriverStops}
            onSelectDriver={id => setSelectedDriverId(id)}
          />
        </div>

        {/* Courier & Stops Drawer Column */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col h-full overflow-hidden">
          {selectedDriver ? (
            <div className="flex flex-col h-full">
              {/* Selected Driver Header */}
              <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center text-lg font-bold">
                    {selectedDriver.vehicle_type === 'moto' ? '🛵' : '🚗'}
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 leading-tight">
                      {selectedDriver.name}
                    </h3>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                          getStatus(selectedDriver) === 'active'
                            ? 'bg-emerald-100 text-emerald-800'
                            : getStatus(selectedDriver) === 'idle'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        {getStatus(selectedDriver)}
                      </span>
                      {selectedDriver.phone && (
                        <span className="text-xs text-slate-500">{selectedDriver.phone}</span>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => setSelectedDriverId(null)}
                  className="text-slate-400 hover:text-slate-700 text-xs font-bold p-1 rounded-lg hover:bg-slate-200 transition"
                >
                  ✕ Close
                </button>
              </div>

              {/* Driver Actions & GPS timestamp */}
              <div className="p-4 border-b border-slate-100 flex items-center justify-between text-xs">
                <div className="text-slate-500">
                  Last GPS:{' '}
                  <span className="font-semibold text-slate-800">
                    {selectedDriver.last_seen_at
                      ? new Date(selectedDriver.last_seen_at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : 'Never'}
                  </span>
                </div>

                {selectedDriver.phone && (
                  <a
                    href={`tel:${selectedDriver.phone}`}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold flex items-center gap-1.5 shadow-sm transition"
                  >
                    <span>📞 Call</span>
                  </a>
                )}
              </div>

              {/* Stops list for this driver */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                <div className="flex items-center justify-between text-xs font-bold text-slate-700 pb-1">
                  <span>Assigned Deliveries ({selectedDriverStops.length})</span>
                  <span>Stop Sequence</span>
                </div>

                {selectedDriverStops.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 text-xs italic">
                    No active delivery stops currently assigned to this courier.
                  </div>
                ) : (
                  selectedDriverStops.map((stop, idx) => (
                    <div
                      key={stop.id}
                      className="p-3 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 transition text-xs space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-sky-600 text-white font-bold text-[10px] flex items-center justify-center">
                            {idx + 1}
                          </span>
                          <span className="font-mono font-bold text-slate-900">{stop.code}</span>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            stop.status === 'picked_up'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-sky-100 text-sky-800'
                          }`}
                        >
                          {stop.status === 'picked_up' ? 'In Transit' : 'Assigned'}
                        </span>
                      </div>

                      <div className="font-semibold text-slate-800">
                        {stop.recipient_name || 'Customer'}
                      </div>
                      <div className="text-slate-500 line-clamp-2">
                        {stop.recipient_address || 'Address unlisted'}
                      </div>

                      {stop.collection_usd != null && Number(stop.collection_usd) > 0 && (
                        <div className="pt-1 flex items-center justify-between text-slate-600 border-t border-slate-200/60 font-semibold">
                          <span>COD:</span>
                          <span className="text-emerald-700">
                            {formatUSD(Number(stop.collection_usd))}
                          </span>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            /* Courier Directory when no single courier is selected */
            <div className="flex flex-col h-full">
              <div className="p-4 border-b border-slate-100 bg-slate-50">
                <h3 className="text-sm font-bold text-slate-900">Fleet Directory</h3>
                <p className="text-xs text-slate-500">
                  Select a courier on the map or list to view route stops
                </p>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {filteredDrivers.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 text-xs italic">
                    No couriers match the selected filter.
                  </div>
                ) : (
                  filteredDrivers.map(driver => {
                    const status = getStatus(driver)
                    const activeCount = orders.filter(o => o.driver_id === driver.id).length

                    return (
                      <div
                        key={driver.id}
                        onClick={() => setSelectedDriverId(driver.id)}
                        className="p-3 bg-slate-50 hover:bg-slate-100 rounded-xl border border-slate-200 cursor-pointer transition flex items-center justify-between"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-sm shadow-sm">
                            {driver.vehicle_type === 'moto' ? '🛵' : '🚗'}
                          </div>
                          <div>
                            <div className="text-xs font-bold text-slate-900 leading-tight">
                              {driver.name}
                            </div>
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              {activeCount} active stop{activeCount === 1 ? '' : 's'}
                            </div>
                          </div>
                        </div>

                        <div className="text-right">
                          <span
                            className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                              status === 'active'
                                ? 'bg-emerald-100 text-emerald-800'
                                : status === 'idle'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-slate-200 text-slate-600'
                            }`}
                          >
                            {status}
                          </span>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
