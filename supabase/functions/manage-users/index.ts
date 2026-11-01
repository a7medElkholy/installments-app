// Edge Function: إنشاء/حذف المستخدمين وتغيير كلمات المرور (للمدير فقط)
import {createClient} from 'npm:@supabase/supabase-js@2'
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type'}
const json=(o:unknown,s=200)=>new Response(JSON.stringify(o),{status:s,headers:{...cors,'Content-Type':'application/json'}})
Deno.serve(async req=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors})
  try{
    const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const token=(req.headers.get('Authorization')||'').replace('Bearer ','')
    const {data:{user}}=await admin.auth.getUser(token)
    if(!user)return json({error:'غير مصرح'},401)
    const {data:me}=await admin.from('profiles').select('role,active').eq('id',user.id).maybeSingle()
    if(!me||me.role!=='admin'||!me.active)return json({error:'هذه العملية للمدير فقط'},403)
    const b=await req.json()
    if(b.action==='create'){
      if(!b.email||!b.password||b.password.length<6)return json({error:'الإيميل وكلمة مرور 6 أحرف على الأقل'},400)
      const {data,error}=await admin.auth.admin.createUser({email:b.email,password:b.password,email_confirm:true})
      if(error)return json({error:error.message},400)
      const {error:e2}=await admin.from('profiles').update({name:b.name||b.email,role:'staff',can_add:!!b.can_add,can_edit:!!b.can_edit,can_pay:!!b.can_pay,can_delete:!!b.can_delete,can_print:!!b.can_print}).eq('id',data.user.id)
      if(e2)return json({error:e2.message},400)
      return json({ok:true})
    }
    if(b.action==='password'){
      if(!b.password||b.password.length<6)return json({error:'كلمة المرور 6 أحرف على الأقل'},400)
      const {error}=await admin.auth.admin.updateUserById(b.id,{password:b.password})
      if(error)return json({error:error.message},400)
      return json({ok:true})
    }
    if(b.action==='delete'){
      if(b.id===user.id)return json({error:'لا يمكنك حذف حسابك'},400)
      const {error}=await admin.auth.admin.deleteUser(b.id)
      if(error)return json({error:error.message},400)
      return json({ok:true})
    }
    return json({error:'عملية غير معروفة'},400)
  }catch(e){return json({error:String(e)},500)}
})
