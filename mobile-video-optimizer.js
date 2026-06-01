/**
 * CES Construcciones — Mobile Video Optimizer v8.0
 *
 * BUGS CORREGIDOS respecto a v7:
 *
 * BUG 1 (principal — último slide congelado):
 *   v7 marcaba cada video con `_cesPatched = true` la primera vez.
 *   En visitas subsiguientes scripts.js volvía a registrar
 *   `.one("canplaythrough", handler)` pero el parche no programaba
 *   un nuevo dispatch de fallback → timelineIn quedaba pausado para siempre.
 *   FIX: Se eliminó el guard `_cesPatched`. Cada llamada a
 *   `.one("canplaythrough")` programa su propio timeout, siempre.
 *
 * BUG 2 (scroll-hijack no bloqueado en v7):
 *   v7 llamaba `_origOn.apply(this, arguments)` ANTES del check de scroll,
 *   por lo que el evento igual se registraba.
 *   FIX: el check se evalúa ANTES de llamar a `_origOn`.
 *
 * BUG 3 (video sin src en revisitas):
 *   v7 eliminaba el atributo `src` de los videos anteriores
 *   (releaseVideo → removeAttribute('src')). Si el usuario
 *   volvía a ese slide el video tenía readyState=0 y src vacío.
 *   FIX: Se eliminó la lógica de liberación de src. Los navegadores
 *   móviles gestionan memoria; la corrección funcional es la prioridad.
 */
(function () {
  'use strict';

  var isMobile =
    window.matchMedia('(max-width: 1023px)').matches ||
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  if (!isMobile) return;

  // ── 1. CSS: ocultar canvas, mostrar <video> directo ─────────────────────
  var style = document.createElement('style');
  style.textContent =
    '.home-screen__step-1__bg__canvas { display: none !important; }' +
    '.home-screen__step-1__bg__video {' +
    '  visibility: visible !important;' +
    '  position: absolute !important;' +
    '  top: 0 !important; left: 0 !important;' +
    '  width: 100% !important; height: 100% !important;' +
    '  object-fit: cover !important;' +
    '  z-index: 2 !important;' +
    '}';
  (document.head || document.documentElement).appendChild(style);

  // ── 2. Neutralizar drawImage en canvas de home-screens ──────────────────
  // scripts.js sigue llamando drawImage aunque el canvas esté oculto;
  // sin este no-op puede lanzar errores con dimensiones 0 y freezar el ticker.
  var _origGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, opts) {
    var ctx = _origGetContext.call(this, type, opts);
    if (type === '2d' && ctx && !ctx._cesNoOp) {
      var el = this;
      while (el) {
        if (typeof el.className === 'string' &&
            el.className.indexOf('home-screen') > -1) {
          ctx._cesNoOp    = true;
          ctx.drawImage   = function () {};
          ctx.clearRect   = function () {};
          ctx.fillRect    = function () {};
          ctx.putImageData = function () {};
          break;
        }
        el = el.parentElement;
      }
    }
    return ctx;
  };

  // ── 3. Helpers de video ──────────────────────────────────────────────────
  function prepareVideo(v) {
    if (!v) return;
    v.muted   = true;
    v.loop    = true;
    v.preload = 'auto';
    v.setAttribute('muted', '');
    v.setAttribute('playsinline', '');
    v.setAttribute('webkit-playsinline', '');
    v.setAttribute('x5-playsinline', '');
  }

  function tryPlay(v) {
    if (!v) return;
    var p;
    try { p = v.play(); } catch (e) {}
    if (p && typeof p.catch === 'function') {
      p.catch(function () {
        setTimeout(function () { try { v.play(); } catch (e) {} }, 300);
      });
    }
  }

  // Devuelve el src del primer <source> hijo que no tenga media query,
  // o el primero disponible como fallback.
  function getSourceSrc(v) {
    var sources = v.querySelectorAll('source');
    if (!sources.length) return '';
    for (var i = 0; i < sources.length; i++) {
      if (!sources[i].getAttribute('media')) {
        return sources[i].getAttribute('src') || '';
      }
    }
    return sources[0].getAttribute('src') || '';
  }

  // ── 4. Parche de jQuery ──────────────────────────────────────────────────
  // scripts.js incluye jQuery en su bundle; cuando este archivo ejecuta,
  // jQuery todavía no existe → se reintenta cada 30 ms hasta encontrarlo.
  function patchJQuery() {
    var jq = window.jQuery || window.$;
    if (!jq || !jq.fn) {
      setTimeout(patchJQuery, 30);
      return;
    }

    // Evitar doble parche (p.ej. si mobile-patch.js ya lo aplicó)
    if (jq.fn._cesV8) return;
    jq.fn._cesV8 = true;

    var _origOn = jq.fn.on;

    jq.fn.on = function (events) {
      if (typeof events === 'string') {

        // ── 4a. Bloquear scroll-hijack ANTES de registrar ──────────────
        // CORRECCIÓN v8: el check va ANTES de _origOn.apply
        if (events.indexOf('DOMMouseScroll') > -1 ||
            events.indexOf('mousewheel')     > -1) {
          var el0 = this[0];
          if (el0 && (el0.id === 'home-page' ||
                      el0.id === 'projects-page')) {
            return this;
          }
        }

        // ── 4b. Garantizar canplaythrough en CADA visita al slide ──────
        // CORRECCIÓN v8: sin guard _cesPatched.
        //   scripts.js registra un nuevo .one("canplaythrough") cada vez
        //   que animateIn() se llama; aquí programamos un nuevo dispatch
        //   de fallback por cada registro, siempre, sin excepción.
        if (events.indexOf('canplaythrough') > -1) {
          var vid = this[0];
          if (vid && vid.tagName === 'VIDEO') {

            // Registrar el listener de scripts.js primero
            var ret = _origOn.apply(this, arguments);

            // Si un parche anterior removió el src, restaurarlo
            if (!vid.src && !vid.currentSrc) {
              var src = getSourceSrc(vid);
              if (src) {
                vid.src = src;
                try { vid.load(); } catch (e) {}
              }
            }

            prepareVideo(vid);
            tryPlay(vid);

            // Delay adaptativo según readyState actual
            var rs = vid.readyState;
            var delay = rs >= 4 ? 0
                      : rs >= 3 ? 100
                      : rs >= 2 ? 300
                      : rs >= 1 ? 700
                      : 1400;

            var fired = false;

            var onNative = function () {
              fired = true;
              vid.removeEventListener('canplaythrough', onNative);
            };
            vid.addEventListener('canplaythrough', onNative);

            // Si llega loadeddata antes del timeout, disparar ya
            var onLoadedData = function () {
              vid.removeEventListener('loadeddata', onLoadedData);
              if (!fired) {
                fired = true;
                vid.removeEventListener('canplaythrough', onNative);
                try { vid.dispatchEvent(new Event('canplaythrough')); } catch (e) {}
              }
            };
            vid.addEventListener('loadeddata', onLoadedData);

            // Fallback duro garantizado
            setTimeout(function () {
              vid.removeEventListener('loadeddata', onLoadedData);
              if (!fired) {
                fired = true;
                vid.removeEventListener('canplaythrough', onNative);
                try { vid.dispatchEvent(new Event('canplaythrough')); } catch (e) {}
              }
            }, delay);

            return ret;
          }
        }
      }

      return _origOn.apply(this, arguments);
    };
  }

  // ── 5. Pre-cargar landing video en DOMContentLoaded ─────────────────────
  function preloadLanding() {
    var jq = window.jQuery || window.$;
    if (!jq) { setTimeout(preloadLanding, 100); return; }
    jq(document).ready(function () {
      var v = document.getElementById('home-landing__bg__video');
      if (v) { prepareVideo(v); tryPlay(v); }
    });
  }

  // ── 6. NAV: desbloquear scroll cuando el menú está abierto ──────────────
  if (window.MutationObserver) {
    new MutationObserver(function () {
      if (document.body.style.overflow  === 'hidden' ||
          document.body.style.overflowY === 'hidden') {
        var nav     = document.querySelector('#nav__content');
        var navOpen = nav && nav.style.visibility === 'inherit';
        if (!navOpen) {
          var isHome     = !!document.querySelector('#home-page');
          var isProjects = !!document.querySelector('#projects-page');
          if (!isHome && !isProjects) {
            document.body.style.overflow  = '';
            document.body.style.overflowY = '';
          }
        }
      }
    }).observe(document.body, { attributes: true, attributeFilter: ['style'] });
  }

  // ── 7. Reload en cambio de orientación mobile ↔ desktop ─────────────────
  var _wasMobile = window.innerWidth < 1024;
  var _resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(function () {
      var nowMobile = window.innerWidth < 1024;
      if (_wasMobile !== nowMobile) window.location.reload();
      _wasMobile = nowMobile;
    }, 300);
  });

  // ── Init ─────────────────────────────────────────────────────────────────
  patchJQuery();
  preloadLanding();

})();
