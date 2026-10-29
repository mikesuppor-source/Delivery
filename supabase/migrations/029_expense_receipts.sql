-- Expense receipts: a photo or PDF kept with an expense (Phase 6, section 6.4).
--
-- The files live in a private bucket, like delivery-proof: the server uploads them and hands out short-lived
-- signed links, so there are no storage policies. The expense keeps the path in receipt_path, and the check
-- below makes sure that path always sits in the expense's own company and expense folder.

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('expense-receipts', 'expense-receipts', false, 3000000, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 3000000, allowed_mime_types = excluded.allowed_mime_types;

alter table public.expenses drop constraint if exists expenses_receipt_path_check;
alter table public.expenses add constraint expenses_receipt_path_check
  check (receipt_path is null or receipt_path like (workspace_id::text || '/' || id::text || '/%'));
