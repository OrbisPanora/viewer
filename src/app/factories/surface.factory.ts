import * as THREE from 'three';
import { GeneralBlock } from '../models/general.block';

export abstract class SurfaceFactory {
    public textureLoader!: THREE.TextureLoader;

    constructor(textureLoader : THREE.TextureLoader) {
        this.textureLoader = textureLoader;
    }

    abstract create(): Promise<any>;

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

    public createBlockMaterial(texture: THREE.Texture): THREE.MeshBasicMaterial {
        return new THREE.MeshBasicMaterial({ map: texture, transparent: true });
    }

    public createBlockMesh(geometry: THREE.PlaneGeometry, material: THREE.MeshBasicMaterial): THREE.Mesh {
        return new THREE.Mesh(geometry, material);
    }

}