import test from 'node:test'
import assert from 'node:assert/strict'
import { parseOrderText } from '../lib/parse-order-text'

test('parseOrderText: handles standard labeled English messages', () => {
  const input = `
    Name: Zeina Khoury
    Phone: 70 123 456
    Address: Hamra Makdissi street, building Plaza 4th floor
    Amount: $35.00
    Notes: 2 shoe boxes, fragile
  `
  const result = parseOrderText(input)

  assert.equal(result.recipientName, 'Zeina Khoury')
  assert.equal(result.recipientPhone, '+961 70 123 456')
  assert.match(result.recipientAddress, /Hamra Makdissi/i)
  assert.equal(result.collectionUsd, 35.0)
  assert.match(result.notes, /2 shoe boxes/i)
})

test('parseOrderText: handles Arabic formatted WhatsApp messages', () => {
  const input = `
    الاسم: رامي الحداد
    الرقم: 03555666
    العنوان: بيروت، الأشرفية، قرب ساحة ساسين، بناية الزهور طابق 3
    المبلغ: 45$
    ملاحظات: فستان قياس M
  `
  const result = parseOrderText(input)

  assert.equal(result.recipientName, 'رامي الحداد')
  assert.equal(result.recipientPhone, '+961 3 555 666')
  assert.match(result.recipientAddress, /الأشرفية/i)
  assert.equal(result.collectionUsd, 45.0)
  assert.match(result.notes, /فستان/i)
})

test('parseOrderText: converts Lebanese Pounds (LBP) to USD accurately', () => {
  const input = `
    Customer: George Nassar
    Tel: +961 71 888 999
    Address: Jounieh Old Souk, sea road
    COD: 1,790,000 LBP
  `
  // Rate: 89,500 LBP/USD -> 1,790,000 / 89,500 = $20.00
  const result = parseOrderText(input, 89500)

  assert.equal(result.recipientName, 'George Nassar')
  assert.equal(result.recipientPhone, '+961 71 888 999')
  assert.equal(result.collectionUsd, 20.0)
  assert.match(result.recipientAddress, /Jounieh/i)
})

test('parseOrderText: handles single-line comma separated WhatsApp text', () => {
  const input = 'Maya Salem, 76 111 222, Achrafieh Sassine, $65, Urgent evening delivery'
  const result = parseOrderText(input)

  assert.equal(result.recipientName, 'Maya Salem')
  assert.equal(result.recipientPhone, '+961 76 111 222')
  assert.match(result.recipientAddress, /Achrafieh Sassine/i)
  assert.equal(result.collectionUsd, 65.0)
})

test('parseOrderText: detects Lebanese geographical town metadata', () => {
  const input = `
    Name: Jad Abi Nader
    Phone: 03 444 333
    Address: Bikfaya Main Square, Mount Lebanon
    COD: $50
  `
  const result = parseOrderText(input)

  assert.equal(result.recipientName, 'Jad Abi Nader')
  assert.equal(result.recipientPhone, '+961 3 444 333')
  assert.ok(result.town)
  assert.match(result.town, /Bikfaya/i)
})
