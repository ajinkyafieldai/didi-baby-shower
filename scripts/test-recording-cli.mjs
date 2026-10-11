import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
const moduleUrl = new URL('./recording-cli.mjs', import.meta.url).href;
async function scenario(signal, duringStart = false, failStop = false) {
  const code = `
    import { recordingCommand } from ${JSON.stringify(moduleUrl)};
    globalThis.fetch = async (url, opts = {}) => {
      console.log('REQUEST', url, opts.method, opts.headers.Authorization ? 'AUTH' : 'NO_AUTH');
      if(url.endsWith('/api/video-config')) return Response.json({roomUrl:'https://apsl.daily.co/test-room'});
      if(url.endsWith('/start')) {
        ${duringStart ? "console.log('START_PENDING'); await new Promise(r=>setTimeout(r,200));" : ''}
        return Response.json({status:'sent',recordingId:'recording-id'});
      }
      if(url.endsWith('/stop')) return ${failStop ? "Response.json({error:'provider down'},{status:503})" : "Response.json({status:'sent'})"};
      return Response.json({id:'recording-id',status:'in-progress'});
    };
    try { await recordingCommand('run'); } catch(e) { console.error(e.message); process.exitCode=1; }
  `;
  const child = spawn(process.execPath, ['--input-type=module', '-e', code], {
    env: {...process.env,DAILY_API_KEY:'test-secret',BABYSHOWER_URL:'https://didi.test'}, stdio:['ignore','pipe','pipe']
  });
  let output = ''; let sent = false;
  const timer=setTimeout(()=>child.kill('SIGKILL'),5000);
  for(const stream of [child.stdout,child.stderr]) stream.on('data', chunk => {
    output+=chunk;
    if(!sent && output.includes(duringStart?'START_PENDING':'● RECORDING')) { sent=true; child.kill(signal); }
  });
  const result=await new Promise(resolve=>child.on('exit',(code,signal)=>resolve({code,signal})));
  clearTimeout(timer);
  assert.equal(result.code,failStop?1:0,output);
  assert.equal((output.match(/REQUEST .*\/stop/g)||[]).length,1,output);
  assert.ok(output.includes('REQUEST https://didi.test/api/video-config GET NO_AUTH'),output);
  assert.ok(!output.includes('test-secret'),output);
  assert.ok(output.includes(failStop?'STOP FAILED':'Stop accepted'),output);
}
await scenario('SIGINT');
await scenario('SIGTERM');
await scenario('SIGINT',true);
await scenario('SIGTERM',false,true);
console.log('PASS: Ctrl+C, SIGTERM, interrupt during start, stop failure, key isolation and exactly-once cleanup');
