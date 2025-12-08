import { Tilemap } from "@pixi/tilemap";
import {Spritesheet, Graphics, Texture, TextureSource} from 'pixi.js';

export class Chunk {
    readonly X: number = 16;
    readonly Y: number = 16;
    readonly tileW = 32;
    readonly tileH = 16;
    private tilemap!: Tilemap;
    constructor(public z: number = 1, atlas: Spritesheet, coords?: (string | number)[][]) {
        this.tilemap = new Tilemap([atlas.textureSource]);
        let tex!: Texture<TextureSource<any>>;
        for (let i of coords?coords:[]) {
            let nom = i[0] as string;
            let x = i[1] as number;
            let y = i[2] as number;
            try{
                tex = atlas.textures[nom];
                tex.source.style.scaleMode  = 'nearest';
                this.tilemap.tile(tex, x, y);
            }
            catch(e){
                console.warn("Missing texture in chunk:", nom);
                tex = atlas.textures['glass.webp'];
                tex.source.style.scaleMode  = 'nearest';
                this.tilemap.tile(tex, x, y);
            }            
        }
        //this.testisoallsame(z, atlas);
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

    public backGroundColor(color: number, zoom: number =1): Graphics {
        this.tilemap.zIndex += 1;
        return new Graphics().rect(this.tilemap.x-(this.X*this.tileW*zoom-this.tileW*zoom)/2, this.tilemap.y, this.tilemap.width, this.Y*this.tileH*zoom+this.tileH*zoom).fill(color);
    }

    public zoom(zoomCoef: number): void{
        //this.tilemap.texture.baseTexture.scaleMode = SCALE_MODES.NEAREST;
        this.tilemap.scale.set(zoomCoef);
    }

    private testisoallsame(z: number, atlas: Spritesheet): void {
        for (let i = 0; i < this.X; i++) {
            let x = 0;
            let y = 0;
            for (let j = 0; j < this.Y; j++) {
                for (let k = 0; k < z; k++) {
                    x = (i - j) * this.tileW/2; //window.innerWidth/2 500
                    y = (i + j) * this.tileH/2 - k*this.tileH; //window.innerHeight
                    this.tilemap.tile(atlas.textures['gold_ore.webp'], x, y);
                }
            }
        }
    }

}