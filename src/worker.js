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
  db.prepare("CREATE TABLE IF NOT EXISTS student_links(student_id INTEGER,teacher_id INTEGER,enc_name TEXT,sec TEXT,no INTEGER,created INTEGER,PRIMARY KEY(student_id,teacher_id))"),db.prepare("CREATE TABLE IF NOT EXISTS sup_shares(teacher_id INTEGER,sup_id INTEGER,created INTEGER,PRIMARY KEY(teacher_id,sup_id))"),db.prepare("CREATE INDEX IF NOT EXISTS ix_sup ON sup_shares(sup_id)"),db.prepare("CREATE TABLE IF NOT EXISTS tlog(id INTEGER PRIMARY KEY AUTOINCREMENT,teacher_id INTEGER,d TEXT,kind TEXT,note TEXT,created INTEGER)"),db.prepare("CREATE INDEX IF NOT EXISTS ix_tlog ON tlog(teacher_id)"),db.prepare("CREATE TABLE IF NOT EXISTS sup_msgs(id INTEGER PRIMARY KEY AUTOINCREMENT,sup_id INTEGER,to_id INTEGER,title TEXT,body TEXT,fname TEXT,ftype TEXT,fdata TEXT,created INTEGER)"),db.prepare("CREATE INDEX IF NOT EXISTS ix_msg ON sup_msgs(sup_id)"),db.prepare("CREATE INDEX IF NOT EXISTS ix_lnk ON student_links(teacher_id)"),db.prepare("CREATE INDEX IF NOT EXISTS ix_att ON attempts(student_id,ts)"),db.prepare("CREATE INDEX IF NOT EXISTS ix_stu ON students(teacher_id)")]);
 try{await db.prepare("ALTER TABLE teachers ADD COLUMN subject TEXT").run()}catch(e){}
 try{await db.prepare("ALTER TABLE student_links ADD COLUMN src TEXT").run()}catch(e){}
 for(const c of ["fname","ftype","fdata"]){try{await db.prepare("ALTER TABLE tlog ADD COLUMN "+c+" TEXT").run()}catch(e){}}
 ready=true}
async function hmac(secret,data){const k=await crypto.subtle.importKey("raw",te.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);return b64(await crypto.subtle.sign("HMAC",k,te.encode(data)))}
async function mint(env,t,id,days){const p=b64(te.encode(JSON.stringify({t,id,exp:Date.now()+days*864e5})));return p+"."+await hmac(env.SESSION_SECRET,p)}
async function check(env,req,t){const a=(req.headers.get("authorization")||"").replace(/^Bearer /,"");const [p,s]=a.split(".");if(!p||!s)return null;
 if(await hmac(env.SESSION_SECRET,p)!==s)return null;try{const o=JSON.parse(new TextDecoder().decode(unb(p)));return o.t===t&&o.exp>Date.now()?o.id:null}catch(e){return null}}
async function pw(password,salt){const k=await crypto.subtle.importKey("raw",te.encode(password),"PBKDF2",false,["deriveBits"]);return b64(await crypto.subtle.deriveBits({name:"PBKDF2",salt:unb(salt),iterations:100000,hash:"SHA-256"},k,256))}
const ALPHA="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const mkcode=()=>{const r=crypto.getRandomValues(new Uint32Array(1))[0];return String(100000+r%900000)};
const eq=(a,b)=>{if(a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0};
const SUBJ=v=>v==="math"||v==="sci"?v:null;
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
  const un=clip(body.username,40).trim().toLowerCase(),sc=clip(body.school,80),ps=String(body.password||""),sj=SUBJ(body.subject);
  if(un.length<3||ps.length<6)return err("اسم المستخدم أو كلمة السر قصيرة");
  const salt=b64(crypto.getRandomValues(new Uint8Array(16)));
  try{const r=await db.prepare("INSERT INTO teachers(username,school,salt,hash,created,subject) VALUES(?,?,?,?,?,?)").bind(un,sc,salt,await pw(ps,salt),Date.now(),sj).run();
   return json({token:await mint(env,"T",r.meta.last_row_id,30),school:sc,subject:sj})}catch(e){return err("اسم المستخدم مستخدم",409)}}
 if(p==="/api/teacher/reset"&&m==="POST"){
  if(!eq(String(body.invite||""),env.TEACHER_INVITE))return err("رمز الدعوة غير صحيح",403);
  const un=clip(body.username,40).trim().toLowerCase(),ps=String(body.password||"");
  if(ps.length<6)return err("كلمة السر قصيرة (6 أحرف على الأقل)");
  const r=await db.prepare("SELECT id,school,subject FROM teachers WHERE username=?").bind(un).first();
  if(!r)return err("اسم المستخدم غير موجود",404);
  const salt=b64(crypto.getRandomValues(new Uint8Array(16)));
  await db.prepare("UPDATE teachers SET salt=?,hash=? WHERE id=?").bind(salt,await pw(ps,salt),r.id).run();
  return json({token:await mint(env,"T",r.id,30),school:r.school,subject:r.subject||""})}
 if(p==="/api/teacher/login"&&m==="POST"){
  const r=await db.prepare("SELECT * FROM teachers WHERE username=?").bind(clip(body.username,40).trim().toLowerCase()).first();
  if(!r||!eq(await pw(String(body.password||""),r.salt),r.hash))return err("بيانات الدخول غير صحيحة",401);
  return json({token:await mint(env,"T",r.id,30),school:r.school,subject:r.subject||""})}
 if(p==="/api/teacher/subject"&&m==="POST"){
  const t=await check(env,req,"T");if(!t)return err("غير مصرّح",401);
  await db.prepare("UPDATE teachers SET subject=? WHERE id=?").bind(SUBJ(body.subject),t).run();return json({ok:1})}
 if(p==="/api/students"||p.startsWith("/api/students/")){
  const tid=await check(env,req,"T");if(!tid)return err("غير مصرّح",401);
  if(p==="/api/students"&&m==="GET"){
   const me=await db.prepare("SELECT subject,school FROM teachers WHERE id=?").bind(tid).first();const sj=me&&me.subject||null;
   const own=(await db.prepare("SELECT id,code,enc_name,sec,no,0 AS linked FROM students WHERE teacher_id=?").bind(tid).all()).results;
   const lk=(await db.prepare("SELECT s.id AS id,s.code AS code,l.enc_name AS enc_name,l.sec AS sec,l.no AS no,l.src AS src,1 AS linked FROM student_links l JOIN students s ON s.id=l.student_id WHERE l.teacher_id=?").bind(tid).all()).results;
   const st=own.concat(lk).sort((a,b)=>String(a.sec).localeCompare(String(b.sec),"ar")||a.no-b.no);
   const at=(await db.prepare("SELECT a.student_id,a.ts,a.title,a.mode,a.subject,a.right,a.total,a.d FROM attempts a JOIN students s ON s.id=a.student_id WHERE (s.teacher_id=?1 OR s.id IN (SELECT student_id FROM student_links WHERE teacher_id=?1)) AND (?2 IS NULL OR a.subject=?2) ORDER BY a.ts DESC LIMIT 4000").bind(tid,sj).all()).results;
   return json({students:st,attempts:at,subject:sj||"",school:me&&me.school||""})}
  if(p==="/api/students"&&m==="POST"){
   const arr=Array.isArray(body.students)?body.students.slice(0,80):[];const out=[];
   for(const s of arr){let code,ok=false;for(let i=0;i<5&&!ok;i++){code=mkcode();try{await db.prepare("INSERT INTO students(teacher_id,code,enc_name,sec,no,created) VALUES(?,?,?,?,?,?)").bind(tid,code,clip(s.encName,500),clip(s.sec,10),parseInt(s.no)||0,Date.now()).run();ok=true}catch(e){}}
    if(ok)out.push({code,sec:clip(s.sec,10),no:parseInt(s.no)||0})}
   return json({created:out})}
  if(p==="/api/students/share"&&m==="POST"){
   const un=clip(body.username,40).trim().toLowerCase(),sec=clip(body.sec,10).trim();
   const to=await db.prepare("SELECT id FROM teachers WHERE username=?").bind(un).first();
   if(!to)return err("لا يوجد معلم بهذا الاسم",404);if(to.id===tid)return err("هذا حسابك",400);
   const me=await db.prepare("SELECT username FROM teachers WHERE id=?").bind(tid).first();
   const rows=(await db.prepare("SELECT id,enc_name,sec,no FROM students WHERE teacher_id=? AND sec=?").bind(tid,sec).all()).results;
   if(!rows.length)return err("لا توجد شعبة بهذا الاسم في قائمتك",404);
   await db.batch(rows.map(r=>db.prepare("INSERT OR IGNORE INTO student_links(student_id,teacher_id,enc_name,sec,no,created,src) VALUES(?,?,?,?,?,?,?)").bind(r.id,to.id,r.enc_name,r.sec,r.no,Date.now(),me.username)));
   return json({shared:rows.length})}
  if(p==="/api/students/link"&&m==="POST"){
   const r=await db.prepare("SELECT id,teacher_id FROM students WHERE code=?").bind(clip(body.code,12).trim().toUpperCase()).first();
   if(!r)return err("الرمز غير صحيح",404);if(r.teacher_id===tid)return err("هذه الطالبة في قائمتك أصلًا",409);
   await db.prepare("INSERT OR REPLACE INTO student_links(student_id,teacher_id,enc_name,sec,no,created) VALUES(?,?,?,?,?,?)").bind(r.id,tid,clip(body.encName,500),clip(body.sec,10),parseInt(body.no)||0,Date.now()).run();
   return json({ok:1})}
  if(m==="DELETE"){const id=parseInt(p.split("/").pop());
   const own=await db.prepare("SELECT id FROM students WHERE id=? AND teacher_id=?").bind(id,tid).first();
   if(!own){await db.prepare("DELETE FROM student_links WHERE student_id=? AND teacher_id=?").bind(id,tid).run();return json({ok:1})}
   await db.prepare("DELETE FROM student_links WHERE student_id=?").bind(id).run();
   await db.prepare("DELETE FROM attempts WHERE student_id IN (SELECT id FROM students WHERE id=? AND teacher_id=?)").bind(id,tid).run();
   await db.prepare("DELETE FROM students WHERE id=? AND teacher_id=?").bind(id,tid).run();return json({ok:1})}}
 // ---- ملف الإنجاز والتوثيق: سجل إجراءات المعلم/ة (نص فقط)
 if(p.startsWith("/api/portfolio")){
  const tid=await check(env,req,"T");if(!tid)return err("غير مصرّح",401);
  if(p==="/api/portfolio"&&m==="GET")return json({log:(await db.prepare("SELECT id,d,kind,note,fname,ftype FROM tlog WHERE teacher_id=? ORDER BY d DESC,id DESC LIMIT 400").bind(tid).all()).results});
  if(p==="/api/portfolio"&&m==="POST"){
   const d=clip(body.date,10),kind=clip(body.kind,80).trim(),note=clip(body.note,600).trim();
   if(!/^\d{4}-\d{2}-\d{2}$/.test(d)||!kind||!note)return err("اكتب/ي التاريخ والنوع والوصف");
   const c=await db.prepare("SELECT COUNT(*) AS n FROM tlog WHERE teacher_id=?").bind(tid).first();if(c.n>=400)return err("وصل السجل الحد الأقصى (400 بند)");
   let fname=null,ftype=null,fdata=null;
   if(body.fdata){ftype=String(body.ftype||"");if(!["application/pdf","image/jpeg","image/png"].includes(ftype))return err("المرفق يجب أن يكون PDF أو صورة");
    fdata=String(body.fdata);if(fdata.length>1400000||!/^[A-Za-z0-9+/=]+$/.test(fdata))return err("حجم المرفق أكبر من 1 ميغابايت");fname=clip(body.fname,120)||"مرفق";
    const f=await db.prepare("SELECT COUNT(*) AS n FROM tlog WHERE teacher_id=? AND fdata IS NOT NULL").bind(tid).first();if(f.n>=40)return err("وصلت الحد الأقصى للمرفقات (40). احذف/ي مرفقًا قديمًا أولًا.")}
   await db.prepare("INSERT INTO tlog(teacher_id,d,kind,note,created,fname,ftype,fdata) VALUES(?,?,?,?,?,?,?,?)").bind(tid,d,kind,note,Date.now(),fname,ftype,fdata).run();return json({ok:1})}
  if(p==="/api/portfolio/file"&&m==="POST"){const r=await db.prepare("SELECT fname,ftype,fdata FROM tlog WHERE id=? AND teacher_id=? AND fdata IS NOT NULL").bind(parseInt(body.id)||0,tid).first();return r?json(r):err("غير موجود",404)}
  if(p==="/api/portfolio/delete"&&m==="POST"){await db.prepare("DELETE FROM tlog WHERE id=? AND teacher_id=?").bind(parseInt(body.id)||0,tid).run();return json({ok:1})}
  return err("غير موجود",404)}
 // ---- المشرف: تقرير شهري بالأرقام فقط (بلا أسماء ولا رموز)
 if(p.startsWith("/api/supervisor/")){
  const tid=await check(env,req,"T");if(!tid)return err("غير مصرّح",401);
  if(p==="/api/supervisor/share"&&m==="POST"){
   const to=await db.prepare("SELECT id FROM teachers WHERE username=?").bind(clip(body.username,40).trim().toLowerCase()).first();
   if(!to)return err("لا يوجد حساب بهذا الاسم",404);if(to.id===tid)return err("هذا حسابك",400);
   await db.prepare("INSERT OR IGNORE INTO sup_shares(teacher_id,sup_id,created) VALUES(?,?,?)").bind(tid,to.id,Date.now()).run();return json({ok:1})}
  if(p==="/api/supervisor/unshare"&&m==="POST"){
   await db.prepare("DELETE FROM sup_shares WHERE teacher_id=? AND sup_id IN (SELECT id FROM teachers WHERE username=?)").bind(tid,clip(body.username,40).trim().toLowerCase()).run();return json({ok:1})}
  if(p==="/api/supervisor/shares"&&m==="GET"){
   return json({to:(await db.prepare("SELECT t.username AS username FROM sup_shares x JOIN teachers t ON t.id=x.sup_id WHERE x.teacher_id=?").bind(tid).all()).results.map(r=>r.username)})}
  if(p==="/api/supervisor/report"&&m==="GET"){
   const ts=(await db.prepare("SELECT t.id AS id,t.username AS username,t.school AS school,t.subject AS subject FROM sup_shares x JOIN teachers t ON t.id=x.teacher_id WHERE x.sup_id=? LIMIT 60").bind(tid).all()).results;
   const since=Date.now()-100*864e5,mk=t=>new Date(t+3*36e5).toISOString().slice(0,7),out=[];
   for(const t of ts){const sj=t.subject||null;
    const st=(await db.prepare("SELECT id,sec FROM students WHERE teacher_id=?1 UNION SELECT student_id AS id,sec FROM student_links WHERE teacher_id=?1").bind(t.id).all()).results;
    const at=(await db.prepare("SELECT a.student_id AS sid,a.ts AS ts,a.right AS r,a.total AS t,a.d AS d FROM attempts a JOIN students s ON s.id=a.student_id WHERE (s.teacher_id=?1 OR s.id IN (SELECT student_id FROM student_links WHERE teacher_id=?1)) AND (?2 IS NULL OR a.subject=?2) AND a.ts>?3 ORDER BY a.ts DESC LIMIT 6000").bind(t.id,sj,since).all()).results;
    const sec={},of={};st.forEach(x=>{of[x.id]=x.sec;(sec[x.sec]=sec[x.sec]||{sec:x.sec,n:0,months:{}}).n++});
    at.forEach(a=>{const S=sec[of[a.sid]];if(!S)return;const k=mk(a.ts),M=S.months[k]=S.months[k]||{ids:{},att:0,right:0,total:0,dom:{}};
     M.ids[a.sid]=1;M.att++;M.right+=a.r;M.total+=a.t;let d=[];try{d=JSON.parse(a.d)}catch(e){}
     d.forEach(x=>{const q=x[0]+"_"+x[1],g=M.dom[q]=M.dom[q]||[0,0];g[0]+=x[2];g[1]+=x[3]})});
    Object.values(sec).forEach(S=>Object.values(S.months).forEach(M=>{M.active=Object.keys(M.ids).length;delete M.ids}));
    out.push({username:t.username,school:t.school||"",subject:t.subject||"",sections:Object.values(sec)})}
   return json({teachers:out})}
  // كتب رسمية وملاحظات من المشرف/ة إلى من شاركوه تقاريرهم
  if(p==="/api/supervisor/msg"&&m==="POST"){
   const title=clip(body.title,120).trim(),text=clip(body.body,4000).trim();if(!title)return err("اكتب/ي عنوان الكتاب أو الملاحظة");
   let to=null;const un=clip(body.to,40).trim().toLowerCase();
   if(un){const r=await db.prepare("SELECT t.id AS id FROM sup_shares x JOIN teachers t ON t.id=x.teacher_id WHERE x.sup_id=? AND t.username=?").bind(tid,un).first();if(!r)return err("هذا الحساب لم يشارك تقريره معك",404);to=r.id}
   else{const c=await db.prepare("SELECT COUNT(*) AS n FROM sup_shares WHERE sup_id=?").bind(tid).first();if(!c.n)return err("لم يشارك أحد تقريره معك بعد",400)}
   let fname=null,ftype=null,fdata=null;
   if(body.fdata){ftype=String(body.ftype||"");if(!["application/pdf","image/jpeg","image/png"].includes(ftype))return err("المرفق يجب أن يكون PDF أو صورة");
    fdata=String(body.fdata);if(fdata.length>1400000||!/^[A-Za-z0-9+/=]+$/.test(fdata))return err("حجم المرفق أكبر من 1 ميغابايت");fname=clip(body.fname,120)||"مرفق"}
   const c=await db.prepare("SELECT COUNT(*) AS n FROM sup_msgs WHERE sup_id=?").bind(tid).first();if(c.n>=300)return err("وصلت الحد الأقصى للرسائل. احذف/ي القديم منها.");
   await db.prepare("INSERT INTO sup_msgs(sup_id,to_id,title,body,fname,ftype,fdata,created) VALUES(?,?,?,?,?,?,?,?)").bind(tid,to,title,text,fname,ftype,fdata,Date.now()).run();return json({ok:1})}
  if(p==="/api/supervisor/msgs"&&m==="GET"){
   const inbox=(await db.prepare("SELECT g.id AS id,t.username AS sender,g.title AS title,g.body AS body,g.fname AS fname,g.created AS ts FROM sup_msgs g JOIN teachers t ON t.id=g.sup_id WHERE g.sup_id IN (SELECT sup_id FROM sup_shares WHERE teacher_id=?1) AND (g.to_id IS NULL OR g.to_id=?1) ORDER BY g.created DESC LIMIT 100").bind(tid).all()).results;
   const sent=(await db.prepare("SELECT g.id AS id,t.username AS recipient,g.title AS title,g.body AS body,g.fname AS fname,g.created AS ts FROM sup_msgs g LEFT JOIN teachers t ON t.id=g.to_id WHERE g.sup_id=? ORDER BY g.created DESC LIMIT 100").bind(tid).all()).results;
   return json({inbox,sent})}
  if(p==="/api/supervisor/file"&&m==="POST"){
   const r=await db.prepare("SELECT fname,ftype,fdata FROM sup_msgs WHERE id=?1 AND fdata IS NOT NULL AND (sup_id=?2 OR ((to_id IS NULL OR to_id=?2) AND sup_id IN (SELECT sup_id FROM sup_shares WHERE teacher_id=?2)))").bind(parseInt(body.id)||0,tid).first();
   return r?json(r):err("غير موجود",404)}
  if(p==="/api/supervisor/msg/delete"&&m==="POST"){
   await db.prepare("DELETE FROM sup_msgs WHERE id=? AND sup_id=?").bind(parseInt(body.id)||0,tid).run();return json({ok:1})}
  return err("غير موجود",404)}
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
