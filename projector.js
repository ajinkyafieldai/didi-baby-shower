const clientId=crypto.randomUUID();
const effectEl=document.getElementById("projector-effect");
const titleEl=document.getElementById("projector-title");
const subtitleEl=document.getElementById("projector-subtitle");
const statusEl=document.getElementById("projector-status");
let lastEventSeq=0,initialized=false,lastLatency=null,effectTimer=null;
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
    lastLatency=Math.round(performance.now()-started);
    statusEl.textContent="Live · "+lastLatency+" ms";statusEl.className="projector-status good";
    if(!initialized){lastEventSeq=Number(data.seq||0);initialized=true;return;}
    const events=Array.isArray(data.events)?data.events:[];
    events.filter(e=>e&&e.type==="effect"&&Number(e.seq||0)>lastEventSeq).sort((a,b)=>Number(a.seq||0)-Number(b.seq||0)).forEach((event,index)=>setTimeout(()=>showEvent(event),index*350));
    if(typeof data.seq==="number")lastEventSeq=Math.max(lastEventSeq,data.seq);
  }catch(error){statusEl.textContent="Offline";statusEl.className="projector-status bad";}
}
poll();heartbeat();setInterval(poll,750);setInterval(heartbeat,5000);document.addEventListener("visibilitychange",heartbeat);