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

  // ─── Phase 6: finance pro ────────────────────────────────────────────────────
  // Own workspace, shops, couriers and users so balances here never depend on the tests above.
  const fin = Object.fromEntries(Object.entries({
    ws: 700, owner: 701, manager: 702, readonly: 703, shopUser: 704, ownerB: 705,
    shopA: 710, shopB: 711, c1: 720, c2: 721, c3: 722, area: 730,
  }).map(([k, n]) => [k, id(n)]))
  await db.query("insert into auth.users values($1,'fin-owner@test.invalid',now()),($2,'fin-manager@test.invalid',now()),($3,'fin-readonly@test.invalid',now()),($4,'fin-shop@test.invalid',now()),($5,'fin-ownerb@test.invalid',now())",
    [fin.owner, fin.manager, fin.readonly, fin.shopUser, fin.ownerB])
  await db.query("insert into workspaces(id,name,slug,usd_to_lbp) values($1,'Finance F','finance-f',90000)", [fin.ws])
  await db.query("insert into workspace_members(workspace_id,user_id,role) values($1,$2,'owner'),($1,$3,'manager'),($1,$4,'readonly'),($5,$6,'owner')",
    [fin.ws, fin.owner, fin.manager, fin.readonly, b, fin.ownerB])
  await db.query("insert into shops(id,workspace_id,name,user_id) values($1,$3,'Shop A',$4),($2,$3,'Shop B',null)", [fin.shopA, fin.shopB, fin.ws, fin.shopUser])
  await db.query("insert into drivers(id,workspace_id,name) values($1,$4,'Courier 1'),($2,$4,'Courier 2'),($3,$4,'Courier 3')", [fin.c1, fin.c2, fin.c3, fin.ws])
  await db.query("update drivers set pay_mode='percent',pay_percent=20 where id=$1", [fin.c3])
  await db.query("insert into delivery_areas(id,workspace_id,name,fee_usd,driver_pay_usd) values($1,$2,'Zone F',8,3)", [fin.area, fin.ws])

  let orderSeq = 7000
  const makeOrder = async ({ ws = fin.ws, shop = fin.shopA, driver = null, area = null, cod = 0, fee = 3, pay = 2, status = 'pending' } = {}) => {
    const oid = id(orderSeq++)
    await db.query("insert into orders(id,workspace_id,shop_id,driver_id,area_id,usd_to_lbp_rate,collection_usd,delivery_fee_usd,driver_pay_usd) values($1,$2,$3,$4,$5,90000,$6,$7,$8)",
      [oid, ws, shop, driver, area, cod, fee, pay])
    if (status === 'delivered') await db.query("update orders set status='delivered' where id=$1", [oid])
    return oid
  }
  const num = async (sql, params) => Number(Object.values((await db.query(sql, params)).rows[0] ?? {})[0] ?? 0)
  const shopBalance = shop => num('select balance_usd from shops where id=$1', [shop])
  const driverOwed = driver => num('select pay_owed_usd from drivers where id=$1', [driver])
  const iso = d => d.toISOString().slice(0, 10)
  const addDays = (d, days, hours = 10) => new Date(d.getTime() + days * 86400000 + hours * 3600000)
  const backdate = (oid, when) => db.query('update orders set delivered_at=$2 where id=$1', [oid, when.toISOString()])
  const asUser = async (user, fn) => {
    await db.query("select set_config('test.user_id',$1,false)", [user])
    await db.exec('set role authenticated')
    try { return await fn() } finally {
      await db.exec('reset role')
      await db.query("select set_config('test.user_id','',false)")
    }
  }

  await t.test('finance pro: shop payout runs pay once, keep cash-out reserves and never overdraw', async () => {
    const { ws, owner, shopA, shopB, c1 } = fin
    const run = async (items, key) => (await db.query('select run_shop_payouts($1,$2::jsonb,$3,$4) as r', [ws, JSON.stringify(items), key, owner])).rows[0].r
    await makeOrder({ shop: shopA, driver: c1, cod: 50, fee: 3, status: 'delivered' }) // +47
    await makeOrder({ shop: shopA, driver: c1, cod: 30, fee: 3, status: 'delivered' }) // +27
    await makeOrder({ shop: shopB, driver: c1, cod: 10, fee: 3, status: 'delivered' }) // +7
    assert.equal(await shopBalance(shopA), 74)

    // $20 is reserved by a pending cash-out request, so a run can pay at most $54
    await db.query("select request_shop_cashout($1,20,'whish','71 000 111','')", [shopA])
    const first = await run([{ shop_id: shopA, amount_usd: 54 }], id(8001))
    assert.equal(first.replayed, false)
    assert.equal(first.count, 1)
    assert.equal(Number(first.total_usd), 54)
    assert.equal(await shopBalance(shopA), 20)
    await assert.rejects(run([{ shop_id: shopA, amount_usd: 0.01 }], id(8002)), /exceeds the available balance/)

    // The same request again changes nothing; a different request under the same key is refused
    const again = await run([{ shop_id: shopA, amount_usd: 54 }], id(8001))
    assert.equal(again.replayed, true)
    assert.equal(again.run_id, first.run_id)
    assert.equal(await shopBalance(shopA), 20)
    await assert.rejects(run([{ shop_id: shopA, amount_usd: 10 }], id(8001)), /already used for different details/)
    assert.equal((await db.query('select count(*) from payout_runs where idempotency_key=$1', [id(8001)])).rows[0].count, 1)
    const settlements = (await db.query('select type, shop_id, amount_usd from settlements where payout_run_id=$1', [first.run_id])).rows
    assert.equal(settlements.length, 1)
    assert.equal(settlements[0].type, 'shop_payment')
    assert.equal(Number(settlements[0].amount_usd), 54)

    // One bad line cancels the whole run: nothing is paid and the key is not used up
    await assert.rejects(run([{ shop_id: shopB, amount_usd: 7 }, { shop_id: shopA, amount_usd: 5 }], id(8003)), /exceeds the available balance/)
    assert.equal(await shopBalance(shopB), 7)
    assert.equal((await db.query('select count(*) from payout_runs where idempotency_key=$1', [id(8003)])).rows[0].count, 0)

    // Input rules
    await assert.rejects(run([{ shop_id: shopB, amount_usd: 1 }, { shop_id: shopB, amount_usd: 1 }], id(8004)), /appear once/)
    await assert.rejects(run([{ shop_id: otherShop, amount_usd: 1 }], id(8005)), /not found in this workspace/)
    await assert.rejects(run([{ shop_id: shopB, amount_usd: 0 }], id(8006)), /positive amount/)
    await assert.rejects(run([{ shop_id: shopB, amount_usd: 0.001 }], id(8007)), /positive amount/)
    await assert.rejects(run([], id(8008)), /at least one payout/)

    // Paying the rest of shop B, then settling the reserved cash-out request, leaves both at zero
    await run([{ shop_id: shopB, amount_usd: 7, note: 'Whish transfer' }], id(8009))
    assert.equal(await shopBalance(shopB), 0)
    const request = (await db.query("select id from cashout_requests where shop_id=$1 and status='pending'", [shopA])).rows[0].id
    await db.query('select mark_cashout_paid($1,$2,$3)', [request, ws, owner])
    assert.equal(await shopBalance(shopA), 0)
    assert.equal((await db.query('select note from settlements where payout_run_id=(select id from payout_runs where idempotency_key=$1)', [id(8009)])).rows[0].note, 'Whish transfer')
  })

  await t.test('finance pro: courier pay runs pay what is owed, once', async () => {
    const { ws, owner, c1 } = fin
    const run = async (items, key) => (await db.query('select run_driver_payouts($1,$2::jsonb,$3,$4) as r', [ws, JSON.stringify(items), key, owner])).rows[0].r
    const owed = await driverOwed(c1)
    assert.ok(owed >= 6, 'courier 1 delivered three orders at $2')
    const paid = await run([{ driver_id: c1, amount_usd: owed }], id(8101))
    assert.equal(Number(paid.total_usd), owed)
    assert.equal(await driverOwed(c1), 0)
    await assert.rejects(run([{ driver_id: c1, amount_usd: 0.01 }], id(8102)), /exceeds the/)
    assert.equal((await run([{ driver_id: c1, amount_usd: owed }], id(8101))).replayed, true)
    assert.equal(await driverOwed(c1), 0)
    await assert.rejects(run([{ driver_id: drv, amount_usd: 1 }], id(8103)), /not found in this workspace/)
    assert.equal((await db.query("select count(*) from settlements where payout_run_id=$1 and type='driver_pay'", [paid.run_id])).rows[0].count, 1)
  })

  await t.test('finance pro: percent couriers are paid a share of the fee, fixed couriers keep the zone rate', async () => {
    const { area, c1, c3, shopB } = fin
    const pay = oid => num('select driver_pay_usd from orders where id=$1', [oid])
    const o = await makeOrder({ shop: shopB, area, driver: c3, cod: 20, fee: 8, pay: 3 })
    assert.equal(await pay(o), 1.6) // 20% of $8, not the zone's $3
    await db.query('update orders set driver_id=$2 where id=$1', [o, c1])
    assert.equal(await pay(o), 3) // fixed courier: back to the zone rate
    await db.query('update orders set driver_id=$2 where id=$1', [o, c3])
    assert.equal(await pay(o), 1.6)
    await db.query('update orders set delivery_fee_usd=10 where id=$1', [o])
    assert.equal(await pay(o), 2) // follows a fee change
    await db.query('update orders set delivery_fee_usd=9, driver_pay_usd=4 where id=$1', [o])
    assert.equal(await pay(o), 4) // a manager override in the same edit wins
    await db.query('update orders set driver_id=null where id=$1', [o])
    assert.equal(await pay(o), 3) // unassigned: zone rate again

    // Money already booked is never repriced
    const done = await makeOrder({ shop: shopB, area, driver: c3, cod: 20, fee: 8, pay: 3, status: 'delivered' })
    assert.equal(await pay(done), 1.6)
    const owed = await driverOwed(c3)
    await db.query('update orders set driver_id=$2 where id=$1', [done, c1])
    assert.equal(await pay(done), 1.6)
    await db.query('update orders set driver_id=$2 where id=$1', [done, c3])
    assert.equal(await driverOwed(c3), owed)

    await assert.rejects(db.query("update drivers set pay_mode='percent',pay_percent=null where id=$1", [c1]), /driver_pay_mode_valid/)
    await assert.rejects(db.query("update drivers set pay_mode='percent',pay_percent=101 where id=$1", [c1]), /driver_pay_mode_valid/)
    await assert.rejects(db.query("update drivers set pay_mode='salary' where id=$1", [c1]), /driver_pay_mode_valid/)
  })

  await t.test('finance pro: weekly bonuses go to the highest rule reached, once per courier per week', async () => {
    const { ws, shopB } = fin
    const [c4, c5] = [id(723), id(724)]
    await db.query("insert into drivers(id,workspace_id,name) values($1,$3,'Courier 4'),($2,$3,'Courier 5')", [c4, c5, ws])
    await db.query("insert into driver_bonus_rules(workspace_id,name,min_deliveries,bonus_usd,active) values($1,'Bronze',2,5,true),($1,'Silver',3,12,true),($1,'Disabled',1,100,false)", [ws])
    const now = new Date()
    const thisMonday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - ((now.getUTCDay() + 6) % 7)))
    const weekStart = addDays(thisMonday, -7, 0)
    const deliver = async (driver, when) => backdate(await makeOrder({ shop: shopB, driver, cod: 10, fee: 3, status: 'delivered' }), when)
    for (const day of [1, 2, 3]) await deliver(c4, addDays(weekStart, day))
    await deliver(c5, addDays(weekStart, 1))
    await deliver(c5, addDays(weekStart, -1)) // the Sunday before: outside the week

    const before = await driverOwed(c4)
    const result = (await db.query('select apply_weekly_driver_bonuses($1,$2::date) as r', [ws, iso(weekStart)])).rows[0].r
    assert.equal(result.bonuses_created, 1)
    assert.equal(Number(result.total_bonus_usd), 12) // Silver only: tiers do not stack
    assert.equal(await driverOwed(c4) - before, 12)
    assert.equal(await num("select sum(pay_delta) from money_ledger where driver_id=$1 and reason like 'driver bonus%'", [c4]), 12)
    const bonus = (await db.query('select deliveries_count, bonus_usd, note from driver_bonuses where driver_id=$1', [c4])).rows[0]
    assert.equal(bonus.deliveries_count, 3)
    assert.equal(bonus.note, 'Weekly bonus: Silver')
    assert.equal((await db.query('select count(*) from driver_bonuses where driver_id=$1', [c5])).rows[0].count, 0)

    // Running it again, or after more deliveries, pays nobody twice
    assert.equal((await db.query('select apply_weekly_driver_bonuses($1,$2::date) as r', [ws, iso(weekStart)])).rows[0].r.bonuses_created, 0)
    assert.equal(await driverOwed(c4) - before, 12)

    await assert.rejects(db.query('select apply_weekly_driver_bonuses($1,$2::date)', [ws, iso(thisMonday)]), /once the week has finished/)
    await assert.rejects(db.query('select apply_weekly_driver_bonuses($1,$2::date)', [ws, iso(addDays(weekStart, 1))]), /Monday/)
    // A bonus cannot point at another company's courier
    await assert.rejects(db.query("insert into driver_bonuses(workspace_id,driver_id,week_start,deliveries_count,bonus_usd) values($1,$2,$3,1,1)", [ws, drv, iso(addDays(weekStart, -7, 0))]), /foreign key/)
  })

  await t.test('finance pro: the P&L adds up to the orders, bonuses, expenses and the ledger', async () => {
    const [wsP, shopP, c6] = [id(740), id(741), id(742)]
    await db.query("insert into workspaces(id,name,slug,usd_to_lbp) values($1,'P&L Co','pnl-co',90000)", [wsP])
    await db.query("insert into shops(id,workspace_id,name) values($1,$2,'P&L Shop')", [shopP, wsP])
    await db.query("insert into drivers(id,workspace_id,name) values($1,$2,'P&L Courier')", [c6, wsP])
    await db.query("insert into driver_bonus_rules(workspace_id,name,min_deliveries,bonus_usd) values($1,'Two a week',2,10)", [wsP])
    const now = new Date()
    const thisMonday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - ((now.getUTCDay() + 6) % 7)))
    const weekStart = addDays(thisMonday, -7, 0)
    const make = o => makeOrder({ ws: wsP, shop: shopP, driver: c6, cod: 20, ...o })

    await backdate(await make({ fee: 4, pay: 2, status: 'delivered' }), addDays(weekStart, 1)) // the two bonus-week deliveries
    await backdate(await make({ fee: 4, pay: 2, status: 'delivered' }), addDays(weekStart, 2))
    await backdate(await make({ fee: 6, pay: 2, status: 'delivered' }), addDays(weekStart, -35)) // an earlier month
    const stored = await make({ fee: 5, pay: 2, status: 'delivered' })
    await db.query('update orders set storage_fee_usd=1.5 where id=$1', [stored])
    const returned = await make({ fee: 3, pay: 2 })
    await db.query("update orders set status='returned', collection_usd=0, delivery_fee_usd=2, driver_pay_usd=1 where id=$1", [returned])
    await db.query('select apply_weekly_driver_bonuses($1,$2::date)', [wsP, iso(weekStart)])
    await db.query("insert into expenses(workspace_id,date,category,amount_usd,amount_lbp,note) values($1,$2,'fuel',15,0,'Fuel'),($1,$2,'other',5,450000,'Packaging and phone')", [wsP, iso(now)])

    const report = async () => (await db.query('select pnl_report($1,$2::date,$3::date) as r', [wsP, iso(addDays(weekStart, -40)), iso(now)])).rows[0].r
    const pnl = await report()
    const totals = Object.fromEntries(Object.entries(pnl.totals).map(([k, v]) => [k, Number(v)]))
    assert.deepEqual(totals, {
      delivered_orders: 4, returned_orders: 1,
      delivery_fees_usd: 21, storage_fees_usd: 1.5, revenue_usd: 22.5,
      courier_pay_usd: 9, bonuses_usd: 10, expenses_usd: 25, // $15 + $5 + 450,000 LBP at 90,000
      total_cost_usd: 44, net_profit_usd: -21.5,
    })
    assert.ok(pnl.months.length >= 2, 'the earlier month is listed')
    const sum = key => pnl.months.reduce((total, m) => total + Number(m[key]), 0)
    assert.equal(sum('net_profit_usd'), -21.5)
    assert.equal(sum('revenue_usd'), 22.5)
    assert.deepEqual(pnl.expenses_by_category.map(c => [c.category, Number(c.amount_usd)]), [['fuel', 15], ['other', 10]])

    // Everything the P&L pays out was credited to a courier in the ledger
    assert.equal(await num('select sum(pay_delta) from money_ledger where workspace_id=$1 and settlement_id is null', [wsP]), 19)
    // Orders outside the range are left out
    const narrow = (await db.query('select pnl_report($1,$2::date,$3::date) as r', [wsP, iso(addDays(weekStart, -40)), iso(addDays(weekStart, -20))])).rows[0].r
    assert.equal(Number(narrow.totals.delivery_fees_usd), 6)
    await assert.rejects(db.query('select pnl_report($1,$2::date,$3::date)', [wsP, iso(now), iso(addDays(now, -2))]), /Invalid date range/)

    // Changing the rate later does not move past expenses, and every change is logged with who made it.
    // The server has no signed-in user of its own, so clear the one an earlier test left behind.
    await db.query("select set_config('test.user_id','',false)")
    await assert.rejects(db.query('select set_workspace_rate($1,0,$2)', [wsP, fin.owner]), /positive/)
    await db.query('select set_workspace_rate($1,100000,$2)', [wsP, fin.owner])
    assert.equal(Number((await report()).totals.expenses_usd), 25)
    const rates = (await db.query('select rate, set_by from exchange_rates where workspace_id=$1 order by set_at, id', [wsP])).rows
    assert.deepEqual(rates.map(r => Number(r.rate)), [90000, 100000])
    assert.equal(rates[1].set_by, fin.owner)
  })

  await t.test('finance pro: a shop statement runs from the opening balance to the closing balance', async () => {
    const { ws, shopA } = fin
    const today = new Date()
    const statement = async (from, to) => (await db.query('select shop_statement($1,$2,$3::date,$4::date) as r', [ws, shopA, iso(from), iso(to)])).rows[0].r
    const reconcile = s => Number(s.opening_usd) + s.lines.reduce((total, l) => total + Number(l.amount_usd), 0)

    const full = await statement(addDays(today, -60), today)
    assert.equal(Number(full.opening_usd), 0)
    assert.equal(full.lines.filter(l => l.kind === 'order').length, 2)
    assert.equal(full.lines.filter(l => l.kind === 'payout').length, 2)
    assert.equal(Number(full.closing_usd), 0)
    assert.equal(reconcile(full), Number(full.closing_usd))
    assert.equal(Number(full.closing_usd), await shopBalance(shopA))
    const line = full.lines.find(l => l.kind === 'order' && Number(l.cod_usd) === 50)
    assert.equal(Number(line.fee_usd), 3)
    assert.equal(Number(line.amount_usd), 47)

    // Move the two deliveries 40 days back: an earlier statement shows them, a later one starts with them
    await db.query("update orders set delivered_at=now()-interval '40 days' where shop_id=$1 and status='delivered'", [shopA])
    await db.query("update money_ledger set created_at=now()-interval '40 days' where shop_id=$1 and order_id is not null", [shopA])
    const earlier = await statement(addDays(today, -45), addDays(today, -35))
    assert.equal(Number(earlier.opening_usd), 0)
    assert.deepEqual(earlier.lines.map(l => [l.kind, Number(l.amount_usd)]).sort(), [['order', 27], ['order', 47]])
    assert.equal(Number(earlier.closing_usd), 74)
    const later = await statement(addDays(today, -30), today)
    assert.equal(Number(later.opening_usd), 74)
    assert.deepEqual(later.lines.map(l => [l.kind, Number(l.amount_usd)]), [['payout', -54], ['payout', -20]])
    assert.equal(Number(later.closing_usd), 0)
    assert.equal(reconcile(later), 0)
    const future = await statement(addDays(today, 5), addDays(today, 9))
    assert.equal(future.lines.length, 0)
    assert.equal(Number(future.opening_usd), Number(future.closing_usd))

    await assert.rejects(db.query('select shop_statement($1,$2,current_date,current_date)', [ws, otherShop]), /Shop not found/)
    await assert.rejects(db.query('select shop_statement($1,$2,current_date,current_date - 1)', [ws, shopA]), /Invalid date range/)
  })

  await t.test('finance pro: finance data is read by owners and managers only, and written by the server only', async () => {
    const { ws, owner, manager, readonly, shopUser, ownerB } = fin
    await db.query("insert into expenses(workspace_id,date,category,amount_usd,note) values($1,current_date,'rent',100,'Office')", [ws])
    const tables = ['expenses', 'payout_runs', 'driver_bonuses', 'driver_bonus_rules', 'exchange_rates']
    for (const [user, canRead] of [[owner, true], [manager, true], [readonly, false], [shopUser, false], [ownerB, false]]) {
      await asUser(user, async () => {
        for (const table of tables) {
          const seen = Number((await db.query(`select count(*) from ${table} where workspace_id=$1`, [ws])).rows[0].count)
          assert.equal(seen > 0, canRead, `${user} reading ${table}`)
        }
      })
    }
    await asUser(owner, async () => {
      for (const sql of [
        `insert into expenses(workspace_id,category,amount_usd,usd_to_lbp) values('${ws}','fuel',1,90000)`,
        'update expenses set amount_usd=1', 'delete from expenses',
        `insert into driver_bonus_rules(workspace_id,name,min_deliveries,bonus_usd) values('${ws}','x',1,1)`,
        `insert into payout_runs(workspace_id,idempotency_key,payload_hash,type) values('${ws}','${id(1)}','x','shop_payout')`,
        `insert into driver_bonuses(workspace_id,driver_id,week_start,deliveries_count,bonus_usd) values('${ws}','${fin.c1}','2026-01-05',1,1)`,
        'update exchange_rates set rate=1', 'delete from payout_runs',
      ]) await assert.rejects(db.query(sql), /permission denied/, sql)
      for (const sql of [
        `select run_shop_payouts('${ws}','[]'::jsonb,'${id(1)}',null)`,
        `select run_driver_payouts('${ws}','[]'::jsonb,'${id(1)}',null)`,
        `select apply_weekly_driver_bonuses('${ws}',date '2026-01-05')`,
        `select pnl_report('${ws}',current_date,current_date)`,
        `select shop_statement('${ws}','${fin.shopA}',current_date,current_date)`,
        `select set_workspace_rate('${ws}',1,null)`,
      ]) await assert.rejects(db.query(sql), /permission denied/, sql)
    })
  })

  await t.test('profit report refuses anyone who is not an owner or manager of that workspace', async () => {
    const { ws, manager, shopUser, ownerB } = fin
    const ask = () => db.query("select profit_report($1, now() - interval '1 day', now() + interval '1 day') as r", [ws])
    await asUser(manager, async () => assert.ok((await ask()).rows[0].r.totals))
    await asUser(ownerB, async () => assert.rejects(ask(), /Forbidden/)) // owner of a different company
    await asUser(shopUser, async () => assert.rejects(ask(), /Forbidden/)) // a merchant
  })

  }finally{await db.close()}
})
