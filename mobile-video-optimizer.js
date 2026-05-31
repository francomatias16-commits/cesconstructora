/**
 * CES Construcciones — Mobile Video Optimizer v2.0
 *
 * Solución definitiva para el home en celular:
 * - Detecta mobile con el mismo breakpoint que el resto del sistema (1024px)
 * - NO elimina los <source> (eso rompía el sistema de canplaythrough de mobile-patch.js)
 * - NO interfiere con el canvas render loop de scripts.js
 * - Solo activa el video del slide visible y pausa los demás
 * - Usa poster como fallback garantizado si el video no puede reproducirse
 */
(function () {
  'use strict';

  // ── Breakpoint unificado con responsive-init.js y mobile-patch.js ────────────
  var isMobile = window.innerWidth < 1024
    || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  if (!isMobile) return;

  // ── PATCH 1: Ocultar canvas, mostrar video directamente ──────────────────────
  // En mobile el canvas 2D es lento; mostramos el <video> directo
  var style = document.createElement('style');
  style.textContent =
    '.home-screen__step-1__bg__canvas { display: none !important; }\n' +
    '.home-screen__step-1__bg__video {\n' +
    '  visibility: visible !important;\n' +
    '  display: block !important;\n' +
    '  position: absolute !important;\n' +
    '  top: 0 !important; left: 0 !important;\n' +
    '  width: 100% !important; height: 100% !important;\n' +
    '  object-fit: cover !important;\n' +
    '  z-index: 2 !important;\n' +
    '}\n';
  (document.head || document.documentElement).appendChild(style);

  // ── PATCH 2: Gestión de videos por slide ─────────────────────────────────────
  // NO tocamos los <source> — mobile-patch.js los necesita intactos
  // Solo nos encargamos de play/pause según visibilidad

  var activeVideo = null;

  function prepareVideo(v) {
    if (!v) return;
    v.muted = true;
    v.setAttribute('muted', '');
    v.setAttribute('playsinline', '');
    v.setAttribute('webkit-playsinline', '');
    v.preload = 'auto';
    // Asegurar que el <video> tenga src seleccionado del <source> correcto
    // El navegador ya lo hace, pero forzamos si está vacío
    if (!v.src && !v.currentSrc) {
      var sources = v.querySelectorAll('source');
      var chosen = null;
      // Preferir fuente mobile (max-width)
      for (var i = 0; i < sources.length; i++) {
        var media = sources[i].getAttribute('media') || '';
        if (media.indexOf('max-width') > -1) { chosen = sources[i]; break; }
      }
      if (!chosen && sources.length) chosen = sources[0];
      if (chosen) { v.src = chosen.getAttribute('src'); }
    }
  }

  function activateVideo(v) {
    if (!v) return;
    if (v === activeVideo) {
      // Ya activo: solo asegurar que esté reproduciendo
      if (v.paused) { v.play().catch(function () {}); }
      return;
    }
    // Pausar el anterior
    if (activeVideo && activeVideo !== v) {
      try { activeVideo.pause(); } catch (e) {}
    }
    activeVideo = v;
    prepareVideo(v);
    if (v.readyState >= 3) {
      v.play().catch(function () {});
    } else {
      v.addEventListener('canplay', function oncp() {
        v.removeEventListener('canplay', oncp);
        v.play().catch(function () {});
      });
    }
  }

  // ── PATCH 3: Observar cambios de visibilidad para activar el video correcto ──
  function setupObserver() {
    if (!window.MutationObserver) return;

    var observer = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var m = mutations[i];
        if (m.attributeName !== 'style' && m.attributeName !== 'class') continue;
        var el = m.target;
        // Buscar si este elemento o un ancestor es un home-screen visible
        var vis = el.style.visibility;
        var isVisible = (vis === 'inherit' || vis === '' || vis === 'visible');
        if (isVisible) {
          var video = el.querySelector('video');
          if (video) { activateVideo(video); }
        }
      }
    });

    // Observar los home-screen y home-landing
    var targets = document.querySelectorAll(
      '.home-screen, .home-screen__step, #home-landing'
    );
    for (var i = 0; i < targets.length; i++) {
      observer.observe(targets[i], {
        attributes: true,
        subtree: true,
        attributeFilter: ['style', 'class']
      });
    }
  }

  // ── PATCH 4: Preparar todos los videos con atributos mobile ─────────────────
  // (pero sin quitar sources — eso lo hace scripts.js / mobile-patch.js)
  function prepareAllVideos() {
    var videos = document.querySelectorAll('video');
    for (var i = 0; i < videos.length; i++) {
      var v = videos[i];
      v.muted = true;
      v.setAttribute('muted', '');
      v.setAttribute('playsinline', '');
      v.setAttribute('webkit-playsinline', '');
    }
  }

  function init() {
    prepareAllVideos();
    setupObserver();

    // Activar el landing video inmediatamente
    var landing = document.getElementById('home-landing__bg__video');
    if (landing) { activateVideo(landing); }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
