import { NextResponse } from 'next/server';
import { api } from '@/lib/api';
import { ilikeAny, searchTerm } from '@/lib/validation';
import { authenticated } from '@/lib/access';

export const GET = api(async (req) => {
  const { client } = await authenticated();
  const url = new URL(req.url);
  const rawPhone = url.searchParams.get('phone');
  const query = url.searchParams.get('q');

  // Direct phone lookup
  if (rawPhone) {
    const cleanPhone = rawPhone.replace(/[^0-9+]/g, '');
    if (cleanPhone.length < 4) {
      return NextResponse.json({ customer: null });
    }

    const { data: customer, error } = await client
      .from('customers')
      .select('id, name, phone, governorate, caza, town, address, notes, orders_count, last_order_at')
      .ilike('phone', `%${cleanPhone}%`)
      .order('last_order_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Customer phone lookup error:', error);
      return NextResponse.json({ customer: null });
    }

    return NextResponse.json({ customer });
  }

  // Multi-result autocomplete query
  if (query) {
    const q = searchTerm(query, 60);
    const cleanQ = q.replace(/[^0-9+]/g, '');

    let builder = client
      .from('customers')
      .select('id, name, phone, governorate, caza, town, address, notes, orders_count, last_order_at')
      .order('orders_count', { ascending: false })
      .limit(6);

    if (cleanQ.length >= 3) {
      builder = builder.or(ilikeAny(['phone'], cleanQ) + ',' + ilikeAny(['name'], q));
    } else {
      builder = builder.ilike('name', `%${q}%`);
    }

    const { data: customers, error } = await builder;
    if (error) {
      console.error('Customer search error:', error);
      return NextResponse.json({ customers: [] });
    }

    return NextResponse.json({ customers: customers || [] });
  }

  return NextResponse.json({ customer: null, customers: [] });
});
