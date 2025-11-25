import * as THREE from 'three';
import { GeneralBlock } from './general.block';

export class BlockModel extends GeneralBlock {
    meshTop !: THREE.Mesh;
    meshSide !: THREE.Mesh;
}