/**
 * CES Construcciones — Mobile Patch v5.1
 *
 * Problema raíz identificado:
 * Los videos de .home-screen__step-1__bg__video no disparan 'canplaythrough'
 * en iOS/Android sin gesto del usuario. ScreenStep1.animateIn() hace:
 *   this.timelineIn.pause()
 *   this.video.one("canplaythrough", ...)  ← nunca se dispara
 * → la animación queda bloqueada, la pantalla sigue oculta.
 *
 * Solución:
 * 1. Interceptar $.fn.on para bloquear scroll-hijack (sin cambios).
 * 2. Interceptar $.fn.on para detectar cuando scripts.js registra el listener
 *    de 'canplaythrough' en videos de home-screen y despachar el evento
 *    manualmente tras 1.5 s como fallback garantizado.
 * 3. A los videos step-1, forzar muted + playsinline + load() + play()
 *    desde document.ready para que tengan el máximo tiempo de buffering.
 * 4. Mantener la experiencia fullscreen/Hammer — NO convertir a scroll.
 * 5. MutationObserver para nav (sin cambios).
 * 6. Reload en cambio de orientación mobile↔desktop.
 */
(function($) {
  'use strict';

  if (!window.app || !window.app.isMobile) return;

  var MOBILE_BP = 1024;

  // ── 1 + 2. INTERCEPTAR jQuery .on() ─────────────────────────────────────────
  var _originalOn = $.fn.on;

  $.fn.on = function(events) {
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
          try { vidEl.load(); } catch (e) {}
          try { vidEl.play(); } catch (e) {}

          // Marcar si el evento real se disparó
          vidEl.addEventListener('canplaythrough', function onRealCPT() {
            vidEl._cptFired = true;
            vidEl.removeEventListener('canplaythrough', onRealCPT);
          });

          // Fallback garantizado: despachar canplaythrough tras 1.5 s
          setTimeout(function() {
            if (!vidEl._cptFired) {
              vidEl._cptFired = true;
              try {
                vidEl.dispatchEvent(new Event('canplaythrough'));
              } catch (e) {}
            }
          }, 1500);

          return result;
        }
      }
    }

    return _originalOn.apply(this, arguments);
  };

  // ── 3. PRE-CARGAR VIDEOS step-1 desde document.ready ─────────────────────────
  // Cuanto antes empiecen a buffear, más chances de que readyState === 4
  // cuando ScreenStep1.animateIn() los evalúe (evita necesitar el fallback).
  $(document).ready(function() {
    $('.home-screen__step-1__bg__video').each(function() {
      var vid = this;
      vid.muted = true;
      vid.setAttribute('muted', '');
      vid.setAttribute('playsinline', '');
      vid.setAttribute('webkit-playsinline', '');
      try { vid.load(); } catch (e) {}
      try { vid.play(); } catch (e) {}
    });
  });

  // ── 4. NAV: permitir scroll cuando está abierto ───────────────────────────────
  if (window.MutationObserver) {
    new MutationObserver(function() {
      if (document.body.style.overflow === 'hidden' || document.body.style.overflowY === 'hidden') {
        var navContent = document.querySelector('#nav__content');
        // GSAP usa style.visibility = 'inherit' para mostrar el nav
        var navIsOpen = navContent && navContent.style.visibility === 'inherit';
        if (!navIsOpen) {
          var isHomePage     = !!document.querySelector('#home-page');
          var isProjectsPage = !!document.querySelector('#projects-page');
          if (!isHomePage && !isProjectsPage) {
            document.body.style.overflow  = '';
            document.body.style.overflowY = '';
          }
        }
      }
    }).observe(document.body, { attributes: true, attributeFilter: ['style'] });
  }

  // ── 5. RELOAD EN CAMBIO DE ORIENTACIÓN mobile↔desktop ────────────────────────
  var wasMobile = window.innerWidth < MOBILE_BP;
  $(window).on('resize', (function() {
    var t;
    return function() {
      clearTimeout(t);
      t = setTimeout(function() {
        var isMobileNow = window.innerWidth < MOBILE_BP;
        if (wasMobile !== isMobileNow) window.location.reload();
        wasMobile = isMobileNow;
      }, 300);
    };
  })());

})(window.jQuery || window.$);
