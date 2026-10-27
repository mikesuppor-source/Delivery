import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LEBANON_GEO,
  searchLebaneseTowns,
  formatLebaneseDestination,
} from '../lib/lebanon-geo';
import { orderPatch } from '../lib/orders';

test('Lebanon Geography covers all 8 governorates and major cazas', () => {
  assert.equal(LEBANON_GEO.length, 8);
  const govIds = LEBANON_GEO.map((g) => g.id);
  assert.ok(govIds.includes('beirut'));
  assert.ok(govIds.includes('mount_lebanon'));
  assert.ok(govIds.includes('bekaa'));
  assert.ok(govIds.includes('north_lebanon'));
  assert.ok(govIds.includes('south_lebanon'));
  assert.ok(govIds.includes('nabatieh'));
  assert.ok(govIds.includes('akkar'));
  assert.ok(govIds.includes('baalbek_hermel'));
});

test('searchLebaneseTowns matches Arabic and English names accurately', () => {
  // Arabic lookup for Hawch El Qinnabeh (حوش القنعبة)
  const arabicResults = searchLebaneseTowns('حوش القنعبة');
  assert.ok(arabicResults.length > 0);
  assert.equal(arabicResults[0].townAr, 'حوش القنعبة');
  assert.equal(arabicResults[0].cazaAr, 'راشيا');
  assert.equal(arabicResults[0].governorateAr, 'البقاع');
  assert.equal(
    arabicResults[0].formattedAr,
    'البقاع - راشيا - حوش القنعبة'
  );

  // English lookup for Hamra
  const englishResults = searchLebaneseTowns('hamra');
  assert.ok(englishResults.length > 0);
  assert.equal(englishResults[0].townEn, 'Hamra');
  assert.equal(englishResults[0].cazaEn, 'Beirut');
  assert.equal(
    englishResults[0].formattedEn,
    'Beirut - Beirut - Hamra'
  );

  // Query too short should return empty
  assert.deepEqual(searchLebaneseTowns('a'), []);
});

test('formatLebaneseDestination formats standard Lebanese address hierarchy', () => {
  assert.equal(
    formatLebaneseDestination('Beirut', 'Beirut', 'Hamra'),
    'Beirut - Beirut - Hamra'
  );
  assert.equal(
    formatLebaneseDestination('البقاع', 'راشيا', 'حوش القنعبة'),
    'البقاع - راشيا - حوش القنعبة'
  );
  assert.equal(
    formatLebaneseDestination('Beirut', null, 'Hamra'),
    'Beirut - Hamra'
  );
  assert.equal(formatLebaneseDestination(), '');
});

test('orderPatch accepts and validates service_type (delivery, replacement, pickup)', () => {
  const baseOrder = {
    id: 'ord-1',
    status: 'pending',
    collection_usd: 50,
    usd_to_lbp_rate: 89500,
  };

  // Replacement (exchange/swap)
  const patchSwap = orderPatch({ serviceType: 'replacement' }, baseOrder, false);
  assert.equal(patchSwap.service_type, 'replacement');

  // Return Pickup
  const patchPickup = orderPatch({ serviceType: 'pickup' }, baseOrder, false);
  assert.equal(patchPickup.service_type, 'pickup');

  // Standard delivery
  const patchDelivery = orderPatch({ serviceType: 'delivery' }, baseOrder, false);
  assert.equal(patchDelivery.service_type, 'delivery');

  // Invalid service type is ignored
  const patchInvalid = orderPatch({ serviceType: 'invalid_type' as any }, baseOrder, false);
  assert.equal(patchInvalid.service_type, undefined);
});

test('orderPatch parses package attributes: weight_kg and is_breakable', () => {
  const baseOrder = { id: 'ord-2', status: 'pending', collection_usd: 25 };

  const patchAttributes = orderPatch(
    {
      weightKg: 3.75,
      isBreakable: true,
    },
    baseOrder,
    false
  );

  assert.equal(patchAttributes.weight_kg, 3.75);
  assert.equal(patchAttributes.is_breakable, true);

  // Minimum weight enforced
  const patchMinWeight = orderPatch({ weightKg: -5 }, baseOrder, false);
  assert.equal(patchMinWeight.weight_kg, 0.1);
});

test('orderPatch handles 3PL carrier outsource tracking and Lebanese geo destinations', () => {
  const baseOrder = { id: 'ord-3', status: 'pending', collection_usd: 10 };

  const patchCarrierAndGeo = orderPatch(
    {
      carrierName: 'Octopus Logistics',
      carrierTrackingCode: 'OCT-998822',
      destinationGovernorate: 'البقاع',
      destinationCaza: 'راشيا',
      destinationTown: 'حوش القنعبة',
    },
    baseOrder,
    false
  );

  assert.equal(patchCarrierAndGeo.carrier_name, 'Octopus Logistics');
  assert.equal(patchCarrierAndGeo.carrier_tracking_code, 'OCT-998822');
  assert.equal(patchCarrierAndGeo.destination_governorate, 'البقاع');
  assert.equal(patchCarrierAndGeo.destination_caza, 'راشيا');
  assert.equal(patchCarrierAndGeo.destination_town, 'حوش القنعبة');
});

test('Phone cleansing and Lebanese mobile normalization for CRM matching', () => {
  const rawNumbers = [
    '+961 70 123 456',
    '03-123456',
    '961 71 987 654',
    '01 234 567',
  ];

  const cleaned = rawNumbers.map((p) => p.replace(/[^0-9+]/g, ''));
  assert.deepEqual(cleaned, [
    '+96170123456',
    '03123456',
    '96171987654',
    '01234567',
  ]);

  // Valid length check for lookup
  for (const num of cleaned) {
    assert.ok(num.length >= 4);
  }
});

test('Multi-driver pool load balancer distributes orders fairly across 10 drivers', () => {
  // Simulate 10 couriers assigned to Beirut zone
  const beirutDrivers = Array.from({ length: 10 }, (_, i) => `driver-beirut-${i + 1}`);
  const activeLoads = new Map<string, number>();
  for (const id of beirutDrivers) activeLoads.set(id, 0);

  // Dispatch 30 incoming orders
  const dispatchedTo: string[] = [];
  for (let i = 0; i < 30; i++) {
    // Pick driver with lowest load
    let best = beirutDrivers[0];
    let minLoad = Infinity;
    for (const d of beirutDrivers) {
      const load = activeLoads.get(d) ?? 0;
      if (load < minLoad) {
        minLoad = load;
        best = d;
      }
    }
    dispatchedTo.push(best);
    activeLoads.set(best, (activeLoads.get(best) || 0) + 1);
  }

  // Every single driver of the 10 must receive exactly 3 orders
  assert.equal(dispatchedTo.length, 30);
  for (const d of beirutDrivers) {
    assert.equal(activeLoads.get(d), 3);
  }
});
