const API = {
  base: '', // same origin

  getInitData() {
    try {
      return window.Telegram?.WebApp?.initData || '';
    } catch {
      return '';
    }
  },

  async request(path, options = {}, _retries = 2) {
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };
    const initData = this.getInitData();
    if (initData) {
      headers['X-Telegram-Init-Data'] = initData;
    }
    try {
      const res = await fetch(this.base + path, {
        ...options,
        headers,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data.detail || data.message || data.error || `HTTP ${res.status}`;
        throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
      }
      return data;
    } catch (e) {
      if (_retries > 0 && (e.name === 'TypeError' || /network|fetch|Failed/i.test(String(e.message)))) {
        await new Promise((r) => setTimeout(r, 800));
        return this.request(path, options, _retries - 1);
      }
      throw e;
    }
  },

  getUser() { return this.request('/api/user'); },
  setLang(lang) { return this.request('/api/user/lang', { method: 'POST', body: JSON.stringify({ lang }) }); },
  getServices(q) {
    const qs = q ? `?q=${encodeURIComponent(q)}` : '';
    return this.request('/api/services' + qs);
  },
  getService(id) { return this.request(`/api/service/${id}`); },
  createOrder(payload) {
    return this.request('/api/order', { method: 'POST', body: JSON.stringify(payload) });
  },
  getOrders(status) {
    const params = new URLSearchParams();
    params.set('limit', '500');
    if (status && status !== 'all') params.set('status', status);
    return this.request('/api/orders?' + params.toString());
  },
  getOrder(id) { return this.request(`/api/order/${id}`); },
  getWallet() { return this.request('/api/wallet'); },
  createDeposit(amount) {
    return this.request('/api/deposit', { method: 'POST', body: JSON.stringify({ amount }) });
  },
  depositStatus(id) { return this.request(`/api/deposit/${id}/status`); },
  getProducts() { return this.request('/api/products'); },
  getProduct(id) { return this.request(`/api/product/${id}`); },
  buyDigital(package_id, quantity = 1, payment_method = 'balance') {
    return this.request('/api/products/buy', {
      method: 'POST',
      body: JSON.stringify({ package_id, quantity, payment_method }),
    });
  },
  getDigitalOrders() { return this.request('/api/digital-orders'); },
  getTickets() { return this.request('/api/tickets'); },
  createTicket(category, message) {
    return this.request('/api/tickets', {
      method: 'POST',
      body: JSON.stringify({ category, message }),
    });
  },
  getTicket(id) { return this.request(`/api/tickets/${id}`); },
  getDigitalOrder(id) { return this.request('/api/digital-orders/' + encodeURIComponent(id)); },
  search(q) { return this.request('/api/search?q=' + encodeURIComponent(q || '')); },
  getNotifications() { return this.request('/api/notifications'); },
  applyPromo(code) {
    return this.request('/api/promo', { method: 'POST', body: JSON.stringify({ code }) });
  },
  createMassOrder(payload) {
    return this.request('/api/orders/mass', { method: 'POST', body: JSON.stringify(payload) });
  },

  // ---------- Admin (ADMIN_ID only) ----------
  adminMe() { return this.request('/api/admin/me'); },
  adminPlatforms() { return this.request('/api/admin/platforms'); },
  adminCreatePlatform(name, emoji = '') {
    return this.request('/api/admin/platforms', {
      method: 'POST',
      body: JSON.stringify({ name, emoji }),
    });
  },
  adminDeletePlatform(id) {
    return this.request('/api/admin/platforms/' + id, { method: 'DELETE' });
  },
  adminPlatformServices(platformId) {
    return this.request('/api/admin/platforms/' + platformId + '/services');
  },
  adminService(id) { return this.request('/api/admin/services/' + id); },
  adminCreateService(payload) {
    return this.request('/api/admin/services', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  adminUpdateService(id, payload) {
    return this.request('/api/admin/services/' + id, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },
  adminDeleteAllServices: (channel = "webapp", panel = null) => {
    const q = new URLSearchParams({ channel });
    if (panel != null) q.set("panel", String(panel));
    return request("/api/admin/services/all?" + q.toString(), { method: "DELETE" });
  },
  adminDeleteService(id, permanent = false) {
    return this.request('/api/admin/services/' + id + (permanent ? '?permanent=1' : ''), { method: 'DELETE' });
  },
  adminProviders() { return this.request('/api/admin/providers'); },
  adminFetchServices(panel) {
    return this.request('/api/admin/full-services/fetch?panel=' + encodeURIComponent(panel));
  },
  adminImportServices(payload) {
    return this.request('/api/admin/full-services/import', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
  adminFullServices(status = 'active', panel = '', q = '') {
    let url = '/api/admin/full-services?status=' + encodeURIComponent(status);
    if (panel) url += '&panel=' + encodeURIComponent(panel);
    if (q) url += '&q=' + encodeURIComponent(q);
    return this.request(url);
  },
  adminDisableService(id) {
    return this.request('/api/admin/services/' + id + '/disable', { method: 'POST' });
  },
  adminEnableService(id) {
    return this.request('/api/admin/services/' + id + '/enable', { method: 'POST' });
  },
  adminRestoreService(id) {
    return this.request('/api/admin/services/' + id + '/restore', { method: 'POST' });
  },
};

