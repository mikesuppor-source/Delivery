import { ORDER_STATUS_LABELS } from '@/lib/utils'
import type { Order } from './types'

/** Downloads the given orders as a UTF-8 CSV that Excel opens correctly. */
export function exportOrdersCsv(filteredOrders: Order[]) {
    if (filteredOrders.length === 0) {
      alert('No orders to export with current filters.')
      return
    }

    const headers = [
      'Order Code',
      'Date',
      'Status',
      'Shop',
      'Recipient Name',
      'Recipient Phone',
      'Recipient Address',
      'Destination Zone',
      'COD Collection USD',
      'Delivery Fee USD',
      'Courier Pay USD',
      'Company Margin USD',
      'Assigned Courier',
      'Notes',
    ]

    const rows = filteredOrders.map(o => [
      `"${o.code}"`,
      `"${new Date(o.created_at).toLocaleDateString('en-GB')}"`,
      `"${ORDER_STATUS_LABELS[o.status] || o.status}"`,
      `"${(o.shop?.name || '').replace(/"/g, '""')}"`,
      `"${(o.recipient_name || '').replace(/"/g, '""')}"`,
      `"${(o.recipient_phone || '').replace(/"/g, '""')}"`,
      `"${(o.recipient_address || '').replace(/"/g, '""')}"`,
      `"${(o.area?.name || '').replace(/"/g, '""')}"`,
      Number(o.collection_usd) || 0,
      Number(o.delivery_fee_usd) || 0,
      Number(o.driver_pay_usd) || 0,
      (Number(o.delivery_fee_usd) || 0) - (Number(o.driver_pay_usd) || 0),
      `"${(o.driver?.name || 'Unassigned').replace(/"/g, '""')}"`,
      `"${(o.notes || '').replace(/"/g, '""')}"`,
    ])

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', `cedar_orders_export_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
}
