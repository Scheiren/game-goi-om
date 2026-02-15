// ==========================================
// 1. CẤU HÌNH & KHỞI TẠO (CONFIG & STATE)
// ==========================================
const BASE_RARITY_CONFIG = {
    F:   { bg: 'bg-gradient-to-b from-slate-300 to-slate-400', border: 'border-slate-400', text: 'text-slate-700', shadow: 'shadow-slate-400/50', ring: 'ring-slate-300' },
    D:   { bg: 'bg-gradient-to-b from-stone-400 to-stone-500', border: 'border-stone-500', text: 'text-stone-800', shadow: 'shadow-stone-500/50', ring: 'ring-stone-400' },
    C:   { bg: 'bg-gradient-to-b from-green-400 to-green-600', border: 'border-green-500', text: 'text-green-900', shadow: 'shadow-green-500/50', ring: 'ring-green-400' },
    B:   { bg: 'bg-gradient-to-b from-cyan-400 to-blue-500', border: 'border-blue-400', text: 'text-blue-900', shadow: 'shadow-blue-400/50', ring: 'ring-blue-300' },
    A:   { bg: 'bg-gradient-to-b from-violet-400 to-purple-600', border: 'border-purple-500', text: 'text-purple-100', shadow: 'shadow-purple-500/50', ring: 'ring-purple-400' },
    S:   { bg: 'bg-gradient-to-b from-yellow-300 to-orange-500', border: 'border-yellow-400', text: 'text-yellow-900', shadow: 'shadow-yellow-500/50', ring: 'ring-yellow-300' },
    SS:  { bg: 'bg-gradient-to-b from-orange-400 to-red-600', border: 'border-red-500', text: 'text-white', shadow: 'shadow-red-500/50', ring: 'ring-red-400' },
    SSS: { bg: 'bg-gradient-to-b from-rose-500 to-pink-700', border: 'border-pink-500', text: 'text-white', shadow: 'shadow-pink-500/50', ring: 'ring-pink-400' },
    EX:  { bg: 'bg-[conic-gradient(at_top,_var(--tw-gradient-stops))] from-gray-900 via-purple-900 to-violet-900', border: 'border-indigo-400', text: 'text-transparent bg-clip-text bg-gradient-to-r from-indigo-200 to-cyan-200', shadow: 'shadow-indigo-500/80', ring: 'ring-indigo-500' }
};

const RARITY_WEIGHT = {
    'EX': 9, 'SSS': 8, 'SS': 7, 'S': 6, 
    'A': 5, 'B': 4, 'C': 3, 'D': 2, 'F': 1
};

const GACHA_COST = 100;

let state = {
    username: localStorage.getItem('pgw_user') || 'Guest',
    coins: parseInt(localStorage.getItem('pgw_coins')) || 1000,
    inventory: JSON.parse(localStorage.getItem('pgw_inv') || '[]'),
    isAdmin: false,
    serverInfo: { totalPulls: 0, pityCounter: 0 },
    tab: 'gacha',
    activeGame: null,
    adminTab: 'list', 
    editingPillowId: null,
    sortMode: 'newest',
    isSelectionMode: false,
    selectedItems: [],
    currentCode: null,      // Lưu mã hiện tại (ví dụ: "GIFT-123")
    isCodeRedeemed: false
};

let activeInterval = null, activeTimeout = null, activeAnimFrame = null;

// ==========================================
// 2. CÁC HÀM TIỆN ÍCH (UTILS)
// ==========================================
function playSound(id) {
    const el = document.getElementById(`snd-${id}`);
    if(el) { 
        el.currentTime = 0; 
        el.volume = 0.5; 
        el.play().catch(e => console.log("Audio failed:", e)); 
    }
}

function showToast(msg, type='info') {
    const box = document.getElementById('toast-container');
    const el = document.createElement('div');
    const color = type==='error'?'bg-red-600':(type==='success'?'bg-green-600':'bg-slate-800');
    el.className = `${color} text-white px-4 py-2 rounded-full shadow-lg text-sm font-bold animate-slide-down flex items-center gap-2`;
    el.innerHTML = `<span>${msg}</span>`;
    box.appendChild(el);
    setTimeout(()=>el.remove(), 3000);
}

function cleanupGames() {
    if (activeInterval) { clearInterval(activeInterval); activeInterval = null; }
    if (activeTimeout) { clearTimeout(activeTimeout); activeTimeout = null; }
    if (activeAnimFrame) { cancelAnimationFrame(activeAnimFrame); activeAnimFrame = null; }
    state.activeGame = null;
}

function changeSort(mode) {
    state.sortMode = mode;
    renderCollection(document.getElementById('main-content'));
}

// ==========================================
// 3. API & LOGIN
// ==========================================
async function apiCall(endpoint, body) {
    try {
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(body)
        });
        return await res.json();
    } catch(e) { console.error(e); return {success: false}; }
}

async function login(u, p) {
    const res = await apiCall('/api/login', { username: u, password: p });

    if (res && res.success) {
        state.username = res.username || (res.user && res.user.username) || u;
        state.coins = (res.user && res.user.coins) !== undefined ? res.user.coins : state.coins;
        state.inventory = (res.user && res.user.inventory) || state.inventory;
        state.isAdmin = !!(res.user && res.user.isAdmin);
        state.serverInfo = res.serverInfo || state.serverInfo;
        
        localStorage.setItem('pgw_user', u);
        if(p) localStorage.setItem('pgw_pass', p);
        localStorage.setItem('pgw_coins', state.coins);
        localStorage.setItem('pgw_inv', JSON.stringify(state.inventory));

        showToast(res.message || 'Đăng nhập thành công', 'success');
        renderApp();
    } else {
        const errorMsg = res && res.message ? res.message : 'Đăng nhập thất bại';
        showToast(errorMsg, 'error');
    }
}

async function refreshUserData() {
    if(state.username === 'Guest') return;
    const savedPass = localStorage.getItem('pgw_pass') || '';
    await login(state.username, savedPass); 
}

// ==========================================
// 4. UI CORE (ĐIỀU HƯỚNG & RENDER CHÍNH)
// ==========================================
window.onload = () => {
    checkAuth();

    document.addEventListener('click', (e) => {
        if(e.target.closest('button') || e.target.closest('.cursor-pointer')) {
        }
    });
};

function setTab(t) {
    cleanupGames();
    if(t === 'admin' && !state.isAdmin) {
        showToast("Yêu cầu quyền Admin", "error");
        return;
    }
    state.tab = t;
    renderApp();
}

function updateUI() {
    document.querySelectorAll('.coin-display').forEach(el => el.textContent = state.coins);
    
    document.querySelectorAll('.admin-nav-item').forEach(el => {
        if(state.isAdmin) el.classList.remove('hidden'); 
        else el.classList.add('hidden');
    });
    
    document.querySelectorAll('.nav-btn, .sidebar-btn').forEach(btn => {
        const isActive = btn.dataset.tab === state.tab;
        
        if(btn.classList.contains('sidebar-btn')) {
            btn.className = `sidebar-btn flex items-center space-x-3 w-full px-6 py-4 text-left transition-colors rounded-xl ${isActive ? 'bg-indigo-50 text-indigo-600 border-r-4 border-indigo-600' : 'text-slate-500 hover:bg-slate-50'}`;
            if(btn.dataset.tab === 'admin') btn.classList.add('admin-nav-item');
        } else {
             if(isActive) { 
                 btn.classList.add('text-indigo-600'); 
                 btn.classList.remove('text-slate-400'); 
             } else { 
                 btn.classList.remove('text-indigo-600'); 
                 btn.classList.add('text-slate-400'); 
             }
        }
    });
    
    document.querySelectorAll('.admin-nav-item').forEach(el => {
        if(!state.isAdmin) el.classList.add('hidden');
    });

    lucide.createIcons();
}

function renderApp() {
    const content = document.getElementById('main-content');
    if (!content) return;
    if (state.activeGame) return; 

    content.innerHTML = '';
    updateUI();

    switch(state.tab) {
        case 'gacha': renderGacha(content); break;
        case 'collection': renderCollection(content); break;
        case 'games': renderGamesHub(content); break;
        case 'exchange': renderExchange(content); break;
        case 'profile': renderProfile(content); break;
        case 'admin': if(state.isAdmin) renderAdmin(content); else setTab('profile'); break;
        default: renderGacha(content);
    }
    lucide.createIcons();
}

// ==========================================
// 5. CÁC HÀM RENDER CHI TIẾT
// ==========================================

// --- GACHA ---
function renderGacha(div) {
    const pityBonus = Math.floor(state.serverInfo.pityCounter / 200) * 0.001;
    let currentExChance = (0.001 + pityBonus);
    if(currentExChance > 0.1) currentExChance = 0.1;
    const pullsToNextPity = 200 - (state.serverInfo.pityCounter % 200);

    div.innerHTML = `
        <div id="gacha-stage" class="flex flex-col items-center justify-center h-full space-y-6 p-4">
            ${state.isAdmin ? `
            <div class="bg-indigo-100 text-indigo-800 px-4 py-2 rounded-lg text-sm border border-indigo-200 text-center w-full max-w-xs shadow-sm">
                <div class="font-bold flex items-center justify-center gap-1 mb-1"><i data-lucide="activity" width="16"></i> Server Pity System (Admin)</div>
                Tỉ lệ ra EX: <span class="font-black text-red-600">${(currentExChance*100).toFixed(2)}%</span> | Pity sau: ${pullsToNextPity}
                <div class="text-[10px] text-indigo-400 mt-1">Total Pulls: ${state.serverInfo.totalPulls} | Pity Counter: ${state.serverInfo.pityCounter}</div>
            </div>
            ` : ''}

            <div class="text-center space-y-2">
                <h2 class="text-3xl font-black text-indigo-900 drop-shadow-sm">Túi Mù Gối Ôm</h2>
                <p class="text-indigo-600 font-bold bg-white inline-block px-3 py-1 rounded-full shadow-sm">Giá: ${GACHA_COST} Xu</p>
            </div>
            <button onclick="doGacha()" class="w-48 h-64 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl shadow-[0_10px_20px_rgba(99,102,241,0.4)] border-4 border-indigo-300 flex flex-col items-center justify-center transform transition hover:scale-105 active:scale-95">
                <i data-lucide="gift" width="72" height="72" class="text-white mb-4 drop-shadow-md"></i>
                <span class="text-white font-black text-2xl tracking-wide">MỞ NGAY</span>
            </button>
            <p class="text-xs text-slate-400 mt-4">Tổng lượt quay server: ${state.serverInfo.totalPulls}</p>
        </div>
    `;
}

async function doGacha() {
    if(state.coins < GACHA_COST) return showToast("Không đủ xu!", "error");
    playSound('gacha-roll');
    
    const stage = document.getElementById('gacha-stage');
    stage.innerHTML = `<div class="w-48 h-64 bg-indigo-600 rounded-xl flex items-center justify-center animate-bounce-crazy shadow-2xl"><i data-lucide="gift" width="80" class="text-white"></i></div>`;
    lucide.createIcons();

    const res = await apiCall('/api/gacha', {username: state.username});
    
    setTimeout(() => {
        if(res.success) {
            state.coins = res.coins;
            state.serverInfo = res.serverInfo || state.serverInfo;
            state.inventory.unshift(res.item);
            localStorage.setItem('pgw_coins', state.coins);
            localStorage.setItem('pgw_inv', JSON.stringify(state.inventory));
            playSound('gacha-result');
            renderGachaResult(stage, res.item);
            updateUI();
        } else {
            showToast(res.message || "Lỗi Server", "error");
            renderGacha(document.getElementById('main-content'));
        }
    }, 1500);
}

function renderGachaResult(container, item) {
    const conf = BASE_RARITY_CONFIG[item.rarity] || BASE_RARITY_CONFIG.F;
    let glowEffect = ['S','SS','SSS','EX'].includes(item.rarity) ? 'animate-pulse shadow-[0_0_40px_rgba(255,215,0,0.4)] border-yellow-300' : '';

    container.innerHTML = `
        <div class="flex flex-col items-center animate-pop-in w-full px-4 max-h-full overflow-y-auto no-scrollbar pb-6">
            <div class="relative w-64 h-80 md:h-96 transition-transform duration-500 transform-style-3d group cursor-pointer shrink-0">
                <div class="absolute -inset-4 ${conf.bg} opacity-20 blur-xl rounded-full animate-pulse"></div>
                <div class="relative w-full h-full bg-white rounded-2xl border-[4px] ${conf.border} shadow-2xl overflow-hidden flex flex-col ${glowEffect}">
                    <div class="absolute inset-0 ${conf.bg} opacity-10"></div>
                    <div class="relative z-10 flex justify-between items-center p-3">
                         <div class="w-10 h-10 rounded-full ${conf.bg} text-white flex items-center justify-center font-black text-lg shadow-md border-2 border-white">${item.rarity}</div>
                         <div class="bg-black/5 px-2 py-1 rounded text-[10px] font-mono text-slate-500">#${item.uniqueId}</div>
                    </div>
                    <div class="flex-1 flex items-center justify-center z-10 p-4 relative overflow-hidden">
                        ${item.imgUrl 
                            ? `<img src="${item.imgUrl}" class="max-h-full max-w-full object-contain drop-shadow-xl animate-float transition-transform duration-500 group-hover:scale-110">` 
                            : `<span class="text-7xl animate-bounce">🧸</span>`
                        }
                    </div>
                    <div class="relative z-10 bg-white/90 backdrop-blur-sm p-3 text-center border-t border-slate-100">
                        <h3 class="font-black text-base text-slate-800 leading-tight truncate">${item.name}</h3>
                        <p class="text-[10px] ${conf.text} font-bold uppercase tracking-wider">Vật phẩm mới!</p>
                    </div>
                </div>
            </div>

            <div class="mt-6 space-y-2 w-full max-w-xs shrink-0">
                <button onclick="renderApp()" class="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-lg shadow-indigo-200 active:scale-95 transition flex items-center justify-center gap-2">
                    <i data-lucide="check" width="18"></i> Thu Thập
                </button>
                <button onclick="doGacha()" class="w-full py-3 bg-white text-indigo-600 border border-indigo-200 hover:bg-indigo-50 rounded-xl font-bold active:scale-95 transition flex items-center justify-center gap-2">
                    <i data-lucide="rotate-cw" width="18"></i> Quay Tiếp
                </button>
            </div>
        </div>
    `;
    lucide.createIcons();
}

// --- COLLECTION (KHO ĐỒ) ---
function renderCollection(div) {
    let sortedList = [...state.inventory]; 

    if (state.sortMode === 'newest') sortedList.sort((a, b) => (b.obtainedAt || 0) - (a.obtainedAt || 0));
    else if (state.sortMode === 'oldest') sortedList.sort((a, b) => (a.obtainedAt || 0) - (b.obtainedAt || 0));
    else if (state.sortMode === 'rare_high') sortedList.sort((a, b) => (RARITY_WEIGHT[b.rarity] || 0) - (RARITY_WEIGHT[a.rarity] || 0));
    else if (state.sortMode === 'rare_low') sortedList.sort((a, b) => (RARITY_WEIGHT[a.rarity] || 0) - (RARITY_WEIGHT[b.rarity] || 0));

    const sortLabels = {
        'newest': '✨ Mới nhất',
        'oldest': '🕰️ Cũ nhất',
        'rare_high': '💎 Hiếm (EX)',
        'rare_low': '📦 Thường (F)'
    };

    // Hàm nhỏ xử lý chọn sort (được nhúng trực tiếp vào HTML để tránh lỗi scope)
    // Lưu ý: window.handleSortClick phải được định nghĩa hoặc gọi trực tiếp changeSort
    const onSortClick = (mode) => `changeSort('${mode}'); document.getElementById('sort-dropdown').classList.add('hidden');`;

    div.innerHTML = `
        <div class="h-full flex flex-col bg-slate-100">
            <div class="px-4 py-3 border-b bg-white shadow-sm z-20 sticky top-0 flex flex-col gap-2">
                <div class="flex justify-between items-center">
                    <h2 class="font-black text-indigo-600 tracking-wide border-b-[3px] border-indigo-600 inline-block pb-1 shrink-0 text-sm md:text-base">
                        KHO ĐỒ (${state.inventory.length})
                    </h2>
                    
                    <div class="flex gap-2">
                        <button onclick="toggleSelectionMode()" class="px-3 py-2 rounded-xl border font-bold text-xs flex items-center gap-1 transition shadow-sm whitespace-nowrap bg-white border-slate-200 text-slate-600 hover:bg-slate-50">
                            <i data-lucide="${state.isSelectionMode ? 'x' : 'check-square'}" width="16"></i>
                            ${state.isSelectionMode ? 'Hủy' : 'Chọn'}
                        </button>

                        ${!state.isSelectionMode ? `
                        <div class="relative group">
                            <button 
                                onclick="document.getElementById('sort-dropdown').classList.toggle('hidden')" 
                                class="flex items-center gap-2 bg-white px-3 py-2 rounded-xl border border-slate-200 shadow-sm hover:border-indigo-300 transition-all cursor-pointer outline-none focus:ring-2 focus:ring-indigo-100"
                            >
                                <i data-lucide="arrow-up-down" width="14" class="text-indigo-500"></i>
                                <span class="text-xs font-bold text-slate-700 min-w-[70px] text-right truncate">
                                    ${sortLabels[state.sortMode]}
                                </span>
                                <i data-lucide="chevron-down" width="14" class="text-slate-400"></i>
                            </button>
                            
                            <div id="sort-dropdown" class="hidden absolute top-full right-0 mt-2 w-48 bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                                <div class="p-1 flex flex-col gap-0.5">
                                    <button onclick="${onSortClick('newest')}" class="w-full text-left px-3 py-2 rounded-lg text-xs font-bold hover:bg-indigo-50 hover:text-indigo-600 flex items-center gap-2 ${state.sortMode === 'newest' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-600'}">
                                        <span>✨</span> Mới nhất
                                        ${state.sortMode === 'newest' ? '<i data-lucide="check" width="12" class="ml-auto"></i>' : ''}
                                    </button>
                                    <button onclick="${onSortClick('oldest')}" class="w-full text-left px-3 py-2 rounded-lg text-xs font-bold hover:bg-indigo-50 hover:text-indigo-600 flex items-center gap-2 ${state.sortMode === 'oldest' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-600'}">
                                        <span>🕰️</span> Cũ nhất
                                        ${state.sortMode === 'oldest' ? '<i data-lucide="check" width="12" class="ml-auto"></i>' : ''}
                                    </button>
                                    <div class="h-px bg-slate-100 my-0.5"></div>
                                    <button onclick="${onSortClick('rare_high')}" class="w-full text-left px-3 py-2 rounded-lg text-xs font-bold hover:bg-indigo-50 hover:text-indigo-600 flex items-center gap-2 ${state.sortMode === 'rare_high' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-600'}">
                                        <span>💎</span> Hiếm (EX)
                                        ${state.sortMode === 'rare_high' ? '<i data-lucide="check" width="12" class="ml-auto"></i>' : ''}
                                    </button>
                                    <button onclick="${onSortClick('rare_low')}" class="w-full text-left px-3 py-2 rounded-lg text-xs font-bold hover:bg-indigo-50 hover:text-indigo-600 flex items-center gap-2 ${state.sortMode === 'rare_low' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-600'}">
                                        <span>📦</span> Thường (F)
                                        ${state.sortMode === 'rare_low' ? '<i data-lucide="check" width="12" class="ml-auto"></i>' : ''}
                                    </button>
                                </div>
                                <div onclick="document.getElementById('sort-dropdown').classList.add('hidden')" class="fixed inset-0 z-[-1] cursor-default"></div>
                            </div>
                        </div>` : ''}
                    </div>
                </div>

                ${state.isSelectionMode ? `
                <div class="flex justify-between items-center bg-red-50 p-2 rounded-lg border border-red-100 animate-slide-down shadow-inner">
                    <span class="text-xs font-bold text-red-600 ml-1 flex items-center gap-1"><i data-lucide="check-circle" width="14"></i> Chọn: ${state.selectedItems.length}</span>
                    <div class="flex gap-2">
                        <button onclick="selectAll()" class="px-3 py-1.5 bg-white border border-red-200 text-red-600 text-xs font-bold rounded-lg hover:bg-red-50">Tất cả</button>
                        <button onclick="executeBulkBurn()" class="px-3 py-1.5 bg-red-600 text-white text-xs font-bold rounded-lg shadow-md hover:bg-red-700 disabled:opacity-50" ${state.selectedItems.length === 0 ? 'disabled' : ''}>
                            Đốt Ngay
                        </button>
                    </div>
                </div>
                ` : ''}
            </div>

            <div class="flex-1 overflow-y-auto p-4 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 no-scrollbar pb-20 z-0">
                ${sortedList.length === 0 ? `<div class="col-span-full text-center text-slate-400 mt-10 flex flex-col items-center"><i data-lucide="box" width="48" class="mb-2 opacity-50"></i>Túi đồ trống trơn.</div>` : ''}
                
                ${sortedList.map(item => {
                    const conf = BASE_RARITY_CONFIG[item.rarity] || BASE_RARITY_CONFIG.F;
                    const imgContent = item.imgUrl 
                        ? `<img src="${item.imgUrl}" class="absolute inset-0 w-full h-full object-contain p-2 transition duration-300 hover:scale-110">` 
                        : `<div class="absolute inset-0 flex items-center justify-center"><span class="text-4xl">🧸</span></div>`;
                    
                    const isSelected = state.selectedItems.includes(item.uniqueId);
                    
                    const clickAction = state.isSelectionMode 
                        ? `toggleItemSelect('${item.uniqueId}')` 
                        : `itemDetail('${item.uniqueId}')`;

                    const wrapperClass = state.isSelectionMode && isSelected 
                        ? 'ring-2 ring-red-500 border-red-500 bg-red-50' 
                        : `bg-white border-2 ${conf.border}`;

                    return `
                        <div onclick="${clickAction}" class="relative h-64 rounded-xl cursor-pointer shadow-sm hover:shadow-lg transition-all duration-200 overflow-hidden flex flex-col ${wrapperClass}">
                            ${state.isSelectionMode ? `
                                <div class="absolute top-2 right-2 z-30 w-6 h-6 rounded-full border-2 border-white shadow-sm flex items-center justify-center transition-colors ${isSelected ? 'bg-red-500' : 'bg-white'}">
                                    ${isSelected ? '<i data-lucide="check" width="14" class="text-white"></i>' : ''}
                                </div>
                            ` : ''}
                            <div class="flex-1 w-full bg-slate-50 relative overflow-hidden border-b border-slate-100">
                                <div class="absolute inset-0 opacity-20 pointer-events-none ${conf.bg}"></div>
                                <div class="absolute top-2 left-2 z-20">
                                    <span class="px-2 py-0.5 rounded text-[10px] font-black shadow-sm ${conf.bg} text-white border border-white/20 uppercase">${item.rarity}</span>
                                </div>
                                <div class="relative w-full h-full z-10">${imgContent}</div>
                            </div>
                            <div class="h-16 w-full flex-none bg-white flex flex-col justify-center items-center px-2 z-20">
                                <div class="font-bold text-xs text-slate-800 line-clamp-2 text-center leading-tight mb-1" title="${item.name}">${item.name}</div>
                                <div class="text-[9px] text-slate-400 font-mono bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">#${item.uniqueId}</div>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;
    
    lucide.createIcons();
    
    if (!window.sortMenuListenerAdded) {
        window.addEventListener('click', (e) => {
            const dropdown = document.getElementById('sort-dropdown');
            const button = e.target.closest('button[onclick*="sort-dropdown"]');
            if (dropdown && !dropdown.classList.contains('hidden') && !button && !dropdown.contains(e.target)) {
                dropdown.classList.add('hidden');
            }
        });
        window.sortMenuListenerAdded = true;
    }
}

function itemDetail(uid) {
    const item = state.inventory.find(i => i.uniqueId === uid);
    if(!item) return;
    const conf = BASE_RARITY_CONFIG[item.rarity] || BASE_RARITY_CONFIG.F;

    const modal = document.createElement('div');
    modal.className = "fixed inset-0 bg-black/80 z-[200] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in";
    modal.innerHTML = `
        <div id="detail-modal-content" class="bg-white w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl relative animate-slide-up flex flex-col">
            <div class="h-24 ${conf.bg} relative w-full">
                <button onclick="this.closest('.fixed').remove()" class="absolute top-3 right-3 p-2 bg-black/20 hover:bg-black/40 text-white rounded-full transition z-50 cursor-pointer">
                    <i data-lucide="x" width="18"></i>
                </button>
            </div>
            <div class="px-6 pb-8 -mt-12 flex flex-col items-center relative z-10 w-full">
                <div class="w-24 h-24 bg-white p-1 rounded-2xl shadow-lg border-4 ${conf.border} flex items-center justify-center mb-4 overflow-hidden">
                     ${item.imgUrl ? `<img src="${item.imgUrl}" class="w-full h-full object-cover">` : '<span class="text-4xl">🧸</span>'}
                </div>
                <h3 class="text-2xl font-black text-slate-800 leading-tight mb-2 text-center">${item.name}</h3>
                <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 border border-slate-200 mb-6">
                    <span class="font-black ${conf.text}">${item.rarity}</span>
                    <span class="w-1 h-1 rounded-full bg-slate-400"></span>
                    <span class="font-mono text-xs text-slate-500">#${uid}</span>
                </div>
                <div class="w-full space-y-3">
                    <button onclick="burnItem('${uid}')" class="w-full py-3.5 bg-gradient-to-r from-red-500 to-orange-600 text-white rounded-xl font-bold shadow-lg shadow-red-200 active:scale-95 transition flex items-center justify-center gap-2 group">
                        <i data-lucide="flame" class="group-hover:fill-white transition"></i> 
                        ${item.rarity === 'EX' ? 'ĐỐT SIÊU PHẨM EX' : 'ĐỐT LẤY CODE'}
                    </button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    lucide.createIcons();
}

// --- BURN ---

async function burnItem(uid) {
    if(!confirm("Bạn chắc chắn muốn ĐỐT vật phẩm này?")) return;
    
    const content = document.getElementById('detail-modal-content');
    content.innerHTML = `<div class="p-10 flex flex-col items-center justify-center h-64"><i data-lucide="loader-2" class="animate-spin text-indigo-600 mb-4" width="40"></i><p class="font-bold text-slate-500">Đang xử lý...</p></div>`;
    lucide.createIcons();

    const res = await apiCall('/api/burn', {username: state.username, uniqueId: uid});
    
    if(res.success) {
        state.inventory = state.inventory.filter(i => i.uniqueId !== uid);
        content.innerHTML = `
            <div class="bg-gradient-to-br from-slate-900 to-slate-800 p-8 flex flex-col items-center text-center h-full relative overflow-hidden">
                <button onclick="this.closest('.fixed').remove(); renderCollection(document.getElementById('main-content'))" class="absolute top-4 right-4 text-slate-500 hover:text-white"><i data-lucide="x"></i></button>
                <div class="w-16 h-16 bg-red-500/20 text-red-500 rounded-full flex items-center justify-center mb-4 animate-bounce">
                    <i data-lucide="flame" width="32" class="fill-current"></i>
                </div>
                <h2 class="text-xl font-black text-white mb-1">Đốt Thành Công!</h2>
                <p class="text-xs text-slate-400 mb-6">Vật phẩm đã bị hủy. Đây là mã quà tặng của bạn:</p>
                <div class="w-full bg-black/30 border border-white/10 p-4 rounded-xl flex items-center justify-between gap-2 mb-6 group cursor-pointer hover:bg-black/50 transition" onclick="navigator.clipboard.writeText('${res.code}'); showToast('Đã sao chép!', 'success')">
                    <div class="font-mono text-lg font-bold text-yellow-400 tracking-wider truncate select-all">${res.code}</div>
                    <i data-lucide="copy" width="16" class="text-slate-500 group-hover:text-white transition"></i>
                </div>
                <button onclick="this.closest('.fixed').remove(); renderCollection(document.getElementById('main-content'))" class="w-full py-3 bg-white text-slate-900 font-bold rounded-xl hover:bg-slate-200 transition">
                    Xong
                </button>
            </div>
        `;
        lucide.createIcons();
    } else {
        showToast("Lỗi hệ thống! Không thể đốt.", "error");
        this.closest('.fixed').remove();
    }
}

// --- BURN BATCH ---

function toggleSelectionMode() {
    state.isSelectionMode = !state.isSelectionMode;
    state.selectedItems = [];
    renderCollection(document.getElementById('main-content'));
}

function toggleItemSelect(uid) {
    if (state.selectedItems.includes(uid)) {
        state.selectedItems = state.selectedItems.filter(id => id !== uid);
    } else {
        state.selectedItems.push(uid);
    }
    renderCollection(document.getElementById('main-content'));
}

function selectAll() {
    if (state.selectedItems.length === state.inventory.length) {
        state.selectedItems = [];
    } else {
        state.selectedItems = state.inventory.map(i => i.uniqueId);
    }
    renderCollection(document.getElementById('main-content'));
}

async function executeBulkBurn() {
    if (state.selectedItems.length === 0) return;
    
    if (!confirm(`CẢNH BÁO: Bạn có chắc muốn đốt ${state.selectedItems.length} vật phẩm này không? Hành động không thể hoàn tác!`)) return;

    const div = document.getElementById('main-content');
    div.innerHTML = `<div class="flex flex-col items-center justify-center h-full"><i data-lucide="loader-2" class="animate-spin text-red-600 mb-4" width="48"></i><p class="font-bold text-slate-600">Đang thiêu hủy...</p></div>`;
    lucide.createIcons();

    const res = await apiCall('/api/burn-batch', {
        username: state.username,
        uniqueIds: state.selectedItems
    });

    if (res.success) {
        state.inventory = state.inventory.filter(i => !state.selectedItems.includes(i.uniqueId));
        state.isSelectionMode = false;
        state.selectedItems = [];

        showBulkBurnResult(res.codes);
    } else {
        showToast(res.message || "Lỗi khi đốt vật phẩm", "error");
        renderCollection(document.getElementById('main-content'));
    }
}

function showBulkBurnResult(codes) {
    const modal = document.createElement('div');
    modal.className = "fixed inset-0 bg-black/90 z-[200] flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in";
    
    const codesHtml = codes.map(c => `
        <div class="bg-slate-800 p-3 rounded-lg border border-slate-700 flex justify-between items-center gap-2 group cursor-pointer hover:bg-slate-700" onclick="navigator.clipboard.writeText('${c}'); showToast('Copied!', 'success')">
            <span class="font-mono text-yellow-400 font-bold text-sm truncate select-all">${c}</span>
            <i data-lucide="copy" width="14" class="text-slate-500 group-hover:text-white"></i>
        </div>
    `).join('');

    modal.innerHTML = `
        <div class="bg-slate-900 w-full max-w-md rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[80vh]">
            <div class="p-6 border-b border-slate-800 text-center">
                <div class="w-16 h-16 bg-red-500/20 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4 animate-bounce">
                    <i data-lucide="flame" width="32"></i>
                </div>
                <h2 class="text-2xl font-black text-white">Đốt Thành Công!</h2>
                <p class="text-slate-400 text-sm mt-1">Đã nhận được ${codes.length} mã quà tặng.</p>
            </div>
            
            <div class="flex-1 overflow-y-auto p-4 space-y-2 bg-black/20">
                ${codesHtml}
            </div>

            <div class="p-4 border-t border-slate-800">
                <button onclick="this.closest('.fixed').remove(); renderCollection(document.getElementById('main-content'))" class="w-full py-3 bg-white text-slate-900 font-bold rounded-xl hover:bg-slate-200 transition">
                    Xác Nhận & Đóng
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    lucide.createIcons();
    playSound('gacha-result');
}

// --- EXCHANGE TAB ---
function renderExchange(div) {
    div.innerHTML = `
        <div class="p-4 space-y-6 h-full overflow-y-auto bg-slate-50">
            <div class="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 max-w-lg mx-auto mt-4">
                <div class="flex items-center gap-3 mb-6">
                    <div class="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center"><i data-lucide="gift"></i></div>
                    <div><h2 class="text-xl font-black text-slate-800 leading-none">Nhập Code Quà Tặng</h2></div>
                </div>
                <input id="import-input" type="text" placeholder="Ví dụ: PIL-1-E-A1B2C3" class="w-full p-4 border-2 border-slate-200 rounded-xl mb-4 uppercase font-mono font-bold tracking-wider focus:border-indigo-500 outline-none text-center bg-slate-50">
                <button onclick="handleImport()" class="w-full bg-indigo-600 text-white py-4 rounded-xl font-black shadow-lg hover:bg-indigo-700 transition">Xác Nhận</button>
            </div>
        </div>
    `;
}

async function handleImport() {
    const input = document.getElementById('import-input');
    const code = input.value.trim();
    if(!code) return showToast("Vui lòng nhập code", "error");
    
    const btn = document.querySelector('#import-input + button');
    const originalText = btn.innerText;
    btn.innerText = "Đang kiểm tra...";
    btn.disabled = true;

    try {
        const res = await apiCall('/api/exchange', {username: state.username, code: code});
        
        if(res.success) {
            state.inventory.unshift(res.item);
            showToast(`Thành công! Bạn nhận được: ${res.item.name}`, 'success');
            input.value = '';
            
            const stage = document.getElementById('exchange-result-area') || document.body;
            playSound('gacha-result');
        } else {
            showToast(res.message || "Lỗi khi nhập mã", 'error');
        }
    } catch (e) {
        showToast("Lỗi kết nối server", "error");
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
}

// --- GAMES HUB & LOGIC ---
function renderGamesHub(div) {
    div.innerHTML = `
        <div class="p-4 h-full overflow-y-auto bg-slate-50 pb-20">
            <div class="text-center mb-6 mt-4">
                <h2 class="text-2xl font-black text-slate-800">Khu Vui Chơi</h2>
                <p class="text-sm text-slate-500 font-bold mt-1">Chơi game kiếm xu hoặc thử vận may!</p>
            </div>
            <div class="grid grid-cols-2 gap-4">
                <button onclick="launchGame('flappy')" class="bg-gradient-to-br from-blue-400 to-blue-600 text-white p-6 rounded-2xl shadow-lg flex flex-col items-center justify-center gap-3 active:scale-95 transition">
                    <span class="text-4xl drop-shadow-md">🐦</span><span class="font-black tracking-wide">Flappy Bird</span>
                </button>
                <button onclick="launchGame('race')" class="bg-gradient-to-br from-orange-400 to-orange-600 text-white p-6 rounded-2xl shadow-lg flex flex-col items-center justify-center gap-3 active:scale-95 transition">
                    <i data-lucide="mouse-pointer-click" class="w-10 h-10 drop-shadow-md"></i><span class="font-black tracking-wide">Turbo Click</span>
                </button>
                <button onclick="launchGame('taixiu')" class="bg-gradient-to-br from-green-500 to-green-700 text-white p-6 rounded-2xl shadow-lg flex flex-col items-center justify-center gap-3 active:scale-95 transition">
                    <i data-lucide="dice-5" class="w-10 h-10 drop-shadow-md"></i><span class="font-black tracking-wide">Tài Xỉu</span>
                </button>
                <button onclick="launchGame('baucua')" class="bg-gradient-to-br from-red-500 to-red-800 text-white p-6 rounded-2xl shadow-lg flex flex-col items-center justify-center gap-3 active:scale-95 transition">
                    <i data-lucide="gamepad-2" class="w-10 h-10 drop-shadow-md"></i><span class="font-black tracking-wide">Bầu Cua</span>
                </button>
            </div>
        </div>
    `;
}

function launchGame(gameId) {
    state.activeGame = gameId;
    const content = document.getElementById('main-content');
    content.innerHTML = `
        <div class="h-full relative bg-slate-900 overflow-hidden">
            <button onclick="exitGame()" class="absolute top-4 left-4 z-[60] bg-white/20 hover:bg-white/40 text-white p-2 rounded-full backdrop-blur transition"><i data-lucide="arrow-left"></i></button>
            <div id="game-canvas-container" class="h-full w-full"></div>
        </div>
    `;
    const gc = document.getElementById('game-canvas-container');
    if(gameId === 'flappy') initFlappy(gc);
    if(gameId === 'race') initRace(gc);
    if(gameId === 'taixiu') initTaiXiu(gc);
    if(gameId === 'baucua') initBauCua(gc);
    lucide.createIcons();
}

function exitGame() {
    cleanupGames();
    state.activeGame = null;
    renderApp();
}

// 1. FLAPPY BIRD
function initFlappy(container) {
    container.innerHTML = `
        <div class="flex flex-col items-center justify-center h-full text-white">
            <h3 class="mb-4 font-black text-2xl tracking-widest drop-shadow">FLAPPY BIRD</h3>
            <div class="relative shadow-[0_0_30px_rgba(0,0,0,0.5)] rounded-lg overflow-hidden border-4 border-slate-700">
                <canvas id="flappy-cvs" width="300" height="400" class="bg-[#70c5ce]"></canvas>
                <div id="flappy-ui" class="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm">
                    <p id="flappy-msg" class="text-xl font-bold mb-4 text-center">Nhấn để nhảy!</p>
                    <button id="flappy-btn" class="px-8 py-3 bg-yellow-400 text-black rounded-xl font-black text-xl shadow-lg">CHƠI</button>
                </div>
            </div>
            <div class="mt-4 flex gap-4">
                <div class="bg-slate-800 px-6 py-2 rounded-full font-black text-xl shadow-inner text-yellow-400 border border-slate-600">
                    Điểm: <span id="flappy-score">0</span>
                </div>
                <div class="bg-green-800 px-6 py-2 rounded-full font-black text-xl shadow-inner text-white border border-green-600">
                    +<span id="flappy-earned">0</span> Xu
                </div>
            </div>
        </div>
    `;

    const cvs = document.getElementById('flappy-cvs');
    const ctx = cvs.getContext('2d');
    const ui = document.getElementById('flappy-ui');
    const btn = document.getElementById('flappy-btn');
    const scoreEl = document.getElementById('flappy-score');
    const earnedEl = document.getElementById('flappy-earned');
    
    let birdY = 150, velocity = 0, pipes = [], frame = 0, score = 0, playing = false;
    let activeAnimFrame;
    const gravity = 0.25, jump = -4.5;
    const MAX_SCORE = 100;
    
    let lastTime = 0;
    const FPS = 60;
    const FRAME_INTERVAL = 1000 / FPS;

    function reset() { 
        birdY = 150; velocity = 0; pipes = []; frame = 0; score = 0; 
        scoreEl.innerText = 0; 
        earnedEl.innerText = 0;
        lastTime = performance.now();
    }
    
    function loop(currentTime) {
        if(!playing) return;
        
        activeAnimFrame = requestAnimationFrame(loop);
        if(!document.getElementById('flappy-cvs')) { playing = false; return; }

        const deltaTime = currentTime - lastTime;
        if (deltaTime < FRAME_INTERVAL) return;
        lastTime = currentTime - (deltaTime % FRAME_INTERVAL);

        velocity += gravity; birdY += velocity;
        
        frame++;

        if(frame % 100 === 0) {
            pipes.push({ 
                x: cvs.width, 
                gap: 110, 
                top: Math.random() * (cvs.height - 180) + 20,
                passed: false
            });
        }
        
        ctx.fillStyle = '#70c5ce'; ctx.fillRect(0,0,cvs.width,cvs.height);
        
        ctx.font = '30px Arial'; 
        ctx.fillText('🐦', 50, birdY + 25); 

        pipes.forEach(p => {
            p.x -= 2; 
            ctx.fillStyle = "#73bf2e";
            ctx.fillRect(p.x, 0, 40, p.top); 
            ctx.strokeRect(p.x, 0, 40, p.top);
            ctx.fillRect(p.x, p.top + p.gap, 40, cvs.height - (p.top + p.gap));
            ctx.strokeRect(p.x, p.top + p.gap, 40, cvs.height - (p.top + p.gap));

            if (!p.passed && p.x < 10) {
                p.passed = true;
                score++;
                scoreEl.innerText = score;
                earnedEl.innerText = score;

                if (typeof state !== 'undefined') {
                    state.coins += 1;
                }
                
                if (typeof playSound === 'function') playSound('score');
            }
        });

        if(pipes.length && pipes[0].x < -50) { pipes.shift(); }
        
        if(score >= MAX_SCORE) { endGame(true, score); return; }

        let crash = false;
        if(birdY > cvs.height - 30 || birdY < -20) crash = true;
        
        pipes.forEach(p => { 
            if ((50 + 20 > p.x && 50 + 5 < p.x + 40) && (birdY + 5 < p.top || birdY + 20 > p.top + p.gap)) crash = true; 
        });
        
        if(crash) { endGame(false, score); return; }
    }

    async function endGame(win, earned) {
        playing = false;
        cancelAnimationFrame(activeAnimFrame);
        
        if(earned > 0) {
            if (typeof apiCall === 'function') {
                try {
                    await apiCall('/api/update-coins', {
                        username: state.username, 
                        amount: earned
                    });
                    showToast(`Kết thúc! Đã lưu +${earned} Xu vào túi.`, 'success');
                } catch (e) {
                    showToast('Lỗi mạng! Không lưu được xu.', 'error');
                    state.coins -= earned;
                }
            }
        }
        
        if (typeof playSound === 'function') playSound('gacha-result');
        
        document.getElementById('flappy-msg').innerHTML = win ? "CHIẾN THẮNG!" : `Game Over! Tổng: ${score} Xu`;
        btn.innerText = "CHƠI LẠI";
        ui.classList.remove('hidden');
    }

    btn.onclick = () => { 
        reset(); 
        playing = true; 
        ui.classList.add('hidden'); 
        requestAnimationFrame(loop); 
    };

    const jumpAction = (e) => { 
        e.preventDefault(); 
        if(playing) {
            velocity = jump; 
            if (typeof playSound === 'function') playSound('click'); 
        }
    };
    cvs.addEventListener('mousedown', jumpAction); 
    cvs.addEventListener('touchstart', jumpAction);
}

// 2. TURBO CLICK
function initRace(container) {
    container.innerHTML = `
        <div class="flex flex-col items-center justify-center h-full text-white p-4">
            <h3 class="font-black text-3xl tracking-widest mb-2 drop-shadow">TURBO CLICK</h3>
            <div id="race-menu"><button onclick="startRace()" class="bg-green-500 px-10 py-5 rounded-2xl text-2xl font-black shadow-[0_8px_0_#166534] active:translate-y-2 border border-green-400">BẮT ĐẦU</button></div>
            <button id="race-tap" class="hidden w-56 h-56 rounded-full bg-gradient-to-tr from-orange-600 to-yellow-400 text-white text-5xl font-black shadow-[0_0_50px_rgba(245,158,11,0.6)] active:scale-95 transition-transform border-8 border-white border-opacity-20">TAP!</button>
            <div id="race-result" class="hidden text-center bg-slate-800 p-8 rounded-2xl border border-slate-700 w-full max-w-sm">
                <h2 class="text-4xl font-black text-yellow-400 mb-2">Hết Giờ!</h2>
                <p class="text-2xl font-bold mb-2">Số Click: <span id="race-final" class="text-white">0</span></p>
                <p class="text-green-400 font-black text-xl mb-6 bg-slate-900 py-2 rounded-lg border border-slate-700">Nhận: +<span id="race-earned">0</span> Xu</p>
                <button onclick="exitGame()" class="w-full py-4 bg-blue-600 rounded-xl font-bold text-lg shadow-lg">Thoát</button>
            </div>
            <div class="mt-12 bg-slate-800 px-6 py-3 rounded-2xl text-xl font-black tracking-wider border border-slate-700 shadow-inner"><span class="text-slate-400">THỜI GIAN:</span> <span id="race-time" class="text-red-400">10</span>s <br><span class="text-slate-400">CLICK:</span> <span id="race-clicks" class="text-blue-400">0</span></div>
        </div>
    `;
    window.startRace = () => {
        if (activeInterval) clearInterval(activeInterval);
        let time = 10; let clicks = 0;
        document.getElementById('race-menu').classList.add('hidden');
        document.getElementById('race-tap').classList.remove('hidden');
        document.getElementById('race-time').innerText = time;
        const tapBtn = document.getElementById('race-tap');
        tapBtn.onclick = () => { clicks++; document.getElementById('race-clicks').innerText = clicks; playSound('click'); };
        
        activeInterval = setInterval(async () => {
            const timeEl = document.getElementById('race-time');
            if (!timeEl) { clearInterval(activeInterval); return; }
            time--; timeEl.innerText = time;
            if(time <= 0) {
                clearInterval(activeInterval);
                tapBtn.classList.add('hidden');
                document.getElementById('race-result').classList.remove('hidden');
                document.getElementById('race-final').innerText = clicks;
                const earned = Math.floor(clicks/5);
                document.getElementById('race-earned').innerText = earned;
                if(earned > 0) {
                    await apiCall('/api/update-coins', {username: state.username, amount: earned});
                    state.coins += earned;
                    showToast(`+${earned} Xu`, 'success');
                    playSound('gacha-result');
                }
            }
        }, 500);
    };
}

// 3. TAI XIU
function initTaiXiu(container) {
    container.innerHTML = `
        <div class="flex flex-col items-center p-4 text-white h-full justify-center">
            <h3 class="text-3xl font-black mb-8 tracking-widest drop-shadow text-yellow-400">TÀI XỈU</h3>
            <div class="flex gap-4 mb-8 bg-slate-800 p-6 rounded-3xl shadow-inner border border-slate-700">
                <div id="d1" class="w-16 h-16 bg-white text-black text-3xl font-black flex items-center justify-center rounded-xl">1</div>
                <div id="d2" class="w-16 h-16 bg-white text-black text-3xl font-black flex items-center justify-center rounded-xl">1</div>
                <div id="d3" class="w-16 h-16 bg-white text-black text-3xl font-black flex items-center justify-center rounded-xl">1</div>
            </div>
            <div id="tx-sum" class="text-3xl font-black mb-8 text-white bg-slate-800 px-6 py-2 rounded-full border border-slate-700">Tổng: ?</div>
            <div class="flex gap-4 w-full max-w-sm mb-6">
                <button onclick="selectTx('XIU')" id="btn-xiu" class="flex-1 py-5 rounded-2xl font-black text-2xl border-4 bg-slate-800 border-slate-700 text-slate-300 transition">XỈU</button>
                <button onclick="selectTx('TAI')" id="btn-tai" class="flex-1 py-5 rounded-2xl font-black text-2xl border-4 bg-slate-800 border-slate-700 text-slate-300 transition">TÀI</button>
            </div>
            <div class="w-full max-w-sm bg-slate-800 p-4 rounded-2xl border border-slate-700">
                <div class="flex gap-2">
                    <input id="tx-bet" type="number" class="flex-1 text-black p-3 rounded-xl font-bold text-center outline-none" placeholder="Nhập Xu Cược">
                    <button id="tx-roll" onclick="rollTx()" class="px-6 bg-gradient-to-r from-yellow-400 to-orange-500 rounded-xl font-black text-lg shadow-lg text-black">QUAY</button>
                </div>
            </div>
        </div>
    `;
    let choice = null;
    window.selectTx = (c) => {
        choice = c; playSound('click');
        document.getElementById('btn-xiu').className = `flex-1 py-5 rounded-2xl font-black text-2xl border-4 transition ${c === 'XIU' ? 'bg-red-500 border-red-400 text-white' : 'bg-slate-800 border-slate-700 text-slate-400'}`;
        document.getElementById('btn-tai').className = `flex-1 py-5 rounded-2xl font-black text-2xl border-4 transition ${c === 'TAI' ? 'bg-blue-500 border-blue-400 text-white' : 'bg-slate-800 border-slate-700 text-slate-400'}`;
    };
    window.rollTx = async () => {
        const bet = parseInt(document.getElementById('tx-bet').value) || 0;
        if(bet <= 0 || bet > state.coins) { showToast("Cược lỗi!", "error"); return; }
        if(!choice) { showToast("Chọn TÀI/XỈU đi!", "error"); return; }
        
        await apiCall('/api/update-coins', {username: state.username, amount: -bet});
        state.coins -= bet; updateUI();

        document.getElementById('tx-roll').disabled = true;
        [1,2,3].forEach(i => document.getElementById(`d${i}`).classList.add('animate-spin'));
        playSound('gacha-roll');
        
        activeTimeout = setTimeout(async () => {
            if (!document.getElementById('tx-sum')) return;
            const d = [1,2,3].map(() => Math.ceil(Math.random()*6));
            d.forEach((v, i) => { const el = document.getElementById(`d${i+1}`); el.innerText = v; el.classList.remove('animate-spin'); });
            
            const sum = d.reduce((a,b)=>a+b,0);
            document.getElementById('tx-sum').innerText = `Tổng: ${sum}`;
            const res = sum >= 11 ? 'TAI' : 'XIU';
            
            if(res === choice) { 
                const won = bet * 2;
                await apiCall('/api/update-coins', {username: state.username, amount: won});
                state.coins += won; updateUI();
                showToast(`THẮNG! +${won} Xu`, "success"); playSound('gacha-result'); 
            } else { showToast("Thua rồi!", "error"); }
            document.getElementById('tx-roll').disabled = false;
        }, 500);
    };
}

// 4. BAU CUA
function initBauCua(container) {
    const SYMBOLS = ["🦌", "🎃", "🐓", "🐟", "🦀", "🦐"];
    let bets = [0,0,0,0,0,0];
    container.innerHTML = `
        <div class="flex flex-col items-center p-4 text-white h-full justify-start pt-12 overflow-y-auto pb-20 no-scrollbar">
            <h3 class="text-3xl font-black mb-6 tracking-widest drop-shadow text-yellow-400">BẦU CUA</h3>
            <div class="flex gap-3 mb-6 bg-slate-800 p-4 rounded-3xl shadow-inner border border-slate-700">
                <div id="bc-r1" class="text-5xl w-20 h-20 bg-white flex items-center justify-center rounded-2xl text-black">?</div>
                <div id="bc-r2" class="text-5xl w-20 h-20 bg-white flex items-center justify-center rounded-2xl text-black">?</div>
                <div id="bc-r3" class="text-5xl w-20 h-20 bg-white flex items-center justify-center rounded-2xl text-black">?</div>
            </div>
            <div class="grid grid-cols-3 gap-3 w-full max-w-sm mb-6">
                ${SYMBOLS.map((s, i) => `<button onclick="betBauCua(${i})" class="relative flex flex-col items-center justify-center bg-slate-800 border-2 border-slate-700 text-white rounded-2xl h-24 active:scale-95 transition"><span class="text-4xl">${s}</span><div class="absolute bottom-1 bg-black/50 px-2 rounded-full text-xs text-yellow-400 font-bold" id="bc-bet-${i}">0</div></button>`).join('')}
            </div>
            <button id="bc-roll" onclick="playBauCua()" class="w-full max-w-sm bg-gradient-to-r from-red-500 to-red-700 text-white font-black text-2xl py-4 rounded-2xl shadow-lg border border-red-400">XÓC ĐĨA</button>
        </div>
    `;
    window.betBauCua = async (idx) => {
        if(state.coins >= 10) { 
            await apiCall('/api/update-coins', {username: state.username, amount: -10});
            state.coins -= 10; updateUI();
            bets[idx] += 10; 
            document.getElementById(`bc-bet-${idx}`).innerText = bets[idx]; 
            playSound('click'); 
        } else { showToast("Hết xu!", "error"); }
    };
    window.playBauCua = () => {
        if(bets.every(b => b === 0)) return showToast("Đặt cược đi!", "error");
        const rollBtn = document.getElementById('bc-roll');
        rollBtn.disabled = true; 
        [1,2,3].forEach(i => document.getElementById(`bc-r${i}`).classList.add('animate-spin'));
        playSound('gacha-roll');
        
        activeTimeout = setTimeout(async () => {
            if (!document.getElementById('bc-roll')) return;
            const r = [0,1,2].map(() => Math.floor(Math.random()*6));
            r.forEach((v, i) => { const el = document.getElementById(`bc-r${i+1}`); el.innerText = SYMBOLS[v]; el.classList.remove('animate-spin'); });
            
            const matches = [0,0,0,0,0,0]; r.forEach(idx => matches[idx]++);
            let win = 0; 
            bets.forEach((amt, idx) => { if(amt > 0 && matches[idx] > 0) win += amt + (amt * matches[idx]); });
            
            if(win > 0) { 
                await apiCall('/api/update-coins', {username: state.username, amount: win});
                state.coins += win; updateUI();
                showToast(`Trúng! +${win} Xu`, "success"); playSound('gacha-result'); 
            } else { showToast("Thua!", "error"); }
            
            bets = [0,0,0,0,0,0]; for(let i=0; i<6; i++) document.getElementById(`bc-bet-${i}`).innerText = 0;
            rollBtn.disabled = false;
        }, 500);
    };
}


// --- ADMIN SYSTEM (FULL FEATURED) ---
async function renderAdmin(div) {
    let res = [];
    try {
        const response = await fetch('/api/pillows');
        res = await response.json();
        if(!Array.isArray(res)) res = [];
    } catch (e) {
        console.error("Lỗi lấy danh sách gối:", e);
        res = [];
    }
    
    div.innerHTML = `
        <div class="h-full flex flex-col bg-slate-100">
            <div class="p-4 bg-white shadow-sm flex flex-col gap-2 z-10 sticky top-0">
                <div class="flex justify-between items-center">
                    <div class="font-black text-slate-800 flex items-center gap-2"><i data-lucide="shield-check" class="text-indigo-600"></i> Quản Trị</div>
                    <div class="flex gap-2">
                        <button onclick="state.adminTab='list'; state.editingPillowId=null; renderAdmin(document.getElementById('main-content'))" class="px-3 py-1 rounded text-sm ${state.adminTab==='list'?'bg-indigo-100 text-indigo-700':'text-slate-400'}">List</button>
                        <button onclick="state.adminTab='add'; state.editingPillowId=null; renderAdmin(document.getElementById('main-content'))" class="px-3 py-1 rounded text-sm ${state.adminTab==='add'?'bg-indigo-100 text-indigo-700':'text-slate-400'}">Add/Edit</button>
                    </div>
                </div>
                <div class="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-2 rounded border border-slate-200 flex justify-between">
                    <span>Total Pulls: ${state.serverInfo?.totalPulls || 0}</span>
                    <span>Pity: ${state.serverInfo?.pityCounter || 0}</span>
                </div>
            </div>
            <div class="flex-1 overflow-y-auto p-4 space-y-3 no-scrollbar">
                ${state.adminTab === 'add' ? await renderAdminAddForm(res) : renderAdminList(res)}
            </div>
        </div>
    `;
    lucide.createIcons();
    
    if(state.adminTab === 'add' && state.editingPillowId) {
        const p = res.find(x => x.id === state.editingPillowId);
        if(p) {
            document.getElementById('ad-name').value = p.name;
            document.getElementById('ad-img').value = p.imgUrl || "";
            document.getElementById('ad-note').value = p.note || "";
            document.getElementById('ad-ex').checked = p.allowEx;
            document.getElementById('ad-ex-qty').value = p.exQty || 0;
            toggleExQtyInput(p.allowEx);
        }
    }
}

function renderAdminList(pillows) {
    if(pillows.length === 0) return '<div class="text-center text-slate-400 mt-10">Chưa có gối nào</div>';
    return pillows.map(p => `
        <div onclick="editPillow(${p.id})" class="bg-white p-3 rounded-xl flex gap-3 items-center shadow-sm border border-slate-200 cursor-pointer active:scale-95 transition">
            <div class="w-12 h-12 bg-slate-100 rounded-lg overflow-hidden flex-shrink-0">
                ${p.imgUrl ? `<img src="${p.imgUrl}" class="w-full h-full object-cover">` : ''}
            </div>
            <div class="flex-1 min-w-0">
                <p class="font-bold text-sm truncate text-slate-800">${p.name}</p>
                <p class="text-[10px] text-slate-500 truncate">ID: ${p.id} | EX: ${p.allowEx}</p>
            </div>
            <button onclick="event.stopPropagation(); deletePillow(${p.id})" class="p-2 bg-red-50 text-red-500 rounded-lg hover:bg-red-100"><i data-lucide="trash-2" width="16"></i></button>
        </div>
    `).join('');
}

async function renderAdminAddForm() {
    return `
        <div class="bg-white p-5 rounded-2xl shadow-sm border border-slate-200">
            <h3 class="font-black mb-4 text-slate-800">${state.editingPillowId ? 'Sửa Gối' : 'Thêm Gối Mới'}</h3>
            <form onsubmit="handleAddPillow(event)" class="space-y-4">
                <div>
                    <label class="block text-[10px] font-bold text-slate-500 mb-1">TÊN GỐI</label>
                    <input id="ad-name" required class="w-full p-3 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:bg-white outline-none">
                </div>
                <div>
                    <label class="block text-[10px] font-bold text-slate-500 mb-1">LINK ẢNH (URL)</label>
                    <input id="ad-img" class="w-full p-3 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:bg-white outline-none">
                </div>
                <div>
                    <label class="block text-[10px] font-bold text-slate-500 mb-1">GHI CHÚ</label>
                    <input id="ad-note" class="w-full p-3 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:bg-white outline-none">
                </div>

                <div class="p-4 bg-slate-50 rounded-xl border border-slate-100">
                    <div class="flex items-center gap-3">
                        <input id="ad-ex" type="checkbox" onchange="toggleExQtyInput(this.checked)" class="w-5 h-5 text-indigo-600 rounded">
                        <label for="ad-ex" class="text-sm font-bold text-slate-700">Cho phép rơi ra EX?</label>
                    </div>
                    <div id="ad-ex-qty-container" class="hidden mt-3 pt-3 border-t border-slate-200">
                        <label class="block text-[10px] font-bold text-slate-500 mb-1">SỐ LƯỢNG EX</label>
                        <input id="ad-ex-qty" type="number" value="0" min="0" class="w-full p-2 border border-slate-200 rounded-lg text-sm bg-white outline-none">
                    </div>
                </div>

                <div class="flex gap-2 pt-2">
                    ${state.editingPillowId ? `<button type="button" onclick="cancelEdit()" class="flex-1 py-3 bg-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-300">Hủy</button>` : ''}
                    <button type="submit" class="flex-[2] py-3 bg-indigo-600 text-white font-bold rounded-xl shadow-lg hover:bg-indigo-700 transition">${state.editingPillowId ? 'Lưu Thay Đổi' : 'Thêm Gối'}</button>
                </div>
            </form>
        </div>
    `;
}

function toggleExQtyInput(isChecked) {
    const container = document.getElementById('ad-ex-qty-container');
    if(container) container.style.display = isChecked ? 'block' : 'none';
}

function editPillow(id) {
    state.editingPillowId = id;
    state.adminTab = 'add';
    renderAdmin(document.getElementById('main-content'));
}

function cancelEdit() {
    state.editingPillowId = null;
    state.adminTab = 'list';
    renderAdmin(document.getElementById('main-content'));
}

async function handleAddPillow(e) {
    e.preventDefault();
    const allowEx = document.getElementById('ad-ex').checked;
    
    const newP = {
        id: state.editingPillowId || Date.now(),
        name: document.getElementById('ad-name').value,
        imgUrl: document.getElementById('ad-img').value,
        note: document.getElementById('ad-note').value,
        allowEx: allowEx,
        exQty: allowEx ? (parseInt(document.getElementById('ad-ex-qty').value) || 0) : 0
    };
    
    const action = state.editingPillowId ? 'edit' : 'add';
    const res = await apiCall('/api/admin/pillow', {action: action, pillow: newP});
    
    if(res.success) {
        showToast(state.editingPillowId ? "Đã cập nhật!" : "Thêm thành công!", "success");
        state.editingPillowId = null;
        state.adminTab = 'list';
        renderAdmin(document.getElementById('main-content'));
    }
}

async function deletePillow(id) {
    if(confirm("Xóa vĩnh viễn gối này?")) {
        const res = await apiCall('/api/admin/pillow', {action: 'delete', pillow: {id}});
        if(res.success) {
            showToast("Đã xóa!", "success");
            renderAdmin(document.getElementById('main-content'));
        }
    }
}

// --- PROFILE SYSTEM ---
function renderProfile(div) {
    if(state.username === 'Guest') {
        div.innerHTML = `
            <div class="p-6 pt-10 text-center max-w-sm mx-auto h-full flex flex-col justify-center">
                <div class="bg-white p-8 rounded-3xl shadow-xl border border-slate-100">
                    <div class="w-20 h-20 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-inner rotate-3"><i data-lucide="user" width="40"></i></div>
                    <h2 class="text-2xl font-black mb-6 text-slate-800">Đăng Nhập</h2>
                    <input id="login-u" class="w-full p-3 border border-slate-200 rounded-xl mb-3 bg-slate-50 focus:bg-white transition outline-none focus:border-indigo-500" placeholder="Username">
                    <input id="login-p" type="password" class="w-full p-3 border border-slate-200 rounded-xl mb-6 bg-slate-50 focus:bg-white transition outline-none focus:border-indigo-500" placeholder="Password">
                    <button onclick="login(document.getElementById('login-u').value, document.getElementById('login-p').value)" class="w-full py-4 bg-indigo-600 text-white rounded-xl font-bold shadow-lg hover:bg-indigo-700 transition">Vào Game</button>
                </div>
            </div>
        `;
    } else {
        div.innerHTML = `
            <div class="p-6 pt-10 text-center max-w-md mx-auto">
                <div class="bg-white rounded-3xl shadow-lg p-6 border border-slate-100">
                    <div class="w-24 h-24 bg-gradient-to-tr from-indigo-500 to-purple-500 rounded-full mx-auto mb-4 flex items-center justify-center text-4xl text-white font-black shadow-lg border-4 border-white">
                        ${state.username[0].toUpperCase()}
                    </div>
                    <h2 class="text-2xl font-black mb-1 text-slate-800">${state.username}</h2>
                    <div class="flex items-center justify-center gap-2 text-indigo-600 font-bold mb-8 bg-indigo-50 py-2 rounded-xl mx-10">
                        <i data-lucide="coins" width="18"></i> ${state.coins} Xu
                    </div>
                    
                    <div class="space-y-3">
                        <button onclick="doCheckin()" class="w-full bg-white border-2 border-yellow-100 text-yellow-700 p-4 rounded-xl font-bold flex items-center justify-between hover:bg-yellow-50 transition shadow-sm">
                            <span class="flex items-center gap-2"><i data-lucide="calendar-check"></i> Điểm Danh Ngày</span>
                            <span class="bg-yellow-200 text-yellow-800 text-xs px-2 py-1 rounded">+500</span>
                        </button>
                        <button onclick="logout()" class="w-full bg-slate-50 text-slate-600 p-4 rounded-xl font-bold hover:bg-slate-100 transition flex items-center justify-center gap-2">
                            <i data-lucide="log-out" width="18"></i> Đăng Xuất
                        </button>
                    </div>
                </div>
            </div>
        `;
    }
    lucide.createIcons();
}

async function doCheckin() {
    const res = await apiCall('/api/checkin', {username: state.username});
    if(res.success) {
        state.coins = res.coins;
        localStorage.setItem('pgw_coins', state.coins);
        showToast("Điểm danh thành công!", "success");
        renderApp();
    } else { showToast(res.message || "Không thể điểm danh", "error"); }
}

async function checkAuth() {
    const savedUser = localStorage.getItem('pgw_user');
    const savedPass = localStorage.getItem('pgw_pass');

    if (savedUser && savedPass) {
        console.log("Đang tự động đăng nhập...");
        await login(savedUser, savedPass);
    } else {
        renderApp();
    }
}

function logout() {
    localStorage.removeItem('pgw_user');
    localStorage.removeItem('pgw_pass');
    localStorage.removeItem('pgw_coins');
    localStorage.removeItem('pgw_inv');
    
    cleanupGames();

    state.username = 'Guest';
    state.inventory = [];
    state.coins = 500;
    state.isAdmin = false;
    
    showToast('Đã đăng xuất thành công', 'info');
    
    setTab('profile');
}







