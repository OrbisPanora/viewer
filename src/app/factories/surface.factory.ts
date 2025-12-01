import * as THREE from 'three';
import { GeneralBlock } from '../models/general.block';

export abstract class SurfaceFactory {
    public textureLoader!: THREE.TextureLoader;

    constructor(textureLoader : THREE.TextureLoader) {
        this.textureLoader = textureLoader;
    }

    abstract create_three_face(orientation : "left" | "right" | "top" | "bottom", x : number, y : number, color?: number): Promise<any>;

    abstract create_only_top(orientation : "left" | "right" | "top" | "bottom", x : number, y : number, color?: number): Promise<any>;

    abstract create_only_right(orientation : "left" | "right" | "top" | "bottom", x : number, y : number, color?: number): Promise<any>;
    public createBlockGeometry(size1 : number = 0.32, size2 : number = 0.16): THREE.PlaneGeometry {
        return new THREE.PlaneGeometry(size1, size2);
    }

    public async createBlockTexture(url: string): Promise<THREE.Texture> {
        let tex = await this.textureLoader.loadAsync(url);
        tex.magFilter = THREE.NearestFilter; // Filtre pour l'agrandissement
        tex.minFilter = THREE.NearestFilter; // Filtre pour le rétrécissement
        tex.generateMipmaps = false;
        tex.colorSpace = THREE.SRGBColorSpace;
        return tex;
    }

    public createBlockMaterial(texture: THREE.Texture, color: number): THREE.MeshBasicMaterial {
        return new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, color: color });
    }

    public createBlockMesh(geometry: THREE.PlaneGeometry, material: THREE.MeshBasicMaterial): THREE.Mesh {
        return new THREE.Mesh(geometry, material);
    }

    public creatInstancedMesh(geometry: THREE.PlaneGeometry, material: THREE.MeshBasicMaterial, count: number): THREE.InstancedMesh {
        return new THREE.InstancedMesh(geometry, material, count);
    }

    public orientation(side: THREE.Mesh, orientation: "left" | "right" | "top" | "bottom") {
        if (orientation === "left") {
            side.scale.x = 1;
        }
        else if (orientation === "right") {
            side.rotation.z = Math.PI;
        }
        else if (orientation === "top") {
            side.scale.y = -1;
        }
        else if (orientation === "bottom") {
            side.scale.x = -1;
            side.rotation.z = 2 * Math.PI;
        }
    }
}