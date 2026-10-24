'use client'

import React, { useState, useRef } from 'react'
import { Modal } from '@/components/modal'
import { formatUSD } from '@/lib/utils'
import { formatLebanesePhone } from '@/lib/phone'
import { ShopifyIcon } from '@/components/shopify-icon'

interface ParsedOrderRow {
  code?: string
  recipientName: string
  recipientPhone: string
  recipientAddress: string
  areaName?: string
  collectionUsd: number
  notes?: string
  shopifyOrderId?: string
  shopifyOrderNumber?: string
}

interface BulkOrderImportModalProps {
  isOpen: boolean
  onClose: () => void
  workspaceId: string
  shopId?: string
  shopName?: string
  shops?: Array<{ id: string; name: string }>
  onImportComplete: (count: number) => void
}

export function BulkOrderImportModal({
  isOpen,
  onClose,
  workspaceId,
  shopId,
  shopName,
  shops,
  onImportComplete,
}: BulkOrderImportModalProps) {
  const [selectedShopId, setSelectedShopId] = useState<string>(shopId || shops?.[0]?.id || '')
  const [file, setFile] = useState<File | null>(null)
  const [parsedRows, setParsedRows] = useState<ParsedOrderRow[]>([])
  const [isParsing, setIsParsing] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Update selectedShopId if shopId prop changes
  React.useEffect(() => {
    if (shopId) setSelectedShopId(shopId)
    else if (shops && shops.length > 0 && !selectedShopId) setSelectedShopId(shops[0].id)
  }, [shopId, shops, selectedShopId])

  function parseCSVText(csvText: string): ParsedOrderRow[] {
    const lines = csvText.split(/\r?\n/).filter(line => line.trim().length > 0)
    if (lines.length < 2) return []

    // Helper to split CSV row respecting quotes
    function parseCSVLine(line: string): string[] {
      const result: string[] = []
      let current = ''
      let inQuotes = false

      for (let i = 0; i < line.length; i++) {
        const char = line[i]
        if (char === '"') {
          inQuotes = !inQuotes
        } else if ((char === ',' || char === ';') && !inQuotes) {
          result.push(current.trim().replace(/^"|"$/g, '').replace(/""/g, '"'))
          current = ''
        } else {
          current += char
        }
      }
      result.push(current.trim().replace(/^"|"$/g, '').replace(/""/g, '"'))
      return result
    }

    const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().trim().replace(/[^a-z0-9]/g, ''))

    // Map column indices
    // 1. Shopify fields
    const idxShopifyName = headers.findIndex(h => h === 'name' || h === 'ordernumber' || h === 'order')
    const idxShopifyShippingName = headers.findIndex(h => h === 'shippingname' || h === 'recipientname' || h === 'customername' || h === 'name' || h === 'client' || h === 'الاسم')
    const idxShopifyAddress1 = headers.findIndex(h => h === 'shippingaddress1' || h === 'shippingstreet' || h === 'address' || h === 'street' || h === 'العنوان')
    const idxShopifyAddress2 = headers.findIndex(h => h === 'shippingaddress2')
    const idxShopifyCity = headers.findIndex(h => h === 'shippingcity' || h === 'city' || h === 'area' || h === 'المنطقة' || h === 'المدينة')
    const idxShopifyProvince = headers.findIndex(h => h === 'shippingprovince' || h === 'province')
    const idxShopifyPhone = headers.findIndex(h => h === 'shippingphone' || h === 'phone' || h === 'mobile' || h === 'telephone' || h === 'الهاتف' || h === 'رقم')
    const idxShopifyTotal = headers.findIndex(h => h === 'total' || h === 'totalprice' || h === 'amount' || h === 'price' || h === 'cod' || h === 'المبلغ')
    const idxShopifyFinancial = headers.findIndex(h => h === 'financialstatus')
    const idxShopifyNotes = headers.findIndex(h => h === 'notes' || h === 'note' || h === 'lineitemname' || h === 'ملاحظات')

    const rows: ParsedOrderRow[] = []

    for (let i = 1; i < lines.length; i++) {
      const cols = parseCSVLine(lines[i])
      if (cols.length < 2) continue

      // Name
      const name = (idxShopifyShippingName !== -1 ? cols[idxShopifyShippingName] : '') ||
                   (idxShopifyName !== -1 ? cols[idxShopifyName] : '') || 'Customer'

      // Phone
      const phone = (idxShopifyPhone !== -1 ? cols[idxShopifyPhone] : '') || ''
      const cleanPhone = formatLebanesePhone(phone) || phone

      // Address
      const addr1 = idxShopifyAddress1 !== -1 ? cols[idxShopifyAddress1] : ''
      const addr2 = idxShopifyAddress2 !== -1 ? cols[idxShopifyAddress2] : ''
      const city = idxShopifyCity !== -1 ? cols[idxShopifyCity] : ''
      const province = idxShopifyProvince !== -1 ? cols[idxShopifyProvince] : ''
      const fullAddress = [addr1, addr2, city, province].filter(Boolean).join(', ')

      // Amount / COD
      const totalRaw = idxShopifyTotal !== -1 ? cols[idxShopifyTotal] : '0'
      const finStatus = idxShopifyFinancial !== -1 ? cols[idxShopifyFinancial].toLowerCase() : ''
      const parsedAmount = parseFloat(totalRaw.replace(/[^0-9.]/g, '')) || 0
      const isPaid = finStatus === 'paid'
      const collectionUsd = isPaid ? 0 : parsedAmount

      // Code / Shopify order number
      const codeVal = idxShopifyName !== -1 ? cols[idxShopifyName].replace(/^#/, '') : undefined

      // Notes
      const notesVal = idxShopifyNotes !== -1 ? cols[idxShopifyNotes] : ''

      if (name && (phone || fullAddress)) {
        rows.push({
          code: codeVal,
          recipientName: name,
          recipientPhone: cleanPhone,
          recipientAddress: fullAddress || 'Address pending',
          areaName: city || province || undefined,
          collectionUsd,
          notes: notesVal || undefined,
          shopifyOrderId: codeVal,
          shopifyOrderNumber: codeVal ? `#${codeVal}` : undefined,
        })
      }
    }

    return rows
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0]
    if (!selected) return

    setFile(selected)
    setIsParsing(true)
    setError(null)
    setSuccessMessage(null)

    const reader = new FileReader()
    reader.onload = evt => {
      try {
        const text = evt.target?.result as string
        const parsed = parseCSVText(text)
        if (parsed.length === 0) {
          setError('Could not detect any valid order rows in the file. Ensure your CSV has headers (e.g. Name, Phone, Address, Total).')
        } else {
          setParsedRows(parsed)
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Error reading file')
      } finally {
        setIsParsing(false)
      }
    }
    reader.readAsText(selected)
  }

  async function handleExecuteImport() {
    if (parsedRows.length === 0) return

    setIsImporting(true)
    setError(null)
    setSuccessMessage(null)

    try {
      const res = await fetch('/api/orders/bulk-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          shopId,
          orders: parsedRows,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to import orders')
      }

      setSuccessMessage(data.message || `Successfully imported ${data.count} orders!`)
      onImportComplete(data.count)

      setTimeout(() => {
        onClose()
        setFile(null)
        setParsedRows([])
      }, 2000)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error importing orders')
    } finally {
      setIsImporting(false)
    }
  }

  const totalCodSum = parsedRows.reduce((sum, r) => sum + r.collectionUsd, 0)

  if (!isOpen) return null

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Import Orders from Shopify or Excel CSV">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, color: 'var(--text)' }}>
        {/* Intro */}
        <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>
          Import batch orders for <strong>{shopName}</strong>. Drop an export file directly from <strong>Shopify Orders (CSV)</strong> or a standard Excel spreadsheet.
        </div>

        {/* Dropzone */}
        <div
          onClick={() => fileInputRef.current?.click()}
          style={{
            border: '2px dashed var(--line)',
            borderRadius: 12,
            padding: '24px 20px',
            textAlign: 'center',
            cursor: 'pointer',
            background: file ? 'rgba(149, 191, 71, 0.08)' : 'var(--bg)',
            transition: 'all 0.2s ease',
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.txt,.tsv"
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />

          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 8 }}>
            <ShopifyIcon size={32} />
          </div>

          <strong style={{ fontSize: 14, display: 'block', color: 'var(--text)' }}>
            {file ? file.name : 'Click or drag & drop your CSV file here'}
          </strong>
          <span style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginTop: 4 }}>
            Supports Shopify Export CSV, WooCommerce, or custom Excel exports
          </span>
        </div>

        {/* Parsing Loader */}
        {isParsing && (
          <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--brand)', fontWeight: 700 }}>
            Parsing CSV spreadsheet…
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{ background: '#7f1d1d', color: '#ffffff', padding: '10px 14px', borderRadius: 8, fontSize: 12.5, fontWeight: 700 }}>
            ⚠ {error}
          </div>
        )}

        {/* Success */}
        {successMessage && (
          <div style={{ background: '#065f46', color: '#ffffff', padding: '10px 14px', borderRadius: 8, fontSize: 12.5, fontWeight: 700 }}>
            ✓ {successMessage}
          </div>
        )}

        {/* Preview of Parsed Rows */}
        {parsedRows.length > 0 && (
          <div style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
              <div>
                <strong style={{ fontSize: 13, color: 'var(--text)' }}>
                  Preview: {parsedRows.length} Orders Detected
                </strong>
                <span style={{ fontSize: 11.5, color: 'var(--muted)', display: 'block' }}>
                  Total COD Cash to Collect: <strong style={{ color: '#10b981' }}>{formatUSD(totalCodSum)}</strong>
                </span>
              </div>

              <button
                type="button"
                onClick={() => {
                  setFile(null)
                  setParsedRows([])
                }}
                className="btn btn-ghost btn-sm"
                style={{ fontSize: 11 }}
              >
                Clear File
              </button>
            </div>

            <div style={{ maxHeight: 220, overflowY: 'auto', borderRadius: 6, border: '1px solid var(--line)' }}>
              <table style={{ width: '100%', fontSize: 11.5, borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead style={{ background: 'var(--bg)', position: 'sticky', top: 0, zIndex: 1 }}>
                  <tr>
                    <th style={{ padding: '6px 8px', borderBottom: '1px solid var(--line)' }}>Order #</th>
                    <th style={{ padding: '6px 8px', borderBottom: '1px solid var(--line)' }}>Recipient</th>
                    <th style={{ padding: '6px 8px', borderBottom: '1px solid var(--line)' }}>Phone</th>
                    <th style={{ padding: '6px 8px', borderBottom: '1px solid var(--line)' }}>Address / City</th>
                    <th style={{ padding: '6px 8px', borderBottom: '1px solid var(--line)', textAlign: 'right' }}>COD ($)</th>
                  </tr>
                </thead>
                <tbody>
                  {parsedRows.slice(0, 15).map((row, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--line)' }}>
                      <td style={{ padding: '6px 8px', fontFamily: 'monospace', fontWeight: 700 }}>
                        {row.code ? `#${row.code}` : `Auto-${idx + 1}`}
                      </td>
                      <td style={{ padding: '6px 8px', fontWeight: 600 }}>{row.recipientName}</td>
                      <td style={{ padding: '6px 8px', color: 'var(--muted)' }}>{row.recipientPhone}</td>
                      <td style={{ padding: '6px 8px', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {row.recipientAddress}
                      </td>
                      <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 800, color: '#10b981' }}>
                        ${row.collectionUsd.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {parsedRows.length > 15 && (
              <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--muted)', marginTop: 6 }}>
                Showing first 15 of {parsedRows.length} orders
              </div>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
          <button type="button" onClick={onClose} className="btn btn-secondary">
            Cancel
          </button>

          <button
            type="button"
            disabled={parsedRows.length === 0 || isImporting}
            onClick={handleExecuteImport}
            className="btn btn-primary"
            style={{
              padding: '10px 20px',
              fontWeight: 800,
              fontSize: 13,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <ShopifyIcon size={16} />
            <span>{isImporting ? 'Importing Orders…' : `Import ${parsedRows.length} Orders into Cedar`}</span>
          </button>
        </div>
      </div>
    </Modal>
  )
}
