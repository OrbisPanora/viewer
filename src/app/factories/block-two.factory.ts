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

    async create_three_face(orientation : "left" | "right" | "top" | "bottom", x : number, y : number): Promise<BlockModel> {
        // orientation inutilie ici
        let geo_top = this.createBlockGeometry(0.32, 0.16);
        let geo_side = this.createBlockGeometry(0.16, 0.24);

        let texture_top = await this.createBlockTexture(this.path_top);
        let texture_side = await this.createBlockTexture(this.path_side);
        let material_top = this.createBlockMaterial(texture_top, 0xffffff);
        let material_side_left = this.createBlockMaterial(texture_side, 0x550000);
        let material_side_right = this.createBlockMaterial(texture_side, 0x0000aa);

        let model = new BlockModel();
        model.meshTop = this.createBlockMesh(geo_top, material_top);
        model.meshTop.position.set(x, y, 0);
        model.meshSideLeft = this.createBlockMesh(geo_side, material_side_left);
        model.meshSideLeft.position.set(model.meshTop.position.x-0.08, model.meshTop.position.y-0.12, 0);
        model.meshSideRight = this.createBlockMesh(geo_side, material_side_right);
        model.meshSideRight.position.set(model.meshTop.position.x+0.08, model.meshTop.position.y-0.12, 0);
        model.meshSideRight.scale.x = -1;

        return model;
    }

    async create_only_top(orientation : "left" | "right" | "top" | "bottom", x : number, y : number): Promise<BlockModel> {
        let geo_top = this.createBlockGeometry(0.32, 0.16);

        let texture_top = await this.createBlockTexture(this.path_top);

        let material_top = this.createBlockMaterial(texture_top, 0xffffff);

        let model = new BlockModel();

        model.meshTop = this.createBlockMesh(geo_top, material_top);
        model.meshTop.position.set(x, y, 0);
        this.orientation(model.meshTop, orientation);

        return model;
    }

    async create_only_right(orientation : "left" | "right" | "top" | "bottom", x : number, y : number): Promise<BlockModel> {
        let geo_side = this.createBlockGeometry(0.16, 0.24);

        let texture_side = await this.createBlockTexture(this.path_side);

        let material_side = this.createBlockMaterial(texture_side, 0x555555);

        let model = new BlockModel();

        model.meshSideRight = this.createBlockMesh(geo_side, material_side);
        model.meshSideRight.position.set(x, y, 0);
        this.orientation(model.meshSideRight, orientation); // a tester si ca marche bien
        
        return model;
    }

}
