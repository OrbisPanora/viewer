import { Component, inject, PLATFORM_ID, OnDestroy, ElementRef, ViewChild  } from '@angular/core';
import { Router } from '@angular/router';
import * as THREE from 'three';
import { DataService } from '../../services/data.service';
import { SurfaceFactory } from '../../factories/surface.factory';
import { SurfaceBlocks } from '../../models/surface-blocks.model';
import { isPlatformBrowser } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { BlockTwoFactory } from '../../factories/block-two.factory';

import JSONK from '../../../../public/test4.json';

@Component({
  selector: 'app-visualizer',
  imports: [],
  templateUrl: './visualizer.html',
  styleUrl: './visualizer.less',
  providers: [DataService]
})
export class VisualizerPage  { //implements AfterViewInit

  private platformId = inject(PLATFORM_ID);
  public scene!: THREE.Scene;
  public camera!: THREE.PerspectiveCamera; //THREE.OrthographicCamera; //THREE.PerspectiveCamera;
  public renderer!: THREE.WebGLRenderer;
  public surfaceFactory!: SurfaceFactory;
  public textureLoader!: THREE.TextureLoader;
  private animationFrameId!: number;

  // Variables pour les contrôles de la caméra
  private isDragging = false;
  private previousMousePosition = { x: 0, y: 0 };
  private cameraSpeed = 0.005;

  @ViewChild('canvasContainer', {static: true}) canvasContainer!: ElementRef;

  constructor(private router: Router, private dataService: DataService) {}

  goBack(): void {
    this.router.navigate(['/']);
  }


  private animate() {
    this.animationFrameId = requestAnimationFrame(() => this.animate());

    this.renderer.render(this.scene, this.camera);
  }

  private sumYMoyenne(yValues: number[]): number {
    const total = yValues.reduce((acc, val) => acc + val, 0);
    return total / yValues.length;
  }


  async ngOnInit() { //ngAfterViewInit
    if (!isPlatformBrowser(this.platformId)) {
      return; // Skip on server-side rendering
    }

    this.initScene();

    // fair ca corectement
    // a tester : -21 -7 ; -22 -12 ; -18 7 ; -18 -9
    //let data = await firstValueFrom(this.dataService.getJSONData('chunks', -6, 3)); 
    //console.log("data recupere :", data);
    let dict: {[key: string]: SurfaceBlocks[]; } = JSONK["data"]["surface_blocks"][0]; //data["data"]["surface_blocks"][0];
    //let texture_dict = await firstValueFrom(this.dataService.postDictBlocks(dict));
    //console.log("textures : ", texture_dict)
    // dict a envoyer a cris



    let x, y, order = 0;
    let blockModel;
    let images, left_image, top_image;
    let color : number = 0xffffff;
    let count = JSONK["data"]["surface_blocks"].length; //data["data"]["surface_blocks"].length;
    console.log(count);
    let block : string;
    let block_data : SurfaceBlocks[];
    
    let surface_block: SurfaceBlocks;
    let coordinates: number[][];
    let coordinate : number[];
    let m = new THREE.Matrix4();
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion(); // rotation identique pour tout le monde
    const scale = new THREE.Vector3();

    let counter = 0;
    // a continuer
    for (block in dict){
      block_data = dict[block];
      console.log(block, block_data);
      for (surface_block of block_data){
        // cree instance mesh icis
        let images = await this.recupeJSON(block, surface_block["biome"]);
        top_image = images[0];
        left_image = images[1];


        this.surfaceFactory = new BlockTwoFactory('iso_blocks/' + top_image, 'iso_blocks/' + left_image, this.textureLoader)
        coordinates = surface_block["coordinates"]
        console.log(top_image, left_image);

        let len = coordinates.length;

        if (top_image != null) {
          blockModel = await this.surfaceFactory.create_InstancedMesh_all(len, color);
        }
        else if (left_image != null) {
          blockModel = await this.surfaceFactory.create_InstancedMesh_left(len, color);
        }
        else {
          console.log("TODO")
          // TODO 
        }
        
        counter = 0;
        for (coordinate of coordinates){
          if(coordinate.length != 0){

            if (top_image != null){
              m.makeTranslation(coordinate[0], coordinate[2], 0); // -coordinate[1]
              blockModel.instancedMeshTop.setMatrixAt(counter, m);

              m.makeTranslation(coordinate[0]-0.08, coordinate[2]-0.12, 0);
              blockModel.instancedMeshLeft.setMatrixAt(counter, m);

              pos.set(coordinate[0]+0.08, coordinate[2]-0.12, 0);
              scale.set(1,-1,1);
              quat.set(0, 0, 0, 1);
              m.compose(pos, quat, scale);
              blockModel.instancedMeshRight.setMatrixAt(counter, m);
            }
            else if (left_image != null){
              m.makeTranslation(coordinate[0]-0.08, coordinate[2]-0.12, 0);
              blockModel.instancedMeshLeft.setMatrixAt(counter, m);
            }
            else{
              console.log("TEST");
            }
          
          
          }
          // if(coordinate[1]!=0){
          //   blockModel.instance_ordrer(order*coordinate[1]);
          // }
          blockModel.instance_ordrer(order);
          counter = counter + 1;
          order=order+1; 
        }
        blockModel.save(this.scene);
        //afficher ici
      }
      //   x=block["x"];
      //   y=block["z"];


      //   if (block["block"].split(":")[1] == "vine") continue;
      //   images = await firstValueFrom(this.dataService.getNomTexture(block["block"].split(":")[1], block["biome"].split(":")[1], JSON.stringify(block["properties"])));
  
      //   top_image = images.data.textures.top;
      //   left_image = images.data.textures.left;
      //   color = images.data.textures.color ? parseInt(images.data.textures.color.slice(1), 16) : 0xffffff;
        

      //   //break;
      //   console.log("TEST");
      //   this.surfaceFactory = new BlockTwoFactory('iso_blocks/' + top_image, 'iso_blocks/' + left_image, this.textureLoader);
      //   if (top_image == null) {
      //     blockModel = await this.surfaceFactory.create_only_right("left", x, y, color); // bottom --> right pour les cotes
      //   }
      //   else if (left_image == null) {
      //     blockModel = await this.surfaceFactory.create_only_top("left", x, y, color);
      //   } else {
      //     blockModel = await this.surfaceFactory.create_three_face("left", x, y, color); // zchunk-block["z"] + ycoef?-block["y"]
      //   }
      //   if ("grass_block_side_overlay_left_left" == left_image) {
      //     console.log("OVERLAY DETECTED");
      //     break;
      //   }
        
      //   //console.log(blockModel);
      //   if(block["y"]!=0){
      //     blockModel.ordrer(order*block["y"]);
      //   }
      //   blockModel.save(this.scene);
      // //}
      // order=order+1;
    }

    this.cameraXAnime();
    this.setupCameraControls();
  }

  // camera controles
  private setupCameraControls() {
    if (!isPlatformBrowser(this.platformId)) return;

    const canvas = this.renderer.domElement;

    // Mouse down - commence le drag
    canvas.addEventListener('mousedown', (event: MouseEvent) => {
      this.isDragging = true;
      this.previousMousePosition = {
        x: event.clientX,
        y: event.clientY
      };
    });

    // Mouse move - déplace la caméra
    canvas.addEventListener('mousemove', (event: MouseEvent) => {
      if (!this.isDragging) return;

      const deltaX = event.clientX - this.previousMousePosition.x;
      const deltaY = event.clientY - this.previousMousePosition.y;

      // Déplace la caméra sur X et Y uniquement (pas de rotation)
      this.camera.position.x -= deltaX * this.cameraSpeed;
      this.camera.position.y += deltaY * this.cameraSpeed;

      this.previousMousePosition = {
        x: event.clientX,
        y: event.clientY
      };
    });

    // Mouse up - arrête le drag
    canvas.addEventListener('mouseup', () => {
      this.isDragging = false;
    });

    // Mouse leave - arrête le drag si on sort du canvas
    canvas.addEventListener('mouseleave', () => {
      this.isDragging = false;
    });

    // Support tactile (mobile)
    canvas.addEventListener('touchstart', (event: TouchEvent) => {
      if (event.touches.length === 1) {
        this.isDragging = true;
        this.previousMousePosition = {
          x: event.touches[0].clientX,
          y: event.touches[0].clientY
        };
      }
    });

    canvas.addEventListener('touchmove', (event: TouchEvent) => {
      if (!this.isDragging || event.touches.length !== 1) return;
      event.preventDefault();

      const deltaX = event.touches[0].clientX - this.previousMousePosition.x;
      const deltaY = event.touches[0].clientY - this.previousMousePosition.y;

      this.camera.position.x -= deltaX * this.cameraSpeed;
      this.camera.position.y += deltaY * this.cameraSpeed;

      this.previousMousePosition = {
        x: event.touches[0].clientX,
        y: event.touches[0].clientY
      };
    });

    canvas.addEventListener('touchend', () => {
      this.isDragging = false;
    });
  }

  // a effacer un fois api bien fini
  private async recupeJSON(block_name: string, biome_name: string): Promise<(string | null)[]> {
    let image_top = null;
    let image_left = null;
    let data = await firstValueFrom(this.dataService.getBlockJSON(block_name));
    //let example = this.dataService.getBlockJSON(block_name).pipe(map(data => {
    let keys = Object.keys(data['textures'])
    //console.log("keys :", keys, " nom du block :", block_name);
    if (keys.length == 1 || keys.includes("vine")) {
      let image = data['textures'][keys[0]].split("/")[1];
      if (keys[0] == "all") {
        // block
        image_top = image+"_top.webp";
        image_left = image+"_left.webp";
        //console.log(" TEST 1 ");
      }
      else {
        // côté unique (ou double ?) a refaire apres
        image_left = image+"_left.webp";
        //console.log(" TEST 3 ");
        //console.log("image_left seul :", image_left);
      }
    } else { //["top", "end"]
      if (keys.includes("top") && keys.includes("side")) {
        // top + side
        image_top = data['textures']["top"].split("/")[1]+"_top.webp";
        image_left = data['textures']["side"].split("/")[1]+"_left.webp";
        //console.log(" TEST 3 ");
        
      } else if (keys.includes("end") && keys.includes("side")) {
        image_top = data['textures']["end"].split("/")[1]+"_top.webp";
        image_left = data['textures']["side"].split("/")[1]+"_left.webp";
      } else {
        console.log(" TODO " + keys);
      }
    }
    //}));
    //console.log("image_top :", image_top, " image_left :", image_left);
    return [image_top, image_left];
  }

  private initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x77b5fe);

    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 1000);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.canvasContainer.nativeElement.appendChild(this.renderer.domElement);
    //document.body.appendChild(this.renderer.domElement);
    this.textureLoader = new THREE.TextureLoader();

    // gestionnaire d'événement pour le redimensionnement
    window.addEventListener('resize', () => this.onWindowResize());
  }

  private onWindowResize(){
    if (!this.camera || !this.renderer) return;
    
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  private cameraXAnime() {
    if (!this.camera) return;

    this.camera.position.z = 2.5;
    this.camera.position.y = 0;
    this.camera.position.x = 0;
    this.camera.lookAt(0, 0, 0);
    this.camera.updateProjectionMatrix();

    this.animate();
  }

  ngOnDestroy() {
    if (!isPlatformBrowser(this.platformId)) {
      return; // Skip cleanup on server-side rendering
    }

    // Annule l'animation frame
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }

    // Supprime le canvas du DOM
    if (this.renderer?.domElement?.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }

    // Nettoy les ressources Three.js
    if(this.scene){
      this.scene.traverse((object: any) => {
        if (object.geometry) object.geometry.dispose();
        if (object.material) {
          if (Array.isArray(object.material)) {
            object.material.forEach((material: THREE.Material) => material.dispose());
          } else {
            object.material.dispose();
          }
        }
        if (object.texture) object.texture.dispose();
      });
      this.scene.clear();
    }

    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.forceContextLoss();
    }

    window.removeEventListener('resize', () => this.onWindowResize());

    this.scene = null!;
    this.camera = null!;
    this.renderer = null!;
    this.textureLoader = null!;
  }
}
