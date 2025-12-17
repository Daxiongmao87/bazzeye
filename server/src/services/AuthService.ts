
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcrypt';
import { exec } from 'child_process';

interface AuthConfig {
    passwordHash: string | null;
    sudoEnabled: boolean; // Persisted preference - user wants sudo mode
}

class AuthService {
    private sudoMode: boolean = false; // Active session state
    private sudoEnabled: boolean = false; // Persisted preference
    private authFile: string;
    private passwordHash: string | null = null;

    private sessionExpiry: NodeJS.Timeout | null = null;

    constructor() {
        const dataDir = path.join(process.env.HOME || '.', '.bazzeye-data');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        this.authFile = path.join(dataDir, 'auth.json');
        this.load();
    }

    private load() {
        try {
            if (fs.existsSync(this.authFile)) {
                const data: AuthConfig = JSON.parse(fs.readFileSync(this.authFile, 'utf-8'));
                this.passwordHash = data.passwordHash || null;
                this.sudoEnabled = data.sudoEnabled || false;
            }
        } catch (e) {
            console.error('Failed to load auth config:', e);
        }
    }

    private save() {
        try {
            const config: AuthConfig = {
                passwordHash: this.passwordHash,
                sudoEnabled: this.sudoEnabled
            };
            fs.writeFileSync(this.authFile, JSON.stringify(config, null, 2));
        } catch (e) {
            console.error('Failed to save auth config:', e);
        }
    }

    public isSudo(): boolean {
        return this.sudoMode;
    }

    public hasPassword(): boolean {
        return !!this.passwordHash;
    }

    /**
     * Check if user needs to enter password on dashboard visit.
     * Returns: { needsPassword: true } if sudo was enabled and password is set.
     */
    public checkSession(): { needsPassword: boolean; sudoWasEnabled: boolean } {
        return {
            needsPassword: this.sudoEnabled && !!this.passwordHash && !this.sudoMode,
            sudoWasEnabled: this.sudoEnabled
        };
    }

    public async setPassword(password: string) {
        if (!password) {
            this.passwordHash = null;
        } else {
            this.passwordHash = await bcrypt.hash(password, 10);
        }
        this.save();
    }

    public async verifyPassword(password: string): Promise<boolean> {
        if (!this.passwordHash) return true; // No password = access granted
        return bcrypt.compare(password, this.passwordHash);
    }

    // Attempt to toggle sudo. Returns true if successful, false if password required
    public requestToggleSudo(): { success: boolean, requiresPassword: boolean } {
        if (this.sudoMode) {
            // Turning off is always allowed
            this.setSudo(false);
            return { success: true, requiresPassword: false };
        } else {
            // Turning on
            if (!this.passwordHash) {
                // No password, allow immediately
                this.setSudo(true);
                return { success: true, requiresPassword: false };
            } else {
                // Requires password
                return { success: false, requiresPassword: true };
            }
        }
    }

    public setSudo(enable: boolean): void {
        this.sudoMode = enable;
        this.sudoEnabled = enable; // Persist preference

        this.save();
        console.log(`[AuthService] Sudo Mode set to: ${this.sudoMode}`);

        if (this.sessionExpiry) clearTimeout(this.sessionExpiry);
    }

    /**
     * Executes a command with sudo privileges using passwordless sudo (sudo -n).
     * Relies on system configuration (sudoers).
     */
    public execSudo(command: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const cmdToRun = `sudo -n ${command}`;

            exec(cmdToRun, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
                if (error) {
                    // Start of error message might contain password prompt
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

