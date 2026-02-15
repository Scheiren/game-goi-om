const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const mongoose = require('mongoose');

// --- CẤU HÌNH DATABASE ---
//connect database
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('connected to mongodb'))
    .catch(err => console.error('error connecting to mongodb:', err));
const DB_FILE = path.join(__dirname, 'database.json');

//user table
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

//system table
const SystemSchema = new mongoose.Schema({
    id: { type: String, default: 'main' }, // Luôn là 'main' để dễ tìm
    totalPulls: { type: Number, default: 0 },
    pityCounter: { type: Number, default: 0 }
});
const System = mongoose.model('System', SystemSchema);

//rarity config
const BASE_RARITY_CONFIG = {
    E:   { baseChance: 0.30, value: 10 },
    D:   { baseChance: 0.25, value: 20 },
    C:   { baseChance: 0.20, value: 50 },
    B:   { baseChance: 0.12, value: 100 },
    A:   { baseChance: 0.08, value: 250 },
    S:   { baseChance: 0.03, value: 1000 },
    SS:  { baseChance: 0.015, value: 2500 },
    SSS: { baseChance: 0.004, value: 5000 },
    EX:  { baseChance: 0.001, value: 10000 }
};

//template
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

// --- MIDDLEWARE ---
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- API ENDPOINTS ---
app.get('/', (req, res) => {
    const indexPath = path.join(__dirname, 'public', 'index.html');
    if (require('fs').existsSync(indexPath)) res.sendFile(indexPath);
    else res.status(404).send('Lỗi: Không tìm thấy file public/index.html');
});

// 1. login/regs
app.post('/api/login', async (req, res) => {
    try {
        const { username } = req.body;
        if (!username) return res.status(400).json({ success: false, message: 'Thiếu username' });

        let user = await User.findOne({ username });
        if (!user) {
            // Nếu chưa có user, tạo mới
            const isFirstUser = (await User.countDocuments()) === 0;
            user = await User.create({
                username,
                isAdmin: isFirstUser // User đầu tiên là admin
            });
        }

        // Lấy thông tin server
        let system = await System.findOne({ id: 'main' });
        if (!system) system = await System.create({ id: 'main' });

        res.json({ success: true, user, username: user.username, serverInfo: system });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Lỗi Server' });
    }
});

//gacha
app.post('/api/gacha', async (req, res) => {
    try {
        const { username } = req.body;
        const COST = 100;
        
        const user = await User.findOne({ username });
        if (!user) return res.status(404).json({ success: false, message: "User không tồn tại" });
        if (user.coins < COST) return res.status(400).json({ success: false, message: "Không đủ xu" });

        // Trừ tiền
        user.coins -= COST;

        // Cập nhật Pity Server
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
        const base = { ...BASE_RARITY_CONFIG }; // copy config
        // (Logic random giữ nguyên như cũ nhưng rút gọn cho dễ đọc)
        let rarity = 'E';
        const rand = Math.random();
        let cumulative = 0;
        
        // Tạo mapping xác suất tạm thời
        const chances = Object.keys(base).map(key => ({ 
            key, 
            chance: key === 'EX' ? exChance : base[key].baseChance 
        }));

        for (const item of chances) {
            cumulative += item.chance;
            if (rand < cumulative) { rarity = item.key; break; }
        }

        if (rarity === 'EX') {
            // Reset pity nếu ra EX
            await System.updateOne({ id: 'main' }, { pityCounter: 0 });
            system.pityCounter = 0;
        }

        // Chọn gối
        let validPillows = INITIAL_TEMPLATES;
        if (rarity === 'EX') {
            const exList = INITIAL_TEMPLATES.filter(p => p.allowEx);
            if (exList.length > 0) validPillows = exList;
            else { rarity = 'SSS'; } // Fallback nếu không có gối EX nào
        }
        
        const selected = validPillows[Math.floor(Math.random() * validPillows.length)];

        const newItem = {
            id: selected.id,
            name: selected.name,
            imgUrl: selected.imgUrl,
            rarity,
            uniqueId: Math.random().toString(36).substring(2, 9).toUpperCase(),
            obtainedAt: Date.now()
        };

        // Lưu vào inventory
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
        const { username, amount } = req.body;
        const amountNum = Number(amount); // Fix lỗi cộng chuỗi
        if (isNaN(amountNum)) return res.status(400).json({ success: false });

        const user = await User.findOneAndUpdate(
            { username },
            { $inc: { coins: amountNum } },
            { new: true }
        );
        
        if (!user) return res.status(404).json({ success: false });
        res.json({ success: true, newBalance: user.coins });
    } catch (e) { console.error(e); res.status(500).json({ success: false }); }
});

//burn
app.post('/api/burn', (req, res) => {
    try {
        const { username, uniqueId } = req.body;
        const db = readDB();
        if (!db.users[username]) return res.status(404).json({ success: false });
        const idx = (db.users[username].inventory || []).findIndex(i => i.uniqueId === uniqueId);
        if (idx > -1) {
            const item = db.users[username].inventory[idx];
            db.users[username].inventory.splice(idx, 1);
            writeDB(db);
            return res.json({ success: true, code: `PIL-${item.id}-${item.rarity}-${uniqueId}` });
        } else { return res.status(400).json({ success: false }); }
    } catch(err) { console.error(err); res.status(500).json({ success:false }); }
});

//exchange
app.post('/api/exchange', (req, res) => {
    try {
        const { username, code } = req.body;
        if(!code || !code.startsWith('PIL-')) return res.status(400).json({success: false, message: "Code không hợp lệ"});
        const parts = code.split('-');
        if(parts.length >= 4) {
            const tid = parseInt(parts[1]);
            const rarity = parts[2];
            const db = readDB();
            const template = (db.pillows || []).find(t => t.id === tid);
            if(template && BASE_RARITY_CONFIG[rarity]) {
                const newItem = {
                    id: template.id,
                    name: template.name,
                    imgUrl: template.imgUrl,
                    rarity: rarity,
                    uniqueId: Math.random().toString(36).substring(2, 9).toUpperCase(),
                    obtainedAt: Date.now()
                };
                db.users[username] = db.users[username] || { username, coins: 1000, isAdmin: false, inventory: [], lastCheckIn: null };
                db.users[username].inventory.unshift(newItem);
                writeDB(db);
                return res.json({success: true, item: newItem});
            }
        }
        res.json({success: false, message: "Code lỗi hoặc không tồn tại"});
    } catch(err) { console.error(err); res.status(500).json({success:false}); }
});

app.post('/api/claim', (req, res) => {
    try {
        const { username, uniqueId, info } = req.body;
        const db = readDB();
        if(!db.users[username]) return res.status(404).json({ success: false });
        const idx = (db.users[username].inventory || []).findIndex(i => i.uniqueId === uniqueId);
        if(idx > -1) {
            // remove item and log claim
            db.users[username].inventory.splice(idx, 1);
            writeDB(db);
            console.log(`[CLAIM REQUEST] User: ${username} | ID: ${uniqueId}`, info);
            return res.json({success: true});
        } else return res.status(400).json({success:false});
    } catch(err) { console.error(err); res.status(500).json({success:false}); }
});

//Check-in
app.post('/api/checkin', async (req, res) => {
    try {
        const { username } = req.body;
        const user = await User.findOne({ username });
        if (!user) return res.status(404).json({ success: false });

        const now = Date.now();
        const last = user.lastCheckIn || 0;

        if (now - last > 86400000) { // 24h
            user.coins += 500;
            user.lastCheckIn = now;
            await user.save();
            return res.json({ success: true, coins: user.coins });
        } else {
            return res.json({ success: false, message: "Đã điểm danh rồi!" });
        }
    } catch (err) { console.error(err); res.status(500).json({ success: false }); }
});

//Lấy danh sách gối (API cũ)
app.get('/api/pillows', (req, res) => {
    res.json(INITIAL_TEMPLATES);
});

app.post('/api/admin/pillow', (req, res) => {
    try {
        const { pillow, action } = req.body;
        const db = readDB();
        db.pillows = db.pillows || [];
        if (action === 'delete') {
            db.pillows = db.pillows.filter(p => p.id !== pillow.id);
        } else if (action === 'edit') {
            const idx = db.pillows.findIndex(p => p.id === pillow.id);
            if (idx !== -1) db.pillows[idx] = { ...db.pillows[idx], ...pillow };
        } else {
            pillow.id = Number(pillow.id);
            db.pillows.unshift(pillow);
        }
        writeDB(db);
        res.json({ success: true });
    } catch(err) { console.error(err); res.status(500).json({success:false}); }
});

app.listen(PORT, () => {
    console.log(`Server running at port ${PORT}`);
});