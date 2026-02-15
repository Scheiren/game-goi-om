const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const mongoose = require('mongoose');

// --- CẤU HÌNH DATABASE ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('Error connecting to MongoDB:', err));

// --- MODELS ---
const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    coins: { type: Number, default: 1000 },
    isAdmin: { type: Boolean, default: false },
    lastCheckIn: { type: Number, default: 0 },
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

const SystemSchema = new mongoose.Schema({
    id: { type: String, default: 'main' },
    totalPulls: { type: Number, default: 0 },
    pityCounter: { type: Number, default: 0 },
    pillows: { type: Array, default: [] } // Lưu danh sách gối tùy chỉnh của Admin
});
const System = mongoose.model('System', SystemSchema);

// --- CONFIG ---
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

const INITIAL_TEMPLATES = [
    { id: 1, name: "Gối Bông Gòn", imgUrl: "", note: "Cơ bản", allowEx: false },
    { id: 14, name: "Giấc Mơ Vũ Trụ", imgUrl: "", note: "Limited Edition", allowEx: true },
    // ... Thêm các item khác vào đây nếu muốn hardcode
];

// --- MIDDLEWARE ---
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- API ENDPOINTS ---

// 1. Login/Register
app.post('/api/login', async (req, res) => {
    try {
        const { username } = req.body;
        if (!username) return res.status(400).json({ success: false, message: 'Thiếu username' });

        let user = await User.findOne({ username });
        if (!user) {
            const isFirstUser = (await User.countDocuments()) === 0;
            user = await User.create({ username, isAdmin: isFirstUser });
        }

        let system = await System.findOne({ id: 'main' });
        if (!system) system = await System.create({ id: 'main', pillows: INITIAL_TEMPLATES });

        res.json({ success: true, user, serverInfo: system });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Lỗi Server' });
    }
});

// 2. Gacha
app.post('/api/gacha', async (req, res) => {
    try {
        const { username } = req.body;
        const COST = 100;
        
        const user = await User.findOne({ username });
        if (!user || user.coins < COST) return res.status(400).json({ success: false, message: "Không đủ điều kiện" });

        let system = await System.findOne({ id: 'main' });
        
        // Logic tính rarity
        const pityBonus = Math.floor(system.pityCounter / 200) * 0.001;
        let exChance = Math.min(BASE_RARITY_CONFIG.EX.baseChance + pityBonus, 0.1);

        let rarity = 'E';
        const rand = Math.random();
        let cumulative = 0;
        
        for (const [key, cfg] of Object.entries(BASE_RARITY_CONFIG)) {
            const chance = (key === 'EX') ? exChance : cfg.baseChance;
            cumulative += chance;
            if (rand < cumulative) { rarity = key; break; }
        }

        // Reset pity if EX
        if (rarity === 'EX') system.pityCounter = 0;
        else system.pityCounter += 1;
        system.totalPulls += 1;

        // Lấy template gối từ system hoặc initial
        const allTemplates = system.pillows.length > 0 ? system.pillows : INITIAL_TEMPLATES;
        let validPillows = rarity === 'EX' ? allTemplates.filter(p => p.allowEx) : allTemplates;
        if (validPillows.length === 0) validPillows = allTemplates;

        const selected = validPillows[Math.floor(Math.random() * validPillows.length)];
        const newItem = {
            id: selected.id,
            name: selected.name,
            imgUrl: selected.imgUrl,
            rarity,
            uniqueId: Math.random().toString(36).substring(2, 9).toUpperCase(),
            obtainedAt: Date.now()
        };

        user.coins -= COST;
        user.inventory.unshift(newItem);
        
        await user.save();
        await system.save();

        res.json({ success: true, item: newItem, coins: user.coins, serverInfo: system });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Lỗi gacha' });
    }
});

// 3. Burn (Hủy gối lấy code) - FIX CHÍNH
app.post('/api/burn', async (req, res) => {
    try {
        const { username, uniqueId } = req.body;
        const user = await User.findOne({ username });
        if (!user) return res.status(404).json({ success: false });

        const idx = user.inventory.findIndex(i => i.uniqueId === uniqueId);
        if (idx > -1) {
            const item = user.inventory[idx];
            user.inventory.splice(idx, 1); // Xóa khỏi túi đồ
            await user.save();
            
            // Trả về code định dạng: PIL-ID-RARITY-UNIQUEID
            return res.json({ 
                success: true, 
                code: `PIL-${item.id}-${item.rarity}-${item.uniqueId}` 
            });
        }
        res.status(400).json({ success: false, message: "Không tìm thấy vật phẩm" });
    } catch(err) { res.status(500).json({ success:false }); }
});

// 4. Exchange (Nhập code lấy gối) - FIX CHÍNH
app.post('/api/exchange', async (req, res) => {
    try {
        const { username, code } = req.body;
        if(!code || !code.startsWith('PIL-')) return res.status(400).json({success: false, message: "Code không hợp lệ"});
        
        const parts = code.split('-');
        const tid = parseInt(parts[1]);
        const rarity = parts[2];

        const system = await System.findOne({ id: 'main' });
        const allTemplates = system.pillows.length > 0 ? system.pillows : INITIAL_TEMPLATES;
        const template = allTemplates.find(t => t.id === tid);

        if(template && BASE_RARITY_CONFIG[rarity]) {
            const newItem = {
                id: template.id,
                name: template.name,
                imgUrl: template.imgUrl,
                rarity: rarity,
                uniqueId: Math.random().toString(36).substring(2, 9).toUpperCase(),
                obtainedAt: Date.now()
            };
            
            await User.findOneAndUpdate(
                { username },
                { $push: { inventory: { $each: [newItem], $position: 0 } } }
            );
            return res.json({ success: true, item: newItem });
        }
        res.json({ success: false, message: "Vật phẩm không tồn tại trong hệ thống" });
    } catch(err) { res.status(500).json({ success:false }); }
});

// 5. Admin Pillow Management - FIX CHÍNH
app.post('/api/admin/pillow', async (req, res) => {
    try {
        const { pillow, action } = req.body;
        let system = await System.findOne({ id: 'main' });
        if (!system) system = new System({ id: 'main', pillows: INITIAL_TEMPLATES });

        if (action === 'delete') {
            system.pillows = system.pillows.filter(p => p.id !== pillow.id);
        } else if (action === 'edit') {
            const idx = system.pillows.findIndex(p => p.id === pillow.id);
            if (idx !== -1) system.pillows[idx] = { ...system.pillows[idx], ...pillow };
        } else {
            pillow.id = Date.now(); // Tạo ID duy nhất
            system.pillows.unshift(pillow);
        }
        
        system.markModified('pillows'); // Thông báo cho Mongoose mảng đã thay đổi
        await system.save();
        res.json({ success: true });
    } catch(err) { res.status(500).json({ success:false }); }
});

// 6. Check-in
app.post('/api/checkin', async (req, res) => {
    try {
        const { username } = req.body;
        const user = await User.findOne({ username });
        const now = Date.now();

        if (now - (user.lastCheckIn || 0) > 86400000) {
            user.coins += 500;
            user.lastCheckIn = now;
            await user.save();
            return res.json({ success: true, coins: user.coins });
        }
        res.json({ success: false, message: "Đã điểm danh rồi!" });
    } catch (err) { res.status(500).json({ success: false }); }
});

// 7. Update Coins
app.post('/api/update-coins', async (req, res) => {
    try {
        const { username, amount } = req.body;
        const user = await User.findOneAndUpdate(
            { username },
            { $inc: { coins: Number(amount) } },
            { new: true }
        );
        res.json({ success: !!user, newBalance: user?.coins });
    } catch (e) { res.status(500).json({ success: false }); }
});

app.listen(PORT, () => console.log(`Server running at port ${PORT}`));