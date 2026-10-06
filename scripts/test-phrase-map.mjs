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
  "Can you show the photo please?",
  "Can you show the photo please?",
  "show the latest family picture",
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
assert(primary.logs.some((entry)=>entry.kind==="suppressed_cooldown"));
assert(primary.logs.some((entry)=>entry.kind==="matched"&&entry.trigger==="photo.show"));

const photoVariants=await runMapper([
  "Let's start the photo."
],{
  BABYSHOWER_PHRASE_COOLDOWN_MS:"0",
  BABYSHOWER_TRANSCRIPT_DUPLICATE_MS:"0"
});
assert.deepEqual(photoVariants.tokens,["photo.show"]);

const falsePositives=await runMapper([
  "We took a photo yesterday.",
  "That picture was nice.",
  "My favourite flowers are roses.",
  "The haldi was beautiful.",
  "Kunku is on the table.",
  "Congratulations on the promotion.",
  "Please do not show the photo.",
  "photo; rm -rf /"
]);

assert.deepEqual(falsePositives.tokens,[]);
assert(falsePositives.logs.every((entry)=>entry.kind==="no_match"));

for(const token of primary.tokens){
  assert.match(token,/^[a-z]+(?:[.-][a-z]+)*$/);
}

console.log("Verified: transcript matcher is intent-based, deduplicated, cooldown-safe, and rejects false positives.");
