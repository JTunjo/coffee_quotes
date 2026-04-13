// ============================================================
//  api.js — Comunicación con Google Apps Script via JSONP
// ============================================================

const API_URL = 'https://script.google.com/macros/s/AKfycbyUHB3tPy8y0qZVrgKRxwSoHgsY5E8NUAZ3ieZPAIc6HgKUi7oYngGhHn4IBgnm3snEMg/exec';

let _cbCounter = 0;

function jsonp(params) {
  return new Promise(function(resolve, reject) {
    var cbName = '_gcb' + Date.now() + '_' + (_cbCounter++);
    params.callback = cbName;

    var qs     = new URLSearchParams(params).toString();
    var script = document.createElement('script');
    script.src = API_URL + '?' + qs;

    var timer = setTimeout(function() {
      cleanup();
      reject(new Error('Timeout: el servidor no respondió'));
    }, 35000);

    function cleanup() {
      delete window[cbName];
      if (script.parentNode) script.parentNode.removeChild(script);
      clearTimeout(timer);
    }

    window[cbName] = function(data) { cleanup(); resolve(data); };
    script.onerror = function()     { cleanup(); reject(new Error('Error de red')); };
    document.head.appendChild(script);
  });
}

function apiGet(params) {
  return jsonp(params);
}

function apiPost(body) {
  return jsonp({
    _post: '1',
    data:  encodeURIComponent(JSON.stringify(body))
  });
}
