import { Injectable } from '@angular/core';
import { DataService } from './data.service';
import { Atlas } from './atlas';
import { Chunk } from '../factories/chunk';
import { firstValueFrom } from 'rxjs';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface ChunkCoords {
  x: number;
  z: number;
}

export interface ChunkData {
  coords: ChunkCoords;
  tileData: (string | number)[][];  // [textureName, screenX, screenY][]
  surfaceY: number;                 // Minimum surface height (from palette)
  chunk: Chunk | null;              // PIXI tilemap instance
  lastAccessed: number;             // For LRU cache
  state: 'loading' | 'loaded' | 'error';
}

// ============================================================================
// CONSTANTS
// ============================================================================

const TILE_WIDTH = 32;   // Largeur d'une tile isométrique en pixels
const TILE_HEIGHT = 16;  // Hauteur d'une tile isométrique en pixels
const CHUNK_SIZE = 16;   // Un chunk = 16x16 blocs

// Taille d'un chunk en pixels (pour le calcul de visibilité)
// Un chunk 16x16 en iso: largeur = 16*32 = 512px, hauteur = 16*16 = 256px
const CHUNK_PIXEL_WIDTH = CHUNK_SIZE * TILE_WIDTH;
const CHUNK_PIXEL_HEIGHT = CHUNK_SIZE * TILE_HEIGHT;

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.5;
const MAX_CACHE_SIZE = 2000;  // Increased for larger radius support
const PRELOAD_RADIUS = 4;
const MAX_CONCURRENT_LOADS = 6;  // Limite de requêtes API simultanées

// ============================================================================
// CHUNK MANAGER SERVICE
// ============================================================================

@Injectable({
  providedIn: 'root'
})
export class ChunkManager {
  // Cache of loaded chunks
  private cache = new Map<string, ChunkData>();

  // Chunks currently loading (to avoid duplicate requests)
  private loading = new Map<string, Promise<ChunkData | null>>();

  // Chunks known to be non-existent (404)
  private missing = new Set<string>();

  // Camera position (in world/block coordinates)
  private cameraX = 0;
  private cameraZ = 0;

  // Camera velocity (for movement prediction)
  private cameraVelX = 0;
  private cameraVelZ = 0;
  private lastCameraUpdate = 0;

  // Zoom level
  private zoom = 1.0;

  // Viewport dimensions
  private viewportWidth = 1920;
  private viewportHeight = 1080;

  // Preloading state
  private isPreloading = false;

  // Continuous loading state
  private continuousLoadingActive = false;
  private continuousLoadingAtlas: Atlas | null = null;
  private pendingLoads = new Set<string>();

  constructor(private dataService: DataService) { }

  // ==========================================================================
  // COORDINATE CONVERSIONS
  // ==========================================================================

  /**
   * Converts world coordinates (blocks) to chunk coordinates
   */
  worldToChunk(worldX: number, worldZ: number): ChunkCoords {
    return {
      x: Math.floor(worldX / CHUNK_SIZE),
      z: Math.floor(worldZ / CHUNK_SIZE)
    };
  }

  /**
   * Generates a unique key string to identify a chunk
   */
  getChunkKey(coords: ChunkCoords): string {
    return `${coords.x},${coords.z}`;
  }

  /**
   * Parses a chunk key back into coordinates
   */
  private parseChunkKey(key: string): ChunkCoords {
    const [x, z] = key.split(',').map(Number);
    return { x, z };
  }

  /**
   * Gets the average surface Y of visible chunks for camera Y offset
   * Returns the surfaceY of the chunk closest to camera, or 0 if none loaded
   */
  getAverageSurfaceY(): number {
    const cameraChunk = this.worldToChunk(this.cameraX, this.cameraZ);
    const key = this.getChunkKey(cameraChunk);

    // First try to get the chunk directly under camera
    const centerChunk = this.cache.get(key);
    if (centerChunk) {
      return centerChunk.surfaceY;
    }

    // Otherwise, get average of visible chunks
    const visibleChunks = this.getVisibleChunks();
    if (visibleChunks.length === 0) return 0;

    // Find the closest loaded chunk to camera
    let closestChunk: ChunkData | null = null;
    let closestDist = Infinity;

    for (const chunk of visibleChunks) {
      const dist = Math.pow(chunk.coords.x - cameraChunk.x, 2) + Math.pow(chunk.coords.z - cameraChunk.z, 2);
      if (dist < closestDist) {
        closestDist = dist;
        closestChunk = chunk;
      }
    }

    return closestChunk?.surfaceY ?? 0;
  }

  /**
   * Returns the screen offset for the camera (for CHUNKING calculations).
   * This is the base offset WITHOUT surface Y adjustment.
   * Used for visibility calculations - should NOT include Y offset.
   */
  getCameraScreenOffset(): { x: number; y: number } {
    // Camera is in world coordinates (blocks)
    // Convert it to isometric screen offset
    const screenX = (this.cameraX - this.cameraZ) * (TILE_WIDTH / 2);
    const screenY = (this.cameraX + this.cameraZ) * (TILE_HEIGHT / 2);
    return { x: -screenX, y: -screenY };
  }

  /**
   * Returns the screen offset for RENDERING.
   * 
   * Backend now normalizes Y position with: y_final = (8*(global_x+global_z) - 16*k) - min_value*16
   * This puts all chunks at the same base level, so no Y offset needed here.
   */
  getCameraRenderOffset(): { x: number; y: number } {
    const baseOffset = this.getCameraScreenOffset();

    // Compensate for surface height normalization
    // Backend normalizes to min_value, so we shift down by surfaceY * 16
    const surfaceY = this.getAverageSurfaceY();
    const yOffset = surfaceY * 16;//surfaceY * 16; // 16 pixels per Y level (negative because high = rendered lower)

    return { x: baseOffset.x, y: baseOffset.y + yOffset };


    // Backend handles Y normalization, so just return base offset

  }

  /**
   * Chunk position - backend sends absolute coordinates,
   * so all chunks are at (0,0) + camera offset
   */
  chunkToScreen(chunkX: number, chunkZ: number): { x: number; y: number } {
    // All chunks use the same offset (the camera)
    return this.getCameraScreenOffset();
  }

  /**
   * Converts screen coordinates to world coordinates
   * Used for mouse picking and visibility calculations
   */
  screenToWorld(screenX: number, screenY: number): { worldX: number; worldZ: number } {
    // Remove centering and zoom
    const localX = (screenX - this.viewportWidth / 2) / this.zoom;
    const localY = (screenY - this.viewportHeight / 2) / this.zoom;

    // Inverse isometric projection
    const dx = (localX / (TILE_WIDTH / 2) + localY / (TILE_HEIGHT / 2)) / 2;
    const dz = (localY / (TILE_HEIGHT / 2) - localX / (TILE_WIDTH / 2)) / 2;

    return {
      worldX: this.cameraX + dx,
      worldZ: this.cameraZ + dz
    };
  }

  // ==========================================================================
  // VISIBILITY CALCULATION
  // ==========================================================================

  /**
   * Calculates which chunks should be visible in the current viewport
   * Uses a diamond-shaped frustum for isometric view
   */
  getVisibleChunkCoords(): ChunkCoords[] {
    // Viewport center in world coordinates
    const center = this.screenToWorld(this.viewportWidth / 2, this.viewportHeight / 2);

    // Calculate visibility radius taking zoom into account
    // When zooming out (zoom < 1), we see more of the world
    // In iso, the visible diagonal is important
    const diagonalScreen = Math.sqrt(
      this.viewportWidth * this.viewportWidth +
      this.viewportHeight * this.viewportHeight
    );

    // Convert to world radius
    // Division by zoom: if zoom = 0.5, we see 2x more
    // Division by TILE_WIDTH/2 because it's the scale of iso projection
    const worldRadius = (diagonalScreen / 2) / ((TILE_WIDTH / 2) * this.zoom);

    // Add margin for partially visible chunks
    const chunkRadius = Math.ceil(worldRadius / CHUNK_SIZE) + 1;

    // Center in chunk coordinates
    const centerChunkX = Math.floor(center.worldX / CHUNK_SIZE);
    const centerChunkZ = Math.floor(center.worldZ / CHUNK_SIZE);

    const chunks: ChunkCoords[] = [];

    // Diamond shape for isometric (Manhattan distance)
    for (let x = centerChunkX - chunkRadius; x <= centerChunkX + chunkRadius; x++) {
      for (let z = centerChunkZ - chunkRadius; z <= centerChunkZ + chunkRadius; z++) {
        // Manhattan distance from center
        const dist = Math.abs(x - centerChunkX) + Math.abs(z - centerChunkZ);

        // Keep only chunks within visibility diamond
        if (dist <= chunkRadius) {
          chunks.push({ x, z });
        }
      }
    }

    return chunks;
  }

  /**
   * Returns loaded and visible chunks, sorted by depth (depth sorting)
   */
  getVisibleChunks(): ChunkData[] {
    const visibleCoords = this.getVisibleChunkCoords();
    const visibleKeys = new Set(visibleCoords.map(c => this.getChunkKey(c)));

    return Array.from(this.cache.values())
      .filter(chunk => visibleKeys.has(this.getChunkKey(chunk.coords)) && chunk.chunk !== null)
      .sort((a, b) => {
        // Depth sorting: chunks "behind" (small x+z) are drawn first
        // This is crucial for correct isometric occlusion
        return (a.coords.x + a.coords.z) - (b.coords.x + b.coords.z);
      });
  }

  // ==========================================================================
  // CHUNK LOADING
  // ==========================================================================

  /**
   * Loads a chunk from the API
   */
  private async loadChunk(coords: ChunkCoords): Promise<ChunkData | null> {
    const key = this.getChunkKey(coords);

    // Already in cache
    if (this.cache.has(key)) {
      const cached = this.cache.get(key)!;
      cached.lastAccessed = Date.now();
      return cached;
    }

    // Known to be missing
    if (this.missing.has(key)) {
      return null;
    }

    // Already loading
    if (this.loading.has(key)) {
      return this.loading.get(key)!;
    }

    // Create loading promise
    const loadPromise = this.fetchChunk(coords);
    this.loading.set(key, loadPromise);

    try {
      const result = await loadPromise;
      return result;
    } finally {
      this.loading.delete(key);
    }
  }

  /**
   * Fetches the chunk from the backend API
   */
  private async fetchChunk(coords: ChunkCoords): Promise<ChunkData | null> {
    const key = this.getChunkKey(coords);

    try {
      const response = await firstValueFrom(
        this.dataService.getChunkData(coords.x, coords.z, -60)
      );

      if (!response?.data?.surface_blocks?.length) {
        this.missing.add(key);
        return null;
      }

      const tileData = response.data.surface_blocks as (string | number)[][];
      const surfaceY = response.data.palette ?? 0; // Get surface height from API

      const chunkData: ChunkData = {
        coords,
        tileData,
        surfaceY,
        chunk: null,
        lastAccessed: Date.now(),
        state: 'loaded'
      };

      this.cache.set(key, chunkData);
      return chunkData;

    } catch (error) {
      console.warn(`Chunk (${coords.x}, ${coords.z}) not found`);
      this.missing.add(key);
      return null;
    }
  }

  /**
   * Checks if a chunk is in the visible area
   */
  private isVisible(coords: ChunkCoords): boolean {
    const visible = this.getVisibleChunkCoords();
    return visible.some(c => c.x === coords.x && c.z === coords.z);
  }

  /**
   * Checks if a chunk is in the preload range
   */
  private isInPreloadRange(coords: ChunkCoords): boolean {
    const chunkCam = this.worldToChunk(this.cameraX, this.cameraZ);
    const dist = Math.max(Math.abs(coords.x - chunkCam.x), Math.abs(coords.z - chunkCam.z));

    // Approximation: preload radius is based on visibility + margin
    // We consider preloading slightly further than visible area
    const visibleRadius = Math.ceil(this.viewportWidth / (CHUNK_SIZE * TILE_WIDTH * this.zoom));
    return dist <= visibleRadius + PRELOAD_RADIUS;
  }

  /**
   * Updates chunk loading (Visible + Preload)
   * Absolute priority to closest visible chunks.
   * Uses available slots up to MAX_CONCURRENT_LOADS.
   * Now triggers continuous loading to load all chunks in radius.
   */
  updateChunks(atlas: Atlas): void {
    // Store atlas for continuous loading
    this.continuousLoadingAtlas = atlas;

    // Start continuous loading if not already active
    if (!this.continuousLoadingActive) {
      this.startContinuousLoading();
    }

    // Also do immediate loading for responsiveness
    this.loadNextBatch();
  }

  /**
   * Starts the continuous loading loop
   * This will keep loading chunks until all in radius are loaded
   */
  private startContinuousLoading(): void {
    if (this.continuousLoadingActive) return;
    this.continuousLoadingActive = true;

    this.continuousLoadingLoop();
  }

  /**
   * Stops the continuous loading loop
   */
  stopContinuousLoading(): void {
    this.continuousLoadingActive = false;
  }

  /**
   * The main continuous loading loop
   * Checks every 100ms if there are more chunks to load
   */
  private continuousLoadingLoop(): void {
    if (!this.continuousLoadingActive) return;

    // Check if there are chunks to load
    const chunksToLoad = this.getChunksNeedingLoad();

    if (chunksToLoad.length > 0 && this.loading.size < MAX_CONCURRENT_LOADS) {
      this.loadNextBatch();
    }

    // Continue the loop - check again after a short delay
    // This allows the API to breathe between batches
    setTimeout(() => {
      this.continuousLoadingLoop();
    }, 150); // 150ms between batch checks
  }

  /**
   * Gets all chunks that need to be loaded (not cached, not loading, not missing)
   */
  private getChunksNeedingLoad(): ChunkCoords[] {
    const visibleCoords = this.getVisibleChunkCoords();
    const preloadCoords = this.getPreloadChunkCoords();

    const uniqueCoords = new Map<string, ChunkCoords>();
    visibleCoords.forEach(c => uniqueCoords.set(this.getChunkKey(c), c));
    preloadCoords.forEach(c => {
      const key = this.getChunkKey(c);
      if (!uniqueCoords.has(key)) uniqueCoords.set(key, c);
    });

    const allCoords = Array.from(uniqueCoords.values());

    // Filter to only chunks that need loading
    return allCoords.filter(coords => {
      const key = this.getChunkKey(coords);
      return !this.cache.has(key) && !this.loading.has(key) && !this.missing.has(key);
    });
  }

  /**
   * Loads the next batch of chunks (up to MAX_CONCURRENT_LOADS)
   */
  private loadNextBatch(): void {
    const atlas = this.continuousLoadingAtlas;
    if (!atlas) return;

    const visibleCoords = this.getVisibleChunkCoords();
    const preloadCoords = this.getPreloadChunkCoords();

    // Combine lists (visible prioritize)
    const uniqueCoords = new Map<string, ChunkCoords>();
    visibleCoords.forEach(c => uniqueCoords.set(this.getChunkKey(c), c));
    preloadCoords.forEach(c => {
      const key = this.getChunkKey(c);
      if (!uniqueCoords.has(key)) uniqueCoords.set(key, c);
    });

    const allCoords = Array.from(uniqueCoords.values());
    const cameraChunk = this.worldToChunk(this.cameraX, this.cameraZ);

    // Sort by distance to camera center (prioritize center strongly)
    allCoords.sort((a, b) => {
      // Use Euclidean distance squared for better center prioritization
      const distA = Math.pow(a.x - cameraChunk.x, 2) + Math.pow(a.z - cameraChunk.z, 2);
      const distB = Math.pow(b.x - cameraChunk.x, 2) + Math.pow(b.z - cameraChunk.z, 2);

      // Strong priority for visible chunks
      const isVisibleA = this.isVisible(a);
      const isVisibleB = this.isVisible(b);

      if (isVisibleA && !isVisibleB) return -1;
      if (!isVisibleA && isVisibleB) return 1;

      // For visible chunks, prioritize by distance from camera center
      // Chunks closest to camera center load first (concentric circles)
      return distA - distB;
    });

    // Start loading up to MAX_CONCURRENT_LOADS
    let currentLoading = this.loading.size;

    for (const coords of allCoords) {
      if (currentLoading >= MAX_CONCURRENT_LOADS) break;

      const key = this.getChunkKey(coords);
      let chunkData = this.cache.get(key);

      if (!chunkData && !this.loading.has(key) && !this.missing.has(key)) {
        currentLoading++;
        this.loadChunk(coords).then(loaded => {
          // Check relevance (if still visible/preloadable)
          if (!this.isVisible(coords) && !this.isInPreloadRange(coords)) return;

          if (loaded && !loaded.chunk && atlas?.getAtlas()) {
            loaded.chunk = new Chunk(Date.now(), atlas.getAtlas(), loaded.tileData);
          }
        });
      } else if (chunkData) {
        chunkData.lastAccessed = Date.now();
        if (!chunkData.chunk && atlas?.getAtlas()) {
          chunkData.chunk = new Chunk(Date.now(), atlas.getAtlas(), chunkData.tileData);
        }
      }
    }

    this.evictOldChunks();
  }

  /**
   * Calculates coordinates of chunks to preload
   * Uses velocity to predict where the camera is going
   */
  private getPreloadChunkCoords(): ChunkCoords[] {
    const coords: ChunkCoords[] = [];

    // Current position and predicted (0.5 seconds in future)
    const predictTime = 0.5; // seconds
    const predictedX = this.cameraX + this.cameraVelX * predictTime;
    const predictedZ = this.cameraZ + this.cameraVelZ * predictTime;

    // Chunks for predicted position
    const predictedChunk = this.worldToChunk(predictedX, predictedZ);

    // Adaptive preload radius based on speed
    const speed = Math.sqrt(this.cameraVelX * this.cameraVelX + this.cameraVelZ * this.cameraVelZ);
    const speedFactor = Math.min(2, 1 + speed / 100); // Faster speed = more preload

    const visibleRadius = Math.ceil(this.viewportWidth / (CHUNK_SIZE * TILE_WIDTH * this.zoom));
    const radius = Math.ceil((visibleRadius + PRELOAD_RADIUS) * speedFactor);

    // Elliptical shape in direction of movement
    const velNorm = Math.sqrt(this.cameraVelX * this.cameraVelX + this.cameraVelZ * this.cameraVelZ);
    const dirX = velNorm > 0.1 ? this.cameraVelX / velNorm : 0;
    const dirZ = velNorm > 0.1 ? this.cameraVelZ / velNorm : 0;

    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        // Stretch preload in movement direction
        const stretch = 1 + Math.max(0, (dx * dirX + dz * dirZ) / radius) * speedFactor;
        const dist = Math.sqrt(dx * dx + dz * dz);

        if (dist <= radius * stretch) {
          coords.push({
            x: predictedChunk.x + dx,
            z: predictedChunk.z + dz
          });
        }
      }
    }

    return coords;
  }

  /**
   * Blocking version for initial loading (compatibility)
   */
  async ensureVisibleChunksLoaded(atlas: Atlas): Promise<void> {
    // Just start async loading, do not block
    this.updateChunks(atlas);
  }

  // ==========================================================================
  // PRELOADING
  // ==========================================================================

  /**
   * Starts preloading chunks around current position
   */
  startPreloading(atlas: Atlas): void {
    if (this.isPreloading) return;
    this.isPreloading = true;

    // Run in background
    setTimeout(() => this.preloadNearbyChunks(atlas), 100);
  }

  /**
   * Preload chunks in a radius around the camera
   */
  private async preloadNearbyChunks(atlas: Atlas): Promise<void> {
    try {
      const cameraChunk = this.worldToChunk(this.cameraX, this.cameraZ);
      const toPreload: ChunkCoords[] = [];

      // Collect chunks to preload
      for (let dx = -PRELOAD_RADIUS; dx <= PRELOAD_RADIUS; dx++) {
        for (let dz = -PRELOAD_RADIUS; dz <= PRELOAD_RADIUS; dz++) {
          const coords = { x: cameraChunk.x + dx, z: cameraChunk.z + dz };
          const key = this.getChunkKey(coords);

          if (!this.cache.has(key) && !this.missing.has(key)) {
            toPreload.push(coords);
          }
        }
      }

      // Sort by distance
      toPreload.sort((a, b) => {
        const distA = Math.abs(a.x - cameraChunk.x) + Math.abs(a.z - cameraChunk.z);
        const distB = Math.abs(b.x - cameraChunk.x) + Math.abs(b.z - cameraChunk.z);
        return distA - distB;
      });

      // Load
      for (const coords of toPreload) {
        const loaded = await this.loadChunk(coords);
        if (loaded && !loaded.chunk && atlas?.getAtlas()) {
          loaded.chunk = new Chunk(Date.now(), atlas.getAtlas(), loaded.tileData);
        }
      }

      this.evictOldChunks();

    } finally {
      this.isPreloading = false;
    }
  }

  // ==========================================================================
  // CACHE MANAGEMENT
  // ==========================================================================

  /**
   * Evicts oldest chunks if cache is full (LRU)
   * NEVER evicts visible or preloading chunks
   */
  private evictOldChunks(): void {
    if (this.cache.size <= MAX_CACHE_SIZE) return;

    // Get keys of chunks that should NEVER be evicted
    const visibleKeys = new Set(this.getVisibleChunkCoords().map(c => this.getChunkKey(c)));
    const preloadKeys = new Set(this.getPreloadChunkCoords().map(c => this.getChunkKey(c)));
    const protectedKeys = new Set([...visibleKeys, ...preloadKeys]);

    // Filter out protected chunks before sorting
    const evictablEntries = Array.from(this.cache.entries())
      .filter(([key]) => !protectedKeys.has(key))
      .sort(([, a], [, b]) => a.lastAccessed - b.lastAccessed);

    // Calculate how many to remove
    const toRemoveCount = this.cache.size - MAX_CACHE_SIZE;
    const toRemove = evictablEntries.slice(0, toRemoveCount);

    for (const [key, data] of toRemove) {
      if (data.chunk) {
        data.chunk.destroy();
      }
      this.cache.delete(key);
    }
  }

  /**
   * Completely clears the cache
   */
  clearCache(): void {
    // Stop continuous loading
    this.stopContinuousLoading();

    for (const data of this.cache.values()) {
      if (data.chunk) {
        data.chunk.destroy();
      }
    }
    this.cache.clear();
    this.missing.clear();
    this.loading.clear();
    this.pendingLoads.clear();
  }

  // ==========================================================================
  // CAMERA CONTROLS
  // ==========================================================================

  /**
   * Sets camera position (in world/block coordinates)
   */
  setCameraPosition(x: number, z: number): void {
    // Calculate velocity based on movement
    const now = Date.now();
    if (this.lastCameraUpdate > 0) {
      const dt = (now - this.lastCameraUpdate) / 1000; // in seconds
      if (dt > 0 && dt < 1) { // Ignore large deltas
        this.cameraVelX = (x - this.cameraX) / dt;
        this.cameraVelZ = (z - this.cameraZ) / dt;

        // Limit velocity to avoid extreme values
        const maxVel = 500; // blocks/second max
        this.cameraVelX = Math.max(-maxVel, Math.min(maxVel, this.cameraVelX));
        this.cameraVelZ = Math.max(-maxVel, Math.min(maxVel, this.cameraVelZ));
      }
    }

    this.cameraX = x;
    this.cameraZ = z;
    this.lastCameraUpdate = now;
  }

  /**
   * Moves camera by a delta (in world coordinates)
   */
  moveCamera(deltaX: number, deltaZ: number): void {
    this.setCameraPosition(this.cameraX + deltaX, this.cameraZ + deltaZ);
    // Force immediate batch reload to prioritize new position
    this.loadNextBatch();
  }

  /**
   * Pans camera from a screen delta (drag)
   */
  panCamera(screenDeltaX: number, screenDeltaY: number): void {
    // Convert screen delta to world delta (inverse of iso projection)
    const sx = (TILE_WIDTH / 2) * this.zoom;
    const sy = (TILE_HEIGHT / 2) * this.zoom;

    const relX = screenDeltaX / sx;
    const relY = screenDeltaY / sy;

    // Inverse isometric
    const worldDX = (relX + relY) / 2;
    const worldDZ = (relY - relX) / 2;

    // Move in opposite direction of drag
    this.moveCamera(-worldDX, -worldDZ);

    // Refresh visible chunks' lastAccessed to protect them from eviction
    this.refreshVisibleChunksAccess();
  }

  /**
   * Updates lastAccessed for all currently visible chunks
   * This protects them from LRU eviction when moving around
   */
  refreshVisibleChunksAccess(): void {
    const now = Date.now();
    const visibleCoords = this.getVisibleChunkCoords();

    for (const coords of visibleCoords) {
      const key = this.getChunkKey(coords);
      const chunkData = this.cache.get(key);
      if (chunkData) {
        chunkData.lastAccessed = now;
      }
    }
  }

  /**
   * Returns current camera position
   */
  getCameraPosition(): { x: number; z: number } {
    return { x: this.cameraX, z: this.cameraZ };
  }

  // ==========================================================================
  // ZOOM CONTROLS
  // ==========================================================================

  /**
   * Sets zoom level (clamped between MIN_ZOOM and MAX_ZOOM)
   */
  setZoom(newZoom: number): void {
    this.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom));
  }

  /**
   * Returns current zoom level
   */
  getZoom(): number {
    return this.zoom;
  }

  // ==========================================================================
  // VIEWPORT
  // ==========================================================================

  /**
   * Updates viewport size
   */
  setViewportSize(width: number, height: number): void {
    this.viewportWidth = width;
    this.viewportHeight = height;
  }

  // ==========================================================================
  // ACCESSORS (for rendering)
  // ==========================================================================

  /**
   * Retrieves chunk data by coordinates
   */
  getChunkData(coords: ChunkCoords): ChunkData | undefined {
    return this.cache.get(this.getChunkKey(coords));
  }

  /**
   * Checks if a chunk is marked as missing (404)
   */
  isChunkMissing(coords: ChunkCoords): boolean {
    return this.missing.has(this.getChunkKey(coords));
  }

  /**
   * Cache statistics (debug)
   */
  getCacheStats() {
    return {
      total: this.cache.size,
      visible: this.getVisibleChunks().length,
      cached: this.cache.size,
      loading: this.loading.size
    };
  }

  /**
   * Returns radius loading status for debug
   * Shows how many chunks are loaded vs total in radius
   */
  getRadiusStatus(): { loaded: number; total: number; pending: number; complete: boolean } {
    const visibleCoords = this.getVisibleChunkCoords();
    const preloadCoords = this.getPreloadChunkCoords();

    // Unique chunks in radius
    const uniqueCoords = new Map<string, ChunkCoords>();
    visibleCoords.forEach(c => uniqueCoords.set(this.getChunkKey(c), c));
    preloadCoords.forEach(c => {
      const key = this.getChunkKey(c);
      if (!uniqueCoords.has(key)) uniqueCoords.set(key, c);
    });

    const total = uniqueCoords.size;
    let loaded = 0;
    let pending = 0;

    for (const [key, coords] of uniqueCoords) {
      if (this.cache.has(key) || this.missing.has(key)) {
        loaded++;
      } else if (this.loading.has(key)) {
        pending++;
      }
    }

    return {
      loaded,
      total,
      pending,
      complete: loaded === total
    };
  }
}
