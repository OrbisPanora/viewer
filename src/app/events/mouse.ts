import {Application} from 'pixi.js';

export class MouseEvents {
    private app: Application;
    private dragging: boolean = true;
    private y!: number
    private x!: number;
    constructor(app: Application) {
        this.app = app;
        this.app.stage.eventMode = 'static';

    }

    public getDragging(){
        return this.dragging;
    }

    public setDragging(): void {
        if(this.dragging){
            this.dragging = false;
            return;
        }
        this.dragging = true;
    }

    public mouseEvents(): number[] {
        this.app.stage.on('pointerdown', (e) => {
            //console.log("Pointer down :", e.global.x, e.global.y);
            // Activer le drag
            this.dragging = true;
        });

        this.app.stage.on('pointermove', (e) => {
            if (!this.dragging) return;
            this.x = e.global.x;
            this.y = e.global.y;
            //console.log("Pointer move :", e.global.x, e.global.y);
        });

        this.app.stage.on('pointerup', () => {
            console.log("Pointer up");
            this.dragging = false;
        });

        return [this.x, this.y];
    }


}