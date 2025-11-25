import * as THREE from 'three';
import { GeneralBlock } from './general.block';

export class StairsModel extends GeneralBlock {
    meshTops !: Array<THREE.Mesh>;
    meshSides !: Array<THREE.Mesh>;
}