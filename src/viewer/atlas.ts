/**
 * The block texture atlas: one image holding every block sprite, and a JSON file naming
 * the frame of each. It is served from `public/` (`iso_cube.png`, `iso_cube.json`).
 */
import { Assets, type Spritesheet, type Texture, type TextureSource } from 'pixi.js';

/** Loaded atlas. */
export interface Atlas {
  /** The image all frames are cut from. */
  readonly source: TextureSource;
  /**
   * Looks up the sprite of a block.
   *
   * @param name - Frame name such as `grass_block.webp`.
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
 * Loads the atlas.
 *
 * @param url - Location of the JSON description; the image is found through it.
 * @returns The atlas.
 * @throws {Error} If the files cannot be loaded.
 */
export async function loadAtlas(url = `${import.meta.env.BASE_URL}iso_cube.json`): Promise<Atlas> {
  const sheet = await Assets.load<Spritesheet>(url);

  // Pixel art must not be smoothed when scaled.
  sheet.textureSource.style.scaleMode = 'nearest';

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
