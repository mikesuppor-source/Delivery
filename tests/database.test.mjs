import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync,readdirSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
test('migrations, isolation, atomic accounting, and idempotency',async t=>{
 const db=new PGlite({extensions:{pgcrypto}})
 try{
 await db.exec(`
 create schema auth; create schema storage;
 create role anon; create role authenticated; create role service_role bypassrls;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.user_id',true),'')::uuid $$;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 grant usage on schema public,auth to anon,authenticated,service_role;
 grant execute on function auth.uid() to anon,authenticated,service_role;
 alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
 `)
 for(const file of readdirSync('supabase/migrations').filter(n=>n.endsWith('.sql')).sort()){
  try{await db.exec(readFileSync('supabase/migrations/'+file,'utf8'))}catch(e){throw new Error('Migration '+file+': '+e.message)}
 }
 const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0')
 const [a,b,owner,merchant,driver,shop,otherShop,drv]=[1,2,3,4,5,6,7,8].map(id)
 await db.query("insert into auth.users values($1,'owner@test.invalid',now()),($2,'merchant@test.invalid',now()),($3,'driver@test.invalid',now())",[owner,merchant,driver])
 await db.query("insert into workspaces(id,name,slug) values($1,'A','a'),($2,'B','b')",[a,b])
 await db.query("insert into workspace_members(workspace_id,user_id,role) values($1,$2,'owner'),($1,$3,'readonly'),($1,$4,'driver')",[a,owner,merchant,driver])
 await db.query("insert into shops(id,workspace_id,name,user_id) values($1,$2,'Own shop',$3),($4,$5,'Other shop',null)",[shop,a,merchant,otherShop,b])
 await db.query("insert into drivers(id,workspace_id,name,user_id) values($1,$2,'Driver',$3)",[drv,a,driver])
 const order=id(10)
 await db.query("insert into orders(id,workspace_id,shop_id,driver_id,usd_to_lbp_rate,collection_usd,delivery_fee_usd,driver_pay_usd) values($1,$2,$3,$4,100000,100,3,2)",[order,a,shop,drv])
 const balance=async()=>{const d=(await db.query('select cash_held_usd,cash_held_lbp,pay_owed_usd from drivers where id=$1',[drv])).rows[0];const s=(await db.query('select balance_usd from shops where id=$1',[shop])).rows[0];return Object.fromEntries(Object.entries({...d,...s}).map(([k,v])=>[k,Number(v)]))}
 await t.test('delivery, notes-only edit, financial correction, reopening',async()=>{
  await db.query("update orders set status='delivered' where id=$1",[order])
  assert.deepEqual(await balance(),{cash_held_usd:100,cash_held_lbp:0,pay_owed_usd:2,balance_usd:97})
  await db.query("update orders set notes='changed' where id=$1",[order])
  assert.deepEqual(await balance(),{cash_held_usd:100,cash_held_lbp:0,pay_owed_usd:2,balance_usd:97})
  await db.query("update orders set collection_usd=120 where id=$1",[order])
  assert.equal((await balance()).cash_held_usd,120);assert.equal((await balance()).balance_usd,117)
  await db.query("update orders set status='picked_up' where id=$1",[order])
  assert.deepEqual(await balance(),{cash_held_usd:0,cash_held_lbp:0,pay_owed_usd:0,balance_usd:0})
 })
 await t.test('mixed currency, settlement retries and rollback',async()=>{
  await db.query("update orders set status='delivered',pod_collected_usd=20,pod_collected_lbp=10000000 where id=$1",[order])
  assert.equal((await balance()).cash_held_usd,20);assert.equal((await balance()).cash_held_lbp,10000000)
  const sql="insert into settlements(workspace_id,type,amount_usd,amount_lbp,usd_to_lbp,driver_id,idempotency_key) values($1,'driver_cash_remittance',10,5000000,100000,$2,$3)"
  await db.query(sql,[a,drv,id(20)])
  assert.equal((await balance()).cash_held_usd,10)
  await assert.rejects(db.query(sql,[a,drv,id(20)]),/duplicate/)
  await assert.rejects(db.query("insert into settlements(workspace_id,type,amount_usd,usd_to_lbp,driver_id) values($1,'driver_cash_remittance',999,100000,$2)",[a,drv]),/exceeds/)
  assert.equal((await balance()).cash_held_usd,10)
  assert.equal((await db.query('select count(*) from settlements')).rows[0].count,1)
 })
 await t.test('tenant references and completed deletion rejected',async()=>{
  await assert.rejects(db.query("insert into orders(workspace_id,shop_id,usd_to_lbp_rate) values($1,$2,100000)",[a,otherShop]),/foreign key/)
  await assert.rejects(db.query('delete from orders where id=$1',[order]),/permanent deletion/)
  await assert.rejects(db.query("update orders set status='cancelled' where id=$1",[order]),/Only pending/)
 })
 await t.test('owner deletion succeeds when authorized session flag is active',async()=>{
  const testOrder = id(11)
  await db.query("insert into orders(id,workspace_id,shop_id,usd_to_lbp_rate,collection_usd) values($1,$2,$3,100000,50)",[testOrder,a,shop])
  await assert.rejects(db.query('delete from orders where id=$1',[testOrder]),/permanent deletion/)
  await db.exec("select set_allow_owner_delete(true)")
  await db.query('delete from order_events where order_id=$1',[testOrder])
  await db.query('delete from orders where id=$1',[testOrder])
  await db.exec("select set_allow_owner_delete(false)")
  assert.equal((await db.query('select count(*) from orders where id=$1',[testOrder])).rows[0].count, 0)
 })
 await t.test('shopify identity is unique and cancellation preserves records',async()=>{
  await db.query("insert into orders(workspace_id,shop_id,usd_to_lbp_rate,shopify_order_id) values($1,$2,100000,'external-1')",[a,shop])
  await assert.rejects(db.query("insert into orders(workspace_id,shop_id,usd_to_lbp_rate,shopify_order_id) values($1,$2,100000,'external-1')",[a,shop]),/duplicate/)
  await db.exec("update orders set status='cancelled' where shopify_order_id='external-1'")
  assert.equal((await db.query("select status from orders where shopify_order_id='external-1'")).rows[0].status,'cancelled')
 })
 await t.test('merchant RLS cannot view another shop or secrets or directly mutate orders',async()=>{
  await db.query("insert into orders(workspace_id,shop_id,usd_to_lbp_rate) values($1,$2,100000)",[b,otherShop])
  await db.query("select set_config('test.user_id',$1,false)",[merchant]);await db.exec('set role authenticated')
  assert.equal((await db.query('select my_role($1)',[a])).rows[0].my_role,null)
  assert.equal((await db.query('select count(*) from orders where workspace_id=$1',[b])).rows[0].count,0)
  await assert.rejects(db.query('select * from shop_integrations'),/permission denied/)
  await assert.rejects(db.query("update orders set status='failed'"),/permission denied/)
  assert.equal((await db.query('select count(*) from invitations')).rows[0].count,0)
  await db.exec('reset role')
 })
 await t.test('driver sees only assigned orders; anonymous cannot enumerate invites',async()=>{
  await db.query("select set_config('test.user_id',$1,false)",[driver]);await db.exec('set role authenticated')
  assert.equal((await db.query('select count(*) from orders')).rows[0].count,1)
  await db.exec('reset role; set role anon')
  await assert.rejects(db.query('select * from invitations'),/permission denied/)
  await db.exec('reset role')
 })
 await t.test('ledger reconciles to materialized balances',async()=>{
  const row=(await db.query('select sum(cash_delta) cash,sum(lbp_delta) lbp,sum(pay_delta) pay from money_ledger where driver_id=$1',[drv])).rows[0]
  const actual=await balance()
  assert.equal(Number(row.cash),actual.cash_held_usd);assert.equal(Number(row.lbp),actual.cash_held_lbp);assert.equal(Number(row.pay),actual.pay_owed_usd)
 })
 await t.test('fee added on top of net item value delivers exact net payout to merchant',async()=>{
  const feeAddedOrder = id(99)
  const netItemVal = 25.00
  const deliveryFee = 3.00
  const driverPay = 2.00
  const totalCod = netItemVal + deliveryFee // 28.00
  await db.query("insert into orders(id,workspace_id,shop_id,driver_id,usd_to_lbp_rate,collection_usd,delivery_fee_usd,driver_pay_usd) values($1,$2,$3,$4,89500,$5,$6,$7)",[feeAddedOrder,a,shop,drv,totalCod,deliveryFee,driverPay])
  const row = (await db.query('select collection_usd, delivery_fee_usd, shop_balance_usd from orders where id=$1',[feeAddedOrder])).rows[0]
  assert.equal(Number(row.collection_usd), 28.00)
  assert.equal(Number(row.delivery_fee_usd), 3.00)
  assert.equal(Number(row.shop_balance_usd), 25.00) // Exact Net Item Value!
 })
 await t.test('courier PINs are hashed, matched on the exact phone, and hidden from app users',async()=>{
  assert.equal((await db.query("select count(*) from information_schema.columns where table_name='drivers' and column_name='pin_code'")).rows[0].count,0)
  await db.query("update drivers set phone='+961 71 123 456' where id=$1",[drv])
  await db.query("select set_driver_pin($1,'482913')",[drv])
  const cred=(await db.query('select pin_hash,session_version from driver_credentials where driver_id=$1',[drv])).rows[0]
  assert.notEqual(cred.pin_hash,'482913');assert.equal(cred.session_version,1)
  const login=async(phone,pin)=>(await db.query('select * from verify_driver_login($1,$2)',[phone,pin])).rows
  for(const phone of ['71123456','071 123 456','+96171123456'])assert.equal((await login(phone,'482913'))[0]?.driver_id,drv,phone)
  assert.equal((await login('71123456','000000')).length,0)
  assert.equal((await login('1123456','482913')).length,0) // part of a number no longer matches
  await db.query("update drivers set active=false where id=$1",[drv])
  assert.equal((await login('71123456','482913')).length,0)
  await db.query("update drivers set active=true where id=$1",[drv])
  await db.query("select set_driver_pin($1,'735190')",[drv])
  assert.equal((await db.query('select session_version from driver_credentials where driver_id=$1',[drv])).rows[0].session_version,2)
  assert.equal((await login('71123456','482913')).length,0)
  assert.equal((await login('71123456','735190'))[0].session_version,2)
  await assert.rejects(db.query("select set_driver_pin($1,'12ab')",[drv]),/4 to 8 digits/)
  await db.query("select set_config('test.user_id',$1,false)",[owner]);await db.exec('set role authenticated')
  await assert.rejects(db.query('select * from driver_credentials'),/permission denied/)
  await assert.rejects(db.query("select * from verify_driver_login('71123456','735190')"),/permission denied/)
  await db.exec('reset role')
 })
 await t.test('public phone tracking needs the exact number and never returns addresses',async()=>{
  await db.query("insert into orders(workspace_id,shop_id,driver_id,usd_to_lbp_rate,recipient_phone,recipient_address) values($1,$2,$3,100000,'+961 3 123 456','Secret street 5')",[a,shop,drv])
  const track=async phone=>(await db.query('select track_orders_by_phone($1) as r',[phone])).rows[0].r
  const found=await track('03123456')
  assert.equal(found.length,1)
  assert.equal(JSON.stringify(found).includes('Secret street'),false)
  assert.equal(found[0].driver.id,undefined)
  assert.deepEqual(await track('123'),[])
  assert.deepEqual(await track('3123'),[])
  await db.exec('set role anon')
  await assert.rejects(db.query("select track_orders_by_phone('03123456')"),/permission denied/)
  await db.exec('reset role')
 })
 await t.test('merchant payouts cannot overdraw, be written directly, or be paid twice',async()=>{
  await db.query('update shops set balance_usd=50 where id=$1',[shop])
  const request=async amount=>(await db.query("select (request_shop_cashout($1,$2,'whish','71123456','')).id",[shop,amount])).rows[0].id
  const first=await request(30)
  await assert.rejects(request(30),/exceeds eligible available balance/)
  await request(20)
  await assert.rejects(request(0.01),/exceeds/)
  await db.query("select set_config('test.user_id',$1,false)",[merchant]);await db.exec('set role authenticated')
  await assert.rejects(db.query("insert into cashout_requests(workspace_id,shop_id,amount_usd,account_details,status) values($1,$2,999,'x','approved')",[a,shop]),/permission denied/)
  await db.exec('reset role')
  await db.query("select set_config('test.user_id',$1,false)",[driver]);await db.exec('set role authenticated')
  assert.equal((await db.query('select count(*) from cashout_requests')).rows[0].count,0) // couriers cannot see payout details
  await db.exec('reset role')
  await assert.rejects(db.query('select mark_cashout_paid($1,$2,$3)',[first,b,owner]),/not found/)
  await db.query('select mark_cashout_paid($1,$2,$3)',[first,a,owner])
  await assert.rejects(db.query('select mark_cashout_paid($1,$2,$3)',[first,a,owner]),/already paid/)
  assert.equal((await db.query('select count(*) from settlements where idempotency_key=$1',[first])).rows[0].count,1)
  assert.equal(Number((await db.query('select balance_usd from shops where id=$1',[shop])).rows[0].balance_usd),20)
assert.equal((await db.query('select status from cashout_requests where id=$1',[first])).rows[0].status,'paid')
 })
  await t.test('shop_area_prices RLS, cross-workspace isolation, and returns accounting',async()=>{
   const areaA = id(30)
   const areaB = id(31)
   await db.query("insert into delivery_areas(id,workspace_id,name,fee_usd,driver_pay_usd,return_fee_usd,return_driver_pay_usd) values($1,$2,'Zone A',8,1,2,1)",[areaA,a])
   await db.query("insert into delivery_areas(id,workspace_id,name,fee_usd,driver_pay_usd,return_fee_usd,return_driver_pay_usd) values($1,$2,'Zone B',10,3,3,1.50)",[areaB,b])

   // Cross-workspace foreign key rejects mixing workspace A shop with workspace B zone
   await assert.rejects(
     db.query("insert into shop_area_prices(workspace_id,shop_id,area_id,fee_usd) values($1,$2,$3,7)",[a,shop,areaB]),
     /foreign key/i
   )

   // Service role / staff can insert price for workspace A
   await db.query("insert into shop_area_prices(workspace_id,shop_id,area_id,fee_usd) values($1,$2,$3,6.50)",[a,shop,areaA])

   // Staff (owner) reads price
   await db.query("select set_config('test.user_id',$1,false)",[owner]);await db.exec('set role authenticated')
   assert.equal((await db.query("select count(*) from shop_area_prices where shop_id=$1",[shop])).rows[0].count, 1)

   // Direct writes from app users are revoked
   await assert.rejects(
     db.query("update shop_area_prices set fee_usd=5 where shop_id=$1",[shop]),
     /permission denied/i
   )
   await db.exec('reset role')

   // Merchant (owning shop) reads their special price
   await db.query("select set_config('test.user_id',$1,false)",[merchant]);await db.exec('set role authenticated')
   assert.equal((await db.query("select count(*) from shop_area_prices where shop_id=$1",[shop])).rows[0].count, 1)
   await db.exec('reset role')

   // Return parcel accounting: customer pays 0, return fee is charged to shop, courier earns return pay
   const returnOrder = id(32)
   const shopBefore = Number((await db.query('select balance_usd from shops where id=$1',[shop])).rows[0].balance_usd)
   const drvBefore = Number((await db.query('select pay_owed_usd from drivers where id=$1',[drv])).rows[0].pay_owed_usd)
   await db.query("insert into orders(id,workspace_id,shop_id,driver_id,area_id,usd_to_lbp_rate,collection_usd,delivery_fee_usd,driver_pay_usd,status) values($1,$2,$3,$4,$5,89500,0,2,1,'returned')",[returnOrder,a,shop,drv,areaA])

   const shopAfter = Number((await db.query('select balance_usd from shops where id=$1',[shop])).rows[0].balance_usd)
   const drvAfter = Number((await db.query('select pay_owed_usd from drivers where id=$1',[drv])).rows[0].pay_owed_usd)
   assert.equal(shopAfter, shopBefore - 2)
   assert.equal(drvAfter, drvBefore + 1)
  })
  await t.test('saved_views RLS and isolation between users and workspaces', async () => {
    await db.query("select set_config('test.user_id',$1,false)", [owner])
    await db.exec('set role authenticated')
    const viewA = id(33)
    await db.query(
      "insert into saved_views(id, workspace_id, user_id, page, name, filters) values($1, $2, $3, 'orders', 'Unassigned Today', '{\"status\":\"pending\"}')",
      [viewA, a, owner]
    )
    assert.equal(
      Number((await db.query("select count(*) from saved_views where id=$1", [viewA])).rows[0].count),
      1
    )
    await db.exec('reset role')

    await db.query("select set_config('test.user_id',$1,false)", [driver])
    await db.exec('set role authenticated')
    assert.equal(
      Number((await db.query("select count(*) from saved_views where id=$1", [viewA])).rows[0].count),
      0
    )
    await db.exec('reset role')
  })
  await t.test('profit_report SQL function enforces role security and aggregates figures',async()=>{
   // Owner can run profit report
   await db.query("select set_config('test.user_id',$1,false)",[owner]);await db.exec('set role authenticated')
   const reportRes = (await db.query("select profit_report($1, '2020-01-01'::timestamptz, '2030-01-01'::timestamptz) as r",[a])).rows[0].r
   assert.ok(reportRes.totals, 'report has totals')
   assert.ok(Array.isArray(reportRes.by_zone), 'report has by_zone array')
   assert.ok(Array.isArray(reportRes.by_driver), 'report has by_driver array')
   assert.ok(Array.isArray(reportRes.by_shop), 'report has by_shop array')
   await db.exec('reset role')

   // Driver/merchant/unauthorized roles are rejected
   await db.query("select set_config('test.user_id',$1,false)",[driver]);await db.exec('set role authenticated')
   await assert.rejects(
     db.query("select profit_report($1, '2020-01-01'::timestamptz, '2030-01-01'::timestamptz)",[a]),
     /Forbidden/i
   )
   await db.exec('reset role')
  })
   await t.test('warehouse holding, RLS, release rules, and storage fee calculations', async () => {
     await db.query("select set_config('test.user_id',$1,false)", [owner])
     const hubA = id(40)
     await db.query(
       'insert into hubs(id, workspace_id, name, address, is_default, active) values($1, $2, $3, $4, true, true)',
       [hubA, a, 'Main Test Hub', 'Beirut Port']
     )
     const shelfA = id(41)
     await db.query(
       'insert into hub_shelves(id, workspace_id, hub_id, code) values($1, $2, $3, $4)',
       [shelfA, a, hubA, 'SHELF-X1']
     )

     // 1. Cannot hold delivered or cancelled order
     const delivOrder = id(42)
     await db.query(
       "insert into orders(id, workspace_id, shop_id, code, status, usd_to_lbp_rate) values($1, $2, $3, 'CD-DELIV42', 'delivered', 89500)",
       [delivOrder, a, shop]
     )
     await assert.rejects(
       db.query("select hold_order($1, $2, 'SHELF-X1', 'weather'::hold_reason, 'storm', null, $3)", [delivOrder, hubA, owner]),
       /Can only hold orders in pending, assigned, or failed status/i
     )

     // 2. Holding an assigned order clears courier and moves status to pending
     const assignOrder = id(43)
     await db.query(
       "insert into orders(id, workspace_id, shop_id, driver_id, code, status, usd_to_lbp_rate, collection_usd, delivery_fee_usd) values($1, $2, $3, $4, 'CD-HOLD43', 'assigned', 89500, 50, 4)",
       [assignOrder, a, shop, drv]
     )
     const holdRes = (await db.query(
       "select hold_order($1, $2, 'SHELF-X1', 'customer_request'::hold_reason, 'traveling', '2026-11-05'::date, $3) as r",
       [assignOrder, hubA, owner]
     )).rows[0].r
     assert.equal(holdRes.success, true)

     const heldOrderRow = (await db.query('select status, driver_id, is_held, hub_id from orders where id=$1', [assignOrder])).rows[0]
     assert.equal(heldOrderRow.status, 'pending')
     assert.equal(heldOrderRow.driver_id, null)
     assert.equal(heldOrderRow.is_held, true)
     assert.equal(heldOrderRow.hub_id, hubA)

     // 3. Held order cannot be assigned or dispatched until released
     await assert.rejects(
       db.query('update orders set driver_id=$1, status=$2 where id=$3', [drv, 'assigned', assignOrder]),
       /Cannot assign or dispatch a held order until it is released/i
     )

     // 4. Cannot create duplicate open hold on same order
     await assert.rejects(
       db.query("select hold_order($1, $2, 'SHELF-X1', 'weather'::hold_reason, 'again', null, $3)", [assignOrder, hubA, owner]),
       /Order is already on hold in warehouse/i
     )

     // 5. Configure storage fee on delivery area and backdate held_at by 5 days (free days = 2, fee = $1.50)
     const areaWithStorage = id(44)
     await db.query(
       'insert into delivery_areas(id, workspace_id, name, fee_usd, storage_fee_per_day_usd, free_storage_days) values($1, $2, $3, 4, 1.50, 2)',
       [areaWithStorage, a, 'Storage Test Zone']
     )
     await db.query('update orders set area_id=$1 where id=$2', [areaWithStorage, assignOrder])
     await db.query("update order_holds set held_at = now() - interval '5 days' where order_id=$1 and released_at is null", [assignOrder])

     // 6. Release order: calculates storage fee (5 - 2 = 3 days * $1.50 = $4.50)
     const releaseRes = (await db.query(
       "select release_order($1, $2, 'Customer returned from trip') as r",
       [assignOrder, owner]
     )).rows[0].r
     assert.equal(releaseRes.success, true)
     assert.equal(Number(releaseRes.storage_fee_usd), 4.5)

     const releasedOrderRow = (await db.query('select is_held, storage_fee_usd, shop_balance_usd from orders where id=$1', [assignOrder])).rows[0]
     assert.equal(releasedOrderRow.is_held, false)
     assert.equal(Number(releasedOrderRow.storage_fee_usd), 4.5)
     // 50 collection - 4 delivery fee - 4.50 storage fee = 41.50 shop balance
     assert.equal(Number(releasedOrderRow.shop_balance_usd), 41.5)

     // 7. Merchant RLS: merchant can read holds on their own orders
     await db.query("select set_config('test.user_id',$1,false)", [merchant])
     await db.exec('set role authenticated')
     const merchantHolds = (await db.query('select count(*) from order_holds where order_id=$1', [assignOrder])).rows[0].count
     assert.equal(Number(merchantHolds), 1)

     // Direct write on order_holds is forbidden
     await assert.rejects(
       db.query("insert into order_holds(id, workspace_id, order_id, hub_id, reason) values($1, $2, $3, $4, 'other')", [id(45), a, assignOrder, hubA]),
       /permission denied/i
     )
     await db.exec('reset role')

     // 8. Cross-workspace isolation: workspace B cannot see or touch workspace A holds
     const userB = id(49)
     await db.query("insert into auth.users values($1, 'userb@test.invalid', now())", [userB])
     await db.query("insert into workspace_members(workspace_id, user_id, role) values($1, $2, 'owner')", [b, userB])

     await db.query("select set_config('test.user_id',$1,false)", [userB])
     await db.exec('set role authenticated')
     const bHolds = (await db.query('select count(*) from order_holds where workspace_id=$1', [a])).rows[0].count
     assert.equal(Number(bHolds), 0)
     await db.exec('reset role')
   })
 
  await t.test('dispatch pro: pickups isolation, attempts auto-return limit, and handover', async () => {
    const a = id(1), b = id(2), merchant = id(4), shopA = id(6), driverA = id(8)

    // 1. Merchant creates a pickup request
    const pickupId = id(50)
    await db.query(
      "insert into pickups(id, workspace_id, shop_id, status, parcel_count, note) values($1, $2, $3, 'requested', 5, '5 boxes ready at counter')",
      [pickupId, a, shopA]
    )

    // Verify merchant can read their own pickup via RLS
    await db.query("select set_config('test.user_id',$1,false)", [merchant])
    await db.exec('set role authenticated')
    const merchantPickups = (await db.query('select count(*) from pickups where id=$1', [pickupId])).rows[0].count
    assert.equal(Number(merchantPickups), 1)

    // Other workspace cannot see pickup
    const userB = id(49)
    await db.query("select set_config('test.user_id',$1,false)", [userB])
    const bPickups = (await db.query('select count(*) from pickups where id=$1', [pickupId])).rows[0].count
    assert.equal(Number(bPickups), 0)
    await db.exec('reset role')

    // 2. Dispatch assigns courier and courier collects pickup
    const order1 = id(51)
    const order2 = id(52)
    await db.query("insert into orders(id, workspace_id, shop_id, code, collection_usd, delivery_fee_usd, driver_pay_usd, usd_to_lbp_rate, status) values($1, $2, $3, 'CD-PICKUP1', 30, 3, 1, 89500, 'pending')", [order1, a, shopA])
    await db.query("insert into orders(id, workspace_id, shop_id, code, collection_usd, delivery_fee_usd, driver_pay_usd, usd_to_lbp_rate, status) values($1, $2, $3, 'CD-PICKUP2', 45, 3, 1, 89500, 'pending')", [order2, a, shopA])

    const collectRes = (await db.query(
      "select collect_pickup($1, $2, 'proofs/pickup_50.jpg', $3) as r",
      [pickupId, driverA, [order1, order2]]
    )).rows[0].r
    assert.equal(collectRes.success, true)
    assert.equal(collectRes.orders_collected, 2)

    const pickupRow = (await db.query('select status, driver_id, collected_at, proof_photo_path from pickups where id=$1', [pickupId])).rows[0]
    assert.equal(pickupRow.status, 'collected')
    assert.equal(pickupRow.driver_id, driverA)
    assert.ok(pickupRow.collected_at)
    assert.equal(pickupRow.proof_photo_path, 'proofs/pickup_50.jpg')

    // Orders linked in pickup_orders and transitioned to picked_up
    const o1 = (await db.query('select status, driver_id from orders where id=$1', [order1])).rows[0]
    assert.equal(o1.status, 'picked_up')
    assert.equal(o1.driver_id, driverA)

    // 3. Mark received at hub
    const hubScanRes = (await db.query("select mark_received_at_hub($1) as r", [order1])).rows[0].r
    assert.equal(hubScanRes.success, true)
    const hubScanRow = (await db.query('select received_at_hub from orders where id=$1', [order1])).rows[0]
    assert.ok(hubScanRow.received_at_hub)

    // 4. Set route positions for courier
    const routePosRes = (await db.query(
      "select set_route_positions($1, $2::jsonb) as r",
      [driverA, JSON.stringify([{ order_id: order1, position: 1 }, { order_id: order2, position: 2 }])]
    )).rows[0].r
    assert.equal(routePosRes.success, true)
    const o1Route = (await db.query('select route_position from orders where id=$1', [order1])).rows[0].route_position
    assert.equal(o1Route, 1)

    // 5. Delivery attempt 1: Customer no answer -> status failed, attempt_no = 1
    const att1 = (await db.query(
      "select record_delivery_attempt($1, $2, 'no_answer', 'Customer phone was off', null, 33.8938, 35.5018, null) as r",
      [order1, driverA]
    )).rows[0].r
    assert.equal(att1.success, true)
    assert.equal(att1.attempt_no, 1)
    assert.equal(att1.new_status, 'failed')

    const o1AfterAtt1 = (await db.query('select status from orders where id=$1', [order1])).rows[0].status
    assert.equal(o1AfterAtt1, 'failed')

    // Delivery attempt 2: Customer rescheduled -> status failed, attempt_no = 2
    const att2 = (await db.query(
      "select record_delivery_attempt($1, $2, 'rescheduled', 'Customer asked for next week', null, 33.8938, 35.5018, null) as r",
      [order1, driverA]
    )).rows[0].r
    assert.equal(att2.attempt_no, 2)
    assert.equal(att2.new_status, 'failed')

    // Delivery attempt 3 (reaches max_attempts = 3) -> auto-moves to returned
    const att3 = (await db.query(
      "select record_delivery_attempt($1, $2, 'no_answer', 'Third attempt no answer', null, 33.8938, 35.5018, null) as r",
      [order1, driverA]
    )).rows[0].r
    assert.equal(att3.attempt_no, 3)
    assert.equal(att3.new_status, 'returned')

    const o1AfterAtt3 = (await db.query('select status from orders where id=$1', [order1])).rows[0].status
    assert.equal(o1AfterAtt3, 'returned')

    // 6. Return Handover with Merchant Signature
    const handoverRes = (await db.query(
      "select handover_returns($1, $2, 'signatures/shopA_return.png') as r",
      [shopA, [order1]]
    )).rows[0].r
    assert.equal(handoverRes.success, true)
    assert.equal(handoverRes.count, 1)

    const o1AfterHandover = (await db.query('select returns_handed_at, returns_signature_path from orders where id=$1', [order1])).rows[0]
    assert.ok(o1AfterHandover.returns_handed_at)
    assert.equal(o1AfterHandover.returns_signature_path, 'signatures/shopA_return.png')
  })

  await t.test('customer experience: walk-in shop, message log, and ratings submission', async () => {
    // 1. Walk-in Shop: get_or_create_walkin_shop creates once and is idempotent
    const walkinShop1 = (await db.query("select get_or_create_walkin_shop($1) as id", [a])).rows[0].id
    assert.ok(walkinShop1)
    const walkinShop2 = (await db.query("select get_or_create_walkin_shop($1) as id", [a])).rows[0].id
    assert.equal(walkinShop1, walkinShop2)

    const walkinShopRow = (await db.query("select is_walkin, name from shops where id=$1", [walkinShop1])).rows[0]
    assert.equal(walkinShopRow.is_walkin, true)

    // 2. Message Logging
    const testOrder = id(60)
    await db.query(
      "insert into orders(id, workspace_id, shop_id, code, tracking_token, status, usd_to_lbp_rate) values($1, $2, $3, 'MSG-ORD-60', 'tok-msg-60', 'pending', 89500)",
      [testOrder, a, walkinShop1]
    )
    const logId = (await db.query(
      "select log_customer_message($1, $2, 'whatsapp', 'order_created', '+961 70 111 222', 'Your order is confirmed', 'sent') as id",
      [a, testOrder]
    )).rows[0].id
    assert.ok(logId)
    const msgRow = (await db.query("select channel, template, status, sent_at from message_log where id=$1", [logId])).rows[0]
    assert.equal(msgRow.channel, 'whatsapp')
    assert.equal(msgRow.template, 'order_created')
    assert.equal(msgRow.status, 'sent')
    assert.ok(msgRow.sent_at)

    // 3. Ratings: cannot rate an undelivered order
    await assert.rejects(
      db.query("select submit_order_rating('tok-msg-60', 5, 'Great!')"),
      /Ratings can only be submitted for delivered orders/i
    )

    // Transition to delivered
    const driverX = id(61)
    await db.query("insert into drivers(id, workspace_id, name) values($1, $2, 'Rated Courier')", [driverX, a])
    await db.query("update orders set status='delivered', driver_id=$1 where id=$2", [driverX, testOrder])

    // Rate 5 stars
    const ratingRes = (await db.query("select submit_order_rating('tok-msg-60', 5, 'Quick delivery!') as r")).rows[0].r
    assert.equal(ratingRes.rating, 5)
    assert.equal(ratingRes.driver_id, driverX)

    // Cannot rate twice
    await assert.rejects(
      db.query("select submit_order_rating('tok-msg-60', 4, 'Duplicate')"),
      /This order has already been rated/i
    )

    // Driver rating summary calculates correctly
    const summary = (await db.query("select get_driver_rating_summary($1) as r", [driverX])).rows[0].r
    assert.equal(Number(summary.average), 5.0)
    assert.equal(summary.total_ratings, 1)
  })
  }finally{await db.close()}
})
