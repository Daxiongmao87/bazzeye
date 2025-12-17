
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import si from 'systeminformation';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: "*", // Adjust for production
        methods: ["GET", "POST"]
    }
});

// Initialize services with socket if needed
// Initialize services with socket if needed
// moved below imports


import { authService } from './services/AuthService';
import { monitorService } from './services/MonitorService';
import { steamService } from './services/SteamService';
import { terminalService } from './services/TerminalService';
import { systemControlService } from './services/SystemControlService';
import { fileService } from './services/FileService';
import multer from 'multer';
import path from 'path';

steamService.setSocket(io);

const upload = multer({ dest: '/tmp/bazzeye-uploads' }); // Temp storage, we'll move it

const PORT = process.env.PORT || 3000;

// Serve static files from the React app
const clientPath = path.join(__dirname, '../../client/dist');
app.use(express.static(clientPath));

// API routes first (so they take precedence)


app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
});

// File Download Route
app.get('/api/files/download', (req, res) => {
    // Basic auth check using query param or session? 
    // For now, let's assume if they can hit this internal dashboard they are okay, 
    // BUT we should ideally check the 'isSudo' status or similar if we could.
    // Since this is a specialized local dashboard, we'll skip complex auth for MVP but recommend it.

    // Actually, we can check a token or shared secret if we had one.
    // Let's at least ensure path is valid.
    const requestedPath = req.query.path as string;
    if (!requestedPath) {
        return res.status(400).send('Missing path');
    }

    // Resolve absolute path
    // For safety, might want to restrict, but user asked for file transfer.
    res.download(requestedPath, (err) => {
        if (err) {
            if (!res.headersSent) res.status(500).send('Download failed: ' + err.message);
        }
    });
});

// File Upload Route
app.post('/api/files/upload', upload.single('file'), async (req: any, res: any) => {
    // Target path should be in body
    const targetPath = req.body.path;
    const file = req.file;

    if (!targetPath || !file) {
        return res.status(400).send('Missing path or file');
    }

    try {
        const fs = require('fs');
        const dest = path.join(targetPath, file.originalname);

        // Move from temp to dest
        await fs.promises.rename(file.path, dest);
        res.json({ success: true, message: 'Uploaded successfully' });
    } catch (err: any) {
        res.status(500).json({ success: false, message: err.message });
    }
});

io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    // Send initial state
    socket.emit('auth:status', authService.isSudo());
    // Send history immediately
    socket.emit('system-stats-history', monitorService.getHistory());

    socket.on('auth:request-toggle', () => {
        const newStatus = authService.toggleSudo();
        io.emit('auth:status', newStatus); // Broadcast to all clients
    });

    socket.on('steam:request-games', async () => {
        const games = await steamService.getGames();
        socket.emit('steam:games', games);
    });

    // Terminal Events
    socket.on('term:create', ({ id, command, widgetId, name }: { id: string, command: string | null, widgetId?: string, name?: string }) => {
        terminalService.createManagedTerminal(socket, id, command, widgetId || 'terminal', name || 'Terminal');
    });

    socket.on('term:update', ({ id, updates }: { id: string, updates: any }) => {
        terminalService.updateConfig(id, updates);
        // Broadcast? Or just let polling/refresh handle it?
        // Ideally should broadcast, but for now just updating config is enough for persistence.
        // Frontend updates local state immediately.
    });

    socket.on('term:input', ({ id, data }: { id: string, data: string }) => {
        terminalService.write(id, data);
    });

    socket.on('term:resize', ({ id, cols, rows }: { id: string, cols: number, rows: number }) => {
        terminalService.resize(id, cols, rows);
    });
    // New: Persistence events
    socket.on('term:list', () => {
        socket.emit('term:list-data', terminalService.getConfigs());
    });
    socket.on('term:remove', ({ id }: { id: string }) => {
        terminalService.removeConfig(id);
    });

    // System Control Events
    socket.on('system:control', async ({ action }) => {
        if (!authService.isSudo()) return;
        if (action === 'reboot') await systemControlService.reboot();
        if (action === 'shutdown') await systemControlService.shutdown();
        if (action === 'update') {
            // Trigger update
            systemControlService.updateSystem()
                .then(() => socket.emit('system:update-status', { status: 'complete' }))
                .catch(err => socket.emit('system:update-status', { status: 'error', error: err.message }));
            socket.emit('system:update-status', { status: 'started' });
        }
    });

    socket.on('system:check-update', async () => {
        const isAvailable = await systemControlService.checkForUpdates();
        socket.emit('system:update-available', isAvailable);
    });

    socket.on('system:request-smart-status', async () => {
        const data = await systemControlService.getSmartStatus();
        socket.emit('system:smart-status-update', data);
    });

    socket.on('system:specs', async () => {
        const specs = await monitorService.getSysSpecs();
        socket.emit('system:specs-data', specs);
    });

    socket.on('files:list', async (path: string) => {
        const result = await fileService.listFiles(path);
        socket.emit('files:list-data', result);
    });

    socket.on('files:delete', async ({ path: filePath }) => {
        if (!authService.isSudo()) return;
        const result = await fileService.deleteFile(filePath);
        // Refresh the parent folder
        const parentDir = path.dirname(filePath);
        const files = await fileService.listFiles(parentDir);
        socket.emit('files:list-data', files);
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

// --- Unified Global Monitoring ---

// 1. System Stats (High Frequency: 2s)
const statsInterval = setInterval(async () => {
    // Only fetch if there are clients connected to save resources?
    // Or just always run to keep history if we had chart history (future feature).
    // For now, always run is fine, or check io.engine.clientsCount
    if (io.engine.clientsCount > 0) {
        const stats = await monitorService.getStats();
        if (stats) {
            io.emit('system-stats', stats);
        }
    }
}, 2000);

// 2. SMART Status (Low Frequency: 1h)
// Run once on startup after a delay
setTimeout(async () => {
    console.log('Running initial SMART scan...');
    const data = await systemControlService.getSmartStatus();
    io.emit('system:smart-status-update', data);
}, 5000);

const smartInterval = setInterval(async () => {
    console.log('Running hourly SMART scan...');
    const data = await systemControlService.getSmartStatus();
    io.emit('system:smart-status-update', data);
}, 3600000); // 1 hour

// Handle cleanup on exit
process.on('SIGTERM', () => {
    clearInterval(statsInterval);
    clearInterval(smartInterval);
    process.exit(0);
});

httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
