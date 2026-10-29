-- A shop's email address, for sending it account statements (Phase 6, section 6.1).
--
-- It is kept apart from the merchant's sign-in, which a shop may not have. Only the server writes shops, and the
-- check keeps out values that cannot be an address, so a bad entry never reaches the mail server.

alter table public.shops add column if not exists contact_email text;

alter table public.shops drop constraint if exists shops_contact_email_check;
alter table public.shops add constraint shops_contact_email_check
  check (contact_email is null or (length(contact_email) <= 254 and contact_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'));
