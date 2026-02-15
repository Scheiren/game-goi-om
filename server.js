const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const mongoose = require('mongoose');
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
        const { username, amount } = req.body;
        const amountNum = Number(amount);
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
    } catch(err) { console.error(err); res.status(500).json({ success:false }); }
});

// 6. Exchange (Đổi code lấy gối) - Đã sửa sang MongoDB
app.post('/api/exchange', async (req, res) => {
    try {
        const { username, code } = req.body;
        if(!code || !code.startsWith('PIL-')) return res.status(400).json({success: false, message: "Code không hợp lệ"});
        
        const parts = code.split('-');
        if(parts.length >= 4) {
            const tid = parseInt(parts[1]);
            const rarity = parts[2];
            
            // Tìm gối trong DB Pillow
            const template = await Pillow.findOne({ id: tid });
            
            if(template && BASE_RARITY_CONFIG[rarity]) {
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

                return res.json({success: true, item: newItem});
            }
        }
        res.json({success: false, message: "Code lỗi hoặc không tồn tại"});
    } catch(err) { console.error(err); res.status(500).json({success:false}); }
});

// 7. Claim (Xóa item) - Đã sửa sang MongoDB
app.post('/api/claim', async (req, res) => {
    try {
        const { username, uniqueId, info } = req.body;
        const user = await User.findOne({ username });
        if (!user) return res.status(404).json({ success: false });

        const idx = user.inventory.findIndex(i => i.uniqueId === uniqueId);
        if(idx > -1) {
            user.inventory.splice(idx, 1);
            await user.save();
            console.log(`[CLAIM REQUEST] User: ${username} | ID: ${uniqueId}`, info);
            return res.json({success: true});
        } else return res.status(400).json({success:false});
    } catch(err) { console.error(err); res.status(500).json({success:false}); }
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
    } catch(err) { 
        console.error(err); 
        res.status(500).json({success:false, message: err.message}); 
    }
});

app.listen(PORT, () => {
    console.log(`Server running at port ${PORT}`);
});
