"""Numerical patch measurements only; does not alter the reference or output images."""
import sys, json, statistics
from pathlib import Path
from PIL import Image

folder=Path(sys.argv[1] if len(sys.argv)>1 else 'qa/helm-reference-review/round8')
patches={'left_panel':(255,166,450,192),'middle_panel':(500,164,690,192),'front_lip':(410,504,650,527),'shutter_cap':(592,374,624,406),'red_lamp':(46,108,63,135),'amber_lamp':(592,198,607,215)}
files=[Path('qa/helm-reference-review/reference.png'),folder/'reference-angle.png',*sorted(folder.glob('light-*.png')),*sorted(folder.glob('front-*.png')),*sorted(folder.glob('red-opacity*.png'))]
result={}
diagnostics=json.loads((folder/'diagnostics.json').read_text(encoding='utf8')) if (folder/'diagnostics.json').exists() else {}
for path in files:
    if not path.exists(): continue
    image=Image.open(path).convert('RGB').resize((1024,572),Image.Resampling.LANCZOS)
    measurements={}
    sample_boxes=dict(patches)
    for name,control,target in [('red_lamp_core','helm-port-warning-lens',(54,123)),('amber_lamp_core','helm-amber-lens',(600,206))]:
        projected=diagnostics.get('projectedControls',{})
        center=target if path.name=='reference.png' else projected.get(control,projected.get('helm-lamp-indicator',{}) if control=='helm-amber-lens' else {}).get('center')
        if center:
            x,y=center;radius=3 if 'amber' in name else 5
            sample_boxes[name]=(round(x-radius),round(y-radius),round(x+radius),round(y+radius))
    for name,box in sample_boxes.items():
        pixels=list(image.crop(box).getdata()); channels=list(zip(*pixels)); luma=sorted(.2126*r+.7152*g+.0722*b for r,g,b in pixels)
        measurements[name]={'median_rgb':[round(statistics.median(c),1) for c in channels], 'median_luma':round(statistics.median(luma),1),'luma_p10':round(luma[int(len(luma)*.1)],1),'luma_p90':round(luma[int(len(luma)*.9)],1)}
    result[path.name]=measurements
(folder/'patch-measurements.json').write_text(json.dumps(result,indent=2),encoding='utf8')
print(json.dumps(result,indent=2))

