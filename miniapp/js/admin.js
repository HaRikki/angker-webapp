/* Mini App Admin Panel — full feature set (mirrors the bot's Admin Panel).
   Needs window.__showPage / window.__toast exposed by app.js. Server enforces ADMIN_ID on every call. */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const A = (p, o) => API.request('/api/admin/x' + p, o);
  const J = (m, b) => ({ method: m, body: JSON.stringify(b || {}) });
  const toast = (m) => (window.__toast ? window.__toast(m) : alert(m));
  const money = (v) => '$' + (Number(v) || 0).toFixed(2);
  const body = () => $('#admin-x-body');
  const stack = [];

  const GROUPS = [
    ['📊 Overview', [['overview', '📊 Statistics & Revenue'], ['top', '👥 Top Users'], ['deposits', '🧾 All Deposits']]],
    ['👤 Users & Money', [['users', '💰 Manage User / Balance'], ['banned', '🚫 Banned Users'], ['staff', '👤 Staff / Sub-Admin']]],
    ['📦 Orders & Support', [['orders', '📦 Manage Orders'], ['tickets', '🎫 Open Tickets']]],
    ['🎁 Marketing', [['coupons', '🎁 Coupons / Promo'], ['bonuses', '➕ Deposit Bonus'], ['broadcast', '📢 Broadcast']]],
    ['🚀 SMM Management', [['smmdash', '📈 SMM Dashboard'], ['smmprov', '🔌 Providers & API'], ['smmsync', '🔄 Sync / Import Services'], ['smmsvc', '🛠 Service Management'], ['smmord', '🧾 SMM Orders']]],
    ['🌐 SMM & Services', [['smm', '🌐 SMM Panels'], ['__wa', '📦 Service WebApp'], ['__full', '➕ Add Full Service'], ['digital', '🛍️ Digital Store']]],
    ['⚙️ System', [['settings', '⚙️ Settings, Payment & Maintenance']]],
  ];

  function go(view, arg) { stack.push([view, arg]); render(); }
  function back() { stack.pop(); if (!stack.length) window.__showPage('admin'); else render(); }
  function reload() { render(); }

  // ---------- small UI helpers ----------
  const card = (title, meta, extra) => `<div class="card ax-card"><div class="card-title">${title}</div>${meta ? `<div class="card-meta">${meta}</div>` : ''}${extra || ''}</div>`;
  const btn = (id, label, cls = 'btn-outline') => `<button type="button" class="btn ${cls} btn-sm" data-act="${id}">${label}</button>`;
  const input = (id, ph, type = 'text', val = '') => `<input class="ax-in" id="ax-${id}" type="${type}" placeholder="${esc(ph)}" value="${esc(val)}">`;
  const empty = (t) => `<div class="empty"><span>${esc(t || 'គ្មានទិន្នន័យ')}</span></div>`;
  const val = (id) => ($('#ax-' + id)?.value || '').trim();
  function on(root, handlers) {
    root.querySelectorAll('[data-act]').forEach((b) => {
      b.onclick = async (e) => {
        e.stopPropagation();
        const h = handlers[b.dataset.act];
        if (!h) return;
        try { await h(b.dataset); } catch (err) { toast(err.message || 'Error'); }
      };
    });
  }
  const pick = (o, keys) => { for (const k of keys) if (o[k] !== undefined && o[k] !== null && o[k] !== '') return o[k]; return ''; };
  const userLine = (u) => esc(pick(u, ['first_name', 'username', 'name']) || ('#' + u.user_id)) + (u.username ? ` · @${esc(u.username)}` : '');
  const when = (t) => (t ? new Date(Number(t) * 1000).toLocaleString() : '');

  // ---------- views ----------
  const V = {
    async overview() {
      const d = await A('/overview'); const s = d.stats || {}; const r = d.revenue || {};
      const t = (k, v) => `<div class="ax-tile"><b>${esc(v ?? 0)}</b><span>${k}</span></div>`;
      const rv = (k, x) => (x ? t(k, Array.isArray(x) ? money(x[1] ?? x[0]) : money(x.revenue ?? x.orders_total ?? x.total ?? 0)) : '');
      body().innerHTML = `<div class="ax-grid">${t('Users', s.total_users)}${t('New today', s.new_today)}${t('Customers', s.customers)}${t('Orders', s.total_orders)}${t('Orders today', s.orders_today)}${t('Pending', s.pending)}${t('Processing', s.processing)}${t('Completed', s.completed)}${t('Failed', s.failed)}${t('Revenue (all)', money(s.revenue_all))}${rv('Revenue 24h', r.day)}${rv('Revenue 7d', r.week)}${rv('Revenue 30d', r.month)}</div>`;
    },
    async top() {
      const d = await A('/top-users?by=spent');
      body().innerHTML = (d.users || []).map((u) => card(userLine(u), `Spent ${money(u.total_spent)} · Orders ${u.total_orders ?? 0} · Balance ${money(u.balance)}`, btn('u', 'Open') .replace('data-act="u"', `data-act="u" data-id="${u.user_id}"`))).join('') || empty();
      on(body(), { u: (x) => go('users', x.id) });
    },
    async deposits() {
      const d = await A('/deposits');
      body().innerHTML = (d.deposits || []).map((x) => card(`${money(x.amount)} · ${esc(x.status)}`, `User ${esc(x.user_id)} · ${esc(x.method || x.provider || '')} ${when(x.created_at)}`)).join('') || empty();
    },
    async banned() {
      const d = await A('/banned');
      body().innerHTML = (d.users || []).map((u) => card(userLine(u), `ID ${u.user_id}`, `<button type="button" class="btn btn-outline btn-sm" data-act="unban" data-id="${u.user_id}">🟢 Unban</button>`)).join('') || empty('គ្មាន User ត្រូវ Ban');
      on(body(), { unban: async (x) => { await A(`/user/${x.id}/ban`, J('POST', { banned: false })); toast('Unbanned'); reload(); } });
    },
    async users(id) {
      body().innerHTML = `<div class="card ax-card"><div class="card-title">ស្វែងរក User (Telegram ID)</div>${input('uid', 'User ID', 'number', id || '')}<button type="button" class="btn btn-primary btn-block" data-act="find" style="margin-top:8px">🔍 Search</button></div><div id="ax-user-res"></div>`;
      const show = async (uid) => {
        const u = await A('/user/' + uid);
        $('#ax-user-res').innerHTML = card(userLine(u), `ID ${u.user_id} · Balance <b>${money(u.balance)}</b> · Orders ${u.total_orders ?? 0} · Spent ${money(u.total_spent)}${u.banned ? ' · 🚫 BANNED' : ''}`,
          `${input('amt', 'Amount ($)', 'number')}<div class="ax-row">${btn('add', '➕ Add', 'btn-primary')}${btn('deduct', '➖ Deduct')}${btn('set', '✏️ Set')}</div><div class="ax-row">${btn('ban', u.banned ? '🟢 Unban' : '🔴 Ban', 'btn-outline')}</div>`);
        const bal = (mode) => async () => { const a = parseFloat(val('amt')); if (!(a >= 0)) return toast('ដាក់ចំនួនទឹកប្រាក់'); if (mode !== 'add' && !confirm(`${mode} ${money(a)} ?`)) return; await A(`/user/${uid}/balance`, J('POST', { mode, amount: a })); toast('Done'); show(uid); };
        on($('#ax-user-res'), { add: bal('add'), deduct: bal('deduct'), set: bal('set'), ban: async () => { await A(`/user/${uid}/ban`, J('POST', { banned: !u.banned })); toast('Done'); show(uid); } });
      };
      on(body(), { find: async () => { const v = val('uid'); if (v) await show(v); } });
      if (id) await show(id);
    },
    async orders(arg) {
      const st = (arg && arg.status) || ''; const off = (arg && arg.offset) || 0;
      const d = await A(`/orders?offset=${off}${st ? '&status=' + encodeURIComponent(st) : ''}`);
      const chips = ['', 'Pending', 'Processing', 'Completed', 'Failed', 'Canceled'].map((s) => `<button type="button" class="ax-chip ${s === st ? 'on' : ''}" data-act="f" data-s="${s}">${s || 'All'}</button>`).join('');
      const rows = (d.orders || []).map((o) => card(`#${esc(o.order_id ?? o.id)} · ${esc(o.status)}`, `${esc(pick(o, ['service_name', 'service', 'name']))} · ${money(o.price)} · User ${esc(o.user_id)}`, btn('o', 'Detail').replace('data-act="o"', `data-act="o" data-id="${esc(o.order_id ?? o.id)}"`))).join('') || empty();
      const more = (d.orders || []).length >= 20 ? `<button type="button" class="btn btn-outline btn-block" data-act="more">⬇️ Load more</button>` : '';
      body().innerHTML = `<div class="ax-chips">${chips}</div>${rows}${more}<div class="ax-card card"><div class="card-title">🔍 Check Order by ID</div>${input('oid', 'Order ID')}<button type="button" class="btn btn-primary btn-block" data-act="chk" style="margin-top:8px">Check</button></div>`;
      on(body(), { f: (x) => { stack[stack.length - 1][1] = { status: x.s, offset: 0 }; reload(); }, o: (x) => go('order', x.id), more: () => { stack[stack.length - 1][1] = { status: st, offset: off + 20 }; reload(); }, chk: () => { const v = val('oid'); if (v) go('order', v); } });
    },
    async order(id) {
      const o = await A('/order/' + encodeURIComponent(id));
      const kv = Object.entries(o).filter(([, v]) => v !== null && v !== '').map(([k, v]) => `<div class="ax-kv"><span>${esc(k)}</span><b>${esc(/_at$/.test(k) ? when(v) : v)}</b></div>`).join('');
      body().innerHTML = card('Order #' + esc(id), '', kv + `<button type="button" class="btn btn-outline btn-block" data-act="refund" style="margin-top:10px">↩️ Refund & Cancel</button>`);
      on(body(), { refund: async () => { if (!confirm('Refund និង Cancel Order នេះ?')) return; await A(`/order/${encodeURIComponent(id)}/refund`, J('POST')); toast('Refunded'); back(); } });
    },
    async tickets() {
      const d = await A('/tickets');
      body().innerHTML = (d.tickets || []).map((t) => card(`🎫 #${t.id} · User ${esc(t.user_id)}`, esc(pick(t, ['message', 'text', 'subject'])), `${input('r' + t.id, 'Reply…')}<button type="button" class="btn btn-primary btn-sm" data-act="rep" data-id="${t.id}" style="margin-top:8px">Send reply</button>`)).join('') || empty('គ្មាន Ticket បើក');
      on(body(), { rep: async (x) => { const v = val('r' + x.id); if (!v) return; await A(`/ticket/${x.id}/reply`, J('POST', { text: v })); toast('Sent'); reload(); } });
    },
    async coupons() {
      const d = await A('/coupons');
      body().innerHTML = `<div class="card ax-card"><div class="card-title">➕ New Coupon</div>${input('code', 'CODE')}<select class="ax-in" id="ax-type"><option value="percent">Percent %</option><option value="fixed">Fixed $</option></select>${input('dv', 'Discount value', 'number')}${input('mu', 'Max uses (0 = unlimited)', 'number')}<button type="button" class="btn btn-primary btn-block" data-act="add" style="margin-top:8px">Create</button></div>` +
        (d.coupons || []).map((c) => card(`${esc(c.code)} · ${c.discount_type === 'percent' ? c.discount_value + '%' : money(c.discount_value)}`, `Used ${c.used_count ?? 0}/${c.max_uses || '∞'} · ${c.is_active ? '🟢 ON' : '🔴 OFF'}`, `<div class="ax-row">${btn('tg', c.is_active ? 'Disable' : 'Enable').replace('data-act="tg"', `data-act="tg" data-id="${c.id}" data-a="${c.is_active ? 0 : 1}"`)}${btn('del', '🗑️').replace('data-act="del"', `data-act="del" data-id="${c.id}"`)}</div>`)).join('');
      on(body(), {
        add: async () => { const dv = parseFloat(val('dv')); if (!val('code') || !(dv > 0)) return toast('បំពេញ Code + Value'); await A('/coupons', J('POST', { code: val('code'), discount_type: $('#ax-type').value, discount_value: dv, max_uses: parseInt(val('mu') || '0', 10) })); toast('Created'); reload(); },
        tg: async (x) => { await A(`/coupons/${x.id}/toggle?active=${x.a}`, J('POST')); reload(); },
        del: async (x) => { if (confirm('Delete?')) { await A('/coupons/' + x.id, J('DELETE')); reload(); } },
      });
    },
    async bonuses() {
      const d = await A('/bonuses');
      body().innerHTML = `<div class="card ax-card"><div class="card-title">➕ Bonus Tier</div>${input('mn', 'From $', 'number')}${input('mx', 'To $', 'number')}${input('bn', 'Bonus $', 'number')}<button type="button" class="btn btn-primary btn-block" data-act="add" style="margin-top:8px">Add</button></div>` +
        (d.bonuses || []).map((b) => card(`$${b.min_amount} – $${b.max_amount}`, `Bonus +${money(b.bonus_amount)}`, btn('del', '🗑️ Delete').replace('data-act="del"', `data-act="del" data-id="${b.id}"`))).join('');
      on(body(), {
        add: async () => { const a = [val('mn'), val('mx'), val('bn')].map(parseFloat); if (a.some((n) => !(n >= 0))) return toast('បំពេញទាំងអស់'); await A('/bonuses', J('POST', { min_amount: a[0], max_amount: a[1], bonus_amount: a[2] })); reload(); },
        del: async (x) => { if (confirm('Delete?')) { await A('/bonuses/' + x.id, J('DELETE')); reload(); } },
      });
    },
    async broadcast() {
      body().innerHTML = `<div class="card ax-card"><div class="card-title">📢 Broadcast ទៅ User ទាំងអស់</div><textarea class="ax-in" id="ax-bc" rows="6" placeholder="សារ…"></textarea><button type="button" class="btn btn-primary btn-block" data-act="send" style="margin-top:8px">Send</button></div>`;
      on(body(), { send: async () => { const t = val('bc'); if (!t || !confirm('ផ្ញើទៅ User ទាំងអស់?')) return; const r = await A('/broadcast', J('POST', { text: t })); toast(`Queued ${r.queued} users`); $('#ax-bc').value = ''; } });
    },
    async smm() {
      const d = await A('/smm');
      body().innerHTML = (d.panels || []).map((p) => card(`${p.id === d.active ? '✅ ' : ''}Panel ${p.id} · ${esc(p.name || '')}`, `${esc(p.url || 'not configured')} · ${p.enabled ? '🟢 ON' : '🔴 OFF'}`, `<div class="ax-row">${btn('act', 'Set Active').replace('data-act="act"', `data-act="act" data-id="${p.id}"`)}${btn('en', p.enabled ? 'Disable' : 'Enable').replace('data-act="en"', `data-act="en" data-id="${p.id}" data-e="${p.enabled ? 0 : 1}"`)}${btn('del', '🗑️').replace('data-act="del"', `data-act="del" data-id="${p.id}"`)}</div>`)).join('') + `<div class="card-meta" style="padding:8px">API Key/URL កែតាម Bot (សុវត្ថិភាព)</div>`;
      on(body(), { act: async (x) => { await A(`/smm/${x.id}/active`, J('POST')); reload(); }, en: async (x) => { await A(`/smm/${x.id}/enabled?enabled=${x.e}`, J('POST')); reload(); }, del: async (x) => { if (confirm('Clear panel?')) { await A('/smm/' + x.id, J('DELETE')); reload(); } } });
    },
    async digital() {
      const d = await A('/digital');
      body().innerHTML = `<div class="card ax-card"><div class="card-title">➕ New Product</div>${input('pn', 'Name')}${input('pe', 'Emoji', 'text', '📦')}<button type="button" class="btn btn-primary btn-block" data-act="add" style="margin-top:8px">Create</button></div>` +
        (d.products || []).map((p) => card(`${esc(p.emoji || '📦')} ${esc(p.name)}`, '', (p.packages || []).map((k) => `<div class="ax-kv"><span>${esc(k.name)} · ${money(k.price)}</span><b>Stock ${k.stock}</b></div><textarea class="ax-in" id="ax-s${k.id}" rows="2" placeholder="Stock (មួយបន្ទាត់ = 1 item)"></textarea>${btn('stk', '＋ Add stock').replace('data-act="stk"', `data-act="stk" data-id="${k.id}"`)}`).join('') + `<div style="margin-top:8px">${btn('del', '🗑️ Delete product').replace('data-act="del"', `data-act="del" data-id="${p.id}"`)}</div>`)).join('');
      on(body(), {
        add: async () => { if (!val('pn')) return; await A('/digital/products', J('POST', { name: val('pn'), emoji: val('pe') || '📦' })); reload(); },
        stk: async (x) => { const items = ($('#ax-s' + x.id).value || '').split('\n'); const r = await A('/digital/stock', J('POST', { package_id: +x.id, items })); toast(`Added ${r.added}`); reload(); },
        del: async (x) => { if (confirm('Delete product + stock?')) { await A('/digital/products/' + x.id, J('DELETE')); reload(); } },
      });
    },
    async staff() {
      const d = await A('/staff');
      body().innerHTML = `<div class="card ax-card"><div class="card-title">➕ Add Staff</div>${input('su', 'Telegram ID', 'number')}${input('sn', 'Note')}<button type="button" class="btn btn-primary btn-block" data-act="add" style="margin-top:8px">Add</button></div>` +
        (d.staff || []).map((s) => card(`ID ${s.user_id} · ${esc(s.role)}`, esc(s.note || ''), btn('del', '🗑️ Remove').replace('data-act="del"', `data-act="del" data-id="${s.user_id}"`))).join('');
      on(body(), { add: async () => { if (!val('su')) return; await A('/staff', J('POST', { user_id: +val('su'), note: val('sn') })); reload(); }, del: async (x) => { await A('/staff/' + x.id, J('DELETE')); reload(); } });
    },
    async settings() {
      const d = await A('/settings'); const v = d.values;
      const toggles = d.bool.map((k) => `<div class="ax-kv"><span>${esc(k)}</span>${btn('t', v[k] === '1' ? '🟢 ON' : '🔴 OFF').replace('data-act="t"', `data-act="t" data-k="${k}" data-v="${v[k] === '1' ? 0 : 1}"`)}</div>`).join('');
      const texts = d.text.map((k) => `<label class="card-meta">${esc(k)}</label>${input('k_' + k, k, 'text', v[k])}${btn('s', 'Save').replace('data-act="s"', `data-act="s" data-k="${k}"`)}`).join('');
      const secrets = d.secret.map((k) => `<label class="card-meta">${esc(k)} ${v[k] ? '(✔ set)' : '(not set)'}</label>${input('k_' + k, 'new value', 'password')}${btn('s', 'Save').replace('data-act="s"', `data-act="s" data-k="${k}"`)}`).join('');
      body().innerHTML = card('Switches', '', toggles) + card('Values', '', texts) + card('🔑 Keys (write-only)', 'មិនបង្ហាញតម្លៃចាស់ដើម្បីសុវត្ថិភាព', secrets);
      on(body(), { t: async (x) => { await A('/settings', J('POST', { key: x.k, value: x.v })); reload(); }, s: async (x) => { await A('/settings', J('POST', { key: x.k, value: val('k_' + x.k) })); toast('Saved'); } });
    },
  };
  const TITLES = { smmdash: 'SMM Dashboard', smmprov: 'Providers', smmsync: 'Sync Services', smmsvc: 'Services', smmord: 'SMM Orders', overview: 'Statistics', top: 'Top Users', deposits: 'Deposits', users: 'Users & Balance', banned: 'Banned', staff: 'Staff', orders: 'Orders', order: 'Order', tickets: 'Tickets', coupons: 'Coupons', bonuses: 'Deposit Bonus', broadcast: 'Broadcast', smm: 'SMM Panels', digital: 'Digital Store', settings: 'Settings' };

  window.AdminX = { V, TITLES, go, back, A, J, esc, card, btn, input, val, on, toast, money, empty, pick };

  async function render() {
    const [view, arg] = stack[stack.length - 1] || [];
    if (!V[view]) return;
    $('#admin-x-title').textContent = TITLES[view] || 'Admin';
    body().innerHTML = '<div class="skeleton"></div>';
    try { await V[view](arg); } catch (e) { body().innerHTML = empty(e.message); }
  }

  function buildMenu() {
    const pad = $('#page-admin .content-pad');
    if (!pad || pad.dataset.ax) return;
    pad.dataset.ax = '1';
    const old = [...pad.children]; old.forEach((c) => (c.style.display = 'none')); // legacy cards stay clickable via menu
    const wrap = document.createElement('div');
    wrap.innerHTML = GROUPS.map(([t, items]) => `<div class="ax-group"><div class="ax-gt">${t}</div><div class="ax-gl">${items.map(([k, l]) => `<button type="button" class="btn btn-outline ax-item" data-v="${k}">${l}</button>`).join('')}</div></div>`).join('');
    pad.prepend(wrap);
    wrap.querySelectorAll('.ax-item').forEach((b) => (b.onclick = () => {
      const k = b.dataset.v;
      if (k === '__wa') return $('#btn-admin-wa')?.click();
      if (k === '__full') return $('#btn-admin-full')?.click();
      stack.length = 0; window.__showPage('admin-x'); go(k);
    }));
  }

  document.addEventListener('DOMContentLoaded', () => {
    buildMenu();
    $('#admin-x-back')?.addEventListener('click', back);
    // Admin page may be re-rendered later; re-run safely when opened
    $('#btn-admin-panel')?.addEventListener('click', () => setTimeout(buildMenu, 0));
  });
})();
