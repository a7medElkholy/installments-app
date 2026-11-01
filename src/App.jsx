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
  return session?<Gate uid={session.user.id}/>:<Login/>
}

const can=(me,k)=>me.role==='admin'||!!me['can_'+k]
function Gate({uid}){
  const [me,setMe]=useState(undefined)
  useEffect(()=>{supabase.from('profiles').select('*').eq('id',uid).maybeSingle().then(({data})=>setMe(data||null))},[uid])
  if(me===undefined)return null
  if(!me||!me.active)return <div className="wrap"><div className="card login"><h1>الحساب غير مفعّل</h1><p className="mu">تواصل مع المدير.</p><button onClick={()=>supabase.auth.signOut()}>خروج</button></div></div>
  return <Main me={me}/>
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

function Main({me}){
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
  const tabs=[['dash','الرئيسية'],['notif','الإشعارات'+(nc?` (${nc})`:'')],['cust','العملاء'],can(me,'print')&&['rep','تقارير'],can(me,'add')&&['add','عميل جديد'],me.role==='admin'&&['users','المستخدمون']].filter(Boolean)

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
      <div className="card">{cs.filter(c=>(c.name+(c.phone||'')+(c.product||'')).includes(q)).map(c=>{
        const n=nextInst(c),p=100-remOf(c)/c.total*100
        return <div className="row" key={c.id} style={{cursor:'pointer'}} onClick={()=>open(c.id)}>
          <div><b>{c.name}</b><div className="mu">{c.product&&c.product+' · '}{c.phone}{n?' · القسط القادم '+n.due_date:' · مسدد بالكامل'}</div></div>
          <div style={{minWidth:150}}><div className="mu">مدفوع {mon(c.total-remOf(c))}</div><b>متبقي {mon(remOf(c))}</b><div className="bar"><i style={{width:p+'%'}}/></div></div></div>
      })}{!cs.length&&<p className="mu">لا يوجد عملاء.</p>}</div></>}
    {view==='rep'&&can(me,'print')&&<Report cs={cs}/>}
    {view==='users'&&me.role==='admin'&&<Users me={me}/>}
    {view==='add'&&can(me,'add')&&<AddForm cs={cs} done={async id=>{await load();open(id)}}/>}
    {view==='det'&&<Detail me={me} cs={cs} c={cs.find(x=>x.id===cur)} back={()=>setView('cust')} reload={load}/>}
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

async function prep(file){
  const b=await createImageBitmap(file),k=Math.min(1,1280/Math.max(b.width,b.height))
  const cv=document.createElement('canvas');cv.width=Math.round(b.width*k);cv.height=Math.round(b.height*k)
  cv.getContext('2d').drawImage(b,0,0,cv.width,cv.height)
  return new Promise(r=>cv.toBlob(r,'image/jpeg',0.8))
}
async function upload(file){
  const path=crypto.randomUUID()+'.jpg'
  const {error}=await supabase.storage.from('customer-docs').upload(path,await prep(file),{contentType:'image/jpeg'})
  if(error)throw error
  return path
}
function IdImage({path}){
  const [url,setUrl]=useState(null)
  useEffect(()=>{
    let ok=true;setUrl(null)
    if(path)supabase.storage.from('customer-docs').createSignedUrl(path,3600).then(({data})=>ok&&setUrl(data?.signedUrl||null))
    return()=>{ok=false}
  },[path])
  return url?<a href={url} target="_blank" rel="noreferrer"><img className="idimg" src={url} alt="صورة البطاقة"/></a>:null
}
const Prods=({cs})=><datalist id="prods">{[...new Set(cs.map(c=>c.product).filter(Boolean))].map(p=><option key={p} value={p}/>)}</datalist>

function AddForm({cs,done}){
  const [f,setF]=useState({name:'',phone:'',product:'',principal:'',rate:'0',down:'0',n:'6',start:nextMonth()});const [file,setFile]=useState(null);const [busy,setBusy]=useState(false)
  const set=k=>e=>setF({...f,[k]:e.target.value})
  const P=+f.principal||0,r=+f.rate||0,d=+f.down||0,n=Math.floor(+f.n)
  const interest=fm(P*r/100),total=fm(P+interest)
  async function save(){
    if(!f.name.trim()||!(P>0)||r<0||!(total>d)||n<1||!f.start){alert('أكمل البيانات (الإجمالي لازم يكون أكبر من المقدم)');return}
    setBusy(true)
    try{
      const img=file?await upload(file):null
      const {data,error}=await supabase.rpc('create_customer',{p_name:f.name.trim(),p_phone:f.phone.trim(),p_product:f.product.trim(),p_principal:P,p_rate:r,p_down:d,p_n:n,p_start:f.start,p_image:img})
      if(error)throw error
      done(data)
    }catch(e){alert(e.message)}
    setBusy(false)
  }
  return <div className="card"><h2>تسجيل عميل جديد</h2><Prods cs={cs}/>
    <label>اسم العميل</label><input value={f.name} onChange={set('name')}/>
    <label>رقم الهاتف</label><input inputMode="tel" value={f.phone} onChange={set('phone')}/>
    <label>نوع المنتج</label><input list="prods" value={f.product} onChange={set('product')}/>
    <label>صورة البطاقة (اختياري)</label><input type="file" accept="image/*" onChange={e=>setFile(e.target.files[0]||null)}/>
    <div className="f2">
      <div><label>المبلغ</label><input type="number" min="0" value={f.principal} onChange={set('principal')}/></div>
      <div><label>النسبة المضافة (%)</label><input type="number" min="0" step="0.01" value={f.rate} onChange={set('rate')}/></div>
      <div><label>الإجمالي بعد النسبة</label><input value={P>0?fm(total):''} readOnly/></div>
      <div><label>مقدم (اختياري)</label><input type="number" min="0" value={f.down} onChange={set('down')}/></div>
      <div><label>عدد الأقساط (المدة بالشهور)</label><input type="number" min="1" value={f.n} onChange={set('n')}/></div>
      <div><label>تاريخ أول قسط</label><input type="date" value={f.start} onChange={set('start')}/></div></div>
    {P>0&&total>d&&n>0&&<p className="mu">قيمة النسبة: {mon(interest)} · قيمة القسط الشهري: {mon((total-d)/n)} · المتبقي بعد المقدم: {mon(total-d)}</p>}
    <button className="p" onClick={save} disabled={busy}>{busy?'جاري الحفظ...':'حفظ العميل'}</button></div>
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
    <div className="card tw"><table><thead><tr><th>العميل</th><th>المنتج</th><th>الهاتف</th><th>الإجمالي</th><th>المتبقي</th><th>المتأخر</th><th>خلال 5 أيام</th><th>القسط القادم</th><th>الحالة</th></tr></thead><tbody>
      {rows.map(({c,s})=>{const n=nextInst(c);return <tr key={c.id} className={'r-'+s.k}>
        <td>{c.name}</td><td>{c.product}</td><td>{c.phone}</td><td>{mon(c.total)}</td><td>{mon(remOf(c))}</td>
        <td>{s.late?`${s.late} قسط · ${mon(s.lateAmt)}`:'—'}</td><td>{s.soon?`${s.soon} قسط · ${mon(s.soonAmt)}`:'—'}</td>
        <td>{n?n.due_date:'مسدد'}</td><td><span className={'tag '+s.k}>{s.k==='ok'?'● ':''}{s.label}</span></td></tr>})}
      <tr><td><b>الإجمالي</b></td><td></td><td></td><td><b>{mon(tot(c=>c.total))}</b></td><td><b>{mon(tot(remOf))}</b></td><td colSpan="4"></td></tr>
    </tbody></table></div>
    <p className="mu">🔴 متأخر · 🟡 يستحق خلال 5 أيام أو أقل · 🟢 منتظم في السداد</p></>
}

function Receipt({p,c,log,close,canPrint}){
  const i=c.installments.find(x=>x.id===p.installment_id)
  const paidTill=log.filter(x=>x.installment_id===p.installment_id&&x.paid_at<=p.paid_at).reduce((s,x)=>s+Number(x.amount),0)
  const lf=i.amount-paidTill
  const R=({l,v,b})=><div className="row"><span className="mu">{l}</span>{b?<b>{v}</b>:<span>{v}</span>}</div>
  return <>
    <div className="noprint">{canPrint&&<button className="p sm" onClick={()=>window.print()}>طباعة الفاتورة</button>} <button className="sm" onClick={close}>إغلاق</button></div>
    <div className="card receipt" style={{marginTop:8}}>
      <h1 style={{textAlign:'center'}}>إيصال استلام دفعة</h1>
      <R l="رقم الإيصال" v={p.id.slice(0,8).toUpperCase()}/>
      <R l="تاريخ الدفع" v={new Date(p.paid_at).toLocaleDateString('en-GB')}/>
      <R l="اسم العميل" v={c.name} b/><R l="الهاتف" v={c.phone||'—'}/><R l="نوع المنتج" v={c.product||'—'}/>
      <R l="رقم القسط" v={`${i.seq} من ${c.installments.length}`} b/>
      <R l="موعد استحقاق القسط" v={i.due_date}/><R l="قيمة القسط" v={mon(i.amount)}/>
      <R l="المبلغ المدفوع الآن" v={mon(p.amount)} b/>
      <R l="إجمالي المدفوع من هذا القسط" v={mon(paidTill)}/>
      <R l="المتبقي من هذا القسط" v={mon(lf)}/>
      <div style={{textAlign:'center',margin:'12px 0'}}><span className={'tag '+(lf<=0.005?'ok':'soon')}>{lf<=0.005?'تم سداد القسط بالكامل':'دفعة جزئية'}</span></div>
      <div className="row" style={{marginTop:30,border:0}}><span>توقيع المستلم: ____________</span><span>توقيع العميل: ____________</span></div>
    </div></>
}

function Detail({me,cs,c,back,reload}){
  const [amt,setAmt]=useState({});const [log,setLog]=useState([]);const [rc,setRc]=useState(null);const [editing,setEditing]=useState(false)
  const cid=c?.id
  const canPay=can(me,'pay'),canPrint=can(me,'print')
  const loadLog=useCallback(async()=>{
    if(!cid)return[]
    const {data}=await supabase.from('payments').select('*').eq('customer_id',cid).order('paid_at',{ascending:false})
    setLog(data||[]);return data||[]
  },[cid])
  useEffect(()=>{loadLog()},[loadLog])
  if(!c)return <button className="sm" onClick={back}>رجوع</button>
  if(rc)return <Receipt p={rc} c={c} log={log} canPrint={canPrint} close={()=>setRc(null)}/>
  if(editing)return <EditForm cs={cs} c={c} close={()=>setEditing(false)} done={async()=>{await reload();setEditing(false)}}/>
  const seqOf=id=>c.installments.find(i=>i.id===id)?.seq
  const lastPay=id=>{const l=log.find(x=>x.installment_id===id);return l?new Date(l.paid_at).toLocaleDateString('en-GB'):'—'}
  async function pay(i){
    const a=+(amt[i.id]??fm(left(i)))
    if(!(a>0)||a>left(i)+0.005){alert('المبلغ لازم يكون أكبر من صفر وغير أكبر من المتبقي ('+fm(left(i))+')');return}
    const {error}=await supabase.rpc('pay_installment',{p_installment:i.id,p_amount:a})
    if(error){alert(error.message);return}
    setAmt({...amt,[i.id]:undefined})
    const fresh=await loadLog();await reload()
    if(fresh[0]&&canPrint)setRc(fresh[0])
  }
  async function del(){
    if(!confirm('حذف العميل وكل بياناته نهائيًا؟'))return
    const {error}=await supabase.from('customers').delete().eq('id',c.id)
    if(error)alert(error.message);else{await reload();back()}
  }
  const n=nextInst(c),rem=remOf(c)
  return <>
    <div className="noprint"><button className="sm" onClick={back}>رجوع</button> {canPrint&&<button className="sm p" onClick={()=>window.print()}>طباعة تقرير العميل</button>}</div>
    <PrintHead t={'تقرير العميل: '+c.name}/>
    <div className="card" style={{marginTop:8}}><h2>{c.name} <span className="mu">{c.phone}</span></h2>
      {c.product&&<p className="mu">نوع المنتج: <b>{c.product}</b></p>}<IdImage path={c.image_path}/>
      <div className="grid"><Stat l="المبلغ الأصلي" v={mon(c.principal)}/><Stat l="النسبة المضافة" v={c.rate+'%'}/><Stat l="قيمة النسبة" v={mon(c.total-c.principal)}/><Stat l="الإجمالي بعد النسبة" v={mon(c.total)}/>
      <Stat l="المقدم" v={mon(c.down)}/><Stat l="إجمالي المدفوع" v={mon(c.total-rem)}/><Stat l="المتبقي" v={mon(rem)} c="var(--rd)"/><Stat l="القسط القادم" v={n?n.due_date:'—'}/></div></div>
    <div className="card tw"><table><thead><tr><th>#</th><th>الاستحقاق</th><th>القسط</th><th>المدفوع</th><th>المتبقي</th><th>آخر دفعة</th><th>الحالة</th>{canPay&&<th className="noprint">تسجيل دفعة</th>}</tr></thead><tbody>
      {c.installments.map(i=>{const s=status(i);return <tr key={i.id}>
        <td>{i.seq}</td><td>{i.due_date}</td><td>{mon(i.amount)}</td><td>{mon(i.paid)}</td><td>{mon(left(i))}</td><td>{lastPay(i.id)}</td>
        <td><span className={'tag '+s[1]}>{s[0]}</span></td>
        {canPay&&<td className="noprint">{left(i)>0.005?<><input type="number" min="0" value={amt[i.id]??fm(left(i))} onChange={e=>setAmt({...amt,[i.id]:e.target.value})}/> <button className="sm p" onClick={()=>pay(i)}>دفع</button></>:'✓'}</td>}</tr>})}
    </tbody></table></div>
    <div className="card"><h2>سجل الدفعات</h2>
      {log.map(l=><div className="row" key={l.id}><span>{new Date(l.paid_at).toLocaleDateString('en-GB')} · قسط {seqOf(l.installment_id)}</span><span><b>{mon(l.amount)}</b> {canPrint&&<button className="sm noprint" onClick={()=>setRc(l)}>فاتورة</button>}</span></div>)}
      {!log.length&&<p className="mu">لا توجد دفعات بعد.</p>}</div>
    <div className="noprint">{can(me,'edit')&&<button onClick={()=>setEditing(true)}>تعديل العميل</button>} {can(me,'delete')&&<button onClick={del} style={{color:'var(--rd)'}}>حذف العميل</button>}</div></>
}

function EditForm({cs,c,close,done}){
  const unpaid=c.installments.filter(i=>left(i)>0.005)
  const paidSum=c.installments.reduce((t,i)=>t+Number(i.paid),0)
  const [f,setF]=useState({name:c.name,phone:c.phone||'',product:c.product||'',principal:String(c.principal),rate:String(c.rate),down:String(c.down),n:String(unpaid.length||1),start:unpaid[0]?.due_date||nextMonth()})
  const [file,setFile]=useState(null);const [busy,setBusy]=useState(false)
  const set=k=>e=>setF({...f,[k]:e.target.value})
  const P=+f.principal||0,r=+f.rate||0,d=+f.down||0,n=Math.floor(+f.n)
  const total=fm(P+P*r/100),rem=fm(total-d-paidSum)
  async function save(){
    if(!f.name.trim()||!(P>0)||r<0||!(total>d)||rem<-0.005||(rem>0.005&&(n<1||!f.start))){alert('راجع البيانات (الإجمالي لازم يكون أكبر من المقدم وأكبر من المدفوع)');return}
    setBusy(true)
    try{
      const img=file?await upload(file):null
      const {error}=await supabase.rpc('update_customer',{p_id:c.id,p_name:f.name.trim(),p_phone:f.phone.trim(),p_product:f.product.trim(),p_principal:P,p_rate:r,p_down:d,p_n:rem>0.005?n:0,p_start:f.start,p_image:img})
      if(error)throw error
      done()
    }catch(e){alert(e.message)}
    setBusy(false)
  }
  return <div className="card"><h2>تعديل العميل</h2><Prods cs={cs}/>
    <p className="mu">الأقساط المدفوعة بتفضل زي ما هي، والمبلغ المتبقي بيتوزع على أقساط جديدة حسب العدد والتاريخ اللي تحدده.</p>
    <label>اسم العميل</label><input value={f.name} onChange={set('name')}/>
    <label>رقم الهاتف</label><input inputMode="tel" value={f.phone} onChange={set('phone')}/>
    <label>نوع المنتج</label><input list="prods" value={f.product} onChange={set('product')}/>
    <label>صورة البطاقة {c.image_path?'(الحالية موجودة، اختر ملفًا لاستبدالها)':''}</label><IdImage path={c.image_path}/>
    <input type="file" accept="image/*" onChange={e=>setFile(e.target.files[0]||null)}/>
    <div className="f2">
      <div><label>المبلغ</label><input type="number" min="0" value={f.principal} onChange={set('principal')}/></div>
      <div><label>النسبة المضافة (%)</label><input type="number" min="0" step="0.01" value={f.rate} onChange={set('rate')}/></div>
      <div><label>الإجمالي بعد النسبة</label><input value={P>0?total:''} readOnly/></div>
      <div><label>المقدم</label><input type="number" min="0" value={f.down} onChange={set('down')}/></div>
      <div><label>عدد الأقساط المتبقية</label><input type="number" min="1" value={f.n} onChange={set('n')}/></div>
      <div><label>تاريخ أول قسط جديد</label><input type="date" value={f.start} onChange={set('start')}/></div></div>
    <p className="mu">المدفوع حتى الآن (شامل المقدم): {mon(d+paidSum)} · المتبقي للتقسيط: {mon(Math.max(rem,0))}{rem>0.005&&n>0?' · القسط الجديد: '+mon(rem/n):''}</p>
    {rem<-0.005&&<p className="err">الإجمالي الجديد أقل من المبلغ المدفوع بالفعل.</p>}
    <button className="p" onClick={save} disabled={busy}>{busy?'جاري الحفظ...':'حفظ التعديلات'}</button> <button onClick={close}>إلغاء</button></div>
}

const PERMS=[['add','إضافة عملاء'],['edit','تعديل'],['pay','تسجيل دفعات'],['delete','حذف'],['print','طباعة تقارير']]
async function manage(body){
  const {data,error}=await supabase.functions.invoke('manage-users',{body})
  if(error){let m=error.message;try{m=(await error.context.json()).error||m}catch(e){}throw new Error(m)}
  if(data?.error)throw new Error(data.error)
}
function Users({me}){
  const empty={name:'',email:'',password:'',can_add:false,can_edit:false,can_pay:false,can_delete:false,can_print:false}
  const [us,setUs]=useState([]);const [f,setF]=useState(empty);const [busy,setBusy]=useState(false)
  const load=useCallback(async()=>{
    const {data}=await supabase.from('profiles').select('*').order('created_at');setUs(data||[])
  },[])
  useEffect(()=>{load()},[load])
  const run=async fn=>{try{await fn();await load()}catch(e){alert(e.message)}}
  const Perms=({v,on,off})=><div className="perms"><label><input type="checkbox" checked disabled/> عرض</label>
    {PERMS.map(([k,l])=><label key={k}><input type="checkbox" disabled={off} checked={!!v['can_'+k]} onChange={e=>on(k,e.target.checked)}/> {l}</label>)}</div>
  async function create(){
    if(!f.email||f.password.length<6){alert('الإيميل وكلمة مرور 6 أحرف على الأقل');return}
    setBusy(true);await run(async()=>{await manage({action:'create',...f});setF(empty)});setBusy(false)
  }
  return <>
    <div className="card"><h2>إنشاء مستخدم جديد</h2>
      <div className="f2"><div><label>الاسم</label><input value={f.name} onChange={e=>setF({...f,name:e.target.value})}/></div>
        <div><label>الإيميل</label><input type="email" value={f.email} onChange={e=>setF({...f,email:e.target.value})}/></div>
        <div><label>كلمة المرور</label><input type="text" value={f.password} onChange={e=>setF({...f,password:e.target.value})}/></div></div>
      <label>الصلاحيات</label><Perms v={f} on={(k,v)=>setF({...f,['can_'+k]:v})}/>
      <div style={{marginTop:10}}><button className="p" onClick={create} disabled={busy}>إنشاء المستخدم</button></div></div>
    {us.map(u=>{const self=u.id===me.id,adm=u.role==='admin';return <div className="card" key={u.id} style={{opacity:u.active?1:.6}}>
      <div className="row" style={{border:0,padding:0}}><div><b>{u.name}</b> <span className="mu">{u.email}</span> <span className={'tag '+(adm?'ok':'nx')}>{adm?'مدير':'موظف'}</span>{!u.active&&<span className="tag late">موقوف</span>}</div></div>
      {adm?<p className="mu">المدير لديه كل الصلاحيات.</p>:<Perms v={u} on={(k,v)=>run(async()=>{const {error}=await supabase.from('profiles').update({['can_'+k]:v}).eq('id',u.id);if(error)throw error})}/>}
      {!self&&!adm&&<div style={{marginTop:8,display:'flex',gap:6,flexWrap:'wrap'}}>
        <button className="sm" onClick={()=>run(async()=>{const {error}=await supabase.from('profiles').update({active:!u.active}).eq('id',u.id);if(error)throw error})}>{u.active?'إيقاف':'تفعيل'}</button>
        <button className="sm" onClick={()=>{const p=prompt('كلمة المرور الجديدة (6 أحرف على الأقل)');if(p)run(()=>manage({action:'password',id:u.id,password:p}))}}>تغيير كلمة المرور</button>
        <button className="sm" style={{color:'var(--rd)'}} onClick={()=>{if(confirm('حذف المستخدم نهائيًا؟'))run(()=>manage({action:'delete',id:u.id}))}}>حذف</button></div>}
    </div>})}</>
}
