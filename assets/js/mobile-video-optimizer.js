/**
 * CES — Mobile Video Optimizer v6.1
 * Fix: cuando no hay source mobile, usa desktop src como fallback
 */
(function () {
  'use strict';

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

  /* ─── 3. Gestión de videos ─────────────────────────────────────────────── */
  var activeVideo  = null;
  var videoDataMap = [];
  var initialized  = false;

  // FIX v6.1: si no hay source mobile, usa desktop (o data guardada en _cesDesktop)
  function getMobileSrc(video) {
    // Primero intentar desde atributo guardado
    if (video._cesMobile) return video._cesMobile;
    if (video._cesDesktop) return video._cesDesktop;
    // Fallback: src directo del elemento
    if (video.src) return video.src;
    var sources = video.querySelectorAll('source');
    if (sources.length > 0) return sources[0].getAttribute('src');
    return null;
  }

  function getDesktopSrc(video) {
    if (video._cesDesktop) return video._cesDesktop;
    if (video.src) return video.src;
    var sources = video.querySelectorAll('source');
    if (sources.length > 0) return sources[sources.length - 1].getAttribute('src');
    return null;
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

    var src = getMobileSrc(video);
    if (!src) return;

    if (video.currentSrc && video.currentSrc.indexOf(src) > -1 && video.readyState >= 2) {
      tryPlay(video);
      return;
    }

    video.src = src;
    video.load();
    tryPlay(video);

    var fallbackId = setTimeout(function () {
      if (video._cesActive) {
        tryPlay(video);
        try { video.dispatchEvent(new Event('canplaythrough')); } catch (e) {}
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

  /* ─── 4. Congelar todos los videos al inicio ────────────────────────────── */
  function freezeAllVideos() {
    var videos = document.querySelectorAll(
      '.home-screen__step-1__bg__video, #home-landing__bg__video'
    );
    for (var i = 0; i < videos.length; i++) {
      var v = videos[i];
      // Guardar srcs ANTES de borrar los source hijos
      var sources = v.querySelectorAll('source');
      // Buscar mobile src
      var mobileSrc = null, desktopSrc = null;
      for (var s = 0; s < sources.length; s++) {
        var media = sources[s].getAttribute('media') || '';
        if (media.indexOf('max-width') > -1) {
          mobileSrc = sources[s].getAttribute('src');
        } else {
          desktopSrc = sources[s].getAttribute('src');
        }
      }
      // Si no hay mobile, usar desktop
      v._cesMobile  = mobileSrc || desktopSrc || v.src || null;
      v._cesDesktop = desktopSrc || mobileSrc || v.src || null;

      v.removeAttribute('src');
      v.preload = 'none';
      for (var j = 0; j < sources.length; j++) {
        sources[j].parentNode.removeChild(sources[j]);
      }
      v.load();
      videoDataMap.push(v);
    }
  }

  /* ─── 5. Detectar cambio de slide activo ────────────────────────────────── */
  function watchSlides() {
    if (!window.MutationObserver) return;

    var observer = new MutationObserver(function (mutations) {
      for (var m = 0; m < mutations.length; m++) {
        var mut = mutations[m];
        if (mut.attributeName !== 'style') continue;
        var el = mut.target;
        var vis = el.style.visibility;
        if (vis === 'inherit' || vis === '') {
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

  /* ─── 6. Patch jQuery canplaythrough ────────────────────────────────────── */
  // Este patch lo maneja mobile-patch.js que corre después de scripts.js.
  // No parchear aquí para evitar conflictos de doble-patch.
  function patchjQuery() {
    // deshabilitado — mobile-patch.js lo maneja
  }

  /* ─── 7. Init ───────────────────────────────────────────────────────────── */
  function init() {
    if (initialized) return;
    initialized = true;
    freezeAllVideos();
    watchSlides();
    patchjQuery();
    var landing = document.getElementById('home-landing__bg__video');
    if (landing) activateVideo(landing);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
