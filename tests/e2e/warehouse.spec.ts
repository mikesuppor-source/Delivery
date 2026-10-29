import { test, expect } from 'playwright/test'
import { signInOwner, signInMerchant, seeded, apiCall } from './helpers'

test.describe('Phase 3: Warehouse Holding & Hub Workflow', () => {
  test('warehouse page loads tabs, KPI metrics, and hub shelves', async ({ page }) => {
    await signInOwner(page)
    await page.goto('/warehouse')

    // Expect page title & subtitle
    await expect(page.locator('h1')).toContainText('Warehouse Hub')

    // Expect KPI cards
    await expect(page.locator('text=Parcels In Storage').first()).toBeVisible()
    await expect(page.locator('text=Ready to Release Today').first()).toBeVisible()
    await expect(page.locator('text=Active Hubs').first()).toBeVisible()

    // Expect Tabs
    const inStorageTab = page.locator('button:has-text("In Storage")').first()
    const readyTab = page.locator('button:has-text("Ready to Release")').first()
    const releasedTab = page.locator('button:has-text("Released History")').first()

    await expect(inStorageTab).toBeVisible()
    await expect(readyTab).toBeVisible()
    await expect(releasedTab).toBeVisible()

    // Click tabs and verify active selection
    await readyTab.click()
    await releasedTab.click()
    await inStorageTab.click()
  })

  test('hold an order, verify in warehouse table, and release it back to pending dispatch', async ({ page }) => {
    const { db, workspaceId, shopId, areaId } = await seeded()

    // 1. Create a fresh test order in pending status
    const orderCode = 'WH-HOLD-' + Math.random().toString(36).slice(2, 7).toUpperCase()
    const { data: order, error: orderErr } = await db
      .from('orders')
      .insert({
        workspace_id: workspaceId,
        shop_id: shopId,
        area_id: areaId,
        code: orderCode,
        status: 'pending',
        usd_to_lbp_rate: 89500,
        collection_usd: 50,
        delivery_fee_usd: 8,
        driver_pay_usd: 1,
        recipient_name: 'Farid Warehouse Test',
        recipient_phone: '+961 71 888 999',
        recipient_address: 'Beirut Bliss Street',
      })
      .select('id, code')
      .single()

    expect(orderErr).toBeNull()
    expect(order).toBeDefined()

    // Fetch the default seeded hub
    const { data: hub } = await db
      .from('hubs')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('active', true)
      .limit(1)
      .single()
    expect(hub).toBeDefined()

    await signInOwner(page)

    // 2. Hold the order via API
    const holdRes = await apiCall(page, '/api/warehouse/hold', 'POST', {
      workspaceId,
      orderIds: [order!.id],
      hubId: hub!.id,
      shelfCode: 'A-01',
      reason: 'customer_request',
      note: 'Customer requested delivery next Monday',
      deliverAfter: '2026-11-05',
    })
    expect(holdRes.status).toBe(200)

    // 3. Navigate to /warehouse and verify parcel is in the table
    await page.goto('/warehouse')
    const whRow = page.locator('tr').filter({ hasText: orderCode })
    await expect(whRow).toBeVisible()
    await expect(whRow).toContainText('A-01')
    await expect(whRow).toContainText('Customer Rescheduled')

    // 4. Verify held badge on the /orders page
    await page.goto('/orders')
    const orderRow = page.locator(`tr:has-text("${orderCode}")`)
    await expect(orderRow).toBeVisible()
    await expect(orderRow.locator('text=Held')).toBeVisible()

    // 5. Release the order via API (simulating scan-out / desk release)
    const releaseRes = await apiCall(page, '/api/warehouse/release', 'POST', {
      workspaceId,
      orderIds: [order!.id],
      note: 'Customer confirmed delivery today',
    })
    expect(releaseRes.status).toBe(200)

    // 6. Verify in /warehouse that it moved to "Released History"
    await page.goto('/warehouse')
    const releasedTab = page.locator('button:has-text("Released History")').first()
    await releasedTab.click()
    await expect(page.locator(`text=${orderCode}`).first()).toBeVisible()
    await expect(page.locator('text=Released').first()).toBeVisible()

    // 7. Verify order in /orders is no longer held and is pending dispatch
    await page.goto('/orders')
    const restoredRow = page.locator(`tr:has-text("${orderCode}")`)
    await expect(restoredRow).toBeVisible()
    await expect(restoredRow.locator('text=📦 Held')).not.toBeVisible()
    await expect(restoredRow.locator('select.badge')).toHaveValue('pending')
  })

  test('merchant sees held reason in portal without internal shelf location', async ({ page }) => {
    const { db, workspaceId, shopId, areaId } = await seeded()

    // Create a held order for the merchant
    const merchantOrderCode = 'WH-MCH-' + Math.random().toString(36).slice(2, 7).toUpperCase()
    const { data: order } = await db
      .from('orders')
      .insert({
        workspace_id: workspaceId,
        shop_id: shopId,
        area_id: areaId,
        code: merchantOrderCode,
        status: 'pending',
        usd_to_lbp_rate: 89500,
        collection_usd: 35,
        delivery_fee_usd: 8,
        driver_pay_usd: 1,
        recipient_name: 'Merchant Test Recipient',
        recipient_phone: '+961 70 111 222',
        recipient_address: 'Achrafieh Sassine',
      })
      .select('id')
      .single()

    const { data: hub } = await db
      .from('hubs')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('active', true)
      .limit(1)
      .single()

    // Hold the parcel
    await db.rpc('hold_order', {
      p_order: order!.id,
      p_hub: hub!.id,
      p_shelf: 'SECRET-SHELF-99',
      p_reason: 'weather',
      p_note: 'Severe mountain storm',
      p_deliver_after: '2026-11-04',
    })

    // Sign in as Merchant
    await signInMerchant(page)

    // Locate the order row
    const orderCell = page.locator(`button:has-text("#${merchantOrderCode}")`).first()
    await expect(orderCell).toBeVisible()

    // Expect the Held badge with weather reason
    await expect(page.locator('text=📦 Held').first()).toBeVisible()
    await expect(page.locator('text=weather').first()).toBeVisible()

    // Verify internal shelf is strictly hidden from merchant
    const pageContent = await page.content()
    expect(pageContent).not.toContain('SECRET-SHELF-99')
  })

  test('customer tracking page shows safe warehouse reassurance message without hub address', async ({ page }) => {
    const { db, workspaceId, shopId, areaId } = await seeded()

    const trackOrderCode = 'WH-TRK-' + Math.random().toString(36).slice(2, 7).toUpperCase()
    const { data: order } = await db
      .from('orders')
      .insert({
        workspace_id: workspaceId,
        shop_id: shopId,
        area_id: areaId,
        code: trackOrderCode,
        status: 'pending',
        usd_to_lbp_rate: 89500,
        collection_usd: 40,
        delivery_fee_usd: 8,
        driver_pay_usd: 1,
        recipient_name: 'Customer Safe Track',
        recipient_phone: '+961 76 333 444',
        recipient_address: 'Verdun Plaza',
      })
      .select('id')
      .single()

    const { data: hub } = await db
      .from('hubs')
      .select('id')
      .eq('workspace_id', workspaceId)
      .eq('active', true)
      .limit(1)
      .single()

    await db.rpc('hold_order', {
      p_order: order!.id,
      p_hub: hub!.id,
      p_shelf: 'SECRET-SHELF-99',
      p_reason: 'far_zone',
      p_note: 'Scheduled trip Friday',
      p_deliver_after: '2026-11-06',
    })

    // Public tracking page
    await page.goto(`/track/${trackOrderCode}`)

    // Expect safe customer reassurance message
    await expect(page.locator('text=Safely Stored in Our Warehouse').first()).toBeVisible()
    await expect(page.locator('text=Your parcel is safe in our warehouse').first()).toBeVisible()

    // Verify internal shelf & hub warehouse address are not revealed to customers
    const pageText = await page.locator('body').innerText()
    expect(pageText).not.toContain('SECRET-SHELF-99')
    expect(pageText).not.toContain('Beirut Central Hub Address')
  })
})
