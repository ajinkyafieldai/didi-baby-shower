#!/usr/bin/env node
import { createInterface } from "node:readline";

const COOLDOWN_MS=Number(process.env.BABYSHOWER_PHRASE_COOLDOWN_MS||8000);
const rules=[
  {trigger:"photo.show",patterns:[/\bphoto\b/i,/\bpicture\b/i]},
  {trigger:"celebrate",patterns:[/\bcelebrate\b/i,/\bcongratulations\b/i]},
  {trigger:"flowers",patterns:[/\bflowers?\b/i]},
  {trigger:"oti",patterns:[/\boti\b/i]},
  {trigger:"haldi",patterns:[/\bhaldi\b/i]},
  {trigger:"kunku",patterns:[/\bkunku\b/i,/\bkumkum\b/i]}
];

const lastFired=new Map();

function normalize(line){
  return String(line||"")
    .normalize("NFKC")
    .replace(/[\u0000-\u001f]+/g," ")
    .replace(/\s+/g," ")
    .trim();
}

function match(line){
  const text=normalize(line);
  if(!text)return null;

  for(const rule of rules){
    if(rule.patterns.some((pattern)=>pattern.test(text)))return rule.trigger;
  }
  return null;
}

function allowedNow(trigger){
  const now=Date.now();
  const previous=lastFired.get(trigger)||0;
  if(now-previous<COOLDOWN_MS)return false;
  lastFired.set(trigger,now);
  return true;
}

const input=createInterface({input:process.stdin,crlfDelay:Infinity});
input.on("line",(line)=>{
  const trigger=match(line);
  if(trigger&&allowedNow(trigger)){
    process.stdout.write(trigger+"\n");
  }
});
