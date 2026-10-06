#!/usr/bin/env node
import rtms from "@zoom/rtms";

const clients=new Map();
const allowedSpeakers=new Set(
  String(process.env.BABYSHOWER_ALLOWED_SPEAKERS||"")
    .split(",")
    .map((value)=>value.trim().toLowerCase())
    .filter(Boolean)
);

function normalize(value){
  return String(value??"")
    .normalize("NFKC")
    .replace(/[\u0000-\u001f]+/g," ")
    .replace(/\s+/g," ")
    .trim();
}

function log(...parts){
  process.stderr.write("[rtms] "+parts.join(" ")+"\n");
}

function streamIdFrom(payload){
  return String(payload?.rtms_stream_id||"");
}

function attachClient(payload){
  const streamId=streamIdFrom(payload);
  if(!streamId){
    log("Ignoring rtms_started event without rtms_stream_id");
    return;
  }

  if(clients.has(streamId)){
    log("Stream already attached:",streamId);
    return;
  }

  const client=new rtms.Client();
  clients.set(streamId,client);

  if(process.env.BABYSHOWER_TRANSCRIPT_LANGUAGE){
    const key=String(process.env.BABYSHOWER_TRANSCRIPT_LANGUAGE).trim().toUpperCase();
    const language=rtms.TranscriptLanguage?.[key];
    if(language!==undefined){
      client.setTranscriptParams({srcLanguage:language});
      log("Transcript language:",key);
    }else{
      log("Unknown BABYSHOWER_TRANSCRIPT_LANGUAGE:",key,"using auto-detect");
    }
  }

  client.onTranscriptData((data,_size,timestamp,metadata)=>{
    const text=normalize(Buffer.isBuffer(data)?data.toString("utf8"):data);
    if(!text)return;

    const speaker=normalize(metadata?.userName)||"unknown";
    if(allowedSpeakers.size&& !allowedSpeakers.has(speaker.toLowerCase())){
      log("ignored-speaker",String(timestamp??""),speaker+":",text);
      return;
    }

    process.stdout.write(text+"\n");
    log("transcript",String(timestamp??""),speaker+":",text);
  });

  try{
    client.join(payload);
    log("Joined RTMS stream",streamId);
  }catch(error){
    clients.delete(streamId);
    log("Failed to join RTMS stream",streamId,error?.message||String(error));
  }
}

function detachClient(payload){
  const streamId=streamIdFrom(payload);
  const client=clients.get(streamId);
  if(!client)return;

  try{
    client.leave();
  }catch(error){
    log("Failed to leave RTMS stream",streamId,error?.message||String(error));
  }finally{
    clients.delete(streamId);
    log("Left RTMS stream",streamId);
  }
}

rtms.onWebhookEvent(({event,payload})=>{
  if(String(event).includes("rtms_stopped")){
    detachClient(payload);
    return;
  }

  if(String(event).includes("rtms_started")){
    attachClient(payload);
  }
});

function shutdown(signal){
  log("Received",signal,"shutting down");
  for(const [streamId,client] of clients){
    try{client.leave();}catch{}
    clients.delete(streamId);
  }
  process.exit(0);
}

process.on("SIGINT",()=>shutdown("SIGINT"));
process.on("SIGTERM",()=>shutdown("SIGTERM"));

log("Listening for Zoom RTMS webhooks");
log("port="+(process.env.ZM_RTMS_PORT||"8080"),"path="+(process.env.ZM_RTMS_PATH||"/webhook"));
if(allowedSpeakers.size)log("allowed-speakers="+[...allowedSpeakers].join(","));
