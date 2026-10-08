import { useEffect, useState } from "react";
export function useOffline() {
  const [status, setStatus] = useState("O primeiro preparo precisa terminar com internet.");
  const [ready, setReady] = useState(false);
  const [online, setOnline] = useState(true);
  const [update, setUpdate] = useState(false);
  useEffect(() => {
    let alive = true;
    const connection = () => setOnline(navigator.onLine);
    connection();
    window.addEventListener("online", connection);
    window.addEventListener("offline", connection);
    const verify = () => {
      const worker = navigator.serviceWorker?.controller;
      if (!worker) return;
      const channel = new MessageChannel();
      channel.port1.onmessage = (e) => {
        channel.port1.close();
        if (alive) {
          setReady(e.data.ready === true);
          setStatus(
            e.data.ready
              ? "Pronto para usar offline"
              : "Preparo incompleto. Conecte à internet e reabra o app.",
          );
        }
      };
      worker.postMessage({ type: "CHECK_OFFLINE" }, [channel.port2]);
    };
    if (!("serviceWorker" in navigator) || !window.isSecureContext || !("caches" in window)) {
      setStatus(
        "Offline indisponível neste navegador. É necessário HTTPS e suporte a service worker.",
      );
    } else if (import.meta.env.PROD) {
      navigator.serviceWorker.addEventListener("controllerchange", verify);
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .then((reg) => {
          if (!alive) return;
          if (reg.waiting) setUpdate(true);
          reg.addEventListener("updatefound", () => {
            const w = reg.installing;
            w?.addEventListener("statechange", () => {
              if (!alive) return;
              if (w.state === "installed" && navigator.serviceWorker.controller) setUpdate(true);
              if (w.state === "redundant")
                setStatus(
                  "Preparo offline falhou. Com internet, feche e reabra para tentar novamente.",
                );
            });
          });
          verify();
          navigator.serviceWorker.ready.then(() => {
            if (alive) verify();
          });
        })
        .catch(() => {
          if (alive)
            setStatus(
              "Não foi possível preparar o offline. Com internet, feche e reabra para tentar novamente.",
            );
        });
      verify();
    } else setStatus("O preparo offline está disponível na versão de produção.");
    const visibility = () => {
      if (document.visibilityState === "visible" && "serviceWorker" in navigator) verify();
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      alive = false;
      window.removeEventListener("online", connection);
      window.removeEventListener("offline", connection);
      document.removeEventListener("visibilitychange", visibility);
      navigator.serviceWorker?.removeEventListener("controllerchange", verify);
    };
  }, []);
  return { status, ready, online, update };
}
export async function requestPersistence() {
  if (navigator.storage && navigator.storage.persist) {
    try {
      return (await navigator.storage.persist())
        ? "Proteção de armazenamento concedida. Mantenha também um backup."
        : "O navegador não concedeu proteção extra. O app continua funcionando; mantenha um backup.";
    } catch {
      /* unsupported or blocked */
    }
  }
  return "Proteção extra indisponível neste navegador. Mantenha um backup dos seus dados.";
}
