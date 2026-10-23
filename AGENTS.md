# AGENTS.md

Panduan AI Agent untuk proyek **News Automation** — Playwright scraper + Telegram bot.

## Ringkasan singkat
Proyek ini otomatisasi **posting berita ke situs Joomla** (`man1kotagorontalo.sch.id`)
dan **meneruskan ke WhatsApp** via Playwright. Sebuah Telegram bot
(`telegram-bot/`) mengelola alur kerja: menerima gambar, menghasilkan caption
via AI, menyimpan metadata, lalu memicu script Playwright
(`playwright/index.js`).

```
[User] → [Telegram Bot] → [AI Service] → [data.json + berita.txt]
                                  ↓
                        [Playwright: index.js]
   → Joomla administrator → buat artikel → cari URL → kirim ke WhatsApp
```

## Struktur direktori
```
.
├── playwright/                     # Script browser automation
│   ├── index.js                    # Fungsi automation(images) — inti posting
│   ├── run.js                      # Entry point CLI; beban gambar dari img/
│   ├── news-upload.js              # Utility eksploratif (WhatsApp channel)
│   ├── berita.txt                  # Judul | isi berita (dipakai oleh automation)
│   ├── data.json                   # Metadata AI output (kategori, caption, hashtags)
│   ├── package.json                # Node deps: playwright, @google/genai, dotenv
│   ├── playwright.config.js        # Config: headless:false, viewport:null
│   └── img/                        # Gambar referensi (di-lokal)
│
├── telegram-bot/                   # Bot Telegram orkestrator
│   ├── index.js                    # Inisialisasi bot + setCommands
│   ├── handlers/
│   │   ├── commands.js             # /start /help /template /proses /news /ai /model /status /batal
│   │   └── events.js               # Callback query model AI, handler photo & text
│   ├── utils/
│   │   ├── aiService.js            # Wrapper Gemini / DeepSeek / Z-AI / OpenRouter
│   │   ├── helpers.js              # generateFileInfo, parseMetadata, escapeHTML
│   │   └── github.js               # Upload gambar base64 ke GitHub raw URL
│   ├── config/
│   │   └── env.js                  # Muat env via dotenv
│   ├── state/
│   │   └── store.js                # In-memory cache: imageQueue, metaDataQueue, userSettings
│   ├── .env.example                # Template env vars
│   └── package.json
│
├── .env.example                    # Alias dari telegram-bot/.env.example
├── AGENTS.md                       # <-- file ini
└── README.md                       # (belum ada — akan dibuat oleh agent jika diminta)
```

## Prerequisites
- **Node.js** (v18+) dan **npm** terpasang.
- **Playwright browsers** terpasang:
  ```
  npx playwright install-deps chromium
  npx playwright install chromium
  ```
  Di CachyOS, Chromium sistem di `/usr/bin/chromium` juga dapat dipakai
  (otomatis terdeteksi oleh `index.js`).
- **Akun Telegram bot** — dapatkan token dari `@BotFather`.
- **API keys** — lihat `.env.example`.
- **GitHub token** — repo `img-news` (`GITHUB_OWNER= MAN1Gorontalo`,
  `GITHUB_REPO= img-news`).
- Akses ke admin Joomla di `https://man1kotagorontalo.sch.id/administrator`
  (kredensial hardcode di `index.js` — lihat catatan di bawah).

## Perintah penting
### Playwright (`playwright/`)
| Perintah                          | Keterangan                                  |
|-----------------------------------|---------------------------------------------|
| `npm start`                       | Jalankan automation: baca `img/` + `berita.txt` |
| `npm test`                        | Cek syntax/load module tanpa eksekusi penuh |
| `PAUSE=0 npm start`              | Jalankan tanpa jeda review (headless mode)  |
| `node -e "require('./index.js'); console.log('OK')"` | Cek require tanpa eksekusi |

### Telegram Bot (`telegram-bot/`)
| Perintah                          | Keterangan                                  |
|-----------------------------------|---------------------------------------------|
| `node index.js`                   | Jalankan bot (polling)                     |
| `node -e "require('./index.js'); console.log('OK')"` | Cek require tanpa mulai bot |

> **Catatan:** `telegram-bot/package.json` tidak memiliki script `start`.
> Gunakan `node index.js` secara langsung.

## Environment variables
Salin dari `.env.example` (di `telegram-bot/` dan repo root):

| Variabel              | Wajib | Keterangan                              |
|-----------------------|-------|-----------------------------------------|
| `TELEGRAM_TOKEN`      | ✅    | Token bot dari @BotFather              |
| `GITHUB_TOKEN`        | ✅    | PAT untuk upload gambar ke repo img-news|
| `GITHUB_OWNER`        | ✅    | `MAN1Gorontalo`                        |
| `GITHUB_REPO`         | ✅    | `img-news`                             |
| `GEMINI_API_KEY`      | ✅    | API key Gemini Direct API              |
| `DEEPSEEK_API_KEY`    | ⚠️   | NVIDIA API key (DeepSeek-v3.1)          |
| `ZAI_API_KEY`         | ⚠️   | NVIDIA API key (Z-AI GLM-5.1)           |
| `OPENROUTER_API_KEY`  | ⚠️   | OpenRouter fallback key                 |

⚠️ `DEEPSEEK_API_KEY`, `ZAI_API_KEY`, `OPENROUTER_API_KEY` hanya diperlukan
jika ingin pakai model alternatif. Default pakai **Gemini Direct API**.

> **JANGAN PERNAH** commit file `.env` asli. File tersebut berisi kredensial
> (token, API key). Pastikan `.env` ada di `.gitignore`.

## Aturan wajib
- **Jangan pernah** mengubah file `.env` atau `.env.example` tanpa konfirmasi.
- **Jangan pernah** mengubah `package.json` atau `package-lock.json` tanpa
  izin eksplisit. Jika perlu dependency baru, tambahkan via
  `npm install <pkg> --save` + commit pesan `deps: ...`.
- **Jangan pernah** mengubah skema database / migration — proyek ini tidak
  memakai database lokal (data ada di Joomla eksternal + file JSON/txt).
- Perubahan hanya boleh menyentuh file yang tercantum di `plan.md`.
- Jika sebuah pengecekan tidak bisa dijalankan, tulis "TIDAK DIJALANKAN" +
  alasannya. Jangan pernah menulis "lulus" untuk test yang tidak benar-benar
  dijalankan.
- Setiap tugas atomik selesai → **commit sendiri** dengan pesan
  `feat: ...` / `fix: ...` / `docs: ...` / `chore: ...`.
- Gunakan bahasa Indonesia dalam commit message dan dokumentasi.

## Alur kerja data (data flow)
1. User kirim gambar via Telegram → bot simpan ke `imageQueue[chatId]`.
2. Gambar di-upload ke GitHub repo `img-news` → dapatkan raw URL.
3. User kirim metadata (title | kategori | tag) → disimpan di
   `metaDataQueue[chatId]` dan ditulis ke `../playwright/berita.txt`.
   Alternatif: user ketik `/ai [judul] | [isi berita]` → AI generate
   caption + hashtags → hasilnya ditulis ke `../playwright/data.json`
   dan juga update `berita.txt`.
4. User ketik `/proses` → bot panggil `automation(queue)` dari
   `playwright/index.js`.
5. `automation()`:
   - Baca `berita.txt` (format: `judul | isi berita`).
   - Baca `data.json` (metadata: kategori, caption, hashtags).
   - Buka browser persistent context → login ke admin Joomla → buat artikel
     (isi judul, pilih kategori, isi editor CKEditor, upload gambar, isi
     tag/hashtags).
   - Pause untuk review — tekan Enter untuk lanjut.
   - Buka halaman berita publik → cari URL artikel yang baru dibuat.
   - Buka WhatsApp Web → kirim pesan ke grup "Salin" berisi judul, caption,
     URL artikel, hashtags.
6. Browser tidak ditutup otomatis — tutup manual setelah verifikasi selesai.

## Troubleshooting
| Gejala                        | Solusi                                             |
|-------------------------------|----------------------------------------------------|
| Playwright browser gagal launch | Pastikan `npx playwright install-deps chromium` sudah jalan. |
| Chromium headless hang        | Set `headless: false` (sudah default di config).   |
| WhatsApp Web "struk verifikasi"| Scan QR code manual di browser yang terbuka.      |
| Login Joomla gagal            | Cek kredensil di `index.js` (baris dengan `fill`). |
| GitHub upload gagal 401       | Pastikan `GITHUB_TOKEN` punya scope `repo`.       |
| AI mengembalikan non-JSON     | Lihat log error di `aiService.js` — biasanya quota/rate limit. |
| `data.json` kosong/invalid    | Pastikan `/ai` pernah dieksekusi sebelum `/proses`. |
| Module tidak ditemukan        | Jalankan `npm install` di masing-masing direktori (`playwright/` dan `telegram-bot/`). |
| `ECONNREFUSED` pada DeepSeek/Z-AI | Cek format Authorization header — pakai `Bearer ${API_KEY}`. |

## Catatan penting tentang keamanan
- Kredensial Joomla (`tripng` / `rahasiabanget`) dan API keys hardcode di
  source code (`aiService.js` baris 5, `index.js`). Ini **tidak aman** untuk
  produksi. Jika diminta untuk memperbaiki: pindahkan ke env vars, jangan
  hardcode.
- File `.env` mengandung `***` (placeholder) di `telegram-bot/.env` — ini
  file **lokal hanya**, tidak boleh di-push.
- Playwright persistent context menyimpan session di `~/.config/playwright-profile/`
  (atau `~/playwright-profile`). Session ini berisi login Joomla + WhatsApp Web.
  Jangan hapus saat automation masih berjalan.