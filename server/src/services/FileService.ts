
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

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
        this.rootDir = process.env.HOME || '/root';
    }

    public async listFiles(requestPath: string): Promise<{ success: boolean, files?: FileEntry[], currentPath?: string, parentPath?: string, error?: string }> {
        try {
            // Resolve path relative to root, prevent traversal above root if desired (optional for root user tool, but good practice)
            // For this tool, let's allow browsing anywhere since it's a system dashboard, but default to HOME.

            const targetPath = requestPath ? path.resolve(requestPath) : this.rootDir;

            // Simple check to ensure we can read it
            const stats = await stat(targetPath);
            if (!stats.isDirectory()) {
                return { success: false, error: 'Not a directory' };
            }

            const entries = await readdir(targetPath, { withFileTypes: true });

            const files: FileEntry[] = await Promise.all(entries.map(async (entry) => {
                const fullPath = path.join(targetPath, entry.name);
                let size = 0;
                try {
                    const entryStats = await stat(fullPath);
                    size = entryStats.size;
                } catch (e) {
                    // ignore permission errors for stats
                }

                return {
                    name: entry.name,
                    type: entry.isDirectory() ? 'directory' : 'file',
                    size: size,
                    path: fullPath
                };
            }));

            // Sort directories first
            files.sort((a, b) => {
                if (a.type === b.type) return a.name.localeCompare(b.name);
                return a.type === 'directory' ? -1 : 1;
            });

            return {
                success: true,
                files,
                currentPath: targetPath,
                parentPath: targetPath === '/' ? undefined : path.dirname(targetPath)
            };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }

    public async deleteFile(filePath: string): Promise<{ success: boolean, error?: string }> {
        try {
            await fs.promises.rm(filePath, { recursive: true, force: true });
            return { success: true };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }

    public async createFolder(folderPath: string): Promise<{ success: boolean, error?: string }> {
        try {
            await fs.promises.mkdir(folderPath, { recursive: true });
            return { success: true };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }

    public async createFile(filePath: string): Promise<{ success: boolean, error?: string }> {
        try {
            // Create empty file
            await fs.promises.writeFile(filePath, '');
            return { success: true };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }
}

export const fileService = new FileService();
