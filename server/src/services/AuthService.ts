
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcrypt';
import { exec } from 'child_process';

interface AuthConfig {
    passwordHash: string | null;
    sudoEnabled: boolean; // Persisted preference - user wants sudo mode
}

class AuthService {
    private sessions: Map<string, { isAuthenticated: boolean, isSudo: boolean, expiresAt: number }> = new Map();
    private sudoEnabled: boolean = false; // Persisted preference
    private authFile: string;
    // Separate hashes for Dashboard (Tier 1) and Sudo (Tier 2) - for now using same hash or separating logic
    private dashboardPasswordHash: string | null = null;
    private sudoPasswordHash: string | null = null;

    private sessionExpiry: NodeJS.Timeout | null = null;

    constructor() {
        // Use app's storage directory instead of $HOME (service user may not have a home dir)
        const dataDir = path.join(__dirname, '../../storage');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        this.authFile = path.join(dataDir, 'auth.json');
        this.load();

        // Periodic cleanup
        setInterval(() => this.cleanupSessions(), 60000);
    }

    private load() {
        try {
            if (fs.existsSync(this.authFile)) {
                const rawData = JSON.parse(fs.readFileSync(this.authFile, 'utf-8'));

                // Migration logic: If old format (passwordHash) exists, map it to both hashes
                if (rawData.passwordHash && !rawData.dashboardPasswordHash) {
                    this.dashboardPasswordHash = rawData.passwordHash;
                    // Default Sudo password to Dashboard password for safety/convenience during migration
                    this.sudoPasswordHash = rawData.passwordHash;
                } else {
                    this.dashboardPasswordHash = rawData.dashboardPasswordHash || null;
                    this.sudoPasswordHash = rawData.sudoPasswordHash || null;
                }

                this.sudoEnabled = rawData.sudoEnabled || false;
            }
        } catch (e) {
            console.error('Failed to load auth config:', e);
        }
    }

    private save() {
        try {
            const config = {
                dashboardPasswordHash: this.dashboardPasswordHash,
                sudoPasswordHash: this.sudoPasswordHash,
                sudoEnabled: this.sudoEnabled
            };
            fs.writeFileSync(this.authFile, JSON.stringify(config, null, 2));
        } catch (e) {
            console.error('Failed to save auth config:', e);
        }
    }

    // --- Session Management ---

    private getSession(socketId: string) {
        let session = this.sessions.get(socketId);
        if (!session) {
            session = { isAuthenticated: false, isSudo: false, expiresAt: 0 };
            this.sessions.set(socketId, session);
        }

        // Check expiry
        if (session.isAuthenticated && Date.now() > session.expiresAt) {
            session.isAuthenticated = false;
            session.isSudo = false;
        }

        return session;
    }

    public removeSession(socketId: string) {
        this.sessions.delete(socketId);
    }

    private cleanupSessions() {
        const now = Date.now();
        for (const [id, session] of this.sessions.entries()) {
            if (session.expiresAt < now) {
                this.sessions.delete(id);
            }
        }
    }

    public refreshSession(socketId: string) {
        const session = this.getSession(socketId);
        if (session.isAuthenticated) {
            session.expiresAt = Date.now() + 3600000; // 1 hour
            this.sessions.set(socketId, session);
        }
    }

    // --- Public API ---

    public isAuthenticated(socketId: string): boolean {
        // If no dashboard password is set, we treat the system as "open" (Legacy support / First run)
        if (!this.dashboardPasswordHash) return true;

        return this.getSession(socketId).isAuthenticated;
    }

    public isSudo(socketId: string): boolean {
        return this.getSession(socketId).isSudo;
    }

    public hasDashboardPassword(): boolean {
        return !!this.dashboardPasswordHash;
    }

    public hasSudoPassword(): boolean {
        return !!this.sudoPasswordHash;
    }

    /**
     * Dashboard Login (Tier 1)
     */
    public async login(socketId: string, password: string): Promise<boolean> {
        if (!this.dashboardPasswordHash) {
            this.setAuthenticated(socketId, true);
            return true;
        }

        const valid = await bcrypt.compare(password, this.dashboardPasswordHash);
        if (valid) {
            this.setAuthenticated(socketId, true);
            return true;
        }
        return false;
    }

    /**
     * Sudo Verification (Tier 2)
     */
    public async verifySudoPassword(password: string): Promise<boolean> {
        if (!this.sudoPasswordHash) return true;

        const valid = await bcrypt.compare(password, this.sudoPasswordHash);
        return valid;
    }

    public setAuthenticated(socketId: string, state: boolean) {
        const session = this.getSession(socketId);
        session.isAuthenticated = state;
        if (state) {
            session.expiresAt = Date.now() + 3600000;
        } else {
            session.isSudo = false; // Revoke sudo if auth revoked
        }
        this.sessions.set(socketId, session);
    }

    /**
     * Check if user needs to enter password on dashboard visit.
     */
    public checkSession(socketId: string): { needsPassword: boolean; sudoWasEnabled: boolean, isAuthenticated: boolean } {
        const session = this.getSession(socketId);
        // If no dashboard password, they are auto-authenticated
        const needsPassword = !!this.dashboardPasswordHash && !session.isAuthenticated;

        return {
            needsPassword,
            sudoWasEnabled: this.sudoEnabled,
            isAuthenticated: session.isAuthenticated
        };
    }

    // Attempt to toggle sudo. Returns true if successful, false if password required
    public requestToggleSudo(socketId: string): { success: boolean, requiresPassword: boolean } {
        const session = this.getSession(socketId);

        if (session.isSudo) {
            // Turning off is always allowed
            this.setSudo(socketId, false);
            return { success: true, requiresPassword: false };
        } else {
            // Turning on
            if (!this.sudoPasswordHash) {
                // No password, allow immediately
                this.setSudo(socketId, true);
                return { success: true, requiresPassword: false };
            } else {
                // Requires password
                return { success: false, requiresPassword: true };
            }
        }
    }

    public setSudo(socketId: string, state: boolean) {
        const session = this.getSession(socketId);
        if (!session.isAuthenticated && state) {
            // Cannot enable sudo if not authenticated
            return;
        }
        session.isSudo = state;
        if (state) {
            session.expiresAt = Date.now() + 3600000;
        }
        this.sessions.set(socketId, session);
    }

    public async setDashboardPassword(password: string) {
        if (!password) {
            this.dashboardPasswordHash = null;
        } else {
            this.dashboardPasswordHash = await bcrypt.hash(password, 10);
        }
        this.save();
    }

    public async setSudoPassword(password: string) {
        if (!password) {
            this.sudoPasswordHash = null;
        } else {
            this.sudoPasswordHash = await bcrypt.hash(password, 10);
        }
        this.save();
    }

    public execSudo(command: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const cmdToRun = `sudo -n ${command}`;
            exec(cmdToRun, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
                if (error) {
                    const msg = stderr || error.message;
                    reject(new Error(`Sudo error: ${msg.trim()} (Ensure this command is allowed NOPASSWD in sudoers)`));
                    return;
                }
                resolve(stdout);
            });
        });
    }
}

export const authService = new AuthService();

