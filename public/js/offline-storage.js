const DB_NAME = 'BuildFlowOfflineDB';
const DB_VERSION = 1;

class OfflineStorage {
    constructor() {
        this.db = null;
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                // Store for data cache (Products, Sales, etc)
                if (!db.objectStoreNames.contains('data_cache')) {
                    db.createObjectStore('data_cache', { keyPath: 'key' });
                }
                // Store for pending sync (Sales, Stock updates)
                if (!db.objectStoreNames.contains('sync_queue')) {
                    db.createObjectStore('sync_queue', { keyPath: 'id', autoIncrement: true });
                }
            };
        });
    }

    async setCache(key, data) {
        if (!this.db) await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['data_cache'], 'readwrite');
            const store = transaction.objectStore('data_cache');
            store.put({ key, data, timestamp: Date.now() });
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
    }

    async getCache(key) {
        if (!this.db) await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['data_cache'], 'readonly');
            const store = transaction.objectStore('data_cache');
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result ? request.result.data : null);
            request.onerror = () => reject(request.error);
        });
    }

    async addToSyncQueue(endpoint, method, body) {
        if (!this.db) await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['sync_queue'], 'readwrite');
            const store = transaction.objectStore('sync_queue');
            store.add({ endpoint, method, body, timestamp: Date.now() });
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
    }

    async getSyncQueue() {
        if (!this.db) await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['sync_queue'], 'readonly');
            const store = transaction.objectStore('sync_queue');
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async removeFromSyncQueue(id) {
        if (!this.db) await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['sync_queue'], 'readwrite');
            const store = transaction.objectStore('sync_queue');
            store.delete(id);
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
    }
}

window.offlineStorage = new OfflineStorage();
