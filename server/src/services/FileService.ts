
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

import { authService } from './AuthService';
import { ownerService } from './OwnerService';

const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);

interface FileEntry {
    name: string;
    type: 'file' | 'directory';
    size: number;
    path: string;
}

class FileService {
    private rootDir: string;

    constructor() {
        // Use owner's home, not the service user's (which may not exist)
        this.rootDir = ownerService.getOwnerHome();
    }

    public async listFiles(requestPath: string, useSudo: boolean = false): Promise<{ success: boolean, files?: FileEntry[], currentPath?: string, parentPath?: string, error?: string }> {
        const targetPath = requestPath ? path.resolve(requestPath) : this.rootDir;

        console.log(`[FileService] listFiles called: path="${requestPath}", useSudo=${useSudo}, targetPath="${targetPath}"`);

        if (useSudo) {
            console.log(`[FileService] Using sudo (root) path for: ${targetPath}`);
            return this.listWithSudo(targetPath);
        }

        // Non-sudo mode: run as owner
        console.log(`[FileService] Using owner path for: ${targetPath}`);
        return this.listAsOwner(targetPath);
    }

    /**
     * List files as the original owner (e.g., steam).
     * Can only access what the owner can access.
     */
    private async listAsOwner(dirPath: string): Promise<{ success: boolean, files?: FileEntry[], currentPath?: string, parentPath?: string, error?: string }> {
        try {
            const safePath = dirPath.replace(/'/g, "'\\''");

            // Check if directory exists and is accessible to owner
            try {
                await ownerService.execAsOwner(`test -d '${safePath}'`);
            } catch (e) {
                return { success: false, error: 'Not a directory or access denied' };
            }

            // List entries as owner
            const cmd = `find -L '${safePath}' -maxdepth 1 -mindepth 1 -printf "%y|%s|%f\\n"`;
            const output = await ownerService.execAsOwner(cmd);

            const files: FileEntry[] = output.trim().split('\n').filter(l => l).map(line => {
                const parts = line.split('|');
                if (parts.length < 3) return null;
                const typeChar = parts[0];
                const size = parseInt(parts[1], 10);
                const name = parts.slice(2).join('|');

                return {
                    name: name,
                    type: typeChar === 'd' ? 'directory' : 'file',
                    size: isNaN(size) ? 0 : size,
                    path: path.join(dirPath, name)
                };
            }).filter(f => f !== null) as FileEntry[];

            files.sort((a, b) => {
                if (a.type === b.type) return a.name.localeCompare(b.name);
                return a.type === 'directory' ? -1 : 1;
            });

            return {
                success: true,
                files,
                currentPath: dirPath,
                parentPath: dirPath === '/' ? undefined : path.dirname(dirPath)
            };
        } catch (error: any) {
            console.error('[FileService] listAsOwner CAUGHT error:', error);
            const msg = error.message || '';
            if (msg.includes('Permission denied') || msg.startsWith('Failed to execute as')) {
                return { success: false, error: 'Authorization Failed' };
            }
            return { success: false, error: 'Failed to access directory' };
        }
    }

    /**
     * List files as root (sudo mode).
     * Can access anything on the system.
     */
    private async listWithSudo(dirPath: string): Promise<{ success: boolean, files?: FileEntry[], currentPath?: string, parentPath?: string, error?: string }> {
        try {
            // Escape path
            const safePath = dirPath.replace(/'/g, "'\\''");
            // Check if directory exists and is directory
            try {
                await authService.execSudo(`test -d '${safePath}'`);
            } catch (e) {
                return { success: false, error: 'Not a directory or access denied' };
            }

            // List entries: type|size|name
            const cmd = `find -L '${safePath}' -maxdepth 1 -mindepth 1 -printf "%y|%s|%f\\n"`;
            const output = await authService.execSudo(cmd);

            const files: FileEntry[] = output.trim().split('\n').filter(l => l).map(line => {
                const parts = line.split('|');
                if (parts.length < 3) return null;
                const typeChar = parts[0]; // f or d
                const size = parseInt(parts[1], 10);
                const name = parts.slice(2).join('|');

                return {
                    name: name,
                    type: typeChar === 'd' ? 'directory' : 'file',
                    size: isNaN(size) ? 0 : size,
                    path: path.join(dirPath, name)
                };
            }).filter(f => f !== null) as FileEntry[];

            files.sort((a, b) => {
                if (a.type === b.type) return a.name.localeCompare(b.name);
                return a.type === 'directory' ? -1 : 1;
            });

            return {
                success: true,
                files,
                currentPath: dirPath,
                parentPath: dirPath === '/' ? undefined : path.dirname(dirPath)
            };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }

    public async deleteFile(filePath: string, useSudo: boolean = false): Promise<{ success: boolean, error?: string }> {
        try {
            if (useSudo) {
                const safePath = filePath.replace(/'/g, "'\\''");
                await authService.execSudo(`rm -rf '${safePath}'`);
                return { success: true };
            }
            await fs.promises.rm(filePath, { recursive: true, force: true });
            return { success: true };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }

    public async createFolder(folderPath: string, useSudo: boolean = false): Promise<{ success: boolean, error?: string }> {
        try {
            if (useSudo) {
                const safePath = folderPath.replace(/'/g, "'\\''");
                const owner = ownerService.getOwner();
                await authService.execSudo(`mkdir -p '${safePath}'`);
                // Set ownership to original user
                await authService.execSudo(`chown ${owner}:${owner} '${safePath}'`);
                return { success: true };
            }
            await fs.promises.mkdir(folderPath, { recursive: true });
            return { success: true };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }

    public async createFile(filePath: string, useSudo: boolean = false): Promise<{ success: boolean, error?: string }> {
        try {
            if (useSudo) {
                const safePath = filePath.replace(/'/g, "'\\''");
                const owner = ownerService.getOwner();
                await authService.execSudo(`touch '${safePath}'`);
                // Set ownership to original user
                await authService.execSudo(`chown ${owner}:${owner} '${safePath}'`);
                return { success: true };
            }
            await fs.promises.writeFile(filePath, '');
            return { success: true };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }
}

export const fileService = new FileService();
