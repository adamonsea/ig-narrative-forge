-- Fix user_has_topic_access to recognize creators without membership rows
create or replace function public.user_has_topic_access(p_topic_id uuid, p_required_role text default 'viewer')
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  is_creator boolean;
  has_membership boolean;
begin
  -- Admins always pass
  if public.has_role(auth.uid(), 'admin'::app_role) then
    return true;
  end if;

  -- Creator passes regardless of memberships
  select exists (
    select 1 from public.topics t
    where t.id = p_topic_id and t.created_by = auth.uid()
  ) into is_creator;
  
  if is_creator then
    return true;
  end if;

  -- Membership-based checks
  select exists (
    select 1
    from public.topic_memberships tm
    where tm.topic_id = p_topic_id
      and tm.user_id = auth.uid()
      and (
        p_required_role = 'viewer' or
        (p_required_role = 'editor' and tm.role in ('owner','editor')) or
        (p_required_role = 'owner' and tm.role = 'owner')
      )
  ) into has_membership;

  return has_membership;
end;
$$;

-- Backfill owner memberships for all existing topic creators
insert into public.topic_memberships (topic_id, user_id, role)
select t.id, t.created_by, 'owner'
from public.topics t
left join public.topic_memberships tm
  on tm.topic_id = t.id and tm.user_id = t.created_by
where tm.topic_id is null
on conflict do nothing;

-- Update storage policies for topic-logos (owner writes, public reads)
drop policy if exists "topic_logo_insert" on storage.objects;
create policy "topic_logo_insert"
on storage.objects
for insert to authenticated
with check (
  bucket_id = 'topic-logos'
  and split_part(name, '/', 1) ~* '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$'
  and public.user_has_topic_access(split_part(name, '/', 1)::uuid, 'owner')
);

drop policy if exists "topic_logo_update" on storage.objects;
create policy "topic_logo_update"
on storage.objects
for update to authenticated
using (
  bucket_id = 'topic-logos'
  and split_part(name, '/', 1) ~* '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$'
  and public.user_has_topic_access(split_part(name, '/', 1)::uuid, 'owner')
)
with check (
  bucket_id = 'topic-logos'
  and split_part(name, '/', 1) ~* '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$'
  and public.user_has_topic_access(split_part(name, '/', 1)::uuid, 'owner')
);

drop policy if exists "topic_logo_delete" on storage.objects;
create policy "topic_logo_delete"
on storage.objects
for delete to authenticated
using (
  bucket_id = 'topic-logos'
  and split_part(name, '/', 1) ~* '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$'
  and public.user_has_topic_access(split_part(name, '/', 1)::uuid, 'owner')
);

drop policy if exists "topic_logo_public_read" on storage.objects;
create policy "topic_logo_public_read"
on storage.objects
for select to public
using (bucket_id = 'topic-logos');

-- Create trigger to automatically grant creator memberships for new topics
create or replace function public.grant_creator_membership_for_topic()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.topic_memberships (topic_id, user_id, role)
  values (new.id, new.created_by, 'owner')
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists trg_grant_creator_membership on public.topics;
create trigger trg_grant_creator_membership
after insert on public.topics
for each row
execute function public.grant_creator_membership_for_topic();