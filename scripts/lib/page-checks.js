// Contrôles automatiques d'une page (exécutés dans le navigateur par Playwright) : débordements, texte coupé, contraste, boutons, avatars du village.
// Utilisé par scripts/display-audit.mjs (Loup-Garou) et scripts/savant-audit.mjs (Le Savant).
/* eslint-disable no-undef */
export function pageChecks({ tv, lobby }) {
  const issues = [];
  const vw = innerWidth;
  const vh = innerHeight;
  const root = document.documentElement;
  const label = (el) => `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}` : ''} « ${(el.textContent || '').trim().slice(0, 30)} »`;
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05;
  };
  if (root.scrollWidth > vw + 1) issues.push(`débordement horizontal : ${root.scrollWidth} px pour ${vw}`);
  if (tv && !lobby && root.scrollHeight > vh + 1) issues.push(`débordement vertical sur la TV : ${root.scrollHeight} px pour ${vh}`);
  const parse = (c) => {
    const m = /rgba?\(([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)(?:[, /]+([\d.]+))?\)/.exec(c);
    return m ? [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])] : null;
  };
  const lum = ([r, g, b]) => {
    const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const bgOf = (el) => {
    let layers = [];
    for (let p = el; p; p = p.parentElement) {
      const c = parse(getComputedStyle(p).backgroundColor);
      if (c && c[3] > 0) {
        layers.push(c);
        if (c[3] >= 1) break;
      }
    }
    let base = [12, 14, 40];
    for (const [r, g, b, a] of layers.reverse()) base = [r * a + base[0] * (1 - a), g * a + base[1] * (1 - a), b * a + base[2] * (1 - a)];
    return base;
  };
  const seen = new Set();
  for (const el of document.querySelectorAll('body *')) {
    if (!visible(el)) continue;
    if (!Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    const add = (msg) => {
      if (!seen.has(msg)) {
        seen.add(msg);
        issues.push(msg);
      }
    };
    if (r.right > vw + 1 || r.left < -1) add(`texte hors de l'écran : ${label(el)}`);
    if (tv && !lobby && r.bottom > vh + 1) add(`texte sous le bas de l'écran TV : ${label(el)}`);
    if (s.overflowX !== 'visible' && el.scrollWidth > el.clientWidth + 1 && s.textOverflow !== 'ellipsis') add(`texte coupé (largeur) : ${label(el)}`);
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const ps = getComputedStyle(p);
      if (ps.overflowX !== 'visible' || ps.overflowY !== 'visible') {
        const pr = p.getBoundingClientRect();
        const scrollY = ps.overflowY === 'auto' || ps.overflowY === 'scroll';
        if (r.right > pr.right + 2 || r.left < pr.left - 2 || (!scrollY && (r.bottom > pr.bottom + 2 || r.top < pr.top - 2))) add(`texte sorti de son cadre (${label(p)}) : ${label(el)}`);
        break;
      }
    }
    const fg = parse(s.color);
    if (fg) {
      const bg = bgOf(el);
      const a = fg[3];
      const mixed = [fg[0] * a + bg[0] * (1 - a), fg[1] * a + bg[1] * (1 - a), fg[2] * a + bg[2] * (1 - a)];
      const l1 = lum(mixed);
      const l2 = lum(bg);
      const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      const size = parseFloat(s.fontSize);
      const large = size >= 24 || (size >= 18.66 && Number(s.fontWeight) >= 700);
      if (ratio < (large ? 3 : 4.5)) add(`contraste ${ratio.toFixed(1)} : ${label(el)}`);
    }
  }
  if (!tv) {
    for (const el of document.querySelectorAll('button, [role=button], input:not([type=hidden]):not([type=file]), a.btn, .ctrl')) {
      if (!visible(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.height < 44 || r.width < 44) issues.push(`bouton trop petit (${Math.round(r.width)}×${Math.round(r.height)}) : ${label(el)}`);
    }
  }
  const av = Array.from(document.querySelectorAll('.village-avatar')).filter(visible).map((e) => e.getBoundingClientRect());
  let overlaps = 0;
  for (let i = 0; i < av.length; i++) for (let j = i + 1; j < av.length; j++) if (Math.min(av[i].right, av[j].right) - Math.max(av[i].left, av[j].left) > 3 && Math.min(av[i].bottom, av[j].bottom) - Math.max(av[i].top, av[j].top) > 3) overlaps++;
  if (overlaps) issues.push(`${overlaps} paires d'avatars du village se chevauchent`);
  // Un prénom recouvert par l'avatar d'un autre siège (ou par un autre prénom).
  const seats = Array.from(document.querySelectorAll('.village-seat')).filter(visible);
  const names = seats.map((s) => s.querySelector('.village-name').getBoundingClientRect());
  const faces = seats.map((s) => s.querySelector('.village-avatar').getBoundingClientRect());
  const hit = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 4 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 4;
  let covered = 0;
  for (let i = 0; i < seats.length; i++) for (let j = 0; j < seats.length; j++) if (i !== j && (hit(names[i], faces[j]) || (j > i && hit(names[i], names[j])))) covered++;
  if (covered) issues.push(`${covered} prénoms du village recouverts par un autre siège`);
  return issues;
}
/* eslint-enable no-undef */
