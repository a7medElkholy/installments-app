-- شغّل هذا الملف مرة واحدة لو كنت شغّلت schema.sql القديم (يحافظ على بياناتك)
alter table customers add column if not exists principal numeric(12,2);
alter table customers add column if not exists rate numeric(6,2) not null default 0;
update customers set principal=total where principal is null;
alter table customers alter column principal set not null;

drop function if exists create_customer(text,text,numeric,numeric,int,date);
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
