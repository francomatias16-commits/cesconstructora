/**
 * CES Construcciones — Mobile Video Optimizer v10.0
 *
 * PROBLEMAS RESUELTOS:
 *
 * 1. `.home-screen__step-1__bg__video { visibility: hidden }` en main.css →
 *    Los videos del home estaban ocultos por defecto (canvas los renderiza
 *    en desktop). En móvil hay que hacerlos visibles y ocultar el canvas.
 *
 * 2. `.mobile #home-landing__bg { background-image: url(../img/home-landing.jpg) }`
 *    en main.css → La landing en móvil usa imagen estática, tapando el video.
 *    Lo anulamos para que el video se vea.
 *
 * 3. v9 no reinyectaba el CSS de visibilidad → slides en blanco.
 *
 * 4. Videos originales 4K (hasta 27 MB) → versiones comprimidas en
 *    assets/video/mobile/ (total 9.8 MB → carga fluida en 4G).
 */
(function () {
  'use strict';

  var isMobile =
    window.matchMedia('(max-width: 1023px)').matches ||
    /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  if (!isMobile) return;

  /* ── 1. CSS: corregir visibilidad de videos en móvil ─────────────────────
     main.css tiene visibility:hidden en los videos (canvas los renderiza en
     desktop). Aquí los hacemos visibles y ocultamos el canvas.
     También anulamos el background-image estático de la landing.         */
  var style = document.createElement('style');
  style.textContent = [

    /* Videos de home-screen paso 1: hacerlos visibles */
    '.home-screen__step-1__bg__video {',
    '  visibility: visible !important;',
    '  display:    block    !important;',
    '  position:   absolute !important;',
    '  top:  0 !important; left: 0 !important;',
    '  width: 100% !important; height: 100% !important;',
    '  object-fit: cover !important;',
    '  z-index: 3 !important;',
    '}',

    /* Canvas: ocultarlo (mostramos el <video> directamente) */
    '.home-screen__step-1__bg__canvas { display: none !important; }',

    /* Landing: anular imagen estática para que se vea el video */
    '.mobile #home-landing__bg {',
    '  background-image: none !important;',
    '}',
    '#home-landing__bg__video {',
    '  display:    block    !important;',
    '  visibility: visible  !important;',
    '  position:   absolute !important;',
    '  top:  0 !important; left: 0 !important;',
    '  width: 100% !important; height: 100% !important;',
    '  object-fit: cover !important;',
    '  z-index: 1 !important;',
    '}',

  ].join('\n');
  (document.head || document.documentElement).appendChild(style);

  /* ── 2. Redirigir fuentes a versiones mobile (9.8 MB total) ─────────────
     Los originales son 4K y pesan 102 MB. Las versiones comprimidas
     tienen misma calidad visual pero a 720–1280px: carga fluida en 4G.  */
  var MOBILE_DIR = 'assets/video/mobile/';

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
    /* Busca el src original (antes de reescribir) */
    var sources = video.querySelectorAll('source');
    for (var i = 0; i < sources.length; i++) {
      var s = sources[i].getAttribute('src') || '';
      if (s) return s.split('/').pop().replace('mobile/', '').split('/').pop();
    }
    var vs = video.getAttribute('src') || '';
    return vs.split('/').pop();
  }

  function rewriteAndPrepare(video, isFirst) {
    var fname = getFilename(video);

    /* Poster: imagen visible mientras el video carga */
    if (POSTER_MAP[fname]) {
      video.setAttribute('poster', POSTER_MAP[fname]);
    }

    /* Reescribir <source> a versión comprimida */
    var sources = video.querySelectorAll('source');
    sources.forEach(function (src) {
      var s = src.getAttribute('src') || '';
      if (s && s.indexOf('/mobile/') === -1) {
        var file = s.split('/').pop();
        src.setAttribute('src', MOBILE_DIR + file);
      }
      /* Quitar media queries de <source> para que el browser use el primero */
      src.removeAttribute('media');
    });

    /* Atributos de reproducción */
    video.muted    = true;
    video.loop     = true;
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.setAttribute('x5-playsinline', '');

    /* Todos con preload="auto": 9.8 MB total se descarga rápido en 4G */
    video.preload = 'auto';
    video.load();

    if (isFirst) {
      /* Primer video (landing): arrancar ya */
      _tryPlay(video);
    }
  }

  function _tryPlay(v) {
    var p; try { p = v.play(); } catch (e) {}
    if (p && p.catch) p.catch(function () {
      setTimeout(function () { try { v.play(); } catch (e) {} }, 400);
    });
  }

  /* Aplicar a landing + todos los step-1 */
  var landing = document.getElementById('home-landing__bg__video');
  if (landing) rewriteAndPrepare(landing, true);

  var stepVideos = document.querySelectorAll('.home-screen__step-1__bg__video');
  stepVideos.forEach(function (v) { rewriteAndPrepare(v, false); });

  /* ── 3. Canvas no-op (scripts.js sigue llamando drawImage) ──────────────
     Sin esto, scripts.js puede lanzar errores con canvas de dimensión 0
     que frezan el ticker de animación.                                    */
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

  /* ── 4. Parche jQuery: canplaythrough garantizado + scroll desbloqueado ──
     scripts.js espera canplaythrough para avanzar la timeline de animación.
     Como en móvil el video puede tardar en bufferizar, garantizamos el
     evento con un timeout adaptativo mientras intentamos reproducir.     */
  function patchJQuery() {
    var jq = window.jQuery || window.$;
    if (!jq || !jq.fn) { setTimeout(patchJQuery, 30); return; }
    if (jq.fn._cesV10) return;
    jq.fn._cesV10 = true;

    var _origOn = jq.fn.on;

    jq.fn.on = function (events) {
      if (typeof events === 'string') {

        /* Bloquear scroll-hijack: evita que scripts.js capture el scroll
           del usuario en home-page / projects-page en móvil             */
        if (events.indexOf('DOMMouseScroll') > -1 ||
            events.indexOf('mousewheel')     > -1) {
          var el0 = this[0];
          if (el0 && (el0.id === 'home-page' || el0.id === 'projects-page')) {
            return this;
          }
        }

        /* canplaythrough: registrar handler + garantizar disparo         */
        if (events.indexOf('canplaythrough') > -1) {
          var vid = this[0];
          if (vid && vid.tagName === 'VIDEO') {

            var ret = _origOn.apply(this, arguments);

            /* Asegurar que el video esté cargando */
            if (vid.readyState < 1) {
              vid.preload = 'auto';
              try { vid.load(); } catch (e) {}
            }

            /* Intentar reproducción */
            _tryPlay(vid);

            /* Timeout adaptativo según estado actual del buffer */
            var rs    = vid.readyState;
            var delay = rs >= 4 ? 0
                      : rs >= 3 ? 200
                      : rs >= 2 ? 500
                      : rs >= 1 ? 1000
                      : 2200;   /* readyState 0: video recién empieza a bajar */

            var fired = false;

            var onNative = function () {
              fired = true;
              vid.removeEventListener('canplaythrough', onNative);
            };
            vid.addEventListener('canplaythrough', onNative);

            /* loadeddata también es suficiente para avanzar */
            var onLoaded = function () {
              vid.removeEventListener('loadeddata', onLoaded);
              if (!fired) {
                fired = true;
                vid.removeEventListener('canplaythrough', onNative);
                try { vid.dispatchEvent(new Event('canplaythrough')); } catch (e) {}
              }
            };
            vid.addEventListener('loadeddata', onLoaded);

            /* Fallback duro: garantizado pase lo que pase */
            setTimeout(function () {
              vid.removeEventListener('loadeddata', onLoaded);
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

  /* ── 5. NAV: desbloquear overflow cuando el menú está abierto ───────────*/
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

  /* ── 6. Reload en cambio mobile ↔ desktop ───────────────────────────────*/
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

  /* ── Init ────────────────────────────────────────────────────────────────*/
  patchJQuery();

})();
