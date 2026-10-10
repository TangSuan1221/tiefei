import io, json, random
from PIL import Image, ImageDraw

OURS = "qa/living/world/"
REF = "qa/reference/aaa/"
OUT = "qa/review/round1/"
PAIRS = [
    ("02-corridor-C1.png", "stillwakes_07.jpg", "corridor"),
    ("30-live-corridor.png", "deadspace_07.jpg", "corridor"),
    ("11-atrium-wide.png", "bioshock_03.jpg", "atrium"),
    ("12-atrium-floor.png", "bioshock2_01.jpg", "atrium"),
    ("10-valves-V.png", "soma_05.jpg", "machinery"),
    ("06-security-R3.png", "soma_07.jpg", "control-room"),
    ("08-glass-G.png", "stillwakes_05.jpg", "glass-door"),
    ("22-probe-cocoon.png", "deadspace_05.jpg", "corpse"),
    ("20-probe-slime-M-1.png", "deadspace_10.jpg", "slime-contamination"),
    ("21-probe-slime-M-0.png", "stillwakes_03.jpg", "slime-contamination"),
    ("25-creature-lumen.png", "deadspace_06.jpg", "creature"),
    ("28-creature-blind.png", "deadspace_03.jpg", "creature"),
    ("29-creature-swarm-lamp.png", "soma_08.jpg", "creature/particles"),
    ("14-placard-R5.png", "soma_02.jpg", "signage"),
    ("15-delroy-R5.png", "stillwakes_04.jpg", "notice-board"),
    ("18-probe-alex-glass.png", "deadspace_09.jpg", "character"),
    ("04-laundry-R1.png", "bioshock2_03.jpg", "prop-room"),
    ("19-probe-pipe-bands.png", "soma_06.jpg", "murky-particles"),
]
W, H = 960, 540


def norm(path):
    im = Image.open(path).convert("RGB")
    w, h = im.size
    tw, th = (w, round(w * 9 / 16)) if w / h < 16 / 9 else (round(h * 16 / 9), h)
    l, t = (w - tw) // 2, (h - th) // 2
    im = im.crop((l, t, l + tw, t + th)).resize((W, H), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, "JPEG", quality=85)
    return Image.open(io.BytesIO(buf.getvalue())).convert("RGB")


rng = random.Random(20261009)
answers = []
for i, (ours, ref, cat) in enumerate(PAIRS, 1):
    a, b = norm(OURS + ours), norm(REF + ref)
    ours_left = rng.random() < 0.5
    left, right = (a, b) if ours_left else (b, a)
    canvas = Image.new("RGB", (W * 2 + 16, H + 30), (20, 20, 20))
    canvas.paste(left, (0, 30))
    canvas.paste(right, (W + 16, 30))
    d = ImageDraw.Draw(canvas)
    d.text((8, 8), f"pair {i:02d}  LEFT = A", fill=(230, 230, 230))
    d.text((W + 24, 8), "RIGHT = B", fill=(230, 230, 230))
    canvas.save(f"{OUT}pair-{i:02d}.png")
    answers.append({"pair": i, "category": cat, "ours": ours, "reference": ref,
                    "oursSide": "A(left)" if ours_left else "B(right)"})
json.dump({"seed": 20261009, "pairs": answers}, open(OUT + "answers.json", "w", encoding="utf-8"),
          ensure_ascii=False, indent=2)
print("done", len(answers))
