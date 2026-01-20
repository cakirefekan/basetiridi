import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import bodyParser from 'body-parser';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_FILE = path.join(__dirname, 'users.json');

const app = express();
const httpServer = createServer(app);

app.use(cors());
app.use(bodyParser.json());

// Enable CORS for Socket.io
const io = new Server(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Database Helper
function getUsers() {
    if (!fs.existsSync(DB_FILE)) return {};
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function saveUsers(users) {
    fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 2));
}

// Game State
const players = {}; // socket.id -> player data
const onlineUsers = {}; // userId -> socket.id (For single session enforcement)
const worldObjects = {}; // objectId -> { id, position, quaternion, velocity, angularVelocity }

// --- Auth Routes ---

app.post('/api/register', (req, res) => {
    const { username, password, nickname } = req.body;
    if (!username || !password || !nickname) {
        return res.status(400).json({ error: 'Missing fields' });
    }
    const users = getUsers();
    if (users[username]) {
        return res.status(400).json({ error: 'Username taken' });
    }

    // Check nickname uniqueness too? Maybe optional.

    users[username] = {
        username,
        password, // In prod, hash this!
        nickname,
        skin: 'happy' // Default skin
    };
    saveUsers(users);
    res.json({ success: true });
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const users = getUsers();
    const user = users[username];

    if (!user || user.password !== password) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Return user info (don't send password)
    res.json({
        success: true,
        user: {
            username: user.username,
            nickname: user.nickname,
            skin: user.skin
        }
    });
});

app.post('/api/save-skin', (req, res) => {
    const { username, skin } = req.body;
    const users = getUsers();
    if (users[username]) {
        users[username].skin = skin;
        saveUsers(users);
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'User not found' });
    }
});


// --- Socket Logic ---

io.on('connection', (socket) => {
    console.log('Socket connected:', socket.id);

    // Waiting for 'join-game' event with user credentials to actually spawn
    socket.on('join-game', (userData) => {
        const { username, nickname, skin } = userData;

        // Single Session Check
        if (onlineUsers[username]) {
            // Kick previous session
            const oldSocketId = onlineUsers[username];
            // Only kick if it's a different socket (reconnects might send same?)
            if (oldSocketId !== socket.id) {
                io.to(oldSocketId).emit('force-disconnect', 'Logged in from another location');
                // Also clean up old player from game
                if (players[oldSocketId]) {
                    delete players[oldSocketId];
                    io.emit('player-left', oldSocketId);
                }
            }
        }

        // Register new session
        onlineUsers[username] = socket.id;
        socket.username = username; // Tag socket for disconnect handler

        // Send existing players to new player
        socket.emit('current-players', players);

        // Send current World State (Interactables)
        socket.emit('current-objects', worldObjects);

        // Create new player entry
        players[socket.id] = {
            id: socket.id,
            username: username,
            nickname: nickname,
            skin: skin,
            position: { x: 0, y: 5, z: 0 },
            rotation: 0,
            action: 'idle'
        };

        // Broadcast new player join
        socket.broadcast.emit('player-joined', players[socket.id]);

        console.log(`User ${username} joined game as ${nickname}`);
    });

    socket.on('player-update', (data) => {
        if (players[socket.id]) {
            // Update state
            players[socket.id] = { ...players[socket.id], ...data };
            // If skin changed in-game, update DB? 
            // Better to handle that via explicit API call, but we can sync visual state here.

            socket.broadcast.emit('player-update', players[socket.id]);
        }
    });

    socket.on('object-update', (data) => {
        // data: { id, position, quaternion, velocity, angularVelocity }
        if (!worldObjects[data.id]) {
            worldObjects[data.id] = { ...data, owner: socket.id };
        } else {
            // Sahiplik kontrolü: Eğer sahibi yoksa veya sahibi güncelleyen kişiyse güncelle
            // Veya her güncellemede sahibi "en son güncelleyen" yap (Soft Ownership)
            worldObjects[data.id] = { ...data, owner: socket.id };
        }

        // Diğer oyunculara sahibiyle birlikte gönder
        socket.broadcast.emit('object-update', { ...data, owner: socket.id });
    });

    socket.on('disconnect', () => {
        console.log('Socket disconnected:', socket.id);

        if (players[socket.id]) {
            delete players[socket.id];
            io.emit('player-left', socket.id);
        }

        // Remove from onlineUsers map if it matches
        if (socket.username && onlineUsers[socket.username] === socket.id) {
            delete onlineUsers[socket.username];
        }
    });
});

const PORT = process.env.PORT || 3000;
// Vite build edildikten sonra frontend dosyalarını sunmak için:
const __distPath = path.join(__dirname, '../dist');
app.use(express.static(__distPath));

// Herhangi bir route gelirse index.html gönder (SPA desteği)
app.get('*', (req, res) => {
    res.sendFile(path.join(__distPath, 'index.html'));
});

httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});