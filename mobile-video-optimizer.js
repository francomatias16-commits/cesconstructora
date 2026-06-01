/**
 * CES — Mobile Video Optimizer v7.0 FINAL
 *
 * Arquitectura del problema:
 * scripts.js (ScreenStep1.animateIn) hace:
 *   1. this.timelineIn.pause()
 *   2. this.video.one("canplaythrough", this.onVideoCanPlayThrough)
 *   3. onVideoCanPlayThrough => mediaWidth/Height, startTicker, video.play(), timelineIn.play()
 *
 * En móvil "canplaythrough" NUNCA se dispara sin gesto del usuario.
 * Resultado: timelineIn queda pausado, pantalla congelada.
 *
 * Solución v7:
 * - Interceptar $.fn.one/on para detectar ese listener exacto
 * - Forzar el evento cuando el video tiene datos suficientes (readyState >= 2)
 *   o tras un timeout adaptativo basado en el estado real del video
 * - Bypass total del canvas en móvil: ocultar canvas, mostrar <video> directo
 * - Cargar solo el video del slide activo (no todos a la vez)
 * - Compatibilidad total con la API interna de scripts.js sin modificarlo
 */
(function () {
  'use strict';

  // ─── Detección de móvil ───────────────────────────────────────────────────
  var isMobile =
    window.matchMedia('(max-width: 1023px)').matches ||
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  if (!isMobile) return;

  // ─── 1. CSS: bypass canvas, mostrar video directo ─────────────────────────
  var style = document.createElement('style');
  style.textContent = [
    // Ocultar canvas, el video ocupa su lugar
    '.home-screen__step-1__bg__canvas { display: none !important; }',
    // Video visible y cubriendo el fondo
    '.home-screen__step-1__bg__video {',
    '  visibility: visible !important;',
    '  position: absolute !important;',
    '  top: 0 !important; left: 0 !important;',
    '  width: 100% !important; height: 100% !important;',
    '  object-fit: cover !important;',
    '  z-index: 2 !important;',
    '}',
    // Asegurar que home-screens sean visibles cuando toca
    '.home-screen { overflow: hidden; }',
  ].join('\n');
  (document.head || document.documentElement).appendChild(style);

  // ─── 2. Parchear canvas.getContext para neutralizar drawImage ─────────────
  // scripts.js sigue llamando a canvas.getContext("2d") y drawImage,
  // pero como el canvas está oculto, solo necesitamos que no tire errores.
  var patchedCtxSet = new WeakSet();
  var origGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, opts) {
    var ctx = origGetContext.call(this, type, opts);
    if (type === '2d' && ctx && !patchedCtxSet.has(ctx)) {
      // Verificar si este canvas pertenece a un home-screen
      var el = this;
      var isHomeCanvas = false;
      while (el) {
        if (el.className && typeof el.className === 'string' &&
            (el.className.indexOf('home-screen') > -1 ||
             el.className.indexOf('home-landing') > -1)) {
          isHomeCanvas = true;
          break;
        }
        el = el.parentElement;
      }
      if (isHomeCanvas) {
        patchedCtxSet.add(ctx);
        // No-ops para todas las operaciones de dibujo
        ctx.drawImage = function () {};
        ctx.clearRect = function () {};
        ctx.fillRect = function () {};
        ctx.putImageData = function () {};
      }
    }
    return ctx;
  };

  // ─── 3. Sistema de gestión de videos ─────────────────────────────────────
  var activeVideo = null;
  var pendingVideoRelease = null;

  function prepareVideo(video) {
    if (!video) return;
    video.muted = true;
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.setAttribute('x5-playsinline', '');
    video.loop = true;
    video.preload = 'auto';
  }

  function releaseVideo(video) {
    if (!video || video === activeVideo) return;
    try { video.pause(); } catch (e) {}
    video.removeAttribute('src');
    try { video.load(); } catch (e) {}
  }

  function tryPlay(video) {
    if (!video) return;
    var p;
    try { p = video.play(); } catch (e) {}
    if (p && typeof p.catch === 'function') {
      p.catch(function () {
        // Retry silencioso después de 300ms
        setTimeout(function () {
          try { video.play(); } catch (e2) {}
        }, 300);
      });
    }
  }

  // ─── 4. Intercepción de jQuery para detectar listener canplaythrough ──────
  // scripts.js hace: this.video.one("canplaythrough", this.onVideoCanPlayThrough)
  // jQuery .one() llama internamente a .on(), así que interceptamos .on()

  function patchJQuery() {
    var jq = window.jQuery || window.$;
    if (!jq || !jq.fn) {
      setTimeout(patchJQuery, 50);
      return;
    }

    var _on = jq.fn.on;

    jq.fn.on = function (events) {
      var result = _on.apply(this, arguments);

      if (typeof events !== 'string') return result;

      // ── 4a. Bloquear scroll-hijack en mobile ──
      if (events.indexOf('DOMMouseScroll') > -1 || events.indexOf('mousewheel') > -1) {
        var el0 = this[0];
        if (el0 && (el0.id === 'home-page' || el0.id === 'projects-page')) {
          // Desregistrar: devolver this sin registrar
          return this;
        }
      }

      // ── 4b. Interceptar "canplaythrough" en videos de home-screens ──
      if (events.indexOf('canplaythrough') > -1) {
        var vidEl = this[0];
        if (vidEl && vidEl.tagName === 'VIDEO' && !vidEl._cesPatched) {
          vidEl._cesPatched = true;

          prepareVideo(vidEl);
          activeVideo = vidEl;

          // Liberar el video anterior
          if (pendingVideoRelease && pendingVideoRelease !== vidEl) {
            releaseVideo(pendingVideoRelease);
          }
          pendingVideoRelease = vidEl;

          // Asegurar que tenga src cargando
          if (!vidEl.src && !vidEl.currentSrc) {
            // Buscar src en atributos data o en sources que pudieran quedar
            var sources = vidEl.querySelectorAll('source');
            if (sources.length > 0) {
              vidEl.src = sources[0].getAttribute('src');
            } else if (vidEl._cesSrc) {
              vidEl.src = vidEl._cesSrc;
            }
          }

          if (vidEl.src || vidEl.currentSrc) {
            try { vidEl.load(); } catch (e) {}
            tryPlay(vidEl);
          }

          // Escuchar el evento real por si llega antes del timeout
          var realFired = false;
          var onRealCPT = function () {
            realFired = true;
            vidEl.removeEventListener('canplaythrough', onRealCPT);
          };
          vidEl.addEventListener('canplaythrough', onRealCPT);

          // Timeout adaptativo:
          // - Si readyState >= 2 (HAVE_CURRENT_DATA): disparar en 200ms
          // - Si readyState >= 1 (HAVE_METADATA): disparar en 800ms
          // - Sin datos: disparar en 1500ms como fallback duro
          function scheduleDispatch() {
            var delay;
            var rs = vidEl.readyState;
            if (rs >= 4) { delay = 0; }       // HAVE_ENOUGH_DATA
            else if (rs >= 3) { delay = 100; } // HAVE_FUTURE_DATA
            else if (rs >= 2) { delay = 200; } // HAVE_CURRENT_DATA
            else if (rs >= 1) { delay = 800; } // HAVE_METADATA
            else { delay = 1500; }             // nada

            setTimeout(function () {
              if (!realFired) {
                realFired = true;
                vidEl.removeEventListener('canplaythrough', onRealCPT);
                try {
                  vidEl.dispatchEvent(new Event('canplaythrough'));
                } catch (e) {}
              }
            }, delay);
          }

          // Escuchar loadeddata para re-evaluar el delay
          var onLoadedData = function () {
            vidEl.removeEventListener('loadeddata', onLoadedData);
            if (!realFired) {
              scheduleDispatch();
            }
          };
          vidEl.addEventListener('loadeddata', onLoadedData);

          // También disparar si ya tiene datos ahora mismo
          scheduleDispatch();
        }
      }

      return result;
    };

    // También parchear .one() directamente por si scripts.js lo usa directo
    var _one = jq.fn.one;
    jq.fn.one = function (events) {
      if (typeof events === 'string' && events.indexOf('canplaythrough') > -1) {
        // .one() llama a .on() internamente, ya lo captamos arriba
        // Solo aseguramos que el video esté preparado
        var vidEl = this[0];
        if (vidEl && vidEl.tagName === 'VIDEO') {
          prepareVideo(vidEl);
          if (vidEl.src || vidEl.currentSrc) {
            tryPlay(vidEl);
          }
        }
      }
      return _one.apply(this, arguments);
    };
  }

  // ─── 5. Pre-cargar video del primer slide en cuanto el DOM esté listo ─────
  function preloadFirstVideo() {
    var jq = window.jQuery || window.$;
    if (!jq) { setTimeout(preloadFirstVideo, 100); return; }

    jq(document).ready(function () {
      // Solo pre-cargar el landing video (es el primero y más pequeño: 2.2MB)
      var landing = document.getElementById('home-landing__bg__video');
      if (landing) {
        prepareVideo(landing);
        activeVideo = landing;

        // Guardar src original si tiene sources
        if (!landing.src && !landing.currentSrc) {
          var src = landing.querySelector('source');
          if (src) {
            landing._cesSrc = src.getAttribute('src');
            landing.src = landing._cesSrc;
          }
        }
        try { landing.load(); } catch (e) {}
        tryPlay(landing);
      }

      // Para los videos de home-screen, guardar sus src y limpiar preload
      // para no cargar todo a la vez
      var screenVideos = document.querySelectorAll('.home-screen__step-1__bg__video');
      for (var i = 0; i < screenVideos.length; i++) {
        var v = screenVideos[i];
        if (!v._cesSrc) {
          var sources = v.querySelectorAll('source');
          if (sources.length > 0) {
            // Preferir la source con media query mobile si existe
            var mobileSrc = null, defaultSrc = null;
            for (var s = 0; s < sources.length; s++) {
              var media = sources[s].getAttribute('media') || '';
              if (media.indexOf('max-width') > -1) {
                mobileSrc = sources[s].getAttribute('src');
              } else {
                defaultSrc = sources[s].getAttribute('src');
              }
            }
            v._cesSrc = mobileSrc || defaultSrc || '';
          } else if (v.src) {
            v._cesSrc = v.src;
          }
        }
        // No pre-cargar estos ahora, se cargarán cuando se active el slide
        if (v !== landing) {
          v.preload = 'none';
        }
      }
    });
  }

  // ─── 6. MutationObserver para activar video cuando cambia el slide ────────
  function watchSlideChanges() {
    if (!window.MutationObserver) return;

    var observer = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var mut = mutations[i];
        if (mut.attributeName !== 'style') continue;

        var el = mut.target;
        var vis = el.style.visibility;

        // Cuando un slide se hace visible
        if (vis === 'inherit' || vis === 'visible' || vis === '') {
          var video =
            el.querySelector('.home-screen__step-1__bg__video') ||
            el.querySelector('#home-landing__bg__video');

          if (video && video !== activeVideo) {
            // Activar este video
            prepareVideo(video);

            if (!video.src && video._cesSrc) {
              video.src = video._cesSrc;
              try { video.load(); } catch (e) {}
            }

            tryPlay(video);

            // Liberar el anterior con un pequeño delay
            var prev = activeVideo;
            activeVideo = video;
            setTimeout(function () { releaseVideo(prev); }, 1000);

            return;
          }
        }
      }
    });

    // Observar los contenedores de slides
    var targets = document.querySelectorAll(
      '.home-screen, .home-screen__step, #home-landing, #home-landing__bg, [id^="home-"]'
    );
    for (var i = 0; i < targets.length; i++) {
      observer.observe(targets[i], {
        attributes: true,
        subtree: true,
        attributeFilter: ['style', 'class'],
      });
    }
  }

  // ─── 7. NAV: permitir scroll cuando está abierto ──────────────────────────
  function patchNavScroll() {
    if (!window.MutationObserver) return;
    new MutationObserver(function () {
      if (document.body.style.overflow === 'hidden' ||
          document.body.style.overflowY === 'hidden') {
        var navContent = document.querySelector('#nav__content');
        var navIsOpen = navContent &&
          navContent.style.visibility === 'inherit';
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

  // ─── 8. Reload en cambio de orientación ──────────────────────────────────
  function watchOrientation() {
    var wasMobile = window.innerWidth < 1024;
    var resizeTimer;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        var isMobileNow = window.innerWidth < 1024;
        if (wasMobile !== isMobileNow) window.location.reload();
        wasMobile = isMobileNow;
      }, 300);
    });
  }

  // ─── 9. Init ──────────────────────────────────────────────────────────────
  function init() {
    patchJQuery();
    preloadFirstVideo();
    patchNavScroll();
    watchOrientation();

    // Iniciar observer de slides cuando el DOM esté listo
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', watchSlideChanges);
    } else {
      watchSlideChanges();
    }
  }

  // Ejecutar lo antes posible
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
