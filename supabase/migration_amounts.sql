-- صلاحية "عرض المبالغ" (الافتراضي: مخفية عن الموظفين)
alter table profiles add column if not exists can_amounts boolean not null default false;
create or replace function has_perm(p text) returns boolean language sql security definer stable set search_path=public as $$
  select coalesce((select active and (role='admin' or case p when 'view' then true when 'add' then can_add when 'edit' then can_edit
    when 'pay' then can_pay when 'delete' then can_delete when 'print' then can_print when 'amounts' then can_amounts else false end)
    from profiles where id=auth.uid()),false) $$;
