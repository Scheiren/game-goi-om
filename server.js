const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const mongoose = require('mongoose');
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
    inventory: []
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

// --- MIDDLEWARE ---
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- API ENDPOINTS ---

//Login/Register
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

            const userResponse = user.toObject();
            delete userResponse.password;

        res.json({ success: true, user, username: user.username, serverInfo: system });
    } catch (err) {
        console.error("Lỗi Login:", err);
        res.status(500).json({ success: false, message: 'Lỗi hệ thống' });
    }
});

// Middleware xác thực
function authenticateToken(req, res, next) {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, message: 'No token' });
    
    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ success: false, message: 'Invalid token' });
        req.user = user;
        next();
    });
}

//Gacha
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
        
        const chances = Object.keys(base).map(key => ({ 
            key, 
            chance: key === 'EX' ? exChance : base[key].baseChance 
        }));

        for (const item of chances) {
            cumulative += item.chance;
            if (rand < cumulative) { rarity = item.key; break; }
        }

        // Reset pity if EX
        if (rarity === 'EX') system.pityCounter = 0;
        else system.pityCounter += 1;
        system.totalPulls += 1;

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

        user.coins -= COST;
        user.inventory.unshift(newItem);
        
        await user.save();
        await system.save();

        res.json({ success: true, item: newItem, coins: user.coins, serverInfo: system });
    } catch (err) {
        res.status(500).json({ success: false, message: 'Lỗi gacha' });
    }
});

// 3. Update Coins
app.post('/api/update-coins', (req, res) => {
  try {
    const { username, amount, adminKey } = req.body;
    const db = readDB();
    if (!username || !db.users[username]) return res.status(404).json({ success: false, message: 'User not found' });

    const amt = Number(amount || 0);
    if (!Number.isFinite(amt) || Math.floor(amt) !== amt) return res.status(400).json({ success: false, message: 'Invalid amount' });

    // DEDUCT: cho phép client yêu cầu trừ xu (ví dụ đặt cược) nhưng phải có đủ xu trên server
    if (amt < 0) {
      const current = Number(db.users[username].coins || 0);
      if (current < Math.abs(amt)) return res.status(400).json({ success: false, message: 'Insufficient coins' });
      db.users[username].coins = current + amt;
      writeDB(db);
      return res.json({ success: true, newBalance: db.users[username].coins });
    }

    // CREDIT: không cho client trực tiếp cộng xu trừ khi có ADMIN_KEY (set trong .env) 
    if (amt > 0) {
      if (process.env.ADMIN_KEY && adminKey === process.env.ADMIN_KEY) {
        db.users[username].coins = (Number(db.users[username].coins || 0) + amt);
        writeDB(db);
        return res.json({ success: true, newBalance: db.users[username].coins });
      } else {
        return res.status(403).json({ success: false, message: 'Credit not allowed from client' });
      }
    }

    // amount === 0 (noop)
    return res.json({ success: true, newBalance: db.users[username].coins });
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
    } catch(err) { console.error(err); res.status(500).json({ success:false }); }
});

//Exchange (Nhập code lấy gối) - FIX CHÍNH
app.post('/api/exchange', async (req, res) => {
    try {
        const { username, code } = req.body;
        if (!code || !code.startsWith('PIL-')) return res.status(400).json({ success: false, message: "Code không hợp lệ" });

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

//
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

//Admin Pillow Management - FIX CHÍNH
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

