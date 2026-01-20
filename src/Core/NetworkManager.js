import { io } from 'socket.io-client';
import * as CANNON from 'cannon-es';
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

            // Force Dynamic immediately so we can push it locally!
            // If it was Kinematic (from remote), this breaks the lock and lets physics solve the collision.
            if (objectBody.type !== CANNON.Body.DYNAMIC) {
                objectBody.type = CANNON.Body.DYNAMIC;
                objectBody.wakeUp();
            }
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
            if (this.game.interactables && this.game.interactables[data.id] && this.game.interactables[data.id].body) {
                this.game.interactables[data.id].body.userData.lastNetworkUpdate = Date.now();
            }
            this.updateObjectState(data);
        });

        this.socket.on('current-objects', (objects) => {
            if (!objects) return;
            Object.values(objects).forEach(data => {
                if (this.game.interactables && this.game.interactables[data.id] && this.game.interactables[data.id].body) {
                    this.game.interactables[data.id].body.userData.lastNetworkUpdate = Date.now();
                }
                this.updateObjectState(data);
            });
        });
    }

    updateObjectState(data) {
        // data: { id, position, quaternion, velocity, angularVelocity, owner }
        if (!this.game.interactables || !this.game.interactables[data.id]) return;

        const obj = this.game.interactables[data.id];
        const body = obj.body;

        // --- PROXIMITY CHECK ---
        let distToPlayer = 1000;
        if (this.game.player && this.game.player.body) {
            const p = this.game.player.body.position;
            const o = body.position;
            distToPlayer = Math.sqrt((p.x - o.x) ** 2 + (p.y - o.y) ** 2 + (p.z - o.z) ** 2);
        }

        // If Close (5m) OR Locally Controlled -> Dynamic & Skip Interpolation
        const isClose = distToPlayer < 5.0;
        const isLocallyControlled = this.game.player && this.game.player.holdingObject === body;
        const hasRecentLocalInteraction = this.trackedObjects[data.id] && this.trackedObjects[data.id].isActive;

        if (isLocallyControlled || hasRecentLocalInteraction || isClose) {
            if (body.type !== CANNON.Body.DYNAMIC) {
                body.type = CANNON.Body.DYNAMIC;
                body.wakeUp();
            }
            // Do not apply remote data if we are close/interacting
            return;
        }

        // Remote owned -> Kinematic
        const isRemoteOwned = data.owner && data.owner !== this.socket.id;
        if (isRemoteOwned) {
            if (body.type !== CANNON.Body.KINEMATIC) {
                body.type = CANNON.Body.KINEMATIC;
                body.velocity.set(0, 0, 0);
                body.angularVelocity.set(0, 0, 0);
            }
        } else {
            // No owner -> Dynamic (but if far, it might sleep)
            if (body.type !== CANNON.Body.DYNAMIC) {
                body.type = CANNON.Body.DYNAMIC;
                body.wakeUp();
            }
        }

        // Initialize Buffer if needed
        if (!body.userData.updateBuffer) {
            body.userData.updateBuffer = [];
        }

        // Snap if too far
        const dx = body.position.x - data.position.x;
        const dy = body.position.y - data.position.y;
        const dz = body.position.z - data.position.z;
        const posDiffSq = dx * dx + dy * dy + dz * dz;

        const now = Date.now();

        if (posDiffSq > 2.25) { // dist > 1.5, Snap immediately
            body.position.set(data.position.x, data.position.y, data.position.z);
            body.quaternion.set(data.quaternion.x, data.quaternion.y, data.quaternion.z, data.quaternion.w);
            body.userData.updateBuffer = [];
        }

        // Push to buffer
        body.userData.updateBuffer.push({
            timestamp: now,
            position: new CANNON.Vec3(data.position.x, data.position.y, data.position.z),
            quaternion: new CANNON.Quaternion(data.quaternion.x, data.quaternion.y, data.quaternion.z, data.quaternion.w),
            velocity: new CANNON.Vec3(data.velocity.x, data.velocity.y, data.velocity.z),
            angularVelocity: new CANNON.Vec3(data.angularVelocity.x, data.angularVelocity.y, data.angularVelocity.z)
        });

        // Prune buffer
        while (body.userData.updateBuffer.length > 20 && body.userData.updateBuffer[0].timestamp < now - 1000) {
            body.userData.updateBuffer.shift();
        }
    }

    interpolateNetworkObjects(deltaTime) {
        if (!this.game.interactables) return;

        const INTERP_DELAY = 100; // ms latency buffer
        const renderTime = Date.now() - INTERP_DELAY;

        let playerPos = null;
        if (this.game.player && this.game.player.body) {
            playerPos = this.game.player.body.position;
        }

        Object.keys(this.game.interactables).forEach(objectId => {
            const obj = this.game.interactables[objectId];
            if (!obj || !obj.body) return;

            const body = obj.body;

            // Skip if no buffer or locally controlled
            if (!body.userData.updateBuffer || body.userData.updateBuffer.length === 0) return;

            const isLocallyControlled = this.game.player && this.game.player.holdingObject === body;
            const hasRecentLocalInteraction = this.trackedObjects[objectId] && this.trackedObjects[objectId].isActive;

            let isClose = false;
            if (playerPos) {
                const d2 = (playerPos.x - body.position.x) ** 2 + (playerPos.y - body.position.y) ** 2 + (playerPos.z - body.position.z) ** 2;
                if (d2 < 25.0) isClose = true;
            }

            if (isLocallyControlled || hasRecentLocalInteraction || isClose) return;

            // Only interpolate if KINEMATIC (Remote controlled)
            // If Dynamic, physics engine handles it (unless we want to soft-correct?)
            if (body.type !== CANNON.Body.KINEMATIC) return; // Allow dynamics to sleep/settle if not owned

            const buffer = body.userData.updateBuffer;
            let p0 = null;
            let p1 = null;

            // Find relevant frames
            for (let i = 0; i < buffer.length - 1; i++) {
                if (buffer[i].timestamp <= renderTime && buffer[i + 1].timestamp >= renderTime) {
                    p0 = buffer[i];
                    p1 = buffer[i + 1];
                    break;
                }
            }

            if (p0 && p1) {
                const total = p1.timestamp - p0.timestamp;
                const diff = renderTime - p0.timestamp;
                const factor = total > 0 ? diff / total : 0;

                // Interpolate Position
                const newPos = new CANNON.Vec3();
                p0.position.lerp(p1.position, factor, newPos);
                body.position.copy(newPos);

                // Interpolate Quaternion
                const newQuat = new CANNON.Quaternion();
                p0.quaternion.slerp(p1.quaternion, factor, newQuat);
                body.quaternion.copy(newQuat);

                // Update Velocity (for handover)
                body.velocity.copy(p1.velocity);
                body.angularVelocity.copy(p1.angularVelocity);

                body.wakeUp();

            } else if (buffer.length > 0) {
                // Fallback: Latest
                const newest = buffer[buffer.length - 1];
                // Only snap if we are waiting for future data (lagging behind real time but ahead of buffer)
                // If we are strictly behind buffer (renderTime < oldest), we wait.
                if (renderTime > newest.timestamp) {
                    body.position.copy(newest.position);
                    body.quaternion.copy(newest.quaternion);
                }
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

        // Check for remote authority timeouts
        this.checkRemoteTimeouts();

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

    checkRemoteTimeouts() {
        if (!this.game.interactables) return;
        const now = Date.now();
        const TIMEOUT_MS = 500; // Release authority if no updates for 500ms

        Object.keys(this.game.interactables).forEach(objectId => {
            const obj = this.game.interactables[objectId];
            if (!obj || !obj.body) return;
            const body = obj.body;

            // Skip if locally controlled/held
            const isLocallyControlled = this.game.player && this.game.player.holdingObject === body;
            const tracking = this.trackedObjects[objectId];
            const hasRecentLocalInteraction = tracking && tracking.isActive;

            if (isLocallyControlled || hasRecentLocalInteraction) return;

            // If it is Kinematic (Remote Controlled), check if it timed out
            if (body.type === CANNON.Body.KINEMATIC) {
                const lastUpdate = body.userData.lastNetworkUpdate || 0;
                if (now - lastUpdate > TIMEOUT_MS) {
                    // Revert to dynamic so it settles/sleeps or can be pushed
                    body.type = CANNON.Body.DYNAMIC;
                    body.wakeUp(); // Wake to settle
                }
            }
        });
    }
}
