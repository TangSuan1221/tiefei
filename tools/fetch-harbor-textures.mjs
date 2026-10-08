import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const folder='public/assets/deepsea/pbr';await mkdir(folder,{recursive:true});
const records=[];
for(const id of ['rusty_metal_sheet','metal_plate']){
 const response=await fetch(`https://api.polyhaven.com/files/${id}`);if(!response.ok)throw new Error(`Metadata: ${response.status}`);
 const metadata=await response.json();
 for(const channel of ['diff','nor_gl','rough']){
  const key=channel==='diff'?'Diffuse':channel==='rough'?'Rough':channel;
  const entry=metadata[key]?.['2k']?.jpg;if(!entry?.url)throw new Error(`Missing ${id} ${channel}`);
  const url=new URL(entry.url);if(!['dl.polyhaven.org','dl.polyhaven.com'].includes(url.hostname))throw new Error('Unexpected download host');
  const response=await fetch(url);if(!response.ok)throw new Error(`Asset: ${response.status}`);
  const bytes=Buffer.from(await response.arrayBuffer());const path=`${folder}/${id}_${channel}_2k.jpg`;await writeFile(path,bytes);
  records.push({id,channel,path,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),source:entry.url,license:'CC0',assetPage:`https://polyhaven.com/a/${id}`});
 }
}
await writeFile(`${folder}/sources.json`,JSON.stringify(records,null,2));console.log(JSON.stringify(records,null,2));
