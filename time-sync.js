(function () {
  "use strict";
  let reference = null;
  let pending = null;
  function now() {
    return reference ? reference.time + performance.now() - reference.tick : Date.now();
  }
  async function sync(url, key) {
    if (pending) return pending;
    pending = (async () => {
      const started = performance.now();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      try {
        const response = await fetch(`${url.replace(/\/$/, "")}/rest/v1/rpc/drink_server_time`, {
          method: "POST",
          headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: "{}", cache: "no-store", signal: controller.signal,
        });
        if (!response.ok) throw new Error("サーバー時刻を取得できません");
        const time = Date.parse(await response.json());
        if (!Number.isFinite(time)) throw new Error("サーバー時刻が不正です");
        const ended = performance.now();
        reference = { time: time + (ended - started) / 2, tick: ended };
        return true;
      } catch (error) {
        console.warn("時刻同期に失敗しました", error);
        return false;
      } finally {
        clearTimeout(timeout);
      }
    })();
    try { return await pending; } finally { pending = null; }
  }
  function isSynchronized() {
    return Boolean(reference);
  }
  window.DrinkRelayClock = Object.freeze({ now, sync, isSynchronized });
})();
