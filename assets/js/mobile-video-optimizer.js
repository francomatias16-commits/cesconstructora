/**
 * CES — Mobile Optimizer (definitivo)
 *
 * POR QUÉ LOS PARCHES ANTERIORES FALLABAN:
 *   scripts.js es un bundle browserify con jQuery propio. No usa window.jQuery.
 *   Parchear window.jQuery.fn.on no intercepta nada dentro del bundle.
 *
 * SOLUCIÓN:
 *   Parchar EventTarget.prototype.addEventListener (API nativa del browser,
 *   imposible de bundlear). scripts.js llama internamente a
 *   elem.addEventListener("canplaythrough", fn) — esta intercepción lo captura.
 *
 * QUÉ HACE:
 *   - En móvil: cada vez que scripts.js registra "canplaythrough" en un <video>,
 *     disparamos ese evento a los 200 ms (suficiente para que scripts.js
 *     termine su init). Así animateIn() corre y el slide aparece.
 *   - CSS (inline en <head>) muestra la imagen poster de cada slide.
 *   - Borramos las <source> para que no se descargue nada de video.
 *   - En desktop: no toca absolutamente nada.
 */
(function () {
  'use strict';

  var mobile =
    window.matchMedia('(max-width: 1023px)').matches ||
    /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  if (!mobile) return;

  /* ── 1. Interceptar addEventListener (nativo, captura jQuery interno) ────
     scripts.js llama: video.addEventListener("canplaythrough", handler)
     Lo interceptamos y despachamos el evento a los 200 ms.
     Así animateIn() se ejecuta y el contenido de cada slide aparece.      */
  var _origAdd = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function (type, fn, opts) {
    var self = this;
    var ret  = _origAdd.apply(this, arguments);
    if (type === 'canplaythrough' &&
        self.nodeType === 1 &&
        self.tagName  === 'VIDEO') {
      setTimeout(function () {
        try { self.dispatchEvent(new Event('canplaythrough')); } catch (e) {}
      }, 200);
    }
    return ret;
  };

  /* ── 2. Vaciar <source> de todos los videos ──────────────────────────────
     Así el browser no descarga nada. Los <video> quedan en DOM
     (scripts.js necesita encontrarlos para su lógica interna).            */
  document.querySelectorAll('video source').forEach(function (s) { s.remove(); });
  document.querySelectorAll('video').forEach(function (v) {
    try { v.load(); } catch (e) {}
  });

}());
