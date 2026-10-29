-- شغّل الملف كله في Supabase > SQL Editor
create table customers(
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id),
  name text not null, phone text,
  total numeric(12,2) not null check(total>0),
  down numeric(12,2) not null default 0 check(down>=0),
  created_at timestamptz default now());

create table installments(
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id),
  customer_id uuid not null references customers(id) on delete cascade,
  seq int not null, due_date date not null,
  amount numeric(12,2) not null check(amount>0),
  paid numeric(12,2) not null default 0 check(paid>=0 and paid<=amount));

create table payments(
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id),
  customer_id uuid not null references customers(id) on delete cascade,
  installment_id uuid not null references installments(id) on delete cascade,
  amount numeric(12,2) not null check(amount>0),
  paid_at timestamptz default now());

create index on installments(customer_id);
create index on installments(due_date);
create index on payments(customer_id);

alter table customers enable row level security;
alter table installments enable row level security;
alter table payments enable row level security;
create policy own on customers for all using(owner_id=auth.uid()) with check(owner_id=auth.uid());
create policy own on installments for all using(owner_id=auth.uid()) with check(owner_id=auth.uid());
create policy own on payments for all using(owner_id=auth.uid()) with check(owner_id=auth.uid());

-- إنشاء عميل + أقساطه في عملية واحدة
create or replace function create_customer(p_name text,p_phone text,p_total numeric,p_down numeric,p_n int,p_start date)
returns uuid language plpgsql as $$
declare cid uuid; base numeric; acc numeric:=0; a numeric; i int;
begin
  if p_n<1 or p_total<=p_down then raise exception 'بيانات غير صحيحة'; end if;
  insert into customers(name,phone,total,down) values(p_name,p_phone,p_total,p_down) returning id into cid;
  base:=floor((p_total-p_down)/p_n*100)/100;
  for i in 1..p_n loop
    a:=case when i=p_n then p_total-p_down-acc else base end; acc:=acc+a;
    insert into installments(customer_id,seq,due_date,amount) values(cid,i,(p_start+((i-1)||' month')::interval)::date,a);
  end loop;
  return cid;
end $$;

-- تسجيل دفعة (كاملة أو جزئية)
create or replace function pay_installment(p_installment uuid,p_amount numeric)
returns void language plpgsql as $$
declare r installments%rowtype;
begin
  select * into r from installments where id=p_installment for update;
  if not found then raise exception 'القسط غير موجود'; end if;
  if p_amount<=0 or p_amount>r.amount-r.paid then raise exception 'المبلغ غير صحيح'; end if;
  update installments set paid=paid+p_amount where id=p_installment;
  insert into payments(customer_id,installment_id,amount) values(r.customer_id,p_installment,p_amount);
end $$;
