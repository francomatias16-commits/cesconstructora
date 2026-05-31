/**
 * CES — Mobile Video Optimizer v6.0
 *
 * Problema raíz:
 * En iOS/Android, el browser no puede bufferear 9 videos simultaneamente.
 * El último slide (home-6.mp4) se congela porque:
 *   1. El browser agotó los recursos de video
 *   2. 'canplaythrough' nunca se dispara sin gesto del usuario
 *   3. El canvas de transición intenta hacer drawImage() a 60fps
 *
 * Esta solución:
 *   - En móvil: reemplaza completamente los videos por sus posters (imagen estática)
 *     EXCEPTO el video de la diapositiva activa
 *   - Intercepta canvas drawImage para evitar el loop de 60fps
 *   - Maneja la transición entre slides activando/desactivando videos on-demand
 *   - Garantiza que canplaythrough siempre se despache (fallback 800ms)
 */
(function () {
  'use strict';

  // Detectar móvil por ancho O user-agent
  var isMobile =
    window.matchMedia('(max-width: 1023px)').matches ||
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  if (!isMobile) return;

  /* ─── 1. Neutralizar canvas drawImage dentro de slides ─────────────────── */
  var patchedCtx = new WeakSet();
  var origGetContext = HTMLCanvasElement.prototype.getContext;

  HTMLCanvasElement.prototype.getContext = function (type, opts) {
    var ctx = origGetContext.call(this, type, opts);
    if (type === '2d' && ctx && !patchedCtx.has(ctx)) {
      var el = this;
      while (el) {
        if (
          el.className &&
          typeof el.className === 'string' &&
          (el.className.indexOf('home-screen') > -1 ||
            el.className.indexOf('home-landing') > -1)
        ) {
          patchedCtx.add(ctx);
          ctx.drawImage  = function () {};
          ctx.clearRect  = function () {};
          ctx.fillRect   = function () {};
          ctx.fillStyle  = '';
          break;
        }
        el = el.parentElement;
      }
    }
    return ctx;
  };

  /* ─── 2. CSS: ocultar canvas, mostrar video directamente ───────────────── */
  var style = document.createElement('style');
  style.textContent =
    '.home-screen__step-1__bg__canvas{display:none!important}' +
    '.home-screen__step-1__bg__video{' +
      'visibility:visible!important;' +
      'position:absolute!important;' +
      'top:0!important;left:0!important;' +
      'width:100%!important;height:100%!important;' +
      'object-fit:cover!important;' +
      'z-index:2!important' +
    '}';
  (document.head || document.documentElement).appendChild(style);

  /* ─── 3. Gestión de videos: solo uno activo a la vez ───────────────────── */
  var activeVideo   = null;
  var videoDataMap  = [];   // [{video, mobileSrc, desktopSrc, loaded}]
  var initialized   = false;

  function getMobileSrc(video) {
    var sources = video.querySelectorAll('source');
    for (var i = 0; i < sources.length; i++) {
      var media = sources[i].getAttribute('media') || '';
      if (media.indexOf('max-width') > -1) {
        return sources[i].getAttribute('src');
      }
    }
    return sources[0] ? sources[0].getAttribute('src') : null;
  }

  function getDesktopSrc(video) {
    var sources = video.querySelectorAll('source');
    for (var i = sources.length - 1; i >= 0; i--) {
      var media = sources[i].getAttribute('media') || '';
      if (media.indexOf('max-width') === -1) {
        return sources[i].getAttribute('src');
      }
    }
    return sources[sources.length - 1]
      ? sources[sources.length - 1].getAttribute('src')
      : null;
  }

  function deactivateVideo(video) {
    if (!video) return;
    try { video.pause(); } catch (e) {}
    video.removeAttribute('src');
    video.load();
    video._cesActive = false;
  }

  function activateVideo(video) {
    if (!video) return;
    if (activeVideo && activeVideo !== video) {
      deactivateVideo(activeVideo);
    }
    activeVideo = video;

    video.muted = true;
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.loop = true;
    video.preload = 'auto';
    video._cesActive = true;

    // Obtener src móvil
    var src = getMobileSrc(video) || getDesktopSrc(video);
    if (!src) return;

    // Solo recargar si el src cambió
    if (video.currentSrc && video.currentSrc.indexOf(src) > -1 && video.readyState >= 2) {
      tryPlay(video);
      return;
    }

    video.src = src;
    video.load();

    tryPlay(video);

    // Fallback: si canplaythrough no llega en 800ms, despacharlo manualmente
    var fallbackId = setTimeout(function () {
      if (video._cesActive) {
        tryPlay(video);
        try {
          video.dispatchEvent(new Event('canplaythrough'));
        } catch (e) {}
      }
    }, 800);

    video.addEventListener('canplay', function onCp() {
      clearTimeout(fallbackId);
      video.removeEventListener('canplay', onCp);
      tryPlay(video);
    });
  }

  function tryPlay(video) {
    if (!video._cesActive) return;
    var p = video.play();
    if (p && p.catch) { p.catch(function () {}); }
  }

  /* ─── 4. Congelar todos los videos al inicio (sin src) ─────────────────── */
  function freezeAllVideos() {
    var videos = document.querySelectorAll(
      '.home-screen__step-1__bg__video, #home-landing__bg__video'
    );
    for (var i = 0; i < videos.length; i++) {
      var v = videos[i];
      v._cesMobile  = getMobileSrc(v);
      v._cesDesktop = getDesktopSrc(v);
      v.removeAttribute('src');
      v.preload = 'none';
      // Eliminar <source> hijos para que el browser no auto-cargue
      var sources = v.querySelectorAll('source');
      for (var j = 0; j < sources.length; j++) {
        sources[j].parentNode.removeChild(sources[j]);
      }
      v.load();
      videoDataMap.push(v);
    }
  }

  /* ─── 5. Detectar cambio de slide activo con MutationObserver ──────────── */
  function watchSlides() {
    if (!window.MutationObserver) return;

    var observer = new MutationObserver(function (mutations) {
      for (var m = 0; m < mutations.length; m++) {
        var mut = mutations[m];
        if (mut.attributeName !== 'style') continue;
        var el = mut.target;

        // El slide se muestra cuando visibility = 'inherit' o ''
        var vis = el.style.visibility;
        if (vis === 'inherit' || vis === '') {
          // Buscar video dentro de este elemento
          var video =
            el.querySelector('.home-screen__step-1__bg__video') ||
            el.querySelector('#home-landing__bg__video');
          if (video) {
            activateVideo(video);
            return;
          }
        }
      }
    });

    // Observar todos los contenedores de slide
    var targets = document.querySelectorAll(
      '.home-screen, .home-screen__step, #home-landing, #home-landing__bg'
    );
    for (var i = 0; i < targets.length; i++) {
      observer.observe(targets[i], {
        attributes: true,
        subtree: true,
        attributeFilter: ['style'],
      });
    }
  }

  /* ─── 6. Interceptar canplaythrough de jQuery (para scripts.js) ─────────── */
  function patchjQuery() {
    if (!window.jQuery && !window.$) {
      setTimeout(patchjQuery, 100);
      return;
    }
    var $ = window.jQuery || window.$;
    if (!$ || !$.fn) return;

    var _originalOn = $.fn.on;
    $.fn.on = function (events) {
      if (typeof events === 'string' && events.indexOf('canplaythrough') > -1) {
        var vidEl = this[0];
        if (vidEl && vidEl.tagName === 'VIDEO' && !vidEl._cesPatchedCpt) {
          vidEl._cesPatchedCpt = true;

          // Registrar el listener real
          var result = _originalOn.apply(this, arguments);

          // Preparar para móvil
          vidEl.muted = true;
          vidEl.setAttribute('muted', '');
          vidEl.setAttribute('playsinline', '');
          vidEl.setAttribute('webkit-playsinline', '');

          // Fallback garantizado para scripts.js
          var fired = false;
          vidEl.addEventListener('canplaythrough', function onRealCpt() {
            fired = true;
            vidEl.removeEventListener('canplaythrough', onRealCpt);
          });

          setTimeout(function () {
            if (!fired && vidEl._cesActive !== false) {
              fired = true;
              try {
                vidEl.dispatchEvent(new Event('canplaythrough'));
              } catch (e) {}
            }
          }, 1200);

          return result;
        }
      }
      return _originalOn.apply(this, arguments);
    };
  }

  /* ─── 7. Init ───────────────────────────────────────────────────────────── */
  function init() {
    if (initialized) return;
    initialized = true;

    freezeAllVideos();
    watchSlides();
    patchjQuery();

    // Activar el video landing inmediatamente
    var landing = document.getElementById('home-landing__bg__video');
    if (landing) {
      activateVideo(landing);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
