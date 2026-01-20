import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { FaceGenerator } from '../Utils/FaceGenerator.js';

export class Player {
    constructor(game) {
        this.game = game;
        this.scene = game.scene;
        this.camera = game.camera;
        this.physics = game.physics;
        this.input = game.input;

        this.params = {
            speed: 6.67, // ~24 km/h (24 / 3.6)
            jumpForce: 13, // High force to counter High Gravity
            height: 1.8,
            radius: 0.4,
            sensitivity: 0.002
        };

        // UI
        this.speedometer = document.getElementById('speedometer');
        this.skinMenu = document.getElementById('skin-menu');
        this.showSpeed = false;
        this.isMenuOpen = false;

        // Ragdoll State
        this.isRagdoll = false;
        this.ragdollTimer = 0;

        this.ragdollTimer = 0;

        // Interaction State
        this.holdingObject = null;
        this.holdingConstraint = null;
        this.interactPressed = false;

        this.createPlayer();
        this.initCamera();

        // Input Listener for Menu (M key)
        document.addEventListener('keydown', (e) => {
            if (e.code === 'KeyM') {
                this.toggleMenu();
            }
        });
    }

    createPlayer() {
        // Visual Mesh (Lego-like Character Group)
        this.mesh = new THREE.Group();
        this.mesh.rotation.order = 'YXZ'; // Important for ragdoll
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

        // Head Material Array (6 faces)
        // BoxGeometry: +x, -x, +y, -y, +z, -z
        // We want face on +z (Front). 
        // 0:Right, 1:Left, 2:Top, 3:Bottom, 4:Front, 5:Back
        // Note: Three.js BoxGeometry face order depends on version but usually Right, Left, Top, Bottom, Front, Back.
        // Let's assume standard. Texture on index 4.

        this.headMaterials = [
            skinMat, skinMat, skinMat, skinMat,
            new THREE.MeshStandardMaterial({ map: this.faceTextures['happy'], roughness: 0.3 }), // Front
            skinMat
        ];

        // Head
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), this.headMaterials);
        head.position.y = 1.6;
        head.castShadow = true;
        this.mesh.add(head);

        this.initSkinMenu();

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
            mesh.position.y = -h / 2; // Offset center so pivot is at top
            mesh.castShadow = true;

            pivot.add(mesh);
            this.mesh.add(pivot);
            return pivot;
        };

        // Arms (Pivot at Shoulder Y: ~1.35)
        // Body Center is 1.15, Body Height 0.5. Top is 1.4.
        // Shoulders should be slightly below top, say 1.35.
        const armW = 0.12, armH = 0.45, armD = 0.12;
        const leftArm = createLimb(armW, armH, armD, shirtMat, -0.28, 1.35, 0);
        const rightArm = createLimb(armW, armH, armD, shirtMat, 0.28, 1.35, 0);

        // Legs (Pivot at Hip Y: ~0.9)
        // Body Bottom is 0.9. Legs start there.
        const legW = 0.16, legH = 0.5, legD = 0.2;
        const leftLeg = createLimb(legW, legH, legD, pantsMat, -0.11, 0.9, 0);
        const rightLeg = createLimb(legW, legH, legD, pantsMat, 0.11, 0.9, 0);

        // Store references for animation
        this.parts = { head, body, leftArm, rightArm, leftLeg, rightLeg };

        // Physics Body
        // Using a sphere for the base allows smooth movement over geometry
        // We use a radius that fits within the box width (0.4)
        const shape = new CANNON.Sphere(this.params.radius);

        this.body = new CANNON.Body({
            mass: 70, // kg
            position: new CANNON.Vec3(0, 5, 0),
            shape: shape,
            material: this.physics.slipperyMaterial, // Use frictionless material
            fixedRotation: true,
            linearDamping: 0.1,
            allowSleep: false // Prevent player from sleeping which causes input lock
        });

        this.physics.addBody(this.body);

        // Init Look Angles
        this.yaw = 0;
        this.pitch = 0;

        // Sync camera initial position
        // Sync camera initial position
        this.updateCameraPosition();

        // Animation State
        this.walkTimer = 0;
    }

    initCamera() {
        // Camera Rig Hierarchy to prevent Gimbal Lock / Axis issues:
        // Rig (Follows Player Position) -> YawObject (Rotates Y) -> PitchObject (Rotates X) -> Camera (Offset)

        this.cameraRig = new THREE.Object3D();
        this.scene.add(this.cameraRig);

        this.yawObject = new THREE.Object3D();
        this.cameraRig.add(this.yawObject);

        this.pitchObject = new THREE.Object3D();
        this.yawObject.add(this.pitchObject);

        // Camera Offset (3rd person boom)
        // Sitting on the Pitch Object
        // X: Horizontal Offset (Right Shoulder > 0)
        // Y: Vertical Offset relative to pivot
        // Z: Distance behind
        this.cameraOffset = new THREE.Vector3(1.0, 0.5, 5);
        this.camera.position.copy(this.cameraOffset);

        // Boom pivot height (Neck/Shoulder level)
        this.pitchObject.position.y = 2.0;

        this.pitchObject.add(this.camera);

        // Reset camera rotation to ensure it looks locally
        this.camera.rotation.set(0, 0, 0);
    }

    update(deltaTime) {
        this.handleMouseLook(deltaTime);
        this.handleMovement(deltaTime);
        this.handleInteraction(deltaTime);
        this.updateHeldObject(deltaTime);
        this.updateAnimations(deltaTime);
        this.updateCameraPosition();
        this.updateCameraEffects(deltaTime);
        this.updateUI();
    }

    updateUI() {
        // Toggle Logic
        if (this.input.keys.toggleSpeed && !this.togglePressed) {
            this.showSpeed = !this.showSpeed;
            this.togglePressed = true;
            if (this.showSpeed) {
                this.speedometer.classList.remove('hidden');
            } else {
                this.speedometer.classList.add('hidden');
            }
        }
        if (!this.input.keys.toggleSpeed) {
            this.togglePressed = false;
        }

        // Update Text
        if (this.showSpeed) {
            const velocity = this.body.velocity;
            const speed = Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z);
            // Convert to km/h roughly (m/s * 3.6)
            const kph = (speed * 3.6).toFixed(1);
            this.speedometer.innerText = `Speed: ${kph} km/h`;
        }
    }

    updateAnimations(deltaTime) {
        if (!this.parts) return;

        const lerpSpeed = 10 * deltaTime;
        const velocity = this.body.velocity;
        const speed = Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z);

        // Ragdoll Pose override
        if (this.isRagdoll) {
            // Starfish Pose (Hands up/out, Legs out)
            this.parts.leftArm.rotation.x = THREE.MathUtils.lerp(this.parts.leftArm.rotation.x, -2.8, lerpSpeed); // Hands over head
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

        // Jump Pose override
        if (!this.isGrounded) {
            const isMoving = speed > 1.0;

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

        const isMoving = speed > 0.1;

        if (isMoving) {
            // Speed up animation based on movement speed
            this.walkTimer += deltaTime * speed * 2.5;

            // Oscillate limbs
            // Left Arm & Right Leg move together
            // Right Arm & Left Leg move together
            // Standard walk cycle: +/- 45 degrees (0.8 rads) max

            const angle = Math.sin(this.walkTimer) * 0.8;

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

            // Reset timer to keep phase continuous? Or irrelevant.
        }
    }

    handleMouseLook(deltaTime) {
        if (!this.input.isLocked) return;

        const { x, y } = this.input.getMouseDelta();
        const sensitivity = this.params.sensitivity;

        // Yaw -> Rotate YawObject around Y
        this.yaw -= x * sensitivity;

        // Pitch -> Rotate PitchObject around X
        this.pitch -= y * sensitivity;
        this.pitch = Math.max(-1.0, Math.min(1.0, this.pitch)); // Clamp look up/down

        // Apply rotations
        this.yawObject.rotation.y = this.yaw;
        this.pitchObject.rotation.x = this.pitch;
    }

    handleMovement(deltaTime) {
        // Init state if missing (lazy init)
        if (this.wasGrounded === undefined) this.wasGrounded = true;
        if (this.jumpCooldown === undefined) this.jumpCooldown = 0;
        if (this.ragdollDebounce === undefined) this.ragdollDebounce = 0; // Prevent accidental triggers

        // 1. Check Ground State efficiently
        this.isGrounded = this.checkGrounded();

        // Ragdoll Recovery Logic
        if (this.isRagdoll) {
            // Fall back visual (Rotate X to NEGATIVE 90 deg for "On Back")
            this.mesh.rotation.x = THREE.MathUtils.lerp(this.mesh.rotation.x, -Math.PI / 2, 8 * deltaTime);

            if (this.isGrounded) {
                this.ragdollTimer -= deltaTime;
                if (this.ragdollTimer <= 0) {
                    this.isRagdoll = false;
                    this.body.wakeUp(); // Wake up to move
                    this.mesh.rotation.x = 0; // Snap up
                }
            }
            // Friction/Stop movement while ragdolling
            this.body.velocity.x = THREE.MathUtils.lerp(this.body.velocity.x, 0, 5 * deltaTime);
            this.body.velocity.z = THREE.MathUtils.lerp(this.body.velocity.z, 0, 5 * deltaTime);
            return; // SKIP NORMAL MOVEMENT
        } else {
            // Recover from ragdoll (visual smoothing)
            if (Math.abs(this.mesh.rotation.x) > 0.1) {
                this.mesh.rotation.x = THREE.MathUtils.lerp(this.mesh.rotation.x, 0, 15 * deltaTime);
            } else {
                this.mesh.rotation.x = 0;
            }
        }

        // Detect Landing
        let applyLandingFriction = false;
        if (this.isGrounded && !this.wasGrounded) {
            // Just landed!
            applyLandingFriction = true;
        }
        this.wasGrounded = this.isGrounded;

        // Update Timers
        if (this.jumpCooldown > 0) this.jumpCooldown -= deltaTime;
        if (this.ragdollDebounce > 0) this.ragdollDebounce -= deltaTime;

        // 2. Input Calculation
        const transform = new THREE.Euler(0, this.yaw, 0);
        const forward = new THREE.Vector3(0, 0, -1).applyEuler(transform);
        const right = new THREE.Vector3(1, 0, 0).applyEuler(transform);

        const direction = new THREE.Vector3();

        if (this.input.keys.forward) direction.add(forward);
        if (this.input.keys.backward) direction.sub(forward);
        if (this.input.keys.right) direction.add(right);
        if (this.input.keys.left) direction.sub(right);

        if (direction.length() > 0) direction.normalize();

        // 3. Movement Physics Settings
        const targetRunSpeed = this.input.keys.sprint ? this.params.speed * 1.5 : this.params.speed;
        let accel = 100.0;
        let friction = 10.0;

        if (this.isGrounded) {
            accel = 150.0; // Snappy acceleration
            friction = 20.0; // Responsive stopping
        } else {
            // Air Control
            accel = 20.0; // Low air control
            friction = 0.5; // Preserve air momentum
        }

        // Apply Forces
        const currentVel = this.body.velocity;

        if (direction.length() > 0) {
            // Accelerate
            const targetVelX = direction.x * targetRunSpeed;
            const targetVelZ = direction.z * targetRunSpeed;

            const moveTowards = (current, target, maxDelta) => {
                if (Math.abs(target - current) <= maxDelta) return target;
                return current + Math.sign(target - current) * maxDelta;
            };

            currentVel.x = moveTowards(currentVel.x, targetVelX, accel * deltaTime);
            currentVel.z = moveTowards(currentVel.z, targetVelZ, accel * deltaTime);

            // Visual Rotation
            const targetRotation = Math.atan2(direction.x, direction.z);
            let rotDiff = targetRotation - this.mesh.rotation.y;
            while (rotDiff > Math.PI) rotDiff -= Math.PI * 2;
            while (rotDiff < -Math.PI) rotDiff += Math.PI * 2;
            this.mesh.rotation.y += rotDiff * Math.min(1, 25 * deltaTime);

            this.body.wakeUp();

        } else {
            // Decelerate / Friction
            // If just landed and not moving, STOP immediately to prevent sliding
            if (applyLandingFriction) {
                currentVel.x *= 0.1;
                currentVel.z *= 0.1;
            } else {
                const speed = Math.sqrt(currentVel.x ** 2 + currentVel.z ** 2);
                if (speed > 0) {
                    const drop = friction * deltaTime; // Linear friction
                    const newSpeed = Math.max(0, speed - drop);
                    const factor = speed > 0.001 ? newSpeed / speed : 0;

                    currentVel.x *= factor;
                    currentVel.z *= factor;
                }
            }
        }

        // CHECK RAGDOLL TRIGGER (Debounced)
        // Stationary, In Air, Sprint Key Pressed
        const speed = Math.sqrt(currentVel.x ** 2 + currentVel.z ** 2);
        if (!this.isGrounded && speed < 1.0 && this.input.keys.sprint && !this.isRagdoll && this.ragdollDebounce <= 0) {
            this.isRagdoll = true;
            this.ragdollTimer = 2.0;
            this.ragdollDebounce = 1.0;
        }

        // 4. Jump Logic
        if (this.input.keys.jump && this.isGrounded && this.jumpCooldown <= 0) {
            this.body.velocity.y = this.params.jumpForce;
            this.jumpCooldown = 0.25;
            this.input.keys.jump = false;
            this.body.wakeUp();
        }
    }

    handleInteraction(deltaTime) {
        // Debounce E key
        if (!this.input.keys.interact) {
            this.interactPressed = false;
            return;
        }
        if (this.interactPressed) return;
        this.interactPressed = true;

        if (this.holdingObject) {
            this.dropObject();
        } else {
            this.pickupObject();
        }
    }

    pickupObject() {
        // Raycast forward from player
        const transform = new THREE.Euler(0, this.yaw, 0);
        const forward = new THREE.Vector3(0, 0, -1).applyEuler(transform);

        const from = this.body.position;
        const to = from.vadd(new CANNON.Vec3(forward.x * 3, forward.y * 3, forward.z * 3)); // 3 unit range

        const result = new CANNON.RaycastResult();
        this.game.physics.world.raycastClosest(from, to, {
            skipBackfaces: true
        }, result);

        if (result.hasHit && result.body && result.body.userData && result.body.userData.interactable) {
            this.holdingObject = result.body;

            // Force Dynamic type to take ownership locally
            this.holdingObject.type = CANNON.Body.DYNAMIC;
            this.holdingObject.wakeUp();

            // Save original properties
            this.holdingObject.userData.originalMass = this.holdingObject.mass;
            this.holdingObject.userData.originalDamping = this.holdingObject.angularDamping;

            // Make object light and damped
            this.holdingObject.mass = 0.1;
            this.holdingObject.angularDamping = 0.9;
            this.holdingObject.updateMassProperties();

            // Constraint
            this.holdingConstraint = new CANNON.PointToPointConstraint(
                this.body,
                new CANNON.Vec3(0, 0.8, -1.5),
                this.holdingObject,
                new CANNON.Vec3(0, 0, 0)
            );

            this.game.physics.world.addConstraint(this.holdingConstraint);

            // Mark for network sync
            if (this.game.network && this.holdingObject.userData.id) {
                this.game.network.markObjectForSync(this.holdingObject.userData.id);
                this.game.network.sendObjectUpdate(this.holdingObject);
            }
        }
    }

    dropObject() {
        if (!this.holdingConstraint) return;

        this.game.physics.world.removeConstraint(this.holdingConstraint);
        this.holdingConstraint = null;

        if (this.holdingObject) {
            this.holdingObject.mass = this.holdingObject.userData.originalMass || 1;
            this.holdingObject.angularDamping = this.holdingObject.userData.originalDamping || 0.01;
            this.holdingObject.updateMassProperties();
            this.holdingObject.wakeUp();

            // Sync Drop and mark for continued sync
            if (this.game.network && this.holdingObject.userData.id) {
                this.game.network.markObjectForSync(this.holdingObject.userData.id);
                this.game.network.sendObjectUpdate(this.holdingObject);
            }

            this.holdingObject = null;
        }
    }

    updateHeldObject(deltaTime) {
        if (this.holdingObject && this.holdingConstraint) {
            // Update Pivot A to match Camera Yaw (Orbiting)
            const holdOffset = new THREE.Vector3(0, 0.8, -1.5);
            holdOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);

            this.holdingConstraint.pivotA.set(holdOffset.x, holdOffset.y, holdOffset.z);

            // Network Sync Interactable
            if (this.game.network && this.game.network.isConnected) {
                this.game.network.sendObjectUpdate(this.holdingObject);
            }
        }
    }

    checkGrounded() {
        const from = this.body.position;
        // Increased tolerance from 0.1 to 0.2 to prevent flickering "air state" while walking
        const to = from.vsub(new CANNON.Vec3(0, this.params.radius + 0.2, 0));
        const result = new CANNON.RaycastResult();

        if (this.physics && this.physics.world) {
            const hasHit = this.physics.world.raycastClosest(from, to, {
                skipBackfaces: true
            }, result);

            return hasHit && result.body !== this.body;
        }
        return false;
    }

    updateCameraPosition() {
        if (this.body && this.cameraRig) {
            // Sync Rig Position to Player Physics Body
            this.cameraRig.position.copy(this.body.position);

            // Sync Mesh position
            this.mesh.position.copy(this.body.position);

            // Correct Visual Offset
            let yOffset = -this.params.radius - 0.45;

            if (this.isRagdoll) {
                yOffset += 0.6;
            }

            this.mesh.position.y += yOffset;
        }

        // --- CAMERA COLLISION LOGIC ---
        // Prevent camera from clipping through walls
        if (this.camera && this.pitchObject) {
            // 1. Get the world position of the pivot (Neck)
            const pivotPos = new THREE.Vector3();
            this.pitchObject.getWorldPosition(pivotPos);

            // 2. Calculate ideal camera position based on offset (Standard boom length)
            // Clone the offset logic from initCamera: new THREE.Vector3(1.0, 0.5, 5) rotated by rig
            // Actually, simply:
            const idealLocalPos = this.cameraOffset.clone();
            const idealWorldPos = idealLocalPos.clone().applyMatrix4(this.pitchObject.matrixWorld);

            // 3. Raycast from Pivot to Ideal Position using Cannon (Physics World)
            // We use Cannon raycast because walls are physical bodies.

            // Convert to Cannon Vec3
            const start = new CANNON.Vec3(pivotPos.x, pivotPos.y, pivotPos.z);
            const end = new CANNON.Vec3(idealWorldPos.x, idealWorldPos.y, idealWorldPos.z);

            const result = new CANNON.RaycastResult();

            if (this.physics && this.physics.world) {
                // Raycast
                const hasHit = this.physics.world.raycastClosest(start, end, {
                    skipBackfaces: true,
                    collisionFilterMask: 1 // Only collide with Static Environment (Group 1) ideally, or Default
                    // Note: We need to make sure we don't hit the Player itself! Player body should be ignored.
                }, result);

                if (hasHit && result.body !== this.body) {
                    // Hit wall!
                    // Move camera to hit point (slightly buffered)
                    // We need to set the LOCAL position of the camera relative to pitchObject

                    // Distance actual
                    const hitDist = result.distance;
                    // Clamp min distance (0.5m) to avoid going inside head
                    const safeDist = Math.max(0.5, hitDist - 0.2);

                    // Simple approach: Scale the z-distance of the camera?
                    // Since cameraOffset is (1.0, 0.5, 5), it's complex.
                    // Easiest: Just interpolate Position between Pivot(0,0,0) and Offset

                    // Ratio of distance
                    const fullDist = Math.sqrt(idealLocalPos.x ** 2 + idealLocalPos.y ** 2 + idealLocalPos.z ** 2); // Approx 5.2
                    // But raycast distance is in World Units.

                    // Let's just Lerp the Camera Position towards 0,0,0 based on hit fraction
                    // Fraction = hitDist / Distance(Start, End)
                    const totalDist = start.distanceTo(end);
                    const fraction = Math.max(0.1, (hitDist - 0.2) / totalDist); // -0.2 buffer

                    this.camera.position.lerpVectors(new THREE.Vector3(0, 0, 0), this.cameraOffset, fraction);
                } else {
                    // No hit, restore to full offset
                    // Lerp back smoothly for nice feel
                    this.camera.position.lerp(this.cameraOffset, 0.2);
                }
            }
        }
    }

    updateCameraEffects(deltaTime) {
        if (!this.camera || !this.body) return;

        // Calculate horizontal speed
        const vel = this.body.velocity;
        const speed = Math.sqrt(vel.x * vel.x + vel.z * vel.z);

        // Base FOV and Max FOV
        const baseFOV = 75;
        const sprintFOV = 92; // Wider for speed/depth effect

        // Determine target based on speed threshold (Sprinting is ~10, Walk is ~6.67)
        // We start effects above walking speed
        let targetFOV = baseFOV;
        if (speed > 8.0) {
            targetFOV = sprintFOV;
        }

        // Smoothly interpolate current FOV to target
        // Use a lower lerp factor for "heavy" feeling or higher for "snappy"
        this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFOV, deltaTime * 4);
        this.camera.updateProjectionMatrix();
    }

    initSkinMenu() {
        const items = document.querySelectorAll('.skin-item');
        items.forEach(item => {
            const type = item.getAttribute('data-skin');
            // Generate thumbnail data URL
            const canvas = FaceGenerator.createTexture(type);
            item.style.backgroundImage = `url(${canvas.toDataURL()})`;

            item.addEventListener('click', (e) => {
                this.setFace(type);
            });
        });

        // Select default or saved
        const savedSkin = localStorage.getItem('playerSkin') || 'happy';
        this.setFace(savedSkin);
    }

    toggleMenu() {
        this.isMenuOpen = !this.isMenuOpen;
        if (this.isMenuOpen) {
            this.skinMenu.classList.remove('hidden');
            this.input.canLock = false; // Disable auto-lock
            document.exitPointerLock(); // Free mouse to click
        } else {
            this.skinMenu.classList.add('hidden');
            this.input.canLock = true; // Re-enable auto-lock
            document.body.requestPointerLock(); // Lock back
        }
    }

    setFace(type) {
        if (!this.faceTextures[type]) return;

        console.log("Setting face to:", type);

        this.currentSkin = type; // Track state for network sync

        // Save to LocalStorage (fallback)
        localStorage.setItem('playerSkin', type);

        // Save to Server if logged in
        if (this.game.network && this.game.network.currentUser) {
            const username = this.game.network.currentUser.username;
            fetch('http://localhost:3000/api/save-skin', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, skin: type })
            }).catch(err => console.error("Failed to save skin:", err));
        }

        // Update 3D Model
        // We explicitly verify the material array on the mesh if possible, but modifying reference should work.
        const mat = this.headMaterials[4];
        mat.map = this.faceTextures[type];
        mat.needsUpdate = true;

        // Update UI Selection
        document.querySelectorAll('.skin-item').forEach(item => {
            if (item.getAttribute('data-skin') === type) {
                item.classList.add('selected');
            } else {
                item.classList.remove('selected');
            }
        });
    }
}
