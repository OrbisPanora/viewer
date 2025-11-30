import { Component, inject, signal, AfterViewInit, PLATFORM_ID  } from '@angular/core';
import { Router } from '@angular/router';
import * as THREE from 'three';
import { DataService } from '../../services/data.service';
import { SurfaceFactory } from '../../factories/surface.factory';
import { BlockTwoFactory } from '../../factories/block-two.factory';
import { isPlatformBrowser } from '@angular/common';

//import JSONK from '../../../../public/test.json';
import { firstValueFrom } from 'rxjs';

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

  constructor(private router: Router, private dataService: DataService) {}

  goBack(): void {
    this.router.navigate(['/']);
  }


  private animate() {
    requestAnimationFrame(() => this.animate());

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
    // a tester : -21 -7 ; -22 -12 ; -18 7
    let data = await firstValueFrom(this.dataService.getJSONData('chunks', -18, -9)); 
    console.log("data recupere :", data);

    //
    // const pointGeometry = new THREE.SphereGeometry(0.05, 32, 32);
    // const pointMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    // let pointMesh;
    //

    // let xchunk = Math.abs(JSONK["data"]["chunk_x"]*16);
    // let zchunk = Math.abs(JSONK["data"]["chunk_z"]*16);
    // let ychunk = 75;//Math.min(...JSONK["data"]["heightmap"][0]); // min marche mieux pourqoui ?? 
    // console.log("xchunk :", xchunk, " zchunk :", zchunk, " ychunk :", ychunk);
    let x, y, order = 0;
    let blockModel;
    let images, left_image, top_image;
    for (let block of data["data"]["surface_blocks"]){
      //console.log("order :", order);
      // ajouter un y + ajouter un decalage smart
      //if (block["y"]>74 && block["y"]<90){ //&& (order<5555 || (order>45&&order<50))){ // break; 78
          //console.log("order :", order);
        // let i = Math.abs(Math.abs(block["x"]) - xchunk);
        // let j = Math.abs(Math.abs(block["z"]) - zchunk);
        // let z = Math.abs(Math.abs(block["y"]) - ychunk);
        // x = 0.16*(i-j);
        // y = -0.08*(i+j)+0.08*16 + 0.16*z;
        // x = Math.round(x * 100) / 100;
        // y = Math.round(y * 100) / 100;
        // console.log(" => i:", i, " j:", j, " => x:", x, " y:", y);
        /*pointMesh = new THREE.Mesh(pointGeometry, pointMaterial);
        pointMesh.position.set(x, y, 0);96 48-49
        this.scene.add(pointMesh);*/

        x=block["x"];
        y=block["z"];

        //console.log("x", x, " y", y, " block :", block)
        //console.log(block["properties"])
        
        // LOCAL
        let images = await this.recupeJSON(block["block"].split(":")[1], block["biome"].split(":")[1]);
        top_image = images[0];
        left_image = images[1];
        // API
        // images = await firstValueFrom(this.dataService.getNomTexture(block["block"].split(":")[1], block["biome"].split(":")[1]));
        // //console.log("images.data.textures :", images.data.textures);
        // top_image = images.data.textures.top;
        // left_image = images.data.textures.left;

        //break;
        console.log("TEST");
        this.surfaceFactory = new BlockTwoFactory('iso_blocks/' + top_image, 'iso_blocks/' + left_image, this.textureLoader);
        if (top_image == "") {
          blockModel = await this.surfaceFactory.create_only_right("left", x, y, 0xffffff); // bottom --> right pour les cotes
        }
        else if (left_image == "") {
          blockModel = await this.surfaceFactory.create_only_top("left", x, y, 0xffffff);
        } else {
          blockModel = await this.surfaceFactory.create_three_face("left", x, y, 0xffffff); // zchunk-block["z"] + ycoef?-block["y"]
        }
        if ("grass_block_side_overlay_left_left" == left_image) {
          console.log("OVERLAY DETECTED");
          break;
        }
        
        //console.log(blockModel);
        if(block["y"]!=0){
          blockModel.ordrer(order*block["y"]);
        }
        blockModel.save(this.scene);
      //}
      order=order+1;
    }

    this.cameraXAnime();
  }

  private async recupeJSON(block_name: string, biome_name: string): Promise<string[]> {
    let image_top = "";
    let image_left = "";
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
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.renderer = new THREE.WebGLRenderer();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    document.body.appendChild(this.renderer.domElement);
    this.textureLoader = new THREE.TextureLoader();
  }

  private cameraXAnime() {
    this.camera.position.z = 2.5;
    this.camera.position.y = 0;
    this.camera.position.x = 0;

    this.animate();
  }
}
