
let pty: any;
try {
    pty = require('node-pty');
} catch (e) {
    console.warn('[TerminalService] node-pty failed to load. Terminal features disabled.', e);
    pty = null;
}

import { Socket } from 'socket.io';
import fs from 'fs';
import path from 'path';

interface TerminalSession {
    id: string;
    ptyProcess: any; // pty.IPty
    command_str?: string;
    widgetId?: string;
    name?: string;
}

class TerminalService {
    private sessions: Map<string, TerminalSession> = new Map();

    private CONFIG_FILE = path.join(__dirname, '../../storage/terminals.json');

    constructor() {
        this.ensureStorage();
        this.loadSessions();
    }

    private ensureStorage() {
        const dir = path.dirname(this.CONFIG_FILE);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    private loadSessions() {
        if (fs.existsSync(this.CONFIG_FILE)) {
            try {
                const data = JSON.parse(fs.readFileSync(this.CONFIG_FILE, 'utf-8'));
                if (Array.isArray(data)) {
                    // Just load config, don't spawn yet until requested or auto-spawn
                    // We can auto-spawn here if desired
                    console.log(`[TerminalService] Loaded ${data.length} terminal configs.`);
                    // For now, we store them in memory or just let frontend request them
                    // But to persistent them we need to know what they are.
                    // Let's store a map of "Configured Terminals" vs "Active Sessions"
                }
            } catch (e) { console.error("Failed to load terminal config", e); }
        }
    }

    // New methods for Config Management
    public getConfigs() {
        if (fs.existsSync(this.CONFIG_FILE)) {
            try {
                return JSON.parse(fs.readFileSync(this.CONFIG_FILE, 'utf-8'));
            } catch { return []; }
        }
        return [];
    }

    public saveConfig(id: string, command: string, widgetId: string = 'terminal', name: string = 'Terminal') {
        let configs = this.getConfigs();
        // Update or Add
        const idx = configs.findIndex((c: any) => c.id === id);
        if (idx >= 0) {
            configs[idx].command = command;
            configs[idx].widgetId = widgetId;
            configs[idx].name = name;
        } else {
            configs.push({ id, command, widgetId, name });
        }
        fs.writeFileSync(this.CONFIG_FILE, JSON.stringify(configs, null, 2));
    }

    public updateConfig(id: string, updates: any) {
        let configs = this.getConfigs();
        const idx = configs.findIndex((c: any) => c.id === id);
        if (idx >= 0) {
            configs[idx] = { ...configs[idx], ...updates };
            fs.writeFileSync(this.CONFIG_FILE, JSON.stringify(configs, null, 2));
        }
    }

    public removeConfig(id: string) {
        let configs = this.getConfigs();
        configs = configs.filter((c: any) => c.id !== id);
        fs.writeFileSync(this.CONFIG_FILE, JSON.stringify(configs, null, 2));
        this.killTerminal(id);
    }

    public createManagedTerminal(socket: Socket, id: string, command: string | null, widgetId: string = 'terminal', name: string = 'Terminal') {
        if (this.sessions.has(id)) {
            // If already running, just kill and restart
            this.killTerminal(id);
        }

        // If config provided, save it
        if (command !== null) { // command might be empty string for default shell
            // logic: if command is passed (even empty), we persist it.
            // If null, it's ephemeral? Actually frontend always passes command string.
            this.saveConfig(id, command || '', widgetId, name);
        }

        this.spawnProcess(socket, id, command);
    }

    // ... spawnProcess logic ...

    private spawnProcess(socket: Socket, id: string, command: string | null) {
        if (!pty) {
            socket.emit('term:output', { id, data: '\r\n\x1b[31mError: Terminal backend not available (node-pty missing).\x1b[0m\r\n' });
            return;
        }

        const file = command ? '/bin/bash' : (process.env.SHELL || '/bin/bash');
        let args: string[] = [];

        if (command) {
            // Loop wrapper for auto-restart
            args = ['-c', `while true; do echo "Starting: ${command}"; ${command}; echo "Command exited, restarting in 1s..."; sleep 1; done`];
        }

        try {
            const ptyProcess = pty.spawn(file, args, {
                name: 'xterm-color',
                cols: 80,
                rows: 30,
                cwd: process.env.HOME,
                env: process.env as any
            });

            ptyProcess.onData((data: string) => {
                socket.emit('term:output', { id, data });
            });

            this.sessions.set(id, { id, ptyProcess, command_str: command || undefined });
            console.log(`[TerminalService] Created terminal ${id}`);
        } catch (e) {
            console.error('[TerminalService] Failed to spawn pty:', e);
            socket.emit('term:output', { id, data: `\r\nError launching terminal: ${e}\r\n` });
        }
    }

    public resize(id: string, cols: number, rows: number) {
        const session = this.sessions.get(id);
        if (session) {
            session.ptyProcess.resize(cols, rows);
        }
    }

    public write(id: string, data: string) {
        const session = this.sessions.get(id);
        if (session) {
            session.ptyProcess.write(data);
        }
    }

    public killTerminal(id: string) {
        const session = this.sessions.get(id);
        if (session) {
            session.ptyProcess.kill();
            this.sessions.delete(id);
        }
    }
}

export const terminalService = new TerminalService();
