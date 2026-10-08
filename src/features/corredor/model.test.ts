import { describe, expect, it } from "vitest";
import {
  add,
  bring,
  clone,
  collect,
  carried,
  returned,
  returnToDepot,
  defer,
  editItem,
  emptyData,
  finish,
  normalize,
  remaining,
  rename,
  validate,
} from "./model";
describe("quantidades da reposição", () => {
  it("aceita quantidades vindas de formulário sem copiar campos de identidade", () => {
    const d = emptyData();
    const form = { id: "", kind: "add", name: "Arroz", closed: 2, open: 1, note: "" };
    add(d, form.name, form, form.note, false);
    expect(validate(d).load[0]!.id).not.toBe("");
  });
  it("preserva os fardos coletados e transfere só o saldo, inclusive ao trazer de volta", () => {
    const d = emptyData();
    add(d, "Açúcar 5 kg", { closed: 4, open: 3 }, "", false);
    const item = d.load[0]!;
    collect(d, item.id, { closed: 2, open: 1 });
    collect(d, item.id, { closed: 2, open: 1 }); // editing twice does not double
    expect(remaining(item)).toEqual({ closed: 2, open: 2 });
    defer(d, item.id);
    expect(d.pending[0]).toMatchObject({ closed: 2, open: 2 });
    expect(item).toMatchObject({ closed: 2, open: 1, gotClosed: 2, gotOpen: 1 });
    bring(d, d.pending[0]!.id);
    expect(d.pending).toHaveLength(0);
    expect(d.load).toHaveLength(1);
    expect(item).toMatchObject({ closed: 4, open: 3, gotClosed: 2, gotOpen: 1 });
  });
  it("transfere tudo se não encontrou e mantém o catálogo após finalizar", () => {
    const d = emptyData();
    add(d, "Arroz", { closed: 2, open: 1 }, "nota", false);
    expect(() => finish(d, false)).toThrow();
    finish(d, true);
    expect(d.load).toHaveLength(0);
    expect(d.pending[0]).toMatchObject({ closed: 2, open: 1 });
    expect(d.products).toHaveLength(1);
    bring(d, d.pending[0]!.id);
    expect(d.finishedAt).toBeNull();
    expect(d.load[0]).toMatchObject({ gotClosed: 0, gotOpen: 0, closed: 2, open: 1 });
  });
  it("valida quantidades, coleta excedente e redução abaixo do coletado", () => {
    for (const q of [
      { closed: -1, open: 1 },
      { closed: 0, open: 0 },
      { closed: 1.2, open: 1 },
      { closed: NaN, open: 1 },
    ])
      expect(() => add(emptyData(), "X", q, "", false)).toThrow();
    const d = emptyData();
    add(d, "X", { closed: 3, open: 1 }, "", false);
    const i = d.load[0]!;
    expect(() => collect(d, i.id, { closed: 4, open: 0 })).toThrow();
    collect(d, i.id, { closed: 2, open: 1 });
    expect(() => editItem(d, "load", i.id, "X", { closed: 1, open: 1 }, "")).toThrow();
    collect(d, i.id, { closed: 0, open: 0 });
    expect(remaining(i)).toEqual({ closed: 3, open: 1 });
  });
  it("soma duplicatas apenas com confirmação e pesquisa sem acentos", () => {
    const d = emptyData();
    add(d, "Açúcar 5 KG", { closed: 2, open: 1 }, "A", false);
    expect(() => add(d, "acucar 5 kg", { closed: 1, open: 2 }, "", false)).toThrow();
    add(d, "acucar 5 kg", { closed: 1, open: 2 }, "B", true);
    expect(d.load).toHaveLength(1);
    expect(d.products).toHaveLength(1);
    expect(d.load[0]).toMatchObject({ closed: 3, open: 3, note: "A • B" });
    expect(normalize(" AÇÚCAR  5 KG ")).toBe("acucar 5 kg");
  });
  it("rejeita backup inconsistente, duplicado ou com referências quebradas", () => {
    const d = emptyData();
    add(d, "X", { closed: 1, open: 1 }, "", false);
    expect(validate(d)).toEqual(d);
    const a = clone(d);
    a.load[0]!.gotClosed = 2;
    expect(() => validate(a)).toThrow();
    const b = clone(d);
    b.load.push({ ...b.load[0]!, id: "other" });
    expect(() => validate(b)).toThrow();
    const c = clone(d);
    c.products = [];
    expect(() => validate(c)).toThrow();
    expect(() => validate({ ...d, version: 3 })).toThrow();
    expect(() => validate({ ...d, revision: -1 })).toThrow();
    expect(() => validate({ ...d, pending: [null] })).toThrow();
  });
  it("renomeia em todas as listas e evita nomes duplicados", () => {
    const d = emptyData();
    add(d, "X", { closed: 1, open: 1 }, "", false);
    add(d, "Y", { closed: 1, open: 0 }, "", false);
    const p = d.products[0]!;
    expect(() => rename(d, p.id, "y")).toThrow();
    rename(d, p.id, "Novo nome");
    expect(d.load[0]!.productId).toBe(p.id);
    expect(d.products[0]!.name).toBe("Novo nome");
  });
});

describe("devolução ao depósito", () => {
  it("separa devolvidos, carregados e saldo sem duplicar ao corrigir", () => {
    const d = emptyData();
    add(d, "Coca-Cola 2 L", { closed: 5, open: 3 }, "", false);
    const i = d.load[0]!;
    collect(d, i.id, { closed: 3, open: 2 });
    returnToDepot(d, i.id, { closed: 2, open: 1 });
    returnToDepot(d, i.id, { closed: 2, open: 1 });
    expect(carried(i)).toEqual({ closed: 1, open: 1 });
    expect(returned(i)).toEqual({ closed: 2, open: 1 });
    expect(remaining(i)).toEqual({ closed: 2, open: 1 });
    expect(d.pending).toHaveLength(0);
    defer(d, i.id);
    expect(d.pending[0]).toMatchObject({ closed: 2, open: 1 });
    expect(carried(i)).toEqual({ closed: 1, open: 1 });
    bring(d, d.pending[0]!.id);
    expect(d.load).toHaveLength(1);
    expect(remaining(i)).toEqual({ closed: 2, open: 1 });
    finish(d, true);
    expect(d.pending).toHaveLength(1);
    expect(d.pending[0]).toMatchObject({ closed: 2, open: 1 });
  });
  it("limita a devolução ao coletado e permite desfazer sem criar falta", () => {
    const d = emptyData();
    add(d, "Suco", { closed: 2, open: 1 }, "", false);
    const i = d.load[0]!;
    collect(d, i.id, i);
    expect(() => returnToDepot(d, i.id, { closed: 3, open: 0 })).toThrow();
    returnToDepot(d, i.id, i);
    expect(carried(i)).toEqual({ closed: 0, open: 0 });
    expect(() => collect(d, i.id, { closed: 0, open: 0 })).toThrow();
    const invalid = clone(d);
    invalid.load[0]!.returnedClosed = 3;
    expect(() => validate(invalid)).toThrow();
    returnToDepot(d, i.id, { closed: 0, open: 0 });
    expect(carried(i)).toEqual({ closed: 2, open: 1 });
    expect(remaining(i)).toEqual({ closed: 0, open: 0 });
    returnToDepot(d, i.id, i);
    finish(d, false);
    expect(d.pending).toHaveLength(0);
  });
  it("migra dados e backups antigos sem perder nomes nem quantidades", () => {
    const d = emptyData();
    add(d, "Água 500 mL", { closed: 2, open: 0 }, "original", false);
    const old = {
      ...d,
      version: 1,
      load: d.load.map((i) => ({
        id: i.id,
        productId: i.productId,
        closed: i.closed,
        open: i.open,
        gotClosed: i.gotClosed,
        gotOpen: i.gotOpen,
        note: i.note,
      })),
    };
    const migrated = validate(old);
    expect(migrated.version).toBe(2);
    expect(migrated.load[0]).toMatchObject({
      closed: 2,
      gotClosed: 0,
      returnedClosed: 0,
      returnedOpen: 0,
      note: "original",
    });
    expect(migrated.products).toEqual(d.products);
  });
});
