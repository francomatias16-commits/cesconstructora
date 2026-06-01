/**
 * CES Construcciones — Mobile Video Optimizer v9.0
 *
 * ESTRATEGIA DEFINITIVA:
 *   En móvil, redirige cada video a su versión comprimida en assets/video/mobile/.
 *   - home-3 (4K 20MB) → 468 KB  ↓97%
 *   - home-5 (4K 22MB) → 1.2 MB  ↓94%
 *   - home-6 (4K 27MB) → 2.2 MB  ↓91%
 *   Total: 102 MB → 9.8 MB
 *
 *   Carga progresiva: solo el video activo se carga a la vez.
 *   canplaythrough se dispara con timeout adaptativo para que scripts.js
 *   no congele la timeline.
 */
(function () {
  'use strict';

  var isMobile =
    window.matchMedia('(max-width: 1023px)').matches ||
    /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  if (!isMobile) return;

  // ── 1. Redirigir fuentes a versiones mobile comprimidas ────────────────────
  // El DOM ya está parseado (este script está al final del body).
  var MOBILE_DIR = 'assets/video/mobile/';

  function rewriteSources(video) {
    var sources = video.querySelectorAll('source');
    sources.forEach(function (src) {
      var s = src.getAttribute('src') || '';
      if (s && s.indexOf('/mobile/') === -1) {
        // Reemplazar ruta: assets/video/X.mp4 → assets/video/mobile/X.mp4
        var filename = s.split('/').pop();
        src.setAttribute('src', MOBILE_DIR + filename);
      }
      // Eliminar media query de <source> para que el browser use el primero
      src.removeAttribute('media');
    });
  }

  // Aplicar a todos los videos del home
  var allVideos = document.querySelectorAll(
    '#home-landing__bg__video, .home-screen__step-1__bg__video'
  );

  // Mapa poster para mostrar imagen mientras carga el video
  var POSTER_MAP = {
    'home-landing.mp4'    : 'assets/img/posters/home-landing.jpg',
    'home-7.mp4'          : 'assets/img/posters/home-7.jpg',
    'home-inversiones.mp4': 'assets/img/posters/home-inversiones.jpg',
    'home-1.mp4'          : 'assets/img/posters/home-1.jpg',
    'home-2.mp4'          : 'assets/img/posters/home-2.jpg',
    'home-3.mp4'          : 'assets/img/posters/home-3.jpg',
    'home-4.mp4'          : 'assets/img/posters/home-4.jpg',
    'home-5.mp4'          : 'assets/img/posters/home-5.jpg',
    'home-6.mp4'          : 'assets/img/posters/home-6.jpg'
  };

  function getFilename(video) {
    var sources = video.querySelectorAll('source');
    for (var i = 0; i < sources.length; i++) {
      var s = sources[i].getAttribute('src') || '';
      if (s) return s.split('/').pop();
    }
    return '';
  }

  allVideos.forEach(function (v, idx) {
    // Redirigir fuentes a versiones comprimidas
    rewriteSources(v);

    // Asignar poster para mostrar imagen mientras carga
    var fname = getFilename(v);
    if (POSTER_MAP[fname]) {
      v.setAttribute('poster', POSTER_MAP[fname]);
    }

    // Configurar atributos base
    v.muted    = true;
    v.loop     = true;
    v.setAttribute('muted', '');
    v.setAttribute('playsinline', '');
    v.setAttribute('webkit-playsinline', '');
    v.setAttribute('x5-playsinline', '');

    if (idx === 0) {
      // Landing: cargar inmediatamente
      v.preload = 'auto';
      v.load();
      var p; try { p = v.play(); } catch(e) {}
      if (p && p.catch) p.catch(function () {
        setTimeout(function () { try { v.play(); } catch(e) {} }, 500);
      });
    } else {
      // Resto: preload="none" → solo cargan cuando su slide se activa
      v.preload = 'none';
      v.load(); // reset para cancelar cualquier carga iniciada antes
    }
  });

  // ── 2. Canvas no-op (scripts.js sigue llamando drawImage en móvil) ─────────
  var _origGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, opts) {
    var ctx = _origGetContext.call(this, type, opts);
    if (type === '2d' && ctx && !ctx._cesNoOp) {
      var el = this;
      while (el) {
        if (typeof el.className === 'string' &&
            el.className.indexOf('home-screen') > -1) {
          ctx._cesNoOp     = true;
          ctx.drawImage    = function () {};
          ctx.clearRect    = function () {};
          ctx.fillRect     = function () {};
          ctx.putImageData = function () {};
          break;
        }
        el = el.parentElement;
      }
    }
    return ctx;
  };

  // ── 3. Parche jQuery: activar video al slide, canplaythrough garantizado ───
  function patchJQuery() {
    var jq = window.jQuery || window.$;
    if (!jq || !jq.fn) { setTimeout(patchJQuery, 30); return; }
    if (jq.fn._cesV9) return;
    jq.fn._cesV9 = true;

    var _origOn = jq.fn.on;

    jq.fn.on = function (events) {
      if (typeof events === 'string') {

        // Bloquear scroll-hijack en páginas home/projects
        if (events.indexOf('DOMMouseScroll') > -1 ||
            events.indexOf('mousewheel')     > -1) {
          var el0 = this[0];
          if (el0 && (el0.id === 'home-page' || el0.id === 'projects-page')) {
            return this;
          }
        }

        // Interceptar canplaythrough para activar + garantizar el evento
        if (events.indexOf('canplaythrough') > -1) {
          var vid = this[0];
          if (vid && vid.tagName === 'VIDEO') {

            // Registrar el handler de scripts.js primero
            var ret = _origOn.apply(this, arguments);

            // Activar carga del video de este slide (si aún no cargó)
            if (vid.preload === 'none' || vid.readyState < 1) {
              vid.preload = 'auto';
              try { vid.load(); } catch(e) {}
            }

            // Intentar reproducir
            var tryPlay = function() {
              var p; try { p = vid.play(); } catch(e) {}
              if (p && p.catch) p.catch(function () {
                setTimeout(function () { try { vid.play(); } catch(e) {} }, 300);
              });
            };
            tryPlay();

            // Fallback garantizado: disparar canplaythrough según readyState
            var rs = vid.readyState;
            var delay = rs >= 4 ? 0
                      : rs >= 3 ? 150
                      : rs >= 2 ? 400
                      : rs >= 1 ? 800
                      : 1800;   // peor caso: video recién empieza a bajar

            var fired = false;

            // Si llega el evento nativo antes del timeout, cancelar fallback
            var onNative = function () {
              fired = true;
              vid.removeEventListener('canplaythrough', onNative);
            };
            vid.addEventListener('canplaythrough', onNative);

            // loadeddata también es suficiente para avanzar la timeline
            var onLoaded = function () {
              vid.removeEventListener('loadeddata', onLoaded);
              if (!fired) {
                fired = true;
                vid.removeEventListener('canplaythrough', onNative);
                try { vid.dispatchEvent(new Event('canplaythrough')); } catch(e) {}
              }
            };
            vid.addEventListener('loadeddata', onLoaded);

            // Timeout duro garantizado
            setTimeout(function () {
              vid.removeEventListener('loadeddata', onLoaded);
              if (!fired) {
                fired = true;
                vid.removeEventListener('canplaythrough', onNative);
                try { vid.dispatchEvent(new Event('canplaythrough')); } catch(e) {}
              }
            }, delay);

            return ret;
          }
        }
      }
      return _origOn.apply(this, arguments);
    };
  }

  // ── 4. NAV: desbloquear scroll cuando el menú está abierto ────────────────
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

  // ── 5. Reload en cambio de orientación mobile ↔ desktop ──────────────────
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

})();
