import type {CreatureType} from './living-deck-layout';

/**
 * Generated-footage appearance, text only. Reference frames never contain these
 * creature models, so this text is the sole authority for what the video model draws.
 * Keep docs/video-prompts (VR-110) and src/narrative-lab/prompt-library.json in step.
 */
export type VideoCreatureKind = 'harbor' | CreatureType;

export const VIDEO_CREATURES: Record<VideoCreatureKind, string> = {
 harbor:
  'abyssal Lovecraftian deep-sea organism that was once roughly human-sized. Pressure-softened, translucent bone-pale skin with dark veins visible beneath; scraps of grey work overalls are sunk into the flesh. ' +
  'Twisted narrow torso and disproportionately long arms ending in three long webbed fingers joined by filmy fin membranes. Ragged translucent fin rays run down its spine; gill slits along the neck and ribs slowly open and close. ' +
  'It has no legs: the lower body tapers into a soft, boneless, fin-fringed trailing mass. The head droops forward; the face is slack and eerily calm, with small clouded deep-sea eyes. ' +
  'It hangs in the water and glides, or pulls itself along steel with its long hands; it never stands, walks or crawls.',
 lumen:
  'abyssal Lovecraftian deep-sea organism grown from a human resident. Elongated pale humanoid upper body in a drifting, waterlogged robe; faint pale bioluminescent points glow beneath translucent skin. ' +
  'Below the waist the legs have dissolved into long soft trailing tissue that ripples like a jellyfish margin. Its face always turns toward the strongest light. It floats upright and drifts slowly; it never walks.',
 shade:
  'abyssal deep-sea eel-form, about 5 metres long. Translucent ribbon body with a continuous filmy fin along back and belly, a row of gill slits and two forward-pointing tubular eyes. ' +
  'It undulates through the water and, under strong light, knots itself into a tight coil.',
 blind:
  'abyssal Lovecraftian deep-sea hunter, about 3 metres long. Huge blunt eyeless skull on a fast-tapering body, underslung open jaw with long irregular needle teeth past the lips, a line of lateral-line pores along each flank, ' +
  'a crest of uneven dorsal spines, fleshy pectoral flaps and a tall caudal fin. It swims with slow tail sweeps; it has no legs and no eyes.',
 swarm:
  'ordinary deep-sea fauna: a loose school of small transparent glass fish mixed with pale amphipods, each tiny and catalogued, drifting toward light.',
};

export function videoCreatureSubject(kind: VideoCreatureKind, label: string): string {
 return `${label}: ${VIDEO_CREATURES[kind]} Generate it in the recorded scene; it is intentionally absent from the reference image.`;
}
