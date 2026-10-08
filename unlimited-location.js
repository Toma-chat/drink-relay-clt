(function () {
  "use strict";

  const U = window.DrinkRelayUnlimited;
  const $ = (selector) => document.querySelector(selector);
  let gateway = null;

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    $("#locationRetry")?.addEventListener("click", applyLocation);
    configureReturnLinks();
    await applyLocation();
  }

  async function applyLocation() {
    showOnly("locationLoading");
    try {
      if (!U) throw new Error("画面を読み込めませんでした");
      const locationValue = requestedLocation();
      if (!locationValue || !U.unlimitedLocationIsComplete(locationValue)) {
        showError("無効な場所QRです", "受付スタッフへこのQRをご確認ください。", false);
        return;
      }

      if (localStorage.getItem(window.DrinkRelayWarmup.key + '-token')) {
        const warm = await new window.DrinkRelayWarmup.Gateway().init();
        const session = await warm.getSession();
        if (session) {
          const result = await warm.updateSessionLocation(session, locationValue);
          $('#locationSuccessLabel').textContent = U.formatUnlimitedLocation(result.session.currentLocation);
          $('#locationSuccessDetail').textContent = '現在の届け先と未提供注文を更新しました';
          showOnly('locationSuccess'); return;
        }
      }
      if (!gateway) gateway = await new U.Gateway().init();
      const binding = await U.digest(getDeviceId());
      const now = gateway.now();
      const activeCards = U.normalizeCardCatalog(await gateway.loadCards()).filter((card) => card.status === "active");
      const activeCardHashes = new Set(await Promise.all(
        activeCards.map((card) => U.digest(`${U.STORE_ID}:${card.token}`))
      ));
      const session = (await gateway.listSessions())
        .filter((item) => item?.status === "active"
          && item.deviceBinding === binding
          && activeCardHashes.has(item.cardHash)
          && Date.parse(item.expiresAt) > now)
        .sort((left, right) => Date.parse(right.updatedAt || right.activatedAt || 0) - Date.parse(left.updatedAt || left.activatedAt || 0))[0];

      if (!session) {
        showError(
          "利用中の飲み放題が見つかりません",
          "注文用QRをアクティベートした同じ端末・ブラウザで読み込んでください。"
        );
        return;
      }

      const result = await gateway.updateSessionLocation(session, locationValue, "location-qr");
      $("#locationSuccessLabel").textContent = U.formatUnlimitedLocation(result.session.currentLocation);
      $("#locationSuccessDetail").textContent = result.pendingOrder
        ? "現在の届け先と、未提供注文の届け先を変更しました。"
        : "次の注文からこの届け先へお届けします。";
      showOnly("locationSuccess");
    } catch (error) {
      console.error(error);
      showError("通信エラーが発生しました", error.message || "通信状態を確認してもう一度お試しください。");
    }
  }

  function requestedLocation() {
    const params = new URLSearchParams(window.location.search);
    const target = String(params.get("target") || "");
    const tableNo = String(params.get("table") || "").toUpperCase();
    const seatNo = String(params.get("seat") || "");
    if (!U.LOCATION_TARGETS.includes(target)) return null;
    if (target !== "bar" && (!U.LOCATION_TABLES.includes(tableNo) || !U.LOCATION_SEATS.includes(seatNo))) return null;
    return U.normalizeUnlimitedLocation({ target, tableNo, seatNo });
  }

  function getDeviceId() {
    const key = `drink-relay-${U.STORE_ID}-unlimited-device-v1`;
    const cookieKey = `${key}-cookie`;
    let id = "";
    try { id = localStorage.getItem(key) || ""; } catch {}
    if (!id) {
      const cookie = document.cookie.split("; ").find((entry) => entry.startsWith(`${encodeURIComponent(cookieKey)}=`));
      if (cookie) id = decodeURIComponent(cookie.slice(cookie.indexOf("=") + 1));
    }
    if (!id) id = U.makeId();
    try { localStorage.setItem(key, id); } catch {}
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${encodeURIComponent(cookieKey)}=${encodeURIComponent(id)}; Max-Age=31536000; Path=/; SameSite=Lax${secure}`;
    return id;
  }

  function configureReturnLinks() {
    const value = rememberedCustomerUrl();
    if (!value) {
      $("#returnToOrder").hidden = true;
      return;
    }
    $("#returnToOrder").href = value;
    $("#errorReturnToOrder").href = value;
    $("#errorReturnToOrder").hidden = false;
  }

  function rememberedCustomerUrl() {
    if (!U) return "";
    try {
      const value = localStorage.getItem(`drink-relay-${U.STORE_ID}-unlimited-customer-url-v1`) || "";
      const url = new URL(value, window.location.href);
      return url.origin === window.location.origin && url.pathname.endsWith("/unlimited-customer.html") ? url.href : "";
    } catch {
      return "";
    }
  }

  function showError(title, message, retryable = true) {
    $("#locationErrorTitle").textContent = title;
    $("#locationErrorMessage").textContent = message;
    $("#locationRetry").hidden = !retryable;
    showOnly("locationError");
  }

  function showOnly(id) {
    ["locationLoading", "locationSuccess", "locationError"].forEach((stateId) => {
      $(`#${stateId}`).hidden = stateId !== id;
    });
  }
})();
