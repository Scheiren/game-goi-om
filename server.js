const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || "bi_mat_khong_the_bat_mi_123456";

// --- CẤU HÌNH DATABASE ---
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('Error connecting to MongoDB:', err));

// --- MODELS ---
const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    coins: { type: Number, default: 1000 },
    isAdmin: { type: Boolean, default: false },
    lastCheckIn: { type: Number, default: 0 },
    inventory: { type: Array, default: [] }
});
const User = mongoose.model('User', UserSchema);

const SystemSchema = new mongoose.Schema({
    id: { type: String, default: 'main' },
    totalPulls: { type: Number, default: 0 },
    pityCounter: { type: Number, default: 0 },
    pillows: { type: Array, default: [] }
});
const System = mongoose.model('System', SystemSchema);

const GiftCodeSchema = new mongoose.Schema({
    code: { type: String, required: true, unique: true },
    itemTemplateId: { type: Number, required: true },
    rarity: { type: String, required: true },
    isUsed: { type: Boolean, default: false },
    generatedBy: String,
    usedBy: { type: String, default: null },
    createdAt: { type: Number, default: Date.now }
});
const GiftCode = mongoose.model('GiftCode', GiftCodeSchema);

// --- CONFIG ---
const BASE_RARITY_CONFIG = {
    F:   { baseChance: 0.30, value: 10 },
    D:   { baseChance: 0.25, value: 20 },
    C:   { baseChance: 0.20, value: 50 },
    B:   { baseChance: 0.12, value: 100 },
    A:   { baseChance: 0.08, value: 250 },
    S:   { baseChance: 0.03, value: 1000 },
    SS:  { baseChance: 0.016, value: 2500 },
    SSS: { baseChance: 0.004, value: 5000 },
    EX:  { baseChance: 0.001, value: 10000 }
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

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

const verifyToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Lấy token từ header "Bearer <token>"

    if (!token) return res.status(401).json({ success: false, message: "Vui lòng đăng nhập!" });

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) return res.status(403).json({ success: false, message: "Phiên đăng nhập hết hạn!" });
        req.user = decoded; // Lưu thông tin user đã giải mã vào biến req
        next();
    });
};

const verifyAdmin = (req, res, next) => {
    if (!req.user || !req.user.isAdmin) {
        return res.status(403).json({ success: false, message: "Bạn không có quyền Admin!" });
    }
    next();
};

// --- API ENDPOINTS ---

//LOGIN
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ success: false, message: 'Thiếu thông tin' });

        let user = await User.findOne({ username });
        let system = await System.findOne({ id: 'main' });
        if (!system) system = await System.create({ id: 'main', pillows: INITIAL_TEMPLATES });

        if (!user) {
            const hashedPassword = await bcrypt.hash(password, 10);
            const isFirstUser = (await User.countDocuments()) === 0;
            user = await User.create({ username, password: hashedPassword, isAdmin: isFirstUser });
        } else {
            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) return res.status(401).json({ success: false, message: 'Sai mật khẩu!' });
        }

        const token = jwt.sign(
            { id: user._id, username: user.username, isAdmin: user.isAdmin },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        const uObj = user.toObject(); 
        delete uObj.password;

        return res.json({ 
            success: true, 
            message: "Đăng nhập thành công", 
            token: token,
            user: uObj, 
            serverInfo: system 
        });

    } catch (err) { res.status(500).json({ success: false, message: 'Lỗi Server' }); }
});

//GACHA
app.post('/api/gacha', verifyToken, async (req, res) => {
    try {
        const username = req.user.username;
        const COST = 100;
        const user = await User.findOne({ username });
        if (!user || user.coins < COST) return res.status(400).json({ success: false, message: "Không đủ xu" });
        
        let system = await System.findOne({ id: 'main' });
        const pityBonus = Math.floor(system.pityCounter / 200) * 0.001;
        let exChance = Math.min(BASE_RARITY_CONFIG.EX.baseChance + pityBonus, 0.1);
        const RARITY_ORDER = ['EX', 'SSS', 'SS', 'S', 'A', 'B', 'C', 'D', 'F'];
        let rarity = 'F'; const rand = Math.random(); let cumulative = 0;
        for (const key of RARITY_ORDER) {
            const chance = (key === 'EX') ? exChance : BASE_RARITY_CONFIG[key].baseChance;
            cumulative += chance; if (rand < cumulative) { rarity = key; break; }
        }
        const allTemplates = system.pillows.length > 0 ? system.pillows : INITIAL_TEMPLATES;
        if (rarity === 'EX') {
            let exPillows = allTemplates.filter(p => p.allowEx && p.exQty > 0);
            if (exPillows.length === 0) rarity = 'SSS'; system.pityCounter = 0; 
        }
        let validPillows = (rarity === 'EX') ? allTemplates.filter(p => p.allowEx && p.exQty > 0) : allTemplates;
        const selected = validPillows[Math.floor(Math.random() * validPillows.length)];
        if (rarity === 'EX') {
            const idx = system.pillows.findIndex(p => p.id === selected.id);
            if (idx > -1) { system.pillows[idx].exQty -= 1; system.markModified('pillows'); }
            system.pityCounter = 0; 
        } else { system.pityCounter += 1; }
        const newItem = {
            id: selected.id, name: selected.name, imgUrl: selected.imgUrl, rarity,
            uniqueId: Math.random().toString(36).substring(2, 9).toUpperCase(), obtainedAt: Date.now()
        };
        user.coins -= COST; user.inventory.unshift(newItem); user.markModified('inventory');
        system.totalPulls += 1;
        await user.save(); await system.save();
        res.json({ success: true, item: newItem, coins: user.coins, serverInfo: system });
    } catch (err) { res.status(500).json({ success: false }); }
});

//BURN
app.post('/api/burn', verifyToken, async (req, res) => {
    try {
        const username = req.user.username; // Bảo mật
        const { uniqueId } = req.body;
        // ... (Logic Burn cũ giữ nguyên, copy từ bài sửa trước vào đây) ...
        const user = await User.findOne({ username });
        const idx = user.inventory.findIndex(i => i.uniqueId === uniqueId);
        if (idx > -1) {
            const item = user.inventory[idx];
            let codeStr = null;
            if (['SSS', 'EX'].includes(item.rarity)) {
                if (item.rarity === 'EX') { /* Logic trả EX vào pool nếu muốn */ }
                const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
                codeStr = `PIL-${item.id}-${item.rarity}-${randomStr}${Date.now().toString().slice(-4)}`;
                await GiftCode.create({ code: codeStr, itemTemplateId: item.id, rarity: item.rarity, generatedBy: username });
            }
            user.inventory.splice(idx, 1); user.markModified('inventory'); await user.save();
            return res.json({ success: true, code: codeStr });
        }
        res.status(400).json({ success: false, message: "Vật phẩm không tồn tại" });
    } catch(err) { res.status(500).json({ success: false, message: "Lỗi Server" }); }
});
//USER
app.post('/api/user/me', verifyToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password'); 
        if (!user) return res.status(404).json({ success: false, message: "User không tồn tại" });
        
        let system = await System.findOne({ id: 'main' });
        
        res.json({ 
            success: true, 
            user: user,
            serverInfo: system 
        });
    } catch (err) {
        res.status(500).json({ success: false, message: "Lỗi Server" });
    }
});
//DANH SÁCH CODE
app.get('/api/user/codes', async (req, res) => {
    try {
        const { username } = req.query;
        if (!username) return res.json({ success: false, data: [] });

        const codes = await GiftCode.find({ 
            generatedBy: username, 
            isUsed: false
        }).sort({ createdAt: -1 });

        res.json({ success: true, data: codes });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: "Lỗi server" });
    }
});

//EXCHANGE
app.post('/api/exchange', async (req, res) => {
    try {
        const { username, code } = req.body;
        
        if(!code) return res.status(400).json({success: false, message: "Vui lòng nhập mã code!"});

        const giftCode = await GiftCode.findOne({ code: code.trim(), isUsed: false });

        if (!giftCode) {
            return res.json({ success: false, message: "Mã quà tặng không tồn tại hoặc đã được sử dụng!" });
        }


        const system = await System.findOne({ id: 'main' });
        const allItems = (system && system.pillows) ? system.pillows : INITIAL_TEMPLATES;
        
        const template = allItems.find(p => p.id == giftCode.itemTemplateId);

        if (!template) {
            return res.json({ success: false, message: "Vật phẩm trong mã này bị lỗi hệ thống (ID không khớp)." });
        }

        const newItem = {
            id: template.id,
            name: template.name,
            imgUrl: template.imgUrl,
            rarity: giftCode.rarity,
            uniqueId: Math.random().toString(36).substring(2, 9).toUpperCase(),
            obtainedAt: Date.now()
        };

        await User.findOneAndUpdate(
            { username: username }, 
            { $push: { inventory: { $each: [newItem], $position: 0 } } }
        );

        await GiftCode.deleteOne({ _id: giftCode._id });

        return res.json({ success: true, item: newItem });

    } catch (e) {
        console.error(e);
        res.status(500).json({ success: false, message: "Lỗi Server" });
    }
});

app.post('/api/burn-batch', async (req, res) => {
    try {
        const { username, uniqueIds } = req.body; 
        const user = await User.findOne({ username });
        if (!user) return res.status(404).json({ success: false });

        const itemsToBurn = user.inventory.filter(i => uniqueIds.includes(i.uniqueId));
        if (itemsToBurn.length === 0) return res.json({ success: false, message: "Không tìm thấy vật phẩm" });

        /*
        let generatedCodes = [];
        let giftCodeDocs = [];

        itemsToBurn.forEach(item => {
            if (['SSS', 'EX'].includes(item.rarity)) {
                const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
                const timestamp = Date.now().toString().slice(-5);
                const codeStr = `PIL-${item.id}-${item.rarity}-${randomStr}${timestamp}`;
                
                generatedCodes.push(codeStr);
                giftCodeDocs.push({
                    code: codeStr,
                    itemTemplateId: item.id,
                    rarity: item.rarity,
                    isUsed: false,
                    generatedBy: username
                });
            }
        });

        if (giftCodeDocs.length > 0) {
            await GiftCode.insertMany(giftCodeDocs);
        }
        */

        user.inventory = user.inventory.filter(i => !uniqueIds.includes(i.uniqueId));
        user.markModified('inventory');
        await user.save();

        return res.json({ success: true });
    } catch(err) { res.status(500).json({ success: false }); }
});

// --- CÁC API KHÁC (GET INFO, ADMIN...) ---

app.get('/api/pillows', async (req, res) => {
    try {
        let system = await System.findOne({ id: 'main' });
        const data = (system && system.pillows && system.pillows.length > 0) ? system.pillows : INITIAL_TEMPLATES;
        res.json(data);
    } catch (err) { res.status(500).json({ success: false }); }
});

app.post('/api/admin/pillow', verifyToken, verifyAdmin, async (req, res) => {
    // ... Logic admin cũ giữ nguyên ...
    try {
        const { pillow, action } = req.body;
        let system = await System.findOne({ id: 'main' });
        if (!system) system = new System({ id: 'main', pillows: INITIAL_TEMPLATES });
        if (action === 'delete') { system.pillows = system.pillows.filter(p => p.id !== pillow.id); } 
        else if (action === 'edit') { const idx = system.pillows.findIndex(p => p.id === pillow.id); if (idx !== -1) system.pillows[idx] = { ...system.pillows[idx], ...pillow }; } 
        else { const newPillow = { ...pillow, id: pillow.id ? Number(pillow.id) : Date.now() }; system.pillows.unshift(newPillow); }
        system.markModified('pillows'); await system.save();
        res.json({ success: true, updatedPillows: system.pillows });
    } catch(err) { res.status(500).json({ success: false }); }
});

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
        res.json({ success: false, message: "Chờ ngày mai nhé!" });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.post('/api/update-coins', verifyToken, async (req, res) => {
    try {
        const username = req.user.username; 
        const { amount } = req.body;
        if (amount > 10000) amount = 10000;
        
        const user = await User.findOneAndUpdate({ username }, { $inc: { coins: Number(amount) } }, { returnDocument: 'after' });
        res.json({ success: !!user, newBalance: user?.coins });
    } catch (e) { res.status(500).json({ success: false }); }
});

//API Claim
app.post('/api/claim', async (req, res) => {
    try {
        const { username, uniqueId, info } = req.body;
        const user = await User.findOne({ username });
        if (!user) return res.status(404).json({ success: false });
        const idx = user.inventory.findIndex(i => i.uniqueId === uniqueId);
        if (idx > -1) {
            user.inventory.splice(idx, 1);
            user.markModified('inventory');
            await user.save();
            console.log(`[CLAIM] User: ${username} | Info:`, info);
            return res.json({ success: true });
        }
        res.status(400).json({ success: false });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.listen(PORT, () => console.log(`Server running at port ${PORT}`));




