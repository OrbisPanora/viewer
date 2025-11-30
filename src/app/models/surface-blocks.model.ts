export interface SurfaceBlocks {
    x : number;
    y : number;
    z : number;
    block : string;
    properties : {string : string; };
    biome : string;
    is_surface ?: boolean;
}