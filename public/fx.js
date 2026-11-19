/* لمسات حركية خفيفة — تصميم وتنفيذ: نوال بني عطية
   data-fx="meteors" | "bubbles" على أي حاوية، والصنف .shimmer لأي زر، و FX.confetti() للاحتفال.
   الألوان من --fx1 و --fx2. تتوقّف الحركة تلقائيًا عند تفعيل «تقليل الحركة» في الجهاز. */
(function(){
const RM=matchMedia("(prefers-reduced-motion: reduce)").matches;
const css=`
.shimmer{position:relative;overflow:hidden;isolation:isolate}
.shimmer::after{content:"";position:absolute;inset:-2px;z-index:-1;pointer-events:none;background:linear-gradient(110deg,transparent 35%,rgba(255,255,255,.55) 50%,transparent 65%);background-size:250% 100%;animation:fxsh 2.8s linear infinite}
@keyframes fxsh{from{background-position:150% 0}to{background-position:-100% 0}}
.fx-host{position:relative;overflow:hidden}
.fx-host>*:not(.fx-layer){position:relative;z-index:1}
.fx-layer{position:absolute;inset:0;pointer-events:none;z-index:0;overflow:hidden}
.fx-met{position:absolute;top:-10%;width:2px;height:2px;border-radius:50%;background:var(--fx1,#F3DFA8);box-shadow:0 0 6px 1px var(--fx1,#F3DFA8);transform:rotate(215deg);animation:fxmet linear infinite;opacity:0}
.fx-met::before{content:"";position:absolute;top:50%;width:70px;height:1px;transform:translateY(-50%);background:linear-gradient(90deg,var(--fx1,#F3DFA8),transparent)}
@keyframes fxmet{0%{transform:rotate(215deg) translateX(0);opacity:0}8%{opacity:1}70%{opacity:1}100%{transform:rotate(215deg) translateX(-520px);opacity:0}}
.fx-bub{position:absolute;bottom:-30px;border-radius:50%;background:radial-gradient(circle at 30% 30%,rgba(255,255,255,.7),var(--fx2,rgba(243,223,168,.25)) 60%,transparent 70%);animation:fxbub linear infinite}
@keyframes fxbub{0%{transform:translateY(0) translateX(0);opacity:0}10%{opacity:.9}100%{transform:translateY(-420px) translateX(30px);opacity:0}}
.fx-orbit{position:relative;width:var(--os,128px);height:var(--os,128px);margin:0 auto 8px}
.fx-orbit .ring{position:absolute;inset:0;border:1.5px dashed var(--fx2,rgba(243,223,168,.45));border-radius:50%}
.fx-orbit .ctr{position:absolute;inset:28%;border-radius:50%;display:grid;place-items:center;background:var(--fx1,#B8902A);color:var(--fxc,#5C1622);font-weight:800;box-shadow:0 0 0 6px rgba(255,255,255,.08),0 6px 18px rgba(0,0,0,.25)}
.fx-orbit .rot{position:absolute;inset:0;animation:fxrot 22s linear infinite}
.fx-orbit .it{position:absolute;width:34px;height:34px;margin:-17px;border-radius:50%;background:#fff;display:grid;place-items:center;font-size:18px;box-shadow:0 3px 10px rgba(0,0,0,.25);animation:fxrot 22s linear infinite reverse}
@keyframes fxrot{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.shimmer::after,.fx-orbit .rot,.fx-orbit .it{animation:none}.fx-layer{display:none}}`;
const st=document.createElement("style");st.textContent=css;document.head.append(st);
function layer(h){h.classList.add("fx-host");const l=document.createElement("div");l.className="fx-layer";h.prepend(l);return l}
function meteors(h,n=+h.dataset.n||12){const l=layer(h);for(let i=0;i<n;i++){const m=document.createElement("span");m.className="fx-met";m.style.left=(Math.random()*110)+"%";m.style.animationDelay=(Math.random()*8).toFixed(2)+"s";m.style.animationDuration=(3+Math.random()*5).toFixed(2)+"s";l.append(m)}}
function bubbles(h,n=+h.dataset.n||14){const l=layer(h);for(let i=0;i<n;i++){const b=document.createElement("span");b.className="fx-bub";const s=6+Math.random()*16;b.style.width=b.style.height=s+"px";b.style.left=(Math.random()*100)+"%";b.style.animationDelay=(Math.random()*9).toFixed(2)+"s";b.style.animationDuration=(6+Math.random()*7).toFixed(2)+"s";l.append(b)}}
/* مدار: FX.orbit(عنصر, "النص في الوسط", ["📖","➗",...]) */
function orbit(host,center,items){const o=document.createElement("div");o.className="fx-orbit";o.innerHTML='<div class="ring"></div><div class="ctr"></div><div class="rot"></div>';o.querySelector(".ctr").append(center);
 const r=o.querySelector(".rot");items.forEach((t,i)=>{const a=i/items.length*2*Math.PI;const s=document.createElement("span");s.className="it";s.textContent=t;s.style.left=(50+50*Math.cos(a))+"%";s.style.top=(50+50*Math.sin(a))+"%";r.append(s)});host.prepend(o);return o}
function confetti(opt={}){if(RM)return;const cols=opt.colors||["#7A1F2E","#B8902A","#F3DFA8","#2fb377","#3fa0ff"];
 const c=document.createElement("canvas");Object.assign(c.style,{position:"fixed",inset:"0",width:"100%",height:"100%",pointerEvents:"none",zIndex:9999});document.body.append(c);
 const dpr=Math.min(2,devicePixelRatio||1);c.width=innerWidth*dpr;c.height=innerHeight*dpr;const x=c.getContext("2d");x.scale(dpr,dpr);
 const P=[];for(let i=0;i<(opt.n||140);i++)P.push({x:innerWidth/2+(Math.random()-.5)*80,y:innerHeight*.45,vx:(Math.random()-.5)*14,vy:-6-Math.random()*10,s:5+Math.random()*6,r:Math.random()*6,vr:(Math.random()-.5)*.3,c:cols[i%cols.length],sh:i%3});
 let t0=performance.now();(function f(now){const k=(now-t0)/1000;x.clearRect(0,0,innerWidth,innerHeight);
  P.forEach(p=>{p.vy+=.35;p.vx*=.99;p.x+=p.vx;p.y+=p.vy;p.r+=p.vr;x.save();x.translate(p.x,p.y);x.rotate(p.r);x.globalAlpha=Math.max(0,1-k/3);x.fillStyle=p.c;
   if(p.sh===0)x.fillRect(-p.s/2,-p.s/4,p.s,p.s/2);else if(p.sh===1){x.beginPath();x.arc(0,0,p.s/2.6,0,7);x.fill()}else{x.beginPath();for(let j=0;j<5;j++){const a=j*1.2566-1.57;x.lineTo(Math.cos(a)*p.s/1.6,Math.sin(a)*p.s/1.6);const b=a+.628;x.lineTo(Math.cos(b)*p.s/3.4,Math.sin(b)*p.s/3.4)}x.fill()}x.restore()});
  if(k<3)requestAnimationFrame(f);else c.remove()})(t0)}
window.FX={meteors,bubbles,orbit,confetti};
if(!RM)document.querySelectorAll("[data-fx]").forEach(h=>{const f=FX[h.dataset.fx];if(f)f(h)});
})();
