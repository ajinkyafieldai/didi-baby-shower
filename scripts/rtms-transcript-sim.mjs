#!/usr/bin/env node
import { createInterface } from "node:readline";

process.stderr.write("[rtms-sim] Type transcript lines. Ctrl-D to stop.\n");

const input=createInterface({input:process.stdin,crlfDelay:Infinity});
input.on("line",(line)=>{
  const text=String(line||"")
    .normalize("NFKC")
    .replace(/[\u0000-\u001f]+/g," ")
    .replace(/\s+/g," ")
    .trim();
  if(text)process.stdout.write(text+"\n");
});
