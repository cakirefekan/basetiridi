import * as CANNON from 'cannon-es';
import CannonDebugger from 'cannon-es-debugger';

export class PhysicsWorld {
    constructor() {
        this.world = new CANNON.World();
        this.world.gravity.set(0, -30.0, 0); // Arcade Gravity (Snappy)
        this.world.broadphase = new CANNON.SAPBroadphase(this.world); // Improved performance
        this.world.allowSleep = true;
        this.world.solver.iterations = 20; // Increase solver stability for high gravity

        // Materials
        this.defaultMaterial = new CANNON.Material('default');
        const defaultContactMaterial = new CANNON.ContactMaterial(
            this.defaultMaterial,
            this.defaultMaterial,
            {
                friction: 0.1,
                restitution: 0.0,
                contactEquationStiffness: 1e8,
                contactEquationRelaxation: 2
            }
        );
        this.world.addContactMaterial(defaultContactMaterial);

        // Slippery Material for Player
        this.slipperyMaterial = new CANNON.Material('slippery');
        const slipperyContact = new CANNON.ContactMaterial(
            this.defaultMaterial,
            this.slipperyMaterial,
            {
                friction: 0.0,
                restitution: 0.0,
                contactEquationStiffness: 1e8,
                contactEquationRelaxation: 2
            }
        );
        this.world.addContactMaterial(slipperyContact);

        this.objectsToUpdate = [];

        // Collision event callback (can be set by NetworkManager)
        this.onCollision = null;

        // Set up collision events
        this.world.addEventListener('beginContact', (event) => {
            if (this.onCollision) {
                this.onCollision(event);
            }
        });

        // Debugger (optional, triggered if we pass scene)
        this.debugger = null;
    }

    setDebug(scene) {
        this.debugger = new CannonDebugger(scene, this.world, {
            color: 0xffff00,
        });
    }

    update(deltaTime) {
        // Increased precision (120Hz) to prevent tunneling/sinking under high gravity
        this.world.step(1 / 120, deltaTime, 20);

        if (this.debugger) {
            this.debugger.update();
        }
    }

    syncMeshes() {
        // Call this at the very end of the game loop to ensure visuals match latest physics/network state
        for (const obj of this.objectsToUpdate) {
            if (obj.mesh && obj.body) {
                obj.mesh.position.copy(obj.body.position);
                obj.mesh.quaternion.copy(obj.body.quaternion);
            }
        }
    }

    addBody(body, mesh = null) {
        this.world.addBody(body);
        if (mesh) {
            this.objectsToUpdate.push({ mesh, body });
        }
    }
}
