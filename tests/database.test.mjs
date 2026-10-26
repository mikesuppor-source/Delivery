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
 }finally{await db.close()}
})
