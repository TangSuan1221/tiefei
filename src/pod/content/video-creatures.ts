import type {CreatureType} from './living-deck-layout';

/**
 * Generated-footage appearance. Environment captures exclude creature models;
 * the harbor anatomy sheet is authoritative for its appearance.
 * Keep docs/video-prompts (VR-110) and src/narrative-lab/prompt-library.json in step.
 */
export type VideoCreatureKind = 'harbor' | CreatureType;

export const VIDEO_CREATURES: Record<VideoCreatureKind, string> = {
 harbor:
  'Match the supplied Harbor creature anatomy reference: one fused mass of multiple human-like heads, dark reddish organic tissue, trailing organic strands intertwined with industrial hoses and metal fittings. ' +
  'The multiple views depict the same individual, not a group. Preserve the reference silhouette and materials; no single-headed humanoid torso, long paired arms, webbed fingers, dorsal fins or fish tail. ' +
  'It floats and drifts underwater with trailing strands; preserve only the recorded action, scale and occlusion. Do not infer its origin or identity.',
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
 return `${label}: ${VIDEO_CREATURES[kind]} Generate it in the recorded scene; it is intentionally absent from the environment image. Any supplied anatomy sheet remains authoritative.`;
}
