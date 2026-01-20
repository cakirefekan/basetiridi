import * as THREE from 'three';
import { FaceGenerator } from '../Utils/FaceGenerator.js';

export class RemotePlayer {
    constructor(game, id, initialState) {
        this.game = game;
        this.scene = game.scene;
        this.id = id;
        this.data = initialState || {};

        // Initial Buffer State
        this.positionBuffer = [];
        this.targetPosition = new THREE.Vector3(); // Keep for fallback references

        // Skin
        this.currentSkin = this.data.skin || 'happy';

        this.createMesh();

        // Set Initial Position
        if (this.data.position) {
            this.mesh.position.set(this.data.position.x, this.data.position.y, this.data.position.z);
            // Push initial state
            this.positionBuffer.push({
                timestamp: Date.now(),
                position: this.mesh.position.clone(),
                rotation: this.data.rotation || 0
            });
        }
        if (this.data.rotation) {
            this.mesh.rotation.y = this.data.rotation;
        }

        this.animationTimer = 0;

        // Animation state (synced from network)
        this.velocity = { x: 0, y: 0, z: 0 };
        this.speed = 0;
        this.isGrounded = true;
        this.isRagdoll = false;
    }

    createMesh() {
        // Visual Mesh (Lego-like Character Group) - MATCHING PLAYER.JS VISUALS
        this.mesh = new THREE.Group();
        this.mesh.rotation.order = 'YXZ'; // Important for ragdoll/animations
        this.scene.add(this.mesh);

        // Materials
        const skinMat = new THREE.MeshStandardMaterial({ color: 0xffcd03, roughness: 0.3 });
        const shirtMat = new THREE.MeshStandardMaterial({ color: 0x0055bb, roughness: 0.3 });
        const pantsMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.3 });

        // Generate Face Textures
        this.faceTextures = {};
        ['happy', 'angry', 'cool', 'shocked'].forEach(type => {
            const canvas = FaceGenerator.createTexture(type);
            const texture = new THREE.CanvasTexture(canvas);
            texture.magFilter = THREE.NearestFilter; // Pixel art look
            this.faceTextures[type] = texture;
        });

        this.headMaterials = [
            skinMat, skinMat, skinMat, skinMat,
            new THREE.MeshStandardMaterial({ map: this.faceTextures[this.currentSkin], roughness: 0.3 }), // Front
            skinMat
        ];

        // Head
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), this.headMaterials);
        head.position.y = 1.6 - 0.45; // Adjust for removed physics sphere offset logic if needed?
        // Player.js: head.position.y = 1.6; mesh.position.y += -radius - 0.45;
        // Let's match Player.js local coordinates relative to mesh root
        head.position.y = 1.6;
        head.castShadow = true;
        this.mesh.add(head);

        // Torso
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.25), shirtMat);
        body.position.y = 1.15;
        body.castShadow = true;
        this.mesh.add(body);

        // Helper to create limb with pivot
        const createLimb = (w, h, d, mat, x, y, z) => {
            const pivot = new THREE.Object3D();
            pivot.position.set(x, y, z);

            const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
            mesh.position.y = -h / 2;
            mesh.castShadow = true;

            pivot.add(mesh);
            this.mesh.add(pivot);
            return pivot;
        };

        const armW = 0.12, armH = 0.45, armD = 0.12;
        const leftArm = createLimb(armW, armH, armD, shirtMat, -0.28, 1.35, 0);
        const rightArm = createLimb(armW, armH, armD, shirtMat, 0.28, 1.35, 0);

        const legW = 0.16, legH = 0.5, legD = 0.2;
        const leftLeg = createLimb(legW, legH, legD, pantsMat, -0.11, 0.9, 0);
        const rightLeg = createLimb(legW, legH, legD, pantsMat, 0.11, 0.9, 0);

        this.parts = { head, body, leftArm, rightArm, leftLeg, rightLeg };

        // Apply Offset same as Player to sit on ground correctly
        // Player.js: this.mesh.position.y += yOffset; (-radius - 0.45) = -0.4 - 0.45 = -0.85
        // Within the mesh Group, the children are at 1.6, 1.15 etc. 
        // We can just shift the children down, OR shift the mesh Group down relative to the received Physics Position.
        // Since we receive Physics Position (0, 0.4, 0), and we want feet at 0.
        // Mesh needs to be at (0, 0.4 - 0.85, 0) = (0, -0.45, 0)?
        // Wait, Player.js copies body pos (0, 0.4, 0) then adds yOffset (-0.85) => Result Y = -0.45.
        // So we will apply that offset in update().
        this.yOffset = -0.85;
        this.anchorPosition = new THREE.Vector3(); // Logical physics position

        // Nickname Label
        if (this.data.nickname) {
            this.createNicknameLabel(this.data.nickname);
        }
    }

    createNicknameLabel(name) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 256;
        canvas.height = 64;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(0, 0, 256, 64);

        ctx.fillStyle = 'white';
        ctx.font = 'bold 32px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(name, 128, 32);

        const texture = new THREE.CanvasTexture(canvas);
        const spriteMaterial = new THREE.SpriteMaterial({ map: texture, transparent: true });
        const sprite = new THREE.Sprite(spriteMaterial);

        sprite.position.y = 2.2; // Above head (head is ~1.75)
        sprite.scale.set(1.5, 0.375, 1);

        this.mesh.add(sprite);
    }

    updateData(data) {
        if (!data) return;

        // --- Interpolation Buffer Update ---
        const now = Date.now();
        if (data.position) {
            this.positionBuffer.push({
                timestamp: now,
                position: new THREE.Vector3(data.position.x, data.position.y, data.position.z),
                rotation: data.rotation !== undefined ? data.rotation : this.mesh.rotation.y
            });

            // Keep buffer clean (max 1 second history)
            while (this.positionBuffer.length > 20 && this.positionBuffer[0].timestamp < now - 1000) {
                this.positionBuffer.shift();
            }
        }
        // -----------------------------------

        if (data.skin && data.skin !== this.currentSkin) {
            this.setSkin(data.skin);
        }
        if (data.holding !== undefined) {
            this.updateHoldingObject(data.holding);
        }

        // Animation states
        if (data.velocity !== undefined) {
            this.velocity = data.velocity;
        }
        if (data.speed !== undefined) {
            this.speed = data.speed;
        }
        if (data.isGrounded !== undefined) {
            this.isGrounded = data.isGrounded;
        }
        if (data.isRagdoll !== undefined) {
            this.isRagdoll = data.isRagdoll;
        }
    }

    updateHoldingObject(objectId) {
        // Remove previous highlight if any
        if (this.heldObjectId && this.heldObjectId !== objectId) {
            this.clearHoldingHighlight(this.heldObjectId);
        }

        this.heldObjectId = objectId;

        // Add highlight to new held object
        if (objectId && this.game.interactables && this.game.interactables[objectId]) {
            const obj = this.game.interactables[objectId];
            if (obj.mesh) {
                // Store original material if not already stored
                if (!obj.mesh.userData.originalMaterial) {
                    obj.mesh.userData.originalMaterial = obj.mesh.material;
                }
                // Apply highlight material
                obj.mesh.material = new THREE.MeshStandardMaterial({
                    color: 0xffaa00,
                    roughness: 0.3,
                    emissive: 0x442200,
                    emissiveIntensity: 0.3
                });
            }
        } else if (!objectId && this.heldObjectId) {
            // Released object
            this.clearHoldingHighlight(this.heldObjectId);
        }
    }

    clearHoldingHighlight(objectId) {
        if (this.game.interactables && this.game.interactables[objectId]) {
            const obj = this.game.interactables[objectId];
            if (obj.mesh && obj.mesh.userData.originalMaterial) {
                obj.mesh.material = obj.mesh.userData.originalMaterial;
            }
        }
    }

    setSkin(skin) {
        if (this.faceTextures[skin]) {
            this.currentSkin = skin;
            this.headMaterials[4].map = this.faceTextures[skin];
            this.headMaterials[4].needsUpdate = true;
        }
    }

    update(deltaTime) {
        // --- Interpolation Logic ---
        const INTERP_DELAY = 100; // ms latency buffer
        const renderTime = Date.now() - INTERP_DELAY;

        let p0 = null;
        let p1 = null;

        // Find relevant frames
        for (let i = 0; i < this.positionBuffer.length - 1; i++) {
            if (this.positionBuffer[i].timestamp <= renderTime && this.positionBuffer[i + 1].timestamp >= renderTime) {
                p0 = this.positionBuffer[i];
                p1 = this.positionBuffer[i + 1];
                break;
            }
        }

        if (p0 && p1) {
            // Interpolate between p0 and p1
            const total = p1.timestamp - p0.timestamp;
            const diff = renderTime - p0.timestamp;
            const factor = total > 0 ? diff / total : 0;

            this.anchorPosition.lerpVectors(p0.position, p1.position, factor);

            // Rotation Interpolation (Shortest Path)
            let rotDiff = p1.rotation - p0.rotation;
            while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
            while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
            this.mesh.rotation.y = p0.rotation + rotDiff * factor;

        } else if (this.positionBuffer.length > 0) {
            // Fallback: Check if we should extrapolate or clamp
            // If we are waiting for data (renderTime > newest), we clamp to newest.
            // If we are lagging behind updates significantly?

            // Simple robust fallback: display the state closest to renderTime?
            // Usually clamping to newest is best for "lag".
            const newest = this.positionBuffer[this.positionBuffer.length - 1];
            this.anchorPosition.copy(newest.position);
            this.mesh.rotation.y = newest.rotation;
        }
        // ---------------------------

        // Update Mesh Position (Anchor + Offset)
        this.mesh.position.copy(this.anchorPosition);

        // Adjust Y offset for ragdoll (matches Player.js logic)
        let yOffset = this.yOffset;
        if (this.isRagdoll) {
            yOffset += 0.6; // Lift up when ragdolling
        }
        this.mesh.position.y += yOffset;

        // Ragdoll mesh rotation (fall on back)
        if (this.isRagdoll) {
            this.mesh.rotation.x = THREE.MathUtils.lerp(this.mesh.rotation.x, -Math.PI / 2, 8 * deltaTime);
        } else {
            this.mesh.rotation.x = THREE.MathUtils.lerp(this.mesh.rotation.x, 0, 8 * deltaTime);
        }

        this.animate(deltaTime);
    }

    // Override createMesh to bake offset?
    // Actually, let's just use a container.
    // RemotePlayer.mesh (Anchor at Physics Pos) -> this.visualGroup (Visuals at Y -0.85)

    animate(deltaTime) {
        if (!this.parts) return;

        const lerpSpeed = 10 * deltaTime;

        // Ragdoll Pose override (matches Player.js)
        if (this.isRagdoll) {
            // Starfish Pose (Hands up/out, Legs out)
            this.parts.leftArm.rotation.x = THREE.MathUtils.lerp(this.parts.leftArm.rotation.x, -2.8, lerpSpeed);
            this.parts.rightArm.rotation.x = THREE.MathUtils.lerp(this.parts.rightArm.rotation.x, -2.8, lerpSpeed);

            // Spread sideways
            this.parts.leftArm.rotation.z = THREE.MathUtils.lerp(this.parts.leftArm.rotation.z, -0.5, lerpSpeed);
            this.parts.rightArm.rotation.z = THREE.MathUtils.lerp(this.parts.rightArm.rotation.z, 0.5, lerpSpeed);

            // Legs splayed
            this.parts.leftLeg.rotation.x = THREE.MathUtils.lerp(this.parts.leftLeg.rotation.x, 0, lerpSpeed);
            this.parts.rightLeg.rotation.x = THREE.MathUtils.lerp(this.parts.rightLeg.rotation.x, 0, lerpSpeed);
            this.parts.leftLeg.rotation.z = THREE.MathUtils.lerp(this.parts.leftLeg.rotation.z, -0.3, lerpSpeed);
            this.parts.rightLeg.rotation.z = THREE.MathUtils.lerp(this.parts.rightLeg.rotation.z, 0.3, lerpSpeed);
            return;
        }

        // Reset Z rotations from special poses
        this.parts.leftArm.rotation.z = THREE.MathUtils.lerp(this.parts.leftArm.rotation.z, 0, lerpSpeed);
        this.parts.rightArm.rotation.z = THREE.MathUtils.lerp(this.parts.rightArm.rotation.z, 0, lerpSpeed);
        this.parts.leftLeg.rotation.z = THREE.MathUtils.lerp(this.parts.leftLeg.rotation.z, 0, lerpSpeed);
        this.parts.rightLeg.rotation.z = THREE.MathUtils.lerp(this.parts.rightLeg.rotation.z, 0, lerpSpeed);

        // Jump Pose override (matches Player.js)
        if (!this.isGrounded) {
            const isMoving = this.speed > 1.0;

            if (isMoving) {
                // Moving Jump: Arms Up (Superman)
                this.parts.leftArm.rotation.x = THREE.MathUtils.lerp(this.parts.leftArm.rotation.x, -2.5, lerpSpeed);
                this.parts.rightArm.rotation.x = THREE.MathUtils.lerp(this.parts.rightArm.rotation.x, -2.5, lerpSpeed);
            } else {
                // Static Jump: Arms Side (T-Pose / Open Wings)
                this.parts.leftArm.rotation.x = THREE.MathUtils.lerp(this.parts.leftArm.rotation.x, 0, lerpSpeed);
                this.parts.rightArm.rotation.x = THREE.MathUtils.lerp(this.parts.rightArm.rotation.x, 0, lerpSpeed);

                // Open to sides (approx 90-100 degrees)
                this.parts.leftArm.rotation.z = THREE.MathUtils.lerp(this.parts.leftArm.rotation.z, -1.8, lerpSpeed);
                this.parts.rightArm.rotation.z = THREE.MathUtils.lerp(this.parts.rightArm.rotation.z, 1.8, lerpSpeed);
            }

            // Legs kicking back
            this.parts.leftLeg.rotation.x = THREE.MathUtils.lerp(this.parts.leftLeg.rotation.x, 0.5, lerpSpeed);
            this.parts.rightLeg.rotation.x = THREE.MathUtils.lerp(this.parts.rightLeg.rotation.x, -0.5, lerpSpeed);
            return;
        }

        // Walking Animation (matches Player.js)
        const isMoving = this.speed > 0.1;

        if (isMoving) {
            // Speed up animation based on movement speed
            this.animationTimer += deltaTime * this.speed * 2.5;

            // Oscillate limbs
            const angle = Math.sin(this.animationTimer) * 0.8;

            this.parts.leftArm.rotation.x = angle;
            this.parts.rightLeg.rotation.x = angle;

            this.parts.rightArm.rotation.x = -angle;
            this.parts.leftLeg.rotation.x = -angle;
        } else {
            // Reset to idle pose smoothly
            this.parts.leftArm.rotation.x = THREE.MathUtils.lerp(this.parts.leftArm.rotation.x, 0, lerpSpeed);
            this.parts.rightArm.rotation.x = THREE.MathUtils.lerp(this.parts.rightArm.rotation.x, 0, lerpSpeed);
            this.parts.leftLeg.rotation.x = THREE.MathUtils.lerp(this.parts.leftLeg.rotation.x, 0, lerpSpeed);
            this.parts.rightLeg.rotation.x = THREE.MathUtils.lerp(this.parts.rightLeg.rotation.x, 0, lerpSpeed);
        }
    }

    destroy() {
        this.scene.remove(this.mesh);
        // dispose materials/geometry...
    }
}
