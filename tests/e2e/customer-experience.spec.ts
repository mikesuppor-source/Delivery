import { test, expect } from 'playwright/test'
import { signInOwner, seeded } from './helpers'

test.describe('Phase 5: Customer Experience & Order Intake', () => {
  test('public /send: creates walk-in retail parcel order with live tracking confirmation', async ({ page }) => {
    test.slow()
    // 1. Visit public booking page without login
    await page.goto('/send')
    await expect(page.locator('h1:has-text("Cedar Delivery"), h2:has-text("Send a Parcel")').first()).toBeVisible()

    // 2. Fill in Sender details
    await page.locator('#send-sender-name').fill('Lina Hadad')
    await page.locator('#send-sender-phone').fill('70 123 456')
    await page.locator('#send-sender-address').fill('Hamra Makdissi St, Building Plaza 3rd floor')

    // 3. Fill in Recipient details
    await page.locator('#send-recipient-name').fill('Tarek Kassir')
    await page.locator('#send-recipient-phone').fill('03 987 654')
    await page.locator('#send-recipient-address').fill('Jounieh Old Souk near Sea Port')

    // 4. Fill in COD amount
    await page.locator('#send-collection-usd').fill('45.00')

    // 5. Submit parcel booking
    const sendReqPromise = page.waitForResponse(
      r => r.url().includes('/api/send') && r.status() === 200
    )
    await page.locator('#send-submit-btn').click()
    const sendRes = await sendReqPromise
    const resData = await sendRes.json()

    expect(resData.success).toBe(true)
    expect(resData.order?.code).toBeTruthy()
    expect(resData.order?.trackingToken).toBeTruthy()

    // 6. Verify confirmation screen
    await expect(page.locator('text=Parcel Booked Successfully!')).toBeVisible()
    await expect(page.locator(`text=${resData.order.code}`)).toBeVisible()
    await expect(page.locator('a:has-text("Track Parcel Live")')).toBeVisible()

    // 7. Verify database record is assigned to Walk-in shop
    const { db, workspaceId } = await seeded()
    const { data: orderInDb } = await db
      .from('orders')
      .select('id, code, status, shop_id, shops!orders_shop_id_fkey(is_walkin)')
      .eq('code', resData.order.code)
      .eq('workspace_id', workspaceId)
      .single()

    expect(orderInDb).toBeTruthy()
    expect(orderInDb?.status).toBe('pending')
    expect((orderInDb?.shops as any)?.is_walkin).toBe(true)
  })

  test('desk quick order: parses WhatsApp message and auto-populates fields', async ({ page }) => {
    test.slow()
    await signInOwner(page)
    await page.goto('/orders/new')

    // Expect Quick WhatsApp / Phone Order Intake panel
    await expect(page.locator('text=Quick WhatsApp / Phone Order Intake')).toBeVisible()

    // Paste formatted message into textarea
    const sampleMessage = `Name: Maya Salem
Phone: 76 111 222
Address: Achrafieh Sassine, Near ABC Mall
COD: $65
Notes: Urgent evening delivery`

    await page.locator('textarea[placeholder*="Paste order message"]').fill(sampleMessage)
    await page.locator('button:has-text("Parse & Fill")').click()

    // Assert auto-filled fields
    await expect(page.locator('#recipient-name')).toHaveValue('Maya Salem')
    await expect(page.locator('#recipient-phone')).toHaveValue('+961 76 111 222')
    await expect(page.locator('#new-order-address')).toHaveValue('Achrafieh Sassine, Near ABC Mall')
    await expect(page.locator('#net-item-price')).toHaveValue('65')
    await expect(page.locator('#order-notes')).toHaveValue('Urgent evening delivery')

    // Select shop if needed
    await page.locator('#shop-id').selectOption({ index: 1 })
    const areaVal = await page.locator('#area-id').inputValue()
    if (!areaVal) {
      await page.locator('#area-id').selectOption({ index: 1 })
    }

    // Submit order
    const createReq = page.waitForResponse(
      r => r.url().includes('/api/orders') && r.status() === 200
    )
    await page.locator('button:has-text("Create Order")').first().click()
    await createReq

    // Wait for redirect to /orders
    await page.waitForURL('**/orders')
    await expect(page.locator('text=Maya Salem').first()).toBeVisible()
  })

  test('customer tracking: delivered parcel accepts interactive 1-5 star rating and prevents duplicates', async ({ page }) => {
    test.slow()
    const { db, workspaceId, shopId, areaId, courierId } = await seeded()

    // Seed a delivered order with a unique tracking token
    const orderCode = 'RAT-' + Math.random().toString(36).slice(2, 7).toUpperCase()
    const token = Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')

    const { data: order, error } = await db
      .from('orders')
      .insert({
        workspace_id: workspaceId,
        shop_id: shopId,
        area_id: areaId,
        driver_id: courierId,
        code: orderCode,
        tracking_token: token,
        status: 'delivered',
        delivered_at: new Date().toISOString(),
        usd_to_lbp_rate: 89500,
        collection_usd: 25,
        delivery_fee_usd: 3,
        driver_pay_usd: 2,
        recipient_name: 'Karim Testing Ratings',
        recipient_phone: '+961 3 444 555',
        recipient_address: 'Badaro Main Street, Building 5',
      })
      .select('id, code, tracking_token')
      .single()

    expect(error).toBeNull()
    expect(order).toBeTruthy()

    // Visit public tracking page with token
    await page.goto(`/track/${token}`)
    await expect(page.locator(`text=${orderCode}`)).toBeVisible()
    await expect(page.locator('text=Package Delivered')).toBeVisible()

    // Expect Rating prompt
    await expect(page.locator('text=How was your delivery?')).toBeVisible()

    // Click 5 stars
    await page.locator('button[aria-label="5 star"]').click()
    await expect(page.locator('text=Outstanding!')).toBeVisible()

    // Enter comment
    await page.locator('textarea[placeholder*="Optional comment"]').fill('Super fast and friendly delivery!')

    // Submit rating
    const ratingReq = page.waitForResponse(
      r => r.url().includes('/api/orders') && r.url().includes('rating') && r.status() === 200
    )
    await page.locator('button:has-text("Submit Rating")').click()
    await ratingReq

    // Expect thank you message
    await expect(page.locator('text=Thank You for Your Feedback!')).toBeVisible()
    await expect(page.locator('text=You rated this delivery 5 out of 5 stars')).toBeVisible()

    // Reload page to verify rating persistence
    await page.reload()
    await expect(page.locator('text=Thank You for Your Feedback!')).toBeVisible()
    await expect(page.locator('text=You rated this delivery 5 out of 5 stars')).toBeVisible()
  })

  test('live fleet map: renders couriers and opens active stops drawer on selection', async ({ page }) => {
    test.slow()
    const { db, workspaceId, courierId } = await seeded()

    // Update courier GPS coordinates to active position in Beirut
    await db
      .from('drivers')
      .update({
        current_lat: 33.8938,
        current_lng: 35.5018,
        last_location_at: new Date().toISOString(),
      })
      .eq('id', courierId)

    await signInOwner(page)
    await page.goto('/map')

    // Expect Live Map page header
    await expect(page.locator('h1:has-text("Live Courier Map")')).toBeVisible()

    // Expect Fleet Directory
    await expect(page.locator('text=Fleet Directory')).toBeVisible()
    await expect(page.locator('text=Rami Courier').first()).toBeVisible()

    // Click on courier in directory to open drawer
    await page.locator('div:has-text("Rami Courier")').last().click()

    // Expect Courier details drawer with status and action buttons
    await expect(page.locator('h3:has-text("Rami Courier")')).toBeVisible()
    await expect(page.locator('text=Last GPS:')).toBeVisible()
    await expect(page.locator('button:has-text("✕ Close")')).toBeVisible()
  })
})
