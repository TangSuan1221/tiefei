from pathlib import Path
from PIL import Image, ImageDraw
import json
root=Path('qa/living-survey/round15-overall-independent')
old=Path('qa/living-2026-10-27/anonymous-round10-live')
key=json.loads((old/'key.json').read_text(encoding='utf-8-sig'))
for number,record in key.items():
    original=Image.open(old/f'pair-{number}.png').convert('RGB')
    assert original.size==(1920,720)
    reference=original.crop((960,0,1920,720)) # Complete old reference panel, including original letterbox.
    reference.save(root/f'reference-{record["local"]}.png')
    for mode in ['live','film']:
        local=Image.open(root/f'{record["local"]}-{mode}.png').convert('RGB')
        local.thumbnail((960,694),Image.Resampling.LANCZOS)
        pair=Image.new('RGB',(1920,720),(17,17,17))
        pair.paste(local,((960-local.width)//2,26+(694-local.height)//2))
        pair.paste(reference,(960,0))
        ImageDraw.Draw(pair).text((0,3),f'A - Round15 current {mode}',fill='white')
        pair.save(root/f'compare-{record["local"]}-{mode}.png')
(root/'comparison-sources.json').write_text(json.dumps({'sources':key,'method':'Original complete reference panels from saved pair right halves; no scene crop, stretch, exposure/color adjustment, or new download. Both sides 960x720 with aspect-preserving letterbox. Current source 1024x720. Reference content 960x540 from old pairs. Identity known; not blinded.'},ensure_ascii=False,indent=2),encoding='utf-8')
