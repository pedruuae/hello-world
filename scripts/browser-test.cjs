/* Run against a production preview. Playwright is a test-only tool.
   NODE_PATH=/path/to/playwright/node_modules node scripts/browser-test.cjs
   Optional: CHROME_EXECUTABLE, APP_URL, SCREENSHOT_DIR. */
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
(async () => {
  const opts = { headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] };
  if (process.env.CHROME_ARGS) opts.args = JSON.parse(process.env.CHROME_ARGS);
  if (process.env.CHROME_EXECUTABLE) opts.executablePath = process.env.CHROME_EXECUTABLE;
  const browser = await chromium.launch(opts);
  const context = await browser.newContext({
    viewport: { width: 360, height: 740 },
    acceptDownloads: true,
  });
  context.setDefaultTimeout(12000);
  let page = await context.newPage();
  const errors = [];
  const bind = (p) => {
    p.on("pageerror", (e) => errors.push(e.message));
    p.on("dialog", (d) => d.accept());
  };
  bind(page);
  const url = process.env.APP_URL || "http://127.0.0.1:4173/";
  const visible = (text) => page.getByText(text, { exact: true }).waitFor();
  const click = async (text) => {
    if (text === "Salvar produto") return page.locator('.editor button[type="submit"]').click();
    if (text === "Adicionar produto")
      return page.getByRole("button", { name: /^(Adicionar produto|Montar minha carga)$/ }).click();
    return page.getByRole("button", { name: text, exact: true }).click();
  };
  const state = () =>
    page.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const r = indexedDB.open("meu-corredor", 1);
          r.onerror = reject;
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
  const screenshot = async (name) => {
    if (process.env.SCREENSHOT_DIR) {
      fs.mkdirSync(process.env.SCREENSHOT_DIR, { recursive: true });
      await page.screenshot({
        path: path.join(process.env.SCREENSHOT_DIR, name + ".png"),
        fullPage: true,
      });
    }
  };
  async function addItem(name, closed, open) {
    await click("Adicionar produto");
    await page.getByLabel("Nome do produto").fill(name);
    await page.getByRole("spinbutton", { name: "Fechados", exact: true }).fill(String(closed));
    await page.getByRole("spinbutton", { name: "Pra abrir", exact: true }).fill(String(open));
    await click("Salvar produto");

    await page.getByRole("heading", { name: "Minha carga", exact: true }).waitFor();
  }
  await page.goto(url);
  await visible("Pronto para usar offline");
  await screenshot("empty-360");
  await addItem("Açúcar 5 kg", 3, 2);
  assert.equal((await state()).load[0].closed, 3);
  await click("Peguei parte");
  await page.getByRole("spinbutton", { name: "Fechados", exact: true }).fill("1");
  await page.getByRole("spinbutton", { name: "Pra abrir", exact: true }).fill("1");
  await click("Salvar coleta");
  await visible("Coleta atualizada.");
  await click("Corrigir coleta");
  await click("Salvar coleta");
  await visible("Coleta atualizada.");
  assert.equal((await state()).load[0].gotClosed, 1);
  await click("Aguardar restante");
  await visible("Somente o saldo foi para Aguardando chegar.");
  let d = await state();
  assert.equal(d.load[0].closed, 1);
  assert.equal(d.load[0].open, 1);
  assert.equal(d.pending[0].closed, 2);
  assert.equal(d.pending[0].open, 1);
  await screenshot("collected-360");
  await click("Finalizar carga");
  await click("Confirmar finalização");
  await visible("Carga finalizada.");
  await click("Aguardando chegar 1");
  await click("Buscar nesta carga");
  await visible("Pendência movida para a carga atual.");
  d = await state();
  assert.equal(d.pending.length, 0);
  assert.equal(d.load.length, 1);
  assert.equal(d.load[0].closed, 2);
  await click("Minha carga");
  await addItem("acucar 5 kg", 1, 1);
  d = await state();
  assert.equal(d.load.length, 1);
  assert.equal(d.load[0].closed, 3);
  assert.equal(d.load[0].open, 2);
  await click("Editar");
  await page.getByRole("spinbutton", { name: "Fechados", exact: true }).fill("4");
  await page.getByLabel("Observação").fill("Abrir na prateleira de cima");
  await click("Salvar produto");
  await visible("Salvo no aparelho.");
  d = await state();
  assert.equal(d.load[0].closed, 4);
  await click("Remover");
  await visible("Item removido.");
  assert.equal((await state()).load.length, 0);
  await click("Desfazer");
  await visible("Alteração desfeita.");
  assert.equal((await state()).load[0].closed, 4);
  await context.setOffline(true);
  await page.reload();
  await visible("Sem internet · pronto para usar offline");
  assert.equal((await state()).load[0].closed, 4);
  await addItem("Feijão 1 kg", 2, 0);
  await screenshot("load-offline-360");
  // Close tab and reopen while disconnected, preserving IndexedDB + cached resources.
  await page.close();
  page = await context.newPage();
  bind(page);
  await page.goto(url);
  await visible("Sem internet · pronto para usar offline");
  assert.equal((await state()).load.length, 2);
  await click("Abrir menu");
  const downloadEvent = page.waitForEvent("download");
  await click("Exportar backup JSON");
  const download = await downloadEvent;
  const backupPath = await download.path();
  const backup = JSON.parse(fs.readFileSync(backupPath, "utf8"));
  assert.equal(backup.data.load.length, 2);
  await page.locator("input[type=file]").setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"app":"Meu Corredor","data":{}}'),
  });
  await visible("Backup inválido ou de uma versão incompatível. Nenhum dado foi substituído.");
  assert.equal((await state()).load.length, 2);
  await click("Voltar para a lista");
  await page.getByRole("button", { name: "Remover", exact: true }).first().click();
  await visible("Item removido.");
  await click("Abrir menu");
  await page.locator("input[type=file]").setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  assert.equal((await state()).load.length, 1);
  await click("Confirmar substituição");
  await visible("Backup restaurado.");
  assert.equal((await state()).load.length, 2);
  await click("Voltar para a lista");
  await click("Meus produtos");
  await page.getByLabel("Buscar produto").fill("ACUCAR");
  await visible("Açúcar 5 kg");
  await click("Favoritar Açúcar 5 kg");
  await visible("Produto favoritado.");
  await click("Favoritos");
  await visible("Açúcar 5 kg");
  await click("Editar nome");
  await page.getByLabel("Nome do produto").fill("Açúcar cristal 5 kg");
  await click("Salvar produto");
  await visible("Salvo no aparelho.");
  await page.getByLabel("Buscar produto").fill("");
  await click("Minha carga");
  await visible("Açúcar cristal 5 kg");
  await page.setViewportSize({ width: 320, height: 640 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await screenshot("load-320");
  await click("Adicionar produto");
  await page.getByLabel("Nome do produto").fill("Teste teclado");
  await page.setViewportSize({ width: 320, height: 310 });
  await page.getByLabel("Observação").fill("Viewport reduzido simula a área ocupada pelo teclado.");
  await page.locator('.editor button[type="submit"]').scrollIntoViewIfNeeded();
  await screenshot("keyboard-simulated-320");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await click("Salvar produto");
  await visible("1 fardo adicionado");
  await page.setViewportSize({ width: 360, height: 740 });
  await click("Finalizar carga");
  await visible("Mover saldo e finalizar");
  await click("Mover saldo e finalizar");
  await visible("Carga finalizada.");
  d = await state();
  assert.equal(d.load.length, 0);
  assert.equal(d.pending.length, 3);
  await click("Aguardando chegar 3");
  await page.getByRole("button", { name: "Remover", exact: true }).first().click();
  await visible("Item removido.");
  await click("Desfazer");
  await visible("Alteração desfeita.");
  assert.equal((await state()).pending.length, 3);
  // Simulate a real IndexedDB write error: never claim success or lose input.
  await click("Adicionar produto");
  await page.getByLabel("Nome do produto").fill("Falha de gravação");
  const beforeFailure = await state();
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function () {
      IDBObjectStore.prototype.put = original;
      throw new DOMException("Quota exceeded", "QuotaExceededError");
    };
  });
  await click("Salvar produto");
  await page
    .getByRole("alert")
    .filter({ hasText: "Não foi possível salvar no aparelho" })
    .waitFor();
  assert.deepEqual(await state(), beforeFailure);
  assert.equal(await page.getByLabel("Nome do produto").inputValue(), "Falha de gravação");
  await click("Voltar");
  await click("Minha carga");
  assert.equal(
    await page.evaluate(
      () =>
        document.querySelector("main").getBoundingClientRect().bottom <=
        document.querySelector("footer").getBoundingClientRect().top + 1,
    ),
    true,
  );
  assert.deepEqual(errors, []);
  console.log(
    "PASS: production CRUD, partial collection, balance transfers, finalization, undo, duplicates, names/favorites, backup validation/restoration, offline reload + reopen, 320/360px and reduced viewport.",
  );
  await browser.close();
  // A persistent profile verifies a full browser shutdown, beyond reopening a tab.
  const profile = fs.mkdtempSync(require("node:os").tmpdir() + "/corredor-restart-");
  let persisted = await chromium.launchPersistentContext(profile, {
    ...opts,
    viewport: { width: 360, height: 740 },
  });
  let reopened = persisted.pages()[0] || (await persisted.newPage());
  await reopened.goto(url);
  await reopened.getByText("Pronto para usar offline", { exact: true }).waitFor();
  await reopened.getByRole("button", { name: "Montar minha carga", exact: true }).click();
  await reopened.getByLabel("Nome do produto").fill("Arroz após reiniciar");
  await reopened.locator('.editor button[type="submit"]').click();
  await reopened.getByText("1 fardo adicionado", { exact: true }).waitFor();
  await persisted.close();
  persisted = await chromium.launchPersistentContext(profile, {
    ...opts,
    viewport: { width: 360, height: 740 },
  });
  await persisted.setOffline(true);
  reopened = persisted.pages()[0] || (await persisted.newPage());
  await reopened.goto(url);
  await reopened.getByText("Sem internet · pronto para usar offline", { exact: true }).waitFor();
  await reopened.getByRole("heading", { name: "Arroz após reiniciar", exact: true }).waitFor();
  await persisted.close();
  fs.rmSync(profile, { recursive: true, force: true });
  console.log("PASS: full browser shutdown and offline restart preserve cached app and IndexedDB.");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
