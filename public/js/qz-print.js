const QzPrint = {
    _connected: false,
    _connecting: false,
    _signature: null,

    async connect() {
        if (this._connected) return true;
        if (this._connecting) {
            while (this._connecting) await new Promise(r => setTimeout(r, 200));
            return this._connected;
        }
        this._connecting = true;
        try {
            if (typeof qz === 'undefined') {
                console.warn('qz-tray not loaded');
                return false;
            }
            await qz.websocket.connect().catch(() => {});
            const config = await qz.api.getSignature();
            if (!config) { this._connected = false; return false; }
            this._signature = config;
            this._connected = true;
            return true;
        } catch (e) {
            this._connected = false;
            return false;
        } finally {
            this._connecting = false;
        }
    },

    disconnect() {
        try { qz.websocket.disconnect(); } catch (e) {}
        this._connected = false;
        this._connecting = false;
    },

    async printPdf(pdfData, options = {}) {
        if (!this._connected) {
            const ok = await this.connect();
            if (!ok) {
                BuildFlow.showToast('qz.io não está rodando. Instale qz-tray e tente novamente.', 'danger');
                return false;
            }
        }

        let printer = null;
        try {
            printer = await qz.printers.getDefault();
        } catch (e) {
            BuildFlow.showToast('Nenhuma impressora encontrada no sistema.', 'danger');
            return false;
        }
        if (!printer) {
            BuildFlow.showToast('Nenhuma impressora encontrada no sistema.', 'danger');
            return false;
        }

        const paperWidth = options.paperWidth || 80;
        const config = qz.configs.create(printer, {
            paperSize: { width: paperWidth, height: options.paperHeight || 297 },
            orientation: 'portrait',
            margins: { top: 0, bottom: 0, left: 0, right: 0 },
            colorType: 'blackwhite',
            copies: 1,
            dpi: 203,
            paperSource: 'auto'
        });

        const uint8 = new Uint8Array(pdfData);
        const binary = uint8.reduce((acc, byte) => acc + String.fromCharCode(byte), '');
        const base64 = btoa(binary);

        try {
            await qz.print(config, [
                {
                    type: 'pdf',
                    format: 'base64',
                    data: base64,
                    options: {
                        language: 'pdf',
                        copies: 1,
                        scaling: {
                            pages: 'all',
                            fitToPage: false,
                            scale: 1.0
                        }
                    }
                }
            ]);
            return true;
        } catch (e) {
            BuildFlow.showToast('Erro ao imprimir via qz.io: ' + e.message, 'danger');
            return false;
        }
    }
};
