// Focused production regression: returns, legacy backup migration and mobile UI.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
(async () => {
  const options = {
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  };
  if (process.env.CHROME_EXECUTABLE) options.executablePath = process.env.CHROME_EXECUTABLE;
  if (process.env.CHROME_ARGS) options.args = JSON.parse(process.env.CHROME_ARGS);
  const browser = await chromium.launch(options);
  const context = await browser.newContext({
    viewport: { width: 360, height: 740 },
    acceptDownloads: true,
  });
  context.setDefaultTimeout(10000);
  const page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  const click = (name) => page.getByRole("button", { name, exact: true }).click();
  const state = () =>
    page.evaluate(
      () =>
        new Promise((resolve) => {
          const r = indexedDB.open("meu-corredor", 1);
          r.onsuccess = () => {
            const db = r.result;
            const q = db.transaction("data").objectStore("data").get("state");
            q.onsuccess = () => {
              resolve(q.result);
              db.close();
            };
          };
        }),
    );
  await page.goto(process.env.APP_URL || "http://127.0.0.1:4173/");
  await page.getByText("Pronto para usar offline", { exact: true }).waitFor();
  await page.getByRole("heading", { name: "Olá, Pedro Daniel!", exact: true }).waitFor();
  await page.screenshot({ path: "/tmp/corredor-welcome-blue.png" });
  const old = {
    app: "Meu Corredor",
    data: {
      version: 1,
      revision: 1,
      finishedAt: null,
      products: [{ id: "p1", name: "Coca-Cola 2 L", favorite: true, usedAt: 1 }],
      load: [
        {
          id: "i1",
          productId: "p1",
          closed: 5,
          open: 3,
          gotClosed: 3,
          gotOpen: 2,
          note: "Anotação antiga",
        },
      ],
      pending: [],
    },
  };
  await click("Abrir menu");
  await page.locator("input[type=file]").setInputFiles({
    name: "backup-antigo.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(old)),
  });
  await click("Confirmar substituição");
  await page.getByText("Backup restaurado.", { exact: true }).waitFor();
  await click("Voltar para a lista");
  assert.equal((await state()).version, 2);
  await click("Realocar no depósito");
  await page.getByRole("spinbutton", { name: "Fechados", exact: true }).fill("2");
  await page.getByRole("spinbutton", { name: "Pra abrir", exact: true }).fill("1");
  await click("Confirmar devolução");
  await page.getByRole("heading", { name: "Devolvidos ao depósito", exact: true }).waitFor();
  let d = await state();
  assert.equal(d.load[0].returnedClosed, 2);
  assert.equal(d.load[0].returnedOpen, 1);
  assert.equal(d.pending.length, 0);
  await click("Corrigir devolução");
  await click("Confirmar devolução");
  await page.getByRole("heading", { name: "Devolvidos ao depósito", exact: true }).waitFor();
  assert.equal((await state()).load[0].returnedClosed, 2);
  await context.setOffline(true);
  await page.reload();
  await page.getByText("Sem internet · pronto para usar offline", { exact: true }).waitFor();
  await page.locator(".item-card.collected").getByText("2 fardos", { exact: true }).waitFor();
  await page
    .getByRole("heading", { name: "Devolvidos ao depósito", exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: "/tmp/corredor-returns-blue.png" });
  await click("Aguardar restante");
  await page.getByText("Somente o saldo foi para Aguardando chegar.", { exact: true }).waitFor();
  d = await state();
  assert.equal(d.pending[0].closed, 2);
  assert.equal(d.pending[0].open, 1);
  assert.equal(d.load[0].returnedClosed, 2);
  await click("Corrigir devolução");
  await page.getByRole("spinbutton", { name: "Fechados", exact: true }).fill("0");
  await page.getByRole("spinbutton", { name: "Pra abrir", exact: true }).fill("0");
  await click("Confirmar devolução");
  await page.locator(".item-card.collected").getByText("5 fardos", { exact: true }).waitFor();
  await click("Desfazer");
  await page.getByRole("heading", { name: "Devolvidos ao depósito", exact: true }).waitFor();
  await click("Corrigir devolução");
  await page.getByRole("spinbutton", { name: "Fechados", exact: true }).fill("3");
  await page.getByRole("spinbutton", { name: "Pra abrir", exact: true }).fill("2");
  await click("Confirmar devolução");
  await page.getByRole("heading", { name: "Devolvidos ao depósito", exact: true }).waitFor();
  assert.equal(await page.locator(".item-card.collected").count(), 0);
  await page.setViewportSize({ width: 320, height: 640 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(
    await page.locator(".welcome").evaluate((e) => getComputedStyle(e).animationName),
    "none",
  );
  await click("Abrir menu");
  const downloadEvent = page.waitForEvent("download");
  await click("Exportar backup JSON");
  const download = await downloadEvent,
    backup = JSON.parse(require("node:fs").readFileSync(await download.path(), "utf8"));
  assert.equal(backup.data.version, 2);
  assert.equal(backup.data.load[0].returnedClosed, 3);
  await click("Voltar para a lista");
  await click("Finalizar carga");
  await click("Confirmar finalização");
  await page.getByText("Carga finalizada.", { exact: true }).waitFor();
  d = await state();
  assert.equal(d.load.length, 0);
  assert.equal(d.pending.length, 1);
  assert.equal(d.pending[0].closed, 2);
  assert.equal(d.pending[0].open, 1);
  await click("Abrir menu");
  await page.locator("input[type=file]").setInputFiles({
    name: "devolucoes.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await click("Confirmar substituição");
  await page.getByText("Backup restaurado.", { exact: true }).waitFor();
  assert.equal((await state()).load[0].returnedClosed, 3);
  assert.deepEqual(errors, []);
  await browser.close();
  console.log(
    "PASS: legacy migration, partial/full returns, absolute corrections, undo, genuine remaining balance, offline reload, backup round-trip, finalization, 320px and reduced motion.",
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
