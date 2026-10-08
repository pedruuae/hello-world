import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  add,
  bring,
  clone,
  collect,
  defer,
  editItem,
  emptyData,
  finish,
  normalize,
  remaining,
  rename,
  sum,
  validate,
  type Data,
  type Item,
  type Pending,
  type Product,
  type Quantities,
} from "./model";
import { changeData, readData } from "./db";
import { requestPersistence, useOffline } from "./offline";
import { Icon } from "./Icon";
type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};
type Tab = "load" | "pending" | "products";
type Editor = {
  kind: "add" | "load" | "pending" | "collect" | "rename";
  id: string;
  name: string;
  closed: number;
  open: number;
  note: string;
  maxClosed?: number;
  maxOpen?: number;
};
const freshEditor = (name = ""): Editor => ({
  kind: "add",
  id: "",
  name,
  closed: 1,
  open: 0,
  note: "",
});
function Counter({
  label,
  value,
  max = 99999,
  onChange,
}: {
  label: string;
  value: number;
  max?: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="quantity-row">
      <label>
        {label}
        <span>fardos</span>
      </label>
      <div className="stepper">
        <button
          type="button"
          aria-label={`Diminuir ${label}`}
          disabled={value <= 0}
          onClick={() => onChange(Math.max(0, value - 1))}
        >
          −
        </button>
        <input
          aria-label={label}
          type="number"
          inputMode="numeric"
          min="0"
          max={max}
          step="1"
          required
          value={Number.isNaN(value) ? "" : value}
          onChange={(e) => onChange(e.target.value === "" ? NaN : Number(e.target.value))}
        />
        <button
          type="button"
          aria-label={`Aumentar ${label}`}
          disabled={value >= max}
          onClick={() => onChange(Math.min(max, (value || 0) + 1))}
        >
          +
        </button>
      </div>
    </div>
  );
}
function Breakdown({ closed, open }: Quantities) {
  return (
    <div className="breakdown">
      <span>
        <strong>{closed}</strong> fechados
      </span>
      <span>
        <strong>{open}</strong> pra abrir
      </span>
    </div>
  );
}
export default function App() {
  const [data, setData] = useState<Data>(emptyData);
  const [loaded, setLoaded] = useState(false),
    [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>("load"),
    [editor, setEditor] = useState<Editor | null>(null);
  const [menu, setMenu] = useState(false),
    [finishing, setFinishing] = useState(false);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [undo, setUndo] = useState<{ data: Data; revision: number } | null>(null);
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState("recent");
  const [imported, setImported] = useState<Data | null>(null);
  const [install, setInstall] = useState<InstallEvent | null>(null);
  const [persistence, setPersistence] = useState("");
  const lock = useRef(false),
    file = useRef<HTMLInputElement>(null),
    heading = useRef<HTMLHeadingElement>(null);
  const main = useRef<HTMLElement>(null);
  const offline = useOffline();
  const askedPersistence = useRef(false);
  const editorRevision = useRef(0);
  useEffect(() => {
    readData()
      .then((d) => {
        setData(d);
        setLoaded(true);
      })
      .catch((e) => setError("Não foi possível abrir seus dados. " + e.message));
    const prompt = (e: Event) => {
      e.preventDefault();
      setInstall(e as InstallEvent);
    };
    window.addEventListener("beforeinstallprompt", prompt);
    return () => window.removeEventListener("beforeinstallprompt", prompt);
  }, []);
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible" && !lock.current)
        readData()
          .then(setData)
          .catch(() => setError("Não foi possível reler seus dados. Tente reabrir o app."));
    };
    document.addEventListener("visibilitychange", refresh);
    return () => document.removeEventListener("visibilitychange", refresh);
  }, []);
  useEffect(() => {
    window.scrollTo(0, 0);
    if (main.current) main.current.scrollTop = 0;
    heading.current?.focus();
  }, [editor?.kind, menu, finishing, tab]);
  async function mutate(fn: (d: Data) => void, message: string, canUndo = false) {
    if (lock.current) return false;
    lock.current = true;
    setBusy(true);
    setError("");
    const before = clone(data);
    try {
      const next = await changeData(fn, data.revision);
      setData(next);
      setNotice(message);
      if (!askedPersistence.current) {
        askedPersistence.current = true;
        void requestPersistence();
      }
      setUndo(canUndo ? { data: before, revision: next.revision } : null);
      return true;
    } catch (e) {
      setError(
        e instanceof DOMException
          ? "Não foi possível salvar no aparelho. Verifique o espaço livre e tente novamente. Nenhuma alteração foi confirmada."
          : e instanceof Error
            ? e.message
            : "Não foi possível salvar. Verifique o espaço livre e tente novamente.",
      );
      try {
        setData(await readData());
      } catch {
        /* keep last confirmed state */
      }
      return false;
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }
  function openEditor(e: Editor) {
    editorRevision.current = data.revision;
    setEditor(e);
    setError("");
    setNotice("");
  }
  function closeEditor() {
    if (window.confirm("Sair sem salvar esta anotação?")) {
      setEditor(null);
      setError("");
    }
  }
  function edit(i: Item | Pending, kind: "load" | "pending") {
    openEditor({ kind, id: i.id, name: nameOf(i), closed: i.closed, open: i.open, note: i.note });
  }
  function editCollection(i: Item) {
    openEditor({
      kind: "collect",
      id: i.id,
      name: nameOf(i),
      closed: i.gotClosed,
      open: i.gotOpen,
      note: "",
      maxClosed: i.closed,
      maxOpen: i.open,
    });
  }
  function nameOf(i: Item | Pending) {
    return data.products.find((p) => p.id === i.productId)?.name || "Produto";
  }
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!editor) return;
    const v = editor;
    if (editorRevision.current !== data.revision) {
      setError(
        "A lista mudou enquanto você editava. Volte e abra o produto novamente para conferir as quantidades.",
      );
      return;
    }
    let merge = false;
    if (v.kind === "add") {
      const p = data.products.find((p) => normalize(p.name) === normalize(v.name));
      if (p && data.load.some((i) => i.productId === p.id)) {
        merge = window.confirm(
          "Este produto já está na carga. Somar os fardos informados ao item existente?",
        );
        if (!merge) return;
      }
    }
    const ok = await mutate(
      (d) => {
        if (v.kind === "add") add(d, v.name, v, v.note, merge);
        else if (v.kind === "collect") collect(d, v.id, v);
        else if (v.kind === "rename") rename(d, v.id, v.name);
        else editItem(d, v.kind, v.id, v.name, v, v.note);
      },
      v.kind === "collect" ? "Coleta atualizada." : "Salvo no aparelho.",
    );
    if (ok) {
      setEditor(null);
      if (v.kind === "add") setTab("load");
    }
  }
  async function remove(kind: "load" | "pending", i: Item | Pending) {
    if (
      !window.confirm(
        `Remover “${nameOf(i)}” ${kind === "load" ? "da carga" : "das pendências"}? As quantidades serão descartadas. Você poderá desfazer até a próxima alteração.`,
      )
    )
      return;
    await mutate(
      (d) => {
        if (kind === "load") d.load = d.load.filter((x) => x.id !== i.id);
        else d.pending = d.pending.filter((x) => x.id !== i.id);
      },
      "Item removido.",
      true,
    );
  }
  async function exportBackup() {
    try {
      const latest = await readData();
      const blob = new Blob(
        [
          JSON.stringify(
            { app: "Meu Corredor", exportedAt: new Date().toISOString(), data: latest },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      );
      const url = URL.createObjectURL(blob),
        a = document.createElement("a");
      a.href = url;
      a.download = `meu-corredor-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      setNotice("Download solicitado. Confira o arquivo na pasta Downloads.");
    } catch {
      setError("Não foi possível exportar o backup. Tente novamente.");
    }
  }
  async function importFile(f: File | undefined) {
    if (!f) return;
    try {
      if (f.size > 10 * 1024 * 1024) throw new Error("O arquivo é grande demais. Limite: 10 MB.");
      const text = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsText(f);
      });
      const raw = JSON.parse(text);
      if (raw.app !== "Meu Corredor") throw new Error("Escolha um backup do Meu Corredor.");
      setImported(validate(raw.data));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível ler esse arquivo.");
    }
    if (file.current) file.current.value = "";
  }
  useEffect(() => {
    if (!editor) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [editor]);
  const toGet = data.load.filter((i) => sum(remaining(i)) > 0),
    inLoad = data.load.filter((i) => i.gotClosed + i.gotOpen > 0);
  const left = toGet.reduce((a, i) => a + sum(remaining(i)), 0),
    got = inLoad.reduce((a, i) => a + i.gotClosed + i.gotOpen, 0);
  const names = data.products
    .filter((p) => normalize(p.name).includes(normalize(query)))
    .filter((p) => filter !== "favorites" || p.favorite)
    .sort((a, b) =>
      filter === "all" ? a.name.localeCompare(b.name, "pt-BR") : b.usedAt - a.usedAt,
    );
  const subscreen = !!editor || menu || finishing;
  function productRow(p: Product) {
    return (
      <article className="product-row" key={p.id}>
        <button className="product-pick" onClick={() => openEditor(freshEditor(p.name))}>
          <span>{p.name}</span>
          <span className="muted">
            Adicionar à carga <Icon name="plus" size={18} />
          </span>
        </button>
        <div className="product-tools">
          <button
            className={p.favorite ? "favorite active" : "favorite"}
            aria-label={`${p.favorite ? "Desfavoritar" : "Favoritar"} ${p.name}`}
            aria-pressed={p.favorite}
            disabled={busy}
            onClick={() =>
              mutate(
                (d) => {
                  const x = d.products.find((x) => x.id === p.id)!;
                  x.favorite = !x.favorite;
                },
                p.favorite ? "Favorito removido." : "Produto favoritado.",
              )
            }
          >
            <Icon name="star" />
            <span>{p.favorite ? "Favorito" : "Favoritar"}</span>
          </button>
          <button
            className="text-button"
            onClick={() => openEditor({ ...freshEditor(p.name), kind: "rename", id: p.id })}
          >
            Editar nome
          </button>
        </div>
      </article>
    );
  }
  return (
    <div className="app-shell">
      <header className="app-header">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            if (!subscreen) setTab("load");
          }}
        >
          <span className="brand-icon">
            <Icon name="box" size={25} />
          </span>
          <span>
            Meu Corredor<small>Uma carga de cada vez.</small>
          </span>
        </a>
        <button
          className="menu-button"
          disabled={busy || !!editor}
          onClick={() => {
            setMenu(!menu);
            setFinishing(false);
            setError("");
          }}
          aria-label={menu ? "Fechar menu" : "Abrir menu"}
        >
          <Icon name="menu" />
          <span>Menu</span>
        </button>
      </header>
      <div className={`offline-status ${offline.ready ? "ready" : ""}`} role="status">
        <span className="status-dot" />
        {offline.ready ? (
          <span>
            {offline.online
              ? "Pronto para usar offline"
              : "Sem internet · pronto para usar offline"}
          </span>
        ) : (
          <span>{offline.status}</span>
        )}
      </div>
      <main ref={main}>
        {error && (
          <div className="alert error" role="alert">
            {error}
          </div>
        )}
        {notice && !editor && (
          <div className="alert success" role="status">
            <span>{notice}</span>
            {undo && (
              <button
                disabled={busy}
                onClick={async () => {
                  const u = undo;
                  if (data.revision !== u.revision) {
                    setError("A lista mudou. Não é possível desfazer com segurança.");
                    setUndo(null);
                    return;
                  }
                  await mutate(
                    (d) => Object.assign(d, clone(u.data), { revision: d.revision }),
                    "Alteração desfeita.",
                  );
                }}
              >
                Desfazer
              </button>
            )}
            <button
              className="dismiss"
              aria-label="Fechar aviso"
              onClick={() => {
                setNotice("");
                setUndo(null);
              }}
            >
              ×
            </button>
          </div>
        )}
        {!loaded ? (
          <section className="empty">
            <Icon name="box" size={42} />
            <h1>Abrindo suas anotações</h1>
            <p>
              {error
                ? "Não faça novas anotações até o armazenamento estar disponível."
                : "Carregando os dados deste aparelho…"}
            </p>
            {error && <button onClick={() => location.reload()}>Tentar novamente</button>}
          </section>
        ) : editor ? (
          <section className="editor">
            <button className="back-button" disabled={busy} onClick={closeEditor}>
              <Icon name="back" />
              Voltar
            </button>
            <h1 ref={heading} tabIndex={-1}>
              {editor.kind === "add"
                ? "Adicionar produto"
                : editor.kind === "collect"
                  ? "Quanto você pegou?"
                  : editor.kind === "rename"
                    ? "Editar nome"
                    : "Editar produto"}
            </h1>
            <p className="intro">
              {editor.kind === "collect"
                ? "Informe o total já coletado, incluindo o que pegou antes."
                : editor.kind === "rename"
                  ? "O novo nome será usado também na carga e nas pendências."
                  : "Anote os fardos que você precisa buscar."}
            </p>
            <form onSubmit={save}>
              <fieldset disabled={busy}>
                {editor.kind === "collect" ? (
                  <div className="form-product">
                    <h2>{editor.name}</h2>
                    <p>
                      Solicitado: {editor.maxClosed} fechados · {editor.maxOpen} pra abrir
                    </p>
                  </div>
                ) : (
                  <label className="field-label">
                    Nome do produto
                    <input
                      autoComplete="off"
                      maxLength={120}
                      required
                      placeholder="Ex.: Açúcar 5 kg"
                      value={editor.name}
                      onChange={(e) => setEditor({ ...editor, name: e.target.value })}
                    />
                  </label>
                )}
                {editor.kind === "add" && editor.name.trim() && (
                  <div className="suggestions">
                    {data.products
                      .filter(
                        (p) =>
                          normalize(p.name).includes(normalize(editor.name)) &&
                          p.name !== editor.name,
                      )
                      .slice(0, 4)
                      .map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setEditor({ ...editor, name: p.name })}
                        >
                          {p.name}
                        </button>
                      ))}
                  </div>
                )}
                {editor.kind !== "rename" && (
                  <>
                    <div className="quantities">
                      <Counter
                        label="Fechados"
                        value={editor.closed}
                        {...(editor.maxClosed !== undefined ? { max: editor.maxClosed } : {})}
                        onChange={(closed) => setEditor({ ...editor, closed })}
                      />
                      <Counter
                        label="Pra abrir"
                        value={editor.open}
                        {...(editor.maxOpen !== undefined ? { max: editor.maxOpen } : {})}
                        onChange={(open) => setEditor({ ...editor, open })}
                      />
                    </div>
                    <p className="hint">
                      “Pra abrir” conta fardos, não unidades. Abra na área de vendas.
                    </p>
                    <div className="form-total">
                      <span>
                        {editor.kind === "collect" ? "Total coletado" : "Total para buscar"}
                      </span>
                      <strong>{(editor.closed || 0) + (editor.open || 0)} fardos</strong>
                    </div>
                    {editor.kind === "collect" ? (
                      <p className="hint">
                        Restante: {Math.max(0, (editor.maxClosed || 0) - (editor.closed || 0))}{" "}
                        fechados · {Math.max(0, (editor.maxOpen || 0) - (editor.open || 0))} pra
                        abrir
                      </p>
                    ) : (
                      <label className="field-label">
                        Observação <span className="optional">opcional</span>
                        <textarea
                          rows={3}
                          maxLength={500}
                          placeholder="Ex.: pegar o que vence primeiro"
                          value={editor.note}
                          onChange={(e) => setEditor({ ...editor, note: e.target.value })}
                        />
                      </label>
                    )}
                  </>
                )}
                <button className="primary full" type="submit">
                  {busy
                    ? "Salvando…"
                    : editor.kind === "collect"
                      ? "Salvar coleta"
                      : "Salvar produto"}
                </button>
              </fieldset>
            </form>
          </section>
        ) : menu ? (
          <section className="settings">
            <button className="back-button" onClick={() => setMenu(false)}>
              <Icon name="back" />
              Voltar para a lista
            </button>
            <h1 ref={heading} tabIndex={-1}>
              Seu app, seus dados.
            </h1>
            <p className="intro">Tudo fica neste navegador, neste aparelho.</p>
            {offline.update && (
              <div className="alert">
                Uma atualização está pronta. Salve suas anotações e feche todas as abas do app para
                aplicá-la. Não é preciso apagar os dados.
              </div>
            )}
            <section className="settings-section">
              <h2>Backup das anotações</h2>
              <p>
                Limpar os dados do navegador, perder o aparelho ou a remoção automática de
                armazenamento pode apagar suas listas. Guarde um backup de vez em quando.
              </p>
              <button className="secondary full" onClick={exportBackup}>
                <Icon name="down" />
                Exportar backup JSON
              </button>
              <button className="secondary full" onClick={() => file.current?.click()}>
                <Icon name="up" />
                Importar backup
              </button>
              <input
                ref={file}
                className="file-input"
                type="file"
                accept=".json,application/json"
                onChange={(e) => importFile(e.target.files?.[0])}
              />
              {imported && (
                <div className="import-confirm">
                  <h3>Substituir os dados atuais?</h3>
                  <p>
                    O arquivo tem {imported.products.length} produtos, {imported.load.length} itens
                    na carga e {imported.pending.length} pendências. As listas atuais serão
                    substituídas. Exporte-as antes, se precisar.
                  </p>
                  <button
                    disabled={busy}
                    className="primary full"
                    onClick={async () => {
                      const value = clone(imported);
                      if (
                        await mutate(
                          (d) => Object.assign(d, value, { revision: d.revision }),
                          "Backup restaurado.",
                        )
                      )
                        setImported(null);
                    }}
                  >
                    Confirmar substituição
                  </button>
                  <button className="full" onClick={() => setImported(null)}>
                    Cancelar importação
                  </button>
                </div>
              )}
            </section>
            <section className="settings-section">
              <h2>Instalar no celular</h2>
              <p>
                No Chrome, abra o menu ⋮ e escolha “Instalar app” ou “Adicionar à tela inicial”. O
                nome da opção depende do navegador.
              </p>
              {install && (
                <button
                  className="primary full"
                  onClick={async () => {
                    try {
                      await install.prompt();
                      await install.userChoice;
                      setInstall(null);
                    } catch {
                      setNotice("Use o menu do navegador para instalar.");
                    }
                  }}
                >
                  Instalar Meu Corredor
                </button>
              )}
              <p>
                Abra com internet e aguarde “Pronto para usar offline” antes de ir ao trabalho.
                Depois, teste fechando e reabrindo em modo avião.
              </p>
            </section>
            <section className="settings-section">
              <h2>Armazenamento e compatibilidade</h2>
              <button
                className="secondary full"
                onClick={async () => setPersistence(await requestPersistence())}
              >
                Pedir proteção de armazenamento
              </button>
              {persistence && <p role="status">{persistence}</p>}
              <p>
                A proteção depende do navegador e não substitui o backup. O app também pede essa
                proteção após o primeiro salvamento.
              </p>
              <p>
                Use Chrome 90 ou mais recente como base de compatibilidade. É necessário JavaScript,
                IndexedDB e, para offline, HTTPS, Cache Storage e service worker. Não há garantia
                para todo Galaxy J7: depende da versão do Android e do navegador. Instalação e
                teclado precisam ser conferidos no seu aparelho.
              </p>
              <p className="muted">Sem conta. Sem fotos. Sem conexão para suas listas.</p>
            </section>
          </section>
        ) : finishing ? (
          <section className="finish-screen">
            <button className="back-button" onClick={() => setFinishing(false)}>
              <Icon name="back" />
              Continuar a carga
            </button>
            <div className="empty-icon">
              <Icon name="check" size={32} />
            </div>
            <h1 ref={heading} tabIndex={-1}>
              Terminou a reposição?
            </h1>
            <p className="intro">
              Finalize só depois de descer e repor os produtos. Pegar no depósito ainda não é repor.
            </p>
            <div className="summary-line">
              <span>Coletados nesta carga</span>
              <strong>{got} fardos</strong>
            </div>
            {left > 0 && (
              <div className="alert">
                Ainda faltam <strong>{left} fardos</strong>. Ao finalizar, somente esse saldo irá
                para “Aguardando chegar”.
              </div>
            )}
            <p>
              Os itens desta carga serão encerrados. Seus produtos e pendências continuam salvos.
            </p>
            <button
              className="primary full"
              disabled={busy}
              onClick={async () => {
                if (await mutate((d) => finish(d, true), "Carga finalizada. Boa reposição!", true))
                  setFinishing(false);
              }}
            >
              {left ? "Mover saldo e finalizar" : "Confirmar finalização"}
            </button>
            <button className="secondary full" onClick={() => setFinishing(false)}>
              Continuar a carga
            </button>
          </section>
        ) : (
          <>
            <div className="page-heading">
              <div>
                <p className="eyebrow">
                  {tab === "load"
                    ? "DO CORREDOR AO DEPÓSITO"
                    : tab === "pending"
                      ? "PARA CONFERIR DEPOIS"
                      : "MENOS DIGITAÇÃO, MAIS AGILIDADE"}
                </p>
                <h1 ref={heading} tabIndex={-1}>
                  {tab === "load"
                    ? "Minha carga"
                    : tab === "pending"
                      ? "Aguardando chegar"
                      : "Meus produtos"}
                </h1>
              </div>
              <span className="page-symbol">
                <Icon
                  name={tab === "load" ? "box" : tab === "pending" ? "clock" : "list"}
                  size={28}
                />
              </span>
            </div>
            {tab === "load" ? (
              <>
                {data.load.length > 0 ? (
                  <>
                    <div className="load-summary">
                      <div>
                        <strong>{left}</strong>
                        <span>fardos para buscar</span>
                      </div>
                      <div>
                        <strong>{got}</strong>
                        <span>fardos na carga</span>
                      </div>
                    </div>
                    <section className="list-section">
                      <div className="section-heading">
                        <h2>Para buscar</h2>
                        <span>
                          {toGet.length} {toGet.length === 1 ? "produto" : "produtos"}
                        </span>
                      </div>
                      {toGet.length === 0 ? (
                        <p className="inline-empty">
                          <Icon name="check" />
                          Tudo coletado. Confira abaixo o que vai abrir.
                        </p>
                      ) : (
                        toGet.map((i) => (
                          <article className="item-card" key={i.id}>
                            <div className="item-top">
                              <h3>{nameOf(i)}</h3>
                              <span className="tag">
                                {i.gotClosed + i.gotOpen ? "Parcial" : "A buscar"}
                              </span>
                            </div>
                            <p className="item-total">
                              Buscar: <strong>{sum(remaining(i))} fardos</strong>
                            </p>
                            <Breakdown {...remaining(i)} />
                            {i.gotClosed + i.gotOpen > 0 && (
                              <p className="collected-note">
                                Já na carga: {i.gotClosed} fechados · {i.gotOpen} pra abrir
                              </p>
                            )}
                            {i.note && <p className="note">{i.note}</p>}
                            <div className="item-actions">
                              <button
                                className="primary"
                                disabled={busy}
                                onClick={() =>
                                  mutate(
                                    (d) => collect(d, i.id, i),
                                    "Tudo coletado. A reposição ainda precisa ser feita.",
                                    true,
                                  )
                                }
                              >
                                <Icon name="check" size={18} />
                                Peguei tudo
                              </button>
                              <button className="secondary" onClick={() => editCollection(i)}>
                                Peguei parte
                              </button>
                            </div>
                            <button
                              className="wait-button"
                              disabled={busy}
                              onClick={() =>
                                mutate(
                                  (d) => defer(d, i.id),
                                  "Somente o saldo foi para Aguardando chegar.",
                                  true,
                                )
                              }
                            >
                              <Icon name="clock" size={18} />
                              {i.gotClosed + i.gotOpen ? "Aguardar restante" : "Não tem · aguardar"}
                            </button>
                            <div className="item-tools">
                              <button onClick={() => edit(i, "load")}>Editar</button>
                              <button onClick={() => remove("load", i)}>Remover</button>
                            </div>
                          </article>
                        ))
                      )}
                    </section>
                    <section className="list-section">
                      <div className="section-heading">
                        <h2>Na carga</h2>
                        <span>
                          {inLoad.length} {inLoad.length === 1 ? "produto" : "produtos"}
                        </span>
                      </div>
                      <p className="section-help">
                        Você já pegou. Abra os fardos indicados ao descer.
                      </p>
                      {inLoad.length === 0 ? (
                        <p className="inline-empty">Os produtos coletados aparecerão aqui.</p>
                      ) : (
                        inLoad.map((i) => (
                          <article className="item-card collected" key={i.id}>
                            <div className="item-top">
                              <h3>{nameOf(i)}</h3>
                              <span className="tag">
                                <Icon name="check" size={14} />
                                Coletado
                              </span>
                            </div>
                            <p className="item-total">
                              <strong>{i.gotClosed + i.gotOpen} fardos</strong> na carga
                            </p>
                            <Breakdown closed={i.gotClosed} open={i.gotOpen} />
                            {i.gotOpen > 0 && (
                              <p className="opening-note">
                                Abrir {i.gotOpen} {i.gotOpen === 1 ? "fardo" : "fardos"} na área de
                                vendas
                              </p>
                            )}
                            {sum(remaining(i)) > 0 && (
                              <p className="muted">
                                Ainda falta buscar: {sum(remaining(i))} fardos.
                              </p>
                            )}
                            {i.note && <p className="note">{i.note}</p>}
                            <div className="item-tools">
                              <button onClick={() => editCollection(i)}>Corrigir coleta</button>
                              <button
                                disabled={busy}
                                onClick={() =>
                                  mutate(
                                    (d) => collect(d, i.id, { closed: 0, open: 0 }),
                                    "Coleta desfeita. O item voltou para buscar.",
                                    true,
                                  )
                                }
                              >
                                Desfazer coleta
                              </button>
                              <button onClick={() => edit(i, "load")}>Editar</button>
                              <button onClick={() => remove("load", i)}>Remover</button>
                            </div>
                          </article>
                        ))
                      )}
                    </section>
                    <button
                      className="secondary full finalize"
                      disabled={busy}
                      onClick={() => setFinishing(true)}
                    >
                      <Icon name="check" />
                      Finalizar carga
                    </button>
                  </>
                ) : (
                  <section className="empty">
                    <div className="empty-icon">
                      <Icon name={data.finishedAt ? "check" : "box"} size={38} />
                    </div>
                    <h2>
                      {data.finishedAt ? "Carga finalizada." : "Sua próxima carga começa aqui."}
                    </h2>
                    <p>
                      {data.finishedAt
                        ? "Pronto para outra? Adicione um produto para começar. Suas pendências continuam em Aguardando chegar."
                        : "Viu o que falta na prateleira? Adicione o produto e quantos fardos precisa buscar."}
                    </p>
                    <div className="empty-tip">
                      <Icon name="list" size={20} />
                      <span>
                        Fechados ou pra abrir.
                        <br />
                        Cada fardo no seu lugar.
                      </span>
                    </div>
                  </section>
                )}
              </>
            ) : tab === "pending" ? (
              <>
                <p className="intro">Você confere o depósito e decide quando tentar de novo.</p>
                {data.pending.length === 0 ? (
                  <section className="empty">
                    <div className="empty-icon">
                      <Icon name="clock" size={38} />
                    </div>
                    <h2>Nada aguardando por aqui.</h2>
                    <p>
                      Quando não encontrar um produto, toque em “Não tem” na carga. O saldo fica
                      guardado aqui.
                    </p>
                  </section>
                ) : (
                  data.pending.map((i) => (
                    <article className="item-card" key={i.id}>
                      <h3>{nameOf(i)}</h3>
                      <p className="item-total">
                        Pendente: <strong>{sum(i)} fardos</strong>
                      </p>
                      <Breakdown {...i} />
                      {i.note && <p className="note">{i.note}</p>}
                      <button
                        className="primary full"
                        disabled={busy}
                        onClick={() =>
                          mutate(
                            (d) => bring(d, i.id),
                            "Pendência movida para a carga atual.",
                            true,
                          )
                        }
                      >
                        <Icon name="plus" size={18} />
                        Buscar nesta carga
                      </button>
                      <div className="item-tools">
                        <button onClick={() => edit(i, "pending")}>Editar</button>
                        <button onClick={() => remove("pending", i)}>Remover</button>
                      </div>
                    </article>
                  ))
                )}
              </>
            ) : (
              <>
                <p className="intro">Os nomes que você usa ficam salvos aqui.</p>
                <label className="search">
                  <Icon name="search" />
                  <input
                    aria-label="Buscar produto"
                    placeholder="Buscar produto"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
                <div className="filters" aria-label="Filtrar produtos">
                  {[
                    ["recent", "Recentes"],
                    ["favorites", "Favoritos"],
                    ["all", "Todos"],
                  ].map(([key, text]) => (
                    <button
                      key={key}
                      className={filter === key ? "active" : ""}
                      aria-pressed={filter === key}
                      onClick={() => setFilter(key!)}
                    >
                      {text}
                    </button>
                  ))}
                </div>
                {names.length ? (
                  names.map(productRow)
                ) : (
                  <section className="empty">
                    <div className="empty-icon">
                      <Icon name="list" size={38} />
                    </div>
                    <h2>
                      {query
                        ? "Nenhum produto encontrado."
                        : filter === "favorites"
                          ? "Seus favoritos ficam aqui."
                          : "Sua lista vai ganhando forma."}
                    </h2>
                    <p>
                      {query
                        ? "Você pode adicionar esse nome direto na carga."
                        : filter === "favorites"
                          ? "Toque em Favoritar ao lado de um produto para encontrá-lo mais rápido."
                          : "Adicione seu primeiro produto à carga. O nome será lembrado na próxima vez."}
                    </p>
                  </section>
                )}
              </>
            )}
          </>
        )}
      </main>
      {loaded && !subscreen && (
        <footer className="bottom-bar">
          <div className="add-area">
            <button
              disabled={busy}
              className="primary full add-button"
              onClick={() => openEditor(freshEditor())}
            >
              <Icon name="plus" />
              Adicionar produto
            </button>
          </div>
          <nav aria-label="Áreas do aplicativo">
            {(
              [
                { key: "load", label: "Minha carga", icon: "box" },
                { key: "pending", label: "Aguardando chegar", icon: "clock" },
                { key: "products", label: "Meus produtos", icon: "list" },
              ] as const
            ).map((t) => (
              <button
                key={t.key}
                className={tab === t.key ? "selected" : ""}
                aria-current={tab === t.key ? "page" : undefined}
                onClick={() => {
                  setTab(t.key);
                  setError("");
                }}
              >
                <Icon name={t.icon} />
                <span>{t.label}</span>
                {t.key === "pending" && data.pending.length > 0 && (
                  <span className="nav-count">{data.pending.length}</span>
                )}
              </button>
            ))}
          </nav>
        </footer>
      )}
    </div>
  );
}
