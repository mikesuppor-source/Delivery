insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('delivery-proof','delivery-proof',false,1000000,array['image/png','image/jpeg'])
on conflict(id) do update set public=false,file_size_limit=1000000,allowed_mime_types=excluded.allowed_mime_types;
-- No ordinary storage policies: upload/download authorization happens in the server.
