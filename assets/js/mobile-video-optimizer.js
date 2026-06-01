/**
 * CES Construcciones — Mobile Video Optimizer
 *
 * Qué hace:
 *   1. En móvil: cambia las <source> de los videos home a la carpeta
 *      assets/video/mobile/ (versiones comprimidas, de 102 MB → 9.8 MB total).
 *   2. Garantiza que el evento 'canplaythrough' se dispara para que
 *      scripts.js pueda avanzar la animación del home.
 *   3. En desktop: no hace nada — el sitio corre tal cual.
 *
 * CSS de visibilidad: ya está corregido en el <head> del index.html.
 */
(function () {
  'use strict';

  /* ── Detección mobile ───────────────────────────────────────────────────*/
  var mobile =
    window.matchMedia('(max-width: 1023px)').matches ||
    /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  if (!mobile) return; /* Desktop: no tocar nada */

  /* ── 1. Redirigir fuentes a versiones comprimidas ───────────────────────
     El HTML tiene assets/video/X.mp4 (4K, hasta 27 MB cada uno).
     Los cambiamos a assets/video/mobile/X.mp4 (720–1280px, ~800 KB–2 MB). */
  var MOBILE_DIR = 'assets/video/mobile/';

  document.querySelectorAll('video').forEach(function (vid) {
    var changed = false;
    vid.querySelectorAll('source').forEach(function (src) {
      var s = src.getAttribute('src') || '';
      if (s && s.indexOf('/mobile/') === -1 && s.indexOf('assets/video/') > -1) {
        var file = s.split('/').pop();
        src.setAttribute('src', MOBILE_DIR + file);
        changed = true;
      }
    });
    if (changed) {
      vid.load(); /* Reiniciar con las nuevas fuentes */
    }
  });

  /* ── 2. Canvas no-op ─────────────────────────────────────────────────────
     scripts.js usa canvas.drawImage(video) para renderizar en desktop.
     En móvil el canvas está oculto por CSS, pero el código sigue corriendo;
     lo neutralizamos para evitar errores de rendimiento.               */
  var _orig = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, opts) {
    var ctx = _orig.call(this, type, opts);
    if (ctx && type === '2d' && !ctx._noOp) {
      /* Solo neutralizar si el canvas pertenece al home-screen */
      var node = this.parentElement;
      while (node) {
        if (node.className && typeof node.className === 'string' &&
            node.className.indexOf('home-screen') > -1) {
          ctx._noOp     = true;
          ctx.drawImage = function () {};
          ctx.clearRect = function () {};
          break;
        }
        node = node.parentElement;
      }
    }
    return ctx;
  };

  /* ── 3. Parche jQuery: garantizar canplaythrough ─────────────────────────
     scripts.js registra $(video).on('canplaythrough', fn) para cada slide.
     Si el video tarda en cargar, el evento puede no dispararse.
     Aquí garantizamos que siempre se dispare (con un timeout de seguridad),
     para que las diapositivas avancen aunque el video esté cargando.    */
  function patchJQuery() {
    var $ = window.jQuery || window.$;
    if (!$ || !$.fn || $.fn._cesMobilePatch) return;
    if (typeof $.fn.on !== 'function') { setTimeout(patchJQuery, 50); return; }

    $.fn._cesMobilePatch = true;
    var _on = $.fn.on;

    $.fn.on = function (events) {
      if (typeof events === 'string' && events.indexOf('canplaythrough') > -1) {
        var vid = this[0];
        if (vid && vid.tagName === 'VIDEO') {
          var ret = _on.apply(this, arguments);

          /* Intentar reproducción */
          var p; try { p = vid.play(); } catch (e) {}
          if (p && p.catch) p.catch(function () {
            setTimeout(function () { try { vid.play(); } catch (e) {} }, 500);
          });

          /* Garantía: si no hay canplaythrough natural en X ms, lo disparamos */
          var fired = false;
          var onNative = function () {
            fired = true;
            vid.removeEventListener('canplaythrough', onNative);
            vid.removeEventListener('loadeddata',     onLoaded);
          };
          var onLoaded = function () {
            vid.removeEventListener('loadeddata', onLoaded);
            if (!fired) {
              fired = true;
              vid.removeEventListener('canplaythrough', onNative);
              try { vid.dispatchEvent(new Event('canplaythrough')); } catch (e) {}
            }
          };
          vid.addEventListener('canplaythrough', onNative);
          vid.addEventListener('loadeddata',     onLoaded);

          /* Timeout adaptativo: más corto si el video ya tiene datos */
          var rs    = vid.readyState;
          var delay = rs >= 4 ? 50 : rs >= 3 ? 300 : rs >= 2 ? 700 : rs >= 1 ? 1500 : 3000;
          setTimeout(function () {
            vid.removeEventListener('canplaythrough', onNative);
            vid.removeEventListener('loadeddata',     onLoaded);
            if (!fired) {
              fired = true;
              try { vid.dispatchEvent(new Event('canplaythrough')); } catch (e) {}
            }
          }, delay);

          return ret;
        }
      }
      return _on.apply(this, arguments);
    };
  }

  patchJQuery();
  setTimeout(patchJQuery, 100); /* Seguro por si jQuery carga tarde */

})();
