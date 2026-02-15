const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const mongoose = require('mongoose');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// --- 1. KẾT NỐI MONGODB ---
mongoose.connect(process.env.MONGO_URI)
    .then(async () => {
        console.log('✅ Connected to MongoDB');
        await seedPillows(); // Tự động tạo dữ liệu gối mẫu nếu DB rỗng
    })
    .catch(err => console.error('❌ Error connecting to MongoDB:', err));

// --- 2. ĐỊNH NGHĨA SCHEMAS (BẢNG DỮ LIỆU) ---

// Bảng User
const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    coins: { type: Number, default: 1000 },
    isAdmin: { type: Boolean, default: false },
    lastCheckIn: { type: Number, default: null },
    inventory: [
        {
            id: Number,
            name: String,
            imgUrl: String,
            rarity: String,
            uniqueId: String,
            obtainedAt: Number
        }
    ]
});
const User = mongoose.model('User', UserSchema);

// Bảng System (Lưu thông tin server)
const SystemSchema = new mongoose.Schema({
    id: { type: String, default: 'main' },
    totalPulls: { type: Number, default: 0 },
    pityCounter: { type: Number, default: 0 }
});
const System = mongoose.model('System', SystemSchema);

// Bảng Pillow (Danh sách gối - Để Admin có thể thêm sửa xóa)
const PillowSchema = new mongoose.Schema({
    id: { type: Number, unique: true },
    name: String,
    imgUrl: String,
    note: String,
    allowEx: { type: Boolean, default: false },
    exQty: { type: Number, default: 0 }
});
const Pillow = mongoose.model('Pillow', PillowSchema);

// --- 3. CONFIG & DATA MẪU ---
const BASE_RARITY_CONFIG = {
    E: { baseChance: 0.30, value: 10 },
    D: { baseChance: 0.25, value: 20 },
    C: { baseChance: 0.20, value: 50 },
    B: { baseChance: 0.12, value: 100 },
    A: { baseChance: 0.08, value: 250 },
    S: { baseChance: 0.03, value: 1000 },
    SS: { baseChance: 0.015, value: 2500 },
    SSS: { baseChance: 0.004, value: 5000 },
    EX: { baseChance: 0.001, value: 10000 }
};

const INITIAL_TEMPLATES = [
    { id: 1, name: "Gối Bông Gòn", imgUrl: "", note: "Cơ bản", allowEx: false, exQty: 0 },
    { id: 2, name: "Gối Len Cũ", imgUrl: "", note: "Cơ bản", allowEx: false, exQty: 0 },
    { id: 3, name: "Gối Kê Cổ", imgUrl: "", note: "Du lịch", allowEx: false, exQty: 0 },
    { id: 4, name: "Gối Ôm Dài", imgUrl: "", note: "Phổ biến", allowEx: false, exQty: 0 },
    { id: 5, name: "Lông Vũ Mềm", imgUrl: "", note: "Cao cấp", allowEx: false, exQty: 0 },
    { id: 6, name: "Cao Su Non", imgUrl: "", note: "Y tế", allowEx: false, exQty: 0 },
    { id: 7, name: "Gel Mát Lạnh", imgUrl: "", note: "Mùa hè", allowEx: false, exQty: 0 },
    { id: 8, name: "Khách Sạn 5 Sao", imgUrl: "", note: "Sang trọng", allowEx: false, exQty: 0 },
    { id: 9, name: "Vỏ Lụa Tơ Tằm", imgUrl: "", note: "Quý tộc", allowEx: false, exQty: 0 },
    { id: 10, name: "Dakimakura Anime", imgUrl: "", note: "Otaku", allowEx: false, exQty: 0 },
    { id: 11, name: "Lông Ngỗng", imgUrl: "", note: "Siêu nhẹ", allowEx: false, exQty: 0 },
    { id: 12, name: "Chỉ Vàng Kim", imgUrl: "", note: "Đại gia", allowEx: false, exQty: 0 },
    { id: 13, name: "Nhung Hoàng Gia", imgUrl: "", note: "Hoàng cung", allowEx: false, exQty: 0 },
    { id: 14, name: "Giấc Mơ Vũ Trụ", imgUrl: "", note: "Limited Edition", allowEx: true, exQty: 5 },
];

// Hàm tự động nạp dữ liệu gối nếu DB chưa có
async function seedPillows() {
    const count = await Pillow.countDocuments();
    if (count === 0) {
        await Pillow.insertMany(INITIAL_TEMPLATES);
        console.log('✅ Đã khởi tạo dữ liệu gối mẫu vào MongoDB');
    }
}

// --- MIDDLEWARE ---
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- API ENDPOINTS ---

app.get('/', (req, res) => {
    const indexPath = path.join(__dirname, 'public', 'index.html');
    if (require('fs').existsSync(indexPath)) res.sendFile(indexPath);
    else res.status(404).send('Lỗi: Không tìm thấy file public/index.html');
});

// 1. Đăng nhập / Đăng ký
app.post('/api/login', async (req, res) => {
    try {
        const { username } = req.body;
        if (!username) return res.status(400).json({ success: false, message: 'Thiếu username' });

        let user = await User.findOne({ username });
        if (!user) {
            const isFirstUser = (await User.countDocuments()) === 0;
            user = await User.create({
                username,
                isAdmin: isFirstUser
            });
        }

        let system = await System.findOne({ id: 'main' });
        if (!system) system = await System.create({ id: 'main' });

        res.json({ success: true, user, username: user.username, serverInfo: system });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Lỗi Server' });
    }
});

// 2. Gacha (Quay thưởng)
app.post('/api/gacha', async (req, res) => {
    try {
        const { username } = req.body;
        const COST = 100;

        const user = await User.findOne({ username });
        if (!user) return res.status(404).json({ success: false, message: "User không tồn tại" });
        if (user.coins < COST) return res.status(400).json({ success: false, message: "Không đủ xu" });

        user.coins -= COST;

        let system = await System.findOneAndUpdate(
            { id: 'main' },
            { $inc: { totalPulls: 1, pityCounter: 1 } },
            { new: true, upsert: true }
        );

        // Tính tỉ lệ
        const pityBonus = Math.floor(system.pityCounter / 200) * 0.001;
        let exChance = BASE_RARITY_CONFIG.EX.baseChance + pityBonus;
        if (exChance > 0.1) exChance = 0.1;

        // Random Rarity
        const base = { ...BASE_RARITY_CONFIG };
        let rarity = 'E';
        const rand = Math.random();
        let cumulative = 0;

        const chances = Object.keys(base).map(key => ({
            key,
            chance: key === 'EX' ? exChance : base[key].baseChance
        }));

        for (const item of chances) {
            cumulative += item.chance;
            if (rand < cumulative) { rarity = item.key; break; }
        }

        if (rarity === 'EX') {
            await System.updateOne({ id: 'main' }, { pityCounter: 0 });
            system.pityCounter = 0;
        }

        // Lấy danh sách gối từ MongoDB thay vì biến tĩnh
        const allPillows = await Pillow.find({});
        let validPillows = allPillows;

        if (rarity === 'EX') {
            const exList = allPillows.filter(p => p.allowEx);
            if (exList.length > 0) validPillows = exList;
            else { rarity = 'SSS'; }
        }

        // Fallback nếu không có gối nào trong DB
        if (validPillows.length === 0) validPillows = INITIAL_TEMPLATES;

        const selected = validPillows[Math.floor(Math.random() * validPillows.length)];

        const newItem = {
            id: selected.id,
            name: selected.name,
            imgUrl: selected.imgUrl,
            rarity,
            uniqueId: Math.random().toString(36).substring(2, 9).toUpperCase(),
            obtainedAt: Date.now()
        };

        user.inventory.unshift(newItem);
        await user.save();

        res.json({ success: true, item: newItem, coins: user.coins, serverInfo: system });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Lỗi gacha' });
    }
});

// 3. Update Coins
app.post('/api/update-coins', async (req, res) => {
    try {
        const { username, amount, adminKey, allowClientCredit } = req.body;
        if (!username) return res.status(400).json({ success: false, message: 'Missing username' });

        const amt = Number(amount || 0);
        if (!Number.isFinite(amt) || Math.floor(amt) !== amt) return res.status(400).json({ success: false, message: 'Invalid amount' });

        // DEDUCT (negative amount)
        if (amt < 0) {
            const user = await User.findOneAndUpdate(
                { username, coins: { $gte: Math.abs(amt) } },
                { $inc: { coins: amt } },
                { new: true }
            );
            if (!user) return res.status(400).json({ success: false, message: 'Insufficient coins or user not found' });
            return res.json({ success: true, newBalance: user.coins });
        }

        // CREDIT (positive amount)
        if (amt > 0) {
            // Allow client-originated small credits when explicitly enabled by env var
            const clientCreditAllowed = process.env.ALLOW_CLIENT_CREDIT === 'true' && allowClientCredit === true && Math.abs(amt) <= 10000;

            if (!process.env.ADMIN_KEY || adminKey !== process.env.ADMIN_KEY) {
                if (!clientCreditAllowed) {
                    return res.status(403).json({ success: false, message: 'Credit not allowed from client' });
                }
            }

            const user = await User.findOneAndUpdate(
                { username },
                { $inc: { coins: amt } },
                { new: true }
            );
            if (!user) return res.status(404).json({ success: false, message: 'User not found' });
            return res.json({ success: true, newBalance: user.coins });
        }

        // amount === 0 -> return current balance
        const user = await User.findOne({ username });
        if (!user) return res.status(404).json({ success: false, message: 'User not found' });
        return res.json({ success: true, newBalance: user.coins });
    } catch (e) {
        console.error(e);
        res.status(500).json({ success: false });
    }
});

// 4. Check-in
app.post('/api/checkin', async (req, res) => {
    try {
        const { username } = req.body;
        const user = await User.findOne({ username });
        if (!user) return res.status(404).json({ success: false });

        const now = Date.now();
        const last = user.lastCheckIn || 0;

        if (now - last > 86400000) {
            user.coins += 500;
            user.lastCheckIn = now;
            await user.save();
            return res.json({ success: true, coins: user.coins });
        } else {
            return res.json({ success: false, message: "Đã điểm danh rồi!" });
        }
    } catch (err) { console.error(err); res.status(500).json({ success: false }); }
});

// 5. Burn (Đổi gối lấy code) - Đã sửa sang MongoDB
app.post('/api/burn', async (req, res) => {
    try {
        const { username, uniqueId } = req.body;
        const user = await User.findOne({ username });
        if (!user) return res.status(404).json({ success: false });

        // Tìm item trong mảng inventory
        const itemIndex = user.inventory.findIndex(i => i.uniqueId === uniqueId);

        if (itemIndex > -1) {
            const item = user.inventory[itemIndex];
            // Xóa item khỏi mảng
            user.inventory.splice(itemIndex, 1);
            await user.save(); // Lưu lại thay đổi vào DB

            // Tạo code (Logic đơn giản, bạn có thể lưu code vào DB nếu cần bảo mật hơn)
            const code = `PIL-${item.id}-${item.rarity}-${uniqueId}`;
            return res.json({ success: true, code });
        } else {
            return res.status(400).json({ success: false, message: "Vật phẩm không tồn tại" });
        }
    } catch (err) { console.error(err); res.status(500).json({ success: false }); }
});

// 6. Exchange (Đổi code lấy gối) - Đã sửa sang MongoDB
app.post('/api/exchange', async (req, res) => {
    try {
        const { username, code } = req.body;
        if (!code || !code.startsWith('PIL-')) return res.status(400).json({ success: false, message: "Code không hợp lệ" });

        const parts = code.split('-');
        if (parts.length >= 4) {
            const tid = parseInt(parts[1]);
            const rarity = parts[2];

            // Tìm gối trong DB Pillow
            const template = await Pillow.findOne({ id: tid });

            if (template && BASE_RARITY_CONFIG[rarity]) {
                const newItem = {
                    id: template.id,
                    name: template.name,
                    imgUrl: template.imgUrl,
                    rarity: rarity,
                    uniqueId: Math.random().toString(36).substring(2, 9).toUpperCase(),
                    obtainedAt: Date.now()
                };

                // Thêm vào inventory User
                await User.updateOne(
                    { username },
                    { $push: { inventory: { $each: [newItem], $position: 0 } } }
                );

                return res.json({ success: true, item: newItem });
            }
        }
        res.json({ success: false, message: "Code lỗi hoặc không tồn tại" });
    } catch (err) { console.error(err); res.status(500).json({ success: false }); }
});

// 7. Claim (Xóa item) - Đã sửa sang MongoDB
app.post('/api/claim', async (req, res) => {
    try {
        const { username, uniqueId, info } = req.body;
        const user = await User.findOne({ username });
        if (!user) return res.status(404).json({ success: false });

        const idx = user.inventory.findIndex(i => i.uniqueId === uniqueId);
        if (idx > -1) {
            user.inventory.splice(idx, 1);
            await user.save();
            console.log(`[CLAIM REQUEST] User: ${username} | ID: ${uniqueId}`, info);
            return res.json({ success: true });
        } else return res.status(400).json({ success: false });
    } catch (err) { console.error(err); res.status(500).json({ success: false }); }
});

// 8. Lấy danh sách gối từ DB
app.get('/api/pillows', async (req, res) => {
    try {
        const pillows = await Pillow.find({}).sort({ id: 1 });
        res.json(pillows);
    } catch (err) { res.status(500).json([]); }
});

// 9. Admin quản lý gối (Thêm/Sửa/Xóa) - Đã sửa sang MongoDB
app.post('/api/admin/pillow', async (req, res) => {
    try {
        const { pillow, action } = req.body;

        if (action === 'delete') {
            await Pillow.findOneAndDelete({ id: pillow.id });
        } else if (action === 'edit') {
            await Pillow.findOneAndUpdate({ id: pillow.id }, pillow);
        } else {
            // Add new
            // Kiểm tra trùng ID
            const exist = await Pillow.findOne({ id: pillow.id });
            if (exist) return res.status(400).json({ success: false, message: "ID đã tồn tại" });

            await Pillow.create({
                ...pillow,
                id: Number(pillow.id)
            });
        }
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: err.message });
    }
});

// --- GAME SESSIONS ---

const gameSessions = new Map(); // token -> { username, game, start, expires, maxRate }
const rateLimits = new Map();   // username -> { count, resetAt }

function checkRateLimit(username, limit = 60) {
    const now = Date.now();
    let entry = rateLimits.get(username);
    if (!entry || now > entry.resetAt) {
        entry = { count: 0, resetAt: now + 60_000 };
    }
    entry.count += 1;
    rateLimits.set(username, entry);
    return entry.count <= limit;
}

// Start a game session (client requests when player begins)
app.post('/api/game/start', async (req, res) => {
    try {
        const { username, game } = req.body;
        if (!username || !game) return res.status(400).json({ success: false, message: 'Missing params' });

        // basic rate limit to avoid spamming starts
        if (!checkRateLimit(username, 200)) return res.status(429).json({ success: false, message: 'Rate limit' });

        // define plausible max rate per game (points/sec or clicks/sec)
        const config = {
            flappy: { maxRate: 12, maxDurationMs: 5 * 60_000 },
            race:   { maxRate: 25, maxDurationMs: 2 * 60_000 }
        }[game] || { maxRate: 10, maxDurationMs: 5 * 60_000 };

        const token = crypto.randomBytes(10).toString('hex');
        const now = Date.now();
        gameSessions.set(token, {
            username,
            game,
            start: now,
            expires: now + config.maxDurationMs,
            maxRate: config.maxRate
        });

        return res.json({ success: true, token, expiresAt: now + config.maxDurationMs });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false });
    }
});

// Finish a skill game and request award
app.post('/api/game/finish', async (req, res) => {
    try {
        const { username, token, score } = req.body;
        if (!username || !token || typeof score !== 'number') return res.status(400).json({ success: false, message: 'Missing params' });

        if (!checkRateLimit(username, 120)) return res.status(429).json({ success: false, message: 'Rate limit' });

        const session = gameSessions.get(token);
        if (!session || session.username !== username) return res.status(400).json({ success: false, message: 'Invalid session' });

        const now = Date.now();
        if (now > session.expires) { gameSessions.delete(token); return res.status(400).json({ success: false, message: 'Session expired' }); }
        const elapsed = Math.max(50, now - session.start); // ms

        // Plausibility check: max possible score = elapsed_seconds * maxRate + small buffer
        const maxPossible = Math.ceil((elapsed / 1000) * session.maxRate) + 5;
        if (score < 0 || score > maxPossible) {
            gameSessions.delete(token);
            return res.status(400).json({ success: false, message: 'Score implausible' });
        }

        // Compute award (server-controlled)
        let award = 0;
        if (session.game === 'flappy') award = Math.floor(score * 12); // each pipe ~12 xu
        else if (session.game === 'race') award = Math.floor(score * 6); // clicks -> smaller reward
        else award = Math.floor(score * 5);

        // cap award to reasonable amount
        award = Math.min(award, 20000);

        // Atomic credit
        const user = await User.findOneAndUpdate({ username }, { $inc: { coins: award } }, { new: true });
        gameSessions.delete(token);

        if (!user) return res.status(404).json({ success: false, message: 'User not found' });

        return res.json({ success: true, award, newBalance: user.coins });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false });
    }
});

// Bet games (Taixiu / BauCua) - server rolls and pays out
app.post('/api/game/bet', async (req, res) => {
    try {
        const { username, game, bet, choice } = req.body;
        const wager = Number(bet || 0);
        if (!username || !game || !Number.isFinite(wager) || wager <= 0) return res.status(400).json({ success: false, message: 'Invalid params' });

        if (!checkRateLimit(username, 60)) return res.status(429).json({ success: false, message: 'Rate limit' });

        // ensure user has enough coins (atomic decrement)
        const payer = await User.findOneAndUpdate({ username, coins: { $gte: wager } }, { $inc: { coins: -wager } }, { new: true });
        if (!payer) return res.status(400).json({ success: false, message: 'Insufficient coins' });

        let payout = 0;
        let result = null;

        if (game === 'taixiu') {
            // Roll 3 dice
            const d = [1,2,3].map(()=>Math.floor(Math.random()*6)+1);
            const sum = d.reduce((a,b)=>a+b,0);
            const type = sum >= 11 && sum <= 17 ? 'tai' : 'xiu'; // 3 and 18 excluded on table but acceptable here
            result = { dice: d, sum, type };
            if (choice === type) payout = wager * 2; // 2x payout
        } else if (game === 'baucua') {
            // choices: one of ['deer','gourd','rooster','fish','crab','shrimp']
            const symbols = ['deer','gourd','rooster','fish','crab','shrimp'];
            const rolls = [0,1,2].map(()=>symbols[Math.floor(Math.random()*6)]);
            const wins = rolls.filter(s => s === choice).length;
            // payout 1:1 per match (common simple rule)
            payout = wager * wins;
            result = { rolls, wins };
        } else {
            // unknown game -> refund
            await User.findOneAndUpdate({ username }, { $inc: { coins: wager } });
            return res.status(400).json({ success: false, message: 'Unknown game' });
        }

        // Credit payout if any
        if (payout > 0) {
            await User.findOneAndUpdate({ username }, { $inc: { coins: payout } });
        }

        const finalUser = await User.findOne({ username });
        return res.json({ success: true, result, payout, newBalance: finalUser ? finalUser.coins : null });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false });
    }
});

app.listen(PORT, () => {
    console.log(`Server running at port ${PORT}`);
});

