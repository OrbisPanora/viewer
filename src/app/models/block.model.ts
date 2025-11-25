import * as THREE from 'three';
import { GeneralBlock } from './general.block';

export class BlockModel extends GeneralBlock {
    meshTop !: THREE.Mesh;
    meshSideLeft !: THREE.Mesh;
    meshSideRight !: THREE.Mesh;

    ordrer(order : number) {
        if (this.meshTop) {
            this.meshTop.renderOrder = order;
        }
        if (this.meshSideLeft) {
            this.meshSideLeft.renderOrder = order;
        }
        if (this.meshSideRight) {
            this.meshSideRight.renderOrder = order;
        }
    }

    save(scene: THREE.Scene): void {
        if (this.meshTop) {
            scene.add(this.meshTop);
        }
        if (this.meshSideLeft) {
            scene.add(this.meshSideLeft);
        }
        if (this.meshSideRight) {
            scene.add(this.meshSideRight);
        }
    }
}