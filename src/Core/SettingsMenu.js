export class SettingsMenu {
    constructor(game, authHandler) {
        this.game = game;
        this.authHandler = authHandler;

        // UI Elements
        this.menu = document.getElementById('settings-menu');
        this.btnLogout = document.getElementById('btn-logout');
        this.btnResume = document.getElementById('btn-resume');
        this.usernameDisplay = document.getElementById('username-display');

        this.isOpen = false;
        this.isClosing = false; // Prevents race condition during close

        this.initEvents();
    }

    initEvents() {
        // UI Elements
        this.btnShowHelp = document.getElementById('btn-show-help');

        // ESC key handler - toggles settings menu
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Escape') {
                e.preventDefault();
                this.toggle();
            }
        });

        // Monitor pointer lock changes - auto-open settings when unlocked
        document.addEventListener('pointerlockchange', () => {
            // If pointer just got unlocked and settings isn't already open or closing
            if (!document.pointerLockElement && !this.isOpen && !this.isClosing) {
                // Check if auth overlay is not blocking
                const authOverlay = document.getElementById('auth-overlay');
                if (!authOverlay || authOverlay.style.display === 'none') {
                    this.open();
                }
            }
        });

        // Button handlers
        this.btnShowHelp.addEventListener('click', () => {
            this.showHelp();
        });

        this.btnLogout.addEventListener('click', () => {
            this.logout();
        });

        this.btnResume.addEventListener('click', () => {
            this.close();
        });
    }

    showHelp() {
        // Close settings menu
        this.close();
        // Show help screen via HelpManager
        if (this.game.help) {
            this.game.help.show();
        }
    }

    toggle() {
        if (this.isOpen) {
            this.close();
        } else {
            this.open();
        }
    }

    open() {
        // Don't open if auth overlay is visible
        const authOverlay = document.getElementById('auth-overlay');
        if (authOverlay && authOverlay.style.display !== 'none') {
            return;
        }

        this.isOpen = true;
        this.menu.classList.remove('hidden');

        // Release pointer lock
        if (document.pointerLockElement) {
            document.exitPointerLock();
        }

        // Disable input manager
        if (this.game.input) {
            this.game.input.canLock = false;
        }
    }

    close() {
        // Set closing flag to prevent auto-reopen during transition
        this.isClosing = true;

        // Hide menu and update state
        this.menu.classList.add('hidden');
        this.isOpen = false;

        // Re-enable input manager
        if (this.game.input) {
            this.game.input.canLock = true;
        }

        // Request pointer lock immediately (must be in user gesture context)
        document.body.requestPointerLock();

        // Clear closing flag after a brief moment
        setTimeout(() => {
            this.isClosing = false;
        }, 100);
    }

    logout() {
        if (confirm('Are you sure you want to logout?')) {
            this.authHandler.logout();
        }
    }

    setUsername(username) {
        this.usernameDisplay.textContent = username;
    }
}
