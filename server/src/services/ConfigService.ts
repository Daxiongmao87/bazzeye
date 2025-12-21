import fs from 'fs';
import path from 'path';

export interface AlertSettings {
    enabled: boolean;
    warningTemp: number;
    criticalTemp: number;
    sustainedSeconds: number;
}

export interface TerminalSettings {
    transparent: boolean;
}

export interface SteamSettings {
    libraryPaths: string[];
}

export interface AppConfig {
    alerts: AlertSettings;
    terminal: TerminalSettings;
    steam: SteamSettings;
}

const DEFAULT_CONFIG: AppConfig = {
    alerts: {
        enabled: true,
        warningTemp: 80,
        criticalTemp: 95,
        sustainedSeconds: 60
    },
    terminal: {
        transparent: false
    },
    steam: {
        libraryPaths: []
    }
};

class ConfigService {
    private configFile: string;
    private config: AppConfig = DEFAULT_CONFIG;
    private io: any = null;

    constructor() {
        // Use app's storage directory instead of $HOME (service user may not have a home dir)
        const dataDir = path.join(__dirname, '../../storage');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        this.configFile = path.join(dataDir, 'config.json');
        this.load();
    }

    public setSocket(io: any) {
        this.io = io;
    }

    private load() {
        try {
            if (fs.existsSync(this.configFile)) {
                const data = JSON.parse(fs.readFileSync(this.configFile, 'utf-8'));
                // Merge with default to ensure structural integrity if fields add up
                this.config = {
                    ...DEFAULT_CONFIG,
                    ...data,
                    alerts: { ...DEFAULT_CONFIG.alerts, ...(data.alerts || {}) },
                    terminal: { ...DEFAULT_CONFIG.terminal, ...(data.terminal || {}) },
                    steam: { ...DEFAULT_CONFIG.steam, ...(data.steam || {}) }
                };
            }
        } catch (e) {
            console.error('[ConfigService] Failed to load config:', e);
        }
    }

    private save() {
        try {
            fs.writeFileSync(this.configFile, JSON.stringify(this.config, null, 2));
            if (this.io) {
                this.io.emit('config:updated', this.startConfig());
            }
        } catch (e) {
            console.error('[ConfigService] Failed to save config:', e);
        }
    }

    public getConfig(): AppConfig {
        return this.config;
    }

    // Helper to return config safe for frontend initial load
    public startConfig(): AppConfig {
        return this.config;
    }

    public updateConfig(updates: Partial<AppConfig>) {
        // Deep merge top level sections
        if (updates.alerts) {
            this.config.alerts = { ...this.config.alerts, ...updates.alerts };
        }
        if (updates.terminal) {
            this.config.terminal = { ...this.config.terminal, ...updates.terminal };
        }
        if (updates.steam) {
            this.config.steam = { ...this.config.steam, ...updates.steam };
        }
        this.save();
        return this.config;
    }

    public updateAlerts(updates: Partial<AlertSettings>) {
        this.config.alerts = { ...this.config.alerts, ...updates };
        this.save();
        return this.config.alerts;
    }

    public updateTerminal(updates: Partial<TerminalSettings>) {
        this.config.terminal = { ...this.config.terminal, ...updates };
        this.save();
        return this.config.terminal;
    }

    public updateSteam(updates: Partial<SteamSettings>) {
        this.config.steam = { ...this.config.steam, ...updates };
        this.save();
        return this.config.steam;
    }

    public getSteamLibraryPaths(): string[] {
        return this.config.steam.libraryPaths;
    }

    public setSteamLibraryPaths(paths: string[]) {
        this.config.steam.libraryPaths = paths;
        this.save();
        return this.config.steam.libraryPaths;
    }
}

export const configService = new ConfigService();
