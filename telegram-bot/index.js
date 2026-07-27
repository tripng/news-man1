const dns = require("dns");
dns.setDefaultResultOrder("ipv4first");

const TelegramBot = require("node-telegram-bot-api");
const { TELEGRAM_TOKEN } = require("./config/env");

// Inisialisasi Bot dengan paksa IPv4 dan opsi polling yang lebih responsif
const bot = new TelegramBot(TELEGRAM_TOKEN, {
  polling: {
    interval: 300,
    params: {
      timeout: 10,
    },
  },
  request: {
    agentOptions: {
      family: 4,
    },
  },
});

// Menangani Polling Error agar tidak menyebabkan hang
bot.on("polling_error", (error) => {
  console.error(`⚠️ Polling Error: ${error.code} - ${error.message}`);
});

// Setup Daftar Perintah (Menu Bot)
bot.setMyCommands([
  { command: "/start", description: "Memulai bot" },
  { command: "/help", description: "Menampilkan daftar perintah" },
  { command: "/template", description: "Minta template text metadata" },
  { command: "/status", description: "Cek antrean gambar & text saat ini" },
  { command: "/proses", description: "Jalankan otomatisasi Playwright" },
  { command: "/batal", description: "Kosongkan semua antrean" },
  { command: "/news", description: "Update isi file berita.txt" },
  { command: "/ai", description: "Membuat caption dan tagar" },
  { command: "/model", description: "Pilih model AI" },
]);

// Memuat Handlers
require("./handlers/events")(bot);
require("./handlers/commands")(bot);

console.log("🚀 Bot sedang berjalan...");
