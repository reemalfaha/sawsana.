/* واجهة الحسابات (اختيارية) للسوسنة: Cloudflare Worker + D1.
   إن لم تتوفر قاعدة البيانات أو الأسرار تُعيد الواجهة 503 ويبقى الموقع الثابت يعمل كما هو.
   الأسرار المطلوبة: SESSION_SECRET (نص عشوائي طويل)، TEACHER_INVITE (رمز دعوة للمعلمات). والربط: DB (قاعدة D1).
   أسماء الطالبات تصل مشفّرة من متصفح المعلمة؛ الخادم لا يرى إلا نصًا مشفّرًا. */
const te=new TextEncoder();
const b64=u=>btoa(String.fromCharCode(...new Uint8Array(u))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
const unb=s=>Uint8Array.from(atob(s.replace(/-/g,"+").replace(/_/g,"/")),c=>c.charCodeAt(0));
const json=(o,st=200)=>new Response(JSON.stringify(o),{status:st,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
const err=(m,st=400)=>json({error:m},st);
let ready=false;
async function schema(db){if(ready)return;
 await db.batch([
  db.prepare("CREATE TABLE IF NOT EXISTS teachers(id INTEGER PRIMARY KEY AUTOINCREMENT,username TEXT UNIQUE,school TEXT,salt TEXT,hash TEXT,created INTEGER)"),
  db.prepare("CREATE TABLE IF NOT EXISTS students(id INTEGER PRIMARY KEY AUTOINCREMENT,teacher_id INTEGER,code TEXT UNIQUE,enc_name TEXT,sec TEXT,no INTEGER,created INTEGER)"),
  db.prepare("CREATE TABLE IF NOT EXISTS attempts(id INTEGER PRIMARY KEY AUTOINCREMENT,student_id INTEGER,ts INTEGER,title TEXT,mode TEXT,subject TEXT,right INTEGER,total INTEGER,d TEXT)"),
  db.prepare("CREATE INDEX IF NOT EXISTS ix_att ON attempts(student_id,ts)"),db.prepare("CREATE INDEX IF NOT EXISTS ix_stu ON students(teacher_id)")]);
 ready=true}
async function hmac(secret,data){const k=await crypto.subtle.importKey("raw",te.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);return b64(await crypto.subtle.sign("HMAC",k,te.encode(data)))}
async function mint(env,t,id,days){const p=b64(te.encode(JSON.stringify({t,id,exp:Date.now()+days*864e5})));return p+"."+await hmac(env.SESSION_SECRET,p)}
async function check(env,req,t){const a=(req.headers.get("authorization")||"").replace(/^Bearer /,"");const [p,s]=a.split(".");if(!p||!s)return null;
 if(await hmac(env.SESSION_SECRET,p)!==s)return null;try{const o=JSON.parse(new TextDecoder().decode(unb(p)));return o.t===t&&o.exp>Date.now()?o.id:null}catch(e){return null}}
async function pw(password,salt){const k=await crypto.subtle.importKey("raw",te.encode(password),"PBKDF2",false,["deriveBits"]);return b64(await crypto.subtle.deriveBits({name:"PBKDF2",salt:unb(salt),iterations:100000,hash:"SHA-256"},k,256))}
const ALPHA="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const mkcode=()=>{const r=crypto.getRandomValues(new Uint32Array(1))[0];return String(100000+r%900000)};
const eq=(a,b)=>{if(a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0};
const clip=(s,n)=>String(s==null?"":s).slice(0,n);
export default{async fetch(req,env){
 const u=new URL(req.url);
 if(!u.pathname.startsWith("/api/"))return env.ASSETS.fetch(req);
 if(!env.DB||!env.SESSION_SECRET||!env.TEACHER_INVITE)return err("الحسابات غير مفعّلة بعد",503);
 try{await schema(env.DB)}catch(e){return err("تعذّر تجهيز قاعدة البيانات",503)}
 const db=env.DB,m=req.method,p=u.pathname;let body={};
 if(m==="POST"){try{body=await req.json()}catch(e){return err("طلب غير صالح")}}
 // ---- المعلمات
 if(p==="/api/teacher/register"&&m==="POST"){
  if(!eq(String(body.invite||""),env.TEACHER_INVITE))return err("رمز الدعوة غير صحيح",403);
  const un=clip(body.username,40).trim().toLowerCase(),sc=clip(body.school,80),ps=String(body.password||"");
  if(un.length<3||ps.length<6)return err("اسم المستخدم أو كلمة السر قصيرة");
  const salt=b64(crypto.getRandomValues(new Uint8Array(16)));
  try{const r=await db.prepare("INSERT INTO teachers(username,school,salt,hash,created) VALUES(?,?,?,?,?)").bind(un,sc,salt,await pw(ps,salt),Date.now()).run();
   return json({token:await mint(env,"T",r.meta.last_row_id,30),school:sc})}catch(e){return err("اسم المستخدم مستخدم",409)}}
 if(p==="/api/teacher/reset"&&m==="POST"){
  if(!eq(String(body.invite||""),env.TEACHER_INVITE))return err("رمز الدعوة غير صحيح",403);
  const un=clip(body.username,40).trim().toLowerCase(),ps=String(body.password||"");
  if(ps.length<6)return err("كلمة السر قصيرة (6 أحرف على الأقل)");
  const r=await db.prepare("SELECT id,school FROM teachers WHERE username=?").bind(un).first();
  if(!r)return err("اسم المستخدم غير موجود",404);
  const salt=b64(crypto.getRandomValues(new Uint8Array(16)));
  await db.prepare("UPDATE teachers SET salt=?,hash=? WHERE id=?").bind(salt,await pw(ps,salt),r.id).run();
  return json({token:await mint(env,"T",r.id,30),school:r.school})}
 if(p==="/api/teacher/login"&&m==="POST"){
  const r=await db.prepare("SELECT * FROM teachers WHERE username=?").bind(clip(body.username,40).trim().toLowerCase()).first();
  if(!r||!eq(await pw(String(body.password||""),r.salt),r.hash))return err("بيانات الدخول غير صحيحة",401);
  return json({token:await mint(env,"T",r.id,30),school:r.school})}
 if(p==="/api/students"||p.startsWith("/api/students/")){
  const tid=await check(env,req,"T");if(!tid)return err("غير مصرّح",401);
  if(p==="/api/students"&&m==="GET"){
   const st=(await db.prepare("SELECT id,code,enc_name,sec,no FROM students WHERE teacher_id=? ORDER BY sec,no").bind(tid).all()).results;
   const at=(await db.prepare("SELECT a.student_id,a.ts,a.title,a.mode,a.subject,a.right,a.total,a.d FROM attempts a JOIN students s ON s.id=a.student_id WHERE s.teacher_id=? ORDER BY a.ts DESC LIMIT 4000").bind(tid).all()).results;
   return json({students:st,attempts:at})}
  if(p==="/api/students"&&m==="POST"){
   const arr=Array.isArray(body.students)?body.students.slice(0,80):[];const out=[];
   for(const s of arr){let code,ok=false;for(let i=0;i<5&&!ok;i++){code=mkcode();try{await db.prepare("INSERT INTO students(teacher_id,code,enc_name,sec,no,created) VALUES(?,?,?,?,?,?)").bind(tid,code,clip(s.encName,500),clip(s.sec,10),parseInt(s.no)||0,Date.now()).run();ok=true}catch(e){}}
    if(ok)out.push({code,sec:clip(s.sec,10),no:parseInt(s.no)||0})}
   return json({created:out})}
  if(m==="DELETE"){const id=parseInt(p.split("/").pop());
   await db.prepare("DELETE FROM attempts WHERE student_id IN (SELECT id FROM students WHERE id=? AND teacher_id=?)").bind(id,tid).run();
   await db.prepare("DELETE FROM students WHERE id=? AND teacher_id=?").bind(id,tid).run();return json({ok:1})}}
 // ---- الطالبات
 if(p==="/api/student/login"&&m==="POST"){
  const r=await db.prepare("SELECT id,sec,no FROM students WHERE code=?").bind(clip(body.code,12).trim().toUpperCase()).first();
  if(!r)return err("الرمز غير صحيح",401);return json({token:await mint(env,"S",r.id,365),sec:r.sec,no:r.no})}
 if(p==="/api/attempt"&&m==="POST"){
  const sid=await check(env,req,"S");if(!sid)return err("غير مصرّح",401);
  const d=Array.isArray(body.d)?body.d.slice(0,40).map(x=>[x[0]|0,x[1]|0,x[2]|0,x[3]|0]):[];
  await db.prepare("INSERT INTO attempts(student_id,ts,title,mode,subject,right,total,d) VALUES(?,?,?,?,?,?,?,?)").bind(sid,Date.now(),clip(body.title,80),clip(body.mode,12),clip(body.subject,12),body.right|0,body.total|0,JSON.stringify(d)).run();
  return json({ok:1})}
 return err("غير موجود",404)}};
