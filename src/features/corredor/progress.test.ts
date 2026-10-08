import { describe, it, expect } from "vitest";
import { loadProgress } from "./progress";
import { add, collect, defer, emptyData, returnToDepot } from "./model";
describe("progresso da carga física atual", () => {
  it("conta pra abrir como parte dos coletados e exclui saldo movido e devoluções", () => {
    const d = emptyData();
    add(d, "Água 500 mL", { closed: 7, open: 3 }, "", false);
    const i = d.load[0]!;
    collect(d, i.id, { closed: 4, open: 2 });
    expect(loadProgress(d.load)).toEqual({
      left: 4,
      collected: 6,
      toOpen: 2,
      total: 10,
      percent: 60,
      complete: false,
    });
    defer(d, i.id);
    expect(loadProgress(d.load)).toEqual({
      left: 0,
      collected: 6,
      toOpen: 2,
      total: 6,
      percent: 100,
      complete: true,
    });
    expect(d.pending[0]).toMatchObject({ closed: 3, open: 1 });
    returnToDepot(d, i.id, { closed: 2, open: 1 });
    expect(loadProgress(d.load)).toEqual({
      left: 0,
      collected: 3,
      toOpen: 1,
      total: 3,
      percent: 100,
      complete: true,
    });
    returnToDepot(d, i.id, { closed: 4, open: 2 });
    expect(loadProgress(d.load).complete).toBe(false);
    expect(loadProgress(d.load).total).toBe(0);
    expect(loadProgress([]).complete).toBe(false);
  });
});
