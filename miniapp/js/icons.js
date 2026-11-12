/**
 * Inline SVG icons (no emoji). Stroke-based, currentColor.
 * Usage: ICO.home() or ICO.wallet({ size: 20 })
 */
const ICO = (() => {
  const defaults = { size: 20, stroke: 1.75, className: 'ico' };

  function svg(paths, opts = {}) {
    const o = { ...defaults, ...opts };
    const extra = o.className ? ` class="${o.className}"` : '';
    return `<svg${extra} width="${o.size}" height="${o.size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${o.stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
  }

  return {
    home: (o) => svg('<path d="M3 10.5 12 3l9 7.5"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>', o),
    services: (o) => svg('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>', o),
    package: (o) => svg('<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>', o),
    wallet: (o) => svg('<path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/><path d="M3 10h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-8Z"/><circle cx="17" cy="14" r="1.25" fill="currentColor" stroke="none"/>', o),
    user: (o) => svg('<circle cx="12" cy="8" r="4"/><path d="M4 20c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5"/>', o),
    search: (o) => svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>', o),
    plus: (o) => svg('<path d="M12 5v14"/><path d="M5 12h14"/>', o),
    check: (o) => svg('<path d="M20 6 9 17l-5-5"/>', o),
    x: (o) => svg('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>', o),
    arrowLeft: (o) => svg('<path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>', o),
    arrowRight: (o) => svg('<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>', o),
    sun: (o) => svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>', o),
    moon: (o) => svg('<path d="M21 14.5A8.5 8.5 0 1 1 9.5 3 7 7 0 0 0 21 14.5z"/>', o),
    store: (o) => svg('<path d="m3 9 1.5-5h15L21 9"/><path d="M4 9v11h16V9"/><path d="M9 20v-6h6v6"/>', o),
    cart: (o) => svg('<circle cx="9" cy="20" r="1.5"/><circle cx="17" cy="20" r="1.5"/><path d="M3 4h2l1.5 11h11l2-7H7"/>', o),
    ticket: (o) => svg('<path d="M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a2 2 0 0 0 0-4V9z"/><path d="M12 7v10"/>', o),
    copy: (o) => svg('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>', o),
    clock: (o) => svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', o),
    activity: (o) => svg('<path d="M22 12h-4l-3 8L9 4l-3 8H2"/>', o),
    dollar: (o) => svg('<path d="M12 2v20"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>', o),
    flame: (o) => svg('<path d="M12 3c2 3 2 5 0 7 3 0 6 2 6 6a6 6 0 0 1-12 0c0-3 2-5 3-6-1 0-3-2-1-7 1 2 3 2 4 0z"/>', o),
    alert: (o) => svg('<path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L12.7 3.9a2 2 0 0 0-3.4 0z"/>', o),
    settings: (o) => svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9c.3.6.9 1 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>', o),
    qr: (o) => svg('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM18 14h3v2M14 18h2v3M18 18h1v1M21 17v4h-3"/>', o),
    link: (o) => svg('<path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7.1-7.1l-1.1 1"/><path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7.1 7.1l1.1-1"/>', o),
    chevronRight: (o) => svg('<path d="m9 18 6-6-6-6"/>', o),
    send: (o) => svg('<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7z"/>', o),
    inbox: (o) => svg('<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.7 4H7.3a2 2 0 0 0-1.8 1.1z"/>', o),
    spark: (o) => svg('<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/>', o),
  };
})();
