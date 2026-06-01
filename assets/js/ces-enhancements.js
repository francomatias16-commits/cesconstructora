(function () {
  'use strict';

  function initScrollEffects() {
    if (!('IntersectionObserver' in window)) return;

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          var el = entry.target;
          el.classList.remove('ces-scroll-in');
          void el.offsetWidth;
          el.classList.add('ces-scroll-in');
          observer.unobserve(el);
        }
      });
    }, { threshold: 0.18, rootMargin: '0px 0px -40px 0px' });

    var cards = document.querySelectorAll('.srv-card, .inv-ventaja');
    cards.forEach(function (el) {
      observer.observe(el);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initScrollEffects);
  } else {
    initScrollEffects();
  }
})();
