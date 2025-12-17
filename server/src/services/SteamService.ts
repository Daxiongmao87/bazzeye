
import fs from 'fs';
import path from 'path';
import os from 'os';
import * as vdf from 'vdf';
import { execSync } from 'child_process';
import { ownerService } from './OwnerService';

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
    // Initial known paths to check first (fast path)
    // These will be populated with owner's home in constructor
    private steamPaths: string[] = [];

    private foundSteamPath: string | null = null;
    private knownGames: SteamGame[] = [];
    private currentGame: SteamGame | null = null;
    private io: any = null;
    private hasWarnedMissing: boolean = false;

    constructor() {
        // Set up steam paths using owner's home directory
        const ownerHome = ownerService.getOwnerHome();
        this.steamPaths = [
            path.join(ownerHome, '.steam/steam'),
            path.join(ownerHome, '.local/share/Steam'),
            path.join(ownerHome, '.var/app/com.valvesoftware.Steam/.steam/steam'), // Flatpak
            path.join(ownerHome, '.steam/debian-installation'),
        ];

        // Initial discovery
        this.discoverSteamPath().then(() => {
            this.getGames(); // Populate cache
        });

        // Poll for game status
        setInterval(() => this.checkRunningGame(), 5000);

        // Re-scan libraries occasionally (e.g. every hour) to pick up new mounts
        setInterval(() => this.getGames(), 60 * 60 * 1000);
    }

    public setSocket(io: any) {
        this.io = io;
    }

    private async discoverSteamPath() {
        // 1. Check standard paths
        for (const p of this.steamPaths) {
            if (fs.existsSync(p)) {
                this.foundSteamPath = p;
                console.log(`[SteamService] Found Steam at: ${p}`);
                return;
            }
        }

        // 2. If not found, try to locate libraryfolders.vdf dynamically (More valid than searching for "Steam")
        // This finds libraries even if the main install is hidden or non-standard
        if (!this.foundSteamPath) {
            console.log('[SteamService] Steam non-standard. Searching for libraryfolders.vdf...');
            // We return, but getGames() will trigger the deep search
        }
    }

    private async findConfigPaths(): Promise<string[]> {
        const potentialConfigs: string[] = [];
        // Global search as requested, but safely excluding virtual filesystems
        const searchRoot = '/';
        const prunes = ['/proc', '/sys', '/dev', '/run', '/tmp', '/var/lib/docker', '/var/lib/containers'];

        try {
            // Construct find command:
            // find / -path /proc -prune -o -path /sys -prune ... -o -type f -name "libraryfolders.vdf" -print
            let cmd = `find "${searchRoot}"`;

            // Add prunes
            for (const p of prunes) {
                cmd += ` -path "${p}" -prune -o`;
            }

            // Add search criteria
            // Looking for EITHER libraryfolders.vdf OR config.vdf (sometimes useful)
            // But let's stick to libraryfolders.vdf for now as primary target + directories named "SteamLibrary"
            // Actually, finding "SteamLibrary" directories is a good fallback if the VDF is missing.

            // \" -type f -name 'libraryfolders.vdf' -print \"
            cmd += ` -type f -name "libraryfolders.vdf" -print`;

            // Run as owner to access their home directory
            const owner = ownerService.getOwner();
            const fullCmd = `sudo -u ${owner} ${cmd}`;

            console.log(`[SteamService] Executing global search as ${owner}: ${cmd}`);
            const output = execSync(fullCmd, { timeout: 30000, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
            // stdio ignore stderr to suppress "Permission denied" spam

            const paths = output.split('\n').filter(p => p.trim().length > 0);
            potentialConfigs.push(...paths);
        } catch (e) {
            // find often returns non-zero if it hits ANY permission denied, which is expected on /root
            // We just want the stdout that was captured
            if ((e as any).stdout) {
                const paths = (e as any).stdout.toString().split('\n').filter((p: string) => p.trim().length > 0);
                potentialConfigs.push(...paths);
            }
        }
        return potentialConfigs;
    }

    public async getGames(): Promise<SteamGame[]> {
        // Collect all potential VDF files
        const vdfPaths: string[] = [];

        // 1. From standard path
        if (this.foundSteamPath) {
            vdfPaths.push(path.join(this.foundSteamPath, 'steamapps', 'libraryfolders.vdf'));
            // Also config/config.vdf might be useful but libraryfolders is better for libraries
        }

        // 2. Deep search if necessary OR if we want to be thorough (user requested thoroughness)
        // If we found the web (foundSteamPath), we might still want to look for external drives manually
        // if they aren't mounted/known yet. But libraryfolders.vdf usually lists them.
        // Let's do deep search if we have NO games, or only 1 library, or just simply always to be safe?
        // User requested "search ... anywhere on the system".

        const deepPaths = await this.findConfigPaths();
        for (const p of deepPaths) {
            if (!vdfPaths.includes(p)) vdfPaths.push(p);
        }

        if (vdfPaths.length === 0 && !this.foundSteamPath && !this.hasWarnedMissing) {
            console.warn('[SteamService] Steam not found in standard locations and no libraryfolders.vdf discovered.');
            this.hasWarnedMissing = true;
            return [];
        }

        const libraryPaths = new Set<string>();

        // Parse ALL found VDFs to find Library Paths
        for (const vdfFile of vdfPaths) {
            if (!fs.existsSync(vdfFile)) continue;
            try {
                const content = fs.readFileSync(vdfFile, 'utf-8');
                const parsed = vdf.parse(content) as any;

                // Format 1: libraryfolders { "0": { "path": "..." } }
                if (parsed.libraryfolders) {
                    for (const key in parsed.libraryfolders) {
                        const entry = parsed.libraryfolders[key];
                        if (entry && entry.path) {
                            libraryPaths.add(entry.path);
                        } else if (typeof entry === 'string') {
                            // old format?
                            libraryPaths.add(entry);
                        }
                    }
                }
            } catch (e) {
                console.error(`[SteamService] Failed to parse ${vdfFile}`, e);
            }
        }

        // Also fallback: Add the parent dir of any found libraryfolders.vdf as a potential library root
        // (If libraryfolders.vdf is IN steamapps, parent is steamapps, parent-parent is Library Root)
        for (const vdfFile of vdfPaths) {
            // /path/to/Library/steamapps/libraryfolders.vdf
            const steamapps = path.dirname(vdfFile);
            if (path.basename(steamapps) === 'steamapps') {
                libraryPaths.add(path.dirname(steamapps));
            }
        }

        const games: SteamGame[] = [];
        const seenAppIds = new Set<string>();

        for (const lib of Array.from(libraryPaths)) {
            const steamapps = path.join(lib, 'steamapps');
            if (!fs.existsSync(steamapps)) continue;

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
                                    imageUrl: `https://steamcdn-a.akamaihd.net/steam/apps/${app.appid}/library_600x900.jpg`
                                });
                                seenAppIds.add(app.appid);
                            }
                        }
                    } catch (e) { }
                }
            }
        }

        this.knownGames = games;
        if (games.length > 0) {
            this.hasWarnedMissing = false; // Reset warning if we eventually found something
        }
        return games;
    }

    public async checkRunningGame() {
        // Only run if we actually have games to check against, or every so often retry discovery
        if (this.knownGames.length === 0) {
            // Maybe retry discovery?
            // this.getGames(); // implicit via constructor interval or manual trigger
            return;
        }

        try {
            const pids = fs.readdirSync('/proc').filter(f => /^\d+$/.test(f));
            let detected: SteamGame | null = null;

            for (const pid of pids) {
                try {
                    const exeLink = `/proc/${pid}/exe`;
                    if (!fs.existsSync(exeLink)) continue;
                    const exePath = fs.readlinkSync(exeLink);

                    for (const game of this.knownGames) {
                        if (!game.installDir) continue;
                        const installDirWithSep = game.installDir.endsWith(path.sep) ? game.installDir : game.installDir + path.sep;
                        if (exePath.startsWith(installDirWithSep)) {
                            detected = game;
                            break;
                        }
                    }
                } catch (e) { continue; }
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
            // Silently fail on permission errors usually
        }
    }

    public getDownloads() {
        return [];
    }
}

export const steamService = new SteamService();
