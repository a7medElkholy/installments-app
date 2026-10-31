import {useEffect,useState,useCallback} from 'react'
import {supabase} from './supabase'

const fm=n=>Math.round(n*100)/100
const mon=n=>fm(n).toLocaleString('en-US')+' ج.م'
const pd=s=>{const[y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d)}
const iso=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')
const dd=s=>{const t=new Date();t.setHours(0,0,0,0);return Math.round((pd(s)-t)/864e5)}
const nextMonth=()=>{const d=new Date();d.setMonth(d.getMonth()+1);return iso(d)}
const left=i=>i.amount-i.paid
const remOf=c=>c.installments.reduce((s,i)=>s+left(i),0)
const nextInst=c=>c.installments.find(i=>left(i)>0.005)
function status(i){
  if(left(i)<=0.005)return['مدفوع','ok']
  const d=dd(i.due_date)
  if(d<0)return['متأخر '+(-d)+' يوم','late']
  if(d<=5)return[d===0?'مستحق اليوم':'باقي '+d+' أيام','soon']
  return[i.paid>0?'جزئي':'قادم','nx']
}

export default function App(){
  const [session,setSession]=useState(undefined)
  useEffect(()=>{
    supabase.auth.getSession().then(({data})=>setSession(data.session))
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s))
    return()=>subscription.unsubscribe()
  },[])
  if(session===undefined)return null
  return session?<Main/>:<Login/>
}

function Login(){
  const [email,setEmail]=useState('');const [pw,setPw]=useState('');const [err,setErr]=useState('');const [busy,setBusy]=useState(false)
  async function submit(e){
    e.preventDefault();setBusy(true);setErr('')
    const {error}=await supabase.auth.signInWithPassword({email,password:pw})
    if(error)setErr('بيانات الدخول غير صحيحة');setBusy(false)
  }
  return <div className="wrap"><form className="card login" onSubmit={submit}>
    <h1>تسجيل الدخول</h1>
    <label>البريد الإلكتروني</label><input type="email" value={email} onChange={e=>setEmail(e.target.value)} required autoComplete="username"/>
    <label>كلمة المرور</label><input type="password" value={pw} onChange={e=>setPw(e.target.value)} required autoComplete="current-password"/>
    <div className="err">{err}</div>
    <button className="p" style={{width:'100%'}} disabled={busy}>دخول</button>
  </form></div>
}

function Main(){
  const [cs,setCs]=useState([]);const [view,setView]=useState('dash');const [cur,setCur]=useState(null);const [q,setQ]=useState('');const [err,setErr]=useState('')
  const load=useCallback(async()=>{
    const {data,error}=await supabase.from('customers').select('*, installments(*)').order('created_at',{ascending:false})
    if(error){setErr(error.message);return}
    data.forEach(c=>c.installments.sort((a,b)=>a.seq-b.seq));setCs(data)
  },[])
  useEffect(()=>{load()},[load])

  const late=[],soon=[]
  cs.forEach(c=>c.installments.forEach(i=>{
    if(left(i)<=0.005)return
    const d=dd(i.due_date),o={c,i,d}
    if(d<0)late.push(o);else if(d<=5)soon.push(o)
  }))
  late.sort((a,b)=>a.d-b.d);soon.sort((a,b)=>a.d-b.d)
  const nc=late.length+soon.length
  const open=id=>{setCur(id);setView('det')}
  const tabs=[['dash','الرئيسية'],['notif','الإشعارات'+(nc?` (${nc})`:'')],['cust','العملاء'],['rep','تقارير'],['add','عميل جديد']]

  return <div className="wrap">
    <header className="noprint"><h1>نظام إدارة الأقساط</h1><button className="sm" onClick={()=>supabase.auth.signOut()}>خروج</button></header>
    <nav className="noprint">{tabs.map(([k,t])=><button key={k} className={view===k?'on':''} onClick={()=>setView(k)}>{t}</button>)}</nav>
    {err&&<div className="card err">{err}</div>}
    {view==='dash'&&<><div className="grid">
      <Stat l="العملاء" v={cs.length}/><Stat l="إجمالي المدفوع" v={mon(cs.reduce((s,c)=>s+c.total-remOf(c),0))} c="var(--gr)"/><Stat l="إجمالي المتبقي" v={mon(cs.reduce((s,c)=>s+remOf(c),0))}/>
      <Stat l="أقساط متأخرة" v={late.length} c="var(--rd)"/><Stat l="تستحق خلال 5 أيام" v={soon.length} c="var(--or)"/></div>
      <div style={{height:10}}/><Alerts late={late} soon={soon} open={open}/></>}
    {view==='notif'&&<Alerts late={late} soon={soon} open={open}/>}
    {view==='cust'&&<><input placeholder="بحث بالاسم أو الهاتف" value={q} onChange={e=>setQ(e.target.value)} style={{marginBottom:10}}/>
      <div className="card">{cs.filter(c=>(c.name+(c.phone||'')).includes(q)).map(c=>{
        const n=nextInst(c),p=100-remOf(c)/c.total*100
        return <div className="row" key={c.id} style={{cursor:'pointer'}} onClick={()=>open(c.id)}>
          <div><b>{c.name}</b><div className="mu">{c.phone}{n?' · القسط القادم '+n.due_date:' · مسدد بالكامل'}</div></div>
          <div style={{minWidth:150}}><div className="mu">مدفوع {mon(c.total-remOf(c))}</div><b>متبقي {mon(remOf(c))}</b><div className="bar"><i style={{width:p+'%'}}/></div></div></div>
      })}{!cs.length&&<p className="mu">لا يوجد عملاء.</p>}</div></>}
    {view==='rep'&&<Report cs={cs}/>}
    {view==='add'&&<AddForm done={async id=>{await load();open(id)}}/>}
    {view==='det'&&<Detail c={cs.find(x=>x.id===cur)} back={()=>setView('cust')} reload={load}/>}
  </div>
}

const Stat=({l,v,c})=><div className="card stat"><span className="mu">{l}</span><b style={{color:c}}>{v}</b></div>

function Alerts({late,soon,open}){
  const Row=({o,t})=><div className="row"><div><b>{o.c.name}</b> <span className="mu">قسط {o.i.seq} · {o.i.due_date}</span></div>
    <div><span className={'tag '+t}>{t==='late'?`متأخر ${-o.d} يوم`:o.d===0?'اليوم':`باقي ${o.d} أيام`}</span> <b>{mon(left(o.i))}</b> <button className="sm" onClick={()=>open(o.c.id)}>فتح</button></div></div>
  return <>
    <div className="card"><h2>الأقساط المتأخرة ({late.length})</h2>{late.map(o=><Row key={o.i.id} o={o} t="late"/>)}{!late.length&&<p className="mu">لا توجد أقساط متأخرة.</p>}</div>
    <div className="card"><h2>تستحق خلال 5 أيام ({soon.length})</h2>{soon.map(o=><Row key={o.i.id} o={o} t="soon"/>)}{!soon.length&&<p className="mu">لا توجد أقساط قريبة.</p>}</div></>
}

function AddForm({done}){
  const [f,setF]=useState({name:'',phone:'',principal:'',rate:'0',down:'0',n:'6',start:nextMonth()});const [busy,setBusy]=useState(false)
  const set=k=>e=>setF({...f,[k]:e.target.value})
  const P=+f.principal||0,r=+f.rate||0,d=+f.down||0,n=Math.floor(+f.n)
  const interest=fm(P*r/100),total=fm(P+interest)
  async function save(){
    if(!f.name.trim()||!(P>0)||r<0||!(total>d)||n<1||!f.start){alert('أكمل البيانات (الإجمالي لازم يكون أكبر من المقدم)');return}
    setBusy(true)
    const {data,error}=await supabase.rpc('create_customer',{p_name:f.name.trim(),p_phone:f.phone.trim(),p_principal:P,p_rate:r,p_down:d,p_n:n,p_start:f.start})
    setBusy(false)
    if(error)alert(error.message);else done(data)
  }
  return <div className="card"><h2>تسجيل عميل جديد</h2>
    <label>اسم العميل</label><input value={f.name} onChange={set('name')}/>
    <label>رقم الهاتف</label><input inputMode="tel" value={f.phone} onChange={set('phone')}/>
    <div className="f2">
      <div><label>المبلغ</label><input type="number" min="0" value={f.principal} onChange={set('principal')}/></div>
      <div><label>النسبة المضافة (%)</label><input type="number" min="0" step="0.01" value={f.rate} onChange={set('rate')}/></div>
      <div><label>الإجمالي بعد النسبة</label><input value={P>0?fm(total):''} readOnly/></div>
      <div><label>مقدم (اختياري)</label><input type="number" min="0" value={f.down} onChange={set('down')}/></div>
      <div><label>عدد الأقساط (المدة بالشهور)</label><input type="number" min="1" value={f.n} onChange={set('n')}/></div>
      <div><label>تاريخ أول قسط</label><input type="date" value={f.start} onChange={set('start')}/></div></div>
    {P>0&&total>d&&n>0&&<p className="mu">قيمة النسبة: {mon(interest)} · قيمة القسط الشهري: {mon((total-d)/n)} · المتبقي بعد المقدم: {mon(total-d)}</p>}
    <button className="p" onClick={save} disabled={busy}>حفظ العميل</button></div>
}

const PrintHead=({t})=><div className="printonly"><h1>{t}</h1><div className="mu">تاريخ الطباعة: {new Date().toLocaleDateString('en-GB')}</div><hr/></div>

function custStatus(c){
  let late=0,lateAmt=0,soon=0,soonAmt=0
  c.installments.forEach(i=>{
    if(left(i)<=0.005)return
    const d=dd(i.due_date)
    if(d<0){late++;lateAmt+=left(i)}else if(d<=5){soon++;soonAmt+=left(i)}
  })
  const k=late?'late':soon?'soon':'ok'
  return{k,late,lateAmt,soon,soonAmt,label:{late:'متأخر',soon:'قريب الاستحقاق',ok:'منتظم'}[k]}
}
const rank={late:0,soon:1,ok:2}

function Report({cs}){
  const [week,setWeek]=useState(0)
  useEffect(()=>{
    supabase.from('payments').select('amount').gte('paid_at',new Date(Date.now()-7*864e5).toISOString())
      .then(({data})=>setWeek((data||[]).reduce((s,x)=>s+Number(x.amount),0)))
  },[cs])
  const rows=cs.map(c=>({c,s:custStatus(c)})).sort((a,b)=>rank[a.s.k]-rank[b.s.k])
  const cnt=k=>rows.filter(r=>r.s.k===k).length
  const tot=f=>cs.reduce((s,c)=>s+f(c),0)
  const from=new Date(Date.now()-7*864e5).toLocaleDateString('en-GB'),to=new Date().toLocaleDateString('en-GB')
  return <>
    <button className="p noprint" onClick={()=>window.print()} style={{marginBottom:10}}>طباعة التقرير الأسبوعي</button>
    <PrintHead t="التقرير الأسبوعي للعملاء"/>
    <div className="grid" style={{marginBottom:10}}>
      <div className="card stat late"><span>متأخرون</span><b>{cnt('late')}</b></div>
      <div className="card stat soon"><span>قريبو الاستحقاق (5 أيام)</span><b>{cnt('soon')}</b></div>
      <div className="card stat ok"><span>منتظمون</span><b>{cnt('ok')}</b></div>
      <div className="card stat"><span className="mu">المحصّل ({from} – {to})</span><b>{mon(week)}</b></div></div>
    <div className="card tw"><table><thead><tr><th>العميل</th><th>الهاتف</th><th>الإجمالي</th><th>المتبقي</th><th>المتأخر</th><th>خلال 5 أيام</th><th>القسط القادم</th><th>الحالة</th></tr></thead><tbody>
      {rows.map(({c,s})=>{const n=nextInst(c);return <tr key={c.id} className={'r-'+s.k}>
        <td>{c.name}</td><td>{c.phone}</td><td>{mon(c.total)}</td><td>{mon(remOf(c))}</td>
        <td>{s.late?`${s.late} قسط · ${mon(s.lateAmt)}`:'—'}</td><td>{s.soon?`${s.soon} قسط · ${mon(s.soonAmt)}`:'—'}</td>
        <td>{n?n.due_date:'مسدد'}</td><td><span className={'tag '+s.k}>{s.k==='ok'?'● ':''}{s.label}</span></td></tr>})}
      <tr><td><b>الإجمالي</b></td><td></td><td><b>{mon(tot(c=>c.total))}</b></td><td><b>{mon(tot(remOf))}</b></td><td colSpan="4"></td></tr>
    </tbody></table></div>
    <p className="mu">🔴 متأخر · 🟡 يستحق خلال 5 أيام أو أقل · 🟢 منتظم في السداد</p></>
}

function Receipt({p,c,log,close}){
  const i=c.installments.find(x=>x.id===p.installment_id)
  const paidTill=log.filter(x=>x.installment_id===p.installment_id&&x.paid_at<=p.paid_at).reduce((s,x)=>s+Number(x.amount),0)
  const lf=i.amount-paidTill
  const R=({l,v,b})=><div className="row"><span className="mu">{l}</span>{b?<b>{v}</b>:<span>{v}</span>}</div>
  return <>
    <div className="noprint"><button className="p sm" onClick={()=>window.print()}>طباعة الفاتورة</button> <button className="sm" onClick={close}>إغلاق</button></div>
    <div className="card receipt" style={{marginTop:8}}>
      <h1 style={{textAlign:'center'}}>إيصال استلام دفعة</h1>
      <R l="رقم الإيصال" v={p.id.slice(0,8).toUpperCase()}/>
      <R l="تاريخ الدفع" v={new Date(p.paid_at).toLocaleDateString('en-GB')}/>
      <R l="اسم العميل" v={c.name} b/><R l="الهاتف" v={c.phone||'—'}/>
      <R l="رقم القسط" v={`${i.seq} من ${c.installments.length}`} b/>
      <R l="موعد استحقاق القسط" v={i.due_date}/><R l="قيمة القسط" v={mon(i.amount)}/>
      <R l="المبلغ المدفوع الآن" v={mon(p.amount)} b/>
      <R l="إجمالي المدفوع من هذا القسط" v={mon(paidTill)}/>
      <R l="المتبقي من هذا القسط" v={mon(lf)}/>
      <div style={{textAlign:'center',margin:'12px 0'}}><span className={'tag '+(lf<=0.005?'ok':'soon')}>{lf<=0.005?'تم سداد القسط بالكامل':'دفعة جزئية'}</span></div>
      <div className="row" style={{marginTop:30,border:0}}><span>توقيع المستلم: ____________</span><span>توقيع العميل: ____________</span></div>
    </div></>
}

function Detail({c,back,reload}){
  const [amt,setAmt]=useState({});const [log,setLog]=useState([]);const [rc,setRc]=useState(null);const [editing,setEditing]=useState(false)
  const cid=c?.id
  const loadLog=useCallback(async()=>{
    if(!cid)return[]
    const {data}=await supabase.from('payments').select('*').eq('customer_id',cid).order('paid_at',{ascending:false})
    setLog(data||[]);return data||[]
  },[cid])
  useEffect(()=>{loadLog()},[loadLog])
  if(!c)return <button className="sm" onClick={back}>رجوع</button>
  if(rc)return <Receipt p={rc} c={c} log={log} close={()=>setRc(null)}/>
  if(editing)return <EditForm c={c} close={()=>setEditing(false)} done={async()=>{await reload();setEditing(false)}}/>
  const seqOf=id=>c.installments.find(i=>i.id===id)?.seq
  const lastPay=id=>{const l=log.find(x=>x.installment_id===id);return l?new Date(l.paid_at).toLocaleDateString('en-GB'):'—'}
  async function pay(i){
    const a=+(amt[i.id]??fm(left(i)))
    if(!(a>0)||a>left(i)+0.005){alert('المبلغ لازم يكون أكبر من صفر وغير أكبر من المتبقي ('+fm(left(i))+')');return}
    const {error}=await supabase.rpc('pay_installment',{p_installment:i.id,p_amount:a})
    if(error){alert(error.message);return}
    setAmt({...amt,[i.id]:undefined})
    const fresh=await loadLog();await reload()
    if(fresh[0])setRc(fresh[0])
  }
  async function del(){
    if(!confirm('حذف العميل وكل بياناته نهائيًا؟'))return
    const {error}=await supabase.from('customers').delete().eq('id',c.id)
    if(error)alert(error.message);else{await reload();back()}
  }
  const n=nextInst(c),rem=remOf(c)
  return <>
    <div className="noprint"><button className="sm" onClick={back}>رجوع</button> <button className="sm p" onClick={()=>window.print()}>طباعة تقرير العميل</button></div>
    <PrintHead t={'تقرير العميل: '+c.name}/>
    <div className="card" style={{marginTop:8}}><h2>{c.name} <span className="mu">{c.phone}</span></h2>
      <div className="grid"><Stat l="المبلغ الأصلي" v={mon(c.principal)}/><Stat l="النسبة المضافة" v={c.rate+'%'}/><Stat l="قيمة النسبة" v={mon(c.total-c.principal)}/><Stat l="الإجمالي بعد النسبة" v={mon(c.total)}/>
      <Stat l="المقدم" v={mon(c.down)}/><Stat l="إجمالي المدفوع" v={mon(c.total-rem)}/><Stat l="المتبقي" v={mon(rem)} c="var(--rd)"/><Stat l="القسط القادم" v={n?n.due_date:'—'}/></div></div>
    <div className="card tw"><table><thead><tr><th>#</th><th>الاستحقاق</th><th>القسط</th><th>المدفوع</th><th>المتبقي</th><th>آخر دفعة</th><th>الحالة</th><th className="noprint">تسجيل دفعة</th></tr></thead><tbody>
      {c.installments.map(i=>{const s=status(i);return <tr key={i.id}>
        <td>{i.seq}</td><td>{i.due_date}</td><td>{mon(i.amount)}</td><td>{mon(i.paid)}</td><td>{mon(left(i))}</td><td>{lastPay(i.id)}</td>
        <td><span className={'tag '+s[1]}>{s[0]}</span></td>
        <td className="noprint">{left(i)>0.005?<><input type="number" min="0" value={amt[i.id]??fm(left(i))} onChange={e=>setAmt({...amt,[i.id]:e.target.value})}/> <button className="sm p" onClick={()=>pay(i)}>دفع</button></>:'✓'}</td></tr>})}
    </tbody></table></div>
    <div className="card"><h2>سجل الدفعات</h2>
      {log.map(l=><div className="row" key={l.id}><span>{new Date(l.paid_at).toLocaleDateString('en-GB')} · قسط {seqOf(l.installment_id)}</span><span><b>{mon(l.amount)}</b> <button className="sm noprint" onClick={()=>setRc(l)}>فاتورة</button></span></div>)}
      {!log.length&&<p className="mu">لا توجد دفعات بعد.</p>}</div>
    <div className="noprint"><button onClick={()=>setEditing(true)}>تعديل العميل</button> <button onClick={del} style={{color:'var(--rd)'}}>حذف العميل</button></div></>
}

function EditForm({c,close,done}){
  const unpaid=c.installments.filter(i=>left(i)>0.005)
  const paidSum=c.installments.reduce((t,i)=>t+Number(i.paid),0)
  const [f,setF]=useState({name:c.name,phone:c.phone||'',principal:String(c.principal),rate:String(c.rate),down:String(c.down),n:String(unpaid.length||1),start:unpaid[0]?.due_date||nextMonth()})
  const [busy,setBusy]=useState(false)
  const set=k=>e=>setF({...f,[k]:e.target.value})
  const P=+f.principal||0,r=+f.rate||0,d=+f.down||0,n=Math.floor(+f.n)
  const total=fm(P+P*r/100),rem=fm(total-d-paidSum)
  async function save(){
    if(!f.name.trim()||!(P>0)||r<0||!(total>d)||rem<-0.005||(rem>0.005&&(n<1||!f.start))){alert('راجع البيانات (الإجمالي لازم يكون أكبر من المقدم وأكبر من المدفوع)');return}
    setBusy(true)
    const {error}=await supabase.rpc('update_customer',{p_id:c.id,p_name:f.name.trim(),p_phone:f.phone.trim(),p_principal:P,p_rate:r,p_down:d,p_n:rem>0.005?n:0,p_start:f.start})
    setBusy(false)
    if(error)alert(error.message);else done()
  }
  return <div className="card"><h2>تعديل العميل</h2>
    <p className="mu">الأقساط المدفوعة بتفضل زي ما هي، والمبلغ المتبقي بيتوزع على أقساط جديدة حسب العدد والتاريخ اللي تحدده.</p>
    <label>اسم العميل</label><input value={f.name} onChange={set('name')}/>
    <label>رقم الهاتف</label><input inputMode="tel" value={f.phone} onChange={set('phone')}/>
    <div className="f2">
      <div><label>المبلغ</label><input type="number" min="0" value={f.principal} onChange={set('principal')}/></div>
      <div><label>النسبة المضافة (%)</label><input type="number" min="0" step="0.01" value={f.rate} onChange={set('rate')}/></div>
      <div><label>الإجمالي بعد النسبة</label><input value={P>0?total:''} readOnly/></div>
      <div><label>المقدم</label><input type="number" min="0" value={f.down} onChange={set('down')}/></div>
      <div><label>عدد الأقساط المتبقية</label><input type="number" min="1" value={f.n} onChange={set('n')}/></div>
      <div><label>تاريخ أول قسط جديد</label><input type="date" value={f.start} onChange={set('start')}/></div></div>
    <p className="mu">المدفوع حتى الآن (شامل المقدم): {mon(d+paidSum)} · المتبقي للتقسيط: {mon(Math.max(rem,0))}{rem>0.005&&n>0?' · القسط الجديد: '+mon(rem/n):''}</p>
    {rem<-0.005&&<p className="err">الإجمالي الجديد أقل من المبلغ المدفوع بالفعل.</p>}
    <button className="p" onClick={save} disabled={busy}>حفظ التعديلات</button> <button onClick={close}>إلغاء</button></div>
}
