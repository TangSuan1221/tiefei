(async()=>{const list=await(await fetch('http://127.0.0.1:9229/json/list')).json();const ws=new WebSocket(list[0].webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);ws.onmessage=e=>{console.log(e.data);ws.close();};ws.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{expression:process.argv[2],awaitPromise:true}}));})();

