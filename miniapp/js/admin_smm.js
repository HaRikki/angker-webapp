/* SMM Management views (providers, sync, services, orders, dashboard). Real backend calls only. */
(function () {
  const X = window.AdminX; if (!X) return;
  const { V, go, A, J, esc, card, btn, input, val, on, toast, money, empty, pick } = X;
  const $ = (s) => document.querySelector(s);
  const body = () => $('#admin-x-body');
  const SA = (p, o) => API.request('/api/admin/smm' + p, o);
  const tile = (k, v) => `<div class="ax-tile"><b>${esc(v ?? 0)}</b><span>${k}</span></div>`;
  const b2 = (act, label, attrs = '', cls = 'btn-outline') => `<button type="button" class="btn ${cls} btn-sm" data-act="${act}" ${attrs}>${label}</button>`;
  const badge = (p) => ({ connected: '🟢 Connected', error: '🔴 Error', configured: '🟡 Configured', not_configured: '⚪ Not set' }[p.status] || p.status);

  // ---------- Dashboard ----------
  V.smmdash = async () => {
    const d = await SA('/dashboard'); const s = d.stats;
    body().innerHTML = `<div class="ax-grid">${tile('Total Services', s.services_total)}${tile('Active', s.services_active)}${tile('Disabled', s.services_disabled)}${tile('Total Orders', s.orders_total)}${tile('Pending/Processing', s.orders_pending)}${tile('Completed', s.orders_completed)}${tile('Revenue', money(s.revenue))}${tile('Provider Cost', money(s.provider_cost))}${tile('Profit', money(s.profit))}</div><div class="card-meta" style="margin:6px 4px">Cost/Profit គណនាបានតែ Order ដែលបង្កើតក្រោយ Upgrade នេះ</div>` +
      (d.providers || []).map((p) => card(`${esc(p.name)} · ${badge(p)}`, p.balance != null ? `Balance: <b>${esc(p.balance)} ${esc(p.currency || '')}</b>` : esc(p.error || ''))).join('');
  };

  // ---------- Providers ----------
  V.smmprov = async () => {
    const d = await SA('/providers');
    const form = (id, p) => `${input('pn' + id, 'Name', 'text', p.name || '')}${input('pu' + id, 'API URL (https://panel.com/api/v2)', 'text', p.api_url || '')}${input('pk' + id, id ? 'API Key (ទុកទទេ = រក្សាចាស់)' : 'API Key', 'password')}`;
    body().innerHTML = card('➕ Add Provider', 'API Key រក្សាទុកនៅ Backend ប៉ុណ្ណោះ', form('', {}) + `<button type="button" class="btn btn-primary btn-block" data-act="add" style="margin-top:8px">Add & Test</button>`) +
      (d.providers || []).map((p) => card(`${p.id === d.active ? '✅ ' : ''}${esc(p.name)} · ${badge(p)}`, `${esc(p.api_url || '—')}${p.balance != null ? ` · Balance <b>${esc(p.balance)} ${esc(p.currency || '')}</b>` : ''}${p.error ? ` · ${esc(p.error)}` : ''}`,
        `<details style="margin-top:8px"><summary>✏️ Edit</summary>${form(p.id, p)}${b2('save', 'Save', `data-id="${p.id}"`, 'btn-primary')}</details>
         <div class="ax-row">${b2('sync', '🔄 Sync', `data-id="${p.id}"`)}${b2('act', 'Set Active', `data-id="${p.id}"`)}${b2('del', '🗑️', `data-id="${p.id}"`)}</div>`)).join('');
    on(body(), {
      add: async () => { if (!val('pu') || !val('pk')) return toast('បំពេញ URL និង Key'); const r = await SA('/providers', J('POST', { name: val('pn'), api_url: val('pu'), api_key: val('pk') })); toast(badge(r)); V.smmprov(); },
      save: async (x) => { await SA('/providers/' + x.id, J('PUT', { name: val('pn' + x.id), api_url: val('pu' + x.id), api_key: val('pk' + x.id) })); toast('Saved'); V.smmprov(); },
      act: async (x) => { await A('/smm/' + x.id + '/active', J('POST')); toast('Active'); V.smmprov(); },
      del: async (x) => { if (confirm('Delete provider?')) { await SA('/providers/' + x.id, J('DELETE')); V.smmprov(); } },
      sync: (x) => go('smmsync', +x.id),
    });
  };

  // ---------- Sync / Import ----------
  V.smmsync = async (pid) => {
    const d = await SA('/providers?balance=0');
    pid = pid || (d.providers[0] || {}).id || 1;
    const opts = d.providers.map((p) => `<option value="${p.id}" ${p.id === pid ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
    body().innerHTML = card('🔄 Sync / Import ពី Provider ពិត', 'Sync មិនបង្កើត Service ស្ទួន (ផ្គូផ្គងតាម Provider Service ID)',
      `<select class="ax-in" id="ax-sp">${opts}</select>
       <button type="button" class="btn btn-outline btn-block" data-act="cats" style="margin-top:8px">📂 Load Categories ពី Provider</button><div id="ax-cats"></div>
       <select class="ax-in" id="ax-pt"><option value="percent">Profit %</option><option value="flat">Profit $ flat</option></select>${input('pv', 'Profit value (សម្រាប់ Service ថ្មី)', 'number', '20')}
       <button type="button" class="btn btn-primary btn-block" data-act="sync" style="margin-top:8px">🔄 Sync existing (update cost/min/max/price)</button>
       <button type="button" class="btn btn-primary btn-block" data-act="imp" style="margin-top:8px">⬇️ Import NEW (Categories ដែលបានជ្រើស; គ្មានជ្រើស = ទាំងអស់)</button><div id="ax-sres"></div>`);
    let cats = [];
    const run = async (imp) => {
      const sel = [...document.querySelectorAll('.ax-cat:checked')].map((c) => c.value);
      if (imp && !sel.length && !confirm('Import ALL categories?')) return;
      const r = await SA('/sync', J('POST', { panel: +$('#ax-sp').value, import_new: imp, categories: sel, profit_type: $('#ax-pt').value, profit_value: parseFloat(val('pv') || '0') }));
      const t = r.stats; $('#ax-sres').innerHTML = card('Result', `Provider: ${t.provider_total} · Updated: ${t.updated} · New: ${t.new} · Missing on provider: ${t.missing_on_provider} · Skipped: ${t.skipped}${t.errors.length ? '<br>' + t.errors.slice(0, 5).map(esc).join('<br>') : ''}`);
    };
    on(body(), {
      cats: async () => { const r = await SA(`/providers/${$('#ax-sp').value}/categories`); cats = r.categories; $('#ax-cats').innerHTML = `<div class="card-meta" style="margin-top:8px">${r.total} services</div>` + cats.map((c) => `<label class="ax-kv"><span><input type="checkbox" class="ax-cat" value="${esc(c.name)}"> ${esc(c.name)}</span><b>${c.count}</b></label>`).join(''); },
      sync: () => run(false), imp: () => run(true),
    });
  };

  // ---------- Service management ----------
  const F = { q: '', status: 'all', category: '', offset: 0, sel: new Set() };
  V.smmsvc = async () => {
    const qs = `q=${encodeURIComponent(F.q)}&status=${F.status}&category=${encodeURIComponent(F.category)}&offset=${F.offset}&limit=30`;
    const d = await SA('/services?' + qs);
    const chips = ['all', 'active', 'disabled', 'deleted'].map((s) => `<button type="button" class="ax-chip ${F.status === s ? 'on' : ''}" data-act="st" data-s="${s}">${s}</button>`).join('');
    const catOpt = `<option value="">All categories</option>` + d.categories.map((c) => `<option ${c === F.category ? 'selected' : ''}>${esc(c)}</option>`).join('');
    const rows = d.services.map((s) => `<div class="card ax-card"><label style="display:flex;gap:8px;align-items:flex-start"><input type="checkbox" class="ax-sel" data-id="${s.id}" ${F.sel.has(s.id) ? 'checked' : ''}><div><div class="card-title">${s.featured ? '⭐ ' : ''}${esc(s.name)}</div><div class="card-meta">#${esc(s.smm_service_id)} · P${s.panel_id} · ${esc(s.group_name || '')} · ${s.min_qty}-${s.max_qty} · cost ${money(s.cost_price)} → sell <b>${money(s.selling_price)}</b>/1K ${s.is_disabled ? '· 🔴 OFF' : ''}${s.is_deleted ? '· 🗑️' : ''}</div></div></label>${b2('edit', '✏️ Edit', `data-id="${s.id}"`)}</div>`).join('') || empty();
    const pages = `<div class="ax-row">${F.offset > 0 ? b2('prev', '⬅️ Prev') : ''}${F.offset + 30 < d.total ? b2('next', 'Next ➡️') : ''}<span class="card-meta">${d.total} services</span></div>`;
    body().innerHTML = `${input('q', 'Search name / service ID', 'text', F.q)}<div class="ax-chips" style="margin-top:8px">${chips}</div><select class="ax-in" id="ax-fc">${catOpt}</select>
      <div class="card ax-card" style="margin-top:8px"><div class="card-title">Bulk (${F.sel.size} selected)</div><div class="ax-row">${b2('selpage', '☑️ Select page')}${b2('clr', 'Clear')}${b2('b_enable', 'Enable')}${b2('b_disable', 'Disable')}${b2('b_delete', 'Delete')}${b2('b_restore', 'Restore')}${b2('b_feature', '⭐ Feature')}${b2('b_unfeature', 'Unfeature')}</div>
      <div class="ax-row"><select id="ax-bpt" class="ax-in" style="flex:1"><option value="percent">%</option><option value="flat">$</option></select>${input('bpv', 'Profit', 'number')}</div>${b2('b_profit', '💰 Apply profit to selected', '', 'btn-primary')}
      ${input('bcat', 'New category name')}${b2('b_category', '📂 Move to category')}</div>${rows}${pages}<div id="ax-edit"></div>`;
    const ids = () => [...F.sel];
    const bulk = (action, extra = {}) => async () => {
      if (!F.sel.size) return toast('ជ្រើស Service សិន');
      if (['delete'].includes(action) && !confirm(`Delete ${F.sel.size} services?`)) return;
      const r = await SA('/services/bulk', J('POST', { ids: ids(), action, ...(extra.fn ? extra.fn() : {}) })); toast(`Done: ${r.affected}`); F.sel.clear(); V.smmsvc();
    };
    document.querySelectorAll('.ax-sel').forEach((c) => (c.onchange = () => { c.checked ? F.sel.add(+c.dataset.id) : F.sel.delete(+c.dataset.id); }));
    $('#ax-q').onchange = () => { F.q = val('q'); F.offset = 0; V.smmsvc(); };
    $('#ax-fc').onchange = (e) => { F.category = e.target.value; F.offset = 0; V.smmsvc(); };
    on(body(), {
      st: (x) => { F.status = x.s; F.offset = 0; V.smmsvc(); }, prev: () => { F.offset -= 30; V.smmsvc(); }, next: () => { F.offset += 30; V.smmsvc(); },
      selpage: () => { document.querySelectorAll('.ax-sel').forEach((c) => { c.checked = true; F.sel.add(+c.dataset.id); }); }, clr: () => { F.sel.clear(); V.smmsvc(); },
      b_enable: bulk('enable'), b_disable: bulk('disable'), b_delete: bulk('delete'), b_restore: bulk('restore'), b_feature: bulk('feature'), b_unfeature: bulk('unfeature'),
      b_profit: bulk('profit', { fn: () => ({ profit_type: $('#ax-bpt').value, profit_value: parseFloat(val('bpv')) }) }),
      b_category: bulk('category', { fn: () => ({ category: val('bcat') }) }),
      edit: async (x) => { const s = d.services.find((v) => v.id === +x.id); const e = $('#ax-edit');
        e.innerHTML = card('✏️ Edit #' + s.id, '', `${input('en', 'Name', 'text', s.name)}${input('ec', 'Category', 'text', s.group_name || '')}<textarea class="ax-in" id="ax-ed" rows="3" placeholder="Description">${esc(s.description || '')}</textarea>${input('emin', 'Min', 'number', s.min_qty)}${input('emax', 'Max', 'number', s.max_qty)}${input('esp', 'Selling price / 1K ($)', 'number', s.selling_price)}${input('eso', 'Sort order', 'number', s.sort_order || 0)}${b2('save', 'Save', '', 'btn-primary')} ${b2('purge', '🗑️ Delete permanently')}`);
        e.scrollIntoView({ behavior: 'smooth' });
        on(e, {
          save: async () => { const sp = parseFloat(val('esp')); await API.request('/api/admin/services/' + s.id, J('PATCH', { name: val('en'), group_name: val('ec'), description: $('#ax-ed').value, min_qty: +val('emin'), max_qty: +val('emax'), selling_price: sp, original_price: sp })); await SA(`/services/${s.id}/order`, J('POST', { sort_order: +val('eso') })); toast('Saved'); V.smmsvc(); },
          purge: async () => { if (confirm('Delete permanently?')) { await SA('/services/bulk', J('POST', { ids: [s.id], action: 'purge' })); V.smmsvc(); } },
        }); },
    });
  };

  // ---------- Orders ----------
  const O = { status: '', q: '', offset: 0 };
  V.smmord = async () => {
    const d = await SA(`/orders?status=${O.status}&q=${encodeURIComponent(O.q)}&offset=${O.offset}&limit=20`);
    const chips = ['', 'Pending', 'Processing', 'Completed', 'Partial', 'Canceled', 'Failed'].map((s) => `<button type="button" class="ax-chip ${O.status === s ? 'on' : ''}" data-act="f" data-s="${s}">${s || 'All'}</button>`).join('');
    const rows = d.orders.map((o) => card(`#${esc(o.order_id)} · ${esc(o.status)}`,
      `User ${esc(o.user_id)}${o.username ? ' @' + esc(o.username) : ''} · ${esc(o.service_name)}<br>${esc(o.link)} · Qty ${o.quantity}<br>Charge ${money(o.price)}${o.cost != null ? ` · Cost ${money(o.cost)} · Profit <b>${money(o.profit)}</b>` : ''}${o.refunded ? ` · Refunded ${money(o.refunded)}` : ''}`,
      `<div class="ax-row">${b2('chk', '🔎 Status', `data-id="${esc(o.order_id)}"`)}${b2('rf', '♻️ Refill', `data-id="${esc(o.order_id)}"`)}${b2('cn', '✖ Cancel', `data-id="${esc(o.order_id)}"`)}${b2('rd', '↩️ Refund', `data-id="${esc(o.order_id)}"`)}</div>`)).join('') || empty();
    body().innerHTML = `${input('oq', 'Search Order ID / Link / User ID', 'text', O.q)}<div class="ax-chips" style="margin-top:8px">${chips}</div>${input('ramt', 'Refund amount $ (ទទេ = ពេញ/Partial auto)', 'number')}${b2('sp', '🔄 Sync pending from providers')}${rows}<div class="ax-row">${O.offset > 0 ? b2('prev', '⬅️ Prev') : ''}${d.orders.length >= 20 ? b2('next', 'Next ➡️') : ''}</div>`;
    $('#ax-oq').onchange = () => { O.q = val('oq'); O.offset = 0; V.smmord(); };
    on(body(), {
      f: (x) => { O.status = x.s; O.offset = 0; V.smmord(); }, prev: () => { O.offset -= 20; V.smmord(); }, next: () => { O.offset += 20; V.smmord(); },
      sp: async () => { const r = await SA('/orders/sync-pending', J('POST')); toast(`Updated ${r.updated}`); V.smmord(); },
      chk: async (x) => { const r = await SA(`/orders/${encodeURIComponent(x.id)}/check`, J('POST')); toast(r.status); V.smmord(); },
      rf: async (x) => { await SA(`/orders/${encodeURIComponent(x.id)}/refill`, J('POST')); toast('Refill requested'); },
      cn: async (x) => { if (confirm('ស្នើ Cancel ទៅ Provider?')) { await SA(`/orders/${encodeURIComponent(x.id)}/cancel`, J('POST')); toast('Cancel requested'); V.smmord(); } },
      rd: async (x) => { const a = val('ramt'); const r = await SA(`/orders/${encodeURIComponent(x.id)}/refund`, J('POST', a === '' ? {} : { amount: parseFloat(a) })); toast(`Refunded ${money(r.refunded)}`); V.smmord(); },
    });
  };
})();
