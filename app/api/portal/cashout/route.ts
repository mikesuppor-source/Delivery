import { NextResponse } from 'next/server';
import { api, ApiError, checked, money, textField } from '@/lib/api';
import { shopAccess } from '@/lib/access';

export const GET = api(async () => {
  const { db, shop } = await shopAccess();

  // 1. Fetch cashout requests
  const { data: requests, error: reqErr } = await db
    .from('cashout_requests')
    .select('*')
    .eq('shop_id', shop.id)
    .order('created_at', { ascending: false });

  if (reqErr) throw new ApiError(500, reqErr.message);

  // 2. Real running merchant balance from shop table (maintained by double-entry accounting triggers)
  const currentShopBalance = Number(shop.balance_usd) || 0;

  // Pending cashout requests count against available balance
  const pendingOrPaidCashoutsUsd = (requests || [])
    .filter((r) => r.status === 'pending' || r.status === 'approved')
    .reduce((sum, r) => sum + (Number(r.amount_usd) || 0), 0);

  const availableUsd = Math.max(0, Math.round((currentShopBalance - pendingOrPaidCashoutsUsd) * 100) / 100);

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
    currentShopBalance: Math.round(currentShopBalance * 100) / 100,
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

  // Balance check and insert happen in one locked transaction, so parallel requests cannot overdraw.
  const cashout = checked(
    await db.rpc('request_shop_cashout', {
      p_shop: shop.id,
      p_amount: amountUsd,
      p_method: method,
      p_details: accountDetails,
      p_notes: notes,
    })
  );

  return NextResponse.json({
    success: true,
    cashout,
    message: `Payout request for $${amountUsd.toFixed(2)} submitted successfully.`,
  });
});
