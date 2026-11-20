/**
 * Draws chunks with pixi.js.
 *
 * Each loaded chunk is one `Tilemap` (a single GPU batch for all its sprites). Chunks that
 * are loading or absent are shown as flat diamonds so the user can tell them apart from
 * empty sky. The module owns every pixi object it creates and releases them in
 * {@link SceneRenderer.destroy}.
 */
import { Container, Graphics, GraphicsContext, type Application } from 'pixi.js';
import { Tilemap } from '@pixi/tilemap';
import type { Camera } from './camera';
import type { Atlas } from './atlas';
import {
  CHUNK_SIZE,
  TILE_HEIGHT,
  TILE_WIDTH,
  chunkCenter,
  chunkKey,
  parseChunkKey,
  worldToIso,
  type ChunkCoords,
} from './projection';
import type { Tile } from '@/api/chunks';

/** Half the width of a chunk's diamond on screen, in pixels. */
const DIAMOND_HALF_WIDTH = (CHUNK_SIZE * TILE_WIDTH) / 2;
/** Half the height of a chunk's diamond on screen, in pixels. */
const DIAMOND_HALF_HEIGHT = (CHUNK_SIZE * TILE_HEIGHT) / 2;

/** Colours of the placeholder diamonds. */
const LOADING_COLOR = 0x4caf50;
const MISSING_COLOR = 0xffffff;

/** Draws the world into a pixi application. */
export class SceneRenderer {
  private readonly placeholderLayer = new Container();
  private readonly chunkLayer = new Container();
  private readonly tilemaps = new Map<string, Tilemap>();
  private readonly tileCounts = new Map<string, number>();
  private shownTilemaps = 0;
  private shownTiles = 0;
  private readonly loadingMarks = new Map<string, Graphics>();
  private readonly missingMarks = new Map<string, Graphics>();

  /** Shared by all marks: the same shape drawn many times costs one geometry. */
  private readonly loadingShape = diamond(LOADING_COLOR, 0.12, 2, 0.6);
  private readonly missingShape = diamond(MISSING_COLOR, 0.05, 1, 0.25);

  /**
   * Creates the renderer and adds its layers to the stage.
   *
   * @param app - A pixi application that has been initialised.
   * @param atlas - Block sprites.
   */
  constructor(
    private readonly app: Application,
    private readonly atlas: Atlas,
  ) {
    // Chunks overlap their neighbours' edges; ordering by x+z draws far chunks first.
    this.chunkLayer.sortableChildren = true;
    app.stage.addChild(this.placeholderLayer, this.chunkLayer);
  }

  /**
   * Number of chunks that have a drawing, shown or hidden.
   *
   * @returns The count.
   */
  get tilemapCount(): number {
    return this.tilemaps.size;
  }

  /**
   * Number of chunk drawings shown at the last {@link setVisible}.
   *
   * @returns The count.
   */
  get visibleTilemapCount(): number {
    return this.shownTilemaps;
  }

  /**
   * Number of block sprites in the chunk drawings shown at the last {@link setVisible}.
   *
   * @returns The count.
   */
  get visibleTileCount(): number {
    return this.shownTiles;
  }

  /**
   * Adds or replaces the drawing of a chunk.
   *
   * @param coords - The chunk.
   * @param tiles - Its blocks.
   */
  setChunk(coords: ChunkCoords, tiles: readonly Tile[]): void {
    const key = chunkKey(coords);
    this.removeChunk(key);

    const tilemap = new Tilemap([this.atlas.source]);
    for (const [name, x, y] of tiles) tilemap.tile(this.atlas.texture(name), x, y);
    tilemap.zIndex = coords.x + coords.z;
    this.tilemaps.set(key, tilemap);
    this.tileCounts.set(key, tiles.length);
    this.chunkLayer.addChild(tilemap);
  }

  /**
   * Removes a chunk's drawing and frees its GPU data.
   *
   * @param key - Chunk key.
   */
  removeChunk(key: string): void {
    const tilemap = this.tilemaps.get(key);
    if (!tilemap) return;
    this.chunkLayer.removeChild(tilemap);
    // The atlas texture is shared by all chunks and must survive.
    tilemap.destroy({ children: true, texture: false, textureSource: false });
    this.tilemaps.delete(key);
    this.tileCounts.delete(key);
  }

  /**
   * Tells whether a chunk is drawn.
   *
   * @param key - Chunk key.
   * @returns `true` if a drawing exists.
   */
  hasChunk(key: string): boolean {
    return this.tilemaps.has(key);
  }

  /**
   * Shows only the chunks that are on screen. Hidden tilemaps are skipped by the renderer
   * but kept in memory, so scrolling back is instant.
   *
   * @param visible - Keys of the chunks to show.
   */
  setVisible(visible: ReadonlySet<string>): void {
    let shown = 0;
    let tiles = 0;
    for (const [key, tilemap] of this.tilemaps) {
      const isShown = visible.has(key);
      tilemap.visible = isShown;
      if (isShown) {
        shown++;
        tiles += this.tileCounts.get(key) ?? 0;
      }
    }
    this.shownTilemaps = shown;
    this.shownTiles = tiles;
  }

  /**
   * Shows placeholders for chunks that are loading or absent, and removes the others.
   *
   * @param loading - Chunks being fetched.
   * @param missing - Chunks the world does not have.
   * @param timeMs - Current time, which drives the pulse of the loading marks.
   */
  syncPlaceholders(
    loading: readonly ChunkCoords[],
    missing: readonly ChunkCoords[],
    timeMs: number,
  ): void {
    this.syncMarks(this.loadingMarks, loading, this.loadingShape);
    this.syncMarks(this.missingMarks, missing, this.missingShape);
    for (const [key, mark] of this.loadingMarks) {
      const { x, z } = parseChunkKey(key);
      mark.alpha = 0.5 + Math.sin(timeMs / 500 + x + z) * 0.3;
    }
  }

  /**
   * Positions and scales the layers for the camera.
   *
   * @param camera - Current camera.
   * @param surfaceY - Surface height under the camera.
   */
  applyCamera(camera: Camera, surfaceY: number): void {
    const position = camera.layerPosition(surfaceY);
    for (const layer of [this.chunkLayer, this.placeholderLayer]) {
      layer.position.set(position.x, position.y);
      layer.scale.set(camera.zoom);
    }
  }

  /**
   * Releases every pixi object created by the renderer.
   */
  destroy(): void {
    for (const key of [...this.tilemaps.keys()]) this.removeChunk(key);
    this.loadingMarks.clear();
    this.missingMarks.clear();
    this.placeholderLayer.destroy({ children: true });
    this.chunkLayer.destroy({ children: true });
    this.loadingShape.destroy();
    this.missingShape.destroy();
  }

  /**
   * Makes the marks in a layer match a list of chunks.
   *
   * @param marks - Existing marks by chunk key; updated in place.
   * @param chunks - Chunks that should have a mark.
   * @param shape - Shape to draw.
   */
  private syncMarks(
    marks: Map<string, Graphics>,
    chunks: readonly ChunkCoords[],
    shape: GraphicsContext,
  ): void {
    const wanted = new Set<string>();
    for (const coords of chunks) {
      const key = chunkKey(coords);
      wanted.add(key);
      if (marks.has(key)) continue;
      const mark = new Graphics(shape);
      const iso = worldToIso(chunkCenter(coords));
      mark.position.set(iso.x, iso.y);
      marks.set(key, mark);
      this.placeholderLayer.addChild(mark);
    }
    for (const [key, mark] of marks) {
      if (wanted.has(key)) continue;
      this.placeholderLayer.removeChild(mark);
      // Not `destroy(context)`: the shape is shared and still used by other marks.
      mark.destroy();
      marks.delete(key);
    }
  }
}

/**
 * Builds the outline of one chunk's footprint.
 *
 * @param color - Fill and line colour.
 * @param fillAlpha - Opacity of the fill.
 * @param lineWidth - Width of the outline in pixels.
 * @param lineAlpha - Opacity of the outline.
 * @returns A drawing context that can be shared by many `Graphics`.
 */
function diamond(
  color: number,
  fillAlpha: number,
  lineWidth: number,
  lineAlpha: number,
): GraphicsContext {
  return new GraphicsContext()
    .poly([
      0,
      -DIAMOND_HALF_HEIGHT,
      DIAMOND_HALF_WIDTH,
      0,
      0,
      DIAMOND_HALF_HEIGHT,
      -DIAMOND_HALF_WIDTH,
      0,
    ])
    .fill({ color, alpha: fillAlpha })
    .stroke({ color, width: lineWidth, alpha: lineAlpha });
}
