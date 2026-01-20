import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export class FootballWorld {
    constructor(game) {
        this.game = game;
        this.scene = game.scene;
        this.physics = game.physics;

        this.init();
    }

    init() {
        // --- 1. Lights ---
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
        this.scene.add(ambientLight);

        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
        dirLight.position.set(50, 100, 50);
        dirLight.castShadow = true;
        dirLight.shadow.mapSize.width = 4096;
        dirLight.shadow.mapSize.height = 4096;
        dirLight.shadow.camera.near = 0.1;
        dirLight.shadow.camera.far = 200;
        dirLight.shadow.camera.left = -50;
        dirLight.shadow.camera.right = 50;
        dirLight.shadow.camera.top = 50;
        dirLight.shadow.camera.bottom = -50;
        this.scene.add(dirLight);

        // --- 2. Ground (Football Field) ---
        // Green Grass Material
        const groundMat = new THREE.MeshStandardMaterial({
            color: 0x4CAF50, // Grass Green
            roughness: 0.8
        });

        // Floor Mesh
        const floorGeo = new THREE.PlaneGeometry(60, 40); // 60x40 Field
        const floorMesh = new THREE.Mesh(floorGeo, groundMat);
        floorMesh.rotation.x = -Math.PI / 2;
        floorMesh.receiveShadow = true;
        this.scene.add(floorMesh);

        // Floor Physics
        const floorBody = new CANNON.Body({
            mass: 0, // Static
            shape: new CANNON.Plane(),
            material: this.physics.materials.ground
        });
        floorBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
        this.physics.world.addBody(floorBody);

        // --- 3. Field Markings (White Lines) ---
        // Simple white outline
        const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

        // Border
        const borderLines = new THREE.Group();
        // Top
        const top = new THREE.Mesh(new THREE.BoxGeometry(60, 0.05, 0.5), lineMat);
        top.position.z = -20;
        borderLines.add(top);
        // Bottom
        const bot = new THREE.Mesh(new THREE.BoxGeometry(60, 0.05, 0.5), lineMat);
        bot.position.z = 20;
        borderLines.add(bot);
        // Left
        const left = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 40), lineMat);
        left.position.x = -30;
        borderLines.add(left);
        // Right
        const right = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 40), lineMat);
        right.position.x = 30;
        borderLines.add(right);
        // Center Line
        const center = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 40), lineMat);
        borderLines.add(center);

        this.scene.add(borderLines);


        // --- 4. Walls (Invisible Colliders to keep ball in) ---
        this.createWall(0, 5, -20.5, 60, 10, 1); // Top
        this.createWall(0, 5, 20.5, 60, 10, 1); // Bottom
        this.createWall(-30.5, 5, 0, 1, 10, 40); // Left
        this.createWall(30.5, 5, 0, 1, 10, 40); // Right


        // --- 5. Goals (Visual Only for now, or physical) ---
        // Simple posts
        this.createGoal(-30, 0); // Left Goal
        this.createGoal(30, Math.PI); // Right Goal

        // --- 6. The Football ---
        this.createFootball();
    }

    createWall(x, y, z, w, h, d) {
        // Invisible physics wall
        const shape = new CANNON.Box(new CANNON.Vec3(w / 2, h / 2, d / 2));
        const body = new CANNON.Body({ mass: 0 });
        body.addShape(shape);
        body.position.set(x, y, z);
        this.physics.world.addBody(body);

        // Optional: Visible Fence
        // const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshBasicMaterial({color: 0xffffff, wireframe: true, transparent: true, opacity: 0.1}));
        // mesh.position.copy(body.position);
        // this.scene.add(mesh);
    }

    createGoal(x, rot) {
        const goalGroup = new THREE.Group();
        goalGroup.position.set(x, 0, 0);
        goalGroup.rotation.y = rot;

        const mat = new THREE.MeshStandardMaterial({ color: 0xffffff });
        const postGeo = new THREE.CylinderGeometry(0.2, 0.2, 3);
        const crossGeo = new THREE.CylinderGeometry(0.2, 0.2, 6); // Goal Width 6m (3+3)

        // Left Post
        const p1 = new THREE.Mesh(postGeo, mat);
        p1.position.set(0, 1.5, -3);
        goalGroup.add(p1);

        // Right Post
        const p2 = new THREE.Mesh(postGeo, mat);
        p2.position.set(0, 1.5, 3);
        goalGroup.add(p2);

        // Crossbar
        const bar = new THREE.Mesh(crossGeo, mat);
        bar.rotation.x = Math.PI / 2;
        bar.position.set(0, 3, 0);
        goalGroup.add(bar);

        this.scene.add(goalGroup);

        // Physics for posts (Simplified)
        this.createWall(x, 1.5, -3, 0.4, 3, 0.4);
        this.createWall(x, 1.5, 3, 0.4, 3, 0.4);
    }

    createFootball() {
        const radius = 0.5;
        const mass = 1;

        // Visual
        const geometry = new THREE.SphereGeometry(radius, 32, 32);
        // Classic Soccer Ball Pattern Texture ideally, utilizing simple geometric colors here
        const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
        // Can add texture later. For now, white ball.

        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.position.set(0, 5, 0); // Drop from sky
        this.scene.add(mesh);

        // Add black patches for visuals? (Skipping for simplicity vs performance)

        // Physics
        const shape = new CANNON.Sphere(radius);
        const body = new CANNON.Body({
            mass: mass,
            shape: shape,
            material: this.physics.materials.object // Bouncy material
        });
        body.position.set(0, 5, 0);
        body.linearDamping = 0.3; // Rolling resistance
        body.angularDamping = 0.3;

        this.physics.world.addBody(body);

        // Link
        const id = 'football_01'; // Unique ID
        mesh.userData.id = id;
        body.userData.id = id;

        // Register interactable
        if (!this.game.interactables) this.game.interactables = {};
        this.game.interactables[id] = { mesh, body, id };
        this.physics.addMeshBodyPair(mesh, body);
    }

    update(deltaTime) {
        // Nothing special to update per frame for static world
    }
}
