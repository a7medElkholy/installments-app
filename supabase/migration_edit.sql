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
