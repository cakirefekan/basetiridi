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
// Game State
const onlineUsers = {}; // userId -> socket.id (For single session enforcement)

// Room-based state
const rooms = {
    default: {
        players: {},
        objects: {}
    },
    football: {
        players: {},
        objects: {}
    }
};

// Ensure room exists helper
function getRoom(roomName) {
    if (!rooms[roomName]) {
        rooms[roomName] = { players: {}, objects: {} };
    }
    return rooms[roomName];
}

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
        const { username, nickname, skin, map } = userData;
        const roomName = map || 'default';
        const room = getRoom(roomName);

        // Single Session Check
        if (onlineUsers[username]) {
            // Kick previous session
            const oldSocketId = onlineUsers[username];
            // Only kick if it's a different socket (reconnects might send same?)
            if (oldSocketId !== socket.id) {
                io.to(oldSocketId).emit('force-disconnect', 'Logged in from another location');

                // Cleanup old if needed (though disconnect handler does it too)
            }
        }

        // Register new session
        onlineUsers[username] = socket.id;
        socket.username = username;
        socket.roomName = roomName; // Track room on socket

        // Join Socket Room
        socket.join(roomName);

        // Send existing players IN THIS ROOM
        socket.emit('current-players', room.players);

        // Send current World State IN THIS ROOM
        socket.emit('current-objects', room.objects);

        // Create new player entry
        room.players[socket.id] = {
            id: socket.id,
            username: username,
            nickname: nickname,
            skin: skin,
            position: { x: 0, y: 5, z: 0 },
            rotation: 0,
            action: 'idle'
        };

        // Broadcast new player join to ROOM ONLY
        socket.to(roomName).emit('player-joined', room.players[socket.id]);

        console.log(`User ${username} joined room [${roomName}] as ${nickname}`);
    });

    socket.on('player-update', (data) => {
        const roomName = socket.roomName;
        if (roomName && rooms[roomName] && rooms[roomName].players[socket.id]) {
            // Update state
            rooms[roomName].players[socket.id] = { ...rooms[roomName].players[socket.id], ...data };
            // Broadcast to room
            socket.to(roomName).emit('player-update', rooms[roomName].players[socket.id]);
        }
    });

    socket.on('object-update', (data) => {
        const roomName = socket.roomName;
        if (!roomName) return;

        const room = getRoom(roomName);

        // data: { id, position, quaternion, velocity, angularVelocity }
        if (!room.objects[data.id]) {
            room.objects[data.id] = { ...data, owner: socket.id };
        } else {
            room.objects[data.id] = { ...data, owner: socket.id };
        }

        // Broadcast to room
        socket.to(roomName).emit('object-update', { ...data, owner: socket.id });
    });

    socket.on('disconnect', () => {
        console.log('Socket disconnected:', socket.id);
        const roomName = socket.roomName;

        if (roomName && rooms[roomName] && rooms[roomName].players[socket.id]) {
            delete rooms[roomName].players[socket.id];
            io.to(roomName).emit('player-left', socket.id);
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

app.get(/.*/, (req, res) => {
    res.sendFile(path.join(__distPath, 'index.html'));
});

httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
