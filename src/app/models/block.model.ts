import * as THREE from 'three';
import { GeneralBlock } from './general.block';

export class BlockModel extends GeneralBlock {
    meshTop !: THREE.Mesh;
    meshSideLeft !: THREE.Mesh;
    meshSideRight !: THREE.Mesh;

    instancedMeshTop !: THREE.InstancedMesh;
    instancedMeshLeft !: THREE.InstancedMesh;
    instancedMeshRight !: THREE.InstancedMesh;

    // perimé
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

    instance_ordrer(order: number){
        if (this.instancedMeshTop) {
            this.instancedMeshTop.renderOrder = order;
        }
        if (this.instancedMeshLeft) {
            this.instancedMeshLeft.renderOrder = order;
        }
        if (this.instancedMeshRight) {
            this.instancedMeshRight.renderOrder = order;
        }
    }

    save(scene: THREE.Scene): void {
        if (this.instancedMeshTop) {
            scene.add(this.instancedMeshTop);
        }
        if (this.instancedMeshLeft) {
            scene.add(this.instancedMeshLeft);
        }
        if (this.instancedMeshRight) {
            scene.add(this.instancedMeshRight);
        }
    }
}