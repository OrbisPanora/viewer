import {Spritesheet, Assets} from 'pixi.js';

export class Atlas {
    private loader!: Spritesheet;

    constructor() {}

    public async load(path: string) {
        this.loader = await Assets.load(path);
    }

    public getAtlas(): Spritesheet {
        return this.loader;
    }
}