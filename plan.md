# Plan: API Health Monitor Log (Interval 1 Menit)

## 1. Tujuan

Membuat sistem log monitoring berkala yang berjalan otomatis setiap 1 menit untuk
memantau ketersediaan dan kesehatan seluruh layanan eksternal API yang digunakan
oleh pipeline news automation MAN 1 Kota Gorontalo. Sistem ini akan melakukan
health check terhadap Telegram Bot API, GitHub API, Gemini API key, situs Joomla
man1kotagorontalo.sch.id, dan binary Chromium Playwright, lalu menuliskan hasil
lengkap (ISO timestamp, nama layanan, status OK/FAIL, response time, kode HTTP,
pesan error jika ada) ke file log terstruktur di
`telegram-bot/logs/api-monitor.log`. Dengan demikian, admin dapat mendeteksi dini
layanan down, melakukan audit berkelanjutan, dan memastikan seluruh komponen eksternal
siap sebelum workflow `/proses` (Playwright automation) dijalankan — tanpa menambah
dependency npm baru, dengan memanfaatkan modul built-in Node.js (`fs`, `path`) dan
modul `axios` yang sudah terpasang di `telegram-bot/node_modules`.

Data flow yang diusulkan:

    [monitor.js (setInterval 60s)]
        |
        +--> checkTelegram()   --> GET api.telegram.org/bot${TOKEN}/getMe
        +--> checkGitHub()     --> GET api.github.com/rate_limit
        +--> checkGeminiKey()  --> cek env GEMINI_API_KEY (tidak call API, hemat quota)
        +--> checkJoomla()     --> GET man1kotagorontalo.sch.id/
        +--> checkChromium()   --> fs.existsSync chromium binary
        |
        +--> [logger.js] --> tulis ke logs/api-monitor.log + console


## 2. Keputusan yang dikunci

Berikut keputusan untuk hal-hal debatable yang harus diselesaikan sekarang:

1. **Lokasi file log**: `telegram-bot/logs/api-monitor.log`.
   Direktori `logs/` akan dibuat via `fs.mkdirSync({ recursive: true })`.
   File `*.log` sudah tercantum di `.gitignore` (baris 10), jadi file log
   tidak akan di-commit ke git. Hanya `.gitkeep` di dalam `logs/` yang
   ter-commit untuk menjaga struktur direktori.

2. **Format log**: `[ISO_TIMESTAMP] [LEVEL] [SERVICE] message {json_detail}`.
   Human-readable tapi tetap terstruktur: tiap baris dimulai dengan timestamp
   ISO 8601, diikuti level (INFO/WARN/ERROR), nama layanan, pesan singkat,
   dan opsional object JSON detail (response time, HTTP status code, error
   message). Format ini mudah dibaca di terminal dan mudah di-parse dengan regex.

3. **Modul logger terpisah**: `telegram-bot/utils/logger.js`.
   Dipisahkan agar reusable oleh modul lain (mis. aiService.js di masa depan).
   Mengekspor satu fungsi `log(level, service, message, [detail])`.

4. **Skrip monitor standalone**: `telegram-bot/monitor.js`.
   Berjalan sebagai proses terpisah (`node telegram-bot/monitor.js`),
   tidak diintegrasikan ke dalam `index.js` bot karena `index.js` tidak boleh
   dimodifikasi. Monitor dan bot dijalankan secara paralel (bisa via tmux/screen
   atau PM2 di production — PM2 di luar cakupan karena dependency baru).
   Guard `require.main === module` memastikan interval hanya start saat di-run
   langsung, bukan saat di-require oleh test.

5. **Strategi health check**:
   - **Telegram** — `GET https://api.telegram.org/bot${TELEGRAM_TOKEN}/getMe`
     (lightweight, konfirmasi token valid, dapat HTTP status + response time).
   - **GitHub** — `GET https://api.github.com/rate_limit`
     (lightweight, tidak konsumsi API write quota).
   - **Gemini / DeepSeek / Z-AI / OpenRouter** — cek eksistensi env var
     (`GEMINI_API_KEY`, `DEEPSEEK_API_KEY`, `ZAI_API_KEY`, `OPENROUTER_API_KEY`)
     saja, tidak call API untuk menghindari konsumsi quota.
   - **Joomla** — `GET https://man1kotagorontalo.sch.id/` cek HTTP 200.
   - **Chromium** — `fs.existsSync` untuk path binary yang didefinisikan
     di `playwright/index.js` (env `PW_CHROME_BIN`, `/usr/bin/chromium`, dst).

6. **HTTP client**: `axios` (versi ^1.13.6 sudah terpasang di
   `telegram-bot/node_modules`). Tidak perlu install dependency baru.

7. **Interval default**: 60000ms (1 menit). Bisa override via env
   `MONITOR_INTERVAL_MS` untuk testing (mis. `MONITOR_INTERVAL_MS=2000`).

8. **Env loading**: `require('./config/env')` — mengikuti pola yang ada di
   proyek (config/env.js sudah memanggil `dotenv.config()`). Tidak perlu
   memodifikasi config/env.js.

9. **Error isolation**: setiap health check dibungkus `try/catch` terpisah.
   Jika satu layanan gagal, layanan lain tetap di-check. `checkAllServices()`
   memakai `Promise.allSettled` untuk paralel non-blocking.

10. **Response time measurement**: tiap HTTP check mengukur `Date.now()`
    sebelum dan setelah request, hasilnya (ms) termasuk di log detail.


## 3. File yang boleh diubah / dibuat

### File BARU (dibuat)

| No | Path | Keterangan |
|----|------|-----------|
| 1 | `telegram-bot/utils/logger.js` | Modul logger utility — mengekspor `log(level, service, message, [detail])` |
| 2 | `telegram-bot/monitor.js` | Skrip health check monitor — mengekspor `checkAllServices()`, `startMonitor()`, dan individual check functions |
| 3 | `telegram-bot/logs/.gitkeep` | Placeholder agar directory `logs/` terjaga di git; file `*.log` di dalamnya otomatis ter-eklusi |
| 4 | `plan.md` | Dokumen rencana ini (di repo root) |

### File yang DIUBAH (dimodifikasi)

| No | Path | Perubahan |
|----|------|-----------|

_(Tidak ada — semua file yang ada tidak boleh dimodifikasi.)_


## 4. File yang TIDAK boleh diubah

Berikut adalah daftar penuh file yang tidak boleh disentuh:

**Telegram Bot:**
- `telegram-bot/index.js` — entry point bot
- `telegram-bot/indexold.js` — file backup lama
- `telegram-bot/handlers/commands.js` — handler perintah bot
- `telegram-bot/handlers/events.js` — handler event bot
- `telegram-bot/utils/aiService.js` — wrapper Gemini/DeepSeek/Z-AI/OpenRouter
- `telegram-bot/utils/github.js` — utilitas upload gambar ke GitHub
- `telegram-bot/utils/helpers.js` — helper (generateFileInfo, parseMetadata, escapeHTML)
- `telegram-bot/config/env.js` — env loader
- `telegram-bot/state/store.js` — in-memory cache (imageQueue, metaDataQueue, userSettings)
- `telegram-bot/note.md` — catatan developer

**Playwright:**
- `playwright/index.js` — fungsi automation (inti posting ke Joomla + WhatsApp)
- `playwright/run.js` — entry point CLI
- `playwright/news-upload.js` — utility eksploratif WhatsApp
- `playwright/berita.txt` — judul | isi berita
- `playwright/data.json` — metadata AI (kategori, caption, hashtags)
- `playwright/caption.txt` — caption (kosong)
- `playwright/playwright.config.js` — konfigurasi Playwright
- `playwright/img/*` — gambar referensi

**Konfigurasi / Manifest:**
- `telegram-bot/package.json` — dependency manifest
- `telegram-bot/package-lock.json` — lock file
- `playwright/package.json` — dependency manifest
- `playwright/package-lock.json` — lock file
- `telegram-bot/.env` — file env lokal (berisi kredensial asli)
- `telegram-bot/.env.example` — template env
- `.gitignore` — sudah mencakup `*.log`
- `AGENTS.md` — panduan agent

**Repository lain:**
- File apa pun di luar directory `telegram-bot/` dan root repo, kecuali `plan.md`.


## 5. Tugas atomik (maksimal 6, masing-masing satu commit)

### Tugas 1 — Buat modul logger utility
**File**: `telegram-bot/utils/logger.js` (BARU)

Spesifikasi:
- Import `fs` dan `path` (built-in Node.js).
- Definisikan `LOG_DIR` = `path.join(__dirname, '..', 'logs')` dan
  `LOG_FILE` = `path.join(LOG_DIR, 'api-monitor.log')`.
- `fs.mkdirSync(LOG_DIR, { recursive: true })` saat module load untuk
  memastikan directory ada.
- Ekspor fungsi `log(level, service, message, detail)`:
  - `level`: string (INFO, WARN, ERROR).
  - `service`: string (nama layanan, mis. 'TELEGRAM', 'GITHUB', 'MONITOR').
  - `message`: string deskripsi singkat.
  - `detail`: object opsional — akan di-JSON.stringify dan append di akhir baris.
  - Format output: `[ISO_TIMESTAMP] [LEVEL] [SERVICE] message` +
    ` {json}` jika detail ada.
  - Tulis ke file via `fs.appendFileSync(LOG_FILE, line + '\n')`.
  - Juga `console.log(line)` agar terlihat di terminal saat di-run.

Commit: `feat: add structured logger utility for API monitoring`

---

### Tugas 2 — Buat modul monitor.js
**File**: `telegram-bot/monitor.js` (BARU)

Spesifikasi:
- Import: `axios` (dari telegram-bot/node_modules), `fs`, `path`, `os`
  (built-in), logger dari `./utils/logger`, env dari `./config/env`.
- Definisikan konstanta:
  - `TELEGRAM_BASE` = `https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}`
  - `GITHUB_API` = `https://api.github.com/rate_limit`
  - `JOMLA_URL` = `https://man1kotagorontalo.sch.id/`
  - `CHROME_CANDIDATES` = array path yang sama seperti di `playwright/index.js`
    baris 68-75: `process.env.PW_CHROME_BIN`, `/usr/bin/chromium`,
    `/usr/bin/chromium-browser`, `/usr/bin/google-chrome`,
    `/usr/bin/google-chrome-stable` (filter Boolean).
- Fungsi individual (setiap satu async, return object `{ service, status, responseTime, detail }`):
  - `checkTelegram()`: GET `${TELEGRAM_BASE}/getMe` via axios, 10s timeout.
    Return `{ service: 'TELEGRAM', status: 'OK' | 'FAIL', responseTime: ms, httpStatus: number, detail: string }`.
  - `checkGitHub()`: GET `GITHUB_API` via axios, 10s timeout. Sama-sama return.
  - `checkGeminiKey()`: cek `!!process.env.GEMINI_API_KEY`. Return
    `{ service: 'GEMINI_KEY', status: 'OK' | 'FAIL', detail: 'API key configured' | 'API key missing' }`.
  - `checkDeepSeekKey()`: cek `!!process.env.DEEPSEEK_API_KEY`.
  - `checkZAIKey()`: cek `!!process.env.ZAI_API_KEY`.
  - `checkOpenRouterKey()`: cek `!!process.env.OPENROUTER_API_KEY`.
  - `checkJoomla()`: GET `JOMLA_URL` via axios, 10s timeout, ikuti redirect.
  - `checkChromium()`: loop `CHROME_CANDIDATES`, `fs.existsSync(p)`. Return
    path yang ditemukan atau `'NOT_FOUND'`.
- Fungsi `checkAllServices()`:
  - Panggil semua check di atas secara paralel via `Promise.allSettled`.
  - Untuk setiap hasil (fulfilled/rejected), log via `logger.log()` dengan
    level INFO (sukses), WARN (gagal) atau ERROR (error tak terduga).
  - Return array hasil semua check.
- Fungsi `startMonitor()`:
  - Baca interval dari env `MONITOR_INTERVAL_MS` (default 60000).
  - Log startup: `logger.log('INFO', 'MONITOR', \`Starting API health monitor (interval: ${interval}ms)\`)`.
  - Jalankan `checkAllServices()` sekali segera (immediate run).
  - `setInterval(checkAllServices, interval)`.
  - Simpan interval ID ke variabel modul `_interval` untuk bisa di-clear.
- Guard `if (require.main === module)`: panggil `startMonitor()`.
- Export: `{ checkAllServices, startMonitor, checkTelegram, checkGitHub, checkGeminiKey, checkDeepSeekKey, checkZAIKey, checkOpenRouterKey, checkJoomla, checkChromium }`.

Commit: `feat: add periodic API health check monitor (1-min interval)`

---

### Tugas 3 — Buat directory logs/
**File**: `telegram-bot/logs/.gitkeep` (BARU)

- Buat directory `telegram-bot/logs/`.
- Tambahkan file `.gitkeep` (kosong) agar git melacak directory ini.
- `*.log` sudah ada di `.gitignore`, jadi file log (`api-monitor.log`)
  tidak akan ter-commit otomatis.

Commit: `chore: add logs directory for API monitor output`

---

### Tugas 4 — Verifikasi logger module
**Verifikasi**: jalankan perintah pada bagian 6 (item a-c).

- Pastikan `node --check` tidak error.
- Pastikan `require('./utils/logger.js')` berhasil dan menciptakan file log.
- Pastikan isi log file mengandung format yang benar.

Commit: `test: verify logger module loads and writes structured log`

---

### Tugas 5 — Verifikasi monitor module
**Verifikasi**: jalankan perintah pada bagian 6 (item b, d-f).

- Pastikan `node --check` tidak error.
- Pastikan `require('./monitor.js')` berhasil (tanpa start interval).
- Pastikan `checkAllServices()` dapat dijalankan satu kali dan mengembalikan hasil.
- Pastikan `node monitor.js` dengan `MONITOR_INTERVAL_MS=2000` dan `timeout 5`
  menghasilkan minimal 1 baris log per layanan di file log.

Commit: `test: verify monitor health check produces log output`

---

### Tugas 6 — Finalisasi plan.md
**File**: `plan.md` (BARU di repo root)

- Simpan dokumen plan ini ke `plan.md` di root repo.
- Pastikan `plan.md` tidak ada di dalam `.gitignore` (sudah diverifikasi: tidak ada).

Commit: `docs: add plan for API health monitor with 1-min interval logging`


## 6. Tugas verifikasi

Berikut perintah persis untuk memverifikasi setiap langkah. Semua perintah
dijalankan dari root repo `/home/tripng/Projects/news`.

### a. Syntax check — logger
```bash
node --check telegram-bot/utils/logger.js
```

### b. Syntax check — monitor
```bash
node --check telegram-bot/monitor.js
```

### c. Module load check — logger (juga trigger write log)
```bash
cd telegram-bot && node -e "const l=require('./utils/logger.js');l.log('INFO','TEST','logger module loaded');console.log('OK')"
```

### d. Module load check — monitor (tanpa start interval)
```bash
cd telegram-bot && node -e "const m=require('./monitor.js');console.log(typeof m.checkAllServices, typeof m.startMonitor);console.log('OK')"
```

### e. Single health check cycle (manual trigger, lihat output)
```bash
cd telegram-bot && node -e "const m=require('./monitor.js');m.checkAllServices().then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>console.error(e))"
```

### f. Short-interval monitor run (2 detik, untuk testing)
```bash
cd telegram-bot && MONITOR_INTERVAL_MS=2000 timeout 5 node monitor.js 2>&1; echo "EXIT:$?"
```
Diharapkan: minimal 1 siklus checkAllServices berjalan (immediate run),
log muncul di console dan di file, process keluar setelah 5 detik.

### g. Log file inspection (cek format dan isi)
```bash
tail -30 telegram-bot/logs/api-monitor.log
```
Diharapkan: baris log dengan format
`[ISO_TIMESTAMP] [INFO] [TELEGRAM] message {...}`
dan seterusnya untuk setiap layanan.

### h. Git status verification (pastikan hanya file yang diizinkan)
```bash
git -C /home/tripng/Projects/news status --short
```
Diharapkan: hanya file baru (`telegram-bot/utils/logger.js`,
`telegram-bot/monitor.js`, `telegram-bot/logs/.gitkeep`, `plan.md`)
yang muncul sebagai untracked/modified. Tidak ada file `.log` yang
ter-commit.

### i. Git diff verification (pastikan tidak ada file yang dilarang dimodifikasi)
```bash
git -C /home/tripng/Projects/news diff --name-only
```
Diharapkan: output kosong (tidak ada file existing yang dimodifikasi),
kecuali `plan.md` yang baru.


## 7. Di luar cakupan

- Log rotation / manajemen ukuran file log (perlu library seperti
  `rotating-file-stream` — dependency baru, dilarang).
- Web dashboard untuk melihat log secara real-time.
- Fitur alert/notifikasi Telegram ke admin saat layanan down.
- Integrasi dengan sistem monitoring eksternal (UptimeRobot, Pingdom,
  Prometheus, Grafana).
- Penyimpanan log ke database (SQLite, MySQL, dsb).
- PM2 atau systemd service untuk auto-start `/proses` di production
  (PM2 = dependency baru).
- Distributed tracing / metrics collection.
- Historical trend analysis / reporting / grafik.
- Alert routing (email, Slack, SMS).
- Modifikasi `telegram-bot/index.js` untuk mengintegrasikan monitor ke dalam
  proses bot yang sedang berjalan.
- Penambahan dependency npm baru (`npm install`).
- Membuat HTTP API server (Express atau Node built-in http) untuk expose
  health check endpoint — tidak diperlukan untuk kebutuhan log monitoring
  yang diminta.
- Cek login admin Joomla (kredensial hardcoded di `playwright/index.js`,
  tidak aman untuk automated check).
- Cek status WhatsApp Web login (membutuhkan browser automation, tidak
  cocok untuk health check ringan setiap 1 menit).


## Pertanyaan terbuka

Berikut pertanyaan yang belum dapat dijawab dari informasi yang tersedia
di repo. Plan tidak menebak — menunggu keputusan user.

1. **Process model**: Apakah monitor harus berjalan sebagai proses terpisah
   (`node monitor.js` dijalankan di samping bot) atau diintegrasikan ke dalam
   proses bot yang sudah berjalan? Plan ini mengusulkan proses terpisah
   karena `index.js` tidak boleh dimodifikasi. Jika ingin integrasi,
   `index.js` perlu diubah — butuh konfirmasi eksplisit.

2. **Format log**: Apakah format log harus JSON-per-line (untuk parsing
   mesin/aggregator log) atau human-readable text? Plan ini mengusulkan
   format text yang readable dengan detail JSON di akhir tiap baris.
   Jika butuh JSON-per-line, format perlu disesuaikan.

3. **Log rotation**: Berapa lama atau berapa besar file log sebelum harus
   di-rotate/dihapus? Plan ini tidak menerapkan rotasi (file log akan tumbuh
   tanpa batas). Perlu kebijakan retention (mis. hapus log > 7 hari,
   atau rotate tiap 10MB).

4. **Alert notification**: Apakah monitor harus mengirim notifikasi ke
   Telegram (atau channel lain) ke admin ketika ada layanan yang down?
   Saat ini hanya logging tanpa notifikasi. Jika butuh alert, perlu
   ditambahkan logika kirim pesan via bot.

5. **Chromium binary path**: Apakah path-path yang dicek di
   `checkChromium()` (mengikuti `playwright/index.js` baris 68-75) sudah
   lengkap? Di CachyOS, Chromium mungkin berada di path berbeda
   (mis. `/usr/bin/chromium` atau `~/.cache/ms-playwright/`). Perlu konfirmasi.

6. **Layanan tambahan**: Apakah ada layanan eksternal lain yang harus
   dipantau selain yang tercantum (Telegram, GitHub, Gemini, Joomla,
   Chromium)? Mis. DeepSeek/Z-AI/OpenRouter API endpoint secara langsung
   (saat ini hanya cek env key, bukan API call).

7. **Production deployment**: Bagaimana monitor akan dijalankan di
   production? Via tmux/screen, systemd service, atau process manager?
   Plan ini tidak menyertakan setup service management (di luar cakupan).
