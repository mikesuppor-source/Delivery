import { test, expect } from 'playwright/test'
import { signInOwner, signInMerchant, signInCourier, seeded } from './helpers'

test.describe('Phase 4: Dispatch Pro & Operational Chain', () => {
  test('merchant portal: requests pickup and verifies returns metrics', async ({ page }) => {
    await signInMerchant(page)
    await page.goto('/portal')

    // Expect Portal header with "Request Pickup" button
    const requestPickupBtn = page.locator('button:has-text("Request Pickup")').first()
    await expect(requestPickupBtn).toBeVisible()

    // Expect Returns & Handovers KPI card
    await expect(page.locator('text=Returns & Handovers').first()).toBeVisible()
    await expect(page.locator('text=waiting').first()).toBeVisible()
    await expect(page.locator('text=returned this month').first()).toBeVisible()

    // Open Pickup Modal
    await requestPickupBtn.click()

    // Fill Pickup Form
    await page.locator('input[type="number"][min="1"]').fill('8')
    await page.locator('textarea[placeholder*="warehouse bell"]').fill('Please pick up 8 ready shoe boxes from main showroom')

    // Submit and await API response
    const pickupReqPromise = page.waitForResponse(
      r => r.url().includes('/api/pickups') && r.status() === 200
    )
    await page.locator('button[type="submit"]:has-text("Request Pickup")').click()
    await pickupReqPromise

    // Expect success message
    await expect(page.locator('text=Pickup requested for 8 parcels')).toBeVisible()
  })

  test('scan client: hub sort mode shows zone banner and auto checks into hub', async ({ page }) => {
    const { db, workspaceId, shopId, areaId } = await seeded()

    // Create a parcel for hub sorting
    const orderCode = 'SORT-' + Math.random().toString(36).slice(2, 7).toUpperCase()
    const { data: order, error } = await db
      .from('orders')
      .insert({
        workspace_id: workspaceId,
        shop_id: shopId,
        area_id: areaId,
        code: orderCode,
        status: 'pending',
        usd_to_lbp_rate: 89500,
        collection_usd: 35,
        delivery_fee_usd: 4,
        driver_pay_usd: 2,
        recipient_name: 'Zeina Sort Test',
        recipient_phone: '+961 70 123 789',
        recipient_address: 'Beirut Central, Downtown Starco',
      })
      .select('id, code')
      .single()

    expect(error).toBeNull()
    expect(order).toBeDefined()

    await signInOwner(page)
    await page.goto('/scan')

    // Check Continuous Scan Mode checkbox to reveal automation options
    await page.locator('input[type="checkbox"]').first().check()

    // Select "Sort Mode" radio option
    const sortModeRadio = page.locator('text=Sort Mode').first()
    await sortModeRadio.click()

    // Type the order code in manual input and hit Enter
    const manualInput = page.locator('input[placeholder="e.g. CED-000142"]')
    await manualInput.fill(orderCode)
    await manualInput.press('Enter')

    // Expect Destination Zone display
    await expect(page.locator('text=DESTINATION ZONE').first()).toBeVisible()
    await expect(page.locator('text=Beirut Central').first()).toBeVisible()

    // Expect "Sorted Zone Bags" section
    await expect(page.locator('text=Sorted Zone Bags').first()).toBeVisible()

    // Allow background PATCH to finish
    await page.waitForTimeout(1500)

    // Verify order in database now has received_at_hub
    const { data: updatedOrder } = await db
      .from('orders')
      .select('received_at_hub')
      .eq('id', order!.id)
      .single()

    expect(updatedOrder?.received_at_hub).not.toBeNull()
  })

  test('courier run sheet: pickups tab, earnings tab, and best order route optimization', async ({ page }) => {
    const { db, workspaceId, shopId, areaId, courierId } = await seeded()

    const uniqueNote = 'Pickup note ' + Math.random().toString(36).slice(2, 7)

    // 1. Create a pickup assigned to courier
    const { data: pickup, error: pErr } = await db
      .from('pickups')
      .insert({
        workspace_id: workspaceId,
        shop_id: shopId,
        driver_id: courierId,
        status: 'assigned',
        parcel_count: 5,
        note: uniqueNote,
      })
      .select('id')
      .single()

    expect(pErr).toBeNull()
    expect(pickup).toBeDefined()

    // 2. Create two active deliveries for courier
    const codeA = 'RO-A' + Math.random().toString(36).slice(2, 6).toUpperCase()
    const codeB = 'RO-B' + Math.random().toString(36).slice(2, 6).toUpperCase()

    await db.from('orders').insert([
      {
        workspace_id: workspaceId,
        shop_id: shopId,
        area_id: areaId,
        driver_id: courierId,
        code: codeA,
        status: 'picked_up',
        usd_to_lbp_rate: 89500,
        collection_usd: 20,
        delivery_fee_usd: 4,
        driver_pay_usd: 2,
        recipient_name: 'Customer Near',
        recipient_phone: '+961 3 111 222',
        recipient_address: 'Achrafieh Sassine 33.8860, 35.5200',
        route_position: 2,
      },
      {
        workspace_id: workspaceId,
        shop_id: shopId,
        area_id: areaId,
        driver_id: courierId,
        code: codeB,
        status: 'picked_up',
        usd_to_lbp_rate: 89500,
        collection_usd: 40,
        delivery_fee_usd: 4,
        driver_pay_usd: 2,
        recipient_name: 'Customer Far',
        recipient_phone: '+961 3 333 444',
        recipient_address: 'Jounieh Old Souk 33.9810, 35.6180',
        route_position: 1,
      },
    ])

    // Sign in Courier
    await signInCourier(page)

    // Verify "Pickups" tab exists and click it
    const pickupsTab = page.locator('button:has-text("Pickups")').first()
    await expect(pickupsTab).toBeVisible()
    await pickupsTab.click()

    // Expect pickup card with collect button
    const pickupCard = page.locator('div').filter({ hasText: uniqueNote })
    await expect(pickupCard.first()).toBeVisible()
    const collectBtn = pickupCard.locator('button:has-text("Collect")').first()
    await expect(collectBtn).toBeVisible()
    await collectBtn.click()

    // Confirm collection modal and wait for PATCH response
    const collectResponsePromise = page.waitForResponse(
      r => r.url().includes('/api/pickups') && r.status() === 200
    )
    await page.locator('button:has-text("Confirm Collection")').click()
    await collectResponsePromise

    // Expect toast notification
    await expect(page.locator('text=Pickup marked as collected!')).toBeVisible()

    // Switch to Earnings tab
    const earningsTab = page.locator('button:has-text("Earnings & Cash")').first()
    await expect(earningsTab).toBeVisible()
    await earningsTab.click()

    await expect(page.locator('text=Cash Held to Hand Over').first()).toBeVisible()
    await expect(page.locator('text=Commission Earned').first()).toBeVisible()

    // Switch back to "To Deliver" tab
    await page.locator('button:has-text("To Deliver")').click()

    // Click "Best Order" Route Optimizer
    const optimizeBtn = page.locator('button:has-text("Best Order")')
    await expect(optimizeBtn).toBeVisible()
    const routePromise = page.waitForResponse(r => r.url().includes('/api/orders/route') && r.status() === 200)
    await optimizeBtn.click()
    await routePromise

    // Verify toast notification
    await expect(page.locator('text=Route optimized by nearest stops')).toBeVisible({ timeout: 10000 })
  })

  test('delivery attempts: recording 3 failed attempts auto-transitions order to returned', async ({ page }) => {
    const { db, workspaceId, shopId, areaId, courierId } = await seeded()

    const orderCode = 'FAIL-3X-' + Math.random().toString(36).slice(2, 6).toUpperCase()
    const { data: order, error } = await db
      .from('orders')
      .insert({
        workspace_id: workspaceId,
        shop_id: shopId,
        area_id: areaId,
        driver_id: courierId,
        code: orderCode,
        status: 'picked_up',
        usd_to_lbp_rate: 89500,
        collection_usd: 55,
        delivery_fee_usd: 4,
        driver_pay_usd: 2,
        recipient_name: 'Sami Three Attempts',
        recipient_phone: '+961 71 555 444',
        recipient_address: 'Hamra Makdissi Street',
      })
      .select('id, code')
      .single()

    expect(error).toBeNull()

    // Insert 2 prior attempts directly into delivery_attempts
    await db.from('delivery_attempts').insert([
      {
        workspace_id: workspaceId,
        order_id: order!.id,
        driver_id: courierId,
        attempt_no: 1,
        result: 'no_answer',
        note: 'First attempt no answer',
      },
      {
        workspace_id: workspaceId,
        order_id: order!.id,
        driver_id: courierId,
        attempt_no: 2,
        result: 'no_answer',
        note: 'Second attempt no answer',
      },
    ])

    // Sign in Courier and mark 3rd attempt via UI
    await signInCourier(page)

    // Filter to this specific order
    await page.locator('input[placeholder*="Search"]').fill(orderCode)

    // Click "Reschedule" button
    await page.locator('button:has-text("Reschedule")').first().click()

    // Select reason button and submit
    await page.locator('button:has-text("Customer Not Answering")').click()
    const attemptResponsePromise = page.waitForResponse(
      r => r.url().includes('/api/orders/attempts') && r.status() === 200
    )
    await page.locator('button:has-text("Save & Postpone Delivery")').click()
    await attemptResponsePromise

    // Brief wait for database trigger settlement
    await page.waitForTimeout(500)

    // Verify database state: 3 attempts reached max_attempts (3), order transitioned to 'returned'
    const { data: checkOrder } = await db
      .from('orders')
      .select('status')
      .eq('id', order!.id)
      .single()

    expect(checkOrder?.status).toBe('returned')
  })

  test('returns handover: desk batches returned order to shop with signature', async ({ page }) => {
    const { db, workspaceId, shopId, areaId } = await seeded()

    const orderCode = 'RET-HAND-' + Math.random().toString(36).slice(2, 6).toUpperCase()
    const { data: order, error } = await db
      .from('orders')
      .insert({
        workspace_id: workspaceId,
        shop_id: shopId,
        area_id: areaId,
        code: orderCode,
        status: 'returned',
        usd_to_lbp_rate: 89500,
        collection_usd: 30,
        delivery_fee_usd: 3,
        driver_pay_usd: 1,
        recipient_name: 'Returned Merchant Item',
        recipient_phone: '+961 3 999 888',
        recipient_address: 'Badaro Main Street',
      })
      .select('id, code')
      .single()

    expect(error).toBeNull()

    await signInOwner(page)
    await page.goto('/orders')

    // Switch to Returned tab
    await page.locator('button:has-text("Returned")').first().click()

    // Select the order checkbox
    const checkbox = page.locator(`input[aria-label="Select order ${orderCode}"]`)
    await expect(checkbox).toBeVisible()
    await checkbox.check()

    // Floating batch bar should appear with "Handover to Shop" button
    const handoverBtn = page.locator('button:has-text("Handover to Shop")').first()
    await expect(handoverBtn).toBeVisible()
    await handoverBtn.click()

    // Expect modal with signature canvas and parcel code
    await expect(page.locator('text=Return-to-Shop Handover')).toBeVisible()
    await expect(page.locator(`text=#${orderCode}`)).toBeVisible()

    // Click "Confirm Handover" and wait for API response
    const handoverResponsePromise = page.waitForResponse(
      r => r.url().includes('/api/orders/returns-handover') && r.status() === 200
    )
    await page.locator('button:has-text("Confirm Handover")').click()
    await handoverResponsePromise

    // Verify order in database now has returns_handed_at set
    const { data: updatedOrder } = await db
      .from('orders')
      .select('returns_handed_at')
      .eq('id', order!.id)
      .single()

    expect(updatedOrder?.returns_handed_at).not.toBeNull()
  })
})
