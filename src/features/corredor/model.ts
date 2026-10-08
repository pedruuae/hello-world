export type Quantities = { closed: number; open: number };
export type Product = { id: string; name: string; favorite: boolean; usedAt: number };
export type Item = Quantities & {
  id: string;
  productId: string;
  note: string;
  gotClosed: number;
  gotOpen: number;
};
export type Pending = Quantities & { id: string; productId: string; note: string };
export type Data = {
  version: 1;
  revision: number;
  products: Product[];
  load: Item[];
  pending: Pending[];
  finishedAt: number | null;
};
export const emptyData = (): Data => ({
  version: 1,
  revision: 0,
  products: [],
  load: [],
  pending: [],
  finishedAt: null,
});
export const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim()
    .replace(/\s+/g, " ");
export const id = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 12);
export const remaining = (i: Item): Quantities => ({
  closed: i.closed - i.gotClosed,
  open: i.open - i.gotOpen,
});
export const sum = (q: Quantities) => q.closed + q.open;
export const clone = (d: Data): Data => JSON.parse(JSON.stringify(d));
export function quantities(q: Quantities, allowZero = false) {
  if (
    ![q.closed, q.open].every((n) => Number.isSafeInteger(n) && n >= 0 && n <= 99999) ||
    (!allowZero && sum(q) === 0)
  )
    throw new Error(
      "Informe fardos inteiros de 0 a 99.999. Pelo menos uma quantidade deve ser maior que zero.",
    );
}
export function product(d: Data, name: string) {
  name = name.trim().replace(/\s+/g, " ");
  if (!name || name.length > 120) throw new Error("Informe um nome com até 120 caracteres.");
  let p = d.products.find((p) => normalize(p.name) === normalize(name));
  if (!p) {
    p = { id: id(), name, favorite: false, usedAt: Date.now() };
    d.products.push(p);
  }
  p.usedAt = Date.now();
  return p;
}
export function add(d: Data, name: string, q: Quantities, note: string, merge: boolean) {
  quantities(q);
  const p = product(d, name);
  const existing = d.load.find((i) => i.productId === p.id);
  if (existing) {
    if (!merge)
      throw new Error("Este produto já está na carga. Confirme para somar as quantidades.");
    existing.closed += q.closed;
    existing.open += q.open;
    quantities(existing);
    existing.note = joinNotes(existing.note, note);
  } else
    d.load.push({
      id: id(),
      productId: p.id,
      closed: q.closed,
      open: q.open,
      note: note.trim(),
      gotClosed: 0,
      gotOpen: 0,
    });
  d.finishedAt = null;
}
function joinNotes(a: string, b: string) {
  return a === b || !b.trim() ? a : [a, b.trim()].filter(Boolean).join(" • ").slice(0, 500);
}
export function collect(d: Data, itemId: string, q: Quantities) {
  quantities(q, true);
  const i = d.load.find((i) => i.id === itemId);
  if (!i) throw new Error("Item não encontrado.");
  if (q.closed > i.closed || q.open > i.open)
    throw new Error("A coleta não pode ultrapassar o solicitado.");
  // Absolute totals: editing a collection must never add it again.
  i.gotClosed = q.closed;
  i.gotOpen = q.open;
}
export function defer(d: Data, itemId: string) {
  const i = d.load.find((i) => i.id === itemId);
  if (!i) throw new Error("Item não encontrado.");
  const q = remaining(i);
  if (!sum(q)) return;
  const p = d.pending.find((p) => p.productId === i.productId);
  if (p) {
    p.closed += q.closed;
    p.open += q.open;
    p.note = joinNotes(p.note, i.note);
    quantities(p);
  } else
    d.pending.push({
      id: id(),
      productId: i.productId,
      closed: q.closed,
      open: q.open,
      note: i.note,
    });
  i.closed = i.gotClosed;
  i.open = i.gotOpen;
  if (!sum(i)) d.load = d.load.filter((x) => x.id !== i.id);
}
export function bring(d: Data, pendingId: string) {
  const p = d.pending.find((p) => p.id === pendingId);
  if (!p) throw new Error("Pendência não encontrada.");
  const name = d.products.find((x) => x.id === p.productId)!.name;
  add(d, name, p, p.note, true);
  d.pending = d.pending.filter((x) => x.id !== pendingId);
}
export function finish(d: Data, moveRemaining: boolean) {
  if (d.load.some((i) => sum(remaining(i)))) {
    if (!moveRemaining) throw new Error("Ainda há fardos para buscar.");
    d.load.slice().forEach((i) => defer(d, i.id));
  }
  d.load = [];
  d.finishedAt = Date.now();
}
export function editItem(
  d: Data,
  kind: "load" | "pending",
  itemId: string,
  name: string,
  q: Quantities,
  note: string,
) {
  quantities(q);
  const i = d[kind].find((i) => i.id === itemId);
  if (!i) throw new Error("Item não encontrado.");
  const original = d.products.find((p) => p.id === i.productId)!;
  if (normalize(name) !== normalize(original.name)) {
    const p = product(d, name);
    if (d[kind].some((x) => x.id !== itemId && x.productId === p.id))
      throw new Error(
        "Esse nome já existe nesta lista. Use o mesmo nome ou escolha outro produto.",
      );
    i.productId = p.id;
  }
  if (kind === "load") {
    const a = i as Item;
    if (q.closed < a.gotClosed || q.open < a.gotOpen)
      throw new Error("Corrija a coleta antes de reduzir abaixo do que já pegou.");
  }
  i.closed = q.closed;
  i.open = q.open;
  i.note = note.trim();
}
export function rename(d: Data, productId: string, name: string) {
  name = name.trim().replace(/\s+/g, " ");
  if (!name || name.length > 120) throw new Error("Informe um nome com até 120 caracteres.");
  if (d.products.some((p) => p.id !== productId && normalize(p.name) === normalize(name)))
    throw new Error("Já existe um produto com esse nome.");
  d.products.find((p) => p.id === productId)!.name = name;
}
export function validate(raw: unknown): Data {
  const fail = () => {
    throw new Error("Backup inválido ou de uma versão incompatível. Nenhum dado foi substituído.");
  };
  if (!raw || typeof raw !== "object") return fail();
  const d = raw as Data;
  if (
    d.version !== 1 ||
    !Number.isSafeInteger(d.revision) ||
    d.revision < 0 ||
    !Array.isArray(d.products) ||
    !Array.isArray(d.load) ||
    !Array.isArray(d.pending) ||
    (d.finishedAt !== null && (!Number.isSafeInteger(d.finishedAt) || d.finishedAt < 0))
  )
    return fail();
  if (d.products.length > 20000 || d.load.length > 20000 || d.pending.length > 20000) return fail();
  const ids = new Set<string>(),
    names = new Set<string>();
  for (const p of d.products) {
    if (
      !p ||
      typeof p.id !== "string" ||
      !p.id ||
      ids.has(p.id) ||
      typeof p.name !== "string" ||
      !p.name.trim() ||
      p.name.length > 120 ||
      names.has(normalize(p.name)) ||
      typeof p.favorite !== "boolean" ||
      !Number.isSafeInteger(p.usedAt) ||
      p.usedAt < 0
    )
      return fail();
    ids.add(p.id);
    names.add(normalize(p.name));
  }
  for (const list of [d.load, d.pending]) {
    const itemIds = new Set<string>(),
      products = new Set<string>();
    for (const i of list) {
      if (
        !i ||
        typeof i.id !== "string" ||
        !i.id ||
        itemIds.has(i.id) ||
        !ids.has(i.productId) ||
        products.has(i.productId) ||
        typeof i.note !== "string" ||
        i.note.length > 500
      )
        return fail();
      try {
        quantities(i);
      } catch {
        return fail();
      }
      if (list === d.load) {
        const a = i as Item;
        try {
          quantities({ closed: a.gotClosed, open: a.gotOpen }, true);
        } catch {
          return fail();
        }
        if (a.gotClosed > a.closed || a.gotOpen > a.open) return fail();
      }
      itemIds.add(i.id);
      products.add(i.productId);
    }
  }
  // Whitelist fields. Never persist arbitrary imported properties.
  return {
    version: 1,
    revision: d.revision,
    finishedAt: d.finishedAt,
    products: d.products.map((p) => ({
      id: p.id,
      name: p.name,
      favorite: p.favorite,
      usedAt: p.usedAt,
    })),
    load: d.load.map((i) => ({
      id: i.id,
      productId: i.productId,
      closed: i.closed,
      open: i.open,
      gotClosed: i.gotClosed,
      gotOpen: i.gotOpen,
      note: i.note,
    })),
    pending: d.pending.map((i) => ({
      id: i.id,
      productId: i.productId,
      closed: i.closed,
      open: i.open,
      note: i.note,
    })),
  };
}
