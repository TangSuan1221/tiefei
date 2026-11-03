export interface VideoReference {url:string;description:string}
/** Local assets must be embedded: upstream cannot read the player's localhost. */
export async function loadVideoReference(url:string,signal?:AbortSignal):Promise<string>{
 const response=await fetch(url,{signal});
 if(!response.ok||!response.headers.get('content-type')?.startsWith('image/png'))throw Error('Missing PNG video reference: '+url);
 const blob=await response.blob();
 return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(Error('Cannot read video reference: '+url));reader.readAsDataURL(blob);});
}
