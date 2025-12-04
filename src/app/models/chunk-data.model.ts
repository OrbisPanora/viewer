import { SurfaceBlocks } from './surface-blocks.model';

export interface ChunkData {
    chunk_x: number;
    chunk_z: number;
    heightmap: number[][];
    surface_blocks: {[key: string] : SurfaceBlocks[]; }[];
    render_data: any | null;
    sections: any | null;
    palette: any | null;
}