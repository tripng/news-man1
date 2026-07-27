const fs = require("fs");
const { imageQueue, metaDataQueue, userSettings } = require("./../state/store");
const { automation } = require("./../../playwright/index.js"); 
const { generateCaption } = require("../utils/aiService");
const { escapeHTML } = require("../utils/helpers");

const token = process.env.TELEGRAM_BOT_TOKEN;

module.exports = (bot) => {
  bot.onText(/\/start/, (msg) => {
    bot.sendMessage(
      msg.chat.id,
      "Halo! 👋 Aku adalah bot otomatisasi Playwright.\n\nKirimkan gambar-gambar yang ingin diproses, lalu gunakan perintah /template untuk mengisi data teksnya.\n\nKetik /help untuk melihat panduan lengkap.",
    );
  });

  bot.onText(/\/help/, (msg) => {
    const helpText = `
/start - Memulai bot
/help - Menampilkan pesan bantuan ini
/template - Mendapatkan format teks 
/status - Mengecek jumlah gambar di antrean
/proses - Mengeksekusi gambar dan data menggunakan Playwright
/batal - Menghapus semua antrean saat ini
/ai - Membuat kategori, caption dan tagar
/model - Memilih model AI (Gemini atau DeepSeek)

*Cara Penggunaan:*
1️⃣ Kirimkan gambar-gambar satu per satu.
2️⃣ Ketik /template, salin teksnya, isi datanya, lalu kirim ke bot.
3️⃣ Ketik /model untuk memilih AI yang diinginkan (default: Gemini).
4️⃣ Ketik /proses untuk menjalankan bot.
    `;
    bot.sendMessage(msg.chat.id, helpText, { parse_mode: "Markdown" });
  });

  bot.onText(/\/template/, (msg) => {
    bot.sendMessage(
      msg.chat.id,
      "📝 *Template Metadata*\n\nKetuk (atau tahan) teks di bawah ini untuk menyalin (copy), isi dengan data yang sesuai, lalu kirimkan kembali ke bot:",
      { parse_mode: "Markdown" },
    );
    const templateText =
      "Title: Judul Postingan Disini\nKategori: Nama Kategori Disini\nTag: #tag1 #tag2 #tag3";
    bot.sendMessage(msg.chat.id, `\`\`\`text\n${templateText}\n\`\`\``, {
      parse_mode: "MarkdownV2",
    });
  });

  bot.onText(/\/proses/, async (msg) => {
    const chatId = msg.chat.id;
    const queue = imageQueue[chatId] || [];

    if (queue.length === 0) {
      return bot.sendMessage(
        chatId,
        "⚠️ *Antrean kosong.* Kirimkan gambar terlebih dahulu.",
        { parse_mode: "Markdown" },
      );
    }

    bot.sendMessage(
      chatId,
      `🚀 Memulai Playwright...\n- Menggunakan **${queue.length} gambar**. `,
      { parse_mode: "Markdown" },
    );

    try {
      await automation(queue);
      bot.sendMessage(
        chatId,
        "✅ Tugas Playwright berhasil diselesaikan untuk semua gambar!",
      );
      imageQueue[chatId] = [];
    } catch (error) {
      console.error("🛑 DETAIL ERROR PLAYWRIGHT:", error);
      bot.sendMessage(
        chatId,
        "❌ Gagal menjalankan tugas Playwright. Cek log di terminal server.",
      );
    }
  });

  bot.onText(/\/status/, (msg) => {
    const chatId = msg.chat.id;
    const imgCount = imageQueue[chatId] ? imageQueue[chatId].length : 0;
    const meta = metaDataQueue[chatId];

    let statusText = `📊 *Status Antrean Saat Ini:*\n\n`;
    statusText += `🖼️ *Gambar:* ${imgCount} file siap diproses.\n`;
    statusText += `📝 *Metadata:* ${meta ? "✅ Sudah tersimpan" : "❌ Belum ada"}\n`;

    if (meta) {
      statusText += `\n- *Title:* ${meta.title}\n- *Kategori:* ${meta.category}\n- *Tag:* ${meta.tags}`;
    } else {
      statusText += `\n👉 *Silakan kirim metadata sesuai template.*`;
    }

    bot.sendMessage(chatId, statusText, { parse_mode: "Markdown" });
  });

  bot.onText(/\/batal/, (msg) => {
    const chatId = msg.chat.id;
    imageQueue[chatId] = [];
    metaDataQueue[chatId] = null;
    bot.sendMessage(
      chatId,
      "🗑️ Semua antrean gambar dan teks berhasil dikosongkan.",
    );
  });

  bot.onText(/^\/news/, async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text;
    const newContent = text.replace(/^\/news\s*/i, "").trim();

    if (!newContent) {
      const pesanBantuan = `⚠️ *Format salah.*\n\nSilakan gunakan perintah dengan format:\n\`/news [isi berita yang baru]\`\n\n*Contoh:*\n\`/news Breaking News: Hari ini pasar saham naik drastis...\``;
      return bot.sendMessage(chatId, pesanBantuan, { parse_mode: "Markdown" });
    }

    try {
      await fs.promises.writeFile("../playwright/berita.txt", newContent, "utf-8");
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

  bot.onText(/\/model/, (msg) => {
    const chatId = msg.chat.id;
    const currentModel = userSettings[chatId]?.model || "gemini";

    const opts = {
      reply_markup: {
        inline_keyboard: [
          [
            { text: currentModel === "gemini" ? "✅ Gemini" : "Gemini", callback_data: "set_gemini" },
            { text: currentModel === "deepseek" ? "✅ DeepSeek" : "DeepSeek", callback_data: "set_deepseek" },
            { text: currentModel === "zai" ? "✅ Z-AI" : "Z-AI", callback_data: "set_zai" },
          ],
          [
            { text: currentModel === "or_gemini" ? "✅ OR: Gemini" : "OR: Gemini", callback_data: "set_or_gemini" },
            { text: currentModel === "or_deepseek" ? "✅ OR: DeepSeek" : "OR: DeepSeek", callback_data: "set_or_deepseek" },
          ],
        ],
      },
      parse_mode: "Markdown",
    };

    bot.sendMessage(chatId, `🤖 *Pilih Model AI*\n\nModel aktif saat ini: **${currentModel.toUpperCase()}**`, opts);
  });

  bot.onText(/\/ai\s*(.*)/is, async (msg, match) => {
    const chatId = msg.chat.id;
    const userInput = match[1]; // Mengambil teks berita yang diketik user

    // Jika user hanya mengetik /ai tanpa memberikan teks
    if (!userInput) {
      return bot.sendMessage(
        chatId,
        "Kirimkan perintah dengan format:\n/AI [teks berita mentah yang ingin diubah jadi caption]",
      );
    }

    const parts = userInput.split("|");

    // Jika user tidak memakai tanda '|', beri peringatan
    if (parts.length < 2) {
      return bot.sendMessage(
        chatId,
        "⚠️ *Format salah!*\n\nKirimkan perintah dengan format:\n`/ai [Judul Berita] | [Isi Teks Berita Mentah]`\n\n*Contoh:*\n`/ai Tim Pramuka Juara | Kemarin tim pramuka MAN 1 berhasil...`",
        { parse_mode: "Markdown" },
      );
    }

    // Mengambil judul dan teks berita, lalu membersihkan spasi berlebih
    const judulUser = parts[0].trim();
    // Menggabungkan kembali jika di dalam teks berita tanpa sengaja ada tanda '|' lagi
    const teksBerita = parts.slice(1).join("|").trim();

    // Kirim pesan "sedang memproses" agar bot tidak terlihat mati
    const loadingMsg = await bot.sendMessage(
      chatId,
      "⏳ Sedang menyusun caption berita...",
    );

    try {
      const currentModel = userSettings[chatId]?.model || "gemini";
      const data = await generateCaption(currentModel, userInput);
      
      // Normalisasi hashtags: jika array, gabungkan jadi string
      if (Array.isArray(data.hashtags)) {
        data.hashtags = data.hashtags.join(" ");
      }
      
      const jsonData = JSON.stringify(data, null, 2);
      await fs.promises.writeFile("../playwright/data.json", jsonData, "utf-8");
      console.log(`Data (via ${currentModel}) berhasil disimpan ke data.json!`);

      if (data.caption && data.hashtags) {
        const finalMessage = `<b>📢 ${escapeHTML(judulUser)}</b>\n\n${escapeHTML(data.caption)}\n\n${escapeHTML(data.hashtags)}\n\n<b>Kategori:</b> ${escapeHTML(data.kategori)}\n\n<i>ℹ️ Data JSON Berhasil Diubah (Model: ${currentModel.toUpperCase()})</i>`;

        try {
          await bot.deleteMessage(chatId, loadingMsg.message_id);
        } catch (e) {}
        await bot.sendMessage(chatId, finalMessage, { parse_mode: "HTML" });
      } else {
        throw new Error("Format JSON dari AI tidak lengkap.");
      }
    } catch (error) {
      console.error("Error memproses AI:", error);
      try {
        await bot.deleteMessage(chatId, loadingMsg.message_id);
      } catch (e) {}
      
      let errorMessage = "❌ <b>Terjadi Kesalahan AI</b>";
      let detail = "Maaf, terjadi kesalahan saat memproses berita. Silakan coba lagi nanti.";
      
      if (error.message.includes("DEEPSEEK_NO_BALANCE")) {
        errorMessage = "⚠️ <b>Saldo DeepSeek Habis</b>";
        detail = error.message.split(": ")[1];
      } else if (error.message.includes("GEMINI_QUOTA")) {
        errorMessage = "⏳ <b>Batas Kuota Gemini Tercapai</b>";
        detail = error.message.split(": ")[1];
      } else if (error.message.includes("GEMINI_OVERLOAD")) {
        errorMessage = "🚀 <b>Gemini Sedang Sibuk</b>";
        detail = error.message.split(": ")[1];
      } else if (error.message.includes("Gagal memanggil") || error.message.includes("OPENROUTER")) {
        errorMessage = "❌ <b>Kesalahan API</b>";
        detail = "<code>" + escapeHTML(error.message.split("\n")[0].substring(0, 200)) + "...</code>";
      }

      await bot.sendMessage(chatId, `${errorMessage}\n\n${detail}`, { parse_mode: "HTML" });
    }

    try {
      await fs.promises.writeFile("../playwright/berita.txt", userInput, "utf-8");
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

  console.log("🤖 Bot Telegram sedang berjalan...");
};
