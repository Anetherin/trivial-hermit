/* Tavern-lite loader.
   Injects the stylesheet and page markup, loads the editable texts (data/*.json), then the scripts in order.
   Used by the Perchance shim (perchance/panel.html) and by index.html.
   Scripts are classic (non-module) scripts sharing globals, so ORDER MATTERS. */
(function () {
  'use strict';
  var me = document.currentScript;
  var BASE = me ? me.src.replace(/loader\.js(\?.*)?$/, '') : './';
  var V = (me && (me.src.match(/[?&]v=([^&]+)/) || [])[1]) || String(Date.now());

  var FILES = [
    'js/core.js',
    'js/gemini.js',
    'js/prompt.js',
    'js/tags.js',
    'js/images.js',
    'js/chat.js',
    'js/render.js',
    'js/lantern.js',
    'js/main.js'
  ];
  window.TH_FILES = FILES;
  /* Editable data, loaded before any script runs. Each becomes window.TH_DATA['<name>']. */
  var DATA_FILES = ['prompts'];
  window.TH_DATA_FILES = DATA_FILES;

  var link = document.createElement('link');
  link.rel = 'stylesheet'; link.href = BASE + 'css/style.css?v=' + V;
  document.head.appendChild(link);

  function fail(msg) {
    var box = document.getElementById('status') || document.body;
    box.insertAdjacentHTML('beforeend', '<p style="padding:20px;color:#e86b84">' + msg + '</p>');
  }
  function get(path, json) {
    return fetch(BASE + path + '?v=' + V).then(function (r) {
      if (!r.ok) throw new Error(path + ': HTTP ' + r.status);
      return json ? r.json().catch(function (e) { throw new Error(path + ' is not valid JSON (' + e.message + '). Check for a missing comma or quote.'); }) : r.text();
    });
  }

  window.TH_DATA = window.TH_DATA || {};
  var jobs = DATA_FILES.map(function (n) {
    if (window.TH_DATA[n]) return null;            /* already inlined (single-file build) */
    return get('data/' + n + '.json', true).then(function (d) { window.TH_DATA[n] = d; });
  });
  if (!document.getElementById('app')) jobs.push(get('markup.html').then(function (html) { document.body.insertAdjacentHTML('beforeend', html); }));

  Promise.all(jobs).then(function () {
    FILES.forEach(function (f) {
      var s = document.createElement('script');
      s.src = BASE + f + '?v=' + V;
      s.async = false;                            /* keep execution order */
      s.onerror = function () { fail('Couldn\'t load ' + f + ' from ' + BASE + '. Is GitHub Pages enabled for the repo?'); };
      document.body.appendChild(s);
    });
  }, function (e) { fail('Couldn\'t load ' + e.message + ' Is GitHub Pages enabled for the repo?'); });
})();
