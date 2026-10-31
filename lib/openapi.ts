// The description of the shop API (/api/v1), served at /api/v1/openapi.json and shown in the portal at /portal/api-docs.
// tests/integrations.test.ts fails when a route exists that is not described here.

const errorResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
})

const orderResponse = (description: string) => ({
  description,
  content: { 'application/json': { schema: { type: 'object', properties: { order: { $ref: '#/components/schemas/Order' } } } } },
})

const codeParameter = { name: 'code', in: 'path', required: true, description: 'The Cedar order code, for example CD-ABC123', schema: { type: 'string' } }

export const openApiDocument = {
  openapi: '3.1.0',
  info: {
    title: 'Cedar Delivery shop API',
    version: '1.0.0',
    description:
      'Create and track delivery orders for your own shop from your own website or system. ' +
      'Every request carries your API key as "Authorization: Bearer <key>". Make keys in the portal under Connect Store. ' +
      'A key belongs to one shop and can only see that shop\'s orders. Up to 120 requests a minute per key; after that the answer is 429 with a Retry-After header. ' +
      'Delivery fees are your shop\'s own prices for the zone: send the zone id and Cedar prices the order.',
  },
  servers: [{ url: '/api/v1' }],
  security: [{ bearerAuth: [] }],
  paths: {
    '/zones': {
      get: {
        summary: 'List delivery zones',
        description: 'The zones you can deliver to and what your shop pays for each. Use a zone id when creating an order.',
        responses: {
          '200': {
            description: 'The zones',
            content: { 'application/json': { schema: { type: 'object', properties: { zones: { type: 'array', items: { $ref: '#/components/schemas/Zone' } } } } } },
          },
          '401': errorResponse('Missing, wrong or revoked key'),
          '429': errorResponse('Too many requests'),
        },
      },
    },
    '/orders': {
      post: {
        summary: 'Create an order',
        description:
          'Creates a pending order for your shop. If you send a reference (your own order number), the same reference cannot be used twice: ' +
          'a second request answers 409 duplicate_reference with the code of the order that already exists, so a retry is always safe.',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/NewOrder' } } } },
        responses: {
          '201': orderResponse('The order was created'),
          '400': errorResponse('Something in the request is wrong; the message names it'),
          '401': errorResponse('Missing, wrong or revoked key'),
          '409': errorResponse('This reference was already used (duplicate_reference)'),
          '429': errorResponse('Too many requests'),
        },
      },
      get: {
        summary: 'List your orders',
        description: 'Your shop\'s orders, newest first.',
        parameters: [
          { name: 'status', in: 'query', schema: { $ref: '#/components/schemas/Status' } },
          { name: 'from', in: 'query', description: 'Only orders created on or after this date, for example 2026-11-01', schema: { type: 'string', format: 'date-time' } },
          { name: 'to', in: 'query', description: 'Only orders created on or before this date', schema: { type: 'string', format: 'date-time' } },
          { name: 'page', in: 'query', description: 'Starts at 0', schema: { type: 'integer', minimum: 0, default: 0 } },
          { name: 'limit', in: 'query', description: 'Orders per page, 1 to 100', schema: { type: 'integer', minimum: 1, maximum: 100, default: 50 } },
        ],
        responses: {
          '200': {
            description: 'A page of orders',
            content: { 'application/json': { schema: { type: 'object', properties: {
              orders: { type: 'array', items: { $ref: '#/components/schemas/Order' } }, page: { type: 'integer' }, hasMore: { type: 'boolean' } } } } },
          },
          '400': errorResponse('A filter is not valid'),
          '401': errorResponse('Missing, wrong or revoked key'),
          '429': errorResponse('Too many requests'),
        },
      },
    },
    '/orders/{code}': {
      get: {
        summary: 'Get one order',
        parameters: [codeParameter],
        responses: {
          '200': orderResponse('The order'),
          '401': errorResponse('Missing, wrong or revoked key'),
          '404': errorResponse('No such order for your shop'),
          '429': errorResponse('Too many requests'),
        },
      },
    },
    '/orders/{code}/cancel': {
      post: {
        summary: 'Cancel an order',
        description: 'Only while the order is still pending, before a courier has it. Later, contact the delivery company.',
        parameters: [codeParameter],
        responses: {
          '200': orderResponse('The order is now cancelled'),
          '401': errorResponse('Missing, wrong or revoked key'),
          '404': errorResponse('No such order for your shop'),
          '409': errorResponse('The order can no longer be cancelled (not_cancellable)'),
          '429': errorResponse('Too many requests'),
        },
      },
    },
  },
  webhooks: {
    orderEvent: {
      post: {
        summary: 'Order events sent to your webhook address',
        description:
          'Set your webhook address in the portal under Connect Store. Cedar sends a POST with a JSON body {id, event, createdAt, data} whenever one of your orders changes status. ' +
          'Events: order.status_changed (every change), order.delivered, order.returned, and payout.paid (a payout to your shop; data holds amountUsd, paidAt and payoutRunId). ' +
          'Every message has the header X-Cedar-Signature: t=<unix seconds>,v1=<hex>. v1 is HMAC-SHA256, using your webhook signing secret, of the text "<t>.<exact request body>". ' +
          'Check it, and reject a message whose t is more than 5 minutes old. Answer with any 2xx status to confirm. Any other answer, or no answer within 10 seconds, is tried again after 1 minute, 5, 15, 60, 3 hours, 6, 12 and 24 hours, then dropped. ' +
          'The same message can arrive twice, so use the id to ignore repeats.',
        requestBody: { content: { 'application/json': { schema: { $ref: '#/components/schemas/WebhookMessage' } } } },
        responses: { '200': { description: 'Received' } },
      },
    },
  },
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', description: 'Your API key, which starts with cdr_live_' } },
    schemas: {
      Status: { type: 'string', enum: ['pending', 'assigned', 'picked_up', 'delivered', 'failed', 'returned', 'cancelled'] },
      Zone: { type: 'object', properties: { id: { type: 'string', format: 'uuid' }, name: { type: 'string' }, deliveryFeeUsd: { type: 'number' } } },
      NewOrder: {
        type: 'object',
        required: ['recipient'],
        properties: {
          reference: { type: 'string', maxLength: 100, description: 'Your own order number. Unique per shop.' },
          zoneId: { type: 'string', format: 'uuid', description: 'From GET /zones. Without it the company default price applies.' },
          recipient: {
            type: 'object', required: ['name', 'phone', 'address'],
            properties: { name: { type: 'string', maxLength: 200 }, phone: { type: 'string', maxLength: 40 }, address: { type: 'string', maxLength: 1000 } },
          },
          codUsd: { type: 'number', minimum: 0, default: 0, description: 'Cash to collect from the recipient, in US dollars' },
          serviceType: { type: 'string', enum: ['delivery', 'replacement', 'pickup'], default: 'delivery' },
          weightKg: { type: 'number', minimum: 0 },
          isBreakable: { type: 'boolean' },
          timeSlot: { type: 'string', maxLength: 50 },
          notes: { type: 'string', maxLength: 4000 },
        },
      },
      Order: {
        type: 'object',
        properties: {
          code: { type: 'string' }, reference: { type: ['string', 'null'] }, status: { $ref: '#/components/schemas/Status' },
          trackingUrl: { type: ['string', 'null'], description: 'A public link your customer can open to follow the delivery' },
          zoneId: { type: ['string', 'null'] },
          recipient: { type: 'object', properties: { name: { type: 'string' }, phone: { type: 'string' }, address: { type: 'string' } } },
          codUsd: { type: 'number' }, deliveryFeeUsd: { type: 'number' }, serviceType: { type: 'string' }, weightKg: { type: 'number' },
          isBreakable: { type: 'boolean' }, timeSlot: { type: ['string', 'null'] }, notes: { type: ['string', 'null'] },
          createdAt: { type: 'string', format: 'date-time' }, updatedAt: { type: 'string', format: 'date-time' }, deliveredAt: { type: ['string', 'null'], format: 'date-time' },
        },
      },
      WebhookMessage: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid', description: 'Unique per message; use it to ignore repeats' },
          event: { type: 'string', enum: ['order.status_changed', 'order.delivered', 'order.returned', 'payout.paid'] },
          createdAt: { type: 'string', format: 'date-time' },
          data: {
            type: 'object',
            properties: {
              code: { type: 'string' }, status: { $ref: '#/components/schemas/Status' }, previousStatus: { $ref: '#/components/schemas/Status' },
              externalReference: { type: ['string', 'null'], description: 'Your reference from when the order was created' },
              changedAt: { type: 'string', format: 'date-time' },
              collectedUsd: { type: ['number', 'null'], description: 'Only on order.delivered' }, collectedLbp: { type: ['number', 'null'], description: 'Only on order.delivered' },
              amountUsd: { type: 'number', description: 'Only on payout.paid: the amount paid to your shop' }, paidAt: { type: 'string', format: 'date-time', description: 'Only on payout.paid' }, payoutRunId: { type: ['string', 'null'], description: 'Only on payout.paid' },
            },
          },
        },
      },
      Error: {
        type: 'object',
        properties: {
          error: { type: 'object', properties: { code: { type: 'string', description: 'unauthorized, invalid_request, not_found, duplicate_reference, not_cancellable, rate_limited, internal_error' }, message: { type: 'string' } } },
          requestId: { type: 'string' },
        },
      },
    },
  },
} as const
