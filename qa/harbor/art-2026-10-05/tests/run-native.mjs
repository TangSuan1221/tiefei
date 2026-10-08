import {registerHooks,stripTypeScriptTypes} from 'node:module';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
const root=new URL('../../../../',import.meta.url);
registerHooks({resolve(specifier,context,next){
 if(specifier.startsWith('@/'))specifier=new URL('src/'+specifier.slice(2),root).href;
 try{return next(specifier,context);}catch(error){
  if(specifier.startsWith('.')||specifier.startsWith('file:')){for(const suffix of ['.ts','/index.ts'])try{return next(specifier+suffix,context);}catch{}}
  throw error;
 }
},load(url,context,next){if(url.endsWith('.ts'))return{format:'module',source:stripTypeScriptTypes(readFileSync(new URL(url),'utf8'),{mode:'transform'}),shortCircuit:true};return next(url,context);}});
for(const name of ['harbor-rescue-check','harbor-rescue-navigation-check','harbor-navigation-check'])await import(new URL('tools/'+name+'.ts',root));
