require("dotenv").config();

const dns = require("dns");
dns.setDefaultResultOrder("ipv4first");

const TelegramBot = require("node-telegram-bot-api");
const sharp = require("sharp");
const axios = require("axios");
const { Octokit } = require("@octokit/rest");
const { automation } = require("../playwright/index.js");
const fs = require("fs");

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });
bot.setMyCommands([
  { command: "/start", description: "Memulai bot" },
  { command: "/help", description: "Menampilkan daftar perintah" },
  { command: "/template", description: "Minta template text metadata" },
  { command: "/status", description: "Cek antrean gambar & text saat ini" },
  { command: "/proses", description: "Jalankan otomatisasi Playwright" },
  { command: "/batal", description: "Kosongkan semua antrean" },
  { command: "/news", description: "Update isi file berita.txt" },
]);
const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

const GITHUB_OWNER = process.env.GITHUB_OWNER;
const GITHUB_REPO = process.env.GITHUB_REPO;

// State penyimpanan sementara (in-memory)
const imageQueue = {};
const metaDataQueue = {};

console.log("🚀 Bot sedang berjalan...");

// --- HELPER FUNCTIONS ---

function generateFileInfo() {
  const date = new Date();
  const tz = "Asia/Makassar"; // Waktu WITA

  const formatter = new Intl.DateTimeFormat("id-ID", {
    timeZone: tz,
    year: "numeric",
    month: "short",
    day: "2-digit",
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const p = {};
  parts.forEach((part) => (p[part.type] = part.value));

  const filename = `${p.day}-${p.weekday.toLowerCase()}-${p.hour}${p.minute}${p.second}.jpg`;
  const path = `${p.year}/${p.month.toLowerCase()}/${filename}`;

  return { path, filename };
}

async function uploadToGitHub(base64Image, path, message) {
  await octokit.repos.createOrUpdateFileContents({
    owner: GITHUB_OWNER,
    repo: GITHUB_REPO,
    path: path,
    message: message,
    content: base64Image,
  });

  return `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/refs/heads/main/${path}`;
}

function parseMetadata(text) {
  const parsedData = { title: "", tags: "", category: "" };
  const lines = text.split("\n");

  lines.forEach((line) => {
    const [key, ...valueArr] = line.split(":");
    if (!key || valueArr.length === 0) return;

    const val = valueArr.join(":").trim();
    const k = key.trim().toLowerCase();

    if (k === "title") parsedData.title = val;
    else if (k === "kategori") parsedData.category = val;
    else if (k === "tag") {
      parsedData.tags = val
        .split(/\s+/)
        .filter(Boolean) // Membuang string kosong (falsy values)
        .map((t) => (t.startsWith("#") ? t : `#${t}`))
        .join(",");
    }
  });

  return parsedData;
}

// --- BOT EVENT LISTENERS ---

bot.on("photo", async (msg) => {
  const chatId = msg.chat.id;

  // Inisialisasi queue jika belum ada
  if (!imageQueue[chatId]) imageQueue[chatId] = [];

  try {
    const photo = msg.photo[msg.photo.length - 1]; // Ambil resolusi tertinggi
    const fileLink = await bot.getFileLink(photo.file_id);

    const response = await axios({
      url: fileLink,
      responseType: "arraybuffer",
    });
    const imageBuffer = Buffer.from(response.data, "binary");

    // Kompresi gambar
    const jpgBuffer = await sharp(imageBuffer).jpeg({ quality: 90 }).toBuffer();
    const base64Image = jpgBuffer.toString("base64");

    const { path, filename } = generateFileInfo();

    // Upload gambar ke GitHub
    const rawUrl = await uploadToGitHub(
      base64Image,
      path,
      `Upload ${filename} via Telegram Bot`,
    );

    // Simpan ke antrean
    imageQueue[chatId].push({
      url: rawUrl,
      buffer: jpgBuffer,
      filename: filename,
    });

    bot.sendMessage(
      chatId,
      `✅ Gambar tersimpan di GitHub.\n📥 Saat ini ada **${imageQueue[chatId].length} gambar** di antrean.\n\nKirim gambar lagi, atau ketik /proses jika sudah selesai.`,
      { parse_mode: "Markdown" },
    );
  } catch (error) {
    console.error("❌ Terjadi kesalahan saat memproses gambar:", error);
    bot.sendMessage(chatId, "❌ Maaf, gagal memproses gambar.");
  }
});

bot.on("text", (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (text.startsWith("/")) return;

  const lowerText = text.toLowerCase();
  if (lowerText.includes("title") && lowerText.includes("kategori")) {
    const parsedData = parseMetadata(text);
    metaDataQueue[chatId] = parsedData;

    bot.sendMessage(
      chatId,
      `✅ Data teks berhasil disimpan!\n\n**Title:** ${parsedData.title}\n**Tags:** ${parsedData.tags}\n**Kategori:** ${parsedData.category}\n\nKetik /proses jika gambar juga sudah siap.`,
      { parse_mode: "Markdown" },
    );
  }
});

// ==========================================
// KUMPULAN PERINTAH (COMMANDS)
// ==========================================

// 1. Perintah /start
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    "Halo! 👋 Aku adalah bot otomatisasi Playwright.\n\nKirimkan gambar-gambar yang ingin diproses, lalu gunakan perintah /template untuk mengisi data teksnya.\n\nKetik /help untuk melihat panduan lengkap.",
  );
});

// 2. Perintah /help (Menampilkan seluruh perintah)
bot.onText(/\/help/, (msg) => {
  const helpText = `
🤖 *Daftar Perintah Bot:*

/start - Memulai bot
/help - Menampilkan pesan bantuan ini
/template - Mendapatkan format teks untuk metadata
/status - Mengecek jumlah gambar & metadata di antrean
/proses - Mengeksekusi gambar dan data menggunakan Playwright
/batal - Menghapus semua antrean saat ini


*Cara Penggunaan:*
1️⃣ Kirimkan gambar-gambar satu per satu.
2️⃣ Ketik /template, salin teksnya, isi datanya, lalu kirim ke bot.
3️⃣ Ketik /status untuk memastikan data sudah siap.
4️⃣ Ketik /proses untuk menjalankan bot.
  `;
  bot.sendMessage(msg.chat.id, helpText, { parse_mode: "Markdown" });
});

// 3. Perintah /template (Memberikan format copy-paste)
bot.onText(/\/template/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    "📝 *Template Metadata*\n\nKetuk (atau tahan) teks di bawah ini untuk menyalin (copy), isi dengan data yang sesuai, lalu kirimkan kembali ke bot:",
    { parse_mode: "Markdown" },
  );

  // Menggunakan tag kode (```) agar di Telegram bisa langsung di-tap untuk copy
  const templateText =
    "Title: Judul Postingan Disini\nKategori: Nama Kategori Disini\nTag: #tag1 #tag2 #tag3";
  bot.sendMessage(msg.chat.id, `\`\`\`text\n${templateText}\n\`\`\``, {
    parse_mode: "MarkdownV2",
  });
});

// 4. Perintah /status (Mengecek isi antrean)
bot.onText(/\/status/, (msg) => {
  const chatId = msg.chat.id;
  const imgCount = imageQueue[chatId] ? imageQueue[chatId].length : 0;
  const meta = metaDataQueue[chatId];

  let statusText = `📊 *Status Antrean Saat Ini:*\n\n`;
  statusText += `🖼️ *Gambar:* ${imgCount} file siap diproses.\n`;
  statusText += `📝 *Metadata:* ${meta ? "✅ Sudah tersimpan" : "❌ Belum ada"}\n`;

  if (meta) {
    statusText += `\n  ├ *Title:* ${meta.title}\n  ├ *Kategori:* ${meta.category}\n  └ *Tag:* ${meta.tags}`;
  } else {
    statusText += `\n👉 *Ketik /template untuk mengisi metadata.*`;
  }

  bot.sendMessage(chatId, statusText, { parse_mode: "Markdown" });
});

// 5. Perintah /proses (Menjalankan Playwright)
bot.onText(/\/proses/, async (msg) => {
  const chatId = msg.chat.id;
  const queue = imageQueue[chatId] || [];
  const metadata = metaDataQueue[chatId];

  if (queue.length === 0) {
    return bot.sendMessage(
      chatId,
      "⚠️ *Antrean kosong.* Kirimkan gambar terlebih dahulu.",
      { parse_mode: "Markdown" },
    );
  }

  if (!metadata) {
    return bot.sendMessage(
      chatId,
      "⚠️ *Data teks belum ada.* Ketik /template, isi datanya, dan kirimkan terlebih dahulu.",
      { parse_mode: "Markdown" },
    );
  }

  bot.sendMessage(
    chatId,
    `🚀 Memulai Playwright...\n- Menggunakan **${queue.length} gambar**.\n- Title: **${metadata.title}**\nMohon tunggu prosesnya.`,
    { parse_mode: "Markdown" },
  );

  try {
    await automation(queue, metadata);

    bot.sendMessage(
      chatId,
      "✅ Tugas Playwright berhasil diselesaikan untuk semua gambar!",
    );

    // Reset antrean setelah sukses
    imageQueue[chatId] = [];
    metaDataQueue[chatId] = null;
  } catch (error) {
    console.error("🛑 DETAIL ERROR PLAYWRIGHT:", error);
    bot.sendMessage(
      chatId,
      "❌ Gagal menjalankan tugas Playwright. Cek log di terminal server.",
    );
  }
});

// 6. Perintah /batal (Membatalkan antrean)
bot.onText(/\/batal/, (msg) => {
  const chatId = msg.chat.id;
  imageQueue[chatId] = [];
  metaDataQueue[chatId] = null;
  bot.sendMessage(
    chatId,
    "🗑️ Semua antrean gambar dan teks berhasil dikosongkan.",
  );
});

// 7. Perintah /news upload berita
bot.onText(/^\/news/, (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  const newContent = text.replace(/^\/news\s*/i, "").trim();

  if (!newContent) {
    const pesanBantuan = `⚠️ *Format salah.*\n\nSilakan gunakan perintah dengan format:\n\`/news [isi berita yang baru]\`\n\n*Contoh:*\n\`/news Breaking News: Hari ini pasar saham naik drastis...\``;
    return bot.sendMessage(chatId, pesanBantuan, { parse_mode: "Markdown" });
  }

  try {
    fs.writeFileSync("../playwright/berita.txt", newContent, "utf-8");

    bot.sendMessage(
      chatId,
      "✅ *File berita.txt berhasil diperbarui!*\n\nSeluruh isi sebelumnya telah dihapus dan diganti dengan teks barumu.",
      { parse_mode: "Markdown" },
    );
  } catch (error) {
    console.error("❌ Gagal menulis ke berita.txt:", error);
    bot.sendMessage(
      chatId,
      "❌ *Gagal memperbarui file berita.txt.* Coba cek log terminal server.",
      { parse_mode: "Markdown" },
    );
  }
});
