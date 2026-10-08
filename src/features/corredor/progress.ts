import { carried, remaining, sum, type Item } from "./model";

export function loadProgress(items: Item[]) {
  const left = items.reduce((n, i) => n + sum(remaining(i)), 0);
  const collected = items.reduce((n, i) => n + sum(carried(i)), 0);
  const toOpen = items.reduce((n, i) => n + carried(i).open, 0);
  const total = left + collected;
  return {
    left,
    collected,
    toOpen,
    total,
    percent: total ? (collected / total) * 100 : 0,
    complete: total > 0 && left === 0,
  };
}
