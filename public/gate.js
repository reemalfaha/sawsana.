/* بوابة كلمة سر لصفحات المعلمين. تنبيه: هي حاجز على مستوى المتصفح وليست حماية خوادم؛ بيانات الطلبة أنفسهم مشفّرة بكلمة سر القائمة. */
(function(){
const H=window.SW_TEACHER_HASH||"",SK="sawsana.t.ok";
const sha=async s=>[...new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s)))].map(b=>b.toString(16).padStart(2,"0")).join("");
let ok=false;try{ok=H&&sessionStorage.getItem(SK)===H}catch(e){}
if(ok)return;
const o=document.createElement("div");
o.style.cssText="position:fixed;inset:0;z-index:99999;background:#FBF8FC;display:flex;align-items:center;justify-content:center;padding:16px;font-family:'Noto Naskh Arabic','Segoe UI',Tahoma,sans-serif;direction:rtl";
const box=document.createElement("div");box.style.cssText="background:#fff;border:1px solid #E2D6E8;border-radius:18px;padding:22px;max-width:420px;width:100%;line-height:1.9;color:#241528";
const mk=(t,x,st)=>{const e=document.createElement(t);if(x)e.textContent=x;if(st)e.style.cssText=st;return e};
const inp=ph=>{const i=mk("input",null,"width:100%;padding:12px;border:1px solid #E2D6E8;border-radius:10px;font:inherit;margin:6px 0");i.type="password";i.placeholder=ph;return i};
const btn=(t,f,alt)=>{const b=mk("button",t,"font:inherit;font-weight:600;border:0;border-radius:12px;padding:11px 20px;margin:6px 6px 0 0;cursor:pointer;background:"+(alt?"#F3EAF6":"#3E1B47")+";color:"+(alt?"#3E1B47":"#fff"));b.onclick=f;return b};
const msg=mk("p",null,"color:#B3261E;margin:6px 0");
box.append(mk("h2","🔒 صفحة المعلمين","margin:0 0 6px;color:#3E1B47"));
if(H){
 box.append(mk("p","أدخل كلمة السر للمتابعة.","margin:0"));const p=inp("كلمة السر");
 const go=async()=>{if(await sha(p.value)===H){try{sessionStorage.setItem(SK,H)}catch(e){}o.remove()}else{msg.textContent="كلمة السر غير صحيحة.";p.value=""}};
 p.addEventListener("keydown",e=>{if(e.key==="Enter")go()});
 box.append(p,btn("دخول",go),btn("← للطلبة",()=>location.href="index.html",true),msg);
}else{
 box.append(mk("p","لم تُحدَّد كلمة سر للمعلمين بعد. اكتب الكلمة التي تريدها، وسيظهر لك رمز (بصمة) ترسله للمنفّذ ليُضاف للمنصة. الكلمة نفسها لا تُرسَل.","margin:0"));
 const p=inp("كلمة السر الجديدة (6 أحرف على الأقل)"),out=mk("textarea",null,"width:100%;min-height:70px;direction:ltr;font:12px monospace;margin-top:8px");out.readOnly=true;out.hidden=true;
 box.append(p,btn("إنشاء البصمة",async()=>{if(p.value.length<6){msg.textContent="الكلمة قصيرة.";return}msg.textContent="";out.value=await sha(p.value);out.hidden=false;out.select()}),out,
  btn("متابعة مؤقتًا بدون كلمة سر",()=>o.remove(),true),btn("← للطلبة",()=>location.href="index.html",true),msg);
}
o.append(box);(document.body||document.documentElement).append(o);
})();
