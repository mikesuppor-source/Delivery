# WhatsApp message templates

WhatsApp only lets a business start a conversation with a template that Meta approved in advance.
Create each template below in Meta's WhatsApp Manager (Message templates, Create template) with exactly this name,
category **Utility**, one translation per language, and the text shown. Keep the numbered variables ({{1}}, {{2}}, ...).
Meta asks for an example value for each variable: use the ones listed.

This file is checked by a test against `lib/whatsapp-templates.ts`. Change the code and this file together.

## cedar_order_confirmed

Sent when: a new order is made for the customer.

Example values: {{1}} = CED-1042, {{2}} = Beirut Boutique, {{3}} = https://delivery-five-roan.vercel.app/track/abc123

English (`en`):

```
Hello! Your order #{{1}} from {{2}} is confirmed. Track your package here: {{3}} . Thank you for choosing us.
```

Arabic (`ar`):

```
مرحباً! تم تأكيد طلبك #{{1}} من متجر {{2}}. يمكنك تتبع شحنتك من هنا: {{3}} . شكراً لاختيارك لنا.
```

## cedar_out_for_delivery

Sent when: the courier picks the parcel up and sets off.

Example values: {{1}} = CED-1042, {{2}} = Rami, {{3}} = https://delivery-five-roan.vercel.app/track/abc123

English (`en`):

```
Good news! Your order #{{1}} is out for delivery with our courier {{2}}. Live tracking: {{3}} . Please keep your phone nearby.
```

Arabic (`ar`):

```
أخبار سارة! طلبك #{{1}} في طريقه إليك الآن مع السائق {{2}}. التتبع المباشر: {{3}} . نرجو إبقاء هاتفك قريباً.
```

## cedar_delivered

Sent when: the parcel is delivered.

Example values: {{1}} = CED-1042, {{2}} = https://delivery-five-roan.vercel.app/track/abc123

English (`en`):

```
Your order #{{1}} has been delivered. We would love your feedback: {{2}} . Thank you!
```

Arabic (`ar`):

```
تم تسليم طلبك #{{1}} بنجاح. يسعدنا تقييمك لخدمتنا: {{2}} . شكراً لك!
```

## cedar_delivery_failed

Sent when: a delivery attempt fails.

Example values: {{1}} = CED-1042, {{2}} = no answer, {{3}} = https://delivery-five-roan.vercel.app/track/abc123

English (`en`):

```
We could not deliver your order #{{1}} ({{2}}). We will reschedule soon. Track here: {{3}} . Thank you for your patience.
```

Arabic (`ar`):

```
تعذر تسليم طلبك #{{1}} بسبب ({{2}}). سنقوم بإعادة الجدولة قريباً. للتتبع: {{3}} . شكراً لصبرك.
```

## cedar_order_held

Sent when: the parcel is put in the warehouse.

Example values: {{1}} = CED-1042, {{2}} = 5 Nov, {{3}} = https://delivery-five-roan.vercel.app/track/abc123

English (`en`):

```
Your order #{{1}} is safely kept in our warehouse until {{2}}. Track here: {{3}} . We will contact you before delivery.
```

Arabic (`ar`):

```
طلبك #{{1}} محفوظ بأمان في مستودعنا حتى {{2}}. للتتبع: {{3}} . سنتواصل معك قبل التسليم.
```

