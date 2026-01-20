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

        this.canLock = true; // Flag to enable/disable locking logic (e.g. disabled by Menu)
        this.isInputBlocked = false; // Block character movement inputs

        // Pointer Lock
        const instructions = document.getElementById('instructions');
        document.addEventListener('click', (e) => {
            // Only lock if allowed and not clicking on a menu interactable (simple check)
            // Ideally, we check e.target, but since we have global blocking:
            if (!this.isLocked && this.canLock && !this.isInputBlocked) {
                document.body.requestPointerLock();
            }
        });

        document.addEventListener('pointerlockchange', () => {
            if (document.pointerLockElement === document.body) {
                this.isLocked = true;
                instructions.classList.add('hidden');
                this.isInputBlocked = false; // Unblock on lock
            } else {
                this.isLocked = false;
                // If we unlocked naturally (Esc), we might want to show menu or allow cursor
                // Don't auto-block here, let the Menu logic handle blocking if it opens.
            }
        });
    }

    onKeyDown(e) {
        if (e.repeat) return;

        // Always handle toggle keys (Menu, Help) even if blocked
        switch (e.code) {
            case 'KeyM': this.keys.toggleMenu = true; break;
            case 'KeyH': this.keys.toggleHelp = true; break;
        }

        // Block gameplay inputs if menu is open
        if (this.isInputBlocked) return;

        switch (e.code) {
            case 'KeyW': this.keys.forward = true; break;
            case 'KeyS': this.keys.backward = true; break;
            case 'KeyA': this.keys.left = true; break;
            case 'KeyD': this.keys.right = true; break;
            case 'Space': this.keys.jump = true; break;

            case 'ShiftLeft': this.keys.sprint = true; break;
            case 'KeyT': this.keys.toggleSpeed = true; break;
            case 'KeyE': this.keys.interact = true; break;
        }
    }

    onKeyUp(e) {
        // Always handle toggle keys
        switch (e.code) {
            case 'KeyM': this.keys.toggleMenu = false; break;
            case 'KeyH': this.keys.toggleHelp = false; break;
        }

        // Even if blocked, we should probably allow clearing keys to prevent "stuck" inputs
        // or just clear all gameplay keys when blocking starts.
        // For safety, let's process keyups to clear state.

        switch (e.code) {
            case 'KeyW': this.keys.forward = false; break;
            case 'KeyS': this.keys.backward = false; break;
            case 'KeyA': this.keys.left = false; break;
            case 'KeyD': this.keys.right = false; break;
            case 'Space': this.keys.jump = false; break;
            case 'ShiftLeft': this.keys.sprint = false; break;
            case 'KeyT': this.keys.toggleSpeed = false; break;
            case 'KeyE': this.keys.interact = false; break;
        }
    }

    onMouseMove(e) {
        // Only process mouse look if locked and NOT blocked
        if (this.isLocked && !this.isInputBlocked) {
            this.mouse.x += e.movementX;
            this.mouse.y += e.movementY;
        } else {
            // Keep delta 0
        }
    }

    getMouseDelta() {
        const delta = { x: this.mouse.x, y: this.mouse.y };
        this.mouse.x = 0; // Consumption based
        this.mouse.y = 0;
        return delta;
    }

    // Helper to block/unblock
    setInputBlocked(blocked) {
        this.isInputBlocked = blocked;
        // If blocked, clear all movement keys to stop running in place
        if (blocked) {
            this.keys.forward = false;
            this.keys.backward = false;
            this.keys.left = false;
            this.keys.right = false;
            this.keys.jump = false;
            this.keys.sprint = false;
        }
    }
}
