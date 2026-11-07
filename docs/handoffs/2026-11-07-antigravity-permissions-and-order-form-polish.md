# Handoff: System Permissions Lock & Order Form Simplification

**Branch:** `feat/permissions-and-order-form-polish`  
**Base:** `origin/main` (`6edac9d`)  
**Agent:** Antigravity (Frontend / Security & UI Polish)  
**Date:** 2026-11-07  

---

## 1. Scope & Security Hardening

This task implements the owner's operational security requirements:
1. **Merchant Price List Privacy**:
   - Removed the `"My Prices"` tab from `components/portal-header.tsx`.
   - Replaced `app/portal/prices/page.tsx` with an immediate redirect to `/portal`, preventing shops from browsing internal delivery zone tariffs.
2. **Staff Permission Locks Against Unauthorized Price & Commission Changes**:
   - **Backend Enforced**:
     - In `lib/catalog.ts`: Restricted `POST`, `PATCH`, and `DELETE` on `delivery_areas` strictly to `['owner']` (previously allowed `manager`). Also locked driver `payMode` and `payPercent` modifications to `['owner']`.
     - In `app/api/orders/route.ts`: Non-owners (`manager`, staff) can no longer override `deliveryFeeUsd` or `driverPayUsd`. If a non-owner submits custom fee/pay values, the API enforces the official catalog waterfall pricing (`pricing.feeUsd`, `pricing.driverPayUsd`).
   - **Frontend Enforced**:
     - In `app/(desk)/areas/area-list-client.tsx`: Set `canEdit = userRole === 'owner'`. Managers and read-only members can view delivery zones but cannot add, edit, or delete tariffs.
     - In `app/(desk)/orders/new/new-order-client.tsx`: Locked courier commission presets ($1.00, $1.50, $2.00, etc.) and fee override editors strictly to `isOwner`. Non-owners see a locked, read-only rate indicator.
3. **Streamlined Order Entry Layout (`/orders/new`)**:
   - Reorganized into 3 distinct, intuitive cards:
     1. **Recipient & Destination**: Shop selector, customer name, phone with instant CRM repeat-customer badge, delivery area, address pin, and town search.
     2. **Collection & COD**: Clean Net Item Price, fee allocation toggle (Customer vs Free Delivery), and high-contrast Total COD green banner.
     3. **Courier Assignment**: Simple driver dropdown.
   - Collapsed secondary settings into an **Advanced Parcel Options** accordion (custom waybills, return presets, fragile warnings, weight, 3PL codes).

---

## 2. Verification

- `npm run typecheck`: **PASSED** (0 errors).
- `npm run lint`: **PASSED** (0 errors).
- `npm test`: **PASSED** (179 passing tests).
- `npm run build`: **PASSED** (86 routes compiled cleanly).

---

## 3. Ready for Owner Review & Merge Approval

No database migrations were altered. `supabase/config.toml` was excluded from commit.
