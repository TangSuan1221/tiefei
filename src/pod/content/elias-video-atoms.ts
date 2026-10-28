/** Authored NPC camera atoms; astronaut-like framing, never a space setting. */
export const ELIAS_SELFIE_ATOMS = Object.freeze({
 viewpoint: 'ELIAS SELFIE CAMERA: One continuous first-person self-recorded mission message, like an astronaut holding a camera at arm length and looking back into its lens. Elias is the person filming, not a third-person cameraman.',
 framing: 'Wide-angle helmet-and-torso close-up, gloved forearm at a lower corner; task evidence beside him, doorway over his shoulder.',
 motion: 'Restrained natural hand sway only. He may make a small deliberate wrist turn to show the stated task evidence, then return to himself. No cuts, orbit, cinematic tracking, zoom or external reverse shot.',
 identity: 'Same reference diving helmet, dark visor, dry suit and harness. Astronaut-like framing only; no spacesuit, outer space or zero gravity.',
 continuity: 'Preserve the referenced task location and its current dry or flooded state. Do not add people, reveal hidden information, or change the authored action or outcome.'
});
export const ELIAS_SELFIE_CONTRACT=Object.values(ELIAS_SELFIE_ATOMS).join('\n');
export const ELIAS_TASK_PLATES:Readonly<Record<string,string>>=Object.freeze({
 'L3-E01':'quarantine','L3-E02':'quarantine','L3-E03':'lab','L3-E04':'pit','L3-E05':'pit','L3-E05B':'pit','L3-E05C':'pit','L3-E06':'plant','L3-E07':'plant','L3-E08':'prep','L3-E09':'gallery','L3-E10':'gallery','L3-E11':'shaft'
});
export function eliasTaskReference(shotId:string,partIndex=0):string {
 const place=ELIAS_TASK_PLATES[shotId];
 if(!place)throw Error('Missing Elias task reference: '+shotId);
 return '/assets/abyssal/plates/'+(shotId==='L3-E10'&&partIndex>0?'table':place)+'.png';
}
