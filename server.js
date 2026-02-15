const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

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
    code: { type: String, required: true, unique: true }, // Mã code
    itemTemplateId: { type: Number, required: true },     // ID loại gối
    rarity: { type: String, required: true },             // Độ hiếm
    isUsed: { type: Boolean, default: false },            // Trạng thái đã dùng
    generatedBy: String,                                  // Người tạo (người đốt)
    usedBy: { type: String, default: null },              // Người nhập
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

// Dữ liệu mẫu ban đầu
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

// --- API ENDPOINTS ---

// 1. LOGIN
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
            const uObj = user.toObject(); delete uObj.password;
            return res.json({ success: true, message: "Đăng ký thành công", user: uObj, serverInfo: system });
        } else {
            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) return res.status(401).json({ success: false, message: 'Sai mật khẩu!' });
            const uObj = user.toObject(); delete uObj.password;
            return res.json({ success: true, message: "Đăng nhập thành công", user: uObj, serverInfo: system });
        }
    } catch (err) { res.status(500).json({ success: false, message: 'Lỗi Server' }); }
});

// 2. GACHA
app.post('/api/gacha', async (req, res) => {
    try {
        const { username } = req.body;
        const COST = 100;
        const MAX_INVENTORY = 200; // Giới hạn túi đồ 200 món

        const user = await User.findOne({ username });
        if (!user) return res.status(404).json({ success: false, message: "Người dùng không tồn tại" });
        if (user.coins < COST) return res.status(400).json({ success: false, message: "Không đủ xu" });

        if (user.inventory.length >= MAX_INVENTORY) {
            return res.status(400).json({ 
                success: false, 
                message: `Túi đồ đã đầy (${MAX_INVENTORY}/${MAX_INVENTORY}). Hãy đốt bớt đồ cũ!` 
            });
        }

        let system = await System.findOne({ id: 'main' });
        if (!system) system = await System.create({ id: 'main', pillows: INITIAL_TEMPLATES });

        const pityBonus = Math.floor(system.pityCounter / 200) * 0.001;
        let exChance = Math.min(BASE_RARITY_CONFIG.EX.baseChance + pityBonus, 0.1);

        const RARITY_ORDER = ['EX', 'SSS', 'SS', 'S', 'A', 'B', 'C', 'D', 'F'];

        let rarity = 'F';
        const rand = Math.random();
        let cumulative = 0;

        for (const key of RARITY_ORDER) {
            const cfg = BASE_RARITY_CONFIG[key];
            const chance = (key === 'EX') ? exChance : cfg.baseChance;
    
            cumulative += chance;
            if (rand < cumulative) { 
                rarity = key; 
                break; 
            }
        }

        const allTemplates = system.pillows.length > 0 ? system.pillows : INITIAL_TEMPLATES;
        
        if (rarity === 'EX') {
            let exPillows = allTemplates.filter(p => p.allowEx && p.exQty > 0);
            if (exPillows.length === 0) {
                rarity = 'SSS';
            }
        }

        let validPillows = (rarity === 'EX') 
            ? allTemplates.filter(p => p.allowEx && p.exQty > 0)
            : allTemplates;

        if (validPillows.length === 0) validPillows = allTemplates;

        const selectedTemplate = validPillows[Math.floor(Math.random() * validPillows.length)];

        if (rarity === 'EX') {
            const templateIdx = system.pillows.findIndex(p => p.id === selectedTemplate.id);
            if (templateIdx > -1) {
                system.pillows[templateIdx].exQty -= 1;
                system.markModified('pillows');
            }
            system.pityCounter = 0;
        } else {
            system.pityCounter += 1;
        }

        const newItem = {
            id: selectedTemplate.id,
            name: selectedTemplate.name,
            imgUrl: selectedTemplate.imgUrl,
            rarity,
            uniqueId: Math.random().toString(36).substring(2, 9).toUpperCase(),
            obtainedAt: Date.now()
        };

        system.totalPulls += 1;
        user.coins -= COST;
        user.inventory.unshift(newItem);
        user.markModified('inventory');

        await user.save();
        await system.save();

        res.json({ 
            success: true, 
            item: newItem, 
            coins: user.coins, 
            serverInfo: {
                totalPulls: system.totalPulls,
                pityCounter: system.pityCounter
            }
        });

    } catch (err) { 
        console.error("GACHA ERROR:", err);
        res.status(500).json({ success: false, message: "Lỗi hệ thống khi quay Gacha" }); 
    }
});

// 3. BURN
app.post('/api/burn', async (req, res) => {
    try {
        const { username, uniqueId } = req.body;
        const user = await User.findOne({ username });
        if (!user) return res.status(404).json({ success: false });

        const idx = user.inventory.findIndex(i => i.uniqueId === uniqueId);
        if (idx > -1) {
            const item = user.inventory[idx];
            
            const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
            const timestamp = Date.now().toString().slice(-4);
            const codeStr = `PIL-${item.id}-${item.rarity}-${randomStr}${timestamp}`;

            await GiftCode.create({
                code: codeStr,
                itemTemplateId: item.id,
                rarity: item.rarity,
                isUsed: false,
                generatedBy: username
            });

            user.inventory.splice(idx, 1); 
            user.markModified('inventory');
            await user.save();
            
            return res.json({ success: true, code: codeStr });
        }
        res.status(400).json({ success: false, message: "Không tìm thấy item" });
    } catch(err) { res.status(500).json({ success:false }); }
});

//BURN BATCH
app.post('/api/burn-batch', async (req, res) => {
    try {
        const { username, uniqueIds } = req.body; 
        if (!Array.isArray(uniqueIds) || uniqueIds.length === 0) return res.status(400).json({ success: false });

        const user = await User.findOne({ username });
        if (!user) return res.status(404).json({ success: false });

        const itemsToBurn = user.inventory.filter(i => uniqueIds.includes(i.uniqueId));
        if (itemsToBurn.length === 0) return res.json({ success: false, message: "Không có item hợp lệ" });

        let generatedCodes = [];
        let giftCodeDocs = [];

        itemsToBurn.forEach(item => {
            const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
            const timestamp = Date.now().toString().slice(-5); // Lấy 5 số cuối time cho khác biệt
            const codeStr = `PIL-${item.id}-${item.rarity}-${randomStr}${timestamp}`;
            
            generatedCodes.push(codeStr);
            giftCodeDocs.push({
                code: codeStr,
                itemTemplateId: item.id,
                rarity: item.rarity,
                isUsed: false,
                generatedBy: username
            });
        });

        await GiftCode.insertMany(giftCodeDocs);

        user.inventory = user.inventory.filter(i => !uniqueIds.includes(i.uniqueId));
        user.markModified('inventory');
        await user.save();

        return res.json({ success: true, codes: generatedCodes });
    } catch(err) { 
        console.error(err);
        res.status(500).json({ success: false }); 
    }
});

// 5. EXCHANGE
app.post('/api/exchange', async (req, res) => {
    try {
        const { username, code } = req.body;
        if(!code) return res.status(400).json({success: false, message: "Vui lòng nhập code"});
        
        const giftCode = await GiftCode.findOne({ code: code.trim() });

        if (!giftCode) {
            return res.json({ success: false, message: "Mã quà tặng không tồn tại!" });
        }

        if (giftCode.isUsed) {
            return res.json({ success: false, message: "Mã này đã được sử dụng rồi!" });
        }

        const system = await System.findOne({ id: 'main' });
        const allTemplates = system.pillows.length > 0 ? system.pillows : INITIAL_TEMPLATES;
        const template = allTemplates.find(t => t.id === giftCode.itemTemplateId);

        if (!template) return res.json({ success: false, message: "Loại vật phẩm này đã bị xóa khỏi hệ thống." });

        const newItem = {
            id: template.id,
            name: template.name,
            imgUrl: template.imgUrl,
            rarity: giftCode.rarity,
            uniqueId: Math.random().toString(36).substring(2, 9).toUpperCase(),
            obtainedAt: Date.now()
        };

        await User.findOneAndUpdate(
            { username },
            { $push: { inventory: { $each: [newItem], $position: 0 } } }
        );

        // ĐÁNH DẤU MÃ LÀ ĐÃ DÙNG
        giftCode.isUsed = true;
        giftCode.usedBy = username;
        await giftCode.save();

        return res.json({ success: true, item: newItem });
    } catch(err) { 
        console.error(err);
        res.status(500).json({ success:false, message: "Lỗi hệ thống" }); 
    }
});

app.get('/api/pillows', async (req, res) => {
    try {
        let system = await System.findOne({ id: 'main' });
        const data = (system && system.pillows && system.pillows.length > 0) ? system.pillows : INITIAL_TEMPLATES;
        res.json(data);
    } catch (err) { res.status(500).json({ success: false }); }
});

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
            const newPillow = { ...pillow, id: pillow.id ? Number(pillow.id) : Date.now() };
            system.pillows.unshift(newPillow);
        }
        system.markModified('pillows');
        await system.save();
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

app.post('/api/update-coins', async (req, res) => {
    try {
        const { username, amount } = req.body;
        const user = await User.findOneAndUpdate({ username }, { $inc: { coins: Number(amount) } }, { returnDocument: 'after' });
        res.json({ success: !!user, newBalance: user?.coins });
    } catch (e) { res.status(500).json({ success: false }); }
});

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






