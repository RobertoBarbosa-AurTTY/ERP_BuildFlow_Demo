// BuildFlow ERP - Configurações
document.addEventListener('DOMContentLoaded', () => {
    // Carregar configurações salvas
    loadSettings();

    // Listener para salvar dados da empresa
    const saveCompanyBtn = document.getElementById('saveCompanyBtn');
    if (saveCompanyBtn) {
        saveCompanyBtn.addEventListener('click', saveCompanySettings);
    }

    // Listener para salvar dados de impressão
    const savePrintBtn = document.getElementById('savePrintBtn');
    if (savePrintBtn) {
        savePrintBtn.addEventListener('click', savePrintSettings);
    }

    // Listener para salvar preferências de UI
    const saveUIBtn = document.getElementById('saveUIBtn');
    if (saveUIBtn) {
        saveUIBtn.addEventListener('click', saveUISettings);
    }

    const saveUnitBtn = document.getElementById('saveUnitBtn');
    if (saveUnitBtn) {
        saveUnitBtn.addEventListener('click', (e) => {
            e.preventDefault();
            saveUnitSettings();
        });
    }

    loadUnits();
});

function loadSettings() {
    const settings = BuildFlow.getSettings();
    
    document.getElementById('storeName').value = settings.storeName;
    document.getElementById('companyName').value = settings.companyName;
    document.getElementById('companyCnpj').value = settings.companyCnpj;

    // Impressão
    if (document.getElementById('autoPrint')) document.getElementById('autoPrint').checked = settings.autoPrint;
    if (document.getElementById('showCompanyData')) document.getElementById('showCompanyData').checked = settings.showCompanyData;
    if (document.getElementById('footerMessage')) document.getElementById('footerMessage').value = settings.footerMessage;

    // UI
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
    const showCompanyData = document.getElementById('showCompanyData').checked;
    const footerMessage = document.getElementById('footerMessage').value;

    const settings = JSON.parse(localStorage.getItem('buildflow_settings')) || {};
    settings.autoPrint = autoPrint;
    settings.showCompanyData = showCompanyData;
    settings.footerMessage = footerMessage;

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
        console.error('Erro ao salvar unidade:', error);
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
    BuildFlow.applyTheme(); // Aplica o tema instantaneamente
    BuildFlow.showToast('Preferências de interface salvas!', 'success');
}
