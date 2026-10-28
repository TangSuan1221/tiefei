import json
from pathlib import Path
p=Path('qa/living-survey/round16-third-light-performance')
d=json.loads((p/'performance.json').read_text())
def q(xs,f):
    xs=sorted(x for x in xs if x is not None)
    return xs[min(len(xs)-1,int(len(xs)*f))] if xs else None
rows=[]
for r in d['rows']:
    rows.append({'round':r['round'],'enabled':r['enabled'],'samples':len(r['samples']),**{k:{'p50':q([s.get(k) for s in r['samples']],.5),'p95':q([s.get(k) for s in r['samples']],.95)} for k in ['cpu','delta','gpuMs','calls','triangles']},'memory':r['memory'],'programs':r['programs']})
(p/'summary.json').write_text(json.dumps({'renderer':d['renderer'],'gpuTimer':d['gpuTimer'],'contention':d['contention'],'rows':rows},indent=2))
print(json.dumps(rows,indent=2))
