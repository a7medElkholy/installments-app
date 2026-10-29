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
  const tabs=[['dash','الرئيسية'],['notif','الإشعارات'+(nc?` (${nc})`:'')],['cust','العملاء'],['add','عميل جديد']]

  return <div className="wrap">
    <header><h1>نظام إدارة الأقساط</h1><button className="sm" onClick={()=>supabase.auth.signOut()}>خروج</button></header>
    <nav>{tabs.map(([k,t])=><button key={k} className={view===k?'on':''} onClick={()=>setView(k)}>{t}</button>)}</nav>
    {err&&<div className="card err">{err}</div>}
    {view==='dash'&&<><div className="grid">
      <Stat l="العملاء" v={cs.length}/><Stat l="إجمالي المتبقي" v={mon(cs.reduce((s,c)=>s+remOf(c),0))}/>
      <Stat l="أقساط متأخرة" v={late.length} c="var(--rd)"/><Stat l="تستحق خلال 5 أيام" v={soon.length} c="var(--or)"/></div>
      <div style={{height:10}}/><Alerts late={late} soon={soon} open={open}/></>}
    {view==='notif'&&<Alerts late={late} soon={soon} open={open}/>}
    {view==='cust'&&<><input placeholder="بحث بالاسم أو الهاتف" value={q} onChange={e=>setQ(e.target.value)} style={{marginBottom:10}}/>
      <div className="card">{cs.filter(c=>(c.name+(c.phone||'')).includes(q)).map(c=>{
        const n=nextInst(c),p=100-remOf(c)/c.total*100
        return <div className="row" key={c.id} style={{cursor:'pointer'}} onClick={()=>open(c.id)}>
          <div><b>{c.name}</b><div className="mu">{c.phone}{n?' · القسط القادم '+n.due_date:' · مسدد بالكامل'}</div></div>
          <div style={{minWidth:130}}><b>{mon(remOf(c))}</b><div className="bar"><i style={{width:p+'%'}}/></div></div></div>
      })}{!cs.length&&<p className="mu">لا يوجد عملاء.</p>}</div></>}
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
  const [f,setF]=useState({name:'',phone:'',total:'',down:'0',n:'6',start:nextMonth()});const [busy,setBusy]=useState(false)
  const set=k=>e=>setF({...f,[k]:e.target.value})
  const t=+f.total,d=+f.down||0,n=Math.floor(+f.n)
  async function save(){
    if(!f.name.trim()||!(t>d)||n<1||!f.start){alert('أكمل البيانات (المبلغ لازم يكون أكبر من المقدم)');return}
    setBusy(true)
    const {data,error}=await supabase.rpc('create_customer',{p_name:f.name.trim(),p_phone:f.phone.trim(),p_total:t,p_down:d,p_n:n,p_start:f.start})
    setBusy(false)
    if(error)alert(error.message);else done(data)
  }
  return <div className="card"><h2>تسجيل عميل جديد</h2>
    <label>اسم العميل</label><input value={f.name} onChange={set('name')}/>
    <label>رقم الهاتف</label><input inputMode="tel" value={f.phone} onChange={set('phone')}/>
    <div className="f2">
      <div><label>المبلغ الإجمالي</label><input type="number" min="0" value={f.total} onChange={set('total')}/></div>
      <div><label>مقدم (اختياري)</label><input type="number" min="0" value={f.down} onChange={set('down')}/></div>
      <div><label>عدد الأقساط (المدة بالشهور)</label><input type="number" min="1" value={f.n} onChange={set('n')}/></div>
      <div><label>تاريخ أول قسط</label><input type="date" value={f.start} onChange={set('start')}/></div></div>
    {t>d&&n>0&&<p className="mu">قيمة القسط الشهري: {mon((t-d)/n)} · المتبقي بعد المقدم: {mon(t-d)}</p>}
    <button className="p" onClick={save} disabled={busy}>حفظ العميل</button></div>
}

function Detail({c,back,reload}){
  const [amt,setAmt]=useState({});const [log,setLog]=useState([])
  const cid=c?.id
  const loadLog=useCallback(async()=>{
    if(!cid)return
    const {data}=await supabase.from('payments').select('*').eq('customer_id',cid).order('paid_at',{ascending:false})
    setLog(data||[])
  },[cid])
  useEffect(()=>{loadLog()},[loadLog])
  if(!c)return <button className="sm" onClick={back}>رجوع</button>
  const seqOf=id=>c.installments.find(i=>i.id===id)?.seq
  async function pay(i){
    const a=+(amt[i.id]??fm(left(i)))
    if(!(a>0)||a>left(i)+0.005){alert('المبلغ لازم يكون أكبر من صفر وغير أكبر من المتبقي ('+fm(left(i))+')');return}
    const {error}=await supabase.rpc('pay_installment',{p_installment:i.id,p_amount:a})
    if(error){alert(error.message);return}
    setAmt({...amt,[i.id]:undefined});await reload();loadLog()
  }
  async function del(){
    if(!confirm('حذف العميل وكل بياناته نهائيًا؟'))return
    const {error}=await supabase.from('customers').delete().eq('id',c.id)
    if(error)alert(error.message);else{await reload();back()}
  }
  const n=nextInst(c)
  return <>
    <button className="sm" onClick={back}>رجوع</button>
    <div className="card" style={{marginTop:8}}><h2>{c.name} <span className="mu">{c.phone}</span></h2>
      <div className="grid"><Stat l="الإجمالي" v={mon(c.total)}/><Stat l="المقدم" v={mon(c.down)}/><Stat l="المتبقي" v={mon(remOf(c))} c="var(--rd)"/><Stat l="القسط القادم" v={n?n.due_date:'—'}/></div></div>
    <div className="card tw"><table><thead><tr><th>#</th><th>الاستحقاق</th><th>القسط</th><th>المدفوع</th><th>المتبقي</th><th>الحالة</th><th>تسجيل دفعة</th></tr></thead><tbody>
      {c.installments.map(i=>{const s=status(i);return <tr key={i.id}>
        <td>{i.seq}</td><td>{i.due_date}</td><td>{mon(i.amount)}</td><td>{mon(i.paid)}</td><td>{mon(left(i))}</td>
        <td><span className={'tag '+s[1]}>{s[0]}</span></td>
        <td>{left(i)>0.005?<><input type="number" min="0" value={amt[i.id]??fm(left(i))} onChange={e=>setAmt({...amt,[i.id]:e.target.value})}/> <button className="sm p" onClick={()=>pay(i)}>دفع</button></>:'✓'}</td></tr>})}
    </tbody></table></div>
    <div className="card"><h2>سجل الدفعات</h2>
      {log.map(l=><div className="row" key={l.id}><span>{new Date(l.paid_at).toLocaleDateString('en-GB')} · قسط {seqOf(l.installment_id)}</span><b>{mon(l.amount)}</b></div>)}
      {!log.length&&<p className="mu">لا توجد دفعات بعد.</p>}</div>
    <button onClick={del} style={{color:'var(--rd)'}}>حذف العميل</button></>
}
