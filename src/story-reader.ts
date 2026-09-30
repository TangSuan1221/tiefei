import mainStory from '../docs/story-split-route-2026-09-30.md?raw';
import alternateScenes from '../docs/story-alternate-scenes.md?raw';
import designNotes from '../docs/story-branch-design-2026-09-30.md?raw';
const view=new URLSearchParams(location.search).get('view');
const story=view==='branches'?alternateScenes:view==='design'?designNotes:mainStory;
import './story-reader.css';

const root=document.querySelector<HTMLDivElement>('#app')!;
const header=document.createElement('header');
header.innerHTML='<span>迟到的目击者</span><a href="/narrative.html" target="_top">剧情工具</a>';
const notice=document.createElement('p');notice.className='notice';
notice.textContent=view==='branches'?'分支场景 · 其他选择对应的经历':view==='design'?'制作资料 · 保留因果与机制说明，非小说正文':'五章正文';
const layout=document.createElement('div');layout.className='reading-layout';
const nav=document.createElement('nav');nav.setAttribute('aria-label','章节目录');
const article=document.createElement('article');
// Render only this repository-owned Markdown subset. All text remains text nodes.
function inline(parent:HTMLElement,text:string){
 const chunks=text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
 for(const chunk of chunks){
  if(chunk.startsWith('**')&&chunk.endsWith('**')){const b=document.createElement('strong');b.textContent=chunk.slice(2,-2);parent.append(b);}
  else if(chunk.startsWith('`')&&chunk.endsWith('`')){const code=document.createElement('code');code.textContent=chunk.slice(1,-1);parent.append(code);}
  else parent.append(document.createTextNode(chunk));
 }
}
let paragraph:string[]=[],quote:string[]=[],table:string[]=[],headingIndex=0;
function flush(){
 if(paragraph.length){const p=document.createElement('p');inline(p,paragraph.join(' '));article.append(p);paragraph=[];}
 if(quote.length){const block=document.createElement('blockquote');for(const line of quote){if(!line)continue;const p=document.createElement('p');inline(p,line);block.append(p);}article.append(block);quote=[];}
 if(table.length){const wrap=document.createElement('div');wrap.className='table-wrap';const el=document.createElement('table');table.forEach((line,index)=>{if(/^\|[\s:|\-]+\|$/.test(line))return;const row=document.createElement('tr');line.slice(1,-1).split('|').forEach(cell=>{const c=document.createElement(index===0?'th':'td');inline(c,cell.trim());row.append(c);});el.append(row);});wrap.append(el);article.append(wrap);table=[];}
}
for(const line of story.replace(/\r/g,'').split('\n')){
 const heading=line.match(/^(#{1,3}) (.+)$/);
 if(heading){flush();const level=heading[1].length;const el=document.createElement(`h${level}`);el.id=`section-${headingIndex++}`;el.textContent=heading[2];article.append(el);if(level===2){const a=document.createElement('a');a.href=`#${el.id}`;a.textContent=heading[2];nav.append(a);}continue;}
 if(line.startsWith('>')){if(paragraph.length||table.length)flush();quote.push(line.replace(/^> ?/,''));continue;}
 if(line.startsWith('|')){if(paragraph.length||quote.length)flush();table.push(line);continue;}
 if(!line.trim()){flush();continue;}
 if(quote.length||table.length)flush();paragraph.push(line);
}
flush();layout.append(nav,article);root.append(header,notice,layout);
