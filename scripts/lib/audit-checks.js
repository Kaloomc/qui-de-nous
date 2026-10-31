// Contrôles d'affichage du mode Duel, exécutés dans le navigateur (Playwright). Renvoie une liste de défauts { cat, blocking, msg } :
//   scroll, debordement, hors-ecran, chevauchement, bouton, ecart, contraste, police, couleur-seule, espace, texte, regle.
// Rien n'est capturé en image : tout est mesuré dans le DOM.
/* eslint-disable no-undef */
export function auditChecks({ tv, scale }) {
  const issues = [];
  const vw = innerWidth;
  const vh = innerHeight;
  const root = document.documentElement;
  const add = (cat, blocking, msg) => {
    if (!issues.some((i) => i.cat === cat && i.msg === msg)) issues.push({ cat, blocking, msg });
  };
  const short = (el) => {
    const cls = el.className && typeof el.className === 'string' ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}` : '';
    return `${el.tagName.toLowerCase()}${cls} « ${(el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 28)} »`;
  };
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    if (!(r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && Number(s.opacity) > 0.05)) return false;
    // Entièrement rogné par un parent à débordement caché : invisible (ex. vignettes de la roulette hors du cadre).
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const ps = getComputedStyle(p);
      if (ps.overflowX === 'visible' && ps.overflowY === 'visible') continue;
      const pr = p.getBoundingClientRect();
      if (r.right <= pr.left || r.left >= pr.right || r.bottom <= pr.top || r.top >= pr.bottom) return false;
    }
    return true;
  };
  // Éléments volontairement ignorés : décor (data-decor), canvas plein écran, pastilles d'hôte, numéro de version.
  const ignored = (el) => !!el.closest('.mg-die.is-rolling, .duel-thumb:not(.is-center), [data-decor], .duel-cheers, .duel-winner-burst, .mg-splash, .brand-version, .version-tag, .app-version, [aria-hidden="true"]:not(svg)');
  const inSvg = (el) => !!el.closest('svg') && el.tagName.toLowerCase() !== 'svg';

  // 1. Aucun scroll.
  if (root.scrollHeight > vh + 1) add('scroll', true, `défilement vertical : ${root.scrollHeight} px pour ${vh}`);
  if (root.scrollWidth > vw + 1) add('scroll', true, `défilement horizontal : ${root.scrollWidth} px pour ${vw}`);

  const parse = (c) => {
    const m = /rgba?\(([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)(?:[, /]+([\d.]+))?\)/.exec(c);
    return m ? [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])] : null;
  };
  const lum = ([r, g, b]) => {
    const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const baseColor = (() => {
    const c = parse(getComputedStyle(document.body).backgroundColor);
    return c && c[3] > 0 ? c : [18, 14, 42, 1];
  })();
  const bgOf = (el) => {
    const layers = [];
    for (let p = el; p; p = p.parentElement) {
      const c = parse(getComputedStyle(p).backgroundColor);
      if (c && c[3] > 0) {
        layers.push(c);
        if (c[3] >= 1) break;
      }
    }
    let base = baseColor.slice(0, 3);
    for (const [r, g, b, a] of layers.reverse()) base = [r * a + base[0] * (1 - a), g * a + base[1] * (1 - a), b * a + base[2] * (1 - a)];
    return base;
  };
  const textRect = (el) => {
    const range = document.createRange();
    let r = null;
    // Hauteur d'une ligne : la boîte de ligne (interligne), pas la hauteur du glyphe (un chiffre géant à interligne 1 ne déborde pas sur la ligne suivante).
    const lh = parseFloat(getComputedStyle(el).lineHeight);
    for (const n of el.childNodes) {
      if (n.nodeType !== 3 || !n.textContent.trim()) continue;
      range.selectNodeContents(n);
      for (const q of range.getClientRects()) {
        if (!q.width || !q.height) continue;
        const cut = lh > 0 && q.height > lh ? (q.height - lh) / 2 : 0;
        const top = q.top + cut;
        const bottom = q.bottom - cut;
        r = r ? { left: Math.min(r.left, q.left), top: Math.min(r.top, top), right: Math.max(r.right, q.right), bottom: Math.max(r.bottom, bottom) } : { left: q.left, top, right: q.right, bottom };
      }
    }
    return r;
  };

  const items = []; // éléments contenant du texte, boutons, avatars, icônes : candidats au chevauchement
  const all = Array.from(document.querySelectorAll('body *')).filter((el) => visible(el) && !ignored(el));
  for (const el of all) {
    const tag = el.tagName.toLowerCase();
    if (inSvg(el)) continue;
    const hasText = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim());
    const cls = typeof el.className === 'string' ? el.className : '';
    const isControl = ['button', 'img', 'svg', 'input', 'select', 'textarea'].includes(tag) || /\bavatar\b/.test(cls);
    if (!hasText && !isControl) continue;
    const r = el.getBoundingClientRect();
    let box = hasText && !isControl ? textRect(el) : { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    if (!box) continue;
    // Seule la partie visible compte : on rogne la boîte par les parents à débordement caché ou défilant.
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const ps = getComputedStyle(p);
      if (ps.overflowX === 'visible' && ps.overflowY === 'visible') continue;
      const pr = p.getBoundingClientRect();
      box = { left: Math.max(box.left, pr.left), top: Math.max(box.top, pr.top), right: Math.min(box.right, pr.right), bottom: Math.min(box.bottom, pr.bottom) };
    }
    if (box.right <= box.left || box.bottom <= box.top) continue;
    items.push({ el, box, tag, hasText, isControl });

    // 2. Débordements et textes coupés.
    const s = getComputedStyle(el);
    if (hasText) {
      if (r.right > vw + 1 || r.left < -1) add('hors-ecran', true, `texte hors de l'écran : ${short(el)}`);
      if (r.bottom > vh + 1 && !(s.position === 'fixed')) add('hors-ecran', true, `texte sous le bas de l'écran : ${short(el)}`);
      if (s.overflowX !== 'visible' && el.scrollWidth > el.clientWidth + 1) add('debordement', true, `texte coupé (largeur) : ${short(el)}`);
      if (s.overflowY !== 'visible' && s.overflowY !== 'auto' && s.overflowY !== 'scroll' && el.scrollHeight > el.clientHeight + 2) add('debordement', true, `texte coupé (hauteur) : ${short(el)}`);
      if (s.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1) add('debordement', true, `texte tronqué par « … » : ${short(el)}`);
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const ps = getComputedStyle(p);
        if (ps.overflowX !== 'visible' || ps.overflowY !== 'visible') {
          const pr = p.getBoundingClientRect();
          const scrollY = ps.overflowY === 'auto' || ps.overflowY === 'scroll';
          const t = textRect(el) ?? r;
          if (t.right > pr.right + 2 || t.left < pr.left - 2 || (!scrollY && (t.bottom > pr.bottom + 2 || t.top < pr.top - 2))) add('debordement', true, `texte sorti de son cadre (${short(p)}) : ${short(el)}`);
          break;
        }
      }
      // 4. Taille du texte : TV (28 px sur 1920 de large, en proportion), téléphone (16 px).
      const size = parseFloat(s.fontSize);
      const min = tv ? 28 * scale : 16;
      const floor = tv ? 20 * scale : 12;
      if (size < floor) add('police', false, `texte de ${size.toFixed(0)} px (< ${floor.toFixed(0)}) : ${short(el)}`);
      else if (size < min - 0.5 && !/\bmg-chamber\b/.test(cls)) add('police-petite', false, `texte de ${size.toFixed(0)} px (< ${min.toFixed(0)}) : ${short(el)}`);
      // 5. Contraste.
      let gradient = false;
      for (let p = el; p && p !== document.body && p !== root; p = p.parentElement) if (/gradient|url\(/.test(getComputedStyle(p).backgroundImage)) gradient = true;
      const fg = gradient ? null : parse(s.color);
      if (fg) {
        const bg = bgOf(el);
        const a = fg[3];
        const mixed = [fg[0] * a + bg[0] * (1 - a), fg[1] * a + bg[1] * (1 - a), fg[2] * a + bg[2] * (1 - a)];
        const l1 = lum(mixed);
        const l2 = lum(bg);
        const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
        const large = size >= 24 || (size >= 18.66 && Number(s.fontWeight) >= 700);
        if (ratio < (large ? 3 : 4.5)) add('contraste', true, `contraste ${ratio.toFixed(1)}:1 : ${short(el)}`);
      }
      // 9. Texte : espaces avant ? ! : ;, apostrophes droites, mots de test.
      const text = Array.from(el.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' ');
      if (/[\p{L}\d)][?!;:](?=\s|$)/u.test(text) && !/https?:|\d:\d/.test(text)) add('texte', false, `espace manquant avant ? ! : ; : « ${text.trim().slice(0, 40)} »`);
      if (/\p{L}'\p{L}/u.test(text)) add('texte', false, `apostrophe droite : « ${text.trim().slice(0, 40)} »`);
      if (/\b(undefined|NaN|null|lorem|TODO)\b|\[object/i.test(text)) add('texte', true, `texte de test ou valeur vide : « ${text.trim().slice(0, 40)} »`);
      if (/\{[^}]*\}/.test(text)) add('texte', true, `champ {...} visible : « ${text.trim().slice(0, 40)} »`);
      // Une phrase de règle tient sur 2 lignes au plus.
      if (/\b(duel-rule|duel-intro-rule|mg-rule)\b/.test(cls)) {
        const lines = Math.round(r.height / (parseFloat(s.lineHeight) || size * 1.2));
        if (lines > 2) add('regle', false, `règle sur ${lines} lignes : ${short(el)}`);
      }
    }
  }

  // 3. Aucun chevauchement entre deux éléments contenant du texte, des boutons ou des avatars (hors parent / enfant).
  const hit = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 3 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 3;
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i];
      const b = items[j];
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      if (!hit(a.box, b.box)) continue;
      add('chevauchement', true, `${short(a.el)}  ×  ${short(b.el)}`);
    }
  }

  // 4. Boutons et zones tactiles du téléphone : 44×44 px, 8 px d'écart.
  if (!tv) {
    const targets = Array.from(document.querySelectorAll('button, [role=button], input:not([type=hidden]):not([type=file]), select, textarea, a[href]')).filter((el) => visible(el) && !ignored(el));
    const rects = targets.map((el) => ({ el, r: el.getBoundingClientRect() }));
    for (const { el, r } of rects) {
      const tap = el.closest('label')?.getBoundingClientRect() ?? r;
      if (['checkbox', 'radio'].includes(el.type) && tap.height >= 44 && tap.width >= 44) continue;
      if (r.height < 43.5 || r.width < 43.5) add('bouton', true, `bouton de ${Math.round(r.width)}×${Math.round(r.height)} px : ${short(el)}`);
    }
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i].r;
        const b = rects[j].r;
        if (rects[i].el.contains(rects[j].el) || rects[j].el.contains(rects[i].el)) continue;
        const gapX = Math.max(b.left - a.right, a.left - b.right);
        const gapY = Math.max(b.top - a.bottom, a.top - b.bottom);
        const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if ((overlapY > 0 && gapX >= 0 && gapX < 8) || (overlapX > 0 && gapY >= 0 && gapY < 8)) add('ecart', false, `moins de 8 px entre ${short(rects[i].el)} et ${short(rects[j].el)}`);
      }
    }
  }

  // 6. Pas de couleur seule : un état (juste, faux, gagnant, perdant, sûr, piégé) a toujours un libellé, une icône ou un symbole.
  for (const el of document.querySelectorAll('.is-right, .is-wrong, .is-win, .is-lose, .is-safe, .is-trap, .is-ok, .is-ko, .is-ghost')) {
    if (!visible(el) || ignored(el) || el.closest('svg')) continue;
    if (!/\b(mg-|duel-)/.test(typeof el.className === 'string' ? el.className : '') && !el.closest('[class*="mg-"], [class*="duel-"]')) continue;
    if (['svg', 'path', 'rect', 'circle'].includes(el.tagName.toLowerCase())) continue;
    const s = getComputedStyle(el);
    const after = getComputedStyle(el, '::after').content;
    const before = getComputedStyle(el, '::before').content;
    const hasSymbol = (el.textContent || '').trim().length > 0 || el.querySelector('svg, img') || (after && after !== 'none' && after !== 'normal') || (before && before !== 'none' && before !== 'normal');
    if (!hasSymbol && (s.backgroundColor !== 'rgba(0, 0, 0, 0)' || s.borderStyle !== 'none')) add('couleur-seule', true, `état porté par la couleur seule : ${short(el)}`);
  }

  // 7. Espace utilisé (TV) : la scène de jeu occupe au moins 55 % de la hauteur ; pas de petit contenu perdu dans un grand vide.
  if (tv) {
    const body = document.querySelector('.duel-play-body');
    if (body) {
      const r = body.getBoundingClientRect();
      if (r.height < vh * 0.55 - 1) add('espace', false, `scène de ${Math.round((r.height / vh) * 100)} % de la hauteur (< 55 %)`);
    }
    const content = items.filter((i) => !i.el.closest('.duel-corner, .duel-hostmenu, .host-controls, .ctrl, [data-corner]'));
    if (content.length) {
      const box = content.reduce((m, i) => ({ left: Math.min(m.left, i.box.left), top: Math.min(m.top, i.box.top), right: Math.max(m.right, i.box.right), bottom: Math.max(m.bottom, i.box.bottom) }), { left: 1e9, top: 1e9, right: -1e9, bottom: -1e9 });
      const use = ((box.right - box.left) * (box.bottom - box.top)) / (vw * vh);
      const biggest = Math.max(...content.filter((i) => i.hasText).map((i) => parseFloat(getComputedStyle(i.el).fontSize)), 0);
      if (use < 0.3 && biggest < 56 * scale) add('espace', false, `contenu sur ${Math.round(use * 100)} % de l'écran seulement, texte de ${Math.round(biggest)} px au plus`);
    }
  }
  return issues;
}
/* eslint-enable no-undef */
