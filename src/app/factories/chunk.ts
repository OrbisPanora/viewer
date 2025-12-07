import { Tilemap } from "@pixi/tilemap";
import {Spritesheet, Graphics} from 'pixi.js';

export class Chunk {
    readonly X: number = 16;
    readonly Y: number = 16;
    private Z: number;
    readonly tileW = 32;
    readonly tileH = 16;
    private tilemap!: Tilemap;
    constructor(public z: number = 1, atlas: Spritesheet, coords?: number[][][]) {
        this.tilemap = new Tilemap([atlas.textureSource]);
        this.Z = z;
        let x = 0;
        let y = 0;
        for (let i = 0; i < this.X; i++) {
            for (let j = 0; j < this.Y; j++) {
                for (let k = 0; k < this.z; k++) {
                    x = (i - j) * this.tileW/2; //window.innerWidth/2 500
                    y = (i + j) * this.tileH/2 - k*this.tileH; //window.innerHeight
                    this.tilemap.tile(atlas.textures['gold_ore.webp'], x, y);
                }
            }
        }
    }

    public getTilemap(): Tilemap {
        return this.tilemap;
    }

    public setXY(x: number, y: number): void {
        this.tilemap.x = x;
        this.tilemap.y = y;
    }

    public printInfo(): void {
        console.log('Chunk.X : ', this.tilemap.x, 'Chunk.Y : ', this.tilemap.y, 'Chunk.Width : ', this.tilemap.width, 'Chunk.Height : ', this.tilemap.height);
    }

    public backGroundColor(color: number): Graphics {
        this.tilemap.zIndex += 1;
        return new Graphics().rect(this.tilemap.x-(this.X*this.tileW-this.tileW)/2, this.tilemap.y, this.tilemap.width, this.tilemap.height).fill(color);
    }
}