export default async({page})=>page.evaluate(()=>({fb:window.__living.feedbackText,aim:window.__living.diag.aimed(),cam:{tilt:window.__pod.camTilt,pan:window.__pod.camPan}}));
