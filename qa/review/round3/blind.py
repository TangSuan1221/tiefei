# -*- coding: utf-8 -*-
"""Round3 盲测：按文件名关键词配对，不预览我方截图。
左右顺序固定种子随机；统一 16:9 居中裁切、960x540、JPEG q=82 重编码、同位置遮角。"""
import io, json, os, random
from PIL import Image, ImageDraw, ImageFont
import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
OUT = os.path.join(ROOT, 'qa', 'review', 'round3')
PAIRS_DIR = os.path.join(OUT, 'pairs')
os.makedirs(PAIRS_DIR, exist_ok=True)

ENV = 'qa/living/render-r5/r3/'
CR6 = 'qa/living/creatures-r4/round6/'
CR5 = 'qa/living/creatures-r4/round5/'
HERO = 'qa/living/hero-r4/r5/'
FLOW = 'qa/living/flow-r2/flow/'
REF = 'qa/reference/aaa/'

# (类别, 我方, 参照)  参照仅取 AAA (deadspace/bioshock/bioshock2) 与高端 AA (soma/stillwakes/bunker/subnautica2/underwaves)
PAIRS = [
    ('走廊', ENV + '02-corridor-C1.png', 'deadspace_07.jpg'),
    ('走廊', ENV + '25-C3-long.png', 'stillwakes_07.jpg'),
    ('走廊', ENV + '18-live-corridor.png', 'soma_08.jpg'),
    ('走廊', ENV + '10-C5-south.png', 'bunker_01.jpg'),
    ('走廊', ENV + '16-C7-D.png', 'soma_09.jpg'),
    ('大厅', ENV + '11-atrium-wide.png', 'bioshock_03.jpg'),
    ('大厅', ENV + '19-live-atrium.png', 'bioshock_04.jpg'),
    ('大厅', ENV + '20-atrium-north-shops.png', 'bioshock2_03.jpg'),
    ('大厅', ENV + '12-atrium-floor.png', 'bioshock2_05.jpg'),
    ('房间', ENV + '14-office-R5.png', 'stillwakes_04.jpg'),
    ('房间', ENV + '07-security-R3.png', 'soma_07.jpg'),
    ('房间', ENV + '17-laundry-R1.png', 'stillwakes_12.jpg'),
    ('机械舱', ENV + '08-ballast-R4.png', 'soma_05.jpg'),
    ('机械舱', ENV + '09-C4-V.png', 'deadspace_02.jpg'),
    ('竖井/玻璃', ENV + '01-shaft-S.png', 'stillwakes_06.jpg'),
    ('竖井/玻璃', ENV + '03-solarium-C1.png', 'stillwakes_05.jpg'),
    ('标识', HERO + 'h22-code-legal-31.png', 'bioshock_02.jpg'),
    ('标识', HERO + 'h24-code-legal-oblique.png', 'soma_02.jpg'),
    ('生物', CR6 + 'k2-lumen-close.png', 'deadspace_08.jpg'),
    ('生物', CR6 + 'k4-shade-close.png', 'stillwakes_01.jpg'),
    ('生物', CR6 + 'r3-shade-half.png', 'deadspace_03.jpg'),
    ('生物', CR6 + 'r1-blind-half.png', 'deadspace_06.jpg'),
    ('生物', CR6 + 'g4-shade-gape.png', 'bioshock_05.jpg'),
    ('生物', CR5 + 'f2-shade-far.png', 'deadspace_01.jpg'),
    ('生物', CR5 + 'k7-swarm.png', 'soma_06.jpg'),
    ('尸体/茧', HERO + 'c2-cocoon-close.png', 'deadspace_05.jpg'),
    ('尸体/茧', HERO + 'c3-cocoon-side.png', 'stillwakes_10.jpg'),
    ('尸体/茧', HERO + 'c1-cocoon-probe.png', 'soma_03.jpg'),
    ('尸体/茧', ENV + '23-probe-cocoon.png', 'bunker_03.jpg'),
    ('黏液', HERO + 's5-slime-wall-east.png', 'stillwakes_03.jpg'),
    ('黏液', ENV + '24-probe-slime-wall.png', 'deadspace_10.jpg'),
    ('黏液', HERO + 's8-slime-corridor.png', 'bunker_02.jpg'),
    ('人物', HERO + 'a9-alex-meet-close.png', 'deadspace_09.jpg'),
    ('人物', HERO + 'p1-security-diver-close.png', 'bioshock2_02.jpg'),
    ('人物', HERO + 'p3-manager-close.png', 'soma_01.jpg'),
    ('游戏内HUD', FLOW + '03-c1-corridor.png', 'deadspace_04.jpg'),
    ('游戏内HUD', FLOW + '07-g-glass.png', 'underwaves_07.jpg'),
    ('游戏内HUD', FLOW + '04-probe-corpse-frame.jpg', 'subnautica2_04.jpg'),
    ('游戏内HUD', FLOW + 'lab-tape.securityLog.1.png', 'underwaves_03.jpg'),
    ('游戏内HUD', FLOW + '06-r4-shade-lamp.png', 'subnautica2_05.jpg'),
    ('游戏内HUD', FLOW + '12-gate-open.png', 'stillwakes_11.jpg'),
]

W, H = 960, 540
MASKS = [(W - 170, 0, W, 64), (0, H - 64, 170, H)]  # 右上 logo 角、左下 logo/字幕角


def prep(path):
    im = Image.open(path).convert('RGB')
    w, h = im.size
    if w / h > 16 / 9:
        nw = int(h * 16 / 9); x = (w - nw) // 2; im = im.crop((x, 0, x + nw, h))
    else:
        nh = int(w * 9 / 16); y = (h - nh) // 2; im = im.crop((0, y, w, y + nh))
    im = im.resize((W, H), Image.LANCZOS)
    buf = io.BytesIO(); im.save(buf, 'JPEG', quality=82); buf.seek(0)
    im = Image.open(buf).convert('RGB')
    d = ImageDraw.Draw(im)
    for m in MASKS:
        d.rectangle(m, fill=(0, 0, 0))
    return im


def stats(im):
    a = np.asarray(im).astype(np.float32) / 255.0
    mx = a.max(2); mn = a.min(2)
    sat = np.where(mx > 1e-4, (mx - mn) / np.maximum(mx, 1e-4), 0)
    y = 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]
    keep = np.ones_like(y, bool)
    for x0, y0, x1, y1 in MASKS:
        keep[y0:y1, x0:x1] = False
    yk = y[keep]
    # 饱和度只在可见像素(亮度>0.04)上算，避免黑像素把饱和度噪声拉偏
    vis = keep & (y > 0.04)
    return {
        'sat_mean': float(sat[vis].mean()) if vis.any() else 0.0,
        'luma_p99': float(np.percentile(yk, 99)),
        'luma_mean': float(yk.mean()),
        'dark_ratio': float((yk < 0.06).mean()),
        'clip_ratio': float((yk > 0.97).mean()),
    }


def main():
    rng = random.Random(20261009)
    answers, metrics = [], []
    for i, (cat, ours, ref) in enumerate(PAIRS, 1):
        op = os.path.join(ROOT, ours); rp = os.path.join(ROOT, REF, ref)
        if not os.path.exists(op):
            print('MISSING', op); continue
        oi, ri = prep(op), prep(rp)
        ours_left = rng.random() < 0.5
        L, R = (oi, ri) if ours_left else (ri, oi)
        canvas = Image.new('RGB', (W * 2 + 12, H + 34), (40, 40, 40))
        canvas.paste(L, (0, 34)); canvas.paste(R, (W + 12, 34))
        d = ImageDraw.Draw(canvas)
        try:
            f = ImageFont.truetype('C:/Windows/Fonts/msyh.ttc', 20)
        except Exception:
            f = ImageFont.load_default()
        d.text((8, 6), f'#{i:02d} {cat}   A', fill=(230, 230, 230), font=f)
        d.text((W + 20, 6), 'B', fill=(230, 230, 230), font=f)
        name = f'pair_{i:02d}.jpg'
        canvas.save(os.path.join(PAIRS_DIR, name), 'JPEG', quality=88)
        answers.append({'pair': i, 'category': cat, 'ours': ours, 'ref': ref,
                        'ours_side': 'A' if ours_left else 'B'})
        metrics.append({'pair': i, 'category': cat, 'ours': stats(oi), 'ref': stats(ri)})
    with open(os.path.join(OUT, 'answers.json'), 'w', encoding='utf-8') as fp:
        json.dump(answers, fp, ensure_ascii=False, indent=1)
    keys = ['sat_mean', 'luma_p99', 'luma_mean', 'dark_ratio', 'clip_ratio']
    agg = {s: {k: float(np.mean([m[s][k] for m in metrics])) for k in keys} for s in ('ours', 'ref')}
    with open(os.path.join(OUT, 'metrics.json'), 'w', encoding='utf-8') as fp:
        json.dump({'per_pair': metrics, 'mean': agg}, fp, ensure_ascii=False, indent=1)
    print('pairs', len(answers))


if __name__ == '__main__':
    main()
