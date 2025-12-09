import { Injectable } from '@angular/core';
import { DataService } from './data.service';
import { Atlas } from './atlas';
import { Chunk } from '../factories/chunk';
import { firstValueFrom } from 'rxjs';

export interface ChunkCoords {
  x: number;
  z: number;
}

export interface ViewportBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface ChunkData {
  coords: ChunkCoords;
  data: (string | number)[][];
  chunk: Chunk | null;
  lastAccessed: number;
  isVisible: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class ChunkManager {
  private cachedChunks = new Map<string, ChunkData>();
  private maxCacheSize = 100; // Maximum chunks in cache
  private preloadRadius = 3; // Preload chunks within this radius
  private visibleChunks = new Set<string>();
  private isPreloading = false;

  private readonly TILE_WIDTH = 32;
  private readonly TILE_HEIGHT = 16;
  private readonly CHUNK_SIZE = 16;

  private missingChunks = new Set<string>();
  private loadingChunks = new Map<string, Promise<ChunkData | null>>();

  // Viewport and camera settings
  private cameraX = 0;
  private cameraZ = 0;
  private zoom = 1.0;
  private viewportWidth = 1920;
  private viewportHeight = 1080;

  constructor(private dataService: DataService) {}

  /**
   * Convert screen coordinates to world coordinates
   */
  screenToWorld(screenX: number, screenY: number): { worldX: number, worldZ: number } {
    // Reverse isometric projection
    // Assuming isometric projection: x_iso = 16 * (x - z), y_iso = 8 * (x + z) - 16 * y
    // For 2D view, we ignore the height component

    const isoX = (screenX - this.viewportWidth / 2) / this.zoom;
    const isoY = (screenY - this.viewportHeight / 2) / this.zoom;

    // Convert back from isometric to world coordinates in camera-relative space
    // iso_x = (TILE_WIDTH/2) * (world_x - world_z)
    // iso_y = (TILE_HEIGHT/2) * (world_x + world_z)
    const relWorldX = (isoX / (this.TILE_WIDTH / 2) + isoY / (this.TILE_HEIGHT / 2)) / 2;
    const relWorldZ = (isoY / (this.TILE_HEIGHT / 2) - isoX / (this.TILE_WIDTH / 2)) / 2;

    const worldX = this.cameraX + relWorldX;
    const worldZ = this.cameraZ + relWorldZ;

    return { worldX, worldZ };
  }

  /**
   * Convert world coordinates to screen coordinates
   */
  worldToScreen(worldX: number, worldZ: number): { screenX: number, screenY: number } {
    // Isometric projection
    const dx = worldX - this.cameraX;
    const dz = worldZ - this.cameraZ;

    const isoX = (dx - dz) * (this.TILE_WIDTH / 2) * this.zoom + this.viewportWidth / 2;
    const isoY = (dx + dz) * (this.TILE_HEIGHT / 2) * this.zoom + this.viewportHeight / 2;

    return { screenX: isoX, screenY: isoY };
  }

  /**
   * Convert world coordinates to chunk coordinates
   */
  worldToChunk(worldX: number, worldZ: number): ChunkCoords {
    return {
      x: Math.floor(worldX / this.CHUNK_SIZE),
      z: Math.floor(worldZ / this.CHUNK_SIZE)
    };
  }

  /**
   * Get the viewport bounds in world coordinates
   */
  getViewportBounds(): ViewportBounds {
    const topLeft = this.screenToWorld(0, 0);
    const bottomRight = this.screenToWorld(this.viewportWidth, this.viewportHeight);

    return {
      minX: Math.min(topLeft.worldX, bottomRight.worldX),
      maxX: Math.max(topLeft.worldX, bottomRight.worldX),
      minZ: Math.min(topLeft.worldZ, bottomRight.worldZ),
      maxZ: Math.max(topLeft.worldZ, bottomRight.worldZ)
    };
  }

  /**
   * Get all chunk coordinates that should be visible in the current viewport
   */
  getVisibleChunkCoords(): ChunkCoords[] {
    const bounds = this.getViewportBounds();
    const chunks: ChunkCoords[] = [];

    // Padding depends on zoom: more padding when zoomed in, less when zoomed out
    const padding = Math.max(1, Math.round(2 / this.zoom));

    const minChunkX = Math.floor(bounds.minX / this.CHUNK_SIZE) - padding; // Add padding
    const maxChunkX = Math.floor(bounds.maxX / this.CHUNK_SIZE) + padding;
    const minChunkZ = Math.floor(bounds.minZ / this.CHUNK_SIZE) - padding;
    const maxChunkZ = Math.floor(bounds.maxZ / this.CHUNK_SIZE) + padding;

    for (let x = minChunkX; x <= maxChunkX; x++) {
      for (let z = minChunkZ; z <= maxChunkZ; z++) {
        chunks.push({ x, z });
      }
    }

    return chunks;
  }

  /**
   * Generate a unique key for chunk coordinates
   */
  private getChunkKey(coords: ChunkCoords): string {
    return `${coords.x},${coords.z}`;
  }

  /**
   * Load a single chunk
   */
  private async loadChunk(coords: ChunkCoords): Promise<ChunkData | null> {
    const key = this.getChunkKey(coords);

    if (this.missingChunks.has(key)) {
      return null;
    }

    const existingPromise = this.loadingChunks.get(key);
    if (existingPromise) {
      return existingPromise;
    }

    const loadPromise = (async () => {
      try {
        const data = await firstValueFrom(this.dataService.getJSONData("", coords.x, coords.z));

        if (!data?.data?.surface_blocks?.length) {
          console.warn(`Chunk (${coords.x}, ${coords.z}) has no valid data`);
          this.missingChunks.add(key);
          return null;
        }

        const chunkData: ChunkData = {
          coords,
          data: data.data.surface_blocks as (string | number)[][],
          chunk: null, // Will be created when needed
          lastAccessed: Date.now(),
          isVisible: true
        };

        this.cachedChunks.set(key, chunkData);
        this.missingChunks.delete(key);

        console.log(`Loaded chunk: (${coords.x}, ${coords.z})`);
        return chunkData;

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.warn(`Failed to load chunk (${coords.x}, ${coords.z}): ${errorMessage}`);
        this.missingChunks.add(key);
        return null;
      } finally {
        this.loadingChunks.delete(key);
      }
    })();

    this.loadingChunks.set(key, loadPromise);
    return loadPromise;
  }

  /**
   * Ensure cache doesn't exceed maximum size (LRU eviction)
   */
  private maintainCacheSize(): void {
    if (this.cachedChunks.size <= this.maxCacheSize) return;

    // Sort chunks by last accessed time (oldest first)
    const sortedChunks = Array.from(this.cachedChunks.entries())
      .sort(([,a], [,b]) => a.lastAccessed - b.lastAccessed);

    // Remove oldest chunks
    const chunksToRemove = sortedChunks.slice(0, this.cachedChunks.size - this.maxCacheSize);
    chunksToRemove.forEach(([key, chunkData]) => {
      if (chunkData.chunk) {
        chunkData.chunk.destroy()
      }
      this.cachedChunks.delete(key);
    });

    console.log(`Cache maintenance: removed ${chunksToRemove.length} old chunks`);
  }

  /**
   * Update which chunks are currently visible
   */
  updateVisibleChunks(): void {
    const visibleCoords = this.getVisibleChunkCoords();
    const newVisibleSet = new Set(visibleCoords.map(coord => this.getChunkKey(coord)));

    // Update visibility flags
    this.cachedChunks.forEach((chunkData, key) => {
      chunkData.isVisible = newVisibleSet.has(key);
      if (chunkData.isVisible) {
        chunkData.lastAccessed = Date.now();
      }
    });

    this.visibleChunks = newVisibleSet;
  }

  /**
   * Ensure all visible chunks are loaded
   */
  async ensureVisibleChunksLoaded(atlas: Atlas): Promise<void> {
    const visibleCoords = this.getVisibleChunkCoords();
    const loadPromises: Promise<void>[] = [];

    for (const coords of visibleCoords) {
      const key = this.getChunkKey(coords);
      let chunkData = this.cachedChunks.get(key);

      if (!chunkData) {
        // Load chunk data
        const loadPromise = this.loadChunk(coords).then(loadedData => {
          if (loadedData) {
            chunkData = loadedData;
            // Create PIXI chunk if we have atlas
            if (atlas && atlas.getAtlas()) {
              chunkData.chunk = new Chunk(Date.now(), atlas.getAtlas(), chunkData.data);
            }
          }
        });
        loadPromises.push(loadPromise);
      } else {
        // Update access time
        chunkData.lastAccessed = Date.now();
        chunkData.isVisible = true;

        // Create PIXI chunk if not already created
        if (!chunkData.chunk && atlas && atlas.getAtlas()) {
          chunkData.chunk = new Chunk(Date.now(), atlas.getAtlas(), chunkData.data);
        }
      }
    }

    await Promise.all(loadPromises);
    this.maintainCacheSize();
  }

  /**
   * Start preloading chunks around current position
   */
  startPreloading(atlas: Atlas): void {
    if (this.isPreloading) return;

    this.isPreloading = true;

    // Run preloading in background
    setTimeout(() => this.preloadChunks(atlas), 100);
  }

  /**
   * Preload chunks in a larger radius around current position
   */
  private async preloadChunks(atlas: Atlas): Promise<void> {
    try {
      const currentChunk = this.worldToChunk(this.cameraX, this.cameraZ);
      const preloadPromises: Promise<void>[] = [];

      // Adjust preload radius dynamically based on zoom to balance performance and smoothness
      const zoom = this.zoom;
      const zoomFactor = Math.max(0.5, Math.min(2.0, zoom));
      const effectiveRadius = Math.max(1, Math.round(this.preloadRadius * zoomFactor));

      // Preload chunks in a larger radius
      for (let dx = -effectiveRadius; dx <= effectiveRadius; dx++) {
        for (let dz = -effectiveRadius; dz <= effectiveRadius; dz++) {
          const coords = { x: currentChunk.x + dx, z: currentChunk.z + dz };
          const key = this.getChunkKey(coords);

          // Skip if already cached or currently visible
          if (this.cachedChunks.has(key) || this.visibleChunks.has(key)) {
            continue;
          }

          const preloadPromise = this.loadChunk(coords).then(chunkData => {
            if (chunkData && atlas && atlas.getAtlas()) {
              chunkData.chunk = new Chunk(Date.now(), atlas.getAtlas(), chunkData.data);
            }
          });

          preloadPromises.push(preloadPromise);
        }
      }

      await Promise.all(preloadPromises);
      this.maintainCacheSize();

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Preloading failed:', errorMessage);
    } finally {
      this.isPreloading = false;
    }
  }

  /**
   * Get all visible chunks for rendering
   */
  getVisibleChunks(): ChunkData[] {
    return Array.from(this.cachedChunks.values())
      .filter(chunkData => chunkData.isVisible && chunkData.chunk)
      .sort((a, b) => {
        // Sort by isometric depth so that farther chunks are drawn first
        // For a fixed isometric camera, depth can be approximated by (x + z)
        const depthA = a.coords.x + a.coords.z;
        const depthB = b.coords.x + b.coords.z;
        return depthA - depthB;
      });
  }

  /**
   * Update camera position
   */
  setCameraPosition(x: number, z: number): void {
    this.cameraX = x;
    this.cameraZ = z;
    this.updateVisibleChunks();
  }

  /**
   * Update zoom level
   */
  setZoom(zoom: number): void {
    this.zoom = Math.max(0.5, Math.min(2.5, zoom)); // Clamp zoom between 0.5 and 2.5
    this.updateVisibleChunks();
  }

  /**
   * Update viewport size
   */
  setViewportSize(width: number, height: number): void {
    this.viewportWidth = width;
    this.viewportHeight = height;
    this.updateVisibleChunks();
  }

  /**
   * Move camera by delta
   */
  moveCamera(deltaX: number, deltaZ: number): void {
    this.setCameraPosition(this.cameraX + deltaX, this.cameraZ + deltaZ);
  }

  /**
   * Pan camera using screen-space deltas
   */
  panCamera(deltaScreenX: number, deltaScreenY: number): void {
    const zoom = this.zoom;
    const sx = (this.TILE_WIDTH / 2) * zoom;
    const sy = (this.TILE_HEIGHT / 2) * zoom;

    const relX = deltaScreenX / sx;
    const relY = deltaScreenY / sy;

    const worldDX = (relX + relY) / 2;
    const worldDZ = (relY - relX) / 2;

    this.moveCamera(-worldDX, -worldDZ);
  }

  /**
   * Get current camera position
   */
  getCameraPosition(): { x: number, z: number } {
    return { x: this.cameraX, z: this.cameraZ };
  }

  /**
   * Get current zoom level
   */
  getZoom(): number {
    return this.zoom;
  }

  /**
   * Clear all cached chunks
   */
  clearCache(): void {
    this.cachedChunks.forEach(chunkData => {
      if (chunkData.chunk) {
        chunkData.chunk.destroy();
      }
    });
    this.cachedChunks.clear();
    this.visibleChunks.clear();
    console.log('Chunk cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { total: number, visible: number, cached: number } {
    const visible = Array.from(this.cachedChunks.values()).filter(c => c.isVisible).length;
    const cached = this.cachedChunks.size;

    return {
      total: cached,
      visible: visible,
      cached: cached - visible
    };
  }
}
