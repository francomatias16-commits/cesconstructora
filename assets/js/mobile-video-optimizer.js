/**
 * CES — Mobile Video Optimizer v7.0
 *
 * Solución unificada. Reemplaza mobile-patch.js y mobile-video-optimizer.js anteriores.
 *
 * Problemas que resuelve:
 * 1. Canvas drawImage falla silenciosamente en iOS/Android → se bypasea.
 * 2. `canplaythrough` no se dispara en mobile sin gesto del usuario → fallback garantizado.
 * 3. Dos patches paralelos (mobile-patch + mobile-optimizer) con condiciones de carrera → un solo patch.
 * 4. Scroll-hijack en home/projects bloqueado antes de que scripts.js lo registre.
 * 5. Reload automático en cambio de orientación mobile↔desktop.
 */
(function () {
  'use strict';

  /* ─── Detección mobile ──────────────────────────────────────────────────── */
  var isMobile =
    window.matchMedia('(max-width: 1023px)').matches ||
    /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  if (!isMobile) return;

  /* ─── 1. Neutralizar canvas drawImage dentro de slides ──────────────────── */
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

  /* ─── 2. CSS: ocultar canvas, mostrar video directamente ────────────────── */
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

  /* ─── 3. Gestión de videos ──────────────────────────────────────────────── */
  var activeVideo  = null;
  var videoDataMap = [];
  var initialized  = false;

  function getMobileSrc(video) {
    if (video._cesMobile)  return video._cesMobile;
    if (video._cesDesktop) return video._cesDesktop;
    if (video.src)         return video.src;
    var sources = video.querySelectorAll('source');
    if (sources.length > 0) return sources[0].getAttribute('src');
    return null;
  }

  function deactivateVideo(video) {
    if (!video) return;
    try { video.pause(); } catch (e) {}
    video.removeAttribute('src');
    video.load();
    video._cesActive = false;
  }

  function tryPlay(video) {
    if (!video._cesActive) return;
    var p = video.play();
    if (p && p.catch) { p.catch(function () {}); }
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
    video.loop    = true;
    video.preload = 'auto';
    video._cesActive = true;

    var src = getMobileSrc(video);
    if (!src) return;

    // Si ya tiene la misma src cargada, solo intentar play
    if (video.currentSrc && video.currentSrc.indexOf(src) > -1 && video.readyState >= 2) {
      tryPlay(video);
      return;
    }

    video.src = src;
    video.load();
    tryPlay(video);

    // Fallback doble: canplay (nativo) + timeout de seguridad (800ms)
    var fallbackId = setTimeout(function () {
      if (video._cesActive) {
        tryPlay(video);
        // Disparar canplaythrough para desbloquear el timeline de ScreenStep1
        try { video.dispatchEvent(new Event('canplaythrough')); } catch (e) {}
      }
    }, 800);

    video.addEventListener('canplay', function onCp() {
      clearTimeout(fallbackId);
      video.removeEventListener('canplay', onCp);
      tryPlay(video);
    }, { once: true });
  }

  /* ─── 4. Congelar todos los videos al inicio ────────────────────────────── */
  function freezeAllVideos() {
    var videos = document.querySelectorAll(
      '.home-screen__step-1__bg__video, #home-landing__bg__video'
    );
    for (var i = 0; i < videos.length; i++) {
      var v = videos[i];
      var sources = v.querySelectorAll('source');
      var mobileSrc = null, desktopSrc = null;
      for (var s = 0; s < sources.length; s++) {
        var media = sources[s].getAttribute('media') || '';
        if (media.indexOf('max-width') > -1) {
          mobileSrc = sources[s].getAttribute('src');
        } else {
          desktopSrc = sources[s].getAttribute('src');
        }
      }
      // Si no hay src mobile específica, usar desktop como fallback
      v._cesMobile  = mobileSrc  || desktopSrc || v.src || null;
      v._cesDesktop = desktopSrc || mobileSrc  || v.src || null;

      v.removeAttribute('src');
      v.preload = 'none';
      for (var j = sources.length - 1; j >= 0; j--) {
        sources[j].parentNode.removeChild(sources[j]);
      }
      v.load();
      videoDataMap.push(v);
    }
  }

  /* ─── 5. Detectar cambio de slide activo vía MutationObserver ───────────── */
  function watchSlides() {
    if (!window.MutationObserver) return;

    var observer = new MutationObserver(function (mutations) {
      for (var m = 0; m < mutations.length; m++) {
        var mut = mutations[m];
        if (mut.attributeName !== 'style') continue;
        var el  = mut.target;
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
        attributeFilter: ['style']
      });
    }
  }

  /* ─── 6. Patch jQuery $.fn.on — UN SOLO PATCH UNIFICADO ─────────────────── */
  //
  // Intercepta tres cosas:
  //   a) Scroll-hijack en home/projects (antes lo hacía mobile-patch.js + el inline del HTML)
  //   b) canplaythrough: registra el handler real + garantiza fallback de 900ms
  //   c) Nada más — no hay un segundo patch en mobile-patch.js
  //
  function patchjQuery() {
    if (!window.jQuery && !window.$) {
      setTimeout(patchjQuery, 100);
      return;
    }
    var $ = window.jQuery || window.$;
    if (!$ || !$.fn || $.fn._cesPatchApplied) return;
    $.fn._cesPatchApplied = true;

    var _originalOn = $.fn.on;

    $.fn.on = function (events) {
      if (typeof events === 'string') {

        // a) Bloquear scroll-hijack
        if (events.indexOf('DOMMouseScroll') !== -1 || events.indexOf('mousewheel') !== -1) {
          var el = this[0];
          if (el && (el.id === 'home-page' || el.id === 'projects-page')) {
            return this;
          }
        }

        // b) Interceptar canplaythrough en videos de home-screens
        //    scripts.js hace: this.video.one("canplaythrough", handler)
        //    jQuery .one() llama internamente a .on(), por eso lo capturamos aquí.
        if (events.indexOf('canplaythrough') !== -1) {
          var vidEl = this[0];
          if (vidEl && vidEl.tagName === 'VIDEO' && !vidEl._cesPatchedCpt) {
            vidEl._cesPatchedCpt = true;

            // Registrar el handler real de scripts.js
            var result = _originalOn.apply(this, arguments);

            // Asegurar atributos mobile
            vidEl.muted = true;
            vidEl.setAttribute('muted', '');
            vidEl.setAttribute('playsinline', '');
            vidEl.setAttribute('webkit-playsinline', '');

            // Marcar si el evento nativo ya se disparó
            var nativeFired = false;
            vidEl.addEventListener('canplaythrough', function onNativeCpt() {
              nativeFired = true;
              vidEl.removeEventListener('canplaythrough', onNativeCpt);
            });

            // Fallback garantizado: despachar canplaythrough a los 900ms
            // si el evento nativo no llegó (comportamiento normal en iOS/Android)
            setTimeout(function () {
              if (!nativeFired && vidEl._cesActive !== false) {
                nativeFired = true;
                try { vidEl.dispatchEvent(new Event('canplaythrough')); } catch (e) {}
              }
            }, 900);

            return result;
          }
        }
      }

      return _originalOn.apply(this, arguments);
    };
  }

  /* ─── 7. Bloquear scroll-hijack ANTES de que jQuery esté disponible ──────── */
  //    (por si mobile-video-optimizer.js carga antes que jquery)
  //    El inline en index.html ya lo hace con jQuery si está disponible.
  //    Aquí lo hacemos también de forma nativa para mayor seguridad.
  function blockNativeScroll() {
    var homeOrProjects = document.getElementById('home-page') ||
                         document.getElementById('projects-page');
    if (!homeOrProjects) return;
    homeOrProjects.addEventListener('wheel',          function (e) { e.preventDefault(); }, { passive: false });
    homeOrProjects.addEventListener('DOMMouseScroll', function (e) { e.preventDefault(); }, { passive: false });
  }

  /* ─── 8. Reload en cambio de orientación mobile↔desktop ─────────────────── */
  var MOBILE_BP = 1024;
  var wasMobile = window.innerWidth < MOBILE_BP;

  function setupOrientationReload() {
    var resizeTimer;
    window.addEventListener('resize', function () {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        var isMobileNow = window.innerWidth < MOBILE_BP;
        if (wasMobile !== isMobileNow) window.location.reload();
        wasMobile = isMobileNow;
      }, 300);
    });
  }

  /* ─── 9. MutationObserver para nav (overflow del body) ──────────────────── */
  function watchNav() {
    if (!window.MutationObserver) return;
    new MutationObserver(function () {
      if (document.body.style.overflow === 'hidden' || document.body.style.overflowY === 'hidden') {
        var navContent = document.querySelector('#nav__content');
        var navIsOpen  = navContent && navContent.style.visibility === 'inherit';
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

  /* ─── 10. Init ───────────────────────────────────────────────────────────── */
  function init() {
    if (initialized) return;
    initialized = true;

    freezeAllVideos();
    watchSlides();
    patchjQuery();
    blockNativeScroll();
    watchNav();
    setupOrientationReload();

    // Activar el primer video visible (home-landing si existe)
    var landing = document.getElementById('home-landing__bg__video');
    if (landing) activateVideo(landing);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
