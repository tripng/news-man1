const axios = require("axios");
const sharp = require("sharp");
const { imageQueue, metaDataQueue, userSettings } = require("../state/store");
const { generateFileInfo, parseMetadata } = require("../utils/helpers");
const { uploadToGitHub } = require("../utils/github");

module.exports = (bot) => {
  bot.on("callback_query", (query) => {
    const chatId = query.message.chat.id;
    const data = query.data;

    if (data === "set_gemini") {
      userSettings[chatId] = { model: "gemini" };
      bot.answerCallbackQuery(query.id, { text: "Model berhasil diubah ke Gemini!" });
      bot.editMessageText(`🤖 *Pilih Model AI*\n\nModel aktif saat ini: **GEMINI**`, {
        chat_id: chatId,
        message_id: query.message.message_id,
        reply_markup: {
          inline_keyboard: [
            [
              { text: "✅ Gemini", callback_data: "set_gemini" },
              { text: "DeepSeek", callback_data: "set_deepseek" },
              { text: "Z-AI", callback_data: "set_zai" },
            ],
            [
              { text: "OR: Gemini", callback_data: "set_or_gemini" },
              { text: "OR: DeepSeek", callback_data: "set_or_deepseek" },
            ],
          ],
        },
        parse_mode: "Markdown",
      });
    } else if (data === "set_deepseek") {
      userSettings[chatId] = { model: "deepseek" };
      bot.answerCallbackQuery(query.id, { text: "Model berhasil diubah ke DeepSeek!" });
      bot.editMessageText(`🤖 *Pilih Model AI*\n\nModel aktif saat ini: **DEEPSEEK**`, {
        chat_id: chatId,
        message_id: query.message.message_id,
        reply_markup: {
          inline_keyboard: [
            [
              { text: "Gemini", callback_data: "set_gemini" },
              { text: "✅ DeepSeek", callback_data: "set_deepseek" },
              { text: "Z-AI", callback_data: "set_zai" },
            ],
            [
              { text: "OR: Gemini", callback_data: "set_or_gemini" },
              { text: "OR: DeepSeek", callback_data: "set_or_deepseek" },
            ],
          ],
        },
        parse_mode: "Markdown",
      });
    } else if (data === "set_zai") {
      userSettings[chatId] = { model: "zai" };
      bot.answerCallbackQuery(query.id, { text: "Model berhasil diubah ke Z-AI (GLM-5.1)!" });
      bot.editMessageText(`🤖 *Pilih Model AI*\n\nModel aktif saat ini: **Z-AI (GLM-5.1)**`, {
        chat_id: chatId,
        message_id: query.message.message_id,
        reply_markup: {
          inline_keyboard: [
            [
              { text: "Gemini", callback_data: "set_gemini" },
              { text: "DeepSeek", callback_data: "set_deepseek" },
              { text: "✅ Z-AI", callback_data: "set_zai" },
            ],
            [
              { text: "OR: Gemini", callback_data: "set_or_gemini" },
              { text: "OR: DeepSeek", callback_data: "set_or_deepseek" },
            ],
          ],
        },
        parse_mode: "Markdown",
      });
    } else if (data === "set_or_gemini") {
      userSettings[chatId] = { model: "or_gemini" };
      bot.answerCallbackQuery(query.id, { text: "Model berhasil diubah ke OR: Gemini!" });
      bot.editMessageText(`🤖 *Pilih Model AI*\n\nModel aktif saat ini: **OR: GEMINI (2.0 FLASH)**`, {
        chat_id: chatId,
        message_id: query.message.message_id,
        reply_markup: {
          inline_keyboard: [
            [
              { text: "Gemini", callback_data: "set_gemini" },
              { text: "DeepSeek", callback_data: "set_deepseek" },
              { text: "Z-AI", callback_data: "set_zai" },
            ],
            [
              { text: "✅ OR: Gemini", callback_data: "set_or_gemini" },
              { text: "OR: DeepSeek", callback_data: "set_or_deepseek" },
            ],
          ],
        },
        parse_mode: "Markdown",
      });
    } else if (data === "set_or_deepseek") {
      userSettings[chatId] = { model: "or_deepseek" };
      bot.answerCallbackQuery(query.id, { text: "Model berhasil diubah ke OR: DeepSeek!" });
      bot.editMessageText(`🤖 *Pilih Model AI*\n\nModel aktif saat ini: **OR: DEEPSEEK (CHAT)**`, {
        chat_id: chatId,
        message_id: query.message.message_id,
        reply_markup: {
          inline_keyboard: [
            [
              { text: "Gemini", callback_data: "set_gemini" },
              { text: "DeepSeek", callback_data: "set_deepseek" },
              { text: "Z-AI", callback_data: "set_zai" },
            ],
            [
              { text: "OR: Gemini", callback_data: "set_or_gemini" },
              { text: "✅ OR: DeepSeek", callback_data: "set_or_deepseek" },
            ],
          ],
        },
        parse_mode: "Markdown",
      });
    }
  });

  bot.on("photo", async (msg) => {
    const chatId = msg.chat.id;

    if (!imageQueue[chatId]) imageQueue[chatId] = [];

    try {
      const photo = msg.photo[msg.photo.length - 1]; // Resolusi tertinggi
      const fileLink = await bot.getFileLink(photo.file_id);

      const response = await axios({
        url: fileLink,
        responseType: "arraybuffer",
      });
      const imageBuffer = Buffer.from(response.data, "binary");

      // Kompresi
      const jpgBuffer = await sharp(imageBuffer)
        .jpeg({ quality: 90 })
        .toBuffer();
      const base64Image = jpgBuffer.toString("base64");

      const { path, filename } = generateFileInfo();

      const rawUrl = await uploadToGitHub(
        base64Image,
        path,
        `Upload ${filename} via Telegram Bot`,
      );

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
};
