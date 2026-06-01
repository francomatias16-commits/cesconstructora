/**
 * CES Construcciones — Mobile: imágenes estáticas en slides
 *
 * En móvil los videos están ocultos por CSS y cada slide muestra
 * su imagen poster. Este script solo necesita garantizar que el
 * evento 'canplaythrough' se dispare para que scripts.js pueda
 * avanzar la animación de las diapositivas (aunque no haya video).
 *
 * En desktop no hace absolutamente nada.
 */
(function () {
  'use strict';

  var mobile =
    window.matchMedia('(max-width: 1023px)').matches ||
    /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  if (!mobile) return;

  /* Vaciar fuentes de video para que el browser no descargue nada */
  document.querySelectorAll(
    '.home-screen__step-1__bg__video, #home-landing__bg__video'
  ).forEach(function (v) {
    v.querySelectorAll('source').forEach(function (s) { s.remove(); });
    try { v.load(); } catch (e) {} /* Reset a estado vacío */
  });

  /* Parche jQuery: disparar canplaythrough inmediatamente.
     scripts.js espera este evento para animar cada slide.
     Sin video que cargar, lo forzamos con un timeout mínimo. */
  function patch() {
    var jq = window.jQuery || window.$;
    if (!jq || !jq.fn || !jq.fn.on || jq.fn._cesPatch) return;
    jq.fn._cesPatch = true;
    var _on = jq.fn.on;
    jq.fn.on = function (events) {
      if (typeof events === 'string' && events.indexOf('canplaythrough') > -1) {
        var vid = this[0];
        if (vid && vid.tagName === 'VIDEO') {
          var ret = _on.apply(this, arguments);
          var v = vid;
          setTimeout(function () {
            try { v.dispatchEvent(new Event('canplaythrough')); } catch (e) {}
          }, 50);
          return ret;
        }
      }
      return _on.apply(this, arguments);
    };
  }

  patch();
  setTimeout(patch, 80);  /* Seguro por si jQuery carga un poco tarde */

}());
