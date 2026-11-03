import numpy as np,json
from pathlib import Path
src=np.array([[0,0],[1,0],[1,1],[0,1]],float)
dst=np.array([[99,157],[956,160],[1012,481],[25,481]],float)
A=[];b=[]
for (x,y),(u,v) in zip(src,dst):
 A.extend([[x,y,1,0,0,0,-u*x,-u*y],[0,0,0,x,y,1,-v*x,-v*y]]);b.extend([u,v])
H=np.append(np.linalg.solve(A,b),1).reshape(3,3);inv=np.linalg.inv(H)
def measure(box):
 l,t,r,b=box;theta=np.linspace(0,2*np.pi,360,endpoint=False)
 p=np.vstack(((l+r)/2+(r-l)/2*np.cos(theta),(t+b)/2+(b-t)/2*np.sin(theta),np.ones(360)))
 q=inv@p;q=q[:2]/q[2]
 rx=(q[0].max()-q[0].min())/2;ry=(q[1].max()-q[1].min())/2
 ratio=ry/rx;sy=1.555*.65/(.5*ratio)
 return {'normalizedRadii':[rx,ry],'impliedPhysicalWidthDepth':ratio,'impliedScaleY':sy,'normalizedCenter':q.mean(axis=1).tolist()}
result={'corners':dst.tolist(),'arm':measure([822,251,894,307]),'silverGuard':measure([290,353,404,451]),'currentPhysicalWidthDepth':1.555*.65/(.5*.74),'currentScaleY':.74,'limitations':'Manual axis-aligned ellipse bounds. Arm plane closest to face; elevated torus guard less reliable due thickness/parallax. Reference image lens distortion and ellipse tilt unknown.'}
print(json.dumps(result,indent=2));Path('qa/helm-reference-review/plane-ratio-diagnostic.json').write_text(json.dumps(result,indent=2))
