import requests
import sqlite3
import os
import random
import string
import time
import json
from datetime import datetime

# ========== KONFIGURASI ==========
BOT_TOKEN = "8715900599:AAHmXeMfzK5dyyDpsvU2u3YfjbQfvxxFdWc"
OWNER_ID = 7293981502
API_URL = f"https://api.telegram.org/bot{BOT_TOKEN}"

PAKET = {
    "member": {"nama": "MEMBER (PERMANEN)", "harga": 60000},
    "reseller": {"nama": "RESELLER (PERMANEN)", "harga": 80000},
    "pt": {"nama": "PT (PERMANEN)", "harga": 100000},
    "tk": {"nama": "TK (PERMANEN)", "harga": 150000},
    "owner": {"nama": "OWNER (PERMANEN)", "harga": 200000}
}

# ========== DATABASE ==========
def init_db():
    conn = sqlite3.connect('bot_database.db')
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS users
                 (user_id INTEGER PRIMARY KEY, username TEXT, full_name TEXT, status TEXT DEFAULT 'pending', paket TEXT, password TEXT, tanggal_daftar TEXT)''')
    c.execute('''CREATE TABLE IF NOT EXISTS transactions
                 (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, paket TEXT, harga INTEGER, bukti_path TEXT, status TEXT DEFAULT 'pending', tanggal TEXT)''')
    c.execute('''CREATE TABLE IF NOT EXISTS temp_paket
                 (user_id INTEGER PRIMARY KEY, paket TEXT, harga INTEGER, timestamp REAL)''')
    conn.commit()
    conn.close()

init_db()

def save_temp_paket(user_id, paket_nama, paket_harga):
    conn = sqlite3.connect('bot_database.db')
    c = conn.cursor()
    c.execute("INSERT OR REPLACE INTO temp_paket (user_id, paket, harga, timestamp) VALUES (?, ?, ?, ?)",
              (user_id, paket_nama, paket_harga, time.time()))
    conn.commit()
    conn.close()

def get_temp_paket(user_id):
    conn = sqlite3.connect('bot_database.db')
    c = conn.cursor()
    c.execute("SELECT paket, harga FROM temp_paket WHERE user_id = ?", (user_id,))
    result = c.fetchone()
    conn.close()
    return result

def clear_temp_paket(user_id):
    conn = sqlite3.connect('bot_database.db')
    c = conn.cursor()
    c.execute("DELETE FROM temp_paket WHERE user_id = ?", (user_id,))
    conn.commit()
    conn.close()

def save_user(user_id, username, full_name):
    conn = sqlite3.connect('bot_database.db')
    c = conn.cursor()
    c.execute("INSERT OR REPLACE INTO users (user_id, username, full_name, tanggal_daftar) VALUES (?, ?, ?, ?)",
              (user_id, username, full_name, datetime.now().strftime("%Y-%m-%d %H:%M:%S")))
    conn.commit()
    conn.close()

def update_user_status(user_id, status, paket=None, password=None):
    conn = sqlite3.connect('bot_database.db')
    c = conn.cursor()
    if paket and password:
        c.execute("UPDATE users SET status = ?, paket = ?, password = ? WHERE user_id = ?", (status, paket, password, user_id))
    elif paket:
        c.execute("UPDATE users SET status = ?, paket = ? WHERE user_id = ?", (status, paket, user_id))
    else:
        c.execute("UPDATE users SET status = ? WHERE user_id = ?", (status, user_id))
    conn.commit()
    conn.close()

def get_user_status(user_id):
    conn = sqlite3.connect('bot_database.db')
    c = conn.cursor()
    c.execute("SELECT status, paket, password FROM users WHERE user_id = ?", (user_id,))
    result = c.fetchone()
    conn.close()
    return result if result else (None, None, None)

def save_transaction(user_id, paket, harga, bukti_path):
    conn = sqlite3.connect('bot_database.db')
    c = conn.cursor()
    c.execute("INSERT INTO transactions (user_id, paket, harga, bukti_path, tanggal) VALUES (?, ?, ?, ?, ?)",
              (user_id, paket, harga, bukti_path, datetime.now().strftime("%Y-%m-%d %H:%M:%S")))
    trans_id = c.lastrowid
    conn.commit()
    conn.close()
    return trans_id

def get_transaction(trans_id):
    conn = sqlite3.connect('bot_database.db')
    c = conn.cursor()
    c.execute("SELECT user_id, paket, harga, bukti_path, status FROM transactions WHERE id = ?", (trans_id,))
    result = c.fetchone()
    conn.close()
    return result

def update_transaction_status(trans_id, status):
    conn = sqlite3.connect('bot_database.db')
    c = conn.cursor()
    c.execute("UPDATE transactions SET status = ? WHERE id = ?", (status, trans_id))
    conn.commit()
    conn.close()

def generate_password(length=8):
    characters = string.ascii_letters + string.digits
    return ''.join(random.choice(characters) for _ in range(length))

# ========== FUNGSI TELEGRAM ==========
def send_message(chat_id, text, reply_markup=None):
    url = f"{API_URL}/sendMessage"
    data = {"chat_id": chat_id, "text": text, "parse_mode": "Markdown"}
    if reply_markup:
        data["reply_markup"] = json.dumps(reply_markup)
    try:
        return requests.post(url, data=data, timeout=30).json()
    except:
        return {"ok": False}

def send_video_with_caption(chat_id, video_path, caption, reply_markup=None):
    """Kirim video dengan caption (teks di dalam pesan video)"""
    url = f"{API_URL}/sendVideo"
    data = {"chat_id": chat_id, "caption": caption, "parse_mode": "Markdown"}
    if reply_markup:
        data["reply_markup"] = json.dumps(reply_markup)
    with open(video_path, 'rb') as video:
        files = {"video": video}
        return requests.post(url, data=data, files=files, timeout=30).json()

def send_photo(chat_id, photo_path, caption=None, reply_markup=None):
    url = f"{API_URL}/sendPhoto"
    data = {"chat_id": chat_id, "caption": caption, "parse_mode": "Markdown"}
    if reply_markup:
        data["reply_markup"] = json.dumps(reply_markup)
    with open(photo_path, 'rb') as photo:
        files = {"photo": photo}
        return requests.post(url, data=data, files=files, timeout=30).json()

def send_document(chat_id, doc_path, caption=None):
    url = f"{API_URL}/sendDocument"
    data = {"chat_id": chat_id, "caption": caption}
    with open(doc_path, 'rb') as doc:
        files = {"document": doc}
        return requests.post(url, data=data, files=files, timeout=30).json()

def get_updates(offset=None):
    url = f"{API_URL}/getUpdates"
    params = {"timeout": 30}
    if offset:
        params["offset"] = offset
    try:
        response = requests.get(url, params=params, timeout=35)
        return response.json().get("result", [])
    except:
        return []

# ========== HANDLER ==========
def handle_start(chat_id, user_id, username, full_name):
    save_user(user_id, username, full_name)
    status, paket_user, _ = get_user_status(user_id)
    
    if status == 'active':
        msg = f"✅ Selamat datang kembali, {full_name}!\n\n👤 Username: @{username}\n🆔 ID: `{user_id}`\n🏷️ Paket: {paket_user}\n\nSilakan klik tombol di bawah:"
        keyboard = {"inline_keyboard": [[{"text": "🔐 DATA AKUN + APK", "callback_data": "data_akun_dan_apk"}]]}
        
        # Kirim video dengan caption (gabung jadi satu)
        if os.path.exists("video.mp4"):
            send_video_with_caption(chat_id, "video.mp4", msg, keyboard)
        else:
            send_message(chat_id, msg, keyboard)
    else:
        msg = f"🎉 Selamat datang, {full_name}! 🎉\n\n👤 Username: @{username}\n🆔 ID: `{user_id}`\n\nSilakan klik tombol di bawah untuk memesan:"
        keyboard = {"inline_keyboard": [[{"text": "📱 ORDER APK BUG", "callback_data": "order_apk"}]]}
        
        # Kirim video dengan caption (gabung jadi satu)
        if os.path.exists("video.mp4"):
            send_video_with_caption(chat_id, "video.mp4", msg, keyboard)
        else:
            send_message(chat_id, msg, keyboard)

def handle_order_apk(chat_id, user_id, username):
    status, paket_user, _ = get_user_status(user_id)
    
    if status == 'active':
        msg = f"✅ Anda sudah memiliki paket aktif!\n\n👤 @{username}\n🏷️ Paket: {paket_user}\n\nSilakan klik tombol di bawah:"
        keyboard = {"inline_keyboard": [[{"text": "🔐 DATA AKUN + APK", "callback_data": "data_akun_dan_apk"}]]}
        
        if os.path.exists("video.mp4"):
            send_video_with_caption(chat_id, "video.mp4", msg, keyboard)
        else:
            send_message(chat_id, msg, keyboard)
        return
    
    msg = f"🔰 DAFTAR HARGA PAKET PERMANEN 🔰\n\n👤 @{username}\n🆔 `{user_id}`\n\nSilakan pilih paket di bawah ini:"
    keyboard = {
        "inline_keyboard": [
            [{"text": "👤 MEMBER (PERMANEN) - Rp60.000", "callback_data": "pilih_member"}],
            [{"text": "🚀 RESELLER (PERMANEN) - Rp80.000", "callback_data": "pilih_reseller"}],
            [{"text": "⭐ PT (PERMANEN) - Rp100.000", "callback_data": "pilih_pt"}],
            [{"text": "👑 TK (PERMANEN) - Rp150.000", "callback_data": "pilih_tk"}],
            [{"text": "💎 OWNER (PERMANEN) - Rp200.000", "callback_data": "pilih_owner"}]
        ]
    }
    
    if os.path.exists("video.mp4"):
        send_video_with_caption(chat_id, "video.mp4", msg, keyboard)
    else:
        send_message(chat_id, msg, keyboard)

def handle_pilih_paket(chat_id, user_id, paket_kode):
    status, _, _ = get_user_status(user_id)
    
    if status == 'active':
        send_message(chat_id, "❌ Anda sudah memiliki paket aktif!")
        return
    
    paket = PAKET[paket_kode]
    
    # SIMPAN PILIHAN PAKET KE DATABASE SEMENTARA
    save_temp_paket(user_id, paket['nama'], paket['harga'])
    
    msg = f"💳 PEMBAYARAN {paket['nama']}\n\n📱 Paket: {paket['nama']}\n💰 Harga: Rp{paket['harga']:,}\n🆔 User ID: `{user_id}`\n\n📌 Scan QRIS di bawah, lalu upload bukti detail transaksi."
    
    send_message(chat_id, msg)
    
    if os.path.exists("qris.jpg"):
        send_photo(chat_id, "qris.jpg", "🖼️ Scan QRIS di atas untuk membayar")
        send_message(chat_id, "setelah transfer, upload bukti detail transaksi")
    else:
        send_message(chat_id, "⚠️ QRIS sedang tidak tersedia, hubungi admin.")

def handle_bukti(chat_id, user_id, username, full_name, file_id):
    # CEK APAKAH USER SUDAH MEMILIH PAKET
    temp = get_temp_paket(user_id)
    
    if not temp:
        send_message(chat_id, "❌ Silakan pilih paket terlebih dahulu. Ketik /start dan pilih paket.")
        return
    
    paket_nama, paket_harga = temp
    
    # Download foto bukti
    url = f"{API_URL}/getFile"
    params = {"file_id": file_id}
    
    try:
        response = requests.get(url, params=params, timeout=30).json()
        
        if response.get("ok"):
            file_path = response["result"]["file_path"]
            file_url = f"https://api.telegram.org/file/bot{BOT_TOKEN}/{file_path}"
            
            if not os.path.exists('bukti'):
                os.makedirs('bukti')
            
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            bukti_path = f"bukti/{user_id}_{timestamp}.jpg"
            
            img_data = requests.get(file_url, timeout=30).content
            with open(bukti_path, 'wb') as handler:
                handler.write(img_data)
            
            trans_id = save_transaction(user_id, paket_nama, paket_harga, bukti_path)
            
            send_message(chat_id, f"✅ Bukti pembayaran terkirim!\n🆔 ID Transaksi: `{trans_id}`\n\n⏳ Menunggu konfirmasi admin...")
            
            # Kirim ke owner
            msg = f"🆕 PERMINTAAN KONFIRMASI PEMBAYARAN\n\n👤 Nama: {full_name}\n👤 Username: @{username}\n🆔 User ID: `{user_id}`\n📱 Paket: {paket_nama}\n💰 Harga: Rp{paket_harga:,}\n🆔 Transaksi: `{trans_id}`"
            
            keyboard = {
                "inline_keyboard": [
                    [{"text": "✅ TERIMA", "callback_data": f"terima_{trans_id}"}],
                    [{"text": "❌ TOLAK", "callback_data": f"tolak_{trans_id}"}]
                ]
            }
            
            send_photo(OWNER_ID, bukti_path, msg, keyboard)
            
            # HAPUS DATA SEMENTARA SETELAH TRANSAKSI
            clear_temp_paket(user_id)
            
    except Exception as e:
        send_message(chat_id, "❌ Gagal memproses bukti. Silakan coba lagi.")

def handle_konfirmasi(user_id, paket, trans_id, action):
    if action == 'terima':
        password_acak = generate_password()
        update_transaction_status(trans_id, 'approved')
        update_user_status(user_id, 'active', paket, password_acak)
        
        msg = f"✅ PEMBAYARAN DISETUJUI!\n\n📱 Paket: {paket}\n✅ Akses Anda sudah aktif.\n\nSilakan klik tombol di bawah:"
        keyboard = {"inline_keyboard": [[{"text": "🔐 DATA AKUN + APK", "callback_data": "data_akun_dan_apk"}]]}
        
        # Kirim video dengan caption (gabung jadi satu)
        if os.path.exists("video.mp4"):
            send_video_with_caption(user_id, "video.mp4", msg, keyboard)
        else:
            send_message(user_id, msg, keyboard)
        
    elif action == 'tolak':
        update_transaction_status(trans_id, 'rejected')
        send_message(user_id, "❌ PEMBAYARAN DITOLAK!\n\nSilakan upload ulang bukti pembayaran yang valid.")

def handle_data_akun_dan_apk(chat_id, user_id):
    status, paket, password = get_user_status(user_id)
    
    if status != 'active':
        send_message(chat_id, "❌ Anda belum memiliki akses. Silakan beli paket terlebih dahulu.")
        return
    
    username = "-"
    try:
        url = f"{API_URL}/getChat"
        params = {"chat_id": chat_id}
        response = requests.get(url, params=params, timeout=30).json()
        if response.get("ok") and response["result"].get("username"):
            username = response["result"]["username"]
    except:
        pass
    
    msg = (f"🔐 DATA AKUN + APK\n\n"
           f"👤 Username : @{username}\n"
           f"🔑 Password: `{password}`\n\n"
           f"🏷️ Paket: {paket}\n"
           f"🆔 User ID: `{chat_id}`\n\n"
           f"📌 Simpan data akun Anda dengan aman.")
    
    # Kirim video dengan caption (gabung jadi satu)
    if os.path.exists("video.mp4"):
        send_video_with_caption(chat_id, "video.mp4", msg)
    else:
        send_message(chat_id, msg)
    
    if os.path.exists("FortuneBeta.apk"):
        send_document(chat_id, "FortuneBeta.apk", "📱 Berikut adalah file APK FortuneBeta")
    else:
        send_message(chat_id, "❌ File APK sedang tidak tersedia. Silakan hubungi admin.")

# ========== MAIN LOOP ==========
def main():
    print("✅ Bot sedang berjalan...")
    print("📹 Video dan text digabung dalam satu pesan")
    last_update_id = 0
    
    while True:
        try:
            updates = get_updates(last_update_id + 1)
            
            for update in updates:
                last_update_id = update.get("update_id")
                
                if "callback_query" in update:
                    callback = update["callback_query"]
                    callback_id = callback["id"]
                    data = callback["data"]
                    chat_id = callback["message"]["chat"]["id"]
                    user_id = callback["from"]["id"]
                    
                    if data == "order_apk":
                        handle_order_apk(chat_id, user_id, callback["from"].get("username", "-"))
                    elif data == "data_akun_dan_apk":
                        handle_data_akun_dan_apk(chat_id, user_id)
                    elif data.startswith("pilih_"):
                        paket_kode = data.replace("pilih_", "")
                        handle_pilih_paket(chat_id, user_id, paket_kode)
                    elif data.startswith("terima_"):
                        trans_id = int(data.split("_")[1])
                        trans = get_transaction(trans_id)
                        if trans:
                            handle_konfirmasi(trans[0], trans[1], trans_id, "terima")
                    elif data.startswith("tolak_"):
                        trans_id = int(data.split("_")[1])
                        trans = get_transaction(trans_id)
                        if trans:
                            handle_konfirmasi(trans[0], trans[1], trans_id, "tolak")
                    
                    try:
                        requests.post(f"{API_URL}/answerCallbackQuery", data={"callback_query_id": callback_id}, timeout=10)
                    except:
                        pass
                
                elif "message" in update:
                    msg = update["message"]
                    chat_id = msg["chat"]["id"]
                    user_id = msg["from"]["id"]
                    username = msg["from"].get("username", "-")
                    full_name = f"{msg['from'].get('first_name', '')} {msg['from'].get('last_name', '')}".strip()
                    
                    if "text" in msg and msg["text"] == "/start":
                        handle_start(chat_id, user_id, username, full_name)
                    elif "photo" in msg:
                        file_id = msg["photo"][-1]["file_id"]
                        handle_bukti(chat_id, user_id, username, full_name, file_id)
                    elif "text" in msg:
                        send_message(chat_id, "❌ Perintah tidak dikenal. Ketik /start untuk memulai.")
            
            time.sleep(1)
            
        except Exception as e:
            print(f"Error: {e}")
            time.sleep(10)

if __name__ == "__main__":
    main()