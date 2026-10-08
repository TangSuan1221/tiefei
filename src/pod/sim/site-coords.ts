/**
 * Player-facing site coordinates. X is the world X axis, Y is the world's horizontal Z axis,
 * and DEPTH replaces the vertical axis with metres below the surface (datum − world y).
 * Waypoints and positions stay in world space internally; only text and input use this frame.
 */
export const HARBOR_DATUM_DEPTH=1012;
export const COORD_AXES=['X','Y','DEPTH'] as const;

const num=(v:number)=>{const r=Math.round(v*10)/10;return Number.isInteger(r)?String(r):r.toFixed(1);};

export function displayCoords(world:readonly number[],datum=HARBOR_DATUM_DEPTH){
 return {x:world[0]!,y:world[2]!,depth:datum-world[1]!};
}
export function formatCoords(world:readonly number[],datum=HARBOR_DATUM_DEPTH){
 const c=displayCoords(world,datum);return `X${num(c.x)} Y${num(c.y)} DEPTH ${num(c.depth)}m`;
}
export function coordFields(world:readonly number[],datum=HARBOR_DATUM_DEPTH){
 const c=displayCoords(world,datum);return [num(c.x),num(c.y),num(c.depth)];
}
/** Converts keypad values [X, Y, DEPTH] back to a world-space [x, y, z] waypoint. */
export function worldFromFields(v:readonly number[],datum=HARBOR_DATUM_DEPTH):number[]{
 return [v[0]!,datum-v[2]!,v[1]!];
}
