import { Component, inject, signal, AfterViewInit, PLATFORM_ID  } from '@angular/core';
import { Router } from '@angular/router';
import * as THREE from 'three';
import { DataService } from '../../services/data.service';
import { SurfaceFactory } from '../../factories/surface.factory';
import { BlockTwoFactory } from '../../factories/block-two.factory';
import { isPlatformBrowser } from '@angular/common';

import JSONK from '../../../../public/test.json';

@Component({
  selector: 'app-visualizer',
  imports: [],
  templateUrl: './visualizer.html',
  styleUrl: './visualizer.less',
  providers: [DataService]
})
export class VisualizerPage implements AfterViewInit {
  constructor(private router: Router) {}

  goBack(): void {
    this.router.navigate(['/']);
  }

  public dataService: any = inject(DataService);
  private platformId = inject(PLATFORM_ID);
  public scene!: THREE.Scene;
  public camera!: THREE.PerspectiveCamera; //THREE.OrthographicCamera; //THREE.PerspectiveCamera;
  public renderer!: THREE.WebGLRenderer;
  public surfaceFactory!: SurfaceFactory;
  public textureLoader!: THREE.TextureLoader;

  private animate() {
    requestAnimationFrame(() => this.animate());

    this.renderer.render(this.scene, this.camera);
  }

  async ngOnInit() {
    // Empty - initialization moved to ngAfterViewInit for SSR compatibility
  }

  async ngAfterViewInit() {
    if (!isPlatformBrowser(this.platformId)) {
      return; // Skip on server-side rendering
    }

    this.initScene();

    //
    const pointGeometry = new THREE.SphereGeometry(0.05, 32, 32);
    const pointMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    let pointMesh;
    //

    let xchunk = Math.abs(JSONK["data"]["chunk_x"]*16);
    let zchunk = Math.abs(JSONK["data"]["chunk_z"]*16);
    console.log("xchunk :", xchunk, " zchunk :", zchunk);
    let i, j, x, y, order = 0;
    for (let block of JSONK["data"]["surface_blocks"]){
      //console.log("order :", order);
      // ajouter un y + ajouter un decalage smart
      if (block["y"]==78 || block["y"]==77){ //&& (order<5555 || (order>45&&order<50))){ // break; 78
        //console.log("order :", order);
        let i = Math.abs(Math.abs(block["x"]) - xchunk);
        let j = Math.abs(Math.abs(block["z"]) - zchunk);
        x = 0.16*(i-j);
        y = -0.08*(i+j)+0.08*16;
        x = Math.round(x * 100) / 100;
        y = Math.round(y * 100) / 100;
        console.log(" => i:", i, " j:", j, " => x:", x, " y:", y);
        /*pointMesh = new THREE.Mesh(pointGeometry, pointMaterial);
        pointMesh.position.set(x, y, 0);96 48-49
        this.scene.add(pointMesh);*/

        this.surfaceFactory = new BlockTwoFactory('iso_blocks/bedrock_top.webp', 'iso_blocks/bedrock_left.webp', this.textureLoader);
        let blockModel = await this.surfaceFactory.create_three_face("left", x, y); // zchunk-block["z"] + ycoef?-block["y"]
        console.log(blockModel);
        blockModel.ordrer(order);
        blockModel.save(this.scene);
      }
      order=order+1;
    }

    // this.surfaceFactory = new BlockTwoFactory('iso_blocks/azalea_plant_top.webp', 'iso_blocks/azalea_plant_left.webp', this.textureLoader);

    // let blockModel = await this.surfaceFactory.create_three_face("left", 0, 0);
    // let blockModel2 = await this.surfaceFactory.create_only_top("bottom", 1, 0);
    // let blockModel3 = await this.surfaceFactory.create_only_right("bottom", 0, 1);
    // blockModel.save(this.scene);
    // blockModel2.save(this.scene);
    // blockModel3.save(this.scene);

    this.cameraXAnime();
  }

  private initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x77b5fe);
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.renderer = new THREE.WebGLRenderer();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    document.body.appendChild(this.renderer.domElement);
    this.textureLoader = new THREE.TextureLoader();
  }

  private cameraXAnime() {
    this.camera.position.z = 2;
    this.camera.position.y = 0;
    this.camera.position.x = 0;

    this.animate();
  }
}
