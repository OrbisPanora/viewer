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

    const isoX = (screenX - this.viewportWidth / 2) / this.zoom + this.cameraX;
    const isoY = (screenY - this.viewportHeight / 2) / this.zoom + this.cameraZ;

    // Convert back from isometric to world coordinates
    // iso_x = 16 * (world_x - world_z)
    // iso_y = 8 * (world_x + world_z)
    // Solving this system gives us:
    // world_x = (iso_x / 16 + iso_y / 8) / 2
    // world_z = (iso_y / 8 - iso_x / 16) / 2

    const worldX = (isoX / 16 + isoY / 8) / 2;
    const worldZ = (isoY / 8 - isoX / 16) / 2;

    return { worldX, worldZ };
  }

  /**
   * Convert world coordinates to screen coordinates
   */
  worldToScreen(worldX: number, worldZ: number): { screenX: number, screenY: number } {
    // Isometric projection
    const isoX = 16 * (worldX - worldZ) * this.zoom - this.cameraX + this.viewportWidth / 2;
    const isoY = 8 * (worldX + worldZ) * this.zoom - this.cameraZ + this.viewportHeight / 2;

    return { screenX: isoX, screenY: isoY };
  }

  /**
   * Convert world coordinates to chunk coordinates
   */
  worldToChunk(worldX: number, worldZ: number): ChunkCoords {
    return {
      x: Math.floor(worldX / 16),
      z: Math.floor(worldZ / 16)
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

    const minChunkX = Math.floor(bounds.minX / 16) - 1; // Add padding
    const maxChunkX = Math.floor(bounds.maxX / 16) + 1;
    const minChunkZ = Math.floor(bounds.minZ / 16) - 1;
    const maxChunkZ = Math.floor(bounds.maxZ / 16) + 1;

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
    try {
      const data = await firstValueFrom(this.dataService.getJSONData("", coords.x, coords.z));

      if (!data?.data?.surface_blocks?.length) {
        console.warn(`Chunk (${coords.x}, ${coords.z}) has no valid data`);
        return null;
      }

      const chunkData: ChunkData = {
        coords,
        data: data.data.surface_blocks as (string | number)[][],
        chunk: null, // Will be created when needed
        lastAccessed: Date.now(),
        isVisible: true
      };

      // Cache the chunk data
      const key = this.getChunkKey(coords);
      this.cachedChunks.set(key, chunkData);

      console.log(`Loaded chunk: (${coords.x}, ${coords.z})`);
      return chunkData;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn(`Failed to load chunk (${coords.x}, ${coords.z}): ${errorMessage}`);
      return null;
    }
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

      // Preload chunks in a larger radius
      for (let dx = -this.preloadRadius; dx <= this.preloadRadius; dx++) {
        for (let dz = -this.preloadRadius; dz <= this.preloadRadius; dz++) {
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
        // Sort by distance from camera for proper rendering order
        const distA = Math.abs(a.coords.x - this.cameraX/16) + Math.abs(a.coords.z - this.cameraZ/16);
        const distB = Math.abs(b.coords.x - this.cameraX/16) + Math.abs(b.coords.z - this.cameraZ/16);
        return distA - distB;
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
    this.zoom = Math.max(0.1, Math.min(5.0, zoom)); // Clamp zoom between 0.1 and 5.0
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
