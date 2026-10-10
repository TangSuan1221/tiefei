# -*- coding: utf-8 -*-
"""评审用联系表（盲测完成后才生成）+ 全量统计（我方各组 vs AAA/高端AA参照）。"""
import glob, json, os, sys
from PIL import Image, ImageDraw, ImageFont
sys.path.insert(0, os.path.dirname(__file__))
from blind import prep, stats, ROOT, OUT
import numpy as np

GROUPS = {
    'env': sorted(glob.glob(os.path.join(ROOT, 'qa/living/render-r5/r3/*.png'))),
    'creature': sorted(glob.glob(os.path.join(ROOT, 'qa/living/creatures-r4/round6/*.png'))) +
        [p for p in sorted(glob.glob(os.path.join(ROOT, 'qa/living/creatures-r4/round5/*.png')))
         if not os.path.exists(os.path.join(ROOT, 'qa/living/creatures-r4/round6', os.path.basename(p)))],
    'hero': [p for p in sorted(glob.glob(os.path.join(ROOT, 'qa/living/hero-r4/r5/*.png'))) if '-crop' not in p],
    'flow': sorted(glob.glob(os.path.join(ROOT, 'qa/living/flow-r2/flow/*.png')) +
                   glob.glob(os.path.join(ROOT, 'qa/living/flow-r2/flow/*.jpg'))),
}
REF_GAMES = ('deadspace_', 'bioshock_', 'bioshock2_')
HIGH_AA = ('soma_', 'stillwakes_', 'bunker_', 'subnautica2_', 'underwaves_')
refdir = os.path.join(ROOT, 'qa/reference/aaa')
GROUPS['ref_AAA'] = sorted(p for p in glob.glob(refdir + '/*.jpg') if os.path.basename(p).startswith(REF_GAMES))
GROUPS['ref_highAA'] = sorted(p for p in glob.glob(refdir + '/*.jpg') if os.path.basename(p).startswith(HIGH_AA))

font = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 18)
os.makedirs(os.path.join(OUT, 'sheets'), exist_ok=True)
allstats = {}
for g, files in GROUPS.items():
    rows = []
    for f in files:
        rows.append({'file': os.path.relpath(f, ROOT).replace('\\', '/'), **stats(prep(f))})
    keys = ['sat_mean', 'luma_p99', 'luma_mean', 'dark_ratio', 'clip_ratio']
    allstats[g] = {'n': len(rows), 'mean': {k: float(np.mean([r[k] for r in rows])) for k in keys}, 'items': rows}
    if g.startswith('ref'):
        continue
    for s in range(0, len(files), 9):
        sheet = Image.new('RGB', (1920, 1080), (20, 20, 20))
        d = ImageDraw.Draw(sheet)
        for j, f in enumerate(files[s:s + 9]):
            im = Image.open(f).convert('RGB'); im.thumbnail((640, 360))
            x, y = (j % 3) * 640, (j // 3) * 360
            sheet.paste(im, (x, y))
            d.rectangle((x, y, x + 400, y + 24), fill=(0, 0, 0))
            d.text((x + 4, y + 1), os.path.basename(f), fill=(255, 255, 0), font=font)
        sheet.save(os.path.join(OUT, 'sheets', f'{g}_{s // 9 + 1}.jpg'), quality=88)
with open(os.path.join(OUT, 'metrics_all.json'), 'w', encoding='utf-8') as fp:
    json.dump(allstats, fp, ensure_ascii=False, indent=1)
for g, v in allstats.items():
    print(g, v['n'], {k: round(x, 3) for k, x in v['mean'].items()})
