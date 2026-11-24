/**
 * Turns the blockstates and block models of a resource pack into the faces of each block.
 *
 * A blockstate file names, for each state of a block, a model and a rotation. A model is a list of boxes
 * (elements) with a texture on each face, and can inherit from a parent model. The viewer needs one picture
 * for each block name, so one state is chosen for each block, and only the faces that turn toward the camera
 * (the top, the east side and the south side) are kept. Positions are in sixteenths of a block, x east,
 * y up, z south.
 *
 * Not handled: the `rescale` flag of element rotations, `uvlock`, weighted random variants (the first is
 * used), and blocks drawn by code instead of a model (chests, beds, signs, heads, banners, shulker boxes).
 */

/** A point or a direction. */
export type Vec3 = readonly [number, number, number];

/** One face of a block, ready to be drawn. */
export interface Face {
  /** Corners after all rotations: top left, top right, bottom right and bottom left of the texture. */
  readonly corners: readonly [Vec3, Vec3, Vec3, Vec3];
  /** The part of the texture shown, `[u1, v1, u2, v2]`, in sixteenths of the texture. */
  readonly uv: readonly [number, number, number, number];
  /** Quarter turns of the texture on the face. */
  readonly turns: number;
  /** Texture, as `namespace:path` without extension, for example `minecraft:block/stone`. */
  readonly texture: string;
  /** Colour (0xRRGGBB) the texture is multiplied by, or `null`. */
  readonly tint: number | null;
  /** Whether the face is darker on the sides, as Minecraft draws it. */
  readonly shaded: boolean;
}

/** What is drawn for one block name. */
export interface BlockModel {
  /** The faces turned toward the camera. */
  readonly faces: readonly Face[];
  /** Opacity of the whole block, 1 unless the block is translucent. */
  readonly alpha: number;
}

/** Gives the parsed JSON of a model, by id such as `minecraft:block/cube_all`. */
export type ModelSource = (id: string) => unknown;

const FOLIAGE = 0x77ab2f;
const GRASS = 0x91bd59;
const WATER = 0x3f76e4;
/** Direction toward the camera: a face is kept if its normal has a positive component along it. */
const TOWARD_CAMERA: Vec3 = [1, 1, 1];
const MAX_PARENTS = 16;
const FACE_NAMES = ['up', 'down', 'north', 'south', 'west', 'east'] as const;
type FaceName = (typeof FACE_NAMES)[number];

/** A box of a model. */
interface Element {
  from: Vec3;
  to: Vec3;
  rotation?: { origin: Vec3; axis: 'x' | 'y' | 'z'; angle: number };
  shade: boolean;
  faces: Partial<
    Record<FaceName, { uv?: number[]; texture: string; rotation: number; tintindex?: number }>
  >;
}

/** A model with its parents merged. */
interface ResolvedModel {
  elements: Element[];
  textures: Map<string, string>;
}

/**
 * Reads a field of an object.
 *
 * @param value - The object.
 * @param key - The field name.
 * @returns The field, or `undefined`.
 */
function field(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)[key]
    : undefined;
}

/**
 * Reads three numbers.
 *
 * @param value - A JSON value.
 * @returns The vector, or `undefined` if it is not an array of three numbers.
 */
function vec3(value: unknown): Vec3 | undefined {
  if (!Array.isArray(value) || value.length !== 3) return undefined;
  return value.every((n) => typeof n === 'number')
    ? ([value[0], value[1], value[2]] as Vec3)
    : undefined;
}

/**
 * Adds the default namespace to an id.
 *
 * @param id - An id with or without namespace.
 * @returns The id with its namespace.
 */
export function withNamespace(id: string): string {
  return id.includes(':') ? id : `minecraft:${id}`;
}

/**
 * Merges a model with its parents.
 *
 * The elements come from the nearest model that has some. A texture of a child replaces the one of its
 * parent with the same name.
 *
 * @param id - The model id.
 * @param source - Reads a model.
 * @returns The merged model, empty if the model is missing or built in.
 */
function resolveModel(id: string, source: ModelSource): ResolvedModel {
  const chain: unknown[] = [];
  let next: string | undefined = withNamespace(id);
  while (next && chain.length < MAX_PARENTS && !next.startsWith('minecraft:builtin/')) {
    const model = source(next);
    if (model === undefined) break;
    chain.push(model);
    const parent: unknown = field(model, 'parent');
    next = typeof parent === 'string' ? withNamespace(parent) : undefined;
  }

  const textures = new Map<string, string>();
  for (const model of [...chain].reverse()) {
    const own = field(model, 'textures');
    if (typeof own === 'object' && own !== null) {
      for (const [key, value] of Object.entries(own)) {
        // A texture is a path, or an object with the path in `sprite` (glass has `force_translucent` too).
        const path = typeof value === 'string' ? value : field(value, 'sprite');
        if (typeof path === 'string') textures.set(key, path);
      }
    }
  }
  const owner = chain.find((model) => Array.isArray(field(model, 'elements')));
  const raw = owner ? (field(owner, 'elements') as unknown[]) : [];
  return { elements: raw.map(parseElement).filter((e): e is Element => e !== undefined), textures };
}

/**
 * Reads an element of a model.
 *
 * @param raw - The JSON of the element.
 * @returns The element, or `undefined` if it has no valid box.
 */
function parseElement(raw: unknown): Element | undefined {
  const from = vec3(field(raw, 'from'));
  const to = vec3(field(raw, 'to'));
  if (!from || !to) return undefined;
  const faces: Element['faces'] = {};
  const rawFaces = field(raw, 'faces');
  for (const name of FACE_NAMES) {
    const face = field(rawFaces, name);
    const texture = field(face, 'texture');
    if (typeof texture !== 'string') continue;
    const uv = field(face, 'uv');
    const rotation = field(face, 'rotation');
    const tintindex = field(face, 'tintindex');
    faces[name] = {
      ...(Array.isArray(uv) && uv.length === 4 && uv.every((n) => typeof n === 'number')
        ? { uv: uv as number[] }
        : {}),
      texture,
      rotation: typeof rotation === 'number' ? rotation : 0,
      ...(typeof tintindex === 'number' ? { tintindex } : {}),
    };
  }
  const rawRotation = field(raw, 'rotation');
  const origin = vec3(field(rawRotation, 'origin'));
  const axis = field(rawRotation, 'axis');
  const angle = field(rawRotation, 'angle');
  const rotation =
    origin && (axis === 'x' || axis === 'y' || axis === 'z') && typeof angle === 'number'
      ? { origin, axis: axis as 'x' | 'y' | 'z', angle }
      : undefined;
  return {
    from,
    to,
    ...(rotation ? { rotation } : {}),
    shade: field(raw, 'shade') !== false,
    faces,
  };
}

/**
 * The corners of a face of a box, in the order top left, top right, bottom right, bottom left of its texture.
 *
 * @param name - Which face.
 * @param from - The corner of the box with the smallest coordinates.
 * @param to - The corner with the largest.
 * @returns The four corners.
 */
function faceCorners(name: FaceName, from: Vec3, to: Vec3): [Vec3, Vec3, Vec3, Vec3] {
  const [x1, y1, z1] = from;
  const [x2, y2, z2] = to;
  switch (name) {
    case 'up':
      return [
        [x1, y2, z1],
        [x2, y2, z1],
        [x2, y2, z2],
        [x1, y2, z2],
      ];
    case 'down':
      return [
        [x1, y1, z2],
        [x2, y1, z2],
        [x2, y1, z1],
        [x1, y1, z1],
      ];
    case 'north':
      return [
        [x2, y2, z1],
        [x1, y2, z1],
        [x1, y1, z1],
        [x2, y1, z1],
      ];
    case 'south':
      return [
        [x1, y2, z2],
        [x2, y2, z2],
        [x2, y1, z2],
        [x1, y1, z2],
      ];
    case 'west':
      return [
        [x1, y2, z1],
        [x1, y2, z2],
        [x1, y1, z2],
        [x1, y1, z1],
      ];
    case 'east':
      return [
        [x2, y2, z2],
        [x2, y2, z1],
        [x2, y1, z1],
        [x2, y1, z2],
      ];
  }
}

/**
 * The part of the texture a face shows when the model gives no `uv`.
 *
 * @param name - Which face.
 * @param from - The corner of the box with the smallest coordinates.
 * @param to - The corner with the largest.
 * @returns `[u1, v1, u2, v2]` in sixteenths.
 */
function defaultUv(name: FaceName, from: Vec3, to: Vec3): [number, number, number, number] {
  const [x1, y1, z1] = from;
  const [x2, y2, z2] = to;
  switch (name) {
    case 'up':
      return [x1, z1, x2, z2];
    case 'down':
      return [x1, 16 - z2, x2, 16 - z1];
    case 'north':
      return [16 - x2, 16 - y2, 16 - x1, 16 - y1];
    case 'south':
      return [x1, 16 - y2, x2, 16 - y1];
    case 'west':
      return [z1, 16 - y2, z2, 16 - y1];
    case 'east':
      return [16 - z2, 16 - y2, 16 - z1, 16 - y1];
  }
}

/**
 * Cosine and sine of an angle in degrees, exact for multiples of 90.
 *
 * @param degrees - The angle.
 * @returns The cosine and the sine.
 */
function cosSin(degrees: number): [number, number] {
  const radians = (degrees * Math.PI) / 180;
  const round = (n: number): number => (Math.abs(n) < 1e-12 ? 0 : n);
  return [round(Math.cos(radians)), round(Math.sin(radians))];
}

/**
 * Rotates a point around an axis through an origin. A positive angle turns east toward south around y, and
 * up toward south around x, which is the direction Minecraft uses for blockstate rotations.
 *
 * @param point - The point.
 * @param axis - The axis of the rotation.
 * @param degrees - The angle.
 * @param origin - A point on the axis.
 * @returns The rotated point.
 */
export function rotate(point: Vec3, axis: 'x' | 'y' | 'z', degrees: number, origin: Vec3): Vec3 {
  const [c, s] = cosSin(degrees);
  const x = point[0] - origin[0];
  const y = point[1] - origin[1];
  const z = point[2] - origin[2];
  let r: Vec3;
  if (axis === 'x') r = [x, y * c - z * s, y * s + z * c];
  else if (axis === 'y') r = [x * c - z * s, y, x * s + z * c];
  else r = [x * c - y * s, x * s + y * c, z];
  return [r[0] + origin[0], r[1] + origin[1], r[2] + origin[2]];
}

/**
 * The normal of a face from its corners, pointing out of the box.
 *
 * @param corners - Top left, top right, bottom right and bottom left of the texture.
 * @returns The normal, not scaled to length 1; zero if the face has no area.
 */
export function faceNormal(corners: readonly [Vec3, Vec3, Vec3, Vec3]): Vec3 {
  const [tl, tr, , bl] = corners;
  const a: Vec3 = [bl[0] - tl[0], bl[1] - tl[1], bl[2] - tl[2]];
  const b: Vec3 = [tr[0] - tl[0], tr[1] - tl[1], tr[2] - tl[2]];
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

/**
 * The colour a texture is multiplied by, for a block whose model asks for a tint.
 *
 * The real colour depends on the biome. One colour per kind of block is used.
 *
 * @param block - Block name with namespace.
 * @returns The colour as 0xRRGGBB.
 */
export function tintColor(block: string): number {
  const name = block.slice(block.indexOf(':') + 1);
  if (name === 'water') return WATER;
  if (name === 'spruce_leaves') return 0x619961;
  if (name === 'birch_leaves') return 0x80a755;
  if (name === 'lily_pad') return 0x208030;
  if (name === 'redstone_wire') return 0x4b0000;
  if (name.endsWith('_leaves') || name === 'vine') return FOLIAGE;
  return GRASS;
}

/**
 * Chooses the state of a block that stands for it.
 *
 * The API sends block names without their states, so one is picked: a straight stair or rail, a bottom slab,
 * a fully grown crop, otherwise the first one listed.
 *
 * @param keys - The state keys of the blockstate, such as `facing=east,half=bottom`.
 * @returns The chosen key.
 */
function chooseState(keys: string[]): string | undefined {
  const preferred = ['shape=straight', 'shape=north_south', 'half=bottom', 'type=bottom'];
  let best: string | undefined;
  let bestScore = -1;
  for (const key of keys) {
    const parts = key.split(',');
    let score = preferred.filter((p) => parts.includes(p)).length;
    const age = parts.find((p) => p.startsWith('age='));
    if (age) score += Number(age.slice(4)) / 100;
    if (score > bestScore) {
      best = key;
      bestScore = score;
    }
  }
  return best;
}

/**
 * Tells whether a part of a multipart blockstate is drawn for the chosen state.
 *
 * @param when - The part's condition, or `undefined` if it has none.
 * @returns `true` for no condition, or a condition that only lists properties equal to `true`.
 */
function alwaysApplies(when: unknown): boolean {
  if (when === undefined) return true;
  if (typeof when !== 'object' || when === null) return false;
  const values = Object.values(when);
  return values.length > 0 && values.every((value) => value === 'true');
}

/** A model to draw and the rotation of the state that names it. */
interface Placement {
  model: string;
  x: number;
  y: number;
}

/**
 * Reads the models a blockstate draws for the chosen state.
 *
 * @param blockstate - The parsed blockstate file.
 * @returns The models with their rotations; empty if the file has none.
 */
function placements(blockstate: unknown): Placement[] {
  const toPlacement = (raw: unknown): Placement | undefined => {
    const variant = Array.isArray(raw) ? (raw[0] as unknown) : raw;
    const model = field(variant, 'model');
    if (typeof model !== 'string') return undefined;
    const x = field(variant, 'x');
    const y = field(variant, 'y');
    return { model, x: typeof x === 'number' ? x : 0, y: typeof y === 'number' ? y : 0 };
  };

  const variants = field(blockstate, 'variants');
  if (typeof variants === 'object' && variants !== null) {
    const key = chooseState(Object.keys(variants));
    const found =
      key === undefined ? undefined : toPlacement((variants as Record<string, unknown>)[key]);
    return found ? [found] : [];
  }
  const multipart = field(blockstate, 'multipart');
  if (Array.isArray(multipart)) {
    // The parts without a condition are always drawn, and so are the parts whose conditions are all `true`
    // (the sides of a mushroom block). If there are none, the first part stands in.
    const always = multipart.filter((part) => alwaysApplies(field(part, 'when')));
    const chosen = always.length > 0 ? always : multipart.slice(0, 1);
    return chosen.flatMap((part) => toPlacement(field(part, 'apply')) ?? []);
  }
  return [];
}

/**
 * Finds the texture a face names, following `#name` references.
 *
 * @param reference - The face's texture value, such as `#side` or `block/stone`.
 * @param textures - The merged texture table of the model.
 * @returns The texture as `namespace:path`, or `undefined` if a reference cannot be resolved.
 */
function resolveTexture(reference: string, textures: Map<string, string>): string | undefined {
  let value = reference;
  for (let i = 0; i < MAX_PARENTS && value.startsWith('#'); i++) {
    const next = textures.get(value.slice(1));
    if (next === undefined) return undefined;
    value = next;
  }
  return value.startsWith('#') ? undefined : withNamespace(value);
}

/**
 * Builds the faces of one placement.
 *
 * @param block - Block name, for the tint.
 * @param placement - The model and the rotation of the state.
 * @param source - Reads a model.
 * @returns The faces turned toward the camera.
 */
function placementFaces(block: string, placement: Placement, source: ModelSource): Face[] {
  const model = resolveModel(placement.model, source);
  const center: Vec3 = [8, 8, 8];
  const faces: Face[] = [];
  for (const element of model.elements) {
    for (const name of FACE_NAMES) {
      const face = element.faces[name];
      if (!face) continue;
      const texture = resolveTexture(face.texture, model.textures);
      if (texture === undefined) continue;

      let corners = faceCorners(name, element.from, element.to);
      if (element.rotation) {
        const { axis, angle, origin } = element.rotation;
        corners = corners.map((c) => rotate(c, axis, angle, origin)) as typeof corners;
      }
      if (placement.x)
        corners = corners.map((c) => rotate(c, 'x', placement.x, center)) as typeof corners;
      if (placement.y)
        corners = corners.map((c) => rotate(c, 'y', placement.y, center)) as typeof corners;

      const normal = faceNormal(corners);
      const facing =
        normal[0] * TOWARD_CAMERA[0] + normal[1] * TOWARD_CAMERA[1] + normal[2] * TOWARD_CAMERA[2];
      if (facing <= 1e-6) continue;

      const uv = face.uv ?? defaultUv(name, element.from, element.to);
      faces.push({
        corners,
        uv: [uv[0] as number, uv[1] as number, uv[2] as number, uv[3] as number],
        turns: (((face.rotation / 90) % 4) + 4) % 4,
        texture,
        tint: face.tintindex === undefined ? null : tintColor(block),
        shaded: element.shade,
      });
    }
  }
  return faces;
}

/** A full cube with one texture on every face, which is how water and lava are drawn. */
const FLUID_MODEL = {
  elements: [{ from: [0, 0, 0], to: [16, 16, 16], faces: {} as Record<string, unknown> }],
};

/**
 * Builds the faces of every block of a pack.
 *
 * @param blockstates - The parsed blockstate files, by block name with namespace.
 * @param source - Reads a model by id.
 * @returns The faces of each block that has some.
 */
export function buildBlocks(
  blockstates: Map<string, unknown>,
  source: ModelSource,
): Map<string, BlockModel> {
  const blocks = new Map<string, BlockModel>();
  for (const [block, blockstate] of blockstates) {
    const faces = placements(blockstate).flatMap((p) => placementFaces(block, p, source));
    if (faces.length > 0) blocks.set(block, { faces, alpha: 1 });
  }

  // Fluids have no blockstate: they are drawn by code in the game.
  const fluids: [string, string, number][] = [
    ['minecraft:water', 'minecraft:block/water_still', 127 / 255],
    ['minecraft:lava', 'minecraft:block/lava_still', 1],
  ];
  for (const [block, texture, alpha] of fluids) {
    if (blocks.has(block)) continue;
    const faceFor = { texture: '#all', ...(block === 'minecraft:water' ? { tintindex: 0 } : {}) };
    const model = {
      ...FLUID_MODEL,
      elements: [
        { ...FLUID_MODEL.elements[0], faces: { up: faceFor, east: faceFor, south: faceFor } },
      ],
      textures: { all: texture },
    };
    const faces = placementFaces(block, { model: 'fluid', x: 0, y: 0 }, (id) =>
      id === 'minecraft:fluid' ? model : undefined,
    );
    blocks.set(block, { faces, alpha });
  }
  return blocks;
}
