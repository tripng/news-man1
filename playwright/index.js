const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const data = require("./data.json");
const os = require("os");

// Tunggu user menekan Enter di terminal (pengganti page.pause() yang
// akan hang tanpa Playwright Inspector). Set PAUSE=0 untuk skip.
function waitForContinue(promptText) {
  if (process.env.PAUSE === "0") return Promise.resolve();
  const rl = require("readline").createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(promptText, () => {
      rl.close();
      resolve();
    });
  });
}

async function automation(images) {
  // Gunakan metadata dari data.json yang sudah di-require di atas
  // (bukan membaca ulang file dengan path relatif yang rawan ENOENT).
  const metadata = data;

  const filePath = path.join(__dirname, "berita.txt");
  const rawText = fs.readFileSync(filePath, "utf-8");
  const parts = rawText.split("|");
  const judul = parts[0].trim(); // Mengambil bagian sebelum "|" dan menghapus spasi berlebih
  const isiBerita = parts[1] ? parts[1].trim() : ""; // Mengambil bagian setelah "|"

  const paragrafArray = isiBerita.split(/\r?\n\r?\n/);

  const imageTags = images.map(
    (img) =>
      `<img alt="" data-cke-saved-src="${img.url}" src="${img.url}" style="margin: 5px; float: left; width: 400px; height: 225px;">`,
  );

  let htmlFinal = "";
  paragrafArray.forEach((teks, index) => {
    if (!teks.trim()) return;

    htmlFinal += `<p>${teks}</p>`;

    if (index === 0) {
      htmlFinal += imageTags[1] || "";
    }

    if (index === 4) {
      htmlFinal += imageTags[2] || "";
    }
  });

  const userDataDir = path.join(os.homedir(), "playwright-profile");
  console.log(`Menggunakan profil dari: ${userDataDir}`);

  // Hanya satu browser yang dibuka (launchPersistentContext sudah
  // menghidupkan browser, jadi jangan panggil chromium.launch lagi).
  //
  // executablePath diambil dari env PW_CHROME_BIN (atau /usr/bin/chromium
  // sebagai fallback) agar kita bisa pakai Chromium yang sudah terpasang
  // di sistem tanpa harus mengunduh build Playwright yang kadang gagal
  // di jaringan tertentu. Jika env tidak diset dan chromium sistem ada,
  // gunakan itu.
  const fsForPath = require("fs");
  const candidates = [
    process.env.PW_CHROME_BIN,
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
  ].filter(Boolean);
  const chromePath = candidates.find((p) => fsForPath.existsSync(p));

  const launchOpts = {
    headless: false,
    viewport: null,
    args: ["--start-maximized"],
  };
  if (chromePath) {
    launchOpts.executablePath = chromePath;
    console.log(`Menggunakan Chromium: ${chromePath}`);
  } else {
    console.log("Menggunakan Chromium bawaan Playwright");
  }

  const context = await chromium.launchPersistentContext(
    userDataDir,
    launchOpts,
  );

  const page =
    context.pages().length > 0 ? context.pages()[0] : await context.newPage();

  console.log("Membuka halaman admin");
  await page.goto("https://man1kotagorontalo.sch.id/administrator");

  await page.locator("#email").fill("tripng");
  await page.locator("#password").fill("rahasiabanget");

  await page.getByRole("button", { name: /masuk/i }).click();
  const content = page.getByText("Content");
  content.click();

  await content.waitFor({ state: "visible" });
  await page
    .getByRole("link", { name: /berita/i })
    .first()
    .click();

  await page.getByRole("link", { name: /buat berita/i }).click();

  const editorFrame = page.frameLocator(".cke_wysiwyg_frame");
  const area = editorFrame.locator("body.cke_editable");

  await page.locator('input[name="b"]').fill(judul);

  await page.locator('select[name="a"]').selectOption(`${metadata.kategori}`);

  await area.evaluate((elemen, htmlSiapPakai) => {
    elemen.innerHTML = htmlSiapPakai;
  }, htmlFinal);

  await page.locator('input[name="k"]').setInputFiles({
    name: images[0].filename,
    mimeType: "image/jpeg",
    buffer: images[0].buffer,
  });

  const hashtagsString = Array.isArray(metadata.hashtags)
    ? metadata.hashtags.join(" ")
    : metadata.hashtags || "";

  await page.locator('input[name="j"]').fill(hashtagsString);

  await waitForContinue(
    "\n[REVIEW] Cek form di browser. Tekan Enter untuk lanjut mengirim ke WhatsApp (atau Ctrl+C untuk batal)... ",
  );

  const page2 = await context.newPage();
  await page2.goto("https://www.man1kotagorontalo.sch.id/berita");

  await page2.locator('input[name="kata"]').fill(judul);
  await page2.locator('input[name="kata"]').press("Enter");

  const searchUrl = await page2
    .locator(".blog-item h3.post-title a")
    .first()
    .getAttribute("href");

  await page2.locator(".blog-item h3.post-title a").first().click();

  const page3 = await context.newPage();

  await page3.goto("https://web.whatsapp.com/");
  const chatPanel = page3.locator("#pane-side");
  await chatPanel.waitFor({ state: "visible", timeout: 60000 });

  const namaGrup = "Salin";
  const searchBox = page3.locator("#_r_a_");
  await searchBox.waitFor({ state: "visible" });
  await searchBox.click();
  await searchBox.pressSequentially(namaGrup, { delay: 100 });
  const hasilPalingAtas = page3.locator(`span[title="${namaGrup}"]`).first();
  await hasilPalingAtas.waitFor({ state: "visible", timeout: 10000 });
  await hasilPalingAtas.click();

  const teksPesan = `🗞*${judul}*🗞

${metadata.caption}
  
${searchUrl}

${hashtagsString}
`;

  // 2. Cari kotak input pesan (berada di dalam elemen #main dan footer)
  const kotakPesan = page3.locator('#main footer div[contenteditable="true"]');
  await kotakPesan.waitFor({ state: "visible" });
  await kotakPesan.click();

  const barisPesan = teksPesan.split("\n");

  // 4. Looping untuk memasukkan teks baris demi baris
  for (let i = 0; i < barisPesan.length; i++) {
    // Jika barisnya ada isinya, masukkan teksnya
    if (barisPesan[i] !== "") {
      await page3.keyboard.insertText(barisPesan[i]);
    }

    if (i < barisPesan.length - 1) {
      await page3.keyboard.press("Shift+Enter");
    }
  }
  await page3.waitForTimeout(500);

  // 5. Tekan Enter untuk mengirim pesan
  await page3.keyboard.press("Enter");

  console.log("Pesan berhasil dikirim!");
  console.log(teksPesan);

  // Browser sengaja TIDAK ditutup agar kamu bisa menutupnya manual
  // setelah selesai memeriksa hasil di layar.
}

module.exports = { automation };
