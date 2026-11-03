import fs from 'node:fs';
// One-time migration: the reviewed document supplies the exact approved speech.
const doc=fs.readFileSync('docs/level-01-pipeline-revision-2026-10-28.md','utf8');
const sections=[...doc.matchAll(/^### (V\w+) \/ (L1-R28-V\w+)：(.+)\n([\s\S]*?)(?=^### |^## |$(?![\s\S]))/gm)];
const targets={V01:[11,0,16],V02:[11,0,16],V02A:[42,0,28],V03:[42,0,28],V03A:[42,0,28],V04:[42,0,28],V04R:[42,0,28],V05:[60,0,27],V06:[77,1,7],V07:[60,0,27],V07R:[60,0,27],V08:[60,0,27]};
const entries=[];
for(const [,short,id,title,body] of sections){
 const quotes=[...body.matchAll(/^> (.+)$/gm)].map(m=>m[1]);
 if(!quotes.length)throw Error(id);
 const entry=(key,speech)=>entries.push(`${JSON.stringify(key)}: task(${JSON.stringify(title)},${JSON.stringify(speech)},${JSON.stringify(targets[short])},${short==='V08'?'true':'false'}),`);
 entry(id,quotes[0]);
 if(short==='V03')entry(id+'-QUIET',quotes[1]);
 if(short==='V04R')entry(id+'-STORED',quotes[1]);
 if(short==='V08')entry(id+'-INJURED',quotes[0].replace('我们成功了。','我们成功了。这回关住了。我的肩膀包好了，还能走。'));
}
if(sections.length!==12)throw Error('Expected twelve reviewed nodes');
fs.writeFileSync('src/pod/content/harbor-r28-videos.ts',`// Approved 2026-10-28 dialogue. Speech is also the subtitle source.\nconst task=(title:string,speech:string,target:[number,number,number],safe=false)=>({title,line:speech,speech,target,place:safe?'a dry safe personnel passage beside the harbor control room':'a dry harbor central dispatch room, closed personnel door behind him',action:'He speaks urgently into his helmet camera, listening between sentences. Remain in the present; no flashback.'});\nexport const HARBOR_R28_TASKS={\n${entries.join('\n')}\n} as const;\nexport type HarborR28Id=keyof typeof HARBOR_R28_TASKS;\n`);
