(function () {
  'use strict';
  const U = window.DrinkRelayUnlimited;
  const config = window.DRINK_RELAY_STORE_CONFIG;
  const key = `drink-relay-${U.STORE_ID}-warmup`;
  let device = localStorage.getItem(`${key}-device`);
  if (!device) { device = crypto.randomUUID(); localStorage.setItem(`${key}-device`, device); }
  let latest = null;
  async function api(action, extra = {}, jwt = '') {
    const response = await fetch(`${config.supabaseUrl}/functions/v1/warmup`, {
      method: 'POST', headers: { apikey: config.supabaseAnonKey, 'Content-Type': 'application/json',
        ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}) },
      body: JSON.stringify({ store: U.STORE_ID, qr: new URLSearchParams(location.search).get('card'),
        device, token: localStorage.getItem(`${key}-token`) || '', action, ...extra }),
    });
    const data = await response.json();
    if (!response.ok || data.error) throw new Error(data.error || '通信エラー');
    return data;
  }
  class Gateway extends U.Gateway {
    async status() {
      latest = await api('status');
      this.serverOffsetMs = Date.parse(latest.serverNow) - Date.now();
      return latest;
    }
    async getSession() { const data = await this.status(); return data.reason === 'weekday' && !data.stopped ? data.session : null; }
    async activate(code) {
      const data = await api('activate', { code });
      if (data.token) localStorage.setItem(`${key}-token`, data.token);
      return this.status();
    }
    async getUnlimitedOrderState() {
      const data = await this.status();
      return { orders: data.orders, pendingOrder: data.orders.find(o => ['ordered','making','made'].includes(o.status)) || null };
    }
    async createUnlimitedOrder(row) { return (await api('order', { item: row.itemId, options: row.options, quantity: row.quantity })).order; }
    async updateSessionLocation(session, value) { const data = await api('location', { location: value }); return { session: data.session, pendingOrder: data.orders.find(o => ['ordered','making','made'].includes(o.status)) }; }
  }
  window.DrinkRelayWarmup = { api, Gateway, device, key, get latest() { return latest; } };
})();
