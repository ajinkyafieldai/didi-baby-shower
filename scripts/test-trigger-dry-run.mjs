import { spawn } from "node:child_process";
import { strict as assert } from "node:assert";
import { fileURLToPath } from "node:url";

const cli=fileURLToPath(new URL("../babyshower.js",import.meta.url));

async function run(args){
  const child=spawn(process.execPath,[cli,...args],{
    env:{...process.env,BABYSHOWER_URL:""},
    stdio:["ignore","pipe","pipe"]
  });

  let stdout="",stderr="";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data",(chunk)=>{stdout+=chunk;});
  child.stderr.on("data",(chunk)=>{stderr+=chunk;});

  const code=await new Promise((resolve)=>child.on("exit",resolve));
  assert.equal(code,0,stderr);
  return JSON.parse(stdout.trim());
}

for(const args of [
  ["trigger","photo.show","--dry-run"],
  ["trigger","--dry-run","photo.show"]
]){
  const result=await run(args);
  assert.equal(result.ok,true);
  assert.equal(result.dryRun,true);
  assert.equal(result.trigger,"photo.show");
  assert.deepEqual(result.payload,{
    type:"command",
    command:"photo.show",
    sender:"Transcript",
    senderId:"operator-cli",
    force:false
  });
}

console.log("Verified: trigger dry-run accepts flags before or after the trigger name.");
