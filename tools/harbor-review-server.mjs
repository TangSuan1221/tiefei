import {createServer} from 'vite';
// Long playtests must not reset to the title screen when artists save a module.
const server=await createServer({server:{host:'127.0.0.1',port:5174,strictPort:true,hmr:false}});
await server.listen();server.printUrls();
