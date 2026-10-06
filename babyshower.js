#!/usr/bin/env node
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const args=process.argv.slice(2);
const baseUrl=(process.env.BABYSHOWER_URL||"").replace(/\/$/,"");
const clientId=process.env.BABYSHOWER_CLIENT_ID||"operator-cli";

const TRIGGERS=Object.freeze({
  "photo.show": {type:"command",command:"photo.show"},
  "photo.capture": {type:"command",command:"photo.capture"},
  "flowers": {type:"effect",effect:"flowers"},
  "celebrate": {type:"effect",effect:"celebrate"},
  "haldi": {type:"effect",effect:"haldi"},
  "kunku": {type:"effect",effect:"kunku"},
  "oti": {type:"effect",effect:"oti"}
});

function usage(){
  console.log(`Usage:
  babyshower trigger <name> [--force] [--dry-run]
  babyshower room create [--hours <n>] [--dry-run]
  babyshower photobooth [run|capture|health]

Allowed triggers:
  ${Object.keys(TRIGGERS).join("\n  ")}
`);
}

function requireUrl(){
  if(!baseUrl){
    console.error("BABYSHOWER_URL is required.");
    process.exit(2);
  }
}

async function trigger(name,force=false,dryRun=false){
  const mapped=TRIGGERS[name];
  if(!mapped){
    console.error("Unknown trigger:",name);
    process.exit(2);
  }

  const payload={
    ...mapped,
    sender:"Transcript",
    senderId:clientId,
    force:Boolean(force)
  };

  if(dryRun){
    console.log(JSON.stringify({ok:true,dryRun:true,trigger:name,payload}));
    return;
  }

  requireUrl();

  const response=await fetch(baseUrl+"/api/events",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify(payload),
    cache:"no-store"
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.error||`HTTP ${response.status}`);
  console.log(JSON.stringify({ok:true,trigger:name,seq:data.seq??null}));
}

function parseOption(name, fallback=null){
  const index=args.indexOf(name);
  if(index<0)return fallback;
  const value=args[index+1];
  return value && !value.startsWith("--") ? value : fallback;
}

async function createRoom(dryRun=false){
  const apiKey=process.env.WHEREBY_API_KEY||"";
  const hours=Number(parseOption("--hours","8"));

  if(!Number.isFinite(hours)||hours<=0||hours>24){
    throw new Error("--hours must be between 0 and 24.");
  }

  const endDate=new Date(Date.now()+hours*60*60*1000).toISOString();
  const payload={
    endDate,
    fields:["hostRoomUrl"]
  };

  if(dryRun){
    console.log(JSON.stringify({
      ok:true,
      dryRun:true,
      provider:"whereby",
      hours,
      payload
    },null,2));
    return;
  }

  if(!apiKey){
    throw new Error("WHEREBY_API_KEY is required.");
  }

  const response=await fetch("https://api.whereby.dev/v1/meetings",{
    method:"POST",
    headers:{
      "Authorization":"Bearer "+apiKey,
      "Content-Type":"application/json"
    },
    body:JSON.stringify(payload)
  });

  const data=await response.json().catch(()=>({}));
  if(!response.ok){
    throw new Error(data.error||data.message||`Whereby HTTP ${response.status}`);
  }

  console.log(JSON.stringify({
    ok:true,
    provider:"whereby",
    meetingId:data.meetingId||null,
    roomUrl:data.roomUrl||null,
    hostRoomUrl:data.hostRoomUrl||null,
    endDate
  },null,2));
}

function runPhotobooth(rest){
  const script=fileURLToPath(new URL("./photobooth.js",import.meta.url));
  const child=spawn(process.execPath,[script,...(rest.length?rest:["run"])],{stdio:"inherit",env:process.env});
  child.on("exit",(code,signal)=>{
    if(signal)process.kill(process.pid,signal);
    process.exit(code??1);
  });
}

try{
  if(args[0]==="trigger"){
    const triggerName=args.slice(1).find((arg)=>!arg.startsWith("--"));
    await trigger(triggerName,args.includes("--force"),args.includes("--dry-run"));
  }else if(args[0]==="room"&&args[1]==="create"){
    await createRoom(args.includes("--dry-run"));
  }else if(args[0]==="photobooth"){
    runPhotobooth(args.slice(1));
  }else{
    usage();
  }
}catch(error){
  console.error(error.stack||error.message||String(error));
  process.exit(1);
}
