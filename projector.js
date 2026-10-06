const clientId=crypto.randomUUID();
const effectEl=document.getElementById("projector-effect");
const titleEl=document.getElementById("projector-title");
const subtitleEl=document.getElementById("projector-subtitle");
const statusEl=document.getElementById("projector-status");
let lastEventSeq=0,initialized=false,lastLatency=null,effectTimer=null,lastPollCompletedAt=Date.now(),resyncOnNextPoll=false;
const RESUME_GAP_MS=5000,MAX_EFFECT_AGE_MS=4000;
const visuals={ovalni:"🪔",flowers:"🌸",ashirwad:"🙌",supari:"🌰",haldi:"🟡",kunku:"🔴",oti:"🥥",celebrate:"🎉",photo:"📸"};
const labels={ovalni:"Ovalni",flowers:"Flowers",ashirwad:"Ashirwad",supari:"Supari",haldi:"Haldi",kunku:"Kunku",oti:"Oti",celebrate:"Celebrate",photo:"Family photo"};
function showEvent(event){
  clearTimeout(effectTimer);
  const effect=event.effect||"";
  titleEl.textContent=labels[effect]||"Celebration";
  subtitleEl.textContent=(event.sender||"Someone")+" sent "+(labels[effect]||effect);
  effectEl.textContent=visuals[effect]||"✨";
  effectEl.className="projector-effect show"+(effect==="photo"?" photo":"");
  effectTimer=setTimeout(()=>{effectEl.className="projector-effect";},effect==="photo"?5000:2600);
}
async function heartbeat(){
  try{await fetch("/api/events",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
    type:"telemetry",clientId,role:"projector",latencyMs:lastLatency,lastEventSeq,visible:document.visibilityState==="visible"
  }),cache:"no-store"});}catch{}
}
async function poll(){
  const started=performance.now();
  try{
    const response=await fetch("/api/events?since="+lastEventSeq,{cache:"no-store"});
    if(!response.ok)throw new Error("HTTP "+response.status);
    const data=await response.json();
    const now=Date.now(),resumedAfterGap=now-lastPollCompletedAt>RESUME_GAP_MS,shouldResync=resyncOnNextPoll||resumedAfterGap;
    lastLatency=Math.round(performance.now()-started);
    statusEl.textContent="Live · "+lastLatency+" ms";statusEl.className="projector-status good";
    if(!initialized||shouldResync){lastEventSeq=Number(data.seq||0);initialized=true;resyncOnNextPoll=false;lastPollCompletedAt=Date.now();return;}
    const events=Array.isArray(data.events)?data.events:[];
    events.filter(e=>e&&e.type==="effect"&&Number(e.seq||0)>lastEventSeq&&now-Number(e.at||0)<=MAX_EFFECT_AGE_MS).sort((a,b)=>Number(a.seq||0)-Number(b.seq||0)).forEach((event,index)=>setTimeout(()=>showEvent(event),index*350));
    if(typeof data.seq==="number")lastEventSeq=Math.max(lastEventSeq,data.seq);
  }catch(error){statusEl.textContent="Offline";statusEl.className="projector-status bad";}finally{lastPollCompletedAt=Date.now();}
}
poll();heartbeat();setInterval(poll,750);setInterval(heartbeat,5000);document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"){resyncOnNextPoll=true;poll();}heartbeat();});