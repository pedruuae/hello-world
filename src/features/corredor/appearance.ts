import { useEffect, useRef, useState } from "react";
export type Appearance = "light" | "dark" | "system";
const KEY = "meu-corredor-appearance";
const backgrounds = { light: "#f7f8fc", dark: "#0f172a" };
const valid = (value: unknown): value is Appearance =>
  value === "light" || value === "dark" || value === "system";
// Runs synchronously in <head>, before the app and logo can paint. No network,
// IndexedDB writes, or framework hydration is required for the first theme.
export const APPEARANCE_BOOTSTRAP = `(function(){var p='system',dark=false;try{var v=localStorage.getItem('${KEY}');if(v==='light'||v==='dark'||v==='system')p=v;}catch(e){}try{dark=!!window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches;}catch(e){}var t=p==='system'?(dark?'dark':'light'):p;var r=document.documentElement;r.setAttribute('data-theme',t);r.style.colorScheme=t;r.style.backgroundColor=t==='dark'?'${backgrounds.dark}':'${backgrounds.light}';var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content',t==='dark'?'${backgrounds.dark}':'${backgrounds.light}');})();`;
function readPreference(): Appearance {
  try {
    const value = localStorage.getItem(KEY);
    return valid(value) ? value : "system";
  } catch {
    return "system";
  }
}
function apply(preference: Appearance) {
  let systemDark = false;
  try {
    systemDark = !!window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  } catch {
    /* old browser: light */
  }
  const theme = preference === "system" ? (systemDark ? "dark" : "light") : preference;
  document.documentElement.setAttribute("data-theme", theme);
  document.documentElement.style.colorScheme = theme;
  document.documentElement.style.backgroundColor = backgrounds[theme];
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", backgrounds[theme]);
}
export function useAppearance() {
  const [preference, setPreference] = useState<Appearance>("system");
  const [warning, setWarning] = useState("");
  const current = useRef<Appearance>("system");
  useEffect(() => {
    current.current = readPreference();
    setPreference(current.current);
    apply(current.current);
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    const changed = () => {
      if (current.current === "system") apply("system");
    };
    if (media?.addEventListener) media.addEventListener("change", changed);
    else if (media?.addListener) media.addListener(changed);
    const storage = (e: StorageEvent) => {
      if (e.key !== KEY && e.key !== null) return;
      current.current = readPreference();
      setPreference(current.current);
      apply(current.current);
    };
    window.addEventListener("storage", storage);
    return () => {
      if (media?.removeEventListener) media.removeEventListener("change", changed);
      else if (media?.removeListener) media.removeListener(changed);
      window.removeEventListener("storage", storage);
    };
  }, []);
  const choose = (value: Appearance) => {
    current.current = value;
    setPreference(value);
    apply(value);
    setWarning("");
    try {
      localStorage.setItem(KEY, value);
    } catch {
      setWarning(
        "A aparência foi aplicada, mas o navegador não permitiu salvar a preferência para a próxima abertura.",
      );
    }
  };
  return { preference, choose, warning };
}
