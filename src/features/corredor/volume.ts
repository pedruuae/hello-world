import { normalize, type Product } from "./model";
export type VolumeUnit = "mL" | "L";
export function splitVolume(name: string): { name: string; volume: string; unit: VolumeUnit } {
  const match = name.trim().match(/^(.+?)\s+(\d+(?:[.,]\d+)?)\s*(ml|l|lt|lts|litro|litros)$/i);
  if (!match) return { name, volume: "", unit: "mL" };
  return {
    name: match[1]!,
    volume: match[2]!.replace(".", ","),
    unit: match[3]!.toLowerCase() === "ml" ? "mL" : "L",
  };
}
export function nameWithVolume(name: string, volume: string, unit: VolumeUnit) {
  name = name.trim();
  volume = volume.trim();
  if (!volume) return name;
  if (!/^\d+(?:[.,]\d{1,3})?$/.test(volume))
    throw new Error("Informe um volume válido, como 350 mL ou 1,5 L.");
  const value = Number(volume.replace(",", "."));
  if (value <= 0 || value > 99999)
    throw new Error("O volume deve ser maior que zero e no máximo 99.999.");
  const base = splitVolume(name).name.trim();
  if (!base) throw new Error("Informe o nome da bebida.");
  return `${base} ${String(value).replace(".", ",")} ${unit}`;
}
// Keep existing names/IDs and backups intact. Equivalent sizes reuse a known
// product (e.g. 1500 mL and 1,5 L), while different sizes stay separate.
export function knownVolumeName(name: string, products: Product[]) {
  const parsed = splitVolume(name);
  const match = products.find((p) => {
    if (normalize(p.name) === normalize(name)) return true;
    const other = splitVolume(p.name);
    if (!parsed.volume || !other.volume || normalize(parsed.name) !== normalize(other.name))
      return false;
    const ml = (v: ReturnType<typeof splitVolume>) =>
      Math.round(Number(v.volume.replace(",", ".")) * (v.unit === "L" ? 1000000 : 1000));
    return ml(parsed) === ml(other);
  });
  return match?.name || name;
}
