const { chromium } = require("playwright");
const assert = require("node:assert/strict");
(async () => {
  const options = { headless: true, args: ["--no-sandbox", "--disable-gpu"] };
  if (process.env.CHROME_EXECUTABLE) options.executablePath = process.env.CHROME_EXECUTABLE;
  if (process.env.CHROME_ARGS) options.args = JSON.parse(process.env.CHROME_ARGS);
  const browser = await chromium.launch(options);
  const ctx = await browser.newContext({ viewport: { width: 360, height: 740 } });
  ctx.setDefaultTimeout(10000);
  await ctx.addInitScript(() => {
    window.openingCount = 0;
    new MutationObserver((records) => {
      for (const record of records)
        for (const node of record.addedNodes)
          if (node.nodeType === 1) {
            if (node.matches(".opening-logo")) window.openingCount++;
            window.openingCount += node.querySelectorAll(".opening-logo").length;
          }
    }).observe(document, { childList: true, subtree: true });
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  const url = process.env.APP_URL || "http://127.0.0.1:4173/";
  const click = (name) => page.getByRole("button", { name, exact: true }).click();
  const save = () => page.locator(".editor button[type=submit]").click();
  const home = () => page.getByRole("heading", { name: "Minha carga", exact: true }).waitFor();
  const q = (name) => page.getByRole("spinbutton", { name, exact: true });
  await page.goto(url);
  await home();
  await page.waitForFunction(() => window.openingCount === 1);
  // Intro can never capture input; CSS alone hides it even without cleanup.
  if (await page.locator(".opening-logo").count()) {
    assert.equal(
      await page.locator(".opening-logo").evaluate((e) => getComputedStyle(e).pointerEvents),
      "none",
    );
    assert.equal(
      await page.locator(".opening-logo").evaluate((e) => getComputedStyle(e).animationDuration),
      "0.78s",
    );
  }
  await page.waitForFunction(
    () =>
      !document.querySelector(".opening-logo") ||
      Number(getComputedStyle(document.querySelector(".opening-logo")).opacity) === 0,
  );
  await page.getByText("Pronto para usar offline", { exact: true }).waitFor();
  assert.equal(await page.locator("[role=progressbar]").count(), 0);
  await page.screenshot({ path: "/tmp/polish-home-360.png", animations: "disabled" });
  await click("Montar minha carga");
  await page.getByLabel("Nome do produto").fill("Água");
  await click("350 mL");
  assert.equal(await page.getByLabel("Volume da bebida").inputValue(), "350");
  await click("2 L");
  assert.equal(
    await page.getByRole("button", { name: "L", exact: true }).getAttribute("aria-pressed"),
    "true",
  );
  await click("600 mL");
  await click("1 L");
  // Burst clicks in a single event loop task exercise functional state updates.
  await page.getByRole("button", { name: "Aumentar Fechados", exact: true }).evaluate((b) => {
    for (let n = 0; n < 20; n++) b.click();
  });
  assert.equal(await q("Fechados").inputValue(), "21");
  assert.equal(await page.locator(".quantity-preview-row.closed svg").count(), 4);
  await page.getByText("+17", { exact: true }).waitFor();
  const height = await page
    .locator(".quantity-preview")
    .evaluate((e) => e.getBoundingClientRect().height);
  await q("Fechados").fill("7");
  await q("Pra abrir").fill("3");
  assert.equal(
    await page.locator(".quantity-preview").evaluate((e) => e.getBoundingClientRect().height),
    height,
  );
  await page.getByRole("button", { name: "Adicionar 10 fardos à carga", exact: true }).waitFor();
  await page.getByLabel("Volume da bebida").fill("1,5");
  await page.locator(".quantities").scrollIntoViewIfNeeded();
  await page.screenshot({ path: "/tmp/polish-quantities-360.png", animations: "disabled" });
  await save();
  await home();
  await page.getByText("10 fardos adicionados", { exact: true }).waitFor();
  await page.getByRole("heading", { name: "Água 1,5 L", exact: true }).waitFor();
  await click("Peguei parte");
  await q("Fechados").fill("4");
  await q("Pra abrir").fill("2");
  await save();
  await home();
  await page.getByText("6 de 10 fardos coletados", { exact: true }).waitFor();
  assert.equal(await page.locator(".open-metric strong").innerText(), "2");
  assert.equal(await page.getByRole("progressbar").getAttribute("aria-valuenow"), "6");
  await click("Desfazer");
  await page.getByText("0 de 10 fardos coletados", { exact: true }).waitFor();
  await click("Peguei tudo");
  await page.getByText("Carga separada. Bora descer!", { exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Finalizar carga", exact: true }).count(), 1);
  assert.equal(await page.evaluate(() => window.openingCount), 1);
  await page.getByRole("heading", { name: "Minha carga", exact: true }).scrollIntoViewIfNeeded();
  await page.setViewportSize({ width: 320, height: 640 });
  await page.screenshot({ path: "/tmp/polish-progress-320.png", animations: "disabled" });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await click("Meus produtos");
  await click("Minha carga");
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  assert.equal(await page.evaluate(() => window.openingCount), 1);
  await ctx.setOffline(true);
  await page.reload();
  await page.getByText("Sem internet · pronto para usar offline", { exact: true }).waitFor();
  await page.getByText("10 de 10 fardos coletados", { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.openingCount), 0); // same session: no replay after reload
  await click("Realocar no depósito");
  await q("Fechados").fill("2");
  await q("Pra abrir").fill("1");
  await save();
  await home();
  await page.getByText("7 de 7 fardos coletados", { exact: true }).waitFor();
  assert.equal(await page.locator(".open-metric strong").innerText(), "2");
  await click("Adicionar produto");
  await page.getByLabel("Nome do produto").fill("Suco");
  await click("350 mL");
  await save();
  await home();
  await page.getByText("7 de 8 fardos coletados", { exact: true }).waitFor();
  await click("Não tem · aguardar");
  await page.getByText("7 de 7 fardos coletados", { exact: true }).waitFor();
  await click("Adicionar produto");
  await page.setViewportSize({ width: 320, height: 310 });
  await page.getByLabel("Nome do produto").fill("Teste teclado");
  await q("Fechados").fill("1");
  await save();
  await home();
  await page.getByText("1 fardo adicionado", { exact: true }).waitFor();
  // Reduced motion skips the intro entirely in a fresh session.
  const reduced = await browser.newContext({
    reducedMotion: "reduce",
    viewport: { width: 320, height: 640 },
  });
  const reducedPage = await reduced.newPage();
  await reducedPage.goto(url);
  await reducedPage.getByRole("button", { name: "Montar minha carga", exact: true }).waitFor();
  assert.equal(await reducedPage.locator(".opening-logo").count(), 0);
  // Simulate missing CSS animations; the default overlay is invisible and app usable.
  const noAnimation = await browser.newContext();
  const raw = await noAnimation.newPage();
  await raw.addInitScript(() => {
    new MutationObserver(() => {
      if (!document.getElementById("no-animation-test") && document.head) {
        const style = document.createElement("style");
        style.id = "no-animation-test";
        style.textContent = "* { animation: none !important; }";
        document.head.appendChild(style);
      }
    }).observe(document, { childList: true, subtree: true });
  });
  await raw.goto(url);
  await raw.getByRole("button", { name: "Montar minha carga", exact: true }).click();
  await raw.getByLabel("Nome do produto").fill("Interface liberada");
  if (await raw.locator(".opening-logo").count())
    assert.equal(
      await raw.locator(".opening-logo").evaluate((e) => getComputedStyle(e).opacity),
      "0",
    );
  assert.deepEqual(errors, []);
  await browser.close();
  console.log(
    "PASS: session-only 780ms intro, nonblocking/failure/reduced-motion, 20 burst taps, capped icons/stable height, presets/manual volume, truthful progress/undo/returns/pending, offline and 320px keyboard viewport.",
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
