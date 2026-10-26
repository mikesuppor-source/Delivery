import { NextResponse } from 'next/server';
import { api, ApiError, checked, money, textField } from '@/lib/api';
import { shopAccess } from '@/lib/access';

export const GET = api(async () => {
  const { db, shop } = await shopAccess();

  // 1. Fetch all delivered orders to calculate gross delivered merchant balance
  const { data: deliveredOrders, error: ordersErr } = await db
    .from('orders')
    .select('id, collection_usd, delivery_fee_usd, shop_balance_usd, usd_to_lbp_rate')
    .eq('shop_id', shop.id)
    .eq('status', 'delivered');

  if (ordersErr) throw new ApiError(500, ordersErr.message);

  const grossDeliveredUsd = (deliveredOrders || []).reduce(
    (sum, o) => sum + (Number(o.shop_balance_usd) || 0),
    0
  );

  // 2. Fetch existing settlements for this shop
  const { data: settlements, error: settleErr } = await db
    .from('settlements')
    .select('amount_usd')
    .eq('shop_id', shop.id)
    .eq('type', 'shop_payment');

  if (settleErr) throw new ApiError(500, settleErr.message);

  const settledUsd = (settlements || []).reduce(
    (sum, s) => sum + (Number(s.amount_usd) || 0),
    0
  );

  // 3. Fetch cashout requests
  const { data: requests, error: reqErr } = await db
    .from('cashout_requests')
    .select('*')
    .eq('shop_id', shop.id)
    .order('created_at', { ascending: false });

  if (reqErr) throw new ApiError(500, reqErr.message);

  // Pending cashout requests count against available balance
  const pendingOrPaidCashoutsUsd = (requests || [])
    .filter((r) => r.status === 'pending' || r.status === 'approved')
    .reduce((sum, r) => sum + (Number(r.amount_usd) || 0), 0);

  const availableUsd = Math.max(0, Math.round((grossDeliveredUsd - settledUsd - pendingOrPaidCashoutsUsd) * 100) / 100);

  // Get workspace exchange rate
  const { data: ws } = await db
    .from('workspaces')
    .select('usd_to_lbp')
    .eq('id', shop.workspace_id)
    .single();

  const rate = Number(ws?.usd_to_lbp) || 89500;
  const availableLbp = Math.round(availableUsd * rate);

  return NextResponse.json({
    requests: requests || [],
    availableUsd,
    availableLbp,
    rate,
    grossDeliveredUsd: Math.round(grossDeliveredUsd * 100) / 100,
    settledUsd: Math.round(settledUsd * 100) / 100,
  });
});

export const POST = api(async (req) => {
  const { db, shop } = await shopAccess();
  const body = await req.json();

  const amountUsd = money(body.amountUsd, 'requested USD amount');
  if (amountUsd <= 0) {
    throw new ApiError(400, 'Requested amount must be greater than $0.00');
  }

  const method = textField(body.method, 'transfer method', 50) || 'whish';
  const accountDetails = textField(body.accountDetails, 'account details / recipient phone', 500, true);
  const notes = textField(body.notes, 'notes', 1000);

  // Calculate current available balance
  const { data: deliveredOrders } = await db
    .from('orders')
    .select('shop_balance_usd')
    .eq('shop_id', shop.id)
    .eq('status', 'delivered');

  const grossDeliveredUsd = (deliveredOrders || []).reduce(
    (sum, o) => sum + (Number(o.shop_balance_usd) || 0),
    0
  );

  const { data: settlements } = await db
    .from('settlements')
    .select('amount_usd')
    .eq('shop_id', shop.id)
    .eq('type', 'shop_payment');

  const settledUsd = (settlements || []).reduce(
    (sum, s) => sum + (Number(s.amount_usd) || 0),
    0
  );

  const { data: requests } = await db
    .from('cashout_requests')
    .select('amount_usd, status')
    .eq('shop_id', shop.id);

  const pendingCashoutsUsd = (requests || [])
    .filter((r) => r.status === 'pending' || r.status === 'approved')
    .reduce((sum, r) => sum + (Number(r.amount_usd) || 0), 0);

  const availableUsd = Math.max(0, Math.round((grossDeliveredUsd - settledUsd - pendingCashoutsUsd) * 100) / 100);

  if (amountUsd > availableUsd) {
    throw new ApiError(
      400,
      `Requested amount ($${amountUsd.toFixed(2)}) exceeds eligible available balance ($${availableUsd.toFixed(2)}).`
    );
  }

  const { data: ws } = await db
    .from('workspaces')
    .select('usd_to_lbp')
    .eq('id', shop.workspace_id)
    .single();

  const rate = Number(ws?.usd_to_lbp) || 89500;
  const amountLbp = Math.round(amountUsd * rate);

  const cashout = checked(
    await db
      .from('cashout_requests')
      .insert({
        workspace_id: shop.workspace_id,
        shop_id: shop.id,
        amount_usd: amountUsd,
        amount_lbp: amountLbp,
        method,
        account_details: accountDetails,
        notes,
        status: 'pending',
      })
      .select('*')
      .single()
  );

  return NextResponse.json({
    success: true,
    cashout,
    message: `Payout request for $${amountUsd.toFixed(2)} submitted successfully.`,
  });
});
