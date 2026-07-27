const { GoogleGenAI } = require("@google/genai");
const axios = require("axios");
const { GEMINI_API_KEY, DEEPSEEK_API_KEY, ZAI_API_KEY, OPENROUTER_API_KEY } = require("../config/env");

const genAI = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

/**
 * Memanggil AI untuk menghasilkan caption, kategori, dan hashtags dalam format JSON.
 * @param {string} provider - 'gemini' atau 'deepseek'
 * @param {string} userInput - Teks berita mentah dari user
 * @returns {Promise<Object>} Object JSON dengan key: kategori, caption, hashtags
 */
async function generateCaption(provider, userInput) {
  const prompt = `
    Kamu adalah admin media sosial dan jurnalis untuk MAN 1 Kota Gorontalo.
    Tugasmu adalah membuat caption Instagram yang menarik dari teks berita mentah ini.

    TEKS BERITA MENTAH:
    "${userInput}"

    ATURAN WAJIB:
    1. Buat bahasa yang profesional namun tetap engaging untuk guru dan siswa dengan 2-4 paragraf dengan emoji yang sesuai.
    2. Pilih kategori dengan pilihan Karya Ilmiah Populer, Berita Prestasi, Berita Akademik, Berita Madrasah, Ekstrakurikuler
    3. WAJIB kembalikan respons HANYA dalam format JSON dengan key: "kategori", "caption", dan "hashtags".
    4. Kategori berbentuk angka saja dengan ketentuan Karya Ilmiah Populer = 63, Berita Prestasi = 62, Berita Akademik = 61, Berita Madrasah = 54, Ekstrakurikuler = 44
    5. Hashtags harus dikembalikan sebagai string panjang yang dipisahkan oleh spasi (contoh: "#tag1 #tag2"), BUKAN dalam bentuk array.
    6. Jangan ada teks markdown tambahan seperti \`\`\`json di awal atau akhir respons. HANYA objek JSON murni.
  `;

  if (provider === "deepseek") {
    return await callDeepSeek(prompt);
  } else if (provider === "zai") {
    return await callZAI(prompt);
  } else if (provider === "or_gemini") {
    return await callOpenRouter("google/gemini-2.5-flash", prompt);
  } else if (provider === "or_deepseek") {
    return await callOpenRouter("deepseek/deepseek-chat", prompt);
  } else {
    try {
      return await callGemini(prompt);
    } catch (error) {
      // Jika Gemini direct limit/overload, coba fallback otomatis ke OpenRouter Gemini
      if (error.message.includes("GEMINI_QUOTA") || error.message.includes("GEMINI_OVERLOAD")) {
        console.warn("⚠️ Direct Gemini API limit/overload. Melakukan fallback otomatis ke OpenRouter Gemini...");
        try {
          return await callOpenRouter("google/gemini-2.5-flash", prompt);
        } catch (fallbackError) {
          console.error("❌ Fallback ke OpenRouter Gemini juga gagal:", fallbackError.message);
          throw error; // Jika fallback gagal, lempar error asli
        }
      }
      throw error;
    }
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function callGemini(prompt, retryCount = 0) {
  try {
    // Kembali menggunakan gemini-2.0-flash karena 1.5-flash tidak ditemukan (404)
    const response = await genAI.models.generateContent({
      model: "gemini-2.0-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
      },
    });

    return JSON.parse(response.text);
  } catch (error) {
    const isRateLimit = error.status === 429 || error.message?.includes("429") || error.message?.includes("QUOTA_EXCEEDED");
    const isOverload = error.status === 503 || error.message?.includes("503");

    // Coba retry jika terkena rate limit atau overload (maksimal 2 kali retry)
    if ((isRateLimit || isOverload) && retryCount < 2) {
      const waitTime = (retryCount + 1) * 3000; // 3 detik, lalu 6 detik
      console.warn(`⚠️ Gemini sibuk/limit. Mencoba kembali dalam ${waitTime/1000} detik... (Percobaan ${retryCount + 1}/2)`);
      await sleep(waitTime);
      return await callGemini(prompt, retryCount + 1);
    }

    // Tangkap error kuota (Rate Limit) setelah semua retry gagal
    if (isRateLimit) {
      throw new Error("GEMINI_QUOTA: Anda telah mencapai batas permintaan gratis (Rate Limit). Silakan tunggu sekitar 60 detik sebelum mencoba lagi.");
    }

    // Tangkap error overload setelah semua retry gagal
    if (isOverload) {
      throw new Error("GEMINI_OVERLOAD: Layanan Gemini sedang sibuk. Silakan coba lagi beberapa saat lagi.");
    }

    console.error("Gemini Error:", error);
    throw new Error("Gagal memanggil Gemini API: " + error.message);
  }
}

async function callDeepSeek(prompt) {
  try {
    const response = await axios.post(
      "https://integrate.api.nvidia.com/v1/chat/completions",
      {
        model: "deepseek-ai/deepseek-v3.1-terminus",
        messages: [
          { role: "system", content: "You are a helpful assistant." },
          { role: "user", content: prompt }
        ]
      },
      {
        headers: {
          "Authorization": `Bearer ${DEEPSEEK_API_KEY}`,
          "Content-Type": "application/json"
        },
        timeout: 90000 // Menambah timeout ke 90 detik
      }
    );

    return JSON.parse(response.data.choices[0].message.content);
  } catch (error) {
    const errorData = error.response?.data;
    console.error("DeepSeek Error:", errorData || error.message);

    if (error.response?.status === 402 || errorData?.error?.message?.includes("Insufficient Balance") || errorData?.error?.message?.includes("Out of credit")) {
      throw new Error("DEEPSEEK_NO_BALANCE: Saldo NVIDIA/DeepSeek Anda habis atau tidak mencukupi. Silakan periksa dashboard NVIDIA API Catalog.");
    }

    if (error.response?.status === 429) {
      throw new Error("DEEPSEEK_RATE_LIMIT: Anda telah mencapai batas permintaan NVIDIA NIM. Silakan tunggu beberapa saat.");
    }

    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      throw new Error("DEEPSEEK_TIMEOUT: Permintaan ke NVIDIA NIM memakan waktu terlalu lama. Silakan coba lagi beberapa saat lagi.");
    }

    throw new Error("Gagal memanggil DeepSeek (NVIDIA) API: " + (errorData?.error?.message || error.message));
  }
}

async function callZAI(prompt) {
  try {
    const response = await axios.post(
      "https://integrate.api.nvidia.com/v1/chat/completions",
      {
        model: "z-ai/glm-5.1",
        messages: [
          { role: "user", content: prompt }
        ],
        temperature: 1,
        top_p: 1,
        max_tokens: 16384,
        extra_body: {
          chat_template_kwargs: {
            enable_thinking: true,
            clear_thinking: false
          }
        }
      },
      {
        headers: {
          "Authorization": `Bearer ${ZAI_API_KEY}`,
          "Content-Type": "application/json"
        },
        timeout: 180000 // Menambah timeout ke 180 detik untuk z-ai thinking (GLM-5.1)
      }
    );

    let content = response.data.choices[0].message.content;
    
    // Kadang-kadang model dengan thinking menyertakan tag <thought> atau serupa
    // Kita pastikan hanya mengambil JSON murni jika ada kotoran teks
    if (content.includes("```json")) {
      content = content.split("```json")[1].split("```")[0].trim();
    } else if (content.includes("{") && content.includes("}")) {
      // Temukan kurawal pertama dan terakhir untuk mengekstrak JSON jika ada teks tambahan
      const firstBrace = content.indexOf("{");
      const lastBrace = content.lastIndexOf("}");
      content = content.substring(firstBrace, lastBrace + 1);
    }

    return JSON.parse(content);
  } catch (error) {
    const errorData = error.response?.data;
    console.error("Z-AI Error:", errorData || error.message);

    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      throw new Error("Z-AI_TIMEOUT: Permintaan ke Z-AI memakan waktu terlalu lama. Silakan coba lagi.");
    }

    throw new Error("Gagal memanggil Z-AI (NVIDIA) API: " + (errorData?.error?.message || error.message));
  }
}

async function callOpenRouter(modelName, prompt) {
  try {
    const response = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: modelName,
        messages: [
          { role: "user", content: prompt }
        ],
        temperature: 1,
        top_p: 1,
        max_tokens: 2000
      },
      {
        headers: {
          "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://man1kotagorontalo.sch.id", // Site URL for OpenRouter ranking
          "X-Title": "Telegram Bot MAN 1" // Site name for OpenRouter ranking
        },
        timeout: 90000 // 90 detik
      }
    );

    let content = response.data.choices[0].message.content;
    
    // Pembersihan JSON jika model mengembalikan teks markdown
    if (content.includes("```json")) {
      content = content.split("```json")[1].split("```")[0].trim();
    } else if (content.includes("{") && content.includes("}")) {
      const firstBrace = content.indexOf("{");
      const lastBrace = content.lastIndexOf("}");
      content = content.substring(firstBrace, lastBrace + 1);
    }

    return JSON.parse(content);
  } catch (error) {
    const errorData = error.response?.data;
    console.error(`OpenRouter (${modelName}) Error:`, errorData || error.message);

    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      throw new Error(`OPENROUTER_TIMEOUT: Permintaan ke OpenRouter (${modelName}) memakan waktu terlalu lama.`);
    }

    throw new Error(`Gagal memanggil OpenRouter (${modelName}): ` + (errorData?.error?.message || error.message));
  }
}

module.exports = {
  generateCaption,
};
