export class AuthHandler {
    constructor(game) {
        this.game = game;
        this.settingsMenu = null; // Will be set from main.js

        // UI Elements
        this.overlay = document.getElementById('auth-overlay');
        this.loginForm = document.getElementById('login-form');
        this.registerForm = document.getElementById('register-form');
        this.errorText = document.getElementById('auth-error');

        // Inputs - Login
        this.loginUser = document.getElementById('login-username');
        this.loginPass = document.getElementById('login-password');
        this.btnLogin = document.getElementById('btn-login');

        // Inputs - Register
        this.regUser = document.getElementById('reg-username');
        this.regNick = document.getElementById('reg-nickname');
        this.regPass = document.getElementById('reg-password');
        this.btnRegister = document.getElementById('btn-register');

        // Links
        this.linkRegister = document.getElementById('link-register');
        this.linkLogin = document.getElementById('link-login');

        this.initEvents();

        // Try to restore session on page load
        this.attemptAutoLogin();
    }

    async attemptAutoLogin() {
        // Check for saved session in localStorage
        const savedSession = localStorage.getItem('gameSession');

        if (!savedSession) {
            return; // No saved session, show login screen
        }

        try {
            const session = JSON.parse(savedSession);
            const { username, password } = session;

            if (!username || !password) {
                localStorage.removeItem('gameSession');
                return;
            }

            // Show loading state
            this.errorText.style.color = '#00aaff';
            this.errorText.innerText = 'Restoring session...';

            // Attempt auto-login
            const res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await res.json();

            if (data.success) {
                console.log('Auto-login successful');
                this.startGame(data.user);
            } else {
                // Invalid session, clear it
                localStorage.removeItem('gameSession');
                this.errorText.style.color = '#ff4444';
                this.errorText.innerText = 'Session expired. Please login again.';
            }
        } catch (e) {
            console.error('Auto-login failed:', e);
            this.errorText.style.color = '#ff4444';
            this.errorText.innerText = 'Connection error';
        }
    }

    initEvents() {
        // Toggle Forms
        this.linkRegister.onclick = (e) => { e.preventDefault(); this.showRegister(); };
        this.linkLogin.onclick = (e) => { e.preventDefault(); this.showLogin(); };

        // Actions
        this.btnLogin.onclick = () => this.handleLogin();
        this.btnRegister.onclick = () => this.handleRegister();
    }

    showLogin() {
        this.loginForm.classList.remove('hidden');
        this.registerForm.classList.add('hidden');
        this.errorText.innerText = '';
    }

    showRegister() {
        this.loginForm.classList.add('hidden');
        this.registerForm.classList.remove('hidden');
        this.errorText.innerText = '';
    }

    async handleLogin() {
        const username = this.loginUser.value;
        const password = this.loginPass.value;

        if (!username || !password) {
            this.errorText.innerText = "Please fill all fields.";
            return;
        }

        try {
            const res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await res.json();

            if (data.success) {
                // Save session to localStorage for auto-login
                localStorage.setItem('gameSession', JSON.stringify({ username, password }));

                this.startGame(data.user);
            } else {
                this.errorText.innerText = data.error || "Login failed";
            }
        } catch (e) {
            this.errorText.innerText = "Connection error";
            console.error(e);
        }
    }

    async handleRegister() {
        const username = this.regUser.value;
        const nickname = this.regNick.value;
        const password = this.regPass.value;

        if (!username || !password || !nickname) {
            this.errorText.innerText = "Please fill all fields.";
            return;
        }

        try {
            const res = await fetch('/api/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password, nickname })
            });
            const data = await res.json();

            if (data.success) {
                // Auto login or switch to login
                this.showLogin();
                this.errorText.style.color = 'lime';
                this.errorText.innerText = "Registration successful! Please login.";
                this.loginUser.value = username;
            } else {
                this.errorText.style.color = '#ff4444';
                this.errorText.innerText = data.error || "Registration failed";
            }
        } catch (e) {
            this.errorText.innerText = "Connection error";
        }
    }

    startGame(user) {
        // Hide UI
        this.overlay.style.display = 'none';

        console.log("Starting game for user:", user);

        // Set Player Info
        if (this.game.player) {
            // Force set the skin from the server
            this.game.player.setFace(user.skin);
            // Note: The player class saves to localStorage, but we also want to rely on the server validation likely? 
            // For now, syncing visual is enough.
        }

        // Update settings menu with username
        if (this.settingsMenu) {
            this.settingsMenu.setUsername(user.username);
        }

        // Connect Network
        this.game.network.connect(user);
    }

    logout() {
        // Clear saved session
        localStorage.removeItem('gameSession');

        // Reload page to show login screen
        window.location.reload();
    }
}
