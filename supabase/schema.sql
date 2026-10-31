-- شغّل الملف كله في Supabase > SQL Editor
create table customers(
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id),
  name text not null, phone text,
  principal numeric(12,2) not null check(principal>0),
  rate numeric(6,2) not null default 0 check(rate>=0),
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

-- إنشاء عميل + أقساطه في عملية واحدة (الإجمالي = المبلغ + المبلغ × النسبة)
create or replace function create_customer(p_name text,p_phone text,p_principal numeric,p_rate numeric,p_down numeric,p_n int,p_start date)
returns uuid language plpgsql as $$
declare cid uuid; v_total numeric; base numeric; acc numeric:=0; a numeric; i int;
begin
  v_total:=round(p_principal*(1+p_rate/100),2);
  if p_n<1 or p_principal<=0 or p_rate<0 or v_total<=p_down then raise exception 'بيانات غير صحيحة'; end if;
  insert into customers(name,phone,principal,rate,total,down) values(p_name,p_phone,p_principal,p_rate,v_total,p_down) returning id into cid;
  base:=floor((v_total-p_down)/p_n*100)/100;
  for i in 1..p_n loop
    a:=case when i=p_n then v_total-p_down-acc else base end; acc:=acc+a;
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

-- تعديل عميل: الأقساط المدفوعة تفضل زي ما هي، والمتبقي يتوزع على أقساط جديدة
create or replace function update_customer(p_id uuid,p_name text,p_phone text,p_principal numeric,p_rate numeric,p_down numeric,p_n int,p_start date)
returns void language plpgsql as $$
declare v_total numeric; v_paid numeric; v_rem numeric; base numeric; acc numeric:=0; a numeric; i int; v_seq int;
begin
  perform 1 from customers where id=p_id for update;
  if not found then raise exception 'العميل غير موجود'; end if;
  v_total:=round(p_principal*(1+p_rate/100),2);
  if p_principal<=0 or p_rate<0 or p_down<0 or v_total<=p_down then raise exception 'بيانات غير صحيحة'; end if;
  select coalesce(sum(paid),0) into v_paid from installments where customer_id=p_id;
  v_rem:=v_total-p_down-v_paid;
  if v_rem<-0.005 then raise exception 'الإجمالي الجديد أقل من المبلغ المدفوع بالفعل'; end if;
  if v_rem>0.005 and p_n<1 then raise exception 'حدد عدد الأقساط'; end if;
  delete from installments where customer_id=p_id and paid=0;
  update installments set amount=paid where customer_id=p_id and paid<amount;
  update customers set name=p_name,phone=p_phone,principal=p_principal,rate=p_rate,total=v_total,down=p_down where id=p_id;
  if v_rem>0.005 then
    select coalesce(max(seq),0) into v_seq from installments where customer_id=p_id;
    base:=floor(v_rem/p_n*100)/100;
    for i in 1..p_n loop
      a:=case when i=p_n then v_rem-acc else base end; acc:=acc+a;
      insert into installments(customer_id,seq,due_date,amount) values(p_id,v_seq+i,(p_start+((i-1)||' month')::interval)::date,a);
    end loop;
  end if;
  with r as (select id,row_number() over(order by due_date,seq) rn from installments where customer_id=p_id)
  update installments x set seq=r.rn from r where x.id=r.id;
end $$;
