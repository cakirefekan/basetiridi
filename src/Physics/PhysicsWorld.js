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
        // Materials Dictionary
        this.materials = {
            default: new CANNON.Material('default'),
            ground: new CANNON.Material('ground'),
            object: new CANNON.Material('object'),
            slippery: new CANNON.Material('slippery')
        };

        // Backward compatibility
        this.defaultMaterial = this.materials.default;
        this.slipperyMaterial = this.materials.slippery;

        // Contact Materials

        // Default - Default
        this.world.addContactMaterial(new CANNON.ContactMaterial(
            this.materials.default, this.materials.default,
            { friction: 0.1, restitution: 0.0, contactEquationStiffness: 1e8, contactEquationRelaxation: 2 }
        ));

        // Ground - Default (Standard objects on ground)
        this.world.addContactMaterial(new CANNON.ContactMaterial(
            this.materials.ground, this.materials.default,
            { friction: 0.5, restitution: 0.0 } // More friction on ground
        ));

        // Ground - Object (Bouncy Ball)
        this.world.addContactMaterial(new CANNON.ContactMaterial(
            this.materials.ground, this.materials.object,
            { friction: 0.5, restitution: 0.7 } // High bounce
        ));

        // Object - Object
        this.world.addContactMaterial(new CANNON.ContactMaterial(
            this.materials.object, this.materials.object,
            { friction: 0.5, restitution: 0.5 }
        ));

        // Object - Default
        this.world.addContactMaterial(new CANNON.ContactMaterial(
            this.materials.object, this.materials.default,
            { friction: 0.5, restitution: 0.5 }
        ));

        // Slippery - Default (Player on normal stuff)
        this.world.addContactMaterial(new CANNON.ContactMaterial(
            this.materials.slippery, this.materials.default,
            { friction: 0.0, restitution: 0.0, contactEquationStiffness: 1e8, contactEquationRelaxation: 2 }
        ));

        // Slippery - Ground (Player on ground)
        this.world.addContactMaterial(new CANNON.ContactMaterial(
            this.materials.slippery, this.materials.ground,
            { friction: 0.0, restitution: 0.0, contactEquationStiffness: 1e8, contactEquationRelaxation: 2 }
        ));

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

    addMeshBodyPair(mesh, body) {
        this.addBody(body, mesh);
    }
}
