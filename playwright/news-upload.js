const { chromium } = require("playwright");
const path = require("path");
const os = require("os");

(async () => {
  const userDataDir = path.join(os.homedir(), "playwright-profile");

  console.log(`Menggunakan profil dari: ${userDataDir}`);

  const browser = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: null,
    args: ["--start-maximized"],
  });

  const page =
    browser.pages().length > 0 ? browser.pages()[0] : await browser.newPage();

  await page.goto("https://web.whatsapp.com/");
  const chatPanel = page.locator("#pane-side");
  await chatPanel.waitFor({ state: "visible", timeout: 60000 });

  const namaGrup = "TP";
  const searchBox = page.locator("#_r_b_");
  await searchBox.waitFor({ state: "visible" });
  await searchBox.click();
  await searchBox.pressSequentially(namaGrup, { delay: 100 });
  const hasilPalingAtas = page.locator(`span[title="${namaGrup}"]`).first();
  await hasilPalingAtas.waitFor({ state: "visible", timeout: 10000 });
  await hasilPalingAtas.click();

  // // GO TO TOP CHANNELS
  // const tabChannels = page
  //   .locator(
  //     'span[title="Channels"], span[title="Saluran"], button[aria-label="Channels"], button[aria-label="Saluran"], [data-icon="channels-outline"]',
  //   )
  //   .first();
  // await tabChannels.waitFor({ state: "visible" });
  // await tabChannels.click();
  // await page.waitForTimeout(1000);
  // const channelPalingAtas = page
  //   .locator(
  //     '#pane-side div[role="row"], div[aria-label="Channel list"] div[role="listitem"]',
  //   )
  //   .first();
  // await channelPalingAtas.waitFor({ state: "visible", timeout: 15000 });
  // await channelPalingAtas.click();

  console.log("Berhasil membuka Channel paling atas!");
})();
