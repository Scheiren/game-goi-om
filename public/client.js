// (full file with edits to ensure game flows use server endpoints for results)
// --- CONFIG & STATE ---
const BASE_RARITY_CONFIG = {
    E:   { color: 'bg-slate-400', border: 'border-slate-500' },
    D:   { color: 'bg-stone-500', border: 'border-stone-600' },
    C:   { color: 'bg-green-500', border: 'border-green-600' },
    B:   { color: 'bg-blue-500', border: 'border-blue-600' },
    A:   { color: 'bg-purple-500', border: 'border-purple-600' },
    S:   { color: 'bg-yellow-500', border: 'border-yellow-600' },
    SS:  { color: 'bg-orange-500', border: 'border-orange-600' },
    SSS: { color: 'bg-red-600', border: 'border-red-700' },
    EX:  { color: 'bg-black', border: 'border-white' }
};

const GACHA_COST = 100;
let state = {
    username: localStorage.getItem('pgw_user') || 'Guest',
    // read coins from localStorage if exists, else default 1000 to mimic message.html behavior
    coins: parseInt(localStorage.getItem('pgw_coins')) || 1000,
    inventory: JSON.parse(localStorage.getItem('pgw_inv') || '[]'),
    isAdmin: false,
    serverInfo: { totalPulls: 0, pityCounter: 0 }, // Thêm info server
    tab: 'gacha', // default to gacha like message.html
    activeGame: null,
    adminTab: 'list', 
    editingPillowId: null
};

let activeInterval = null, activeTimeout = null, activeAnimFrame = null;

// --- UTILS ---
// escape HTML for safe insertion into innerHTML
function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
// escape for embedding inside JS single-quoted strings
function jsEscape(str) {
    return String(str || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');
}

// --- API ---
async function apiCall(endpoint, body) {
    try {
        const headers = {'Content-Type': 'application/json'};
        const token = localStorage.getItem('pgw_token');
        if (token) headers['Authorization'] = `Bearer ${token}`;
        const res = await fetch(endpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify(body)
        });
        return await res.json();
    } catch(e) { console.error(e); return {success: false}; }
}

async function login(u, p) {
    // Gọi API với cả username và password
    const res = await apiCall('/api/login', { username: u, password: p });

    if (res && res.success) {
        // Cập nhật State từ dữ liệu Server trả về
        state.username = res.username || (res.user && res.user.username) || u;
        state.coins = (res.user && res.user.coins) !== undefined ? res.user.coins : state.coins;
        state.inventory = (res.user && res.user.inventory) || state.inventory;
        state.isAdmin = !!(res.user && res.user.isAdmin);
        state.serverInfo = res.serverInfo || state.serverInfo;
        localStorage.setItem('pgw_user', state.username);
        localStorage.setItem('pgw_coins', state.coins);
        localStorage.setItem('pgw_inv', JSON.stringify(state.inventory));

        // Nếu backend trả về message riêng (ví dụ: "Đăng ký thành công"), hãy dùng nó
        showToast(res.message || 'Đăng nhập thành công', 'success');
        
        renderApp();
    } else {
        showToast('Đăng nhập thất bại', 'error');
    }
}

async function refreshUserData() {
    if(state.username === 'Guest') return;
    await login(state.username, ''); 
}

// --- UI CORE ---
window.onload = () => {
    if(state.username !== 'Guest') refreshUserData();
    document.addEventListener('click', (e) => {
        if(e.target.closest('button') || e.target.closest('.cursor-pointer')) {
            playSound('click');
        }
    });
    renderApp();
};

function setTab(t) {
    cleanupGames();
    // only prevent access to admin if not admin, allow other tabs for Guest like message.html
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
        el.style.display = state.isAdmin ? 'flex' : 'none';
        if(!state.isAdmin) el.classList.add('hidden'); else el.classList.remove('hidden');
    });
    
    document.querySelectorAll('.nav-btn, .sidebar-btn').forEach(btn => {
        const isActive = btn.dataset.tab === state.tab;
        if(btn.classList.contains('sidebar-btn')) {
            btn.className = `sidebar-btn flex items-center space-x-3 w-full px-6 py-4 text-left transition-colors ${isActive ? 'bg-indigo-50 text-indigo-600 border-r-4 border-indigo-600' : 'text-slate-500 hover:bg-slate-50'} ${btn.dataset.tab === 'admin' ? 'admin-nav-item' : ''}`;
        } else {
             if(isActive) { btn.classList.add('text-indigo-600'); btn.classList.remove('text-slate-400'); }
             else { btn.classList.remove('text-indigo-600'); btn.classList.add('text-slate-400'); }
        }
    });
    lucide.createIcons();
}

function renderApp() {
    const content = document.getElementById('main-content');
    if (state.activeGame) return; 

    content.innerHTML = '';
    updateUI();

    switch(state.tab) {
        case 'gacha': renderGacha(content); break;
        case 'collection': renderCollection(content); break;
        case 'games': renderGamesHub(content); break;
        case 'exchange': renderExchange(content); break; // NEW TAB
        case 'profile': renderProfile(content); break;
        case 'admin': if(state.isAdmin) renderAdmin(content); else setTab('profile'); break;
    }
    lucide.createIcons();
}

// --- GACHA ---
function renderGacha(div) {
    // Tính toán thông số hiển thị
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
                <div class="text-[10px] text-indigo-400 mt-1">Total Pulls: ${escapeHtml(state.serverInfo.totalPulls)} | Pity Counter: ${escapeHtml(state.serverInfo.pityCounter)}</div>
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
            <p class="text-xs text-slate-400 mt-4">Tổng lượt quay server: ${escapeHtml(state.serverInfo.totalPulls)}</p>
        </div>
    `;
}

// renderGachaResult: escape inserted values
function renderGachaResult(container, item) {
    const conf = BASE_RARITY_CONFIG[item.rarity] || BASE_RARITY_CONFIG.E;
    container.innerHTML = `
        <div class="flex flex-col items-center animate-pop-in w-full max-w-sm px-4">
            <div class="mb-8 relative w-56 h-80">
                 <div class="absolute inset-0 bg-yellow-400 blur-2xl opacity-40 animate-pulse"></div>
                 <div class="relative w-full h-full rounded-2xl shadow-xl border-[3px] ${conf.border} flex flex-col items-center justify-between p-4 bg-white overflow-hidden">
                    <div class="absolute inset-0 ${conf.color} opacity-10"></div>
                    <div class="z-10 font-black text-center w-full text-slate-800 text-xl drop-shadow-sm leading-tight">${escapeHtml(item.name)}</div>
                    ${item.imgUrl ? `<img src="${escapeHtml(item.imgUrl)}" class="max-h-32 object-contain z-10 drop-shadow-md">` : `<div class="text-6xl z-10">🧸</div>`}
                    <div class="z-10 w-full flex flex-col items-center gap-2">
                        <span class="px-4 py-1.5 rounded-full text-white font-black text-sm shadow-md ${conf.color}">Rank: ${escapeHtml(item.rarity)}</span>
                        <span class="text-xs text-slate-500 font-mono bg-white/80 px-2 py-0.5 rounded shadow-sm">#${escapeHtml(item.uniqueId)}</span>
                    </div>
                 </div>
            </div>
            <button onclick="renderApp()" class="w-full max-w-xs py-4 bg-indigo-600 text-white rounded-xl font-bold shadow-lg hover:bg-indigo-700 active:scale-95 transition-all">
                Thu Thập & Tiếp Tục
            </button>
        </div>
    `;
    lucide.createIcons();
}

// --- COLLECTION ---
function renderCollection(div) {
    div.innerHTML = `
        <div class="h-full flex flex-col bg-slate-50">
            <div class="p-4 border-b bg-white shadow-sm z-10 sticky top-0"><h2 class="font-black text-indigo-600 tracking-wide border-b-[3px] border-indigo-600 inline-block pb-1">TÚI ĐỒ (${state.inventory.length})</h2></div>
            <div class="flex-1 overflow-y-auto p-4 grid grid-cols-3 md:grid-cols-5 gap-3 no-scrollbar">
                ${state.inventory.length === 0 ? `<div class="col-span-full text-center text-slate-400 mt-10">Túi đồ trống. Đi quay Gacha nào!</div>` : ''}
                ${state.inventory.map(item => {
                    const conf = BASE_RARITY_CONFIG[item.rarity] || BASE_RARITY_CONFIG.E;
                    // safe embedding of uniqueId into onclick via jsEscape
                    const uidSafe = jsEscape(item.uniqueId);
                    return `
                        <div onclick="itemDetail('${uidSafe}')" class="aspect-[3/4] bg-white border ${conf.border} rounded-xl p-2 flex flex-col items-center justify-between cursor-pointer hover:shadow-md active:scale-95 transition relative overflow-hidden group">
                            <div class="absolute inset-0 ${conf.color} opacity-10 group-hover:opacity-20 transition"></div>
                            <span class="text-[10px] md:text-xs font-bold text-center z-10 truncate w-full text-slate-700">${escapeHtml(item.name)}</span>
                            <div class="z-10">${item.imgUrl ? `<img src="${escapeHtml(item.imgUrl)}" class="w-12 h-12 object-contain">` : '🧸'}</div>
                            <span class="text-[9px] bg-slate-100 px-1.5 py-0.5 rounded z-10 font-mono text-slate-500">${escapeHtml(item.rarity)}</span>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;
}

// itemDetail: escape content; accept possibly escaped uid via decodeURIComponent if needed
function itemDetail(uid) {
    try { uid = uid ? uid.toString() : uid; } catch(e){}
    const item = state.inventory.find(i => i.uniqueId === uid);
    if(!item) return;
    const modal = document.createElement('div');
    modal.className = "fixed inset-0 bg-black/60 z-[200] flex items-center justify-center p-4 backdrop-blur-sm animate-pop-in";
    modal.innerHTML = `
        <div id="detail-modal-content" class="bg-white rounded-2xl p-6 w-full max-w-sm relative shadow-2xl flex flex-col items-center text-center">
            <button onclick="this.closest('.fixed').remove()" class="absolute top-2 right-2 p-2 hover:bg-slate-100 rounded-full"><i data-lucide="x"></i></button>
            <div class="w-20 h-20 bg-slate-100 rounded-2xl flex items-center justify-center mb-4 text-4xl shadow-inner">
                ${item.imgUrl ? `<img src="${escapeHtml(item.imgUrl)}" class="w-full h-full object-contain p-1">` : '🧸'}
            </div>
            <h3 class="text-xl font-black mb-1 text-slate-800">${escapeHtml(item.name)}</h3>
            <span class="px-3 py-1 rounded-full text-white text-xs font-bold mb-4 ${BASE_RARITY_CONFIG[item.rarity].color}">${escapeHtml(item.rarity)}</span>
            <p class="font-mono text-xs bg-slate-100 p-2 rounded mb-6 w-full break-all border border-slate-200">ID: ${escapeHtml(uid)}</p>
            ${item.rarity === 'EX' ? 
                `<button onclick="openClaimForm('${jsEscape(uid)}')" class="w-full py-3 bg-gradient-to-r from-yellow-400 to-orange-500 text-white rounded-xl font-bold shadow-lg flex items-center justify-center gap-2"><i data-lucide="truck"></i> Nhận Hiện Vật (Claim)</button>` :
                `<button onclick="burnItem('${jsEscape(uid)}')" class="w-full py-3 bg-red-50 text-red-600 hover:bg-red-100 rounded-xl font-bold flex items-center justify-center gap-2 transition"><i data-lucide="flame" width="18"></i> Đổi Code (Burn)</button>`
            }
        </div>
    `;
    document.body.appendChild(modal);
    lucide.createIcons();
    window.currentModal = modal;
}

// NEW: CLAIM EX FORM
function openClaimForm(uid) {
    const content = document.getElementById('detail-modal-content');
    content.innerHTML = `
        <div class="flex flex-col w-full text-left">
            <h2 class="text-2xl font-black text-slate-800 mb-2 flex items-center gap-2"><i data-lucide="truck" class="text-orange-500"></i> Nhận Hiện Vật</h2>
            <p class="text-sm text-slate-500 mb-6">Điền thông tin chính xác để Admin gửi gối EX về tận giường cho bạn.</p>
            <form id="claim-form" class="space-y-4" onsubmit="submitClaim(event, '${uid}')">
                <input id="cl-name" type="text" required class="w-full p-3 border border-slate-200 rounded-xl" placeholder="Họ và Tên">
                <input id="cl-phone" type="tel" required class="w-full p-3 border border-slate-200 rounded-xl" placeholder="Số điện thoại">
                <textarea id="cl-addr" required rows="3" class="w-full p-3 border border-slate-200 rounded-xl" placeholder="Địa chỉ giao hàng..."></textarea>
                <div class="flex gap-2">
                    <button type="button" onclick="this.closest('.fixed').remove()" class="flex-1 py-3 bg-slate-100 font-bold rounded-xl">Hủy</button>
                    <button type="submit" class="flex-[2] py-3 bg-gradient-to-r from-yellow-400 to-orange-500 text-white font-black rounded-xl shadow-lg">Gửi Yêu Cầu</button>
                </div>
            </form>
        </div>
    `;
    lucide.createIcons();
}

async function submitClaim(e, uid) {
    e.preventDefault();
    const info = {
        name: document.getElementById('cl-name').value.trim(),
        phone: document.getElementById('cl-phone').value.trim(),
        address: document.getElementById('cl-addr').value.trim()
    };
    if (!info.name || !info.phone || !info.address) return showToast('Vui lòng điền đủ thông tin', 'error');

    const res = await apiCall('/api/claim', {username: state.username, uniqueId: uid, info: info});
    if(res.success) {
        state.inventory = state.inventory.filter(i => i.uniqueId !== uid);
        const content = document.getElementById('detail-modal-content');
        content.innerHTML = `
            <div class="flex flex-col items-center py-6">
                <div class="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-6 shadow-inner animate-bounce"><i data-lucide="check-circle" width="40"></i></div>
                <h2 class="text-2xl font-black text-slate-800 mb-2 text-center">Đã Gửi!</h2>
                <p class="text-sm text-slate-500 text-center mb-6">Yêu cầu của bạn đã được chuyển tới Admin.</p>
                <button onclick="this.closest('.fixed').remove(); renderCollection(document.getElementById('main-content'))" class="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl">Đóng</button>
            </div>
        `;
        lucide.createIcons();
    } else {
        showToast("Lỗi khi gửi yêu cầu", "error");
    }
}

// burnItem: call server (unchanged) but embed uid safely
async function burnItem(uid) {
    if(!confirm("Đốt item này để lấy Code?")) return;
    const res = await apiCall('/api/burn', {username: state.username, uniqueId: uid});
    if(res.success) {
        state.inventory = state.inventory.filter(i => i.uniqueId !== uid);
        const content = document.getElementById('detail-modal-content');
        content.innerHTML = `
            <div class="flex flex-col items-center w-full">
                <div class="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-4 shadow-inner"><i data-lucide="check" width="32"></i></div>
                <h2 class="text-2xl font-black text-slate-800 mb-2">Đổi Code Thành Công!</h2>
                <div class="w-full p-4 bg-slate-800 text-white rounded-xl mb-6 shadow-inner relative text-center">
                    <p class="font-mono tracking-widest text-lg font-bold select-all">${escapeHtml(res.code)}</p>
                </div>
                <button onclick="this.closest('.fixed').remove(); renderCollection(document.getElementById('main-content'))" class="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl">Xác Nhận</button>
            </div>
        `;
        lucide.createIcons();
    } else {
        showToast(res.message || 'Lỗi', 'error');
    }
}

// NEW: EXCHANGE TAB
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
    const code = input.value.trim().toUpperCase();
    if(!code) return showToast("Vui lòng nhập code", "error");
    
    const res = await apiCall('/api/exchange', {username: state.username, code: code});
    if(res.success) {
        state.inventory.unshift(res.item);
        showToast(`Nhận thành công: ${res.item.name}`, 'success');
        input.value = '';
        playSound('gacha-result');
    } else {
        showToast(res.message, 'error');
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

// --- GAME SERVER INTEGRATION HELPERS ---
async function startGameSession(game) {
    if (!state.username || state.username === 'Guest') {
        showToast('Bạn cần đăng nhập để chơi', 'error');
        return null;
    }
    const res = await apiCall('/api/game/start', { username: state.username, game });
    if (res && res.success) return res.token;
    showToast(res?.message || 'Không thể bắt đầu phiên chơi', 'error');
    return null;
}

// ensure finishGameSession only updates coins when server returns authoritative balance
async function finishGameSession(token, score) {
    if (!token) return { success: false, message: 'No session token' };
    try {
        // show a network spinner handled by caller
        const res = await apiCall('/api/game/finish', { username: state.username, token, score });
        if (res && res.success) {
            state.coins = res.newBalance;
            localStorage.setItem('pgw_coins', state.coins);
            updateUI();
            return res;
        }
        return res || { success: false, message: 'No response' };
    } catch (e) {
        console.error(e);
        return { success: false, message: 'Network error' };
    }
}

async function serverBet(game, bet, choice) {
    if (!state.username || state.username === 'Guest') {
        showToast('Bạn cần đăng nhập để cược', 'error');
        return null;
    }
    const res = await apiCall('/api/game/bet', { username: state.username, game, bet, choice });
    if (res && res.success) {
        state.coins = res.newBalance;
        localStorage.setItem('pgw_coins', state.coins);
        updateUI();
        return res;
    } else {
        showToast(res?.message || 'Cược thất bại', 'error');
        return null;
    }
}

// --- 1. FLAPPY BIRD (updated to use server session & remove double listeners) ---
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
            <div class="mt-4 bg-slate-800 px-6 py-2 rounded-full font-black text-xl shadow-inner text-yellow-400 border border-slate-600">Điểm: <span id="flappy-score">0</span></div>
        </div>
    `;
    const cvs = document.getElementById('flappy-cvs');
    const ctx = cvs.getContext('2d');
    const ui = document.getElementById('flappy-ui');
    const btn = document.getElementById('flappy-btn');
    const scoreEl = document.getElementById('flappy-score');
    
    let birdY = 150, velocity = 0, pipes = [], frame = 0, score = 0, playing = false;
    const gravity = 0.25, jump = -4.5;
    const MAX_SCORE = 100;

    let lastTime = 0;
    const FPS = 60;
    const FRAME_INTERVAL = 1000 / FPS;

    function reset() { 
        birdY = 150; velocity = 0; pipes = []; frame = 0; score = 0; scoreEl.innerText = 0; 
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

        if(frame % 100 === 0) pipes.push({ x: cvs.width, gap: 110, top: Math.random() * (cvs.height - 180) + 20 });
        
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
        });

        if(pipes.length && pipes[0].x < -50) { pipes.shift(); score++; scoreEl.innerText = score; }
        if(score >= MAX_SCORE) { endGame(true, 100); return; }

        let crash = false;
        if(birdY > cvs.height - 30 || birdY < -20) crash = true;
        pipes.forEach(p => { 
            if ((50 + 20 > p.x && 50 + 5 < p.x + 40) && (birdY + 5 < p.top || birdY + 20 > p.top + p.gap)) crash = true; 
        });
        if(crash) { endGame(false, Math.floor(score)); return; }
    }

    let jumpAction = null;

    async function endGame(win, earnedScore) {
        playing = false;
        if (activeAnimFrame) { cancelAnimationFrame(activeAnimFrame); activeAnimFrame = null; }

        // consume token once, clear activeGame immediately to prevent reuse
        const token = state.activeGame && state.activeGame.type === 'flappy' ? state.activeGame.token : null;
        state.activeGame = null;

        // disable UI while waiting server
        document.getElementById('flappy-msg').innerHTML = "Đang xác nhận phần thưởng...";
        btn.disabled = true;

        if (!token) {
            showToast('Không có phiên chơi hợp lệ. Không có thưởng.', 'error');
        } else {
            const result = await finishGameSession(token, Math.floor(earnedScore));
            if (result && result.success) {
                showToast(`+${result.award} Xu`, 'success');
            } else {
                showToast(result?.message || 'Lỗi khi nhận thưởng', 'error');
            }
        }

        if (typeof playSound === 'function') playSound('gacha-result');
        document.getElementById('flappy-msg').innerHTML = win ? "CHIẾN THẮNG!" : `Game Over! Điểm: ${score}`;
        btn.innerText = "CHƠI LẠI";
        btn.disabled = false; // re-enable for replay
        ui.classList.remove('hidden');

        // remove listeners attached for this game
        if (jumpAction && cvs) {
            try { cvs.removeEventListener('mousedown', jumpAction); cvs.removeEventListener('touchstart', jumpAction); } catch(e){}
            state._gameListeners = state._gameListeners.filter(l => l.fn !== jumpAction);
        }
    }

    btn.onclick = async () => { 
        if (btn.disabled) return;
        btn.disabled = true;
        btn.innerText = 'ĐANG BẮT ĐẦU...';

        const token = await startGameSession('flappy');
        btn.disabled = false;
        btn.innerText = 'CHƠI';

        if (!token) {
            showToast('Không thể bắt đầu phiên chơi', 'error');
            return;
        }

        state.activeGame = { type: 'flappy', token };
        reset(); 
        playing = true; 
        ui.classList.add('hidden'); 
        activeAnimFrame = requestAnimationFrame(loop);

        // attach jump handler and remember to remove later
        jumpAction = (e) => { 
            e.preventDefault(); 
            if(playing) {
                velocity = jump; 
                if (typeof playSound === 'function') playSound('click'); 
            }
        };
        cvs.addEventListener('mousedown', jumpAction); 
        cvs.addEventListener('touchstart', jumpAction);
        state._gameListeners.push({ el: cvs, type: 'mousedown', fn: jumpAction });
        state._gameListeners.push({ el: cvs, type: 'touchstart', fn: jumpAction });
    };
}

// --- 2. TURBO CLICK / RACE (updated to use server session) ---
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
    window.startRace = async () => {
        const token = await startGameSession('race');
        if (!token) {
            showToast('Không thể bắt đầu phiên chơi', 'error');
            return;
        }
        state.activeGame = { type: 'race', token };

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
                document.getElementById('race-earned').innerText = '...'; // waiting

                const token = state.activeGame && state.activeGame.type === 'race' ? state.activeGame.token : null;
                state.activeGame = null;
                if (!token) {
                    showToast('Phiên chơi không hợp lệ. Không có thưởng.', 'error');
                    document.getElementById('race-earned').innerText = '0';
                } else {
                    const r = await finishGameSession(token, clicks);
                    if (r && r.success) {
                        document.getElementById('race-earned').innerText = r.award || 0;
                        showToast(`+${r.award} Xu`, 'success');
                    } else {
                        document.getElementById('race-earned').innerText = '0';
                        showToast(r?.message || 'Lỗi khi nhận thưởng', 'error');
                    }
                }
            }
        }, 1000);
    };
}

// --- 3. TÀI XỈU (use server bet API) ---
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
        const rollBtn = document.getElementById('tx-roll');
        if (bet <= 0 || bet > state.coins) { showToast("Cược lỗi!", "error"); return; }
        if (!choice) { showToast("Chọn TÀI/XỈU đi!", "error"); return; }

        // UI spin animation
        rollBtn.disabled = true;
        [1,2,3].forEach(i => document.getElementById(`d${i}`).classList.add('animate-spin'));
        playSound('gacha-roll');

        // Call server to handle bet + roll
        const res = await serverBet('taixiu', bet, choice === 'TAI' ? 'tai' : 'xiu');

        // handle result and UI
        if (res && res.success) {
            // render dice if available
            if (res.result && res.result.dice) {
                res.result.dice.forEach((v, i) => {
                    const el = document.getElementById(`d${i+1}`);
                    if (el) { el.innerText = v; el.classList.remove('animate-spin'); }
                });
                document.getElementById('tx-sum').innerText = `Tổng: ${res.result.sum}`;
            } else {
                [1,2,3].forEach(i => {
                    const el = document.getElementById(`d${i}`);
                    if (el) el.classList.remove('animate-spin');
                });
            }

            // clear disabled and show message
            rollBtn.disabled = false;
            if (res.payout && res.payout > 0) {
                showToast(`Bạn thắng +${res.payout} Xu!`, 'success');
                playSound('gacha-result');
            } else {
                showToast('Bạn đã thua!', 'error');
                playSound('click');
            }
        } else {
            // fallback: stop animation and re-enable
            [1,2,3].forEach(i => {
                const el = document.getElementById(`d${i}`);
                if (el) { el.classList.remove('animate-spin'); }
            });
            rollBtn.disabled = false;
        }
    };
}

// --- 4. BẦU CUA (use server bet API) ---
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
    function totalPendingBets() { return bets.reduce((a,b)=>a+b,0); }

    window.betBauCua = async (idx) => {
        // reserve locally (do not call server until play) to keep server authoritative on actual deduction
        const pending = totalPendingBets();
        if (state.coins >= pending + 10) { 
            bets[idx] += 10; 
            document.getElementById(`bc-bet-${idx}`).innerText = bets[idx]; 
            playSound('click'); 
        } else { showToast("Hết xu!", "error"); }
    };
    window.playBauCua = async () => {
        if(bets.every(b => b === 0)) return showToast("Đặt cược đi!", "error");
        const rollBtn = document.getElementById('bc-roll');
        rollBtn.disabled = true; 
        [1,2,3].forEach(i => document.getElementById(`bc-r${i}`).classList.add('animate-spin'));
        playSound('gacha-roll');

        // Try server multi-bet payload (preferred). Server should handle 'bets' array.
        const payload = { username: state.username, game: 'baucua', bets: bets };
        const res = await apiCall('/api/game/bet', payload);
        if (res && res.success) {
            // server returned authoritative result and newBalance
            if (res.result && res.result.rolls) {
                res.result.rolls.forEach((v, i) => {
                    const el = document.getElementById(`bc-r${i+1}`);
                    if (el) { el.innerText = SYMBOLS[v]; el.classList.remove('animate-spin'); }
                });
            } else {
                [1,2,3].forEach(i => document.getElementById(`bc-r${i}`).classList.remove('animate-spin'));
            }
            state.coins = res.newBalance;
            localStorage.setItem('pgw_coins', state.coins);
            updateUI();
            if (res.payout && res.payout > 0) { showToast(`Trúng! +${res.payout} Xu`, "success"); playSound('gacha-result'); }
            else { showToast("Thua!", "error"); }
        } else {
            // fallback: attempt sequential single bets (server-side must support)
            const names = ['deer','gourd','rooster','fish','crab','shrimp'];
            let totalPayout = 0;
            let anySuccess = false;

            for (let i = 0; i < bets.length; i++) {
                const amt = bets[i];
                if (amt > 0) {
                    const single = await serverBet('baucua', amt, names[i]);
                    if (single && single.success) {
                        anySuccess = true;
                        totalPayout += Number(single.payout || 0);
                        // try to update roll display if server returns rolls
                        if (single.result && single.result.rolls) {
                            single.result.rolls.forEach((v, idx) => {
                                const el = document.getElementById(`bc-r${idx+1}`);
                                if (el) { el.innerText = SYMBOLS[v]; el.classList.remove('animate-spin'); }
                            });
                        }
                    } else {
                        showToast(`Cược ô ${i+1} thất bại`, 'error');
                    }
                }
            }

            if (anySuccess) {
                if (totalPayout > 0) {
                    showToast(`Trúng tổng +${totalPayout} Xu`, 'success');
                    playSound('gacha-result');
                } else {
                    showToast('Ván kết thúc (theo server)', 'info');
                }
            } else {
                showToast('Server không xử lý multi-bet. Cược không được thực hiện.', 'error');
                // stop animations
                [1,2,3].forEach(i => {
                    const el = document.getElementById(`bc-r${i}`);
                    if (el) el.classList.remove('animate-spin');
                });
            }
        }

        bets = [0,0,0,0,0,0]; for(let i=0; i<6; i++) document.getElementById(`bc-bet-${i}`).innerText = 0;
        rollBtn.disabled = false;
    };
}

// --- ADMIN SYSTEM (FULL FEATURED) ---
async function renderAdmin(div) {
    const res = await fetch('/api/pillows').then(r=>r.json());
    
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
                <!-- Admin Stats -->
                <div class="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-2 rounded border border-slate-200 flex justify-between">
                    <span>Total Pulls: ${state.serverInfo.totalPulls}</span>
                    <span>Pity: ${state.serverInfo.pityCounter}</span>
                </div>
            </div>
            <div class="flex-1 overflow-y-auto p-4 space-y-3 no-scrollbar">
                ${state.adminTab === 'add' ? await renderAdminAddForm(res) : renderAdminList(res)}
            </div>
        </div>
    `;
    lucide.createIcons();
    
    // Nếu đang ở tab add và có editingPillowId, fill dữ liệu
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
    
    // Nếu đang sửa thì gửi action edit
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
                    <input id="login-u" class="w-full p-3 border border-slate-200 rounded-xl mb-3 bg-slate-50 focus:bg-white transition outline-none focus:border-indigo-500" placeholder="Username (Tự tạo mới)">
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
                        ${escapeHtml(state.username[0].toUpperCase())}
                    </div>
                    <h2 class="text-2xl font-black mb-1 text-slate-800">${escapeHtml(state.username)}</h2>
                    <div class="flex items-center justify-center gap-2 text-indigo-600 font-bold mb-8 bg-indigo-50 py-2 rounded-xl mx-10">
                        <i data-lucide="coins" width="18"></i> ${escapeHtml(state.coins)}
                    </div>
                    
                    <div class="space-y-3">
                        <button onclick="state.adminTab='add'; setTab('exchange')" class="w-full bg-slate-50 text-indigo-600 p-4 rounded-xl font-bold hover:bg-slate-100 transition flex items-center justify-between group">
                           <span class="flex items-center gap-2 group-hover:pl-2 transition-all"><i data-lucide="gift"></i> Nhập Code</span>
                           <i data-lucide="chevron-right" width="16"></i>
                        </button>
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

function logout() {
    state.username = 'Guest';
    state.isAdmin = false;
    localStorage.removeItem('pgw_user');
    localStorage.removeItem('pgw_token');
    setTab('profile');
}
