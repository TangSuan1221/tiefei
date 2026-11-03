/** User supplied chapter-one assets, 2026-11-02. Never use these as evidence. */
export const HARBOR_REFERENCE_REVISION='2026-11-02-v1';
export const HARBOR_REFERENCES={
 character:'/assets/harbor/references/elias-character.png',
 story:'/assets/harbor/references/elias-story.png',
 scene:'/assets/harbor/references/dispatch-room.png',
 creature:'/assets/harbor/references/harbor-creature.png',
} as const;
export const HARBOR_TASK_REFERENCES=[
 {url:HARBOR_REFERENCES.character,description:'Elias identity and equipment only. One sealed yellow helmet, opaque visor, black drysuit and tan harness. Ignore sheet labels and multiple views.'},
 {url:HARBOR_REFERENCES.scene,description:'Central dispatch room architecture and materials. Use this room only when LOCATION specifies dispatch; for the safe passage retain only matching materials. Do not invent the pictured submarine at the current location.'},
] as const;
export const HARBOR_CREATURE_REFERENCES=[{url:HARBOR_REFERENCES.creature,description:'Harbor creature anatomy only: fused head mass, trailing organic strands and industrial hoses. Multiple sheet views depict ONE creature. Override older generic anatomy descriptions, but preserve the shot subject count, distance, occlusion and actions. Do not copy labels or white background; do not add this creature to an empty subject list.'}] as const;
