import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export class World {
    constructor(game) {
        this.game = game;
        this.scene = game.scene;
        this.physics = game.physics;

        this.setupLights();
        this.setupEnvironment();
        this.createTestCubes();
    }

    setupLights() {
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
        this.scene.add(ambientLight);

        const sunLight = new THREE.DirectionalLight(0xffffff, 1);
        sunLight.position.set(10, 20, 10);
        sunLight.castShadow = true;
        sunLight.shadow.camera.top = 20;
        sunLight.shadow.camera.bottom = -20;
        sunLight.shadow.camera.left = -20;
        sunLight.shadow.camera.right = 20;
        sunLight.shadow.mapSize.width = 2048;
        sunLight.shadow.mapSize.height = 2048;
        this.scene.add(sunLight);
    }

    setupEnvironment() {
        // Floor
        const geometry = new THREE.PlaneGeometry(100, 100);
        const material = new THREE.MeshStandardMaterial({
            color: 0x222222,
            roughness: 0.4,
            metalness: 0.3
        });
        const floor = new THREE.Mesh(geometry, material);
        floor.rotation.x = -Math.PI / 2;
        floor.receiveShadow = true;
        this.scene.add(floor);

        // Physics Floor
        const floorShape = new CANNON.Plane();
        const floorBody = new CANNON.Body({
            mass: 0,
            shape: floorShape,
            material: this.physics.defaultMaterial
        });
        floorBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
        this.physics.addBody(floorBody);
    }

    createTestCubes() {
        const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
        const boxMaterial = new THREE.MeshStandardMaterial({ color: 0x00ff00 });

        for (let i = 0; i < 10; i++) {
            // Deterministic positions
            const x = Math.sin(i * 132.1) * 10;
            const z = Math.cos(i * 54.3) * 10 - 5;
            const y = 5;

            const mesh = new THREE.Mesh(boxGeometry, boxMaterial);
            mesh.position.set(x, y, z);
            mesh.castShadow = true;
            this.scene.add(mesh);

            const shape = new CANNON.Box(new CANNON.Vec3(0.5, 0.5, 0.5));
            const body = new CANNON.Body({
                mass: 1,
                position: new CANNON.Vec3(x, y, z),
                shape: shape,
                material: this.physics.defaultMaterial
            });

            // Deterministic ID
            const objectId = `cube_${i}`;

            mesh.userData = { interactable: true, id: objectId };
            body.userData = { interactable: true, mesh: mesh, id: objectId };

            if (!this.game.interactables) this.game.interactables = {};
            this.game.interactables[objectId] = { mesh, body };

            this.physics.addBody(body, mesh);
        }
    }

    update(deltaTime) {
        // World animations if any
    }
}
