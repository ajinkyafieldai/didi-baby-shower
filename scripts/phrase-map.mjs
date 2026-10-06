#!/usr/bin/env node
import { createInterface } from "node:readline";

const DEFAULT_COOLDOWN_MS=Number(process.env.BABYSHOWER_PHRASE_COOLDOWN_MS||8000);
const DUPLICATE_WINDOW_MS=Number(process.env.BABYSHOWER_TRANSCRIPT_DUPLICATE_MS||5000);

const rules=[
  {
    trigger:"photo.show",
    cooldownMs:Number(process.env.BABYSHOWER_COOLDOWN_PHOTO_SHOW_MS||DEFAULT_COOLDOWN_MS),
    patterns:[
      /\b(?:show|put|bring)\s+(?:up\s+)?(?:the\s+)?(?:latest\s+)?(?:family\s+)?(?:photo|picture)\b/i,
      /\b(?:start|take|do)\s+(?:the\s+)?(?:family\s+)?(?:photo|picture)\b/i,
      /\b(?:let'?s|lets)\s+(?:start|take|do)\s+(?:the\s+)?(?:family\s+)?(?:photo|picture)\b/i,
      /\b(?:can|could|please)\s+(?:you\s+)?show\s+(?:us\s+)?(?:the\s+)?(?:photo|picture)\b/i
    ]
  },
  {
    trigger:"celebrate",
    cooldownMs:Number(process.env.BABYSHOWER_COOLDOWN_CELEBRATE_MS||DEFAULT_COOLDOWN_MS),
    patterns:[
      /\b(?:let'?s|lets)\s+celebrate\b/i,
      /\bcelebration\s+time\b/i
    ]
  },
  {
    trigger:"flowers",
    cooldownMs:Number(process.env.BABYSHOWER_COOLDOWN_FLOWERS_MS||DEFAULT_COOLDOWN_MS),
    patterns:[
      /\b(?:send|throw|shower)(?:\s+(?:some|the))?\s+flowers?\b/i,
      /\bflower\s+shower\b/i
    ]
  },
  {
    trigger:"oti",
    cooldownMs:Number(process.env.BABYSHOWER_COOLDOWN_OTI_MS||DEFAULT_COOLDOWN_MS),
    patterns:[
      /\b(?:do|start|begin)\s+(?:the\s+)?oti\b/i,
      /\boti\s+(?:karu|kara|time)\b/i
    ]
  },
  {
    trigger:"haldi",
    cooldownMs:Number(process.env.BABYSHOWER_COOLDOWN_HALDI_MS||DEFAULT_COOLDOWN_MS),
    patterns:[
      /\b(?:do|start|begin|apply)\s+(?:the\s+)?haldi\b/i,
      /\bhaldi\s+(?:lavu|lava|time)\b/i
    ]
  },
  {
    trigger:"kunku",
    cooldownMs:Number(process.env.BABYSHOWER_COOLDOWN_KUNKU_MS||DEFAULT_COOLDOWN_MS),
    patterns:[
      /\b(?:do|start|begin|apply)\s+(?:the\s+)?(?:kunku|kumkum)\b/i,
      /\b(?:kunku|kumkum)\s+(?:lavu|lava|time)\b/i
    ]
  }
];

const lastFired=new Map();
const recentlySeen=new Map();

function normalize(line){
  return String(line||"")
    .normalize("NFKC")
    .replace(/[\u0000-\u001f]+/g," ")
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

function match(text){
  if (/\b(?:do\s+not|don't|dont|never|please\s+don't|please\s+do\s+not)\s+(?:show|put|bring)\b/i.test(text)) {
    return null;
  }

  for(const rule of rules){
    const pattern=rule.patterns.find((candidate)=>candidate.test(text));
    if(pattern)return {rule,pattern:String(pattern)};
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
      cooldownMs:result.rule.cooldownMs
    });
    return;
  }

  diagnostic("matched",{
    text,
    trigger:result.rule.trigger,
    pattern:result.pattern
  });
  process.stdout.write(result.rule.trigger+"\n");
});
