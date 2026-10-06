import { spawn } from "node:child_process";
import { strict as assert } from "node:assert";
import { fileURLToPath } from "node:url";

const mapper=fileURLToPath(new URL("./phrase-map.mjs",import.meta.url));

async function runMapper(lines,extraEnv={}){
  const child=spawn(process.execPath,[mapper],{
    env:{
      ...process.env,
      BABYSHOWER_PHRASE_COOLDOWN_MS:"60000",
      BABYSHOWER_TRANSCRIPT_DUPLICATE_MS:"60000",
      ...extraEnv
    },
    stdio:["pipe","pipe","pipe"]
  });

  let stdout="",stderr="";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data",(chunk)=>{stdout+=chunk;});
  child.stderr.on("data",(chunk)=>{stderr+=chunk;});

  child.stdin.end(lines.join("\n"));
  const code=await new Promise((resolve)=>child.on("exit",resolve));
  assert.equal(code,0);

  return {
    tokens:stdout.trim().split(/\n+/).filter(Boolean),
    logs:stderr.trim().split(/\n+/).filter(Boolean).map((line)=>JSON.parse(line))
  };
}

const primary=await runMapper([
  "Let's take a family photo.",
  "Let's take a family photo.",
  "Send some flowers",
  "oti karu ya",
  "apply haldi",
  "apply kunku",
  "let's celebrate"
]);

assert.deepEqual(primary.tokens,[
  "photo.show",
  "flowers",
  "oti",
  "haldi",
  "kunku",
  "celebrate"
]);
assert(primary.logs.some((entry)=>entry.kind==="suppressed_duplicate"));

const noisyAsr=await runMapper([
  "Let's take a family poto.",
  "Please show the foto.",
  "The flouer shower starts now.",
  "Apply haldi now.",
  "Apply kumkum now."
],{
  BABYSHOWER_PHRASE_COOLDOWN_MS:"0",
  BABYSHOWER_TRANSCRIPT_DUPLICATE_MS:"0"
});
assert.deepEqual(noisyAsr.tokens,[
  "photo.show",
  "photo.show",
  "flowers",
  "haldi",
  "kunku"
]);
assert(noisyAsr.logs.some((entry)=>entry.kind==="matched"&&entry.distance===1));

const devanagari=await runMapper([
  "चला फोटो काढूया",
  "हळद लावूया",
  "आता कुंकू",
  "फूल टाका",
  "ओटी भरूया"
],{
  BABYSHOWER_PHRASE_COOLDOWN_MS:"0",
  BABYSHOWER_TRANSCRIPT_DUPLICATE_MS:"0"
});
assert.deepEqual(devanagari.tokens,[
  "photo.show",
  "haldi",
  "kunku",
  "flowers",
  "oti"
]);

const keywordSemantics=await runMapper([
  "We took a photo yesterday.",
  "The haldi was beautiful.",
  "Kunku is on the table."
],{
  BABYSHOWER_PHRASE_COOLDOWN_MS:"0",
  BABYSHOWER_TRANSCRIPT_DUPLICATE_MS:"0"
});
assert.deepEqual(keywordSemantics.tokens,[
  "photo.show",
  "haldi",
  "kunku"
]);

const noMatch=await runMapper([
  "That was a lovely ceremony.",
  "Let's get everyone together.",
  "The baby shower is starting."
]);
assert.deepEqual(noMatch.tokens,[]);

for(const token of [...primary.tokens,...noisyAsr.tokens,...devanagari.tokens]){
  assert.match(token,/^[a-z]+(?:[.-][a-z]+)*$/);
}

console.log("Verified: transcript mapper uses tolerant keyword detection with duplicate and cooldown protection.");
