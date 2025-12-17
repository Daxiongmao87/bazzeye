
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
import { authService } from './services/AuthService';
import { monitorService } from './services/MonitorService';
import { steamService } from './services/SteamService';
import { terminalService } from './services/TerminalService';
import { systemControlService } from './services/SystemControlService';
import { fileService } from './services/FileService';
import { packageService } from './services/PackageService';
import { layoutService } from './services/LayoutService'; // [NEW]
import { cleanerScheduleService } from './services/CleanerScheduleService';

import multer from 'multer';
import path from 'path';

steamService.setSocket(io);
systemControlService.setSocket(io); // [NEW] Wire system control
cleanerScheduleService.setSocket(io);
cleanerScheduleService.setCleanFunction(() => systemControlService.runCleanSystem());

const upload = multer({ dest: '/tmp/bazzeye-uploads' });

const PORT = process.env.PORT || 3000;

// Serve static files from the React client
app.use(express.static(path.join(__dirname, '../../client/dist')));

// Handle client-side routing
app.get(/(.*)/, (req, res) => {
    res.sendFile(path.join(__dirname, '../../client/dist/index.html'));
});

io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    // Send initial state
    socket.emit('auth:status', authService.isSudo());
    // Check if password setup is needed
    if (!authService.hasPassword()) {
        socket.emit('auth:needs-setup');
    }

    // Check if returning user needs to re-authenticate
    const sessionCheck = authService.checkSession();
    socket.emit('auth:session-check', sessionCheck);


    // Send history
    socket.emit('system-stats-history', monitorService.getHistory());

    // --- Auth Events ---
    socket.on('auth:request-toggle', () => {
        const result = authService.requestToggleSudo();
        if (result.success) {
            io.emit('auth:status', authService.isSudo());
        } else if (result.requiresPassword) {
            socket.emit('auth:require-password');
        }
    });

    socket.on('auth:verify-password', async (password: string) => {
        const isValid = await authService.verifyPassword(password);
        if (isValid) {
            authService.setSudo(true);
            io.emit('auth:status', true);
            socket.emit('auth:verify-success');
        } else {
            socket.emit('auth:verify-fail');
        }
    });

    socket.on('auth:set-password', async ({ password, oldPassword }: any) => {
        // If setting initial password, oldPassword not needed if hasPassword() is false
        if (authService.hasPassword()) {
            const isValid = await authService.verifyPassword(oldPassword);
            if (!isValid) {
                socket.emit('auth:set-password-error', 'Invalid old password');
                return;
            }
        }
        await authService.setPassword(password); // pass null/empty to remove
        socket.emit('auth:set-password-success');
        if (!authService.hasPassword()) {
            socket.emit('auth:needs-setup'); // Technically going back to setup state? Or just insecure.
        }
    });

    // --- Layout Events [NEW] ---
    socket.on('layout:get', () => {
        socket.emit('layout:data', layoutService.getLayout());
    });

    socket.on('layout:save', ({ layouts, extras }: any) => {
        layoutService.saveLayout(layouts, extras);
        // Broadcast to other clients?
        socket.broadcast.emit('layout:updated', { layouts, extras });
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

    // system:get-info was removed as it called a non-existent method and is unused by frontend

    socket.on('system:get-bios', async () => {
        const bios = await systemControlService.getBiosInfo();
        socket.emit('system:bios', bios);
    });

    socket.on('system:clean', async () => {
        // Notify start
        socket.emit('system:clean-status', { status: 'running' });
        const result = await systemControlService.runCleanSystem();
        socket.emit('system:clean-status', {
            status: result.success ? 'success' : 'error',
            output: result.output
        });
    });

    // --- Cleaner Schedule Events ---
    socket.on('cleaner:get-schedule', () => {
        socket.emit('cleaner:schedule-status', cleanerScheduleService.getSchedule());
    });

    socket.on('cleaner:set-schedule', ({ enabled, intervalHours }: { enabled: boolean, intervalHours: number }) => {
        if (!authService.isSudo()) return;
        const schedule = cleanerScheduleService.setSchedule(enabled, intervalHours);
        io.emit('cleaner:schedule-status', schedule);
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

    socket.on('files:create-folder', async ({ path: folderPath }) => {
        if (!authService.isSudo()) return; // Optional check
        await fileService.createFolder(folderPath);
        // Refresh parent
        const parentDir = path.dirname(folderPath);
        // actually, if we create a folder inside current view, we might want to refresh current view
        // The passed path is the FULL path to the new folder.
        const result = await fileService.listFiles(parentDir);
        socket.emit('files:list-data', result);
    });

    socket.on('files:create-file', async ({ path: filePath }) => {
        if (!authService.isSudo()) return;
        await fileService.createFile(filePath);
        const parentDir = path.dirname(filePath);
        const result = await fileService.listFiles(parentDir);
        socket.emit('files:list-data', result);
    });

    // --- Ujust Events ---
    socket.on('ujust:list', async () => {
        const recipes = await systemControlService.getUjustRecipes();
        socket.emit('ujust:list-data', recipes);
    });

    socket.on('ujust:execute', async ({ recipe }) => {
        // if (!authService.isSudo()) return; // Should we enforce sudo? Maybe.
        try {
            await systemControlService.executeUjust(recipe);
            socket.emit('ujust:status', { recipe, status: 'success' });
        } catch (e: any) {
            socket.emit('ujust:status', { recipe, status: 'error', error: e.message });
        }
    });

    // --- Package Manager Events ---
    socket.on('package:search', async (query: string) => {
        const results = await packageService.search(query);
        socket.emit('package:search-results', results);
    });

    socket.on('package:list-layered', async () => {
        const pkgs = await packageService.getLayeredPackages();
        socket.emit('package:layered-list', pkgs);
    });

    socket.on('package:install', async (pkg: string) => {
        if (!authService.isSudo()) return;
        socket.emit('package:status', { pkg, status: 'installing' });
        try {
            await packageService.install(pkg);
            socket.emit('package:status', { pkg, status: 'installed' });
            // Refresh list
            const pkgs = await packageService.getLayeredPackages();
            socket.emit('package:layered-list', pkgs);
        } catch (e: any) {
            socket.emit('package:status', { pkg, status: 'error', error: e.message });
        }
    });

    socket.on('package:uninstall', async (pkg: string) => {
        if (!authService.isSudo()) return;
        socket.emit('package:status', { pkg, status: 'uninstalling' });
        try {
            await packageService.uninstall(pkg);
            socket.emit('package:status', { pkg, status: 'uninstalled' });
            // Refresh list
            const pkgs = await packageService.getLayeredPackages();
            socket.emit('package:layered-list', pkgs);
        } catch (e: any) {
            socket.emit('package:status', { pkg, status: 'error', error: e.message });
        }
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
    cleanerScheduleService.destroy();
    process.exit(0);
});

httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
