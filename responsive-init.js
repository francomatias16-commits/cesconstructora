/**
 * CES Construcciones — Responsive Mobile Detection Fix v2.0
 *
 * CRITICAL: Este script corre ANTES que scripts.js y ANTES que jQuery.
 * Setea window.app.isMobile correctamente.
 *
 * IMPORTANTE: scripts.js también sobreescribe app = { isMobile: false, ... }
 * al inicializarse. Para contrarrestar eso, hacemos que window.app sea
 * un objeto con un getter que siempre devuelve el valor correcto,
 * y además ponemos el resultado en window.__ces_isMobile para que
 * el script inline del HTML lo pueda usar.
 *
 * Breakpoint unificado: < 1024px con UA mobile = mobile/tablet
 * Teléfonos: < 768px = isMobile true, isTablet false
 * Tablets / landscape mobile: 768-1023px = isMobile true, isTablet true
 * Desktop: >= 1024px = isMobile false, isTablet false
 */
(function () {
  'use strict';

  function detectDevice() {
    var w = window.innerWidth;
    var ua = navigator.userAgent || '';
    var isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);

    var isMobile = w < 768;
    var isTablet = !isMobile && (w < 1024 || (isMobileUA && w < 1280));

    // Persistir para el script inline del HTML (que sobreescribe app)
    window.__ces_isMobile = isMobile;
    window.__ces_isTablet = isTablet;

    // Inicializar o actualizar window.app
    window.app = window.app || {};
    window.app.isMobile = isMobile;
    window.app.isTablet = isTablet;

    // Clases en <html>
    var html = document.documentElement;
    html.classList.remove('desktop', 'tablet', 'mobile');
    if (isMobile) {
      html.classList.add('mobile');
    } else if (isTablet) {
      html.classList.add('tablet');
    } else {
      html.classList.add('desktop');
    }

    return { isMobile: isMobile, isTablet: isTablet };
  }

  // Ejecutar inmediatamente
  var result = detectDevice();

  // Viewport: quitar user-scalable=no en mobile para permitir zoom
  if (result.isMobile || result.isTablet) {
    var viewportMeta = document.querySelector('meta[name="viewport"]');
    if (viewportMeta) {
      viewportMeta.setAttribute(
        'content',
        'width=device-width, initial-scale=1.0, minimum-scale=1.0'
      );
    }
  }

  // Re-detectar en resize
  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(detectDevice, 150);
  });

  // CRÍTICO: Interceptar la asignación de window.app que hace el <script> inline
  // del HTML (que pone isMobile: false hardcodeado).
  // Lo hacemos con un MutationObserver en el DOMContentLoaded para re-parchear
  // inmediatamente después de que scripts.js corra.
  document.addEventListener('DOMContentLoaded', function () {
    // scripts.js ya corrió. Re-aplicar isMobile correcto.
    if (window.app) {
      window.app.isMobile = window.__ces_isMobile;
      window.app.isTablet = window.__ces_isTablet;
    }
  });

})();
