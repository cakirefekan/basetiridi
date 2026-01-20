export class HelpManager {
    constructor(game) {
        this.game = game;
        this.instructions = document.getElementById('instructions');
        this.isVisible = true; // Start visible
        this.togglePressed = false;
    }

    update() {
        // Toggle with H key
        if (this.game.input.keys.toggleHelp && !this.togglePressed) {
            this.toggle();
            this.togglePressed = true;
        }
        if (!this.game.input.keys.toggleHelp) {
            this.togglePressed = false;
        }
    }

    toggle() {
        this.isVisible = !this.isVisible;
        if (this.isVisible) {
            this.show();
        } else {
            this.hide();
        }
    }

    show() {
        this.instructions.classList.remove('hidden');
        // Release pointer lock to allow clicking
        if (document.pointerLockElement) {
            document.exitPointerLock();
        }
        if (this.game.input) {
            this.game.input.canLock = false;
        }
    }

    hide() {
        this.instructions.classList.add('hidden');
        // Re-enable pointer lock
        if (this.game.input) {
            this.game.input.canLock = true;
        }
        // Request pointer lock again
        document.body.requestPointerLock();
    }
}
