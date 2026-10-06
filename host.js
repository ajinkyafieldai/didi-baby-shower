const els={
  health:document.getElementById("overall-health"),
  clients:document.getElementById("metric-clients"),
  guests:document.getElementById("metric-guests"),
  projectors:document.getElementById("metric-projectors"),
  p50:document.getElementById("metric-p50"),
  p95:document.getElementById("metric-p95"),
  uptime:document.getElementById("metric-uptime"),
  log:document.getElementById("event-log"),
  status:document.getElementById("action-status"),
  force:document.getElementById("force")
};

const clientId=crypto.randomUUID();
let lastEventSeq=0;
let initialized=false;
let latestLatency=null;

function fmtMs(value){return Number.isFinite(Number(value))?Math.round(Number(value))+" ms":"—"}
function fmtUptime(ms){
  const total=Math.max(0,Math.floor(Number(ms||0)/1000));
  const h=Math.floor(total/3600),m=Math.floor((total%3600)/60);
  return h?h+"h "+m+"m":m+"m";
}
function setHealth(kind,text){
  els.health.className="health-pill "+kind;
  els.health.textContent=text;
}
function updateTelemetry(t){
  if(!t)return;
  els.clients.textContent=t.activeClients??"—";
  els.guests.textContent=t.byRole?.guest??0;
  els.projectors.textContent=t.byRole?.projector??0;
  els.p50.textContent=fmtMs(t.latencyMs?.p50);
  els.p95.textContent=fmtMs(t.latencyMs?.p95);
  els.uptime.textContent=fmtUptime(t.uptimeMs);
  const p95=Number(t.latencyMs?.p95);
  if(!t.activeClients)setHealth("warn","No clients");
  else if(Number.isFinite(p95)&&p95>2500)setHealth("warn","Degraded");
  else setHealth("good","Healthy");
}
function prependEvent(event){
  const li=document.createElement("li");
  const time=document.createElement("time");
  time.textContent=new Date(event.at||Date.now()).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit",second:"2-digit"});
  const name=document.createElement("span"); name.className="event-name"; name.textContent=event.effect||event.type||"event";
  const sender=document.createElement("span"); sender.className="event-sender"; sender.textContent=event.sender||"system";
  li.append(time,name,sender); els.log.prepend(li);
  while(els.log.children.length>20)els.log.lastElementChild.remove();
}
async function heartbeat(){
  try{
    await fetch("/api/events",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
      type:"telemetry",clientId,role:"host",latencyMs:latestLatency,lastEventSeq,visible:document.visibilityState==="visible"
    }),cache:"no-store"});
  }catch{}
}
async function poll(){
  const started=performance.now();
  try{
    const response=await fetch("/api/events?since="+lastEventSeq,{cache:"no-store"});
    if(!response.ok)throw new Error("HTTP "+response.status);
    latestLatency=Math.round(performance.now()-started);
    const data=await response.json();
    updateTelemetry(data.telemetry);
    const events=Array.isArray(data.events)?data.events:[];
    if(initialized){
      events.filter(e=>Number(e.seq||0)>lastEventSeq).sort((a,b)=>Number(a.seq||0)-Number(b.seq||0)).forEach(prependEvent);
    }else{
      events.slice(-12).forEach(prependEvent);
      initialized=true;
    }
    if(typeof data.seq==="number")lastEventSeq=Math.max(lastEventSeq,data.seq);
  }catch(error){
    setHealth("bad","Offline");
    els.status.textContent="Realtime poll failed: "+error.message;
  }
}
async function trigger(effect){
  els.status.textContent="Sending "+effect+"…";
  const response=await fetch("/api/events",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
    type:"effect",effect,sender:"Host",senderId:clientId,force:els.force.checked
  }),cache:"no-store"});
  const data=await response.json();
  if(!response.ok)throw new Error(data.error||"Trigger failed");
  if(data.event)prependEvent(data.event);
  if(typeof data.seq==="number")lastEventSeq=Math.max(lastEventSeq,data.seq);
  els.status.textContent=(els.force.checked?"Forced ":"")+"Sent "+effect+".";
}
document.querySelectorAll("[data-effect]").forEach(button=>{
  button.addEventListener("click",async()=>{
    button.disabled=true;
    try{await trigger(button.dataset.effect)}catch(error){els.status.textContent=error.message}
    finally{window.setTimeout(()=>{button.disabled=false},300)}
  });
});
poll();heartbeat();setInterval(poll,1000);setInterval(heartbeat,5000);document.addEventListener("visibilitychange",heartbeat);
document.querySelectorAll("[data-command]").forEach(button=>{
  button.addEventListener("click",async()=>{
    button.disabled=true;
    const command=button.dataset.command;
    els.status.textContent="Sending "+command+"…";
    try{
      const response=await fetch("/api/events",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
        type:"command",command,sender:"Host",senderId:clientId,force:els.force.checked
      }),cache:"no-store"});
      const data=await response.json();
      if(!response.ok)throw new Error(data.error||"Command failed");
      if(data.event)prependEvent(data.event);
      if(typeof data.seq==="number")lastEventSeq=Math.max(lastEventSeq,data.seq);
      els.status.textContent=(els.force.checked?"Forced ":"")+"Sent "+command+".";
    }catch(error){
      els.status.textContent=error.message;
    }finally{
      window.setTimeout(()=>{button.disabled=false},300);
    }
  });
});
