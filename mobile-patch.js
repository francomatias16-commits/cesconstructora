/**
 * CES Construcciones — Mobile Patch v6.0 (definitivo)
 *
 * Bugs raíz corregidos:
 *
 * 1. app.isMobile en scripts.js toma isMobile:false porque el <script> inline
 *    en el HTML lo sobreescribe tarde. Este patch lo garantiza de nuevo.
 *
 * 2. ScreenStep1.animateIn() hace:
 *      this.timelineIn.pause()
 *      this.video.one("canplaythrough", handler)  ← nunca dispara en iOS/Android
 *    → Interceptamos jQuery .one/.on para despachar canplaythrough como fallback.
 *
 * 3. El scroll-hijack (DOMMouseScroll/mousewheel) bloquea el scroll en mobile.
 *    → Lo bloqueamos antes de que scripts.js lo registre.
 *
 * 4. En mobile, el último slide se congela porque el MutationObserver de
 *    mobile-video-optimizer rara vez captura la visibilidad del último slide.
 *    → Este patch garantiza el canplaythrough para TODOS los videos, incluido el último.
 *
 * 5. Reload en cambio de orientación mobile↔desktop para reinicializar todo.
 */
(function ($) {
  'use strict';

  // Esperar jQuery si aún no está disponible
  if (typeof $ === 'undefined') {
    document.addEventListener('DOMContentLoaded', function () {
      if (typeof window.jQuery !== 'undefined') {
        initPatch(window.jQuery);
      }
    });
    return;
  }

  // Verificar si estamos en mobile usando el breakpoint unificado
  var w = window.innerWidth;
  var ua = navigator.userAgent || '';
  var isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  var isMobileNow = w < 1024 || (isMobileUA && w < 1200);

  // Garantizar que app.isMobile esté correctamente seteado
  // (puede haberse sobreescrito por el <script> inline del HTML)
  if (window.app) {
    window.app.isMobile = isMobileNow && w < 768 ? true : (w < 1024 && isMobileUA ? true : window.app.isMobile);
    if (w < 768) window.app.isMobile = true;
  }

  if (!isMobileNow) return;

  var MOBILE_BP = 1024;

  // ── 1. INTERCEPTAR jQuery .on() ──────────────────────────────────────────────
  var _originalOn = $.fn.on;

  $.fn.on = function (events) {
    if (typeof events === 'string') {

      // 1a. Bloquear scroll-hijack en home/projects
      if (events.indexOf('DOMMouseScroll') !== -1 || events.indexOf('mousewheel') !== -1) {
        var el = this[0];
        if (el && (el.id === 'home-page' || el.id === 'projects-page')) {
          return this; // no registrar
        }
      }

      // 1b. Interceptar 'canplaythrough' en videos de home-screens
      // scripts.js hace: this.video.one("canplaythrough", handler)
      // jQuery .one() llama internamente a .on(), por eso lo capturamos aquí.
      if (events.indexOf('canplaythrough') !== -1) {
        var vidEl = this[0];
        if (vidEl && vidEl.tagName === 'VIDEO' && !vidEl._mpHandled) {
          vidEl._mpHandled = true;

          // Registrar el listener real (para que funcione si el evento llega)
          var result = _originalOn.apply(this, arguments);

          // Preparar el video para mobile
          vidEl.muted = true;
          vidEl.setAttribute('muted', '');
          vidEl.setAttribute('playsinline', '');
          vidEl.setAttribute('webkit-playsinline', '');

          // Intentar load + play inmediatamente para que el buffer avance
          try { vidEl.load(); } catch (e) {}
          try { vidEl.play().catch(function () {}); } catch (e) {}

          // Marcar si el evento real se disparó
          vidEl.addEventListener('canplaythrough', function onRealCPT() {
            vidEl._cptFired = true;
            vidEl.removeEventListener('canplaythrough', onRealCPT);
          });

          // Fallback: también escuchar canplay (más fácil de disparar en mobile)
          vidEl.addEventListener('canplay', function onCanPlay() {
            if (!vidEl._cptFired) {
              vidEl._cptFired = true;
              try { vidEl.dispatchEvent(new Event('canplaythrough')); } catch (e) {}
            }
            vidEl.removeEventListener('canplay', onCanPlay);
          });

          // Fallback garantizado tras 800ms (reducido de 1500 para ser más rápido)
          setTimeout(function () {
            if (!vidEl._cptFired) {
              vidEl._cptFired = true;
              try { vidEl.dispatchEvent(new Event('canplaythrough')); } catch (e) {}
            }
          }, 800);

          return result;
        }
      }
    }

    return _originalOn.apply(this, arguments);
  };

  // ── 2. PRE-CARGAR VIDEOS step-1 desde document.ready ─────────────────────────
  $(document).ready(function () {
    $('.home-screen__step-1__bg__video').each(function () {
      var vid = this;
      vid.muted = true;
      vid.setAttribute('muted', '');
      vid.setAttribute('playsinline', '');
      vid.setAttribute('webkit-playsinline', '');
      vid.preload = 'auto';
      try { vid.load(); } catch (e) {}
      // NO llamamos play() aquí para todos — lo hace mobile-video-optimizer
      // según qué slide es el activo. Evitamos reproducción simultánea.
    });
  });

  // ── 3. GARANTIZAR canplaythrough para el último slide (bug principal) ─────────
  // El último slide se congela porque cuando llega su turno, el fallback de 800ms
  // ya expiró o nunca se registró su video. Usamos un MutationObserver adicional
  // para detectar cuando un step-1 se hace visible y re-triggerear si es necesario.
  $(document).ready(function () {
    if (!window.MutationObserver) return;

    var step1Wrapper = document.querySelector('#home-page') || document.body;

    new MutationObserver(function (mutations) {
      mutations.forEach(function (m) {
        if (m.attributeName !== 'style') return;
        var el = m.target;
        var vis = el.style.visibility;

        // Si un step-1 se hizo visible
        if ((vis === 'inherit' || vis === 'visible') &&
            el.className && el.className.indexOf('home-screen__step-1') > -1) {

          var vid = el.querySelector('video');
          if (!vid) return;

          // Preparar
          vid.muted = true;
          vid.setAttribute('playsinline', '');
          vid.setAttribute('webkit-playsinline', '');

          // Si ya está listo para reproducir, despachar canplaythrough si no lo hizo
          if (vid.readyState >= 3) {
            if (!vid._cptFired) {
              vid._cptFired = true;
              try { vid.dispatchEvent(new Event('canplaythrough')); } catch (e) {}
            }
            try { vid.play().catch(function () {}); } catch (e) {}
          } else {
            try { vid.load(); } catch (e) {}
            // Fallback adicional: si en 1s no se disparó, forzar
            setTimeout(function () {
              if (!vid._cptFired) {
                vid._cptFired = true;
                try { vid.dispatchEvent(new Event('canplaythrough')); } catch (e) {}
              }
              try { vid.play().catch(function () {}); } catch (e) {}
            }, 1000);
          }
        }
      });
    }).observe(step1Wrapper, {
      attributes: true,
      subtree: true,
      attributeFilter: ['style']
    });
  });

  // ── 4. NAV: permitir scroll cuando está abierto ───────────────────────────────
  if (window.MutationObserver) {
    new MutationObserver(function () {
      if (document.body.style.overflow === 'hidden' || document.body.style.overflowY === 'hidden') {
        var navContent = document.querySelector('#nav__content');
        var navIsOpen = navContent && navContent.style.visibility === 'inherit';
        if (!navIsOpen) {
          var isHomePage = !!document.querySelector('#home-page');
          var isProjectsPage = !!document.querySelector('#projects-page');
          if (!isHomePage && !isProjectsPage) {
            document.body.style.overflow = '';
            document.body.style.overflowY = '';
          }
        }
      }
    }).observe(document.body, { attributes: true, attributeFilter: ['style'] });
  }

  // ── 5. RELOAD EN CAMBIO DE ORIENTACIÓN mobile↔desktop ────────────────────────
  var wasMobile = window.innerWidth < MOBILE_BP;
  $(window).on('resize', (function () {
    var t;
    return function () {
      clearTimeout(t);
      t = setTimeout(function () {
        var isMobileNow2 = window.innerWidth < MOBILE_BP;
        if (wasMobile !== isMobileNow2) window.location.reload();
        wasMobile = isMobileNow2;
      }, 300);
    };
  })());

})(window.jQuery || window.$);
