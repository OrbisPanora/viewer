import { SurfaceFactory } from "./surface.factory";
import { BlockModel } from "../models/block.model";

class BlockTwoFactory extends SurfaceFactory {
    path_top: string;
    path_side: string;
    mono: boolean;

    constructor(path_top: string, path_side: string, mono: boolean = true) {
        super();
        this.path_top = path_top;
        this.path_side = path_side;
        // si tt les sourfaces ont mm structure mono = true sinon false
        this.mono = mono;
    }

    async create(): Promise<BlockModel> {
        let geo_top = this.createBlockGeometry(0.32, 0.16);
        let geo_side = this.createBlockGeometry(0.16, 0.24);
        let material_side: any;

        let texture_top = await this.createBlockTexture(this.path_top);
        let material_top = this.createBlockMaterial(texture_top);
        if (!this.mono) {
            let texture_side = await this.createBlockTexture(this.path_side);
            let material_side = this.createBlockMaterial(texture_side);
        } else {
            let material_side = this.createBlockMaterial(texture_top);
        }

        let model = new BlockModel();
        model.meshTop = this.createBlockMesh(geo_top, material_top);
        model.meshSide = this.createBlockMesh(geo_side, material_side);

        return model;
    }
}
