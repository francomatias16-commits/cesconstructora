/**
 * CES Construcciones - Responsive Mobile Detection Fix
 * El sitio original hardcodea isMobile: false en todos los HTML.
 * Este script corrige la detección antes de que el JS principal corra.
 *
 * Breakpoint unificado: < 1024px = mobile/tablet (coincide con responsive.css y mobile-patch.js)
 */
(function() {
  'use strict';

  function detectDevice() {
    var w = window.innerWidth;
    var ua = navigator.userAgent || '';
    var isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);

    // Breakpoint unificado con el CSS: todo < 1024px recibe tratamiento mobile/tablet
    var isTabletWidth = w >= 768 && w < 1024;
    var isMobileWidth = w < 768;

    // Inicializar app object si no existe
    window.app = window.app || {};

    if (isMobileWidth) {
      // Teléfonos: < 768px
      window.app.isMobile = true;
      window.app.isTablet = false;
      document.documentElement.classList.remove('desktop', 'tablet');
      document.documentElement.classList.add('mobile');
    } else if (isTabletWidth || (isMobileUA && w < 1024)) {
      // Tablets y móviles en landscape: 768px–1023px
      // En dispositivos touch < 1024px también tratamos como mobile
      // para que el scroll-hijack del home no se active
      window.app.isMobile = true;
      window.app.isTablet = true;
      document.documentElement.classList.remove('desktop', 'mobile');
      document.documentElement.classList.add('tablet');
    } else {
      // Desktop: >= 1024px
      window.app.isMobile = false;
      window.app.isTablet = false;
      document.documentElement.classList.remove('mobile', 'tablet');
      document.documentElement.classList.add('desktop');
    }
  }

  // Ejecutar detección inmediatamente (antes que cualquier otro script)
  detectDevice();

  // Re-ejecutar en resize
  var resizeTimer;
  window.addEventListener('resize', function() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(detectDevice, 150);
  });

  // Fix: reemplazar user-scalable=no para permitir zoom en iOS
  var viewportMeta = document.querySelector('meta[name="viewport"]');
  if (viewportMeta && window.innerWidth < 1024) {
    viewportMeta.setAttribute(
      'content',
      'width=device-width, initial-scale=1.0, minimum-scale=1.0'
    );
  }

})();
