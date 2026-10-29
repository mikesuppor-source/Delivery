'use client'

import React from 'react'
import { useShopProfile } from '../context'
import { formatUSD } from '@/lib/utils'

export function SpecialPricesSection() {
  const {
    shop,
    areas,
    userRole,
    specialPriceMap,
    setSpecialPriceMap,
    savingPrices,
    pricesMessage,
    handleSaveSpecialPrices,
  } = useShopProfile()

  return (
    <div style={{ padding: '24px 32px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>Custom Zone Pricing for {shop.name}</h3>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--muted)' }}>
            Set negotiated delivery fees for this merchant per zone. Leave empty to charge the standard zone price.
          </p>
        </div>

        {(userRole === 'owner' || userRole === 'manager') && (
          <button
            type="button"
            className="btn btn-primary"
            disabled={savingPrices}
            onClick={handleSaveSpecialPrices}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            {savingPrices ? 'Saving Prices…' : 'Save Special Prices'}
          </button>
        )}
      </div>

      {pricesMessage && (
        <div
          style={{
            padding: '10px 16px',
            borderRadius: 8,
            marginBottom: 16,
            fontSize: 13,
            fontWeight: 600,
            background: pricesMessage.type === 'success' ? '#ecfdf5' : '#fef2f2',
            color: pricesMessage.type === 'success' ? '#065f46' : '#991b1b',
            border: `1px solid ${pricesMessage.type === 'success' ? '#a7f3d0' : '#fecaca'}`,
          }}
        >
          {pricesMessage.text}
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Zone / Delivery Area</th>
              <th>Standard Fee</th>
              <th>Custom Fee for {shop.name} ($ USD)</th>
              <th>Difference / Discount</th>
            </tr>
          </thead>
          <tbody>
            {areas.length === 0 ? (
              <tr>
                <td colSpan={4} style={{ textAlign: 'center', padding: '32px', color: 'var(--muted)' }}>
                  No delivery areas configured. Add areas in the Delivery Areas desk first.
                </td>
              </tr>
            ) : (
              areas.map(area => {
                const val = specialPriceMap[area.id] ?? ''
                const hasSpecial = val.trim() !== ''
                const specialNum = Number(val)
                const diff = hasSpecial ? specialNum - Number(area.fee_usd) : 0

                return (
                  <tr key={area.id}>
                    <td>
                      <strong>{area.name}</strong>
                    </td>
                    <td>
                      <span style={{ color: 'var(--muted)', fontWeight: 600 }}>
                        {formatUSD(Number(area.fee_usd))}
                      </span>
                    </td>
                    <td style={{ maxWidth: 220 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ color: 'var(--muted)', fontSize: 13 }}>$</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder={`Standard (${formatUSD(Number(area.fee_usd))})`}
                          value={val}
                          disabled={userRole !== 'owner' && userRole !== 'manager'}
                          onChange={e => {
                            const newVal = e.target.value
                            setSpecialPriceMap(prev => ({ ...prev, [area.id]: newVal }))
                          }}
                          style={{
                            width: 140,
                            padding: '6px 10px',
                            fontSize: 13,
                            fontWeight: hasSpecial ? 700 : 400,
                            color: hasSpecial ? 'var(--brand)' : 'inherit',
                            borderRadius: 6,
                            border: hasSpecial ? '1.5px solid var(--brand)' : '1px solid var(--line)',
                          }}
                        />
                        {hasSpecial && (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => setSpecialPriceMap(prev => ({ ...prev, [area.id]: '' }))}
                            title="Reset to standard fee"
                            style={{ fontSize: 11, padding: '2px 6px', color: 'var(--muted)' }}
                          >
                            Reset
                          </button>
                        )}
                      </div>
                    </td>
                    <td>
                      {hasSpecial ? (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            padding: '2px 8px',
                            borderRadius: 99,
                            fontSize: 12,
                            fontWeight: 700,
                            background: diff < 0 ? '#ecfdf5' : diff > 0 ? '#eff6ff' : '#f3f4f6',
                            color: diff < 0 ? '#065f46' : diff > 0 ? '#1d4ed8' : '#374151',
                            border: `1px solid ${diff < 0 ? '#a7f3d0' : diff > 0 ? '#bfdbfe' : '#e5e7eb'}`,
                          }}
                        >
                          {diff < 0
                            ? `${formatUSD(Math.abs(diff))} Discount`
                            : diff > 0
                            ? `+${formatUSD(diff)} Surcharge`
                            : 'Same as Standard'}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--muted)', fontSize: 12 }}>Standard rate applies</span>
                      )}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
