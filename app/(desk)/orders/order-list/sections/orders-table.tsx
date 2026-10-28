'use client'

import { OrderRow } from './order-row'
import { useOrderList } from '../context'

export function OrdersTable() {
  const { canManage, filteredOrders, handleToggleSelectAll, selectedOrderIds } = useOrderList()
  return (
    <>
      <div className="panel">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {canManage && (
                  <th style={{ width: 36, textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={filteredOrders.length > 0 && selectedOrderIds.length === filteredOrders.length}
                      onChange={handleToggleSelectAll}
                      title="Select all orders in current filter"
                    />
                  </th>
                )}
                <th>Code & Customer</th>
                <th>Shop</th>
                <th>Driver</th>
                <th>Area</th>
                <th>Collection</th>
                <th>Fee</th>
                <th>Status</th>
                <th>WhatsApp</th>
                <th>Date</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map(order => (
                <OrderRow key={order.id} order={order} />
              ))}
            </tbody>
          </table>

          {filteredOrders.length === 0 && (
            <div className="empty">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
              </svg>
              <h3>No orders in this view</h3>
              <p>Create a new order or select a different filter.</p>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
