import { SurfaceFactory } from "./surface.factory";
import { BlockModel } from "../models/block.model";

export class BlockTwoFactory extends SurfaceFactory {
    path_top: string;
    path_side: string;

    constructor(path_top: string, path_side: string, textureLoader : any) {
        super(textureLoader);
        this.path_top = path_top;
        this.path_side = path_side;
    }

    async create(): Promise<BlockModel> {
        let geo_top = this.createBlockGeometry(0.32, 0.16);
        let geo_side = this.createBlockGeometry(0.16, 0.24);

        let texture_top = await this.createBlockTexture(this.path_top);
        let texture_side = await this.createBlockTexture(this.path_side);
        let material_top = this.createBlockMaterial(texture_top);
        let material_side = this.createBlockMaterial(texture_side);

        let model = new BlockModel();
        model.meshTop = this.createBlockMesh(geo_top, material_top);
        model.meshSide = this.createBlockMesh(geo_side, material_side);
        model.meshSide.position.set(model.meshTop.position.x-0.08, model.meshTop.position.y-0.12, 0);
        //model.meshSide_right  // model.meshSide_right.scale.x = -1;

        return model;
    }
}
