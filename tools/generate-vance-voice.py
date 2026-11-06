"""Generate the reviewed English Vance lines once; runtime plays bundled MP3s.

Requires edge-tts (pip install --target .tmp/voice-deps edge-tts).
Only the dialogue in vance-voice.json is sent to the speech service.
"""
import asyncio
import json
import sys
import argparse
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / '.tmp/voice-deps'))
import edge_tts

async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--spec', default='src/pod/content/vance-voice.json')
    args = parser.parse_args()
    spec = json.loads((ROOT / args.spec).read_text(encoding='utf-8'))
    folder = ROOT / 'public/assets/audio/vance' / spec['revision']
    folder.mkdir(parents=True, exist_ok=True)
    semaphore = asyncio.Semaphore(3)
    async def generate(index, line):
        async with semaphore:
            target = folder / f'{index:02d}.mp3'
            pending = target.with_suffix('.pending.mp3')
            rate = spec.get('rates', [spec['rate']] * len(spec['lines']))[index]
            for attempt in range(3):
                try:
                    await edge_tts.Communicate(line, spec['voice'], rate=rate).save(str(pending))
                    pending.replace(target)
                    print(f'{target.name}: {target.stat().st_size} bytes', flush=True)
                    break
                except Exception:
                    if attempt == 2:
                        raise
                    await asyncio.sleep(2)
    await asyncio.gather(*(generate(i, line) for i, line in enumerate(spec['lines'])))

if __name__ == '__main__':
    asyncio.run(main())
