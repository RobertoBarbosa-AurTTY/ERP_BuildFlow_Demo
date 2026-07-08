// BuildFlow ERP - Configurações
document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    loadProfile();
    loadUnits();

    document.getElementById('saveCompanyBtn')?.addEventListener('click', saveCompanySettings);
    document.getElementById('savePrintBtn')?.addEventListener('click', savePrintSettings);
    document.getElementById('saveUIBtn')?.addEventListener('click', saveUISettings);
    document.getElementById('saveProfileBtn')?.addEventListener('click', saveProfile);
    document.getElementById('saveUnitBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        saveUnitSettings();
    });
    document.getElementById('exportBackupBtn')?.addEventListener('click', exportDatabaseBackup);
});

function loadProfile() {
    const userData = JSON.parse(localStorage.getItem('user') || '{}');
    if (document.getElementById('profileName')) {
        document.getElementById('profileName').value = userData.name || '';
    }
    if (document.getElementById('profileEmail')) {
        document.getElementById('profileEmail').value = userData.email || '';
    }
    document.getElementById('profileCurrentPassword').value = '';
    document.getElementById('profileNewPassword').value = '';
}

async function saveProfile() {
    const name = document.getElementById('profileName').value.trim();
    const email = document.getElementById('profileEmail').value.trim();
    const currentPassword = document.getElementById('profileCurrentPassword').value;
    const newPassword = document.getElementById('profileNewPassword').value;

    if (!name) {
        BuildFlow.showToast('Informe seu nome.', 'warning');
        return;
    }

    const body = { name };
    let requiresPassword = false;

    const userData = JSON.parse(localStorage.getItem('user') || '{}');
    if (email && email !== userData.email) {
        body.email = email;
        requiresPassword = true;
    }
    if (newPassword) {
        body.newPassword = newPassword;
        requiresPassword = true;
    }

    if (requiresPassword && !currentPassword) {
        BuildFlow.showToast('Confirme sua senha atual para alterar email ou senha.', 'warning');
        return;
    }

    if (requiresPassword) {
        body.currentPassword = currentPassword;
    }

    try {
        const result = await BuildFlow.apiFetch('/auth-update', {
            method: 'POST',
            body: JSON.stringify(body)
        });

        if (result.user) {
            const stored = JSON.parse(localStorage.getItem('user') || '{}');
            stored.name = result.user.name;
            stored.email = result.user.email;
            localStorage.setItem('user', JSON.stringify(stored));
        }

        document.getElementById('profileCurrentPassword').value = '';
        document.getElementById('profileNewPassword').value = '';
        BuildFlow.showToast('Perfil atualizado com sucesso!', 'success');
    } catch (error) {
        BuildFlow.showToast(error.message || 'Erro ao atualizar perfil.', 'danger');
    }
}

function loadSettings() {
    const settings = BuildFlow.getSettings();
    
    document.getElementById('storeName').value = settings.storeName;
    document.getElementById('companyName').value = settings.companyName;
    document.getElementById('companyCnpj').value = settings.companyCnpj;

    if (document.getElementById('autoPrint')) document.getElementById('autoPrint').checked = settings.autoPrint;
    if (document.getElementById('useQz')) document.getElementById('useQz').checked = settings.useQz;
    if (document.getElementById('printType')) document.getElementById('printType').value = settings.printType || 'thermal';
    if (document.getElementById('showCompanyData')) document.getElementById('showCompanyData').checked = settings.showCompanyData;
    if (document.getElementById('footerMessage')) document.getElementById('footerMessage').value = settings.footerMessage;
    if (document.getElementById('receiptLegalNote')) document.getElementById('receiptLegalNote').value = settings.receiptLegalNote;
    if (document.getElementById('proconNumber')) document.getElementById('proconNumber').value = settings.proconNumber;

    if (document.getElementById('darkMode')) document.getElementById('darkMode').checked = settings.darkMode;
    if (document.getElementById('pushNotifications')) document.getElementById('pushNotifications').checked = settings.pushNotifications;
    if (document.getElementById('systemSounds')) document.getElementById('systemSounds').checked = settings.systemSounds;
}

function saveCompanySettings() {
    const storeName = document.getElementById('storeName').value;
    const companyName = document.getElementById('companyName').value;
    const companyCnpj = document.getElementById('companyCnpj').value;

    if (!storeName) {
        BuildFlow.showToast('O nome da loja é obrigatório para as impressões!', 'warning');
        return;
    }

    const settings = JSON.parse(localStorage.getItem('buildflow_settings')) || {};
    settings.storeName = storeName;
    settings.companyName = companyName;
    settings.companyCnpj = companyCnpj;

    localStorage.setItem('buildflow_settings', JSON.stringify(settings));
    BuildFlow.showToast('Configurações da empresa salvas!', 'success');
}

function savePrintSettings() {
    const autoPrint = document.getElementById('autoPrint').checked;
    const useQz = document.getElementById('useQz').checked;
    const printType = document.getElementById('printType').value;
    const showCompanyData = document.getElementById('showCompanyData').checked;
    const footerMessage = document.getElementById('footerMessage').value;
    const receiptLegalNote = document.getElementById('receiptLegalNote').value;
    const proconNumber = document.getElementById('proconNumber').value;

    const settings = JSON.parse(localStorage.getItem('buildflow_settings')) || {};
    settings.autoPrint = autoPrint;
    settings.useQz = useQz;
    settings.printType = printType;
    settings.showCompanyData = showCompanyData;
    settings.footerMessage = footerMessage;
    settings.receiptLegalNote = receiptLegalNote;
    settings.proconNumber = proconNumber;

    localStorage.setItem('buildflow_settings', JSON.stringify(settings));
    BuildFlow.showToast('Preferências de impressão salvas!', 'success');
}

async function loadUnits() {
    try {
        const units = await BuildFlow.getUnits();
        renderUnits(units);
    } catch (error) {
        console.error('Erro ao carregar unidades:', error);
        BuildFlow.showToast('Não foi possível carregar unidades.', 'danger');
    }
}

function renderUnits(units) {
    const container = document.getElementById('unitList');
    if (!container) return;
    if (!units.length) {
        container.innerHTML = '<div class="settings-row"><div class="info"><p>Nenhuma unidade cadastrada ainda.</p><span>Cadastre uma unidade para usar nos relatórios.</span></div></div>';
        return;
    }

    container.innerHTML = units.map(unit => `
        <div class="settings-row">
            <div class="info">
                <p>${BuildFlow.escapeHtml(unit.name)}</p>
                <span>${BuildFlow.escapeHtml(unit.address || 'Endereço não informado')}</span>
            </div>
            <div style="display:flex; align-items:center; gap:12px;">
                <span style="font-size:0.8rem; color: var(--text-muted);">${unit.active ? 'Ativa' : 'Inativa'}</span>
            </div>
        </div>
    `).join('');
}

async function saveUnitSettings() {
    const unitName = document.getElementById('unitName').value.trim();
    const unitAddress = document.getElementById('unitAddress').value.trim();
    const unitActive = document.getElementById('unitActive').checked;

    if (!unitName) {
        BuildFlow.showToast('Informe o nome da unidade.', 'warning');
        return;
    }

    try {
        await BuildFlow.createUnit({
            name: unitName,
            address: unitAddress,
            active: unitActive
        });
        BuildFlow.showToast('Unidade cadastrada com sucesso!', 'success');
        document.getElementById('unitName').value = '';
        document.getElementById('unitAddress').value = '';
        document.getElementById('unitActive').checked = true;
        loadUnits();
    } catch (error) {
        BuildFlow.showToast(error.message || 'Erro ao salvar unidade.', 'danger');
    }
}

function saveUISettings() {
    const pushNotifications = document.getElementById('pushNotifications').checked;
    const systemSounds = document.getElementById('systemSounds').checked;

    const settings = JSON.parse(localStorage.getItem('buildflow_settings')) || {};
    settings.pushNotifications = pushNotifications;
    settings.systemSounds = systemSounds;

    localStorage.setItem('buildflow_settings', JSON.stringify(settings));
    BuildFlow.showToast('Preferências de interface salvas!', 'success');
}

async function exportDatabaseBackup() {
    const { value: password } = await Swal.fire({
        title: 'Exportar Backup',
        text: 'Digite sua senha atual para confirmar:',
        icon: 'security',
        input: 'password',
        inputPlaceholder: 'Senha atual',
        showCancelButton: true,
        confirmButtonText: 'Confirmar',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#4f46e5',
        inputValidator: (value) => {
            if (!value) return 'Informe sua senha';
        }
    });

    if (!password) return;

    try {
        await BuildFlow.apiFetch('/auth-verify', {
            method: 'POST',
            body: JSON.stringify({ password })
        });
    } catch (error) {
        BuildFlow.showToast('Senha incorreta!', 'danger');
        return;
    }

    const btn = document.getElementById('exportBackupBtn');

    try {
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Exportando...';
        }

        const response = await fetch('/api/export-db?format=json', {
            headers: BuildFlow.getAuthHeaders()
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || 'Erro ao exportar dados');
        }

        const disposition = response.headers.get('Content-Disposition') || '';
        const filenameMatch = disposition.match(/filename="?(.+?)"?$/);
        const filename = filenameMatch ? filenameMatch[1] : `buildflow-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;

        const blob = await response.blob();

        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);

        BuildFlow.showToast('Backup exportado com sucesso!', 'success');
    } catch (error) {
        BuildFlow.showToast(error.message || 'Erro ao exportar backup.', 'danger');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-download"></i> Exportar Backup';
        }
    }
}
