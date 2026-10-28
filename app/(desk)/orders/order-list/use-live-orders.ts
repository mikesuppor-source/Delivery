'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { DeliveryArea, Driver, Order, Shop } from './types'

interface LiveOrdersDeps {
  initialOrders: Order[]
  shops: Shop[]
  drivers: Driver[]
  areas: DeliveryArea[]
  workspaceId: string
}

/** The workspace's orders, kept current via Supabase realtime, with an optional chime for new ones. */
export function useLiveOrders({ initialOrders, shops, drivers, areas, workspaceId }: LiveOrdersDeps) {
  const [orders, setOrders] = useState<Order[]>(initialOrders)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const soundRef = useRef(soundEnabled)
  useEffect(() => {
    soundRef.current = soundEnabled
  }, [soundEnabled])

  function playChime() {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
      if (!AudioCtx) return
      const ctx = new AudioCtx()
      const now = ctx.currentTime
      const osc1 = ctx.createOscillator()
      const gain1 = ctx.createGain()
      osc1.type = 'sine'
      osc1.frequency.setValueAtTime(587.33, now)
      gain1.gain.setValueAtTime(0.15, now)
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.3)
      osc1.connect(gain1)
      gain1.connect(ctx.destination)
      osc1.start(now)
      osc1.stop(now + 0.3)

      const osc2 = ctx.createOscillator()
      const gain2 = ctx.createGain()
      osc2.type = 'sine'
      osc2.frequency.setValueAtTime(880, now + 0.12)
      gain2.gain.setValueAtTime(0.18, now + 0.12)
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.45)
      osc2.connect(gain2)
      gain2.connect(ctx.destination)
      osc2.start(now + 0.12)
      osc2.stop(now + 0.45)
    } catch {
      // AudioContext unavailable or requires interaction
    }
  }

  // Real-time synchronization: listen for inserts and updates to orders
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('desk-orders-' + workspaceId)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `workspace_id=eq.${workspaceId}` },
        payload => {
          if (payload.eventType === 'INSERT') {
            const newRow = payload.new as any
            const shopObj = shops.find(s => s.id === newRow.shop_id) || null
            const driverObj = drivers.find(d => d.id === newRow.driver_id) || null
            const areaObj = areas.find(a => a.id === newRow.area_id) || null
            const enriched: Order = { ...newRow, shop: shopObj, driver: driverObj, area: areaObj }
            setOrders(prev => (prev.some(o => o.id === enriched.id) ? prev : [enriched, ...prev]))
            if (soundRef.current) {
              playChime()
            }
          } else if (payload.eventType === 'UPDATE') {
            const updatedRow = payload.new as any
            const shopObj = shops.find(s => s.id === updatedRow.shop_id) || null
            const driverObj = drivers.find(d => d.id === updatedRow.driver_id) || null
            const areaObj = areas.find(a => a.id === updatedRow.area_id) || null
            setOrders(prev =>
              prev.map(o =>
                o.id === updatedRow.id
                  ? {
                      ...o,
                      ...updatedRow,
                      shop: shopObj || o.shop,
                      driver: driverObj || o.driver,
                      area: areaObj || o.area,
                    }
                  : o
              )
            )
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [workspaceId, shops, drivers, areas])

  return { orders, setOrders, soundEnabled, setSoundEnabled, playChime }
}
