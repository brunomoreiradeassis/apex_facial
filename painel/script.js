const API_URL = "https://apexfacial-production.up.railway.app";

// Estado Global
let currentUser = null;
let charts = {};

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
    lucide.createIcons();
    document.getElementById('date-now').innerText = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'full' }).format(new Date());
});

// 1. Lógica de Autenticação
const loginForm = document.getElementById('login-form');
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    btn.innerText = "VERIFICANDO...";
    
    const email = document.getElementById('login-email').value;
    const senha = document.getElementById('login-password').value;

    try {
        const response = await fetch(`${API_URL}/autenticacao/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, senha })
        });

        const data = await response.json();

        if (data.success) {
            currentUser = data.user;
            document.getElementById('user-name').innerText = currentUser.nome_completo;
            document.getElementById('login-screen').classList.add('hidden');
            const panel = document.getElementById('main-panel');
            panel.classList.remove('hidden');
            panel.classList.add('flex');
            setTimeout(() => panel.classList.add('opacity-100'), 50);
            
            initDashboard();
        } else {
            document.getElementById('login-error').innerText = "Credenciais inválidas.";
            btn.innerText = "ENTRAR NO SISTEMA";
        }
    } catch (err) {
        document.getElementById('login-error').innerText = "Erro de conexão com Railway.";
        btn.innerText = "ENTRAR NO SISTEMA";
    }
});

// 2. Navegação
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
        const target = item.getAttribute('data-target');
        
        // UI Update
        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');

        document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
        const targetPage = document.getElementById(target);
        if (targetPage) {
            targetPage.classList.remove('hidden');
            targetPage.classList.add('block');
        }

        document.getElementById('current-page-title').innerText = item.querySelector('span').innerText;

        // Load Data based on page
        if (target === 'page-cadastros') loadCadastros();
        if (target === 'page-dashboard') initDashboard();
    });
});

// 3. Dashboard e Gráficos
async function initDashboard() {
    try {
        // Buscar Cadastros para Estatísticas de Categorias
        const resCad = await fetch(`${API_URL}/cadastros`);
        const cadastros = await resCad.json();
        document.getElementById('stat-total-cadastros').innerText = cadastros.length;

        // Buscar Autorizações para o Histórico e Fluxo
        const resPort = await fetch(`${API_URL}/portaria`);
        const autorizacoes = await resPort.json();
        
        // Filtro de visitas de hoje
        const hoje = new Date().toISOString().split('T')[0];
        const visitasHoje = autorizacoes.filter(v => v.data_visita.startsWith(hoje));
        document.getElementById('stat-total-visitas').innerText = visitasHoje.length;
        
        updateCharts(cadastros, autorizacoes);
        loadRecentActivity(autorizacoes);
    } catch (err) {
        console.error("Dashboard error:", err);
    }
}

function updateCharts(cadastros, autorizacoes) {
    const ctxAcessos = document.getElementById('chart-acessos').getContext('2d');
    const ctxCategorias = document.getElementById('chart-categorias').getContext('2d');

    if (charts.acessos) charts.acessos.destroy();
    if (charts.categorias) charts.categorias.destroy();

    // Dados Reais de Categorias
    const catCounts = cadastros.reduce((acc, curr) => {
        acc[curr.categoria] = (acc[curr.categoria] || 0) + 1;
        return acc;
    }, {});

    charts.categorias = new Chart(ctxCategorias, {
        type: 'doughnut',
        data: {
            labels: Object.keys(catCounts),
            datasets: [{
                data: Object.values(catCounts),
                backgroundColor: ['#3b82f6', '#6366f1', '#10b981', '#f59e0b', '#ef4444'],
                borderWidth: 0,
                hoverOffset: 20
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8', font: { weight: 'bold' } } } },
            cutout: '70%'
        }
    });

    // Dados de Acessos por Dia (Últimos 7 dias)
    const acessosPorDia = autorizacoes.reduce((acc, curr) => {
        const data = curr.data_visita.split('T')[0];
        acc[data] = (acc[data] || 0) + 1;
        return acc;
    }, {});

    const labelsAcesso = Object.keys(acessosPorDia).sort().slice(-7);
    const dataAcesso = labelsAcesso.map(l => acessosPorDia[l]);

    charts.acessos = new Chart(ctxAcessos, {
        type: 'line',
        data: {
            labels: labelsAcesso.length > 0 ? labelsAcesso : ['Sem Dados'],
            datasets: [{
                label: 'Autorizações de Acesso',
                data: dataAcesso.length > 0 ? dataAcesso : [0],
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                fill: true,
                tension: 0.4,
                borderWidth: 4,
                pointRadius: 4,
                pointBackgroundColor: '#3b82f6'
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: {
                y: { display: true, grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8' } },
                x: { grid: { display: false }, ticks: { color: '#94a3b8' } }
            }
        }
    });
}

// 4. Histórico e Atividade Real
async function loadRecentActivity(autorizacoes) {
    const tbody = document.querySelector('#table-recent-activity tbody');
    tbody.innerHTML = '';

    if (!autorizacoes || autorizacoes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="p-8 text-center text-slate-500 font-bold">SEM ATIVIDADE REGISTRADA</td></tr>';
        return;
    }
    
    autorizacoes.slice(0, 8).forEach(v => {
        const hora = v.horario_visita ? v.horario_visita.substring(0, 5) : '--:--';
        const dataVisita = v.data_visita.split('T')[0];
        
        tbody.innerHTML += `
            <tr class="group hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                <td class="p-4 flex items-center gap-3">
                    <div class="w-10 h-10 rounded-xl bg-brand-500/10 flex items-center justify-center text-brand-500">
                        <i data-lucide="user" class="w-5 h-5"></i>
                    </div>
                    <div>
                        <p class="font-bold text-sm text-slate-900 dark:text-white">${v.nome_categoria}</p>
                        <p class="text-[10px] text-slate-500 font-black uppercase">Responsável: ${v.nome_proprietario}</p>
                    </div>
                </td>
                <td class="p-4 text-xs font-bold text-slate-500">${v.categoria}</td>
                <td class="p-4 text-xs text-slate-400">
                    <span class="block font-bold">${hora}</span>
                    <span class="text-[10px] opacity-60">${dataVisita}</span>
                </td>
                <td class="p-4 text-right">
                    <span class="px-3 py-1 rounded-full text-[10px] font-black ${v.acesso_bloqueado === 'sim' ? 'bg-red-500/10 text-red-500' : 'bg-green-500/10 text-green-500'}">
                        ${v.acesso_bloqueado === 'sim' ? 'BLOQUEADO' : 'AUTORIZADO'}
                    </span>
                </td>
            </tr>
        `;
    });
    lucide.createIcons();
}

// 5. Gestão de Cadastros
async function loadCadastros() {
    const tbody = document.querySelector('#table-pessoas tbody');
    tbody.innerHTML = '<tr><td colspan="5" class="p-20 text-center text-slate-500 animate-pulse font-black">SINCRONIZANDO COM RAILWAY...</td></tr>';

    try {
        const res = await fetch(`${API_URL}/cadastros`);
        const data = await res.json();
        
        tbody.innerHTML = '';
        data.forEach(p => {
            const urlFoto = p.url_facial.startsWith('/') ? API_URL + p.url_facial : p.url_facial;
            tbody.innerHTML += `
                <tr class="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                    <td class="p-6 flex items-center gap-4">
                        <img src="${urlFoto}" class="w-12 h-12 rounded-2xl object-cover ring-2 ring-brand-500/20 shadow-lg">
                        <span class="font-black text-sm">${p.nome_completo}</span>
                    </td>
                    <td class="p-6 text-sm text-slate-500 font-medium">${p.cpf}</td>
                    <td class="p-6">
                        <span class="px-4 py-1.5 rounded-xl text-[10px] font-black bg-brand-500/10 text-brand-500 uppercase tracking-widest border border-brand-500/20">
                            ${p.categoria}
                        </span>
                    </td>
                    <td class="p-6 text-sm font-bold text-slate-400">${p.telefone || '---'}</td>
                    <td class="p-6 text-right">
                        <button onclick="deletePessoa(${p.id})" class="w-10 h-10 rounded-xl bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-all flex items-center justify-center">
                            <i data-lucide="trash-2" class="w-5 h-5"></i>
                        </button>
                    </td>
                </tr>
            `;
        });
        lucide.createIcons(); // Recriar ícones na tabela dinâmica
    } catch (err) {
        tbody.innerHTML = '<tr><td colspan="5" class="p-20 text-center text-red-500 font-black uppercase tracking-widest">ERRO NA SINCRONIZAÇÃO</td></tr>';
    }
}

// Deletar Cadastro
async function deletePessoa(id) {
    if (!confirm("Tem certeza que deseja excluir permanentemente este cadastro?")) return;

    try {
        const res = await fetch(`${API_URL}/cadastros/${id}`, { method: 'DELETE' });
        if (res.ok) {
            loadCadastros();
            initDashboard();
        } else {
            alert("Erro ao excluir do servidor.");
        }
    } catch (err) {
        alert("Erro de conexão.");
    }
}

// CRUD e Modais
document.getElementById('form-cadastro').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    btn.innerText = "ENVIANDO BIOMETRIA...";
    btn.disabled = true;

    const formData = new FormData();
    formData.append('nome_completo', document.getElementById('cad-nome').value);
    formData.append('cpf', document.getElementById('cad-cpf').value);
    formData.append('categoria', document.getElementById('cad-categoria').value);
    formData.append('telefone', document.getElementById('cad-tel').value);
    formData.append('foto', document.getElementById('cad-foto').files[0]);

    try {
        const res = await fetch(`${API_URL}/cadastros`, { method: 'POST', body: formData });
        if (res.ok) {
            closeAllModals();
            loadCadastros();
        }
    } catch (err) { alert("Falha no upload."); }
    finally { btn.innerText = "SINCRONIZAR NA NUVEM"; btn.disabled = false; }
});

function openModal(id) {
    const m = document.getElementById(id);
    m.classList.remove('hidden');
    m.classList.add('flex');
}

function closeAllModals() {
    document.querySelectorAll('.modal').forEach(m => {
        m.classList.add('hidden');
        m.classList.remove('flex');
    });
}

const themeToggle = document.getElementById('theme-toggle');
themeToggle.addEventListener('click', () => {
    document.documentElement.classList.toggle('dark');
    setTimeout(() => initDashboard(), 100); // Redesenhar gráficos para cores do tema
});

document.getElementById('logout-btn').addEventListener('click', () => location.reload());
