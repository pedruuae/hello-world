// Production preview only. Playwright is a test tool, never shipped in the app.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
(async () => {
  const options = {
    headless: true,
    args: JSON.parse(process.env.CHROME_ARGS || '["--no-sandbox"]'),
  };
  if (process.env.CHROME_EXECUTABLE) options.executablePath = process.env.CHROME_EXECUTABLE;
  const profile = fs.mkdtempSync("/tmp/corredor-theme-");
  const url = process.env.APP_URL || "http://127.0.0.1:4173/";
  let context = await chromium.launchPersistentContext(profile, {
    ...options,
    viewport: { width: 320, height: 640 },
    colorScheme: "dark",
  });
  context.setDefaultTimeout(10000);
  const errors = [];
  async function setup(ctx) {
    await ctx.addInitScript(() => {
      window.firstAppTheme = null;
      new MutationObserver(() => {
        if (!window.firstAppTheme && document.querySelector(".app-shell"))
          window.firstAppTheme = document.documentElement.dataset.theme;
      }).observe(document, { childList: true, subtree: true });
    });
  }
  await setup(context);
  let page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  const click = (name) => page.getByRole("button", { name, exact: true }).click();
  const q = (name) => page.getByRole("spinbutton", { name, exact: true });
  const save = () => page.locator(".editor button[type=submit]").click();
  const theme = async (value) => {
    await page.waitForFunction((v) => document.documentElement.dataset.theme === v, value);
  };
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
  const shot = async (name) => {
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      true,
    );
    await page.screenshot({ path: "/tmp/theme-" + name + ".png", animations: "disabled" });
  };
  await page.goto(url);
  await page.getByText("Pronto para usar offline", { exact: true }).waitFor();
  await theme("dark");
  assert.equal(await page.evaluate(() => window.firstAppTheme), "dark");
  assert.equal(
    await page.locator("html").evaluate((e) => getComputedStyle(e).backgroundColor),
    "rgb(15, 23, 42)",
  );
  await shot("empty-dark");
  await click("Abrir menu");
  await click("Claro");
  await theme("light");
  await page.emulateMedia({ colorScheme: "dark" });
  await theme("light");
  await click("Usar tema do aparelho");
  await theme("dark");
  await page.emulateMedia({ colorScheme: "light" });
  await theme("light");
  await click("Escuro");
  await theme("dark");
  await shot("menu-dark");
  await click("Voltar para a lista");
  await click("Montar minha carga");
  await page.getByLabel("Nome do produto").fill("Água");
  await click("600 mL");
  await q("Fechados").fill("3");
  await q("Pra abrir").fill("1");
  const beforeDraft = await state();
  await click("Abrir menu");
  await click("Claro");
  await click("Voltar à anotação");
  assert.equal(await page.getByLabel("Nome do produto").inputValue(), "Água");
  assert.equal(await q("Fechados").inputValue(), "3");
  assert.equal(await page.getByLabel("Volume da bebida").inputValue(), "600");
  assert.deepEqual(await state(), beforeDraft);
  await page.locator(".quantities").scrollIntoViewIfNeeded();
  await shot("editor-light");
  await click("Abrir menu");
  await click("Escuro");
  await click("Voltar à anotação");
  await page.locator(".quantities").scrollIntoViewIfNeeded();
  await shot("editor-dark");
  await save();
  await page.getByText("4 fardos adicionados", { exact: true }).waitFor();
  await click("Peguei parte");
  await q("Fechados").fill("2");
  await q("Pra abrir").fill("1");
  await save();
  await page.getByText("3 de 4 fardos coletados", { exact: true }).waitFor();
  await shot("progress-dark");
  await click("Aguardar restante");
  await page.getByText("3 de 3 fardos coletados", { exact: true }).waitFor();
  await click("Realocar no depósito");
  await q("Fechados").fill("1");
  await q("Pra abrir").fill("0");
  await save();
  await page
    .getByText("Devolução registrada. Os fardos não viraram pendência.", { exact: true })
    .waitFor();
  const saved = await state();
  for (const mode of ["Claro", "Escuro"]) {
    await click("Abrir menu");
    await click(mode);
    await click("Voltar para a lista");
    await shot("load-" + mode);
    await page.getByRole("button", { name: /^Aguardando chegar/ }).click();
    await shot("pending-" + mode);
    await click("Meus produtos");
    await shot("products-" + mode);
    await click("Minha carga");
    await click("Finalizar carga");
    await shot("finish-" + mode);
    await page.getByRole("button", { name: "Continuar a carga", exact: true }).first().click();
  }
  assert.deepEqual(await state(), saved);
  await click("Adicionar produto");
  await page.getByLabel("Nome do produto").fill("Rascunho preservado");
  await page.locator(".editor .back-button").click();
  await page.getByRole("alertdialog").waitFor();
  await shot("dialog-dark");
  await page.keyboard.press("Escape");
  assert.equal(await page.getByLabel("Nome do produto").inputValue(), "Rascunho preservado");
  await page.locator(".editor .back-button").click();
  await click("Confirmar");
  await page.getByRole("button", { name: "Remover", exact: true }).first().click();
  await click("Cancelar");
  assert.deepEqual(await state(), saved);
  await page.getByRole("button", { name: "Remover", exact: true }).first().click();
  await click("Confirmar");
  await page.getByText("Item removido.", { exact: true }).waitFor();
  await click("Desfazer");
  assert.deepEqual((await state()).load, saved.load);
  await click("Adicionar produto");
  await page.getByLabel("Nome do produto").fill("Água");
  await click("600 mL");
  await save();
  await page.getByRole("alertdialog").waitFor();
  await click("Confirmar");
  await page.getByText("1 fardo adicionado", { exact: true }).waitFor();
  assert.equal((await state()).load.length, 1);
  await click("Adicionar produto");
  await page.setViewportSize({ width: 320, height: 310 });
  await page.getByLabel("Nome do produto").fill("Teclado");
  await q("Fechados").fill("0");
  await q("Pra abrir").fill("0");
  await save();
  await page.locator(".alert.error").waitFor();
  await shot("error-keyboard-dark");
  await q("Fechados").fill("1");
  await save();
  await page.getByText("1 fardo adicionado", { exact: true }).waitFor();
  const beforeRestart = await state();
  await context.setOffline(true);
  await page.reload();
  await theme("dark");
  await page.getByText("Sem internet · pronto para usar offline", { exact: true }).waitFor();
  assert.deepEqual(await state(), beforeRestart);
  await context.close();
  context = await chromium.launchPersistentContext(profile, {
    ...options,
    viewport: { width: 360, height: 740 },
    colorScheme: "light",
    offline: true,
  });
  await setup(context);
  page = await context.newPage();
  await page.goto(url);
  await page.getByText("Sem internet · pronto para usar offline", { exact: true }).waitFor();
  await theme("dark");
  assert.equal(await page.evaluate(() => window.firstAppTheme), "dark");
  assert.deepEqual(await state(), beforeRestart);
  await click("Abrir menu");
  await click("Claro");
  await page.reload();
  await theme("light");
  await page.getByText("Sem internet · pronto para usar offline", { exact: true }).waitFor();
  assert.deepEqual(await state(), beforeRestart);
  await context.close();
  const browser = await chromium.launch(options);
  const fallback = await browser.newContext();
  await fallback.addInitScript(() => {
    window.matchMedia = undefined;
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "meu-corredor-appearance") throw new Error("blocked");
      return original.call(this, key, value);
    };
  });
  page = await fallback.newPage();
  await page.goto(url);
  await click("Abrir menu");
  await theme("light");
  await click("Escuro");
  await theme("dark");
  await page.getByText(/não permitiu salvar a preferência/).waitFor();
  await shot("storage-error");
  await browser.close();
  assert.deepEqual(errors, []);
  console.log(
    "PASS themes: system/manual, first paint, draft/data preservation, all screens, themed confirmations, 320px/keyboard viewport, persistence after offline browser restart, unsupported APIs/storage failure.",
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
