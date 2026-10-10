"""Contact sheets of our r3 shots (post-blind) + duplicate-frame check + luma stats."""
import hashlib, json, os
import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.abspath(__file__))
PROJ = os.path.abspath(os.path.join(ROOT, '..', '..', '..'))
ENV = os.path.join(PROJ, 'qa', 'living', 'env-r3', 'r3')
HERO = os.path.join(PROJ, 'qa', 'living', 'hero-r3', 'shots')
files = [os.path.join(ENV, f) for f in sorted(os.listdir(ENV)) if f.endswith('.png')]
files += [os.path.join(HERO, f) for f in sorted(os.listdir(HERO))
          if f.endswith('.png') and not any(k in f for k in ('crop', '-x', 'debug'))]

stats, thumbs = {}, []
for p in files:
    im = Image.open(p).convert('RGB')
    a = np.asarray(im.resize((480, 270)), dtype=np.float32) / 255
    y = a @ np.array([0.2126, 0.7152, 0.0722])
    small = np.asarray(im.convert('L').resize((32, 18)), dtype=np.float32)
    stats[os.path.basename(p)] = {
        'mean_luma': round(float(y.mean()), 3),
        'pct_black(<0.03)': round(float((y < 0.03).mean()), 3),
        'pct_clip(>0.95)': round(float((y > 0.95).mean()), 4),
        'sat_mean': round(float((a.max(2) - a.min(2)).mean()), 3),
        'md5': hashlib.md5(im.tobytes()).hexdigest()[:10],
        '_sig': small,
    }
    t = im.resize((480, 270))
    ImageDraw.Draw(t).text((6, 6), os.path.basename(p), fill=(255, 255, 0))
    thumbs.append(t)

names = list(stats)
dups = []
for i in range(len(names)):
    for j in range(i + 1, len(names)):
        d = float(np.abs(stats[names[i]]['_sig'] - stats[names[j]]['_sig']).mean())
        if d < 4:
            dups.append([names[i], names[j], round(d, 2)])
for v in stats.values():
    v.pop('_sig')

for k in range(0, len(thumbs), 12):
    sheet = Image.new('RGB', (480 * 3, 270 * 4))
    for n, t in enumerate(thumbs[k:k + 12]):
        sheet.paste(t, ((n % 3) * 480, (n // 3) * 270))
    sheet.save(os.path.join(ROOT, f'contact_ours_{k // 12}.jpg'), quality=85)

json.dump({'stats': stats, 'near_duplicates': dups}, open(os.path.join(ROOT, 'stats.json'), 'w'), indent=1)
print(json.dumps(dups, indent=1))
for n, v in stats.items():
    print(n, v['mean_luma'], v['pct_black(<0.03)'], v['pct_clip(>0.95)'], v['sat_mean'])
