"""Exercise real raw-terminal key events and recording shutdown without calling Daily."""
import json
import os
from pathlib import Path
import pty
import select
import subprocess
import tempfile
import time

with tempfile.TemporaryDirectory() as temp:
    target = str(Path(temp) / 'notes.jsonl')
    module = (Path(__file__).parent / 'recording-cli.mjs').resolve().as_uri()
    code = f'''
import {{ recordingCommand }} from {json.dumps(module)};
globalThis.fetch = async (url) => {{
 if(url.endsWith('/start')) return Response.json({{recordingId:'tty-recording'}});
 if(url.endsWith('/stop')) {{ console.log('STOP_REQUEST'); return Response.json({{status:'sent'}}); }}
 return Response.json({{status:'in-progress',start_ts:Math.floor(Date.now()/1000)-65}});
}};
await recordingCommand('run', {{room:'family',notes:{json.dumps(target)}}});
'''
    master, slave = pty.openpty()
    child = subprocess.Popen(['node', '--input-type=module', '-e', code], stdin=slave, stdout=slave, stderr=slave,
                             env={**os.environ, 'DAILY_API_KEY': 'test-key'})
    os.close(slave)
    output = b''
    def wait_for(needle):
        global output
        deadline = time.monotonic() + 8
        while needle not in output and time.monotonic() < deadline:
            if select.select([master], [], [], .1)[0]:
                try: output += os.read(master, 65536)
                except OSError: break
        assert needle in output, output.decode(errors='replace')
    try:
        wait_for(b'Press any key to mark')
        os.write(master, b' ')
        wait_for(b'Message: ')
        os.write(master, 'Family photo 👶\r'.encode())
        wait_for(b'Saved [')
        os.write(master, b'\x03')
        wait_for(b'Stop accepted')
        assert child.wait(timeout=3) == 0
        entries = [json.loads(line) for line in Path(target).read_text().splitlines()]
        assert entries[1]['message'] == 'Family photo 👶', entries
        assert entries[1]['seconds'] >= 65, entries
        assert output.count(b'STOP_REQUEST') == 1, output
        assert b'test-key' not in output
    finally:
        if child.poll() is None:
            child.kill()
            child.wait()
        os.close(master)
print('PASS: real TTY keypress -> timestamp -> Unicode message -> JSONL -> Ctrl+C stops once and exits')
