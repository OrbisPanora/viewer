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
  private isDragging = false;
  private lastMouseX = 0;
  private lastMouseY = 0;
  private renderLoopId: number | null = null;
  private chunkUpdateScheduled = false;
  private chunkUpdateTimeout: any = null;
  private renderedChunkKeys = new Set<string>();

  @ViewChild('canvasContainer', {static: true}) canvasContainer!: ElementRef;

  constructor(private router: Router, private dataService: DataService, private chunkManagerService: ChunkManager, private errorModalService: ErrorModalService) {}

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

      // Create world container for all chunks
      this.worldContainer = new PIXI.Container({isRenderGroup: true});
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

      // Initial camera position at the center of the first chunk (0,0)
      this.chunkManager.setCameraPosition(8, 8);
      this.chunkManager.setZoom(1.0);

      // Load initial visible chunks
      await this.chunkManager.ensureVisibleChunksLoaded(this.atlasLoader);

      // Start preloading in background
      this.chunkManager.startPreloading(this.atlasLoader);

      // Setup input handling
      this.setupInputHandling();

      // Start render loop
      this.startRenderLoop();

      console.log('World viewer initialized successfully');

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
    const render = () => {
      // Only render already loaded chunks; loading is scheduled separately
      this.renderChunks();

      // Continue the loop
      this.renderLoopId = requestAnimationFrame(render);
    };

    render();
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
   */
  private async updateVisibleChunks(): Promise<void> {
    try {
      // Ensure visible chunks are loaded
      await this.chunkManager.ensureVisibleChunksLoaded(this.atlasLoader);

      // Update rendering
      this.renderChunks();

      // Start preloading if not already running
      this.chunkManager.startPreloading(this.atlasLoader);

    } catch (error) {
      console.warn('Failed to update visible chunks:', error);
    }
  }

  /**
   * Fast update of chunk positions without checking visibility/loading
   */
  private updateRenderPositions(): void {
    for (const key of this.renderedChunkKeys) {
      const [x, z] = key.split(',').map(Number);
      const chunkData = this.chunkManager.getChunkData({x, z});
      
      if (chunkData && chunkData.chunk) {
         const chunkWorldX = chunkData.coords.x * 1.1; 
         const chunkWorldZ = chunkData.coords.z * 1.1;
         
         const screenPos = this.chunkManager.worldToScreen(chunkWorldX, chunkWorldZ);
         chunkData.chunk.setXY(screenPos.screenX, screenPos.screenY);
      }
    }
  }

  /**
   * Render all visible chunks to the screen
   */
  private renderChunks(): void {
    const visibleChunks = this.chunkManager.getVisibleChunks();
    const newVisibleKeys = new Set(visibleChunks.map(c => this.chunkManager.getChunkKey(c.coords)));

    // Apply zoom and centering on the world container
    const zoom = this.chunkManager.getZoom();
    this.worldContainer.scale.set(zoom);
    this.worldContainer.x = window.innerWidth / 2;
    this.worldContainer.y = window.innerHeight / 2;

    // Remove chunks that are no longer visible
    for (const key of this.renderedChunkKeys) {
      if (!newVisibleKeys.has(key)) {
        const [x, z] = key.split(',').map(Number);
        const chunkData = this.chunkManager.getChunkData({x, z});
        if (chunkData?.chunk) {
          this.worldContainer.removeChild(chunkData.chunk.getTilemap());
        }
      }
    }

    // Add or update visible chunks
    for (const chunkData of visibleChunks) {
      if (chunkData.chunk) {
        // Calculate chunk position in screen coordinates
        // Using factor 1.1 based on user feedback to fine-tune spacing.
        const chunkWorldX = chunkData.coords.x * 1.1; 
        const chunkWorldZ = chunkData.coords.z * 1.1;

        const screenPos = this.chunkManager.worldToScreen(chunkWorldX, chunkWorldZ);

        // Position the chunk in local container space (before zoom/translation)
        chunkData.chunk.setXY(screenPos.screenX, screenPos.screenY);

        // Add to container if not already present
        const key = this.chunkManager.getChunkKey(chunkData.coords);
        if (!this.renderedChunkKeys.has(key)) {
          this.worldContainer.addChild(chunkData.chunk.getTilemap());
        }
      }
    }

    // Update rendered keys set
    this.renderedChunkKeys = newVisibleKeys;

    // Debug, dev only (/!\ please remove when deploying /!\)
    const stats = this.chunkManager.getCacheStats();
    const camera = this.chunkManager.getCameraPosition();
    console.log(`Camera: (${camera.x.toFixed(1)}, ${camera.z.toFixed(1)}) | Chunks: ${stats.visible}/${stats.total}`);
  }

  ngOnDestroy() {
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
