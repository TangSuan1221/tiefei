import {loadEnv} from 'vite';
import fs from 'node:fs/promises';
const env=loadEnv('development',process.cwd(),'');
const spec=JSON.parse(await fs.readFile('src/pod/content/vance-voice.json','utf8'));
const performance=JSON.parse(await fs.readFile('src/pod/content/vance-performance.json','utf8'));
const response=await fetch('https://llm-proxy.forgeax.com/v1/audio/speech',{
 method:'POST',headers:{Authorization:`Bearer ${env.LITELLM_KEY}`,'Content-Type':'application/json'},
 body:JSON.stringify({model:'auto',voice:'onyx',input:spec.lines[3],instructions:performance.direction+'\n'+performance.beats[3],response_format:'mp3'}),
 signal:AbortSignal.timeout(60000),
});
const type=response.headers.get('content-type');
if(response.ok&&type?.startsWith('audio/')){
 await fs.mkdir('qa/vance-voice/dramatic',{recursive:true});
 const data=Buffer.from(await response.arrayBuffer());await fs.writeFile('qa/vance-voice/dramatic/probe.mp3',data);
 console.log(JSON.stringify({status:response.status,type,bytes:data.length}));
}else{
 const body=await response.text();console.log(JSON.stringify({status:response.status,type,error:body.slice(0,1200).replace(/sk-[\w-]+/g,'[redacted]')}));process.exitCode=1;
}
