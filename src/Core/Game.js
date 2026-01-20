import * as THREE from 'three';
import { PhysicsWorld } from '../Physics/PhysicsWorld.js';
import { World } from '../World/World.js';
import { InputManager } from './InputManager.js';
import { Player } from '../Entities/Player.js';
import { HelpManager } from './HelpManager.js';

import { NetworkManager } from './NetworkManager.js';

export class Game {
    constructor() {
        // Singleton definition
        if (Game.instance) {
            return Game.instance;
        }
        Game.instance = this;

        this.canvas = document.querySelector('#app');

        // Setup Basic Three.js
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color('#87CEEB'); // Sky blue
        // this.scene.fog = new THREE.Fog('#87CEEB', 0, 50);

        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        document.body.appendChild(this.renderer.domElement);

        // Modules
        this.input = new InputManager();
        this.physics = new PhysicsWorld();
        this.world = new World(this);
        this.player = new Player(this);
        this.network = new NetworkManager(this);
        this.help = new HelpManager(this);

        // Event Listeners
        window.addEventListener('resize', () => this.resize());

        // Loop
        this.clock = new THREE.Clock();
        this.previousTime = 0;
    }

    start() {
        this.tick();
    }

    resize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    }

    tick() {
        const elapsedTime = this.clock.getElapsedTime();
        const deltaTime = elapsedTime - this.previousTime;
        this.previousTime = elapsedTime;

        // Updates
        this.input.update();
        this.physics.update(deltaTime);
        this.player.update(deltaTime);
        this.world.update(deltaTime);
        this.network.update(deltaTime);
        this.help.update();

        // Final step: Sync visuals to physics (After interpolation!)
        this.physics.syncMeshes();

        // Render
        this.renderer.render(this.scene, this.camera);

        window.requestAnimationFrame(() => this.tick());
    }
}
