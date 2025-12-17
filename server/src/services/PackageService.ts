import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

export interface PackageInfo {
    name: string;
    summary: string;
    version?: string;
    arch?: string;
}

// Cache file is generated during build phase by bazzite_build.sh
const CACHE_FILE = path.join(__dirname, '../../storage/package-cache.json');

class PackageService {
    // Cache for available packages - single array, replaced on load (no memory leak)
    private packageCache: PackageInfo[] = [];
    private cacheLoaded: boolean = false;

    // Cache for layered packages (installed via rpm-ostree)
    private layeredPackages: string[] = [];
    private lastStatusCheck: number = 0;
    private LAYERED_CACHE_TTL = 30000; // 30s

    constructor() {
        this.init();
    }

    private async init() {
        console.log('[PackageService] Initializing...');
        await this.refreshStatus();
        this.loadPackageCache();
    }

    private loadPackageCache(): void {
        try {
            if (fs.existsSync(CACHE_FILE)) {
                const data = fs.readFileSync(CACHE_FILE, 'utf-8');
                const parsed = JSON.parse(data);

                // Replace cache atomically (memory safe - old array gets GC'd)
                this.packageCache = Array.isArray(parsed) ? parsed : [];
                this.cacheLoaded = true;

                console.log(`[PackageService] Loaded ${this.packageCache.length} packages from cache file`);
            } else {
                console.warn('[PackageService] No cache file found at', CACHE_FILE);
                console.warn('[PackageService] Run bazzite_build.sh to generate the package cache');
                this.packageCache = [];
                this.cacheLoaded = false;
            }
        } catch (e: any) {
            console.error('[PackageService] Failed to load package cache:', e.message);
            this.packageCache = [];
            this.cacheLoaded = false;
        }
    }

    // Method to reload cache (can be called manually or on demand)
    public reloadCache(): void {
        this.loadPackageCache();
    }

    private async refreshStatus() {
        try {
            const { stdout } = await execAsync('rpm-ostree status');
            const lines = stdout.split('\n');
            const layeredLine = lines.find(l => l.trim().startsWith('LayeredPackages:'));
            if (layeredLine) {
                const parts = layeredLine.trim().split(':')[1].trim().split(/\s+/);
                this.layeredPackages = parts.filter(p => p.length > 0);
            } else {
                this.layeredPackages = [];
            }
            this.lastStatusCheck = Date.now();
        } catch (e) {
            console.error('[PackageService] Failed to get rpm-ostree status:', e);
        }
    }

    public async getLayeredPackages(): Promise<string[]> {
        if (Date.now() - this.lastStatusCheck > this.LAYERED_CACHE_TTL) {
            await this.refreshStatus();
        }
        return this.layeredPackages;
    }

    public getCacheStatus(): { loaded: boolean; count: number } {
        return {
            loaded: this.cacheLoaded,
            count: this.packageCache.length
        };
    }

    public search(query: string): PackageInfo[] {
        if (!query || query.length < 2) return [];
        if (!this.cacheLoaded) return [];

        const lowerQuery = query.toLowerCase();

        // Filter cached packages - simple substring match on name
        const results = this.packageCache.filter(pkg =>
            pkg.name.toLowerCase().includes(lowerQuery)
        );

        // Limit results to prevent large payloads
        return results.slice(0, 50);
    }

    public install(pkg: string) {
        const safePkg = pkg.replace(/[^a-zA-Z0-9\-\_\.]/g, '');
        console.log('[PackageService] Installing:', safePkg);
        return execAsync(`sudo rpm-ostree install ${safePkg} -y`);
    }

    public uninstall(pkg: string) {
        const safePkg = pkg.replace(/[^a-zA-Z0-9\-\_\.]/g, '');
        console.log('[PackageService] Uninstalling:', safePkg);
        return execAsync(`sudo rpm-ostree uninstall ${safePkg} -y`);
    }

    // Cleanup method for graceful shutdown
    public destroy() {
        this.packageCache = [];
    }
}

export const packageService = new PackageService();
