import {registerHooks} from 'node:module';
registerHooks({resolve(specifier, context, next){
 if(specifier.startsWith('@/'))specifier=new URL('../src/'+specifier.slice(2),import.meta.url).href;
 try{return next(specifier,context);}catch(error){if(specifier.startsWith('.')||specifier.startsWith('file:')){try{return next(specifier+'.ts',context);}catch{}try{return next(specifier+'/index.ts',context);}catch{}}throw error;}
}});
