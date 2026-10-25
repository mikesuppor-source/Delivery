create function public.accept_staff_invite(p_token text,p_user uuid,p_email text,p_name text)
returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare inv public.invitations;
begin
 select * into inv from public.invitations where token=p_token for update;
 if not found or inv.accepted_at is not null or inv.expires_at<now() or lower(inv.email)<>lower(p_email) then raise exception 'Invalid or expired invitation'; end if;
 if not exists(select 1 from auth.users where id=p_user and lower(email)=lower(p_email) and email_confirmed_at is not null) then raise exception 'Verify your email first'; end if;
 insert into public.workspace_members(workspace_id,user_id,role,display_name,joined_at)
 values(inv.workspace_id,p_user,inv.role,p_name,now()) on conflict(workspace_id,user_id) do nothing;
 if inv.role='driver' and not exists(select 1 from public.drivers where workspace_id=inv.workspace_id and user_id=p_user) then
  insert into public.drivers(workspace_id,user_id,name) values(inv.workspace_id,p_user,p_name);
 end if;
 update public.invitations set accepted_at=now() where id=inv.id;
 insert into public.audit_log(workspace_id,actor_id,action,entity_type,entity_id) values(inv.workspace_id,p_user,'member.joined','invitation',inv.id);
 return true;
end $$;
revoke all on function public.accept_staff_invite(text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.accept_staff_invite(text,uuid,text,text) to service_role;
