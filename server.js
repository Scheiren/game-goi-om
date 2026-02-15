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
    inventory: []
});
const User = mongoose.model('User', UserSchema);

const SystemSchema = new mongoose.Schema({
    id: { type: String, default: 'main' },
    totalPulls: { type: Number, default: 0 },
    pityCounter: { type: Number, default: 0 },
    pillows: { type: Array, default: [] }
});
const System = mongoose.model('System', SystemSchema);

// --- CONFIG ---
const BASE_RARITY_CONFIG = {
    F:   { baseChance: 0.30, value: 10 },
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

//Login/Register
app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;

        const usernameRegex = /^[a-zA-Z0-9_]{3,15}$/;
        if (!usernameRegex.test(username)) {
            return res.status(400).json({ 
                success: false, 
                message: 'Tên tài khoản không hợp lệ (3-15 ký tự, không chứa ký tự đặc biệt)' 
            });
        }

        const passRegex = /^[a-zA-Z0-9_]{3,18}$/;
        if (!passRegex.test(password)) {
            return res.status(400).json({ 
                success: false, 
                message: 'mật khẩu không hợp lệ (3-18 ký tự, không chứa ký tự đặc biệt)' 
            });
        }

        if (!username || !password) {
            return res.status(400).json({ success: false, message: 'Thiếu tài khoản hoặc mật khẩu' });
        }

        let user = await User.findOne({ username });
        let system = await System.findOne({ id: 'main' });
        if (!system) system = await System.create({ id: 'main', pillows: INITIAL_TEMPLATES });

        if (!user) {
            const hashedPassword = await bcrypt.hash(password, 10);
            const isFirstUser = (await User.countDocuments()) === 0;
            
            user = await User.create({ 
                username, 
                password: hashedPassword, 
                isAdmin: isFirstUser 
            });

            const userResponse = user.toObject();
            delete userResponse.password;

            return res.json({ 
                success: true, 
                message: "Đăng ký thành công",
                user: userResponse, 
                serverInfo: system 
            });
        } else {
            // ĐĂNG NHẬP
            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) {
                return res.status(401).json({ success: false, message: 'Mật khẩu không chính xác!' });
            }

            const userResponse = user.toObject();
            delete userResponse.password;

            return res.json({ 
                success: true, 
                message: "Đăng nhập thành công",
                user: userResponse, 
                serverInfo: system 
            });
        }
    } catch (err) {
        console.error("Lỗi Login:", err);
        res.status(500).json({ success: false, message: 'Lỗi hệ thống' });
    }
});

//Gacha
app.post('/api/gacha', async (req, res) => {
    try {
        const { username } = req.body;
        const COST = 100;
        
        const user = await User.findOne({ username });
        if (!user || user.coins < COST) return res.status(400).json({ success: false, message: "Không đủ xu" });

        let system = await System.findOne({ id: 'main' });
        
        const pityBonus = Math.floor(system.pityCounter / 200) * 0.001;
        let exChance = Math.min(BASE_RARITY_CONFIG.EX.baseChance + pityBonus, 0.1);

        let rarity = 'F';
        const rand = Math.random();
        let cumulative = 0;
        
        for (const [key, cfg] of Object.entries(BASE_RARITY_CONFIG)) {
            const chance = (key === 'EX') ? exChance : cfg.baseChance;
            cumulative += chance;
            if (rand < cumulative) { rarity = key; break; }
        }

        if (rarity === 'EX') system.pityCounter = 0;
        else system.pityCounter += 1;
        system.totalPulls += 1;

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
        
        // Cần markModified vì inventory là Array hỗn hợp
        user.markModified('inventory');
        await user.save();
        await system.save();

        res.json({ success: true, item: newItem, coins: user.coins, serverInfo: system });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Lỗi gacha' });
    }
});

//Burn
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

//Exchange
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

//Pillows
app.get('/api/pillows', async (req, res) => {
    try {
        let system = await System.findOne({ id: 'main' });
        
        // Nếu chưa có dữ liệu trong DB, lấy từ INITIAL_TEMPLATES làm mặc định
        const data = (system && system.pillows && system.pillows.length > 0) 
                     ? system.pillows 
                     : INITIAL_TEMPLATES;
        
        res.json(data);
    } catch (err) {
        res.status(500).json({ success: false, message: "Không thể lấy danh sách gối" });
    }
});

//Admin Pillow Management
app.post('/api/admin/pillow', async (req, res) => {
    try {
        const { pillow, action } = req.body;
        let system = await System.findOne({ id: 'main' });
        
        // Khởi tạo nếu chưa có
        if (!system) {
            system = new System({ id: 'main', pillows: INITIAL_TEMPLATES });
        }

        if (action === 'delete') {
            system.pillows = system.pillows.filter(p => p.id !== pillow.id);
        } else if (action === 'edit') {
            const idx = system.pillows.findIndex(p => p.id === pillow.id);
            if (idx !== -1) {
                system.pillows[idx] = { ...system.pillows[idx], ...pillow };
            }
        } else {
            // Thêm mới
            const newPillow = {
                ...pillow,
                id: pillow.id ? Number(pillow.id) : Date.now()
            };
            system.pillows.unshift(newPillow);
        }
        
        // QUAN TRỌNG: Mongoose cần cái này để biết mảng Array đã thay đổi
        system.markModified('pillows'); 
        await system.save();
        
        res.json({ success: true, updatedPillows: system.pillows });
    } catch(err) { 
        console.error(err);
        res.status(500).json({ success: false }); 
    }
});

//Checkin
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

//Update Coins
app.post('/api/update-coins', async (req, res) => {
    try {
        const { username, amount } = req.body;
        const user = await User.findOneAndUpdate(
            { username },
            { $inc: { coins: Number(amount) } },
            { returnDocument: 'after' }
        );
        res.json({ success: !!user, newBalance: user?.coins });
    } catch (e) { res.status(500).json({ success: false }); }
});

//API CLAIM
app.post('/api/claim', async (req, res) => {
    try {
        const { username, uniqueId, info } = req.body;

        const user = await User.findOne({ username });
        if (!user) {
            return res.status(404).json({ success: false, message: "Người dùng không tồn tại" });
        }

        const itemIndex = user.inventory.findIndex(i => i.uniqueId === uniqueId);
        
        if (itemIndex > -1) {
            const claimedItem = user.inventory[itemIndex];

            user.inventory.splice(itemIndex, 1);
            
            await user.save();

            console.log(`--- [NEW CLAIM REQUEST] ---`);
            console.log(`User: ${username}`);
            console.log(`Item: ${claimedItem.name} (Rarity: ${claimedItem.rarity})`);
            console.log(`Unique ID: ${uniqueId}`);
            console.log(`Shipping Info:`, info);
            console.log(`---------------------------`);

            return res.json({ 
                success: true, 
                message: "Gửi yêu cầu nhận quà thành công!" 
            });
        } else {
            return res.status(400).json({ 
                success: false, 
                message: "Vật phẩm không tồn tại trong túi đồ" 
            });
        }
    } catch (err) {
        console.error("Lỗi Claim:", err);
        res.status(500).json({ success: false, message: "Lỗi hệ thống khi xử lý claim" });
    }
});

app.listen(PORT, () => console.log(`Server running at port ${PORT}`));