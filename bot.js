const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const FormData = require('form-data');

// ========== KONFIGURASI ==========
const BOT_TOKEN = "8715900599:AAHmXeMfzK5dyyDpsvU2u3YfjbQfvxxFdWc";
const OWNER_ID = 7293981502;
const API_URL = `https://api.telegram.org/bot${BOT_TOKEN}`;

const PAKET = {
    member: { nama: "MEMBER (PERMANEN)", harga: 60000 },
    reseller: { nama: "RESELLER (PERMANEN)", harga: 80000 },
    pt: { nama: "PT (PERMANEN)", harga: 100000 },
    tk: { nama: "TK (PERMANEN)", harga: 150000 },
    owner: { nama: "OWNER (PERMANEN)", harga: 200000 }
};

// ========== DATABASE ==========
let db;

function initDb() {
    return new Promise((resolve, reject) => {
        db = new sqlite3.Database('bot_database.db', (err) => {
            if (err) reject(err);
            console.log('✅ Database terhubung');
            
            db.run(`CREATE TABLE IF NOT EXISTS users (
                user_id INTEGER PRIMARY KEY,
                username TEXT,
                full_name TEXT,
                status TEXT DEFAULT 'pending',
                paket TEXT,
                password TEXT,
                tanggal_daftar TEXT
            )`);
            
            db.run(`CREATE TABLE IF NOT EXISTS transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                paket TEXT,
                harga INTEGER,
                bukti_path TEXT,
                status TEXT DEFAULT 'pending',
                tanggal TEXT
            )`);
            
            db.run(`CREATE TABLE IF NOT EXISTS temp_paket (
                user_id INTEGER PRIMARY KEY,
                paket TEXT,
                harga INTEGER,
                timestamp REAL
            )`, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    });
}

function generatePassword(length = 8) {
    return crypto.randomBytes(length).toString('hex').slice(0, length);
}

function saveTempPaket(userId, paketNama, paketHarga) {
    return new Promise((resolve, reject) => {
        db.run(`INSERT OR REPLACE INTO temp_paket (user_id, paket, harga, timestamp) VALUES (?, ?, ?, ?)`,
            [userId, paketNama, paketHarga, Date.now() / 1000], (err) => {
                if (err) reject(err);
                else resolve();
            });
    });
}

function getTempPaket(userId) {
    return new Promise((resolve, reject) => {
        db.get(`SELECT paket, harga FROM temp_paket WHERE user_id = ?`, [userId], (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

function clearTempPaket(userId) {
    return new Promise((resolve, reject) => {
        db.run(`DELETE FROM temp_paket WHERE user_id = ?`, [userId], (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

function saveUser(userId, username, fullName) {
    return new Promise((resolve, reject) => {
        db.run(`INSERT OR REPLACE INTO users (user_id, username, full_name, tanggal_daftar) VALUES (?, ?, ?, ?)`,
            [userId, username, fullName, new Date().toISOString()], (err) => {
                if (err) reject(err);
                else resolve();
            });
    });
}

function updateUserStatus(userId, status, paket = null, password = null) {
    return new Promise((resolve, reject) => {
        let sql, params;
        if (paket && password) {
            sql = `UPDATE users SET status = ?, paket = ?, password = ? WHERE user_id = ?`;
            params = [status, paket, password, userId];
        } else if (paket) {
            sql = `UPDATE users SET status = ?, paket = ? WHERE user_id = ?`;
            params = [status, paket, userId];
        } else {
            sql = `UPDATE users SET status = ? WHERE user_id = ?`;
            params = [status, userId];
        }
        db.run(sql, params, (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

function getUserStatus(userId) {
    return new Promise((resolve, reject) => {
        db.get(`SELECT status, paket, password FROM users WHERE user_id = ?`, [userId], (err, row) => {
            if (err) reject(err);
            else resolve(row || { status: null, paket: null, password: null });
        });
    });
}

function saveTransaction(userId, paket, harga, buktiPath) {
    return new Promise((resolve, reject) => {
        db.run(`INSERT INTO transactions (user_id, paket, harga, bukti_path, tanggal) VALUES (?, ?, ?, ?, ?)`,
            [userId, paket, harga, buktiPath, new Date().toISOString()], function(err) {
                if (err) reject(err);
                else resolve(this.lastID);
            });
    });
}

function getTransaction(transId) {
    return new Promise((resolve, reject) => {
        db.get(`SELECT user_id, paket, harga, bukti_path, status FROM transactions WHERE id = ?`, [transId], (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

function updateTransactionStatus(transId, status) {
    return new Promise((resolve, reject) => {
        db.run(`UPDATE transactions SET status = ? WHERE id = ?`, [status, transId], (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

// ========== FUNGSI TELEGRAM ==========
async function sendMessage(chatId, text, replyMarkup = null) {
    try {
        const data = { chat_id: chatId, text: text, parse_mode: "Markdown" };
        if (replyMarkup) {
            data.reply_markup = JSON.stringify(replyMarkup);
        }
        await axios.post(`${API_URL}/sendMessage`, data);
    } catch (error) {
        console.error('Send message error:', error.message);
    }
}

async function sendVideoWithCaption(chatId, videoPath, caption, replyMarkup = null) {
    try {
        const form = new FormData();
        form.append('chat_id', chatId);
        form.append('video', fs.createReadStream(videoPath));
        form.append('caption', caption);
        form.append('parse_mode', 'Markdown');
        if (replyMarkup) {
            form.append('reply_markup', JSON.stringify(replyMarkup));
        }
        await axios.post(`${API_URL}/sendVideo`, form, {
            headers: { ...form.getHeaders() }
        });
    } catch (error) {
        console.error('Send video error:', error.message);
    }
}

async function sendPhoto(chatId, photoPath, caption = null, replyMarkup = null) {
    try {
        const form = new FormData();
        form.append('chat_id', chatId);
        form.append('photo', fs.createReadStream(photoPath));
        if (caption) form.append('caption', caption);
        if (replyMarkup) form.append('reply_markup', JSON.stringify(replyMarkup));
        
        await axios.post(`${API_URL}/sendPhoto`, form, {
            headers: { ...form.getHeaders() }
        });
    } catch (error) {
        console.error('Send photo error:', error.message);
    }
}

async function sendDocument(chatId, docPath, caption = null) {
    try {
        const form = new FormData();
        form.append('chat_id', chatId);
        form.append('document', fs.createReadStream(docPath));
        if (caption) form.append('caption', caption);
        
        await axios.post(`${API_URL}/sendDocument`, form, {
            headers: { ...form.getHeaders() }
        });
    } catch (error) {
        console.error('Send document error:', error.message);
    }
}

async function answerCallbackQuery(callbackId) {
    try {
        await axios.post(`${API_URL}/answerCallbackQuery`, { callback_query_id: callbackId });
    } catch (error) {
        console.error('Answer callback error:', error.message);
    }
}

// ========== HANDLER ==========
async function handleStart(chatId, userId, username, fullName) {
    await saveUser(userId, username, fullName);
    const userStatus = await getUserStatus(userId);
    const videoExists = fs.existsSync("video.mp4");
    
    if (userStatus.status === 'active') {
        const msg = `✅ Selamat datang kembali, ${fullName}!\n\n👤 Username: @${username}\n🆔 ID: \`${userId}\`\n🏷️ Paket: ${userStatus.paket}\n\nSilakan klik tombol di bawah:`;
        const keyboard = { inline_keyboard: [[{ text: "🔐 DATA AKUN + APK", callback_data: "data_akun_dan_apk" }]] };
        
        if (videoExists) {
            await sendVideoWithCaption(chatId, "video.mp4", msg, keyboard);
        } else {
            await sendMessage(chatId, msg, keyboard);
        }
    } else {
        const msg = `🎉 Selamat datang, ${fullName}! 🎉\n\n👤 Username: @${username}\n🆔 ID: \`${userId}\`\n\nSilakan klik tombol di bawah untuk memesan:`;
        const keyboard = { inline_keyboard: [[{ text: "📱 ORDER APK BUG", callback_data: "order_apk" }]] };
        
        if (videoExists) {
            await sendVideoWithCaption(chatId, "video.mp4", msg, keyboard);
        } else {
            await sendMessage(chatId, msg, keyboard);
        }
    }
}

async function handleOrderApk(chatId, userId, username) {
    const userStatus = await getUserStatus(userId);
    const videoExists = fs.existsSync("video.mp4");
    
    if (userStatus.status === 'active') {
        const msg = `✅ Anda sudah memiliki paket aktif!\n\n👤 @${username}\n🏷️ Paket: ${userStatus.paket}\n\nSilakan klik tombol di bawah:`;
        const keyboard = { inline_keyboard: [[{ text: "🔐 DATA AKUN + APK", callback_data: "data_akun_dan_apk" }]] };
        
        if (videoExists) {
            await sendVideoWithCaption(chatId, "video.mp4", msg, keyboard);
        } else {
            await sendMessage(chatId, msg, keyboard);
        }
        return;
    }
    
    const msg = `🔰 DAFTAR HARGA PAKET PERMANEN 🔰\n\n👤 @${username}\n🆔 \`${userId}\`\n\nSilakan pilih paket di bawah ini:`;
    const keyboard = {
        inline_keyboard: [
            [{ text: "👤 MEMBER (PERMANEN) - Rp60.000", callback_data: "pilih_member" }],
            [{ text: "🚀 RESELLER (PERMANEN) - Rp80.000", callback_data: "pilih_reseller" }],
            [{ text: "⭐ PT (PERMANEN) - Rp100.000", callback_data: "pilih_pt" }],
            [{ text: "👑 TK (PERMANEN) - Rp150.000", callback_data: "pilih_tk" }],
            [{ text: "💎 OWNER (PERMANEN) - Rp200.000", callback_data: "pilih_owner" }]
        ]
    };
    
    if (videoExists) {
        await sendVideoWithCaption(chatId, "video.mp4", msg, keyboard);
    } else {
        await sendMessage(chatId, msg, keyboard);
    }
}

async function handlePilihPaket(chatId, userId, paketKode) {
    const userStatus = await getUserStatus(userId);
    
    if (userStatus.status === 'active') {
        await sendMessage(chatId, "❌ Anda sudah memiliki paket aktif!");
        return;
    }
    
    const paket = PAKET[paketKode];
    await saveTempPaket(userId, paket.nama, paket.harga);
    
    const msg = `💳 PEMBAYARAN ${paket.nama}\n\n📱 Paket: ${paket.nama}\n💰 Harga: Rp${paket.harga.toLocaleString()}\n🆔 User ID: \`${userId}\`\n\n📌 Scan QRIS di bawah, lalu upload bukti detail transaksi.`;
    
    await sendMessage(chatId, msg);
    
    if (fs.existsSync("qris.jpg")) {
        await sendPhoto(chatId, "qris.jpg", "🖼️ Scan QRIS di atas untuk membayar");
        await sendMessage(chatId, "setelah transfer, upload bukti detail transaksi");
    } else {
        await sendMessage(chatId, "⚠️ QRIS sedang tidak tersedia, hubungi admin.");
    }
}

async function handleBukti(chatId, userId, username, fullName, fileId) {
    const temp = await getTempPaket(userId);
    
    if (!temp) {
        await sendMessage(chatId, "❌ Silakan pilih paket terlebih dahulu. Ketik /start dan pilih paket.");
        return;
    }
    
    const paketNama = temp.paket;
    const paketHarga = temp.harga;
    
    try {
        const fileResponse = await axios.get(`${API_URL}/getFile`, { params: { file_id: fileId } });
        
        if (fileResponse.data.ok) {
            const filePath = fileResponse.data.result.file_path;
            const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;
            
            if (!fs.existsSync('bukti')) {
                fs.mkdirSync('bukti');
            }
            
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const buktiPath = `bukti/${userId}_${timestamp}.jpg`;
            
            const imgResponse = await axios.get(fileUrl, { responseType: 'arraybuffer' });
            fs.writeFileSync(buktiPath, imgResponse.data);
            
            const transId = await saveTransaction(userId, paketNama, paketHarga, buktiPath);
            
            await sendMessage(chatId, `✅ Bukti pembayaran terkirim!\n🆔 ID Transaksi: \`${transId}\`\n\n⏳ Menunggu konfirmasi admin...`);
            
            const msg = `🆕 PERMINTAAN KONFIRMASI PEMBAYARAN\n\n👤 Nama: ${fullName}\n👤 Username: @${username}\n🆔 User ID: \`${userId}\`\n📱 Paket: ${paketNama}\n💰 Harga: Rp${paketHarga.toLocaleString()}\n🆔 Transaksi: \`${transId}\``;
            
            const keyboard = {
                inline_keyboard: [
                    [{ text: "✅ TERIMA", callback_data: `terima_${transId}` }],
                    [{ text: "❌ TOLAK", callback_data: `tolak_${transId}` }]
                ]
            };
            
            await sendPhoto(OWNER_ID, buktiPath, msg, keyboard);
            await clearTempPaket(userId);
        }
    } catch (error) {
        console.error('Handle bukti error:', error);
        await sendMessage(chatId, "❌ Gagal memproses bukti. Silakan coba lagi.");
    }
}

async function handleKonfirmasi(userId, paket, transId, action) {
    if (action === 'terima') {
        const passwordAcak = generatePassword();
        await updateTransactionStatus(transId, 'approved');
        await updateUserStatus(userId, 'active', paket, passwordAcak);
        
        const msg = `✅ PEMBAYARAN DISETUJUI!\n\n📱 Paket: ${paket}\n✅ Akses Anda sudah aktif.\n\nSilakan klik tombol di bawah:`;
        const keyboard = { inline_keyboard: [[{ text: "🔐 DATA AKUN + APK", callback_data: "data_akun_dan_apk" }]] };
        const videoExists = fs.existsSync("video.mp4");
        
        if (videoExists) {
            await sendVideoWithCaption(userId, "video.mp4", msg, keyboard);
        } else {
            await sendMessage(userId, msg, keyboard);
        }
    } else if (action === 'tolak') {
        await updateTransactionStatus(transId, 'rejected');
        await sendMessage(userId, "❌ PEMBAYARAN DITOLAK!\n\nSilakan upload ulang bukti pembayaran yang valid.");
    }
}

async function handleDataAkunDanApk(chatId, userId) {
    const userStatus = await getUserStatus(userId);
    
    if (userStatus.status !== 'active') {
        await sendMessage(chatId, "❌ Anda belum memiliki akses. Silakan beli paket terlebih dahulu.");
        return;
    }
    
    let username = "-";
    try {
        const chatResponse = await axios.get(`${API_URL}/getChat`, { params: { chat_id: chatId } });
        if (chatResponse.data.ok && chatResponse.data.result.username) {
            username = chatResponse.data.result.username;
        }
    } catch (error) {}
    
    const msg = `🔐 DATA AKUN + APK\n\n👤 Username : @${username}\n🔑 Password: \`${userStatus.password}\`\n\n🏷️ Paket: ${userStatus.paket}\n🆔 User ID: \`${chatId}\`\n\n📌 Simpan data akun Anda dengan aman.`;
    
    const videoExists = fs.existsSync("video.mp4");
    if (videoExists) {
        await sendVideoWithCaption(chatId, "video.mp4", msg);
    } else {
        await sendMessage(chatId, msg);
    }
    
    if (fs.existsSync("FortuneBeta.apk")) {
        await sendDocument(chatId, "FortuneBeta.apk", "📱 Berikut adalah file APK FortuneBeta");
    } else {
        await sendMessage(chatId, "❌ File APK sedang tidak tersedia. Silakan hubungi admin.");
    }
}

// ========== MAIN LOOP ==========
let lastUpdateId = 0;

async function getUpdates() {
    try {
        const response = await axios.get(`${API_URL}/getUpdates`, {
            params: { timeout: 30, offset: lastUpdateId + 1 }
        });
        return response.data.result || [];
    } catch (error) {
        console.error('Get updates error:', error.message);
        return [];
    }
}

async function main() {
    await initDb();
    console.log("✅ Bot sedang berjalan...");
    console.log("📹 Video dan text digabung dalam satu pesan");
    
    while (true) {
        try {
            const updates = await getUpdates();
            
            for (const update of updates) {
                lastUpdateId = update.update_id;
                
                // Handle callback query (tombol)
                if (update.callback_query) {
                    const callback = update.callback_query;
                    const callbackId = callback.id;
                    const data = callback.data;
                    const chatId = callback.message.chat.id;
                    const userId = callback.from.id;
                    const username = callback.from.username || "-";
                    
                    if (data === "order_apk") {
                        await handleOrderApk(chatId, userId, username);
                    } else if (data === "data_akun_dan_apk") {
                        await handleDataAkunDanApk(chatId, userId);
                    } else if (data.startsWith("pilih_")) {
                        const paketKode = data.replace("pilih_", "");
                        await handlePilihPaket(chatId, userId, paketKode);
                    } else if (data.startsWith("terima_")) {
                        const transId = parseInt(data.split("_")[1]);
                        const trans = await getTransaction(transId);
                        if (trans) {
                            await handleKonfirmasi(trans.user_id, trans.paket, transId, "terima");
                        }
                    } else if (data.startsWith("tolak_")) {
                        const transId = parseInt(data.split("_")[1]);
                        const trans = await getTransaction(transId);
                        if (trans) {
                            await handleKonfirmasi(trans.user_id, trans.paket, transId, "tolak");
                        }
                    }
                    
                    await answerCallbackQuery(callbackId);
                }
                
                // Handle message
                else if (update.message) {
                    const msg = update.message;
                    const chatId = msg.chat.id;
                    const userId = msg.from.id;
                    const username = msg.from.username || "-";
                    const fullName = `${msg.from.first_name || ''} ${msg.from.last_name || ''}`.trim();
                    
                    if (msg.text === "/start") {
                        await handleStart(chatId, userId, username, fullName);
                    } else if (msg.photo) {
                        const fileId = msg.photo[msg.photo.length - 1].file_id;
                        await handleBukti(chatId, userId, username, fullName, fileId);
                    } else if (msg.text) {
                        await sendMessage(chatId, "❌ Perintah tidak dikenal. Ketik /start untuk memulai.");
                    }
                }
            }
            
            await new Promise(resolve => setTimeout(resolve, 1000));
            
        } catch (error) {
            console.error("Error:", error);
            await new Promise(resolve => setTimeout(resolve, 10000));
        }
    }
}

// ========== START ==========
main();