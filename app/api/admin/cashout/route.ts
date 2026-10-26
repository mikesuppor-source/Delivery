import { NextResponse } from 'next/server';
import { api, ApiError, checked, textField, uuid } from '@/lib/api';
import { workspaceAccess } from '@/lib/access';

export const GET = api(async (req) => {
  const url = new URL(req.url);
  const workspaceId = url.searchParams.get('workspaceId');
  const { db } = await workspaceAccess(workspaceId);

  const { data: requests, error } = await db
    .from('cashout_requests')
    .select('*, shop:shop_id(id, name, phone)')
    .order('created_at', { ascending: false });

  if (error) throw new ApiError(500, error.message);

  return NextResponse.json({ requests: requests || [] });
});

export const PATCH = api(async (req) => {
  const body = await req.json();
  const { db, user, workspaceId } = await workspaceAccess(body.workspaceId);
  const requestId = uuid(body.requestId, 'cashout request ID');
  const action = textField(body.action, 'action', 20); // 'approve', 'reject', 'mark_paid'

  const request = checked(
    await db
      .from('cashout_requests')
      .select('*')
      .eq('id', requestId)
      .eq('workspace_id', workspaceId)
      .single()
  );

  if (action === 'reject') {
    const updated = checked(
      await db
        .from('cashout_requests')
        .update({
          status: 'rejected',
          notes: body.notes ? `[Rejected: ${textField(body.notes, 'rejection reason', 500)}] ` + (request.notes || '') : request.notes,
          processed_by: user.id,
          processed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', requestId)
        .select('*')
        .single()
    );

    return NextResponse.json({ success: true, request: updated, message: 'Request marked as rejected.' });
  }

  if (action === 'approve') {
    const updated = checked(
      await db
        .from('cashout_requests')
        .update({
          status: 'approved',
          processed_by: user.id,
          processed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', requestId)
        .select('*')
        .single()
    );

    return NextResponse.json({ success: true, request: updated, message: 'Request approved.' });
  }

  if (action === 'mark_paid') {
    // 1. Fetch workspace exchange rate
    const ws = checked(await db.from('workspaces').select('usd_to_lbp').eq('id', workspaceId).single());
    const rate = Number(ws?.usd_to_lbp) || 89500;

    // 2. Create settlement record
    const settlement = checked(
      await db
        .from('settlements')
        .insert({
          workspace_id: workspaceId,
          shop_id: request.shop_id,
          type: 'shop_payment',
          amount_usd: request.amount_usd,
          amount_lbp: request.amount_lbp || 0,
          usd_to_lbp: rate,
          note: `Payout via ${request.method} (${request.account_details})` + (request.notes ? ` - ${request.notes}` : ''),
          created_by: user.id,
        })
        .select('*')
        .single()
    );

    // 2. Mark request as paid
    const updated = checked(
      await db
        .from('cashout_requests')
        .update({
          status: 'paid',
          processed_by: user.id,
          processed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', requestId)
        .select('*')
        .single()
    );

    return NextResponse.json({
      success: true,
      request: updated,
      settlement,
      message: `Settlement generated and payout of $${Number(request.amount_usd).toFixed(2)} marked as paid!`,
    });
  }

  throw new ApiError(400, 'Invalid action. Supported: approve, reject, mark_paid');
});
