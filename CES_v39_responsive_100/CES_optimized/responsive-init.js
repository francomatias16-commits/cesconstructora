/**
 * CES Construcciones - Responsive Mobile Detection v2.0
 * Corrige la detección de dispositivo ANTES de que scripts.js corra.
 * Breakpoint unificado: < 1024px = mobile/tablet
 */
(function () {
  'use strict';

  function detectDevice() {
    var w   = window.innerWidth;
    var ua  = navigator.userAgent || '';
    var isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    var isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);

    window.app = window.app || {};

    if (w < 768) {
      window.app.isMobile  = true;
      window.app.isTablet  = false;
      document.documentElement.classList.remove('desktop', 'tablet');
      document.documentElement.classList.add('mobile');
    } else if (w < 1024 || (isMobileUA && w < 1024)) {
      window.app.isMobile  = true;
      window.app.isTablet  = true;
      document.documentElement.classList.remove('desktop', 'mobile');
      document.documentElement.classList.add('tablet');
    } else {
      window.app.isMobile  = false;
      window.app.isTablet  = false;
      document.documentElement.classList.remove('mobile', 'tablet');
      document.documentElement.classList.add('desktop');
    }

    /* Allow zoom on mobile (replaces user-scalable=no) */
    var vp = document.querySelector('meta[name="viewport"]');
    if (vp) {
      if (w < 1024) {
        vp.setAttribute('content',
          'width=device-width, initial-scale=1.0, minimum-scale=1.0');
      } else {
        vp.setAttribute('content',
          'width=device-width, initial-scale=1.0');
      }
    }
  }

  detectDevice();

  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(detectDevice, 150);
  });

})();
