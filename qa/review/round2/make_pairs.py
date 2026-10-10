"""Blind side-by-side pairs: ours vs AAA/high-AA reference, matched by filename keyword."""
import io, json, os, random
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.abspath(__file__))
PROJ = os.path.abspath(os.path.join(ROOT, '..', '..', '..'))
ENV = os.path.join(PROJ, 'qa', 'living', 'env-r3', 'r3')
HERO = os.path.join(PROJ, 'qa', 'living', 'hero-r3', 'shots')
REF = os.path.join(PROJ, 'qa', 'reference', 'aaa')
OUT = os.path.join(ROOT, 'pairs')
os.makedirs(OUT, exist_ok=True)

# (category, our-file keyword, our dir, reference file)
PLAN = [
    ('corridor', '02-corridor-C1', ENV, 'stillwakes_07.jpg'),
    ('corridor', '04-C1-east-end', ENV, 'soma_08.jpg'),
    ('corridor', '05-C2-end', ENV, 'deadspace_07.jpg'),
    ('corridor', '25-C3-long', ENV, 'bunker_01.jpg'),
    ('corridor', '18-live-corridor', ENV, 'soma_09.jpg'),
    ('atrium', '11-atrium-wide', ENV, 'bioshock_03.jpg'),
    ('atrium', '12-atrium-floor', ENV, 'bioshock2_01.jpg'),
    ('atrium', '13-atrium-east', ENV, 'bioshock_04.jpg'),
    ('atrium', '19-live-atrium', ENV, 'subnautica2_02.jpg'),
    ('atrium', '20-atrium-north-shops', ENV, 'bioshock2_05.jpg'),
    ('machinery', '08-ballast-R4', ENV, 'deadspace_02.jpg'),
    ('prop-closeup', 'h03-valves', HERO, 'soma_05.jpg'),
    ('room', '07-security-R3', ENV, 'stillwakes_04.jpg'),
    ('room', '14-office-R5', ENV, 'stillwakes_12.jpg'),
    ('prop-closeup', 'h07-office-z1', HERO, 'bunker_05.jpg'),
    ('corpse', '23-probe-cocoon', ENV, 'stillwakes_01.jpg'),
    ('slime', '24-probe-slime-wall', ENV, 'deadspace_10.jpg'),
    ('creature', 'k7-swarm', HERO, 'deadspace_03.jpg'),
    ('signage', 'h22-code-legal-31', HERO, 'soma_02.jpg'),
    ('room', '17-laundry-R1', ENV, 'bioshock2_03.jpg'),
    ('shaft', '01-shaft-S', ENV, 'stillwakes_06.jpg'),
    ('viewport', '03-solarium-C1', ENV, 'soma_07.jpg'),
    ('door', '16-C7-D', ENV, 'deadspace_06.jpg'),
    ('figure', 'h08-office-z2', HERO, 'deadspace_05.jpg'),
]


def find(d, key):
    hits = [f for f in os.listdir(d) if f.startswith(key) and f.endswith('.png') and 'crop' not in f]
    hits.sort(key=len)
    return os.path.join(d, hits[0])


def prep(path):
    im = Image.open(path).convert('RGB')
    w, h = im.size
    tw, th = (w, round(w * 9 / 16)) if w * 9 <= h * 16 else (round(h * 16 / 9), h)
    l, t = (w - tw) // 2, (h - th) // 2
    im = im.crop((l, t, l + tw, t + th)).resize((960, 540), Image.LANCZOS)
    # identical masks on both sides: logo corners (Subnautica TR, Narcosis BL) + HUD/subtitle band
    dr = ImageDraw.Draw(im)
    dr.rectangle((960 - 170, 0, 960, 60), fill=(0, 0, 0))
    dr.rectangle((0, 540 - 70, 190, 540), fill=(0, 0, 0))
    dr.rectangle((300, 540 - 34, 660, 540), fill=(0, 0, 0))
    buf = io.BytesIO()
    im.save(buf, 'JPEG', quality=82)
    buf.seek(0)
    return Image.open(buf).convert('RGB')


rng = random.Random(20261009)
answers = {}
try:
    font = ImageFont.truetype('arial.ttf', 28)
except OSError:
    font = ImageFont.load_default()
for i, (cat, key, d, ref) in enumerate(PLAN, 1):
    ours = find(d, key)
    a, b = prep(ours), prep(os.path.join(REF, ref))
    ours_left = rng.random() < 0.5
    left, right = (a, b) if ours_left else (b, a)
    canvas = Image.new('RGB', (1940, 580), (40, 40, 40))
    canvas.paste(left, (0, 40))
    canvas.paste(right, (980, 40))
    dr = ImageDraw.Draw(canvas)
    dr.text((10, 4), 'A', fill=(255, 255, 255), font=font)
    dr.text((990, 4), 'B', fill=(255, 255, 255), font=font)
    name = f'pair_{i:02d}.jpg'
    canvas.save(os.path.join(OUT, name), 'JPEG', quality=85)
    answers[name] = {'category': cat, 'ours': 'A' if ours_left else 'B',
                     'ours_file': os.path.relpath(ours, PROJ), 'ref_file': ref}

with open(os.path.join(ROOT, 'answers.json'), 'w', encoding='utf-8') as f:
    json.dump(answers, f, ensure_ascii=False, indent=2)
print('pairs:', len(answers))
