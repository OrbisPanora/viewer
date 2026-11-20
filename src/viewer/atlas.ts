/**
 * The block texture atlas: one image holding every block sprite, and a JSON file naming
 * the frame of each. It is served from `public/` (`iso_cube.png`, `iso_cube.json`).
 */
import { Assets, type Spritesheet, type Texture, type TextureSource } from 'pixi.js';

/** Frame drawn in place of a block the atlas has no sprite for. */
export const FALLBACK_FRAME = 'glass.webp';

/** Loaded atlas. */
export interface Atlas {
  /** The image all frames are cut from. */
  readonly source: TextureSource;
  /**
   * Looks up the sprite of a block.
   *
   * @param name - Frame name such as `grass_block.webp`.
   * @returns The sprite, or {@link FALLBACK_FRAME} when unknown. Never throws on a bad name.
   */
  texture(name: string): Texture;
}

/** Names already reported as unknown, so each is logged once and not once per tile. */
const reportedUnknown = new Set<string>();

/**
 * Loads the atlas.
 *
 * @param url - Location of the JSON description; the image is found through it.
 * @returns The atlas.
 * @throws {Error} If the files cannot be loaded or the fallback frame is missing.
 */
export async function loadAtlas(url = `${import.meta.env.BASE_URL}iso_cube.json`): Promise<Atlas> {
  const sheet = await Assets.load<Spritesheet>(url);
  const fallback = sheet.textures[FALLBACK_FRAME];
  if (!fallback) throw new Error(`The atlas has no "${FALLBACK_FRAME}" frame.`);

  // Pixel art must not be smoothed when scaled.
  sheet.textureSource.style.scaleMode = 'nearest';

  return {
    source: sheet.textureSource,
    texture(name: string): Texture {
      const found = sheet.textures[name];
      if (found) return found;
      if (!reportedUnknown.has(name)) {
        reportedUnknown.add(name);
        console.warn(`No sprite for block "${name}"; drawing a placeholder.`);
      }
      return fallback;
    },
  };
}
