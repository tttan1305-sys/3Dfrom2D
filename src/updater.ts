/**
 * Auto-update for the desktop app (Tauri). On start it asks GitHub Releases
 * whether a newer signed version exists; if so a button appears in the
 * toolbar that downloads, installs and restarts. Does nothing in a browser,
 * where the web version is always the latest.
 */

type Update = {
  version: string;
  downloadAndInstall(onEvent?: (e: { event: string; data?: { contentLength?: number; chunkLength?: number } }) => void): Promise<void>;
};

export interface UpdaterHandle {
  /** Re-attach the button after the toolbar is re-rendered. */
  mount(): void;
}

const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export function initUpdater(slot: () => HTMLElement | null): UpdaterHandle {
  let update: Update | null = null;
  let label = "";
  let busy = false;

  const mount = () => {
    const el = slot();
    if (!el || !update) return;
    el.innerHTML = `<button class="update" ${busy ? "disabled" : ""}>${label}</button>`;
    el.querySelector("button")!.addEventListener("click", install);
  };

  const setLabel = (text: string) => {
    label = text;
    mount();
  };

  async function install(): Promise<void> {
    if (!update || busy) return;
    busy = true;
    let total = 0;
    let done = 0;
    try {
      await update.downloadAndInstall((e) => {
        if (e.event === "Started") total = e.data?.contentLength ?? 0;
        if (e.event === "Progress") {
          done += e.data?.chunkLength ?? 0;
          setLabel(total ? `Đang tải ${Math.round((done / total) * 100)}%` : "Đang tải…");
        }
        if (e.event === "Finished") setLabel("Đang cài đặt…");
      });
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    } catch (err) {
      console.error("Update failed", err);
      busy = false;
      setLabel(`Cập nhật lỗi, thử lại (v${update.version})`);
    }
  }

  if (isTauri()) {
    (async () => {
      try {
        const { check } = await import("@tauri-apps/plugin-updater");
        update = (await check()) as Update | null;
        if (update) setLabel(`⬆ Cập nhật lên v${update.version}`);
      } catch (err) {
        // Offline or no release yet: keep working silently.
        console.warn("Update check failed", err);
      }
    })();
  }

  return { mount };
}
