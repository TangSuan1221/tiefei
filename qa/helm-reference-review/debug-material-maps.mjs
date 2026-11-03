import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const dir=`qa/helm-reference-review/material-debug-${process.argv[2]??'current'}`;
await mkdir(dir,{recursive:true});
const browser=await chromium.launch({channel:'msedge',headless:true});
try {
 const page=await browser.newPage();await page.goto('http://127.0.0.1:5192');
 const maps=await page.evaluate(async()=>{
  const {createHelmMaterials}=await import('/src/pod/view/cabin-helm-materials.ts');
  const textures=[],m=createHelmMaterials(textures);
  return {damage:textures.find(t=>t.name==='helm-front-lip-unique-damage').image.toDataURL(),micro:m.frontLip.map.image.toDataURL()};
 });
 for(const [name,data] of Object.entries(maps))await writeFile(`${dir}/${name}.png`,Buffer.from(data.split(',')[1],'base64'));
 console.log(dir);
}finally{await browser.close();}
