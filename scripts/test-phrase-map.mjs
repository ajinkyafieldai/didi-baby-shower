import { spawn } from "node:child_process";
import { strict as assert } from "node:assert";
import { fileURLToPath } from "node:url";

const mapper=fileURLToPath(new URL("./phrase-map.mjs",import.meta.url));
const child=spawn(process.execPath,[mapper],{
  env:{...process.env,BABYSHOWER_PHRASE_COOLDOWN_MS:"60000"},
  stdio:["pipe","pipe","inherit"]
});

let output="";
child.stdout.setEncoding("utf8");
child.stdout.on("data",(chunk)=>{output+=chunk;});

child.stdin.end([
  "Can someone take a photo please?",
  "photo again immediately",
  "Bring the flowers",
  "Nothing interesting here",
  "oti karu ya",
  "haldi kunku",
  "celebrate!",
  "photo; rm -rf /"
].join("\n"));

const code=await new Promise((resolve)=>child.on("exit",resolve));
assert.equal(code,0);

const tokens=output.trim().split(/\n+/).filter(Boolean);
assert.deepEqual(tokens,[
  "photo.show",
  "flowers",
  "oti",
  "haldi",
  "celebrate"
]);

for(const token of tokens){
  assert.match(token,/^[a-z]+(?:[.-][a-z]+)*$/);
}

console.log("Verified: transcript mapper emits only expected whitelisted triggers.");
