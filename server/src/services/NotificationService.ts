
import fs from 'fs';
import path from 'path';
import webpush from 'web-push';

class NotificationService {
    private subsFile: string;
    private keysFile: string;
    private subscriptions: any[] = [];
    private keys: { publicKey: string, privateKey: string } | null = null;

    constructor() {
        const dataDir = path.join(process.env.HOME || '.', '.bazzeye-data');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        this.subsFile = path.join(dataDir, 'subscriptions.json');
        this.keysFile = path.join(dataDir, 'vapid.json');

        this.loadKeys();
        this.loadSubs();

        if (this.keys) {
            webpush.setVapidDetails(
                'mailto:admin@bazzeye.local',
                this.keys.publicKey,
                this.keys.privateKey
            );
        }
    }

    private loadKeys() {
        try {
            if (fs.existsSync(this.keysFile)) {
                this.keys = JSON.parse(fs.readFileSync(this.keysFile, 'utf-8'));
            } else {
                // Generate new keys
                const vapidKeys = webpush.generateVAPIDKeys();
                this.keys = {
                    publicKey: vapidKeys.publicKey,
                    privateKey: vapidKeys.privateKey
                };
                fs.writeFileSync(this.keysFile, JSON.stringify(this.keys, null, 2));
            }
        } catch (e) {
            console.error('Failed to load/generate VAPID keys:', e);
        }
    }

    private loadSubs() {
        try {
            if (fs.existsSync(this.subsFile)) {
                this.subscriptions = JSON.parse(fs.readFileSync(this.subsFile, 'utf-8'));
            }
        } catch (e) {
            console.error('Failed to load subscriptions:', e);
        }
    }

    private saveSubs() {
        try {
            fs.writeFileSync(this.subsFile, JSON.stringify(this.subscriptions, null, 2));
        } catch (e) {
            console.error('Failed to save subscriptions:', e);
        }
    }

    public getPublicKey() {
        return this.keys?.publicKey;
    }

    public subscribe(subscription: any) {
        // Dedup?
        const exists = this.subscriptions.find(s => s.endpoint === subscription.endpoint);
        if (!exists) {
            this.subscriptions.push(subscription);
            this.saveSubs();
        }
    }

    public async sendNotification(payload: string | object) {
        const body = typeof payload === 'string' ? payload : JSON.stringify(payload);

        const promises = this.subscriptions.map(sub =>
            webpush.sendNotification(sub, body).catch(e => {
                if (e.statusCode === 410 || e.statusCode === 404) {
                    // Expired subscription, remove it
                    return 'expired';
                }
                console.error('Push error:', e);
                return 'error';
            })
        );

        const results = await Promise.all(promises);

        // Clean up expired
        let cleanup = false;
        results.forEach((res, idx) => {
            if (res === 'expired') {
                this.subscriptions[idx] = null;
                cleanup = true;
            }
        });

        if (cleanup) {
            this.subscriptions = this.subscriptions.filter(s => s !== null);
            this.saveSubs();
        }
    }
}

export const notificationService = new NotificationService();
