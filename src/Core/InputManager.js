export class InputManager {
    constructor() {
        this.keys = {
            forward: false,
            backward: false,
            left: false,
            right: false,
            jump: false,
            sprint: false,
            toggleSpeed: false,
            interact: false,
            toggleMenu: false,
            toggleHelp: false
        };

        this.mouse = { x: 0, y: 0 };
        this.isLocked = false;

        this.init();
    }

    init() {
        document.addEventListener('keydown', (e) => this.onKeyDown(e));
        document.addEventListener('keyup', (e) => this.onKeyUp(e));
        document.addEventListener('mousemove', (e) => this.onMouseMove(e));

        this.canLock = true; // Flag to enable/disable locking logic

        // Pointer Lock
        const instructions = document.getElementById('instructions');
        document.addEventListener('click', () => {
            if (!this.isLocked && this.canLock) {
                document.body.requestPointerLock();
            }
        });

        document.addEventListener('pointerlockchange', () => {
            if (document.pointerLockElement === document.body) {
                this.isLocked = true;
                instructions.classList.add('hidden');
            } else {
                this.isLocked = false;
                // Don't automatically show instructions on unlock
                // (Settings menu or other overlays might have caused the unlock)
            }
        });
    }

    onKeyDown(e) {
        if (e.repeat) return;
        switch (e.code) {
            case 'KeyW': this.keys.forward = true; break;
            case 'KeyS': this.keys.backward = true; break;
            case 'KeyA': this.keys.left = true; break;
            case 'KeyD': this.keys.right = true; break;
            case 'Space': this.keys.jump = true; break;

            case 'ShiftLeft': this.keys.sprint = true; break;
            case 'KeyT': this.keys.toggleSpeed = true; break;
            case 'KeyE': this.keys.interact = true; break;
            case 'KeyM': this.keys.toggleMenu = true; break;
            case 'KeyH': this.keys.toggleHelp = true; break;
        }
    }

    onKeyUp(e) {
        switch (e.code) {
            case 'KeyW': this.keys.forward = false; break;
            case 'KeyS': this.keys.backward = false; break;
            case 'KeyA': this.keys.left = false; break;
            case 'KeyD': this.keys.right = false; break;
            case 'Space': this.keys.jump = false; break;
            case 'ShiftLeft': this.keys.sprint = false; break;
            case 'KeyT': this.keys.toggleSpeed = false; break;
            case 'KeyE': this.keys.interact = false; break;
            case 'KeyM': this.keys.toggleMenu = false; break;
            case 'KeyH': this.keys.toggleHelp = false; break;
        }
    }

    onMouseMove(e) {
        if (this.isLocked) {
            this.mouse.x += e.movementX;
            this.mouse.y += e.movementY;
        } else {
            this.mouse.x = 0;
            this.mouse.y = 0;
        }
    }

    update() {
        // Reset mouse deltas after frame, usually handled by receiver but clearing here helps if no one reads
        // Actually, we should probably clear it at end of frame or let player read it.
        // For now, Player reads it once per frame.
    }

    getMouseDelta() {
        const delta = { x: this.mouse.x, y: this.mouse.y };
        this.mouse.x = 0; // Consumption based
        this.mouse.y = 0;
        return delta;
    }
}
