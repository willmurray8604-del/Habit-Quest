import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect,
  getRedirectResult, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCDKbVG2J-IRNOsT7XKeRMMStaDGM1HZRc",
  authDomain: "habit-quest-31489.firebaseapp.com",
  projectId: "habit-quest-31489",
  storageBucket: "habit-quest-31489.firebasestorage.app",
  messagingSenderId: "725666329057",
  appId: "1:725666329057:web:3150244e6265c96c0c22a0"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

const STORAGE_KEY = "habitQuest.v1";
const defaultState = {
  habits: [
    { id: crypto.randomUUID(), name: "Workout or intentional movement", points: 20, type: "good" },
    { id: crypto.randomUUID(), name: "Study focused for 45 minutes", points: 15, type: "good" },
    { id: crypto.randomUUID(), name: "Night routine completed", points: 10, type: "good" },
    { id: crypto.randomUUID(), name: "Doomscrolling over 30 minutes", points: 10, type: "bad" },
    { id: crypto.randomUUID(), name: "Skipped a planned responsibility", points: 15, type: "bad" }
  ],
  logs: {},
  snapshots: {},
  preferences: { range: "week", chartType: "bar" },
  createdAt: Date.now()
};

let state = loadLocal();
let user = null;
let unsub = null;
let saveTimer = null;
let ignoreRemote = false;
let calendarCursor = new Date();

const $ = s => document.querySelector(s);
const els = {
  authScreen: $("#authScreen"), app: $("#app"), authStatus: $("#authStatus"),
  todayGrade: $("#todayGrade"), letterGrade: $("#letterGrade"), gradeProgress: $("#gradeProgress"),
  todayScore: $("#todayScore"), pointsPossible: $("#pointsPossible"), streakCount: $("#streakCount"),
  goodList: $("#goodList"), badList: $("#badList"), barChart: $("#barChart"), lineChart: $("#lineChart"),
  chartTitle: $("#chartTitle"), rangeAverage: $("#rangeAverage"), syncBadge: $("#syncBadge"),
  habitDialog: $("#habitDialog"), habitForm: $("#habitForm"), habitType: $("#habitType"),
  habitId: $("#habitId"), habitName: $("#habitName"), habitPoints: $("#habitPoints"),
  dialogTitle: $("#dialogTitle"), deleteHabitBtn: $("#deleteHabitBtn"), manageDialog: $("#manageDialog"),
  manageList: $("#manageList"), signedInAs: $("#signedInAs"), calendarMonth: $("#calendarMonth"),
  calendarGrid: $("#calendarGrid"), dayDetail: $("#dayDetail")
};

function loadLocal(){
  try{
    const saved=JSON.parse(localStorage.getItem(STORAGE_KEY));
    if(saved?.habits&&saved?.logs){
      saved.snapshots ||= {};
      saved.preferences ||= {range:"week",chartType:"bar"};
      return saved;
    }
  }catch{}
  return structuredClone(defaultState);
}
function saveLocal(){
  localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
}
function dateKey(date=new Date()){return date.toLocaleDateString("en-CA")}
function atNoon(date=new Date()){const d=new Date(date);d.setHours(12,0,0,0);return d}
function currentPossible(){return state.habits.filter(h=>h.type==="good").reduce((s,h)=>s+h.points,0)}
function rawScore(key){
  const log=state.logs[key]||{};
  return state.habits.reduce((s,h)=>log[h.id]?s+(h.type==="good"?h.points:-h.points):s,0);
}
function metrics(key){
  if(key===dateKey()) syncSnapshot(key);
  if(state.snapshots[key]) return state.snapshots[key];
  if(state.logs[key]){
    const possible=currentPossible(),raw=rawScore(key);
    return {raw,possible,grade:possible?Math.max(0,Math.min(100,Math.round(raw/possible*100))):0};
  }
  return {raw:0,possible:0,grade:0};
}
function syncSnapshot(key=dateKey()){
  const possible=currentPossible(),raw=rawScore(key);
  state.snapshots[key]={raw,possible,grade:possible?Math.max(0,Math.min(100,Math.round(raw/possible*100))):0};
}
function queueSave(){
  saveLocal();
  els.syncBadge.textContent="● Saving";
  els.syncBadge.style.color="#ffd60a";
  clearTimeout(saveTimer);
  saveTimer=setTimeout(saveCloud,350);
}
async function saveCloud(){
  if(!user)return;
  try{
    await setDoc(doc(db,"users",user.uid,"data","state"),{
      ...state, updatedAt:serverTimestamp()
    });
    els.syncBadge.textContent="● Synced";
    els.syncBadge.style.color="#7ff29b";
  }catch(e){
    console.error(e);
    els.syncBadge.textContent="● Offline";
    els.syncBadge.style.color="#ff6b72";
  }
}
async function hydrateFromCloud(){
  if(!user)return;
  const ref=doc(db,"users",user.uid,"data","state");
  const snap=await getDoc(ref);
  if(snap.exists()){
    const cloud=snap.data();
    delete cloud.updatedAt;
    state=cloud;
    saveLocal();
  }else{
    await setDoc(ref,{...state,updatedAt:serverTimestamp()});
  }
  if(unsub)unsub();
  unsub=onSnapshot(ref,s=>{
    if(!s.exists())return;
    const remote=s.data(); delete remote.updatedAt;
    if(JSON.stringify(remote)!==JSON.stringify(state)){
      state=remote; saveLocal(); render();
    }
  });
}
function gradeClass(g){return g>=90?"grade-a":g>=80?"grade-b":g>=70?"grade-c":"grade-f"}
function gradeColor(g){const cs=getComputedStyle(document.documentElement);return g>=90?cs.getPropertyValue("--green").trim():g>=80?cs.getPropertyValue("--yellow").trim():g>=70?cs.getPropertyValue("--orange").trim():cs.getPropertyValue("--red").trim()}
function letter(g){return g>=90?"A":g>=80?"B":g>=70?"C":g>=60?"D":"F"}
function logFor(key=dateKey()){state.logs[key] ||= {};return state.logs[key]}
function isDone(id,key=dateKey()){return !!state.logs[key]?.[id]}
function toggleHabit(id){
  const log=logFor(); log[id]=!log[id]; syncSnapshot(); queueSave(); render();
}
function renderHabits(type,container){
  const habits=state.habits.filter(h=>h.type===type); container.innerHTML="";
  if(!habits.length){container.innerHTML=`<div class="empty">No ${type} habits yet.</div>`;return}
  habits.forEach(h=>{
    const done=isDone(h.id),row=document.createElement("div");
    row.className=`habit ${h.type} ${done?"done":""}`;
    row.innerHTML=`<button class="check-btn">${done?"✓":""}</button><div class="habit-copy"><span class="habit-name">${esc(h.name)}</span><div class="habit-sub">${h.type==="good"?"Earn points":"Lose points"}</div></div><span class="points">${h.type==="good"?"+":"−"}${h.points}</span>`;
    row.querySelector("button").onclick=()=>toggleHabit(h.id);
    container.appendChild(row);
  });
}
function rangeData(range){
  const now=atNoon(),data=[];
  if(range==="week"||range==="month"){
    const count=range==="week"?7:30;
    for(let i=count-1;i>=0;i--){
      const d=atNoon(now);d.setDate(d.getDate()-i);
      data.push({label:range==="week"?d.toLocaleDateString(undefined,{weekday:"narrow"}):String(d.getDate()),grade:metrics(dateKey(d)).grade});
    }
    return {title:range==="week"?"Weekly grade":"30-day grade",data};
  }
  const months=range==="year"?12:60;
  for(let i=months-1;i>=0;i--){
    const start=atNoon(now);start.setDate(1);start.setMonth(start.getMonth()-i);
    const end=atNoon(start);end.setMonth(end.getMonth()+1);
    const vals=[];
    for(let d=atNoon(start);d<end&&d<=now;d.setDate(d.getDate()+1)){
      const k=dateKey(d);if(state.logs[k]||state.snapshots[k])vals.push(metrics(k).grade);
    }
    data.push({label:start.toLocaleDateString(undefined,{month:"short",year:range==="fiveYear"?"2-digit":undefined}),grade:vals.length?Math.round(vals.reduce((a,b)=>a+b,0)/vals.length):0});
  }
  return {title:range==="year"?"One-year grade":"Five-year grade",data};
}
function renderHistory(){
  const range=state.preferences.range,chart=state.preferences.chartType,{title,data}=rangeData(range);
  els.chartTitle.textContent=title;
  const vals=data.filter(x=>x.grade>0);els.rangeAverage.textContent=`${vals.length?Math.round(vals.reduce((a,b)=>a+b.grade,0)/vals.length):0}% avg`;
  document.querySelectorAll("#rangeControls button").forEach(b=>b.classList.toggle("active",b.dataset.range===range));
  document.querySelectorAll("#chartTypeControls button").forEach(b=>b.classList.toggle("active",b.dataset.chart===chart));
  els.barChart.classList.toggle("hidden",chart!=="bar");els.lineChart.classList.toggle("hidden",chart!=="line");
  if(chart==="bar")renderBars(data,range);else renderLine(data);
}
function renderBars(data,range){
  els.barChart.innerHTML="";els.barChart.style.gridTemplateColumns=`repeat(${data.length},minmax(${range==="week"?"38px":"24px"},1fr))`;els.barChart.style.width=data.length>30?`${data.length*4}%`:"100%";
  data.forEach((x,i)=>{const show=range==="week"||range==="year"||(range==="month"&&i%3===0)||(range==="fiveYear"&&i%6===0);const el=document.createElement("div");el.className="bar-item";el.innerHTML=`<div class="bar-wrap"><div class="bar ${gradeClass(x.grade)}" style="height:${Math.max(2,x.grade)}%"></div></div><div class="bar-grade">${x.grade}%</div><div class="bar-label">${show?x.label:""}</div>`;els.barChart.appendChild(el)});
}
function renderLine(data){
  const c=els.lineChart,w=Math.max(320,c.parentElement.clientWidth),h=260,r=devicePixelRatio||1;c.width=w*r;c.height=h*r;c.style.width=w+"px";c.style.height=h+"px";const ctx=c.getContext("2d");ctx.scale(r,r);ctx.clearRect(0,0,w,h);
  const p={l:34,r:18,t:20,b:34},pw=w-p.l-p.r,ph=h-p.t-p.b,muted=getComputedStyle(document.documentElement).getPropertyValue("--muted").trim();
  ctx.font="11px system-ui";ctx.textAlign="right";ctx.textBaseline="middle";
  [0,25,50,75,100].forEach(v=>{const y=p.t+ph-(v/100)*ph;ctx.strokeStyle="rgba(255,255,255,.08)";ctx.beginPath();ctx.moveTo(p.l,y);ctx.lineTo(w-p.r,y);ctx.stroke();ctx.fillStyle=muted;ctx.fillText(v,p.l-7,y)});
  const x=i=>data.length===1?p.l+pw/2:p.l+i/(data.length-1)*pw,y=g=>p.t+ph-(g/100)*ph;
  for(let i=0;i<data.length-1;i++){ctx.strokeStyle=gradeColor((data[i].grade+data[i+1].grade)/2);ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x(i),y(data[i].grade));ctx.lineTo(x(i+1),y(data[i+1].grade));ctx.stroke()}
  data.forEach((d,i)=>{ctx.fillStyle=gradeColor(d.grade);ctx.beginPath();ctx.arc(x(i),y(d.grade),data.length>35?2.5:4,0,Math.PI*2);ctx.fill()});
}
function calculateStreak(maxDays=3650){
  let s=0,d=atNoon();for(let i=0;i<maxDays;i++){const g=metrics(dateKey(d)).grade;if(g>0)s++;else if(i!==0)break;d.setDate(d.getDate()-1)}return s;
}
function longestStreak(){
  const keys=Object.keys({...state.logs,...state.snapshots}).sort();let best=0,cur=0,prev=null;
  keys.forEach(k=>{if(metrics(k).grade<=0){cur=0;prev=null;return}const d=new Date(k+"T12:00:00");if(prev){const diff=(d-prev)/86400000;cur=diff===1?cur+1:1}else cur=1;best=Math.max(best,cur);prev=d});return best;
}
function avgDays(n){
  const now=atNoon(),vals=[];for(let i=0;i<n;i++){const d=atNoon(now);d.setDate(d.getDate()-i);const k=dateKey(d);if(state.logs[k]||state.snapshots[k])vals.push(metrics(k).grade)}return vals.length?Math.round(vals.reduce((a,b)=>a+b,0)/vals.length):0;
}
function renderStats(){
  $("#weeklyAvg").textContent=avgDays(7)+"%";$("#monthlyAvg").textContent=avgDays(30)+"%";$("#yearlyAvg").textContent=avgDays(365)+"%";
  const grades=Object.keys({...state.logs,...state.snapshots}).map(k=>metrics(k).grade);$("#bestGrade").textContent=(grades.length?Math.max(...grades):0)+"%";
  $("#longestStreak").textContent=longestStreak();
  let total=0;Object.values(state.logs).forEach(log=>total+=Object.values(log).filter(Boolean).length);$("#totalCompletions").textContent=total;
  const days=Math.max(1,Object.keys(state.logs).length),wrap=$("#habitStats");wrap.innerHTML="";
  state.habits.forEach(h=>{let count=0;Object.values(state.logs).forEach(log=>{if(log[h.id])count++});const pct=Math.round(count/days*100);const el=document.createElement("div");el.className="habit-stat";el.innerHTML=`<div class="habit-stat-top"><strong>${esc(h.name)}</strong><span>${pct}%</span></div><div class="habit-stat-bar"><div class="habit-stat-fill" style="width:${pct}%"></div></div><small class="muted">${count} recorded completion${count===1?"":"s"}</small>`;wrap.appendChild(el)});
}
function renderCalendar(){
  const y=calendarCursor.getFullYear(),m=calendarCursor.getMonth();els.calendarMonth.textContent=calendarCursor.toLocaleDateString(undefined,{month:"long",year:"numeric"});els.calendarGrid.innerHTML="";
  const first=new Date(y,m,1),last=new Date(y,m+1,0);
  for(let i=0;i<first.getDay();i++){const e=document.createElement("div");e.className="calendar-day empty-day";els.calendarGrid.appendChild(e)}
  for(let d=1;d<=last.getDate();d++){const dt=new Date(y,m,d,12),k=dateKey(dt),g=metrics(k).grade,b=document.createElement("button");b.className=`calendar-day ${gradeClass(g)}`;b.innerHTML=`<strong>${d}</strong><small>${g}%</small>`;b.onclick=()=>showDay(k,b);els.calendarGrid.appendChild(b)}
}
function showDay(key,button){
  document.querySelectorAll(".calendar-day").forEach(b=>b.classList.remove("selected"));button.classList.add("selected");
  const g=metrics(key),log=state.logs[key]||{},done=state.habits.filter(h=>log[h.id]);
  els.dayDetail.innerHTML=`<h3>${new Date(key+"T12:00:00").toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric",year:"numeric"})}</h3><strong style="font-size:2rem;color:${gradeColor(g.grade)}">${g.grade}%</strong><div class="day-list">${done.length?done.map(h=>`<div class="day-row"><span>${esc(h.name)}</span><strong>${h.type==="good"?"+":"−"}${h.points}</strong></div>`).join(""):'<p class="muted">No habits recorded.</p>'}</div>`;
}
function renderManage(){
  els.manageList.innerHTML="";state.habits.forEach(h=>{const b=document.createElement("button");b.className="manage-item";b.innerHTML=`<span>${esc(h.name)}</span><small>${h.type==="good"?"+":"−"}${h.points}</small>`;b.onclick=()=>{els.manageDialog.close();openHabit(h.type,h)};els.manageList.appendChild(b)});
}
function render(){
  syncSnapshot();saveLocal();
  const m=metrics(dateKey());els.todayGrade.textContent=m.grade+"%";els.todayGrade.style.color=gradeColor(m.grade);els.letterGrade.textContent=letter(m.grade);els.gradeProgress.style.width=m.grade+"%";els.todayScore.textContent=m.raw;els.pointsPossible.textContent=`of ${m.possible} possible`;els.streakCount.textContent=calculateStreak();
  renderHabits("good",els.goodList);renderHabits("bad",els.badList);renderHistory();renderStats();renderCalendar();renderManage();
}
function openHabit(type,h=null){
  els.habitForm.reset();els.habitType.value=type;els.habitId.value=h?.id||"";els.habitName.value=h?.name||"";els.habitPoints.value=h?.points||(type==="good"?10:5);els.dialogTitle.textContent=h?"Edit habit":`Add ${type} habit`;els.deleteHabitBtn.classList.toggle("hidden",!h);els.habitDialog.showModal();
}
function esc(v){return String(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]))}

$("#googleSignInBtn").onclick=async()=>{
  els.authStatus.textContent="Opening Google sign-in…";
  try{
    const mobile=/iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    if(mobile)await signInWithRedirect(auth,provider);else await signInWithPopup(auth,provider);
  }catch(e){console.error(e);els.authStatus.textContent=e.message}
};
getRedirectResult(auth).catch(e=>{els.authStatus.textContent=e.message});
onAuthStateChanged(auth,async u=>{
  user=u;
  if(u){
    els.authScreen.classList.add("hidden");els.app.classList.remove("hidden");els.signedInAs.textContent=`Signed in as ${u.email||u.displayName}`;
    els.syncBadge.textContent="● Loading";
    try{await hydrateFromCloud();render();els.syncBadge.textContent="● Synced"}catch(e){console.error(e);render();els.syncBadge.textContent="● Offline"}
  }else{
    if(unsub)unsub();els.app.classList.add("hidden");els.authScreen.classList.remove("hidden");
  }
});
document.querySelectorAll(".tab").forEach(b=>b.onclick=()=>{document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));document.querySelectorAll(".view").forEach(x=>x.classList.remove("active"));b.classList.add("active");$("#"+b.dataset.view+"View").classList.add("active")});
document.querySelectorAll(".small-add").forEach(b=>b.onclick=()=>openHabit(b.dataset.type));
$("#settingsBtn").onclick=()=>els.manageDialog.showModal();$("#closeManageBtn").onclick=()=>els.manageDialog.close();$("#signOutBtn").onclick=()=>signOut(auth);
document.querySelectorAll("#rangeControls button").forEach(b=>b.onclick=()=>{state.preferences.range=b.dataset.range;queueSave();renderHistory()});
document.querySelectorAll("#chartTypeControls button").forEach(b=>b.onclick=()=>{state.preferences.chartType=b.dataset.chart;queueSave();renderHistory()});
els.habitForm.onsubmit=e=>{e.preventDefault();const name=els.habitName.value.trim(),points=Number(els.habitPoints.value),type=els.habitType.value,id=els.habitId.value;if(!name||points<1)return;if(id){const h=state.habits.find(x=>x.id===id);Object.assign(h,{name,points,type})}else state.habits.push({id:crypto.randomUUID(),name,points,type});syncSnapshot();queueSave();els.habitDialog.close();render()};
els.deleteHabitBtn.onclick=()=>{const id=els.habitId.value;state.habits=state.habits.filter(h=>h.id!==id);Object.values(state.logs).forEach(log=>delete log[id]);syncSnapshot();queueSave();els.habitDialog.close();render()};
$("#resetTodayBtn").onclick=()=>{if(confirm("Clear all checkoffs for today?")){state.logs[dateKey()]={};syncSnapshot();queueSave();render()}};
$("#prevMonth").onclick=()=>{calendarCursor.setMonth(calendarCursor.getMonth()-1);renderCalendar()};$("#nextMonth").onclick=()=>{calendarCursor.setMonth(calendarCursor.getMonth()+1);renderCalendar()};
window.addEventListener("resize",()=>{if(state.preferences.chartType==="line")renderHistory()});
