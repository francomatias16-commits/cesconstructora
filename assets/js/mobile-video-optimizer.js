(function() {
  'use strict';

  var isMobile = window.matchMedia('(max-width: 768px)').matches
    || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  if (!isMobile) return;

  // ── PATCH 1: Neutralize ALL canvas 2d contexts ─────────────────────────────
  // The JS renders video frames to canvas at 60fps during transitions.
  // On mobile this kills performance. We disable all drawImage calls on
  // canvases that are inside .home-screen elements.
  var patchedContexts = new WeakSet();

  var origGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function(type, opts) {
    var ctx = origGetContext.call(this, type, opts);
    if (type === '2d' && ctx && !patchedContexts.has(ctx)) {
      // Check if this canvas is inside a home-screen slide
      var el = this;
      var inSlide = false;
      while (el) {
        if (el.className && typeof el.className === 'string' &&
            (el.className.indexOf('home-screen') > -1 || el.className.indexOf('home-landing') > -1)) {
          inSlide = true;
          break;
        }
        el = el.parentElement;
      }
      if (inSlide) {
        patchedContexts.add(ctx);
        ctx.drawImage = function() {};
        ctx.clearRect = function() {};
        ctx.fillRect  = function() {};
        ctx.fillStyle = '';
      }
    }
    return ctx;
  };

  // ── PATCH 2: CSS — hide canvas, show video directly ────────────────────────
  var style = document.createElement('style');
  style.textContent =
    '.home-screen__step-1__bg__canvas { display: none !important; }\n' +
    '.home-screen__step-1__bg__video {\n' +
    '  visibility: visible !important;\n' +
    '  position: absolute !important;\n' +
    '  top: 0 !important; left: 0 !important;\n' +
    '  width: 100% !important; height: 100% !important;\n' +
    '  object-fit: cover !important;\n' +
    '  z-index: 2 !important;\n' +
    '}\n';
  // Inject immediately - before DOMContentLoaded if possible
  (document.head || document.documentElement).appendChild(style);

  // ── PATCH 3: Lazy video loading — only load active slide's video ────────────
  var loadedSrcs = {};
  var activeVideo = null;

  function getMobileSrc(v) {
    var sources = v.querySelectorAll('source');
    for (var i = 0; i < sources.length; i++) {
      if ((sources[i].getAttribute('media') || '').indexOf('max-width') > -1)
        return sources[i].getAttribute('src');
    }
    return sources[0] ? sources[0].getAttribute('src') : null;
  }

  function activateVideo(v) {
    if (!v || v === activeVideo) return;
    if (activeVideo && activeVideo !== v) {
      try { activeVideo.pause(); } catch(e) {}
    }
    activeVideo = v;
    v.muted = true;
    v.setAttribute('playsinline', '');
    v.setAttribute('webkit-playsinline', '');
    var src = getMobileSrc(v);
    if (src && !loadedSrcs[src]) {
      loadedSrcs[src] = true;
      v.src = src;
      v.load();
    }
    var tryPlay = function() {
      v.play().catch(function() {});
    };
    if (v.readyState >= 3) {
      tryPlay();
    } else {
      v.addEventListener('canplay', tryPlay, { once: true });
    }
  }

  // ── PATCH 4: Watch for active slide changes ─────────────────────────────────
  function setupObserver() {
    var observer = new MutationObserver(function(mutations) {
      for (var i = 0; i < mutations.length; i++) {
        var m = mutations[i];
        if (m.attributeName !== 'style') continue;
        var el = m.target;
        var vis = el.style.visibility;
        if (vis === 'inherit' || vis === '') {
          var video = el.querySelector('video');
          if (video) { activateVideo(video); return; }
        }
      }
    });
    var targets = document.querySelectorAll('.home-screen, .home-screen__step, #home-landing');
    for (var i = 0; i < targets.length; i++) {
      observer.observe(targets[i], { attributes: true, subtree: true, attributeFilter: ['style'] });
    }
  }

  // ── PATCH 5: Freeze inactive videos — remove src so browser doesn't buffer ──
  function freezeInactiveVideos() {
    var videos = document.querySelectorAll('video');
    for (var i = 0; i < videos.length; i++) {
      var v = videos[i];
      v.preload = 'none';
      // Remove <source> children so browser doesn't auto-load
      var sources = v.querySelectorAll('source');
      for (var j = 0; j < sources.length; j++) {
        v.dataset['src' + j] = sources[j].getAttribute('src');
        v.dataset['media' + j] = sources[j].getAttribute('media') || '';
        sources[j].parentNode.removeChild(sources[j]);
      }
      v.dataset.sourceCount = sources.length;
    }
  }

  function init() {
    freezeInactiveVideos();
    setupObserver();

    // Activate the landing video immediately
    var landing = document.getElementById('home-landing__bg__video');
    if (landing) activateVideo(landing);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
