import { io } from 'socket.io-client';
import { RemotePlayer } from '../Entities/RemotePlayer.js';

export class NetworkManager {
    constructor(game) {
        this.game = game;
        this.socket = null;
        this.remotePlayers = {}; // Map socketId -> RemotePlayer
        this.isConnected = false;
        this.currentUser = null;

        // Object sync tracking
        this.objectSyncTimer = 0; // Timer for throttled object updates
        this.objectSyncRate = 1 / 60; // 60 updates per second (near real-time)
        this.trackedObjects = {}; // objectId -> { timer: number, isActive: boolean }

        // Set up collision tracking for authority management
        this.setupCollisionTracking();
    }

    setupCollisionTracking() {
        // Wait for physics world to be available
        if (!this.game.physics) {
            setTimeout(() => this.setupCollisionTracking(), 100);
            return;
        }

        // Register collision callback
        this.game.physics.onCollision = (event) => {
            this.handleCollision(event);
        };
    }

    handleCollision(event) {
        if (!this.game.player || !this.game.player.body) return;

        const playerBody = this.game.player.body;
        let objectBody = null;

        // Determine if player is in the collision and get the other body
        if (event.bodyA === playerBody && event.bodyB.userData?.interactable) {
            objectBody = event.bodyB;
        } else if (event.bodyB === playerBody && event.bodyA.userData?.interactable) {
            objectBody = event.bodyA;
        }

        // If player collided with an interactable object, claim authority
        if (objectBody && objectBody.userData?.id) {
            this.markObjectForSync(objectBody.userData.id, 0.3); // Very short authority claim for collisions
        }
    }

    markObjectForSync(objectId, duration = 3.0) {
        // Called when player interacts with an object or collides with it
        if (!this.trackedObjects[objectId]) {
            this.trackedObjects[objectId] = { timer: 0, isActive: false };
        }
        this.trackedObjects[objectId].isActive = true;
        this.trackedObjects[objectId].timer = duration;
    }

    connect(userData) {
        this.currentUser = userData;
        // Assume server is on localhost:3000 for now, or relative path if proxied
        // Since we are running vite dev, we need to point to the express server.
        const API_URL = window.location.origin; // Otomatik olarak deploy edilen adresi alır
        this.socket = io(API_URL);
        this.socket.on('connect', () => {
            console.log('Connected to server with ID:', this.socket.id);
            this.isConnected = true;

            // Send Join Request with Auth Data
            this.socket.emit('join-game', userData);
        });

        this.socket.on('force-disconnect', (reason) => {
            alert('Disconnected: ' + reason);
            window.location.reload();
        });

        this.socket.on('current-players', (players) => {
            Object.keys(players).forEach(id => {
                if (id !== this.socket.id) {
                    this.addRemotePlayer(id, players[id]);
                }
            });
        });

        this.socket.on('player-joined', (data) => {
            console.log('Player joined:', data.id);
            this.addRemotePlayer(data.id, data);
        });

        this.socket.on('player-update', (data) => {
            if (this.remotePlayers[data.id]) {
                this.remotePlayers[data.id].updateData(data);
            }
        });

        this.socket.on('player-left', (id) => {
            console.log('Player left:', id);
            this.removeRemotePlayer(id);
        });

        this.socket.on('object-update', (data) => {
            this.updateObjectState(data);
        });

        this.socket.on('current-objects', (objects) => {
            if (!objects) return;
            Object.values(objects).forEach(data => {
                this.updateObjectState(data);
            });
        });
    }

    updateObjectState(data) {
        // data: { id, position, quaternion, velocity, angularVelocity, owner }
        if (!this.game.interactables || !this.game.interactables[data.id]) return;

        const obj = this.game.interactables[data.id];
        const body = obj.body;

        // Authority check
        // We are the owner if the data came from us (rare in broadcast) or if we are currently holding/interacting
        const isLocallyControlled = this.game.player && this.game.player.holdingObject === body;
        const hasRecentLocalInteraction = this.trackedObjects[data.id] && this.trackedObjects[data.id].isActive;

        // If the server says someone else is the owner
        const isRemoteOwned = data.owner && data.owner !== this.socket.id;

        if (isLocallyControlled || hasRecentLocalInteraction) {
            // We have authority, ignore remote updates
            // (We should probably also force DYNAMIC here, but usually it is)
            if (body.type !== CANNON.Body.DYNAMIC) {
                body.type = CANNON.Body.DYNAMIC;
                body.wakeUp();
            }
            return;
        }

        // If it's remote owned, make it kinematic to prevent local physics interference
        if (isRemoteOwned) {
            if (body.type !== CANNON.Body.KINEMATIC) {
                body.type = CANNON.Body.KINEMATIC;
                body.velocity.set(0, 0, 0);
                body.angularVelocity.set(0, 0, 0);
            }
        } else {
            // Nobody owns it or we are the owner (but not currently interacting)
            // Bring it back to dynamic so it can fall/move locally
            if (body.type !== CANNON.Body.DYNAMIC) {
                body.type = CANNON.Body.DYNAMIC;
                body.wakeUp();
            }
        }

        // Position Difference check (Snap if too far)
        const dx = body.position.x - data.position.x;
        const dy = body.position.y - data.position.y;
        const dz = body.position.z - data.position.z;
        const posDiffSq = dx * dx + dy * dy + dz * dz;

        if (posDiffSq > 2.25) { // dist > 1.5
            body.position.set(data.position.x, data.position.y, data.position.z);
            body.quaternion.set(data.quaternion.x, data.quaternion.y, data.quaternion.z, data.quaternion.w);
            return;
        }

        // Store target state for interpolation
        if (!body.userData.networkTarget) {
            body.userData.networkTarget = {
                position: new CANNON.Vec3(),
                quaternion: new CANNON.Quaternion(),
                velocity: new CANNON.Vec3(),
                angularVelocity: new CANNON.Vec3()
            };
        }

        const target = body.userData.networkTarget;
        target.position.set(data.position.x, data.position.y, data.position.z);
        target.quaternion.set(data.quaternion.x, data.quaternion.y, data.quaternion.z, data.quaternion.w);
        target.velocity.set(data.velocity.x, data.velocity.y, data.velocity.z);
        target.angularVelocity.set(data.angularVelocity.x, data.angularVelocity.y, data.angularVelocity.z);
    }

    interpolateNetworkObjects(deltaTime) {
        // Called from update() - smoothly interpolate objects to network state
        if (!this.game.interactables) return;

        Object.keys(this.game.interactables).forEach(objectId => {
            const obj = this.game.interactables[objectId];
            if (!obj || !obj.body) return;

            const body = obj.body;
            const target = body.userData.networkTarget;

            if (!target) return;

            // Authority check
            const isLocallyControlled = this.game.player && this.game.player.holdingObject === body;
            const hasRecentLocalInteraction = this.trackedObjects[objectId] && this.trackedObjects[objectId].isActive;

            if (isLocallyControlled || hasRecentLocalInteraction) {
                return; // Skip interpolation for locally controlled objects
            }

            // Smoothing
            const lerpFactor = Math.min(deltaTime * 25.0, 1.0);

            // Store current as previous to keep Cannon.js internal integrator happy
            body.previousPosition.copy(body.position);
            body.previousQuaternion.copy(body.quaternion);

            // Interpolate position
            body.position.x += (target.position.x - body.position.x) * lerpFactor;
            body.position.y += (target.position.y - body.position.y) * lerpFactor;
            body.position.z += (target.position.z - body.position.z) * lerpFactor;

            // Quaternion interpolation
            body.quaternion.x += (target.quaternion.x - body.quaternion.x) * lerpFactor;
            body.quaternion.y += (target.quaternion.y - body.quaternion.y) * lerpFactor;
            body.quaternion.z += (target.quaternion.z - body.quaternion.z) * lerpFactor;
            body.quaternion.w += (target.quaternion.w - body.quaternion.w) * lerpFactor;
            body.quaternion.normalize();

            // Direct Velocity sync (Velocity doesn't need much lerp, it drive the physics)
            body.velocity.x = target.velocity.x;
            body.velocity.y = target.velocity.y;
            body.velocity.z = target.velocity.z;

            body.angularVelocity.x = target.angularVelocity.x;
            body.angularVelocity.y = target.angularVelocity.y;
            body.angularVelocity.z = target.angularVelocity.z;

            // Handle Sleeping
            const isMoving = Math.abs(body.velocity.x) > 0.05 ||
                Math.abs(body.velocity.y) > 0.05 ||
                Math.abs(body.velocity.z) > 0.05;

            if (isMoving) {
                body.wakeUp();
            } else if (body.velocity.x === 0 && body.velocity.y === 0 && body.velocity.z === 0) {
                // If network says it's dead still, allow it to sleep locally
                body.sleep();
            }
        });
    }


    sendObjectUpdate(body) {
        if (!this.isConnected || !body.userData.id) return;

        const data = {
            id: body.userData.id,
            position: { x: body.position.x, y: body.position.y, z: body.position.z },
            quaternion: { x: body.quaternion.x, y: body.quaternion.y, z: body.quaternion.z, w: body.quaternion.w },
            velocity: { x: body.velocity.x, y: body.velocity.y, z: body.velocity.z },
            angularVelocity: { x: body.angularVelocity.x, y: body.angularVelocity.y, z: body.angularVelocity.z }
        };
        this.socket.emit('object-update', data);
    }

    addRemotePlayer(id, data) {
        if (this.remotePlayers[id]) return;
        const player = new RemotePlayer(this.game, id, data);
        this.remotePlayers[id] = player;
    }

    removeRemotePlayer(id) {
        if (this.remotePlayers[id]) {
            this.remotePlayers[id].destroy();
            delete this.remotePlayers[id];
        }
    }

    update(deltaTime) {
        // Update all remote players
        Object.values(this.remotePlayers).forEach(p => p.update(deltaTime));

        // Send My Player Data
        if (this.isConnected && this.game.player && this.game.player.body) {
            const p = this.game.player;

            // Calculate horizontal speed for animation
            const vel = p.body.velocity;
            const horizontalSpeed = Math.sqrt(vel.x * vel.x + vel.z * vel.z);

            const data = {
                id: this.socket.id,
                position: {
                    x: p.body.position.x,
                    y: p.body.position.y,
                    z: p.body.position.z
                },
                rotation: p.mesh.rotation.y,
                velocity: {
                    x: vel.x,
                    y: vel.y,
                    z: vel.z
                },
                isGrounded: p.isGrounded || false,
                isRagdoll: p.isRagdoll || false,
                speed: horizontalSpeed,
                skin: p.currentSkin || 'happy',
                holding: p.holdingObject ? p.holdingObject.userData.id : null
            };

            this.socket.emit('player-update', data);
        }

        // Interpolate remote objects to their network target state
        this.interpolateNetworkObjects(deltaTime);

        // Sync objects at controlled rate
        this.objectSyncTimer += deltaTime;
        if (this.objectSyncTimer >= this.objectSyncRate) {
            this.objectSyncTimer = 0;
            this.syncMovingObjects();
        }
    }

    syncMovingObjects() {
        if (!this.isConnected || !this.game.interactables) return;

        // Iterate through all interactable objects
        Object.keys(this.game.interactables).forEach(objectId => {
            const obj = this.game.interactables[objectId];
            if (!obj || !obj.body) return;

            const body = obj.body;

            // Check if object is moving (has significant velocity)
            const velMagnitude = Math.sqrt(
                body.velocity.x ** 2 +
                body.velocity.y ** 2 +
                body.velocity.z ** 2
            );

            const angVelMagnitude = Math.sqrt(
                body.angularVelocity.x ** 2 +
                body.angularVelocity.y ** 2 +
                body.angularVelocity.z ** 2
            );

            const isMoving = velMagnitude > 0.1 || angVelMagnitude > 0.1;
            const isHeld = this.game.player && this.game.player.holdingObject === body;

            // Initialize tracking for this object if needed
            if (!this.trackedObjects[objectId]) {
                this.trackedObjects[objectId] = { timer: 0, isActive: false };
            }

            const tracking = this.trackedObjects[objectId];

            // If object is moving or held, keep it active
            if (isMoving || isHeld) {
                tracking.isActive = true;
                tracking.timer = 2.0; // Keep syncing for 2 seconds after it stops
            } else if (tracking.timer > 0) {
                tracking.timer -= this.objectSyncRate;
                if (tracking.timer <= 0) {
                    tracking.isActive = false;
                }
            }

            // Send update if object needs syncing
            if (tracking.isActive || isHeld) {
                this.sendObjectUpdate(body);
            }
        });
    }
}
