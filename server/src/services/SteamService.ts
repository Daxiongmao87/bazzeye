
import fs from 'fs';
import path from 'path';
import os from 'os';
import * as vdf from 'vdf';

interface SteamGame {
    appid: string;
    name: string;
    installDir: string;
    sizeOnDisk: number; // in bytes
    libraryPath: string;
    imageUrl: string;
}

interface MonitorResult {
    game: SteamGame | null;
}

class SteamService {
    private steamPaths: string[] = [
        path.join(os.homedir(), '.steam/steam'),
        path.join(os.homedir(), '.local/share/Steam'),
        path.join(os.homedir(), '.steam/debian-installation'), // Common on Debian/Ubuntu
    ];

    private foundSteamPath: string | null = null;
    private knownGames: SteamGame[] = [];
    private currentGame: SteamGame | null = null;
    private io: any = null; // Will be set by setSocket

    constructor() {
        this.discoverSteamPath();

        // Poll for game status
        setInterval(() => this.checkRunningGame(), 5000);
    }

    public setSocket(io: any) {
        this.io = io;
    }

    private discoverSteamPath() {
        for (const p of this.steamPaths) {
            if (fs.existsSync(p)) {
                this.foundSteamPath = p;
                console.log(`[SteamService] Found Steam at: ${p}`);
                break;
            }
        }
        if (!this.foundSteamPath) {
            console.warn('[SteamService] Steam installation not found in standard locations.');
        }
    }

    private async findAdditionalLibraries(): Promise<string[]> {
        const libs: string[] = [];
        // Search common mount points
        const searchPaths = ['/home', '/mnt', '/run/media'];

        try {
            const { execSync } = require('child_process');
            // Find directories named SteamLibrary or steamapps
            // limiting depth to avoid valid system hang
            for (const root of searchPaths) {
                if (!fs.existsSync(root)) continue;
                try {
                    // -maxdepth 4 to keep it sane
                    const cmd = `find "${root}" -maxdepth 4 -type d -name "SteamLibrary" 2>/dev/null`;
                    const output = execSync(cmd, { timeout: 5000, encoding: 'utf-8' });
                    const paths = output.split('\n').filter((p: string) => p.trim().length > 0);
                    libs.push(...paths);
                } catch (e) {
                    // find command often returns non-zero if permission denied on some subfolders
                }
            }
        } catch (e) {
            console.error('[SteamService] Discovery error', e);
        }

        return libs;
    }

    public async getGames(): Promise<SteamGame[]> {
        if (!this.foundSteamPath) {
            this.discoverSteamPath(); // Retry
        }

        const libraries: string[] = this.foundSteamPath ? [this.foundSteamPath] : [];

        // 1. Read libraryfolders.vdf if available
        if (this.foundSteamPath) {
            const libraryFoldersPath = path.join(this.foundSteamPath, 'steamapps', 'libraryfolders.vdf');
            if (fs.existsSync(libraryFoldersPath)) {
                try {
                    const content = fs.readFileSync(libraryFoldersPath, 'utf-8');
                    const parsed = vdf.parse(content) as any;
                    if (parsed.libraryfolders) {
                        for (const key in parsed.libraryfolders) {
                            const lib = parsed.libraryfolders[key];
                            if (lib && lib.path) libraries.push(lib.path);
                        }
                    }
                } catch (e) {
                    console.error('[SteamService] Error parsing libraryfolders.vdf', e);
                }
            }
        }

        // 2. Add Discovered libraries
        const discovered = await this.findAdditionalLibraries();
        for (const disc of discovered) {
            if (!libraries.includes(disc)) {
                libraries.push(disc);
            }
        }

        const games: SteamGame[] = [];
        const seenAppIds = new Set<string>();

        // ... (Parsing logic)


        for (const lib of libraries) {
            const steamapps = path.join(lib, 'steamapps');
            if (!fs.existsSync(steamapps)) continue;

            try {
                const files = fs.readdirSync(steamapps);
                for (const file of files) {
                    if (file.startsWith('appmanifest_') && file.endsWith('.acf')) {
                        try {
                            const manifestContent = fs.readFileSync(path.join(steamapps, file), 'utf-8');
                            const manifest = vdf.parse(manifestContent) as any;

                            if (manifest && manifest.AppState) {
                                const app = manifest.AppState;
                                if (!seenAppIds.has(app.appid)) {
                                    games.push({
                                        appid: app.appid,
                                        name: app.name,
                                        installDir: path.join(steamapps, 'common', app.installdir),
                                        sizeOnDisk: parseInt(app.SizeOnDisk || '0'),
                                        libraryPath: lib,
                                        // Use standard Steam CDN for library grid images (600x900)
                                        imageUrl: `https://steamcdn-a.akamaihd.net/steam/apps/${app.appid}/library_600x900.jpg`
                                    });
                                    seenAppIds.add(app.appid);
                                }
                            }
                        } catch (err) {
                            // Ignore malformed manifests
                        }
                    }
                }
            } catch (e) {
                console.error(`[SteamService] Error reading library ${lib}`, e);
            }
        }

        this.knownGames = games;
        return games;
    }

    public async checkRunningGame() {
        if (this.knownGames.length === 0) {
            await this.getGames();
        }

        try {
            // Robust method: Scan /proc for running processes and check their executable paths
            // This avoids issues with command-line arguments being misleading/missing.

            // 1. Get all numeric entries in /proc (PIDs)
            const pids = fs.readdirSync('/proc').filter(f => /^\d+$/.test(f));

            let detected: SteamGame | null = null;

            // Optimization: Create a quick lookup or just iterate. 
            // Since we have ~300 procs and ~20 games, nested loop is fine (6000 ops is tiny).

            for (const pid of pids) {
                try {
                    const exeLink = `/proc/${pid}/exe`;
                    // accessing /proc/<pid>/exe requires privileges (we are root/sudo hopefully, or owner)
                    // If we can't read it (e.g. kernel thread), readlinkSync throws usually or EACCES.
                    if (!fs.existsSync(exeLink)) continue;

                    const exePath = fs.readlinkSync(exeLink);

                    // Check if this exe is inside any game's install dir
                    for (const game of this.knownGames) {
                        if (!game.installDir) continue;

                        // Check if exePath starts with installDir
                        // Need to ensure installDir is treated as a directory prefix (append sep)
                        // to avoid matching "/path/to/Game" with "/path/to/Game2"
                        const installDirWithSep = game.installDir.endsWith(path.sep) ? game.installDir : game.installDir + path.sep;

                        if (exePath.startsWith(installDirWithSep)) {
                            // Double check it's not a Steam runtime helper if necessary?
                            // Usually main binary is what we want. 
                            // We might match "bash" scripts inside the dir too, which is probably fine/good.
                            detected = game;
                            break;
                        }
                    }
                } catch (e) {
                    // unexpected error reading link (e.g. process died, permission denied)
                    continue;
                }

                if (detected) break;
            }

            if (this.currentGame?.appid !== detected?.appid) {
                this.currentGame = detected;
                console.log(`[SteamService] Game change detected: ${detected ? detected.name : 'None'}`);
                if (this.io) {
                    this.io.emit('steam:now-playing', detected);
                }
            }

        } catch (e) {
            console.error('[SteamService] Error checking running game process:', e);
        }
    }

    public getDownloads() {
        // Simple check for now: look at steamapps/downloading
        // This is a placeholder for more complex logic
        return [];
    }
}

export const steamService = new SteamService();
