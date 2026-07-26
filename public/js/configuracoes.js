// BuildFlow ERP - Configurações
document.addEventListener('DOMContentLoaded', () => {
    loadSettings();
    loadProfile();
    loadUnits();
    loadCaixas();
    loadPDVSettings();

    document.getElementById('saveCompanyBtn')?.addEventListener('click', saveCompanySettings);
    document.getElementById('savePrintBtn')?.addEventListener('click', savePrintSettings);
    document.getElementById('saveUIBtn')?.addEventListener('click', saveUISettings);
    document.getElementById('saveProfileBtn')?.addEventListener('click', saveProfile);
    document.getElementById('saveUnitBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        saveUnitSettings();
    });
    document.getElementById('saveCaixaBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        saveCaixa();
    });
    document.getElementById('savePDVBtn')?.addEventListener('click', savePDVSettings);
    document.getElementById('exportBackupBtn')?.addEventListener('click', exportDatabaseBackup);

    const caixaAutoCloseEl = document.getElementById('caixaAutoClose');
    if (caixaAutoCloseEl) {
        caixaAutoCloseEl.addEventListener('change', () => {
            const row = document.getElementById('caixaAutoCloseRow');
            if (row) row.style.display = caixaAutoCloseEl.checked ? '' : 'none';
        });
    }
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
    if (document.getElementById('companyAddress')) document.getElementById('companyAddress').value = settings.address;

    if (document.getElementById('autoPrint')) document.getElementById('autoPrint').checked = settings.autoPrint;
    if (document.getElementById('useQz')) document.getElementById('useQz').checked = settings.useQz;
    if (document.getElementById('printType')) {
      const pt = settings.printType || 'thermal-80';
      document.getElementById('printType').value = pt === 'thermal' ? 'thermal-80' : pt;
    }
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
    const companyAddress = document.getElementById('companyAddress')?.value || '';

    if (!storeName) {
        BuildFlow.showToast('O nome da loja é obrigatório para as impressões!', 'warning');
        return;
    }

    const settings = JSON.parse(localStorage.getItem('buildflow_settings')) || {};
    settings.storeName = storeName;
    settings.companyName = companyName;
    settings.companyCnpj = companyCnpj;
    settings.address = companyAddress;

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

    const paperWidth = printType === 'thermal-58' ? 58 : 80;

    const settings = JSON.parse(localStorage.getItem('buildflow_settings')) || {};
    settings.autoPrint = autoPrint;
    settings.useQz = useQz;
    settings.printType = printType;
    settings.paperWidth = paperWidth;
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
    const darkMode = document.getElementById('darkMode').checked;
    const pushNotifications = document.getElementById('pushNotifications').checked;
    const systemSounds = document.getElementById('systemSounds').checked;

    const settings = JSON.parse(localStorage.getItem('buildflow_settings')) || {};
    settings.darkMode = darkMode;
    settings.pushNotifications = pushNotifications;
    settings.systemSounds = systemSounds;

    localStorage.setItem('buildflow_settings', JSON.stringify(settings));
    BuildFlow.applyTheme();
    BuildFlow.showToast('Preferências de interface salvas!', 'success');
}

async function loadCaixas() {
    try {
        const caixas = await BuildFlow.getCaixas();
        renderCaixas(caixas);
    } catch (error) {
        console.error('Erro ao carregar caixas:', error);
    }
}

function renderCaixas(caixas) {
    const container = document.getElementById('caixaList');
    if (!container) return;
    if (!caixas || !caixas.length) {
        container.innerHTML = '<div class="settings-row"><div class="info"><p>Nenhum caixa cadastrado ainda.</p><span>Cadastre os caixas/terminais que serão usados no PDV.</span></div></div>';
        return;
    }

    container.innerHTML = caixas.map(caixa => `
        <div class="settings-row">
            <div class="info">
                <p>${BuildFlow.escapeHtml(caixa.name)}</p>
                <span>${caixa.active ? 'Ativo' : 'Inativo'}</span>
            </div>
            <div style="display:flex; align-items:center; gap:12px;">
                <span style="font-size:0.8rem; color: var(--text-muted);">${caixa.number || caixa.name}</span>
            </div>
        </div>
    `).join('');
}

async function saveCaixa() {
    const name = document.getElementById('caixaName').value.trim();

    if (!name) {
        BuildFlow.showToast('Informe o nome do caixa.', 'warning');
        return;
    }

    try {
        await BuildFlow.createCaixa({ name, active: true });
        BuildFlow.showToast('Caixa cadastrado com sucesso!', 'success');
        document.getElementById('caixaName').value = '';
        loadCaixas();
    } catch (error) {
        BuildFlow.showToast(error.message || 'Erro ao salvar caixa.', 'danger');
    }
}

function loadPDVSettings() {
    const settings = BuildFlow.getSettings();

    if (document.getElementById('caixaDefaultOpening')) document.getElementById('caixaDefaultOpening').value = settings.caixaDefaultOpening || 0;
    if (document.getElementById('caixaRequirePassword')) document.getElementById('caixaRequirePassword').checked = settings.caixaRequirePassword !== false;
    if (document.getElementById('caixaAutoClose')) {
        document.getElementById('caixaAutoClose').checked = settings.caixaAutoClose === true;
        const row = document.getElementById('caixaAutoCloseRow');
        if (row) row.style.display = settings.caixaAutoClose ? '' : 'none';
    }
    if (document.getElementById('caixaAutoCloseTime')) document.getElementById('caixaAutoCloseTime').value = settings.caixaAutoCloseTime || '18:00';
}

function savePDVSettings() {
    const caixaDefaultOpening = parseFloat(document.getElementById('caixaDefaultOpening').value) || 0;
    const caixaRequirePassword = document.getElementById('caixaRequirePassword').checked;
    const caixaAutoClose = document.getElementById('caixaAutoClose').checked;
    const caixaAutoCloseTime = document.getElementById('caixaAutoCloseTime').value || '18:00';

    const settings = JSON.parse(localStorage.getItem('buildflow_settings')) || {};
    settings.caixaDefaultOpening = caixaDefaultOpening;
    settings.caixaRequirePassword = caixaRequirePassword;
    settings.caixaAutoClose = caixaAutoClose;
    settings.caixaAutoCloseTime = caixaAutoCloseTime;

    localStorage.setItem('buildflow_settings', JSON.stringify(settings));
    BuildFlow.showToast('Configurações do PDV salvas com sucesso!', 'success');
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
