/**
 * The block texture atlas: one image holding every block sprite, and the position of each. It is built
 * in the browser from the vanilla `client.jar` by `pack/prepare.ts`; this file turns it into pixi textures.
 */
import {
  ImageSource,
  Spritesheet,
  Texture,
  type SpritesheetData,
  type TextureSource,
} from 'pixi.js';
import { CELL } from './pack/geometry';
import type { RenderedAtlas } from './pack/render';

/** Loaded atlas. */
export interface Atlas {
  /** The image all frames are cut from. */
  readonly source: TextureSource;
  /**
   * Looks up the sprite of a block.
   *
   * @param name - Block name with its namespace, such as `minecraft:grass_block`.
   * @returns The sprite, or `undefined` when the atlas has none. A block without a sprite is not drawn.
   *   The name is reported once with a console warning. Never throws on a bad name.
   */
  texture(name: string): Texture | undefined;
  /**
   * Number of different block names that had no sprite so far.
   *
   * @returns The count.
   */
  unknownCount(): number;
}

/** Names already reported as unknown, so each is logged once and not once per tile. */
const reportedUnknown = new Set<string>();

/**
 * Makes the pixi textures of an atlas.
 *
 * @param rendered - The atlas image and the position of each sprite.
 * @returns The atlas.
 * @throws {Error} If the image cannot be decoded.
 */
export async function loadAtlas(rendered: RenderedAtlas): Promise<Atlas> {
  const bitmap = await createImageBitmap(rendered.image);
  // Pixel art must not be smoothed when scaled.
  const source = new ImageSource({ resource: bitmap, scaleMode: 'nearest' });
  const frames: SpritesheetData['frames'] = {};
  for (const [name, { x, y }] of Object.entries(rendered.frames)) {
    frames[name] = {
      frame: { x, y, w: CELL, h: CELL },
      sourceSize: { w: CELL, h: CELL },
      spriteSourceSize: { x: 0, y: 0, w: CELL, h: CELL },
    };
  }
  const sheet = new Spritesheet(new Texture({ source }), {
    frames,
    meta: { scale: '1', size: { w: bitmap.width, h: bitmap.height } },
  });
  await sheet.parse();

  return {
    source: sheet.textureSource,
    texture(name: string): Texture | undefined {
      const found = sheet.textures[name];
      if (found) return found;
      if (!reportedUnknown.has(name)) {
        reportedUnknown.add(name);
        console.warn(`No sprite for block "${name}"; it is not drawn.`);
      }
      return undefined;
    },
    unknownCount: () => reportedUnknown.size,
  };
}
