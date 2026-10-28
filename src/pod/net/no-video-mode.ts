/** Dependency-free guard shared by network and UI. */
export function isLocalNoVideoMode():boolean {try{return sessionStorage.getItem('ironlung.gm.novideo')==='1';}catch{return false;}}
