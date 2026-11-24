import { describe, expect, it } from 'vitest';
import {
  buildBlocks,
  faceNormal,
  rotate,
  tintColor,
  withNamespace,
  type ModelSource,
} from './models';

const cube = {
  elements: [
    {
      from: [0, 0, 0],
      to: [16, 16, 16],
      faces: {
        down: { texture: '#all' },
        up: { texture: '#all' },
        north: { texture: '#all' },
        south: { texture: '#all' },
        west: { texture: '#all' },
        east: { texture: '#all' },
      },
    },
  ],
};

/** Models by id; every id is given with its namespace. */
function source(models: Record<string, unknown>): ModelSource {
  return (id) => models[id];
}

const models: Record<string, unknown> = {
  'minecraft:block/cube': cube,
  'minecraft:block/cube_all': { parent: 'minecraft:block/cube' },
  'minecraft:block/stone': {
    parent: 'minecraft:block/cube_all',
    textures: { all: 'minecraft:block/stone' },
  },
  'minecraft:block/grass': {
    parent: 'minecraft:block/cube',
    textures: { all: 'block/dirt' },
    elements: [
      { from: [0, 0, 0], to: [16, 16, 16], faces: { up: { texture: '#all', tintindex: 0 } } },
    ],
  },
  'minecraft:block/slab': {
    textures: { all: 'block/oak_planks' },
    elements: [
      {
        from: [0, 0, 0],
        to: [16, 8, 16],
        faces: {
          up: { texture: '#all' },
          east: { texture: '#all' },
          south: { texture: '#all' },
          west: { texture: '#all' },
          north: { texture: '#all' },
        },
      },
    ],
  },
  'minecraft:block/cross': {
    textures: { cross: 'block/poppy' },
    elements: [
      {
        from: [0.8, 0, 8],
        to: [15.2, 16, 8],
        rotation: { origin: [8, 8, 8], axis: 'y', angle: 45 },
        faces: { north: { texture: '#cross' }, south: { texture: '#cross' } },
      },
      {
        from: [8, 0, 0.8],
        to: [8, 16, 15.2],
        rotation: { origin: [8, 8, 8], axis: 'y', angle: 45 },
        faces: { west: { texture: '#cross' }, east: { texture: '#cross' } },
      },
    ],
  },
  'minecraft:block/post': {
    textures: { texture: 'block/oak_planks' },
    elements: [
      {
        from: [6, 0, 6],
        to: [10, 16, 10],
        faces: { up: { texture: '#texture' }, east: { texture: '#texture' } },
      },
    ],
  },
  'minecraft:block/side': {
    textures: { texture: 'block/oak_planks' },
    elements: [
      {
        from: [7, 6, 0],
        to: [9, 9, 9],
        faces: { east: { texture: '#texture' }, south: { texture: '#texture' } },
      },
    ],
  },
};

describe('withNamespace', () => {
  it('adds minecraft: only when there is no namespace', () => {
    expect(withNamespace('block/stone')).toBe('minecraft:block/stone');
    expect(withNamespace('create:block/shaft')).toBe('create:block/shaft');
  });
});

describe('rotate', () => {
  it('turns east toward south around y, and up toward south around x', () => {
    expect(rotate([1, 0, 0], 'y', 90, [0, 0, 0])).toEqual([0, 0, 1]);
    expect(rotate([0, 1, 0], 'x', 90, [0, 0, 0])).toEqual([0, 0, 1]);
    expect(rotate([1, 0, 0], 'z', 90, [0, 0, 0])).toEqual([0, 1, 0]);
  });
});

describe('buildBlocks', () => {
  it('keeps the top, east and south faces of a cube and follows the parents', () => {
    const blocks = buildBlocks(
      new Map([['minecraft:stone', { variants: { '': { model: 'minecraft:block/stone' } } }]]),
      source(models),
    );
    const faces = blocks.get('minecraft:stone')!.faces;
    expect(faces).toHaveLength(3);
    expect(faces.every((f) => f.texture === 'minecraft:block/stone' && f.tint === null)).toBe(true);
    const normals = faces
      .map((f) => faceNormal(f.corners))
      .map((n) => n.map((v) => Math.sign(v) + 0));
    expect(normals).toContainEqual([0, 1, 0]);
    expect(normals).toContainEqual([1, 0, 0]);
    expect(normals).toContainEqual([0, 0, 1]);
  });

  it('gives the default uv of each face', () => {
    const blocks = buildBlocks(
      new Map([['minecraft:stone', { variants: { '': { model: 'minecraft:block/stone' } } }]]),
      source(models),
    );
    const uvs = blocks.get('minecraft:stone')!.faces.map((f) => f.uv);
    expect(uvs).toContainEqual([0, 0, 16, 16]);
  });

  it('uses a child element in place of the parent elements and a namespaced texture', () => {
    const blocks = buildBlocks(
      new Map([
        ['minecraft:grass_block', { variants: { '': { model: 'minecraft:block/grass' } } }],
      ]),
      source(models),
    );
    const faces = blocks.get('minecraft:grass_block')!.faces;
    expect(faces).toHaveLength(1);
    expect(faces[0]).toMatchObject({ texture: 'minecraft:block/dirt', tint: 0x91bd59 });
  });

  it('draws a bottom slab as a box 8 sixteenths high', () => {
    const state = {
      variants: {
        'type=bottom': { model: 'minecraft:block/slab' },
        'type=top': { model: 'minecraft:block/slab', x: 180 },
      },
    };
    const faces = buildBlocks(new Map([['minecraft:oak_slab', state]]), source(models)).get(
      'minecraft:oak_slab',
    )!.faces;
    const top = faces.find((f) => faceNormal(f.corners)[1] > 0)!;
    expect(top.corners[0][1]).toBe(8);
  });

  it('prefers a bottom slab, a straight stair and the oldest crop age by state', () => {
    const states = new Map<string, unknown>([
      [
        'minecraft:a',
        {
          variants: {
            'half=bottom,shape=inner_left': { model: 'minecraft:block/slab', y: 90 },
            'half=bottom,shape=straight': { model: 'minecraft:block/stone' },
          },
        },
      ],
      [
        'minecraft:b',
        {
          variants: {
            'age=0': { model: 'minecraft:block/slab' },
            'age=7': { model: 'minecraft:block/stone' },
          },
        },
      ],
    ]);
    const blocks = buildBlocks(states, source(models));
    expect(blocks.get('minecraft:a')!.faces[0]!.texture).toBe('minecraft:block/stone');
    expect(blocks.get('minecraft:b')!.faces[0]!.texture).toBe('minecraft:block/stone');
  });

  it('rotates by the variant: y 90 turns a face on the east side to the south side', () => {
    const state = { variants: { '': { model: 'minecraft:block/side', y: 90 } } };
    const faces = buildBlocks(new Map([['minecraft:x', state]]), source(models)).get(
      'minecraft:x',
    )!.faces;
    // The box runs from z 0 to 9 before the rotation. The rotation maps z to 16 - x, so it runs from x 7 to 16.
    const xs = faces.flatMap((f) => f.corners.map((c) => c[0]));
    expect(Math.max(...xs)).toBeCloseTo(16);
    expect(Math.min(...xs)).toBeCloseTo(7);
  });

  it('keeps the one plane of a cross that faces the camera (the other is edge-on)', () => {
    const faces = buildBlocks(
      new Map([['minecraft:poppy', { variants: { '': { model: 'minecraft:block/cross' } } }]]),
      source(models),
    ).get('minecraft:poppy')!.faces;
    expect(faces).toHaveLength(1);
    for (const face of faces) {
      const n = faceNormal(face.corners);
      expect(n[0] + n[1] + n[2]).toBeGreaterThan(0);
    }
  });

  it('draws the parts of a multipart block that have no condition', () => {
    const state = {
      multipart: [
        { apply: { model: 'minecraft:block/post' } },
        { when: { north: 'side' }, apply: { model: 'minecraft:block/side' } },
      ],
    };
    const faces = buildBlocks(new Map([['minecraft:oak_fence', state]]), source(models)).get(
      'minecraft:oak_fence',
    )!.faces;
    expect(faces).toHaveLength(2);
  });

  it('draws the parts whose conditions are all true, as for a mushroom block', () => {
    const state = {
      multipart: [
        { when: { east: 'true' }, apply: { model: 'minecraft:block/post' } },
        { when: { north: 'false' }, apply: { model: 'minecraft:block/side' } },
        { when: { OR: [{ up: 'true' }] }, apply: { model: 'minecraft:block/side' } },
      ],
    };
    const faces = buildBlocks(new Map([['minecraft:mushroom', state]]), source(models)).get(
      'minecraft:mushroom',
    )!.faces;
    expect(faces).toHaveLength(2);
  });

  it('reads a texture given as an object with a sprite', () => {
    const glass = {
      'minecraft:block/glass': {
        parent: 'minecraft:block/cube',
        textures: { all: { force_translucent: true, sprite: 'minecraft:block/glass' } },
      },
      'minecraft:block/cube': {
        elements: [{ from: [0, 0, 0], to: [16, 16, 16], faces: { up: { texture: '#all' } } }],
      },
    };
    const blocks = buildBlocks(
      new Map([['minecraft:glass', { variants: { '': { model: 'minecraft:block/glass' } } }]]),
      source(glass),
    );
    expect(blocks.get('minecraft:glass')!.faces[0]!.texture).toBe('minecraft:block/glass');
  });

  it('uses the first part when every part has a condition', () => {
    const state = {
      multipart: [
        { when: { up: 'side' }, apply: { model: 'minecraft:block/post' } },
        { when: { north: 'side' }, apply: { model: 'minecraft:block/side' } },
      ],
    };
    const faces = buildBlocks(new Map([['minecraft:vine', state]]), source(models)).get(
      'minecraft:vine',
    )!.faces;
    expect(faces).toHaveLength(2);
  });

  it('skips blocks without a model and faces with an unknown texture', () => {
    const states = new Map<string, unknown>([
      ['minecraft:chest', { variants: { '': { model: 'minecraft:block/missing' } } }],
      ['minecraft:odd', { variants: { '': { model: 'minecraft:block/odd' } } }],
      ['minecraft:empty', {}],
    ]);
    const blocks = buildBlocks(
      states,
      source({
        'minecraft:block/odd': {
          elements: [{ from: [0, 0, 0], to: [16, 16, 16], faces: { up: { texture: '#nothing' } } }],
        },
      }),
    );
    expect(blocks.has('minecraft:chest')).toBe(false);
    expect(blocks.has('minecraft:odd')).toBe(false);
    expect(blocks.has('minecraft:empty')).toBe(false);
  });

  it('survives a parent loop', () => {
    const loop = {
      'minecraft:block/a': { parent: 'minecraft:block/b' },
      'minecraft:block/b': { parent: 'minecraft:block/a' },
    };
    const blocks = buildBlocks(
      new Map([['minecraft:x', { variants: { '': { model: 'minecraft:block/a' } } }]]),
      source(loop),
    );
    expect(blocks.size).toBe(2);
  });

  it('adds water as a half-transparent tinted cube and lava as an opaque one', () => {
    const blocks = buildBlocks(new Map(), source({}));
    expect(blocks.get('minecraft:water')).toMatchObject({ alpha: 127 / 255 });
    expect(blocks.get('minecraft:water')!.faces).toHaveLength(3);
    expect(blocks.get('minecraft:water')!.faces[0]).toMatchObject({
      texture: 'minecraft:block/water_still',
      tint: 0x3f76e4,
    });
    expect(blocks.get('minecraft:lava')).toMatchObject({ alpha: 1 });
    expect(blocks.get('minecraft:lava')!.faces[0]!.tint).toBeNull();
  });
});

describe('tintColor', () => {
  it.each([
    ['minecraft:short_grass', 0x91bd59],
    ['minecraft:oak_leaves', 0x77ab2f],
    ['minecraft:spruce_leaves', 0x619961],
    ['minecraft:birch_leaves', 0x80a755],
    ['minecraft:lily_pad', 0x208030],
    ['minecraft:water', 0x3f76e4],
  ])('colours %s', (name, colour) => {
    expect(tintColor(name)).toBe(colour);
  });
});
