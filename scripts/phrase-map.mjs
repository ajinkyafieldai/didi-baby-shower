#!/usr/bin/env node
import { createInterface } from "node:readline";

const DEFAULT_COOLDOWN_MS=Number(process.env.BABYSHOWER_PHRASE_COOLDOWN_MS||8000);
const DUPLICATE_WINDOW_MS=Number(process.env.BABYSHOWER_TRANSCRIPT_DUPLICATE_MS||5000);
const FUZZY_DISTANCE=Number(process.env.BABYSHOWER_KEYWORD_FUZZY_DISTANCE||1);

const rules=[
  {
    trigger:"photo.show",
    cooldownMs:Number(process.env.BABYSHOWER_COOLDOWN_PHOTO_SHOW_MS||DEFAULT_COOLDOWN_MS),
    aliases:["photo","foto","poto","picture","फोटो"]
  },
  {
    trigger:"celebrate",
    cooldownMs:Number(process.env.BABYSHOWER_COOLDOWN_CELEBRATE_MS||DEFAULT_COOLDOWN_MS),
    aliases:["celebrate","celebration","congratulations","congrats"]
  },
  {
    trigger:"flowers",
    cooldownMs:Number(process.env.BABYSHOWER_COOLDOWN_FLOWERS_MS||DEFAULT_COOLDOWN_MS),
    aliases:["flower","flowers","phool","फूल"]
  },
  {
    trigger:"oti",
    cooldownMs:Number(process.env.BABYSHOWER_COOLDOWN_OTI_MS||DEFAULT_COOLDOWN_MS),
    aliases:["oti","ओटी"]
  },
  {
    trigger:"haldi",
    cooldownMs:Number(process.env.BABYSHOWER_COOLDOWN_HALDI_MS||DEFAULT_COOLDOWN_MS),
    aliases:["haldi","hald","हळद","हल्दी"]
  },
  {
    trigger:"kunku",
    cooldownMs:Number(process.env.BABYSHOWER_COOLDOWN_KUNKU_MS||DEFAULT_COOLDOWN_MS),
    aliases:["kunku","kumkum","कुंकू","कुमकुम"]
  }
];

const lastFired=new Map();
const recentlySeen=new Map();

function normalize(line){
  return String(line||"")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u0000-\u001f]+/g," ")
    .replace(/[^\p{L}\p{M}\p{N}]+/gu," ")
    .replace(/\s+/g," ")
    .trim();
}

function diagnostic(kind,data){
  process.stderr.write(JSON.stringify({
    source:"phrase-map",
    kind,
    at:new Date().toISOString(),
    ...data
  })+"\n");
}

function duplicate(text){
  const now=Date.now();
  const previous=recentlySeen.get(text)||0;
  recentlySeen.set(text,now);

  for(const [value,seenAt] of recentlySeen){
    if(now-seenAt>DUPLICATE_WINDOW_MS)recentlySeen.delete(value);
  }

  return now-previous<DUPLICATE_WINDOW_MS;
}

function levenshtein(a,b,maxDistance=Infinity){
  if(Math.abs(a.length-b.length)>maxDistance)return maxDistance+1;

  let previous=Array.from({length:b.length+1},(_,index)=>index);
  for(let i=1;i<=a.length;i++){
    const current=[i];
    let rowMin=current[0];

    for(let j=1;j<=b.length;j++){
      const cost=a[i-1]===b[j-1]?0:1;
      current[j]=Math.min(
        current[j-1]+1,
        previous[j]+1,
        previous[j-1]+cost
      );
      rowMin=Math.min(rowMin,current[j]);
    }

    if(rowMin>maxDistance)return maxDistance+1;
    previous=current;
  }

  return previous[b.length];
}

function isLatin(value){
  return /^[a-z0-9]+$/i.test(value);
}

function match(text){
  const tokens=text.split(" ").filter(Boolean);

  for(const rule of rules){
    for(const alias of rule.aliases){
      for(const token of tokens){
        if(token===alias){
          return {rule,alias,token,distance:0};
        }

        if(
          FUZZY_DISTANCE>0 &&
          isLatin(token) &&
          isLatin(alias) &&
          alias.length>=4 &&
          token.length>=4
        ){
          const distance=levenshtein(token,alias,FUZZY_DISTANCE);
          if(distance<=FUZZY_DISTANCE){
            return {rule,alias,token,distance};
          }
        }
      }
    }
  }

  return null;
}

function allowedNow(rule){
  const now=Date.now();
  const previous=lastFired.get(rule.trigger)||0;
  if(now-previous<rule.cooldownMs)return false;
  lastFired.set(rule.trigger,now);
  return true;
}

const input=createInterface({input:process.stdin,crlfDelay:Infinity});
input.on("line",(line)=>{
  const text=normalize(line);
  if(!text)return;

  if(duplicate(text)){
    diagnostic("suppressed_duplicate",{text});
    return;
  }

  const result=match(text);
  if(!result){
    diagnostic("no_match",{text});
    return;
  }

  if(!allowedNow(result.rule)){
    diagnostic("suppressed_cooldown",{
      text,
      trigger:result.rule.trigger,
      alias:result.alias,
      token:result.token,
      distance:result.distance,
      cooldownMs:result.rule.cooldownMs
    });
    return;
  }

  diagnostic("matched",{
    text,
    trigger:result.rule.trigger,
    alias:result.alias,
    token:result.token,
    distance:result.distance
  });
  process.stdout.write(result.rule.trigger+"\n");
});
