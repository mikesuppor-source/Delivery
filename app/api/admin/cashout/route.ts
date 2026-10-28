import { NextResponse } from 'next/server';
import { api, ApiError, checked } from '@/lib/api';
import { id, parseBody, text, z } from '@/lib/validation';

const CashoutDecision = z.object({
  workspaceId: id,
  requestId: id,
  action: z.enum(['approve', 'reject', 'mark_paid']),
  notes: text(500),
});
import { workspaceAccess } from '@/lib/access';

export const GET = api(async (req) => {
  const url = new URL(req.url);
  const workspaceId = url.searchParams.get('workspaceId');
  const { db, workspaceId: id } = await workspaceAccess(workspaceId);

  const requests = checked(
    await db
      .from('cashout_requests')
      .select('*, shop:shop_id(id, name, phone)')
      .eq('workspace_id', id)
      .order('created_at', { ascending: false })
  );

  return NextResponse.json({ requests: requests || [] });
});

export const PATCH = api(async (req) => {
  const body = await parseBody(req, CashoutDecision);
  const { db, user, workspaceId } = await workspaceAccess(body.workspaceId);
  const { requestId, action } = body;

  const request = checked(
    await db
      .from('cashout_requests')
      .select('*')
      .eq('id', requestId)
      .eq('workspace_id', workspaceId)
      .single()
  );

  // Each update only applies from the expected status, so double clicks and stale screens get a 409.
  if (action === 'reject') {
    const updated = await db
      .from('cashout_requests')
      .update({
        status: 'rejected',
        notes: body.notes ? `[Rejected: ${body.notes}] ` + (request.notes || '') : request.notes,
        processed_by: user.id,
        processed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', requestId)
      .eq('workspace_id', workspaceId)
      .in('status', ['pending', 'approved'])
      .select('*')
      .maybeSingle();
    if (!updated.error && !updated.data) throw new ApiError(409, `This request is already ${request.status}`);

    return NextResponse.json({ success: true, request: checked(updated), message: 'Request marked as rejected.' });
  }

  if (action === 'approve') {
    const updated = await db
      .from('cashout_requests')
      .update({
        status: 'approved',
        processed_by: user.id,
        processed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', requestId)
      .eq('workspace_id', workspaceId)
      .eq('status', 'pending')
      .select('*')
      .maybeSingle();
    if (!updated.error && !updated.data) throw new ApiError(409, `This request is already ${request.status}`);

    return NextResponse.json({ success: true, request: checked(updated), message: 'Request approved.' });
  }

  if (action === 'mark_paid') {
    // One database transaction: locks the request, refuses anything already paid or rejected,
    // and uses the request ID as the settlement's idempotency key.
    const settlementId = checked(
      await db.rpc('mark_cashout_paid', { p_request: requestId, p_workspace: workspaceId, p_user: user.id })
    );
    const [updated, settlement] = await Promise.all([
      db.from('cashout_requests').select('*').eq('id', requestId).single(),
      db.from('settlements').select('*').eq('id', settlementId).single(),
    ]);

    return NextResponse.json({
      success: true,
      request: checked(updated),
      settlement: checked(settlement),
      message: `Settlement generated and payout of $${Number(request.amount_usd).toFixed(2)} marked as paid!`,
    });
  }

  throw new ApiError(400, 'Invalid action. Supported: approve, reject, mark_paid');
});
