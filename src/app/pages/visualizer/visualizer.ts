import { Component, ElementRef, ViewChild, PLATFORM_ID, inject  } from '@angular/core';
import { Router } from '@angular/router';
import { isPlatformBrowser } from '@angular/common';
import { DataService } from '../../services/data.service';
import * as PIXI from 'pixi.js';
import { Atlas } from '../../services/atlas';
import { Chunk } from '../../factories/chunk';
import { firstValueFrom, BehaviorSubject } from 'rxjs';
import { ChunkManager } from '../../services/chunk-manager.service';
import { ErrorModalService} from '../../services/error.service';


@Component({
  selector: 'app-visualizer',
  imports: [],
  templateUrl: './visualizer.html',
  styleUrl: './visualizer.less',
  providers: [DataService, ChunkManager]
})
export class VisualizerPage  { //implements AfterViewInit

  private platformId = inject(PLATFORM_ID);
  public app!: PIXI.Application;
  public atlasLoader = new Atlas();
  public chunk!: Chunk;
  protected dragging: boolean=false;
  public mouseX : BehaviorSubject<number> = new BehaviorSubject<number>(0);
  public mouseY : BehaviorSubject<number> = new BehaviorSubject<number>(0);

  // New chunk management system
  private chunkManager!: ChunkManager;
  private worldContainer!: PIXI.Container;
  private placeholderContainer!: PIXI.Container;
  private isDragging = false;
  private lastMouseX = 0;
  private lastMouseY = 0;
  private renderLoopId: number | null = null;
  private chunkUpdateScheduled = false;
  private chunkUpdateTimeout: any = null;
  private renderedChunkKeys = new Set<string>();
  private chunkPlaceholders = new Map<string, PIXI.Graphics>();
  private invalidChunkPlaceholders = new Map<string, PIXI.Graphics>();
  private hasAutocentered = false;
  private debugElement: HTMLElement | null = null;

  @ViewChild('canvasContainer', {static: true}) canvasContainer!: ElementRef;

  constructor(private router: Router, private dataService: DataService, private chunkManagerService: ChunkManager, private errorModalService: ErrorModalService) {
    this.createDebugOverlay();
  }

  private createDebugOverlay() {
    this.debugElement = document.createElement('div');
    this.debugElement.style.position = 'absolute';
    this.debugElement.style.top = '10px';
    this.debugElement.style.left = '10px';
    this.debugElement.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    this.debugElement.style.color = 'white';
    this.debugElement.style.padding = '10px';
    this.debugElement.style.fontFamily = 'monospace';
    this.debugElement.style.pointerEvents = 'none';
    this.debugElement.style.zIndex = '1000';
    document.body.appendChild(this.debugElement);
  }

  private updateDebugInfo() {
    if (!this.debugElement) return;

    const stats = this.chunkManager.getCacheStats();
    const camera = this.chunkManager.getCameraPosition();
    const zoom = this.chunkManager.getZoom();
    const visibleChunks = this.chunkManager.getVisibleChunkCoords().length;

    this.debugElement.innerHTML = `
      <div><strong>Camera:</strong> (${camera.x.toFixed(1)}, ${camera.z.toFixed(1)})</div>
      <div><strong>Zoom:</strong> ${zoom.toFixed(2)}</div>
      <div><strong>Chunks:</strong> ${visibleChunks} visible / ${stats.total} cached</div>
      <div><strong>Loading:</strong> ${stats.loading}</div>
      <div><strong>Rendered:</strong> ${this.worldContainer.children.length}</div>
    `;
  }

  goBack(): void {
    this.router.navigate(['/']);
  }


  private async waitForWorldLoaded(): Promise<void> {
    const MAX_ATTEMPTS = 3;
    let attempts = 0;

    return new Promise((resolve, reject) => {
      const checkWorldLoaded = async () => {
        try {
          const data = await firstValueFrom(this.dataService.checkWorldHealth());

          if (data.world_loaded) {
            console.log('World is loaded, proceeding with initialization');
            resolve();
            return;
          }

          attempts++;
          console.log(`World not loaded yet (attempt ${attempts}/${MAX_ATTEMPTS}), waiting...`);

          if (attempts >= MAX_ATTEMPTS) {
            console.error('No world found after multiple attempts');
            this.handleNoWorldAvailable();
            reject(new Error('No world loaded'));
            return;
          }

        } catch (error) {
          console.warn('Failed to check world status:', error);
          attempts++;

          if (attempts >= MAX_ATTEMPTS) {
            this.handleConnectionError();
            reject(error);
            return;
          }
        }

        setTimeout(checkWorldLoaded, 2000);
      };

      checkWorldLoaded();
    });
  }


  private async handleNoWorldAvailable(): Promise<void> {
    await this.errorModalService.showError(
      'No World Found',
      'Please upload a world first.',
      'Go back to home'
    );
    await this.router.navigate(['/']);
  }


  private async handleConnectionError(): Promise<void> {
    await this.errorModalService.showError(
      'Connexion Error',
      'Cannot connect to the server. Please try again later.',
      'Go back to home'
    );
    await this.router.navigate(['/']);
  }



  async ngOnInit() {
    if (!isPlatformBrowser(this.platformId)) {
      return; // Skip on server-side rendering
    }

    // Initialize ChunkManager
    this.chunkManager = this.chunkManagerService;
    this.chunkManager.setViewportSize(window.innerWidth, window.innerHeight);

    await this.initPixiScene();

    // Wait for world to be loaded before proceeding
    await this.waitForWorldLoaded();

    try {
      console.log('Initializing world viewer...');

      // Create placeholder container (behind chunks)
      this.placeholderContainer = new PIXI.Container();
      this.placeholderContainer.x = 0;
      this.placeholderContainer.y = 0;
      this.app.stage.addChild(this.placeholderContainer);
      
      // Create world container for all chunks (on top of placeholders)
      this.worldContainer = new PIXI.Container();
      this.worldContainer.x = 0;
      this.worldContainer.y = 0;
      this.app.stage.addChild(this.worldContainer);

      // Load atlas
      const start = performance.now();
      await this.atlasLoader.load('iso_cube.json');
      const atlas = this.atlasLoader.getAtlas();
      const end = performance.now();
      console.log("Atlas loading duration:", (end - start)/1000, "s");

      if (!atlas) {
        throw new Error('Failed to load atlas');
      }

      // Initial camera position at (0, 0) - will be auto-centered on the first chunk
      this.chunkManager.setCameraPosition(0, 0);
      this.chunkManager.setZoom(1.0);
      console.log('Waiting for first chunk to auto-center...');

      // Setup input handling FIRST (to allow navigation immediately)
      this.setupInputHandling();

      // Start render loop FIRST (to display chunks as soon as they arrive)
      this.startRenderLoop();

      // Start chunk loading (non-blocking)
      this.chunkManager.updateChunks(this.atlasLoader);

      console.log('World viewer initialized - chunks loading in background...');

    } catch (error) {
      console.error('Failed to initialize world viewer:', error);
    }
  }

  private async initPixiScene() {
    this.app = new PIXI.Application();
    await this.app.init({
      width: window.innerWidth,
      height: window.innerHeight,
      backgroundColor: 0x77b5fe,
      antialias: true,     // Enable antialiasing
      resolution: 1,       // Resolution / device pixel ratio
      preference: 'webgl', // or 'webgl' // but as webgpu is now supported by chrome , lets use it cuz we get better performance as we use the gpu to render
    });

    //document.body.appendChild(this.app.canvas);
    this.canvasContainer.nativeElement.appendChild(this.app.canvas);

    window.addEventListener('resize', () => this.onWindowResize());
  }

  private onWindowResize() {
    if (!this.app) return;

    this.app.renderer.resize(window.innerWidth, window.innerHeight);
    this.chunkManager.setViewportSize(window.innerWidth, window.innerHeight);

    this.scheduleChunkUpdate();
  }

  /**
   * Setup mouse and keyboard input handling
   */
  private setupInputHandling(): void {
    // Mouse wheel for zoom
    this.app.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomDelta = e.deltaY > 0 ? 0.9 : 1.1;
      const newZoom = this.chunkManager.getZoom() * zoomDelta;
      this.chunkManager.setZoom(newZoom);
      console.log(`Zoom: ${newZoom.toFixed(2)}x`);

      this.scheduleChunkUpdate();
    });

    // Mouse events for dragging
    this.app.stage.eventMode = 'static';
    this.app.stage.on('pointerdown', (e) => {
      this.isDragging = true;
      this.lastMouseX = e.global.x;
      this.lastMouseY = e.global.y;
      this.app.canvas.style.cursor = 'grabbing';
    });

    this.app.stage.on('pointermove', (e) => {
      if (!this.isDragging) return;

      const deltaX = e.global.x - this.lastMouseX;
      const deltaY = e.global.y - this.lastMouseY;

      // Let ChunkManager convert screen-space drag into world-space camera movement
      this.chunkManager.panCamera(deltaX, deltaY);

      // Fast update: only update positions of currently rendered chunks
      this.updateRenderPositions();
      
      // Debounce the heavy chunk loading/checking
      this.scheduleChunkUpdate();

      this.lastMouseX = e.global.x;
      this.lastMouseY = e.global.y;
    });

    this.app.stage.on('pointerup', () => {
      this.isDragging = false;
      this.app.canvas.style.cursor = 'grab';
    });

    this.app.stage.on('pointerleave', () => {
      this.isDragging = false;
      this.app.canvas.style.cursor = 'default';
    });

    // Keyboard controls
    window.addEventListener('keydown', (e) => {
      const moveSpeed = 16 / this.chunkManager.getZoom();
      switch (e.key) {
        case 'ArrowUp':
        case 'z':
        case 'Z':
          e.preventDefault();
          this.chunkManager.moveCamera(0, -moveSpeed);
          break;
        case 'ArrowDown':
        case 's':
        case 'S':
          e.preventDefault();
          this.chunkManager.moveCamera(0, moveSpeed);
          break;
        case 'ArrowLeft':
        case 'q':
        case 'Q':
          e.preventDefault();
          this.chunkManager.moveCamera(-moveSpeed, 0);
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          e.preventDefault();
          this.chunkManager.moveCamera(moveSpeed, 0);
          break;
        case '+':
        case '=':
          e.preventDefault();
          this.chunkManager.setZoom(this.chunkManager.getZoom() * 1.2);
          break;
        case '-':
          e.preventDefault();
          this.chunkManager.setZoom(this.chunkManager.getZoom() * 0.8);
          break;
      }

      this.scheduleChunkUpdate();
    });

    // Set initial cursor
    this.app.canvas.style.cursor = 'grab';
  }

  /**
   * Start the render loop that updates visible chunks
   */
  private startRenderLoop(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    const loop = () => {
      this.updateRenderPositions();
      this.updateDebugInfo(); // Update debug info every frame
      this.renderChunks();
      this.renderLoopId = requestAnimationFrame(loop);
    };

    this.renderLoopId = requestAnimationFrame(loop);
  }

  private scheduleChunkUpdate(): void {
    if (this.chunkUpdateTimeout) {
      clearTimeout(this.chunkUpdateTimeout);
    }

    this.chunkUpdateTimeout = setTimeout(() => {
      if (this.chunkUpdateScheduled) return;
      
      this.chunkUpdateScheduled = true;
      requestAnimationFrame(() => {
        this.chunkUpdateScheduled = false;
        this.updateVisibleChunks();
      });
    }, 50); // 50ms debounce
  }

  /**
   * Update which chunks are visible and ensure they're loaded
   * Non-blocking to allow fluid navigation
   */
  private updateVisibleChunks(): void {
    // Start loading visible chunks (non-blocking)
    this.chunkManager.updateChunks(this.atlasLoader);
  }

  /**
   * Fast update of chunk positions without checking visibility/loading
   * Backend sends absolute coordinates, so we just move the worldContainer
   */
  private updateRenderPositions(): void {
    const cameraOffset = this.chunkManager.getCameraScreenOffset();
    const offsetX = window.innerWidth / 2 + cameraOffset.x * this.chunkManager.getZoom();
    const offsetY = window.innerHeight / 2 + cameraOffset.y * this.chunkManager.getZoom();
    
    this.worldContainer.x = offsetX;
    this.worldContainer.y = offsetY;
    this.placeholderContainer.x = offsetX;
    this.placeholderContainer.y = offsetY;
  }

  /**
   * Render all visible chunks to the screen
   */
  private renderChunks(): void {
    const visibleChunks = this.chunkManager.getVisibleChunks();
    const newVisibleKeys = new Set(visibleChunks.map(c => this.chunkManager.getChunkKey(c.coords)));

    // Apply zoom on both containers
    const zoom = this.chunkManager.getZoom();
    this.worldContainer.scale.set(zoom);
    this.placeholderContainer.scale.set(zoom);
    
    // Apply camera offset - backend sends absolute positions
    const cameraOffset = this.chunkManager.getCameraScreenOffset();
    const offsetX = window.innerWidth / 2 + cameraOffset.x * zoom;
    const offsetY = window.innerHeight / 2 + cameraOffset.y * zoom;
    this.worldContainer.x = offsetX;
    this.worldContainer.y = offsetY;
    this.placeholderContainer.x = offsetX;
    this.placeholderContainer.y = offsetY;
    
    // Manage placeholders for loading and invalid chunks
    const visibleCoords = this.chunkManager.getVisibleChunkCoords();
    const loadingKeys = new Set<string>();
    const invalidKeys = new Set<string>();
    
    // Create/update placeholders for visible chunks
    for (const coords of visibleCoords) {
      const key = this.chunkManager.getChunkKey(coords);
      const chunkData = this.chunkManager.getChunkData(coords);
      const isMissing = this.chunkManager.isChunkMissing(coords);
      
      // If the chunk is marked as missing (404)
      if (isMissing) {
        invalidKeys.add(key);
        
        // Create a white/grey placeholder for invalid chunk if it doesn't exist
        if (!this.invalidChunkPlaceholders.has(key)) {
          const placeholder = new PIXI.Graphics();
          
          // Draw white/grey diamond to indicate invalid chunk
          const size = 16 * 16; // 16 tiles * 16 pixels half-width
          placeholder.lineStyle(1, 0xCCCCCC, 0.3);
          placeholder.beginFill(0xFFFFFF, 0.05);
          
          // Isometric diamond
          placeholder.moveTo(0, -size/2);
          placeholder.lineTo(size, 0);
          placeholder.lineTo(0, size/2);
          placeholder.lineTo(-size, 0);
          placeholder.closePath();
          
          placeholder.endFill();
          
          // Position according to chunk isometric coordinates
          const worldX = coords.x * 16 + 8;
          const worldZ = coords.z * 16 + 8;
          placeholder.x = (worldX - worldZ) * 16;  // TILE_WIDTH/2 = 16
          placeholder.y = (worldX + worldZ) * 8;   // TILE_HEIGHT/2 = 8
          
          placeholder.alpha = 0.2;
          
          this.invalidChunkPlaceholders.set(key, placeholder);
          this.placeholderContainer.addChild(placeholder);
        }
      }
      // If the chunk is not loaded yet (but not invalid)
      else if (!chunkData || !chunkData.chunk) {
        loadingKeys.add(key);
        
        // Remove invalid placeholder if it existed
        if (this.invalidChunkPlaceholders.has(key)) {
          const invalidPlaceholder = this.invalidChunkPlaceholders.get(key)!;
          this.placeholderContainer.removeChild(invalidPlaceholder);
          invalidPlaceholder.destroy();
          this.invalidChunkPlaceholders.delete(key);
        }
        
        // Create a green loading placeholder if it doesn't exist
        if (!this.chunkPlaceholders.has(key)) {
          const placeholder = new PIXI.Graphics();
          
          // Draw green diamond for loading
          const size = 16 * 16; // 16 tiles * 16 pixels half-width
          placeholder.lineStyle(2, 0x4CAF50, 0.5);
          placeholder.beginFill(0x2E7D32, 0.1);
          
          // Isometric diamond
          placeholder.moveTo(0, -size/2);
          placeholder.lineTo(size, 0);
          placeholder.lineTo(0, size/2);
          placeholder.lineTo(-size, 0);
          placeholder.closePath();
          
          placeholder.endFill();
          
          // Position according to chunk isometric coordinates
          const worldX = coords.x * 16 + 8;
          const worldZ = coords.z * 16 + 8;
          placeholder.x = (worldX - worldZ) * 16;  // TILE_WIDTH/2 = 16
          placeholder.y = (worldX + worldZ) * 8;   // TILE_HEIGHT/2 = 8
          
          // Pulsing animation
          placeholder.alpha = 0.3;
          
          this.chunkPlaceholders.set(key, placeholder);
          this.placeholderContainer.addChild(placeholder);
        }
        
        // Animate loading placeholder (pulsing)
        const placeholder = this.chunkPlaceholders.get(key)!;
        placeholder.alpha = 0.3 + Math.sin(Date.now() / 500 + coords.x + coords.z) * 0.2;
      }
    }
    
    // Remove loading placeholders that are no longer needed
    for (const [key, placeholder] of this.chunkPlaceholders) {
      if (!loadingKeys.has(key)) {
        this.placeholderContainer.removeChild(placeholder);
        placeholder.destroy();
        this.chunkPlaceholders.delete(key);
      }
    }
    
    // Remove invalid placeholders that are no longer visible
    for (const [key, placeholder] of this.invalidChunkPlaceholders) {
      if (!invalidKeys.has(key)) {
        this.placeholderContainer.removeChild(placeholder);
        placeholder.destroy();
        this.invalidChunkPlaceholders.delete(key);
      }
    }

    // Remove chunks that are no longer visible from PIXI container
    // This frees up GPU memory but keeps data in JS cache
    for (const key of this.renderedChunkKeys) {
      if (!newVisibleKeys.has(key)) {
        const [x, z] = key.split(',').map(Number);
        const chunkData = this.chunkManager.getChunkData({x, z});
        if (chunkData?.chunk) {
          // Remove from container
          this.worldContainer.removeChild(chunkData.chunk.getTilemap());
          // Optional: Destroy PIXI object if memory is tight, but keeping it allows fast scroll back
          // chunkData.chunk.destroy(); 
          // chunkData.chunk = null; 
        }
      }
    }

    // Add visible chunks - all at position (0,0) because backend provides absolute coordinates
    for (const chunkData of visibleChunks) {
      if (chunkData.chunk) {
        // Chunks at (0,0) - backend calculates absolute tile positions
        chunkData.chunk.setXY(0, 0);
        
        // Z-order based on chunk coords (x+z for isometric back-to-front)
        const tilemap = chunkData.chunk.getTilemap();
        tilemap.zIndex = chunkData.coords.x + chunkData.coords.z;

        // Add to container if not already present
        const key = this.chunkManager.getChunkKey(chunkData.coords);
        if (!this.renderedChunkKeys.has(key)) {
          this.worldContainer.addChild(tilemap);
          
          // Auto-center on the first VALID rendered chunk
          if (!this.hasAutocentered) {
            // Check that chunk has data (not a 404)
            if (chunkData.tileData && chunkData.tileData.length > 0) {
              this.hasAutocentered = true;
              
              // Center camera on this chunk (perfect chunk center)
              const centerWorldX = chunkData.coords.x * 16 + 8; // Exact center of chunk in world
              const centerWorldZ = chunkData.coords.z * 16 + 8;
              
              console.log(`Auto-centering camera on first valid chunk at (${chunkData.coords.x}, ${chunkData.coords.z}) with ${chunkData.tileData.length} tiles`);
              
              // Immediate perfect centering (no animation for the first chunk)
              this.chunkManager.setCameraPosition(centerWorldX, centerWorldZ);
              
              // Force immediate update
              this.updateRenderPositions();
              this.updateVisibleChunks(); // Load neighbor chunks immediately
            }
          }
        }
      }
    }

    // Enable zIndex sorting
    this.worldContainer.sortableChildren = true;

    // Update rendered keys set
    this.renderedChunkKeys = newVisibleKeys;
  }

  /**
   * Smoothly animates the camera to a target position
   * Uses ease-in-out interpolation for natural movement
   */
  private animateCameraTo(targetX: number, targetZ: number, duration: number): void {
    const currentPos = this.chunkManager.getCameraPosition();
    const startX = currentPos.x;
    const startZ = currentPos.z;
    const startTime = Date.now();
    
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Easing function (ease-in-out)
      // Quadratic easing for smooth start/end
      const eased = progress < 0.5
        ? 2 * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 2) / 2;
      
      // Linear interpolation with eased progress
      const currentX = startX + (targetX - startX) * eased;
      const currentZ = startZ + (targetZ - startZ) * eased;
      
      this.chunkManager.setCameraPosition(currentX, currentZ);
      this.updateRenderPositions();
      
      // Continue animation if not finished
      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        // Trigger chunk update after animation completes
        this.updateVisibleChunks();
      }
    };
    
    animate();
  }

  ngOnDestroy() {
    // Remove debug overlay
    if (this.debugElement && document.body.contains(this.debugElement)) {
      document.body.removeChild(this.debugElement);
    }

    // Cancel render loop
    if (this.renderLoopId !== null) {
      cancelAnimationFrame(this.renderLoopId);
    }

    if (!isPlatformBrowser(this.platformId)) {
      return;
    }

    if (this.app) {
      this.app.destroy(true);
    }

    // Clear chunk cache
    if (this.chunkManager) {
      this.chunkManager.clearCache();
    }
    
    // Clear rendered chunks tracking
    this.renderedChunkKeys.clear();

    window.removeEventListener('resize', () => this.onWindowResize());
  }
}
