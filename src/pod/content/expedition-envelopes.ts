/** Passage dimensions describe real clear hull volumes, not a visual scaling trick.
 * Heights are world Y; all decks are at -2m. Maintenance links compress the
 * player between the larger working spaces, while cargo/power links expand. */
export const EXPEDITION_ENVELOPES = [
  { widths:[5.2,2.8,4.4], ceilings:[3.4,1.7,2.8], panel:[1.4,3.2], door:'cargo' },
  { widths:[3.2,2.6,3.8], ceilings:[2.0,1.4,2.6], panel:[.85,1.2], door:'pressure' },
  { widths:[2.4,3.0,3.6], ceilings:[4.8,2.1,3.6], panel:[1.9,.72], door:'insulated' },
  { widths:[2.4,3.2,2.8], ceilings:[1.1,1.6,1.3], panel:[.62,.62], door:'residential' },
  { widths:[6.2,3.8,5.4], ceilings:[5.8,2.8,4.6], panel:[3.6,4.2], door:'blast' },
  { widths:[2.7,3.3,2.5], ceilings:[2.7,2.2,1.8], panel:[1.15,3.6], door:'oval' },
  { widths:[2.6,4.2,5.6], ceilings:[2.0,3.8,5.2], panel:[4.8,5.5], door:'iris' },
] as const;

export function passageEnvelope(index:number,sector:number,a:number,b:number){
  const profile=EXPEDITION_ENVELOPES[index];
  const branch=a===6||b===6;
  const slot=branch?1:(a===1||b===1)?0:(sector+a+b)%3;
  return {width:profile.widths[slot],ceiling:profile.ceilings[slot]};
}
