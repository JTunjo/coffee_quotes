// ============================================================
//  ui.js — Componentes de interfaz
// ============================================================

// ── Navegación ────────────────────────────────────────────
function showPage(p) {
  ['rfq', 'list', 'cot'].forEach(function(id) {
    document.getElementById('page-' + id).classList.toggle('hidden', id !== p);
  });
  document.querySelectorAll('nav button').forEach(function(b, i) {
    b.classList.toggle('active', ['rfq', 'list', 'cot'][i] === p);
  });
  if (p === 'list') loadRFQList();
}

// ── Toast ─────────────────────────────────────────────────
function toast(msg, duration) {
  duration = duration || 3000;
  var el = document.getElementById('toast');
  el.textContent = msg;
  el.style.display = 'block';
  setTimeout(function() { el.style.display = 'none'; }, duration);
}

// ── Popup resultado RFQ ───────────────────────────────────
var _popupTimer = null;

function showPopupSuccess() {
  document.getElementById('popup-icon').textContent  = '✅';
  document.getElementById('popup-title').textContent = '¡Cotización creada exitosamente!';
  document.getElementById('popup-msg').innerHTML     = '';
  document.getElementById('popup-close-btn').style.display = 'none';
  document.getElementById('result-popup').classList.add('show');
  _popupTimer = setTimeout(closeResultPopup, 1000);
}

function showPopupError(errorMsg) {
  document.getElementById('popup-icon').textContent  = '❌';
  document.getElementById('popup-title').textContent = 'Error al crear el RFQ';
  document.getElementById('popup-msg').innerHTML =
    '<p style="margin-bottom:.75rem">' + errorMsg + '</p>' +
    '<p>Si el error persiste puede que se hayan guardado datos parciales.<br>' +
    'Revisa y borra manualmente las filas creadas en:</p>' +
    '<ul style="margin:.5rem 0 0 1.2rem;line-height:1.8">' +
      '<li><strong>RFQ</strong></li>' +
      '<li><strong>RFQ_items</strong></li>' +
      '<li><strong>Cotizaciones</strong></li>' +
      '<li><strong>Cotizacion_items</strong></li>' +
    '</ul>';
  document.getElementById('popup-close-btn').style.display = 'block';
  document.getElementById('result-popup').classList.add('show');
}

function closeResultPopup() {
  if (_popupTimer) { clearTimeout(_popupTimer); _popupTimer = null; }
  document.getElementById('result-popup').classList.remove('show');
}

// ── Banner disponibilidad ─────────────────────────────────
function renderDisponibilidadBanner(resultados) {
  var banner   = document.getElementById('disponibilidad-banner');
  var sinDisp  = resultados.filter(function(r) { return r.estado === 'sin_disponibilidad'; });
  var sinFecha = resultados.filter(function(r) { return r.estado === 'sin_fecha_requerida'; });

  if (!sinDisp.length && !sinFecha.length) {
    banner.classList.add('hidden');
    return;
  }

  var html = '<strong>⚠️ Atención — ítems sin disponibilidad</strong><ul style="margin:.5rem 0 0 1rem">';
  sinDisp.forEach(function(r) {
    html += '<li><strong>' + r.variedad + '</strong>: no hay lotes que cumplan variedad, fecha y stock.</li>';
  });
  sinFecha.forEach(function(r) {
    html += '<li><strong>' + r.variedad + '</strong>: sin fecha requerida en el RFQ.</li>';
  });
  html += '</ul><p style="margin-top:.5rem;font-size:.8rem">Imprimir desactivado hasta resolver.</p>';
  banner.innerHTML = html;
  banner.classList.remove('hidden');
}

// ── Helpers de cálculo ────────────────────────────────────
function factorPresentacion(presentacion, cantidad_unidades) {
  switch ((presentacion || '').trim()) {
    case '250g':   return 0.25;
    case '500g':   return 0.5;
    case '1Kg':    return 1;
    case '12Kg':   return 12;
    case 'Granel': return parseFloat(cantidad_unidades || 1);
    default:       return 1;
  }
}

function labelUnidad(presentacion) {
  return presentacion === 'Granel' ? 'lote' : 'bolsa ' + presentacion;
}

// ── Mapa de costos por lote ───────────────────────────────
var loteCostosMap = {};

function onLoteChange(sel, cotItemId, cantidad, presentacion) {
  var loteId       = sel.value;
  var costosPorLote = loteCostosMap[cotItemId] || {};
  var nuevoCostoKg  = parseFloat(costosPorLote[loteId] || 0);

  document.querySelectorAll('[data-item-id="' + cotItemId + '"]').forEach(function(inp) {
    inp.dataset.loteCosto = nuevoCostoKg;
  });

  recalcItemUI(cotItemId, nuevoCostoKg, cantidad, presentacion);
  renderSummaryFromState();
}

// ── Render cotización ─────────────────────────────────────
function renderCotizacion(data, soloLectura, resultadosDisp) {
  soloLectura    = soloLectura    || false;
  resultadosDisp = resultadosDisp || [];

  var cotizacion = data.cotizacion;
  var items      = data.items;
  var costos     = data.costos;
  var rfqItems   = data.rfqItems || [];

  var dispMap = {};
  resultadosDisp.forEach(function(r) { dispMap[r.cot_item_id] = r; });

  // Header
  var monedaRFQ = (cotizacion.moneda_solicitada || 'USD').toUpperCase();

  document.getElementById('cot-header-info').innerHTML =
    '<div><label>ID Cotización</label><strong style="font-size:.82rem">' + cotizacion.cotizacion_id + '</strong></div>' +
    '<div><label>Cliente</label><strong>' + cotizacion.cliente + '</strong></div>' +
    '<div><label>Asesor</label><strong>'  + cotizacion.asesor  + '</strong></div>' +
    '<div><label>Moneda solicitada</label><span class="tag tag-blue">' + monedaRFQ + '</span></div>' +
    '<div><label>Estado</label><span class="tag ' + (soloLectura ? 'tag-green' : 'tag-yellow') + '">' + cotizacion.estado + '</span></div>' +
    '<div><label>Actualizado</label><span class="text-muted">' + (cotizacion.updated_at || '—') + '</span></div>' +
    (soloLectura ? '<div><span class="tag tag-blue">🔒 Solo lectura</span></div>' : '') +
    // Tasas de cambio — siempre visibles y editables (excepto solo lectura)
    '<div style="grid-column:1/-1;display:flex;gap:1rem;align-items:center;' +
      'background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);' +
      'padding:.6rem .9rem;margin-top:.25rem">' +
      '<span style="font-size:.82rem;color:var(--muted);white-space:nowrap">💱 Tasas de cambio:</span>' +
      '<label style="margin:0;white-space:nowrap">1 USD =</label>' +
      '<input id="tasa-usd" type="number" step="1" min="0" ' +
        'value="' + (cotizacion.tasa_usd || '') + '" ' +
        'placeholder="ej. 4100" ' +
        (soloLectura ? 'disabled ' : 'oninput="onTasaChange()" ') +
        'style="width:110px;margin:0" />' +
      '<span style="font-size:.82rem;color:var(--muted)">COP</span>' +
      '<label style="margin:0;white-space:nowrap">1 EUR =</label>' +
      '<input id="tasa-eur" type="number" step="1" min="0" ' +
        'value="' + (cotizacion.tasa_eur || '') + '" ' +
        'placeholder="ej. 4500" ' +
        (soloLectura ? 'disabled ' : 'oninput="onTasaChange()" ') +
        'style="width:110px;margin:0" />' +
      '<span style="font-size:.82rem;color:var(--muted)">COP</span>' +
    '</div>';

  var section = document.getElementById('cot-items-section');
  section.innerHTML = '';

  items.forEach(function(item) {
    var dispResult = dispMap[item.cot_item_id] || {};
    var sinDisp    = dispResult.estado === 'sin_disponibilidad';

    var itemCostos   = costos.filter(function(c) { return c.cot_item_id === item.cot_item_id; });
    var sumaCostosKg = itemCostos.reduce(function(s, c) { return s + parseFloat(c.valor_usd_kg || 0); }, 0);
    var precioFinalKg  = parseFloat(item.costo_lote_kg || 0) + sumaCostosKg;
    var factor         = factorPresentacion(item.presentacion, item.cantidad_unidades);
    var precioUnitario = precioFinalKg * factor;
    var cantidad       = parseFloat(item.cantidad_unidades || 0);
    var totalUsd       = item.presentacion === 'Granel' ? precioUnitario : precioUnitario * cantidad;

    // Fecha requerida desde rfqItems
    var rfqItem  = rfqItems.find(function(r) { return r.rfq_item_id === item.rfq_item_id; }) || {};
    var fechaRaw = rfqItem.fecha_requerida;
    var fechaReq = '—';
    if (fechaRaw) {
      fechaReq = fechaRaw instanceof Date
        ? fechaRaw.toISOString().slice(0, 10)
        : String(fechaRaw).slice(0, 10);
    }

    // Badge sin disponibilidad
    var badgeSinDisp = sinDisp
      ? '<span style="background:var(--red);color:#fff;font-size:.72rem;font-weight:700;padding:.2rem .6rem;border-radius:99px;margin-left:.5rem">⚠ Sin disponibilidad</span>'
      : '';

    // Selector de lote
    var selectorLote = '';
    if (!soloLectura && dispResult.lotes && dispResult.lotes.length > 1) {
      loteCostosMap[item.cot_item_id] = {};
      dispResult.lotes.forEach(function(l) {
        loteCostosMap[item.cot_item_id][l.lote_id] = parseFloat(l.costo_usd_kg || 0);
      });

      var optsHtml = '';
      dispResult.lotes.forEach(function(l) {
        var sel = (l.lote_id === item.lote_id) ? ' selected' : '';
        optsHtml += '<option value="' + l.lote_id + '"' + sel + '>'
          + l.origen + ' · ' + l.proceso
          + ' · $' + parseFloat(l.costo_usd_kg).toFixed(2) + '/kg'
          + ' · ' + l.kilos_disponibles + ' kg disp.'
          + '</option>';
      });

      selectorLote = '<div style="margin-bottom:.75rem">'
        + '<label>Lote disponible <span class="tag tag-yellow" style="margin-left:.5rem">'
        + dispResult.lotes.length + ' opciones</span></label>'
        + '<select'
        + ' data-lote-selector="1"'
        + ' data-cot-item-id="' + item.cot_item_id + '"'
        + ' data-lote-original="' + (item.lote_id || '') + '"'
        + ' onchange="onLoteChange(this, \'' + item.cot_item_id + '\', ' + cantidad + ', \'' + item.presentacion + '\')"'
        + '>' + optsHtml + '</select>'
        + '</div>';

    } else if (!soloLectura && item.lote_id) {
      selectorLote = '<div style="margin-bottom:.75rem">'
        + '<label>Lote asignado</label>'
        + '<span style="font-size:.85rem">' + item.lote_id + '</span>'
        + '</div>';
    }

    // Filas de costos
    var costoRowsHtml = '';
    itemCostos.forEach(function(c) {
      var f    = factorPresentacion(item.presentacion, item.cantidad_unidades);
      var v    = parseFloat(c.valor_usd_kg || 0);
      var cant = parseFloat(item.cantidad_unidades || 0);
      var sub  = item.presentacion === 'Granel' ? v * f : v * f * cant;

      var inputCell = soloLectura
        ? '<td>

      costoRowsHtml +=
        '<tr id="row-' + c.costo_id + '">'
        + '<td>' + c.nombre + '</td>'
        + '<td><span class="tag tag-blue">' + c.tipo + '</span></td>'
        + inputCell
        + '<td class="text-muted" style="font-size:.75rem">x ' + f.toFixed(4) + '</td>'
        + '<td id="sub-' + c.costo_id + '">$' + sub.toFixed(2) + '</td>'
        + '</tr>';
    });

    // Card
    var card = document.createElement('div');
    card.className = 'card';
    if (sinDisp) { card.style.border = '2px solid var(--red)'; }

    card.innerHTML =
      '<div class="card-title">'
        + '📦 ' + (item.variedad || '—') + ' · ' + (item.origen || '—')
        + ' <span class="tag tag-blue" style="margin-left:.5rem">' + item.presentacion + '</span>'
        + ' <span class="tag tag-green" style="margin-left:.25rem">' + item.tier + '</span>'
        + badgeSinDisp
      + '</div>'
      + '<div class="form-grid" style="margin-bottom:.75rem">'
        + '<div><label>Fecha requerida</label>'
          + '<span' + (!fechaRaw ? ' style="color:var(--red)"' : '') + '>' + fechaReq + '</span></div>'
        + '<div><label>Presentación</label><span>' + item.presentacion + '</span></div>'
        + '<div><label>Cantidad</label><span>' + item.cantidad_unidades + ' ' + labelUnidad(item.presentacion) + '</span></div>'
        + '<div><label>Costo lote (USD/kg)</label>'
          + '<span' + (sinDisp ? ' style="color:var(--red);font-weight:700"' : '') + '>'
          + '$' + parseFloat(item.costo_lote_kg || 0).toFixed(4) + '</span></div>'
        + '<div><label>Precio/kg final</label><strong id="pf-' + item.cot_item_id + '">$' + precioFinalKg.toFixed(4) + '</strong></div>'
        + '<div><label>Precio/' + labelUnidad(item.presentacion) + '</label><strong id="pu-' + item.cot_item_id + '">$' + precioUnitario.toFixed(4) + '</strong></div>'
        + '<div><label>Total (USD)</label><strong id="tot-' + item.cot_item_id + '">$' + totalUsd.toFixed(2) + '</strong></div>'
      + '</div>'
      + selectorLote
      + '<div class="tbl-wrap"><table>'
        + '<thead><tr><th>Costo</th><th>Tipo</th><th>USD/kg</th><th>Factor</th><th>Subtotal</th></tr></thead>'
        + '<tbody>' + costoRowsHtml + '</tbody>'
      + '</table></div>'
      + (!soloLectura ? '<p class="text-muted mt-1">cot_item_id: <code>' + item.cot_item_id + '</code></p>' : '');

    section.appendChild(card);
  });

  renderSummary(items, costos);
}

// ── Recálculo inline ──────────────────────────────────────
function onCostoChange(input) {
  var costoId      = input.dataset.costoId;
  var itemId       = input.dataset.itemId;
  var cantidad     = parseFloat(input.dataset.cantidad || 0);
  var presentacion = input.dataset.presentacion;
  var loteCosto    = parseFloat(input.dataset.loteCosto || 0);
  var newVal       = parseFloat(input.value || 0);

  pendingEdits[costoId] = { costo_id: costoId, valor_usd_kg: newVal, cot_item_id: itemId };

  var factor   = factorPresentacion(presentacion, cantidad);
  var subUn    = newVal * factor;
  var subTotal = presentacion === 'Granel' ? subUn : subUn * cantidad;
  var subEl    = document.getElementById('sub-' + costoId);
  if (subEl) subEl.textContent = '$' + subTotal.toFixed(2);

  recalcItemUI(itemId, loteCosto, cantidad, presentacion);
  renderSummaryFromState();
}

function recalcItemUI(itemId, loteCosto, cantidad, presentacion) {
  var inputs = document.querySelectorAll('[data-item-id="' + itemId + '"]');
  var sumaCostosKg = 0;
  inputs.forEach(function(i) { sumaCostosKg += parseFloat(i.value || 0); });

  var precioFinalKg  = loteCosto + sumaCostosKg;
  var factor         = factorPresentacion(presentacion, cantidad);
  var precioUnitario = precioFinalKg * factor;
  var totalUsd       = presentacion === 'Granel' ? precioUnitario : precioUnitario * cantidad;

  var pfEl  = document.getElementById('pf-'  + itemId);
  var puEl  = document.getElementById('pu-'  + itemId);
  var totEl = document.getElementById('tot-' + itemId);
  if (pfEl)  pfEl.textContent  = '$' + precioFinalKg.toFixed(4);
  if (puEl)  puEl.textContent  = '$' + precioUnitario.toFixed(4);
  if (totEl) totEl.textContent = '$' + totalUsd.toFixed(2);
}

// ── Resumen ───────────────────────────────────────────────
function aCOP(valor, moneda, tUSD, tEUR) {
  switch ((moneda || 'COP').toUpperCase()) {
    case 'USD': return valor * parseFloat(tUSD || 1);
    case 'EUR': return valor * parseFloat(tEUR || 1);
    default:    return valor;
  }
}

function formatCOP(v) { return '

function renderSummaryFromState() {
  if (!cotState) return;
  renderSummary(cotState.items, cotState.costos);
}
 + v.toFixed(0) + ' <span class="tag tag-blue" style="font-size:.65rem">' + (c.moneda || 'COP') + '</span></td>'
        : '<td style="display:flex;gap:.3rem;align-items:center">' +
            '<input type="number" step="1" value="' + Math.round(v) + '"' +
            ' data-costo-id="'     + c.costo_id             + '"' +
            ' data-item-id="'      + item.cot_item_id        + '"' +
            ' data-cantidad="'     + item.cantidad_unidades   + '"' +
            ' data-presentacion="' + item.presentacion        + '"' +
            ' data-lote-costo="'   + item.costo_lote_kg       + '"' +
            ' data-moneda="'       + (c.moneda || 'COP')      + '"' +
            ' onchange="onCostoChange(this)" style="width:110px" />' +
            '<span class="tag tag-blue" style="font-size:.65rem">' + (c.moneda || 'COP') + '</span>' +
          '</td>';

      costoRowsHtml +=
        '<tr id="row-' + c.costo_id + '">'
        + '<td>' + c.nombre + '</td>'
        + '<td><span class="tag tag-blue">' + c.tipo + '</span></td>'
        + inputCell
        + '<td class="text-muted" style="font-size:.75rem">x ' + f.toFixed(4) + '</td>'
        + '<td id="sub-' + c.costo_id + '">$' + sub.toFixed(2) + '</td>'
        + '</tr>';
    });

    // Card
    var card = document.createElement('div');
    card.className = 'card';
    if (sinDisp) { card.style.border = '2px solid var(--red)'; }

    card.innerHTML =
      '<div class="card-title">'
        + '📦 ' + (item.variedad || '—') + ' · ' + (item.origen || '—')
        + ' <span class="tag tag-blue" style="margin-left:.5rem">' + item.presentacion + '</span>'
        + ' <span class="tag tag-green" style="margin-left:.25rem">' + item.tier + '</span>'
        + badgeSinDisp
      + '</div>'
      + '<div class="form-grid" style="margin-bottom:.75rem">'
        + '<div><label>Fecha requerida</label>'
          + '<span' + (!fechaRaw ? ' style="color:var(--red)"' : '') + '>' + fechaReq + '</span></div>'
        + '<div><label>Presentación</label><span>' + item.presentacion + '</span></div>'
        + '<div><label>Cantidad</label><span>' + item.cantidad_unidades + ' ' + labelUnidad(item.presentacion) + '</span></div>'
        + '<div><label>Costo lote (USD/kg)</label>'
          + '<span' + (sinDisp ? ' style="color:var(--red);font-weight:700"' : '') + '>'
          + '$' + parseFloat(item.costo_lote_kg || 0).toFixed(4) + '</span></div>'
        + '<div><label>Precio/kg final</label><strong id="pf-' + item.cot_item_id + '">$' + precioFinalKg.toFixed(4) + '</strong></div>'
        + '<div><label>Precio/' + labelUnidad(item.presentacion) + '</label><strong id="pu-' + item.cot_item_id + '">$' + precioUnitario.toFixed(4) + '</strong></div>'
        + '<div><label>Total (USD)</label><strong id="tot-' + item.cot_item_id + '">$' + totalUsd.toFixed(2) + '</strong></div>'
      + '</div>'
      + selectorLote
      + '<div class="tbl-wrap"><table>'
        + '<thead><tr><th>Costo</th><th>Tipo</th><th>USD/kg</th><th>Factor</th><th>Subtotal</th></tr></thead>'
        + '<tbody>' + costoRowsHtml + '</tbody>'
      + '</table></div>'
      + (!soloLectura ? '<p class="text-muted mt-1">cot_item_id: <code>' + item.cot_item_id + '</code></p>' : '');

    section.appendChild(card);
  });

  renderSummary(items, costos);
}

// ── Recálculo inline ──────────────────────────────────────
function onCostoChange(input) {
  var costoId      = input.dataset.costoId;
  var itemId       = input.dataset.itemId;
  var cantidad     = parseFloat(input.dataset.cantidad || 0);
  var presentacion = input.dataset.presentacion;
  var loteCosto    = parseFloat(input.dataset.loteCosto || 0);
  var newVal       = parseFloat(input.value || 0);

  pendingEdits[costoId] = { costo_id: costoId, valor_usd_kg: newVal, cot_item_id: itemId };

  var factor   = factorPresentacion(presentacion, cantidad);
  var subUn    = newVal * factor;
  var subTotal = presentacion === 'Granel' ? subUn : subUn * cantidad;
  var subEl    = document.getElementById('sub-' + costoId);
  if (subEl) subEl.textContent = '$' + subTotal.toFixed(2);

  recalcItemUI(itemId, loteCosto, cantidad, presentacion);
  renderSummaryFromState();
}

function recalcItemUI(itemId, loteCosto, cantidad, presentacion) {
  var inputs = document.querySelectorAll('[data-item-id="' + itemId + '"]');
  var sumaCostosKg = 0;
  inputs.forEach(function(i) { sumaCostosKg += parseFloat(i.value || 0); });

  var precioFinalKg  = loteCosto + sumaCostosKg;
  var factor         = factorPresentacion(presentacion, cantidad);
  var precioUnitario = precioFinalKg * factor;
  var totalUsd       = presentacion === 'Granel' ? precioUnitario : precioUnitario * cantidad;

  var pfEl  = document.getElementById('pf-'  + itemId);
  var puEl  = document.getElementById('pu-'  + itemId);
  var totEl = document.getElementById('tot-' + itemId);
  if (pfEl)  pfEl.textContent  = '$' + precioFinalKg.toFixed(4);
  if (puEl)  puEl.textContent  = '$' + precioUnitario.toFixed(4);
  if (totEl) totEl.textContent = '$' + totalUsd.toFixed(2);
}

// ── Resumen ───────────────────────────────────────────────
function renderSummary(items, costos) {
  var grand = 0;
  items.forEach(function(item) {
    var sum = costos
      .filter(function(c) { return c.cot_item_id === item.cot_item_id; })
      .reduce(function(s, c) { return s + parseFloat(c.valor_usd_kg || 0); }, 0);
    var pf     = parseFloat(item.costo_lote_kg || 0) + sum;
    var factor = factorPresentacion(item.presentacion, item.cantidad_unidades);
    var pu     = pf * factor;
    var cant   = parseFloat(item.cantidad_unidades || 0);
    grand += item.presentacion === 'Granel' ? pu : pu * cant;
  });

  var el = document.getElementById('cot-summary');
  if (el) el.innerHTML =
    '<strong>Resumen de cotización</strong>'
    + '<div class="form-grid mt-1">'
      + '<div><label>Ítems</label><strong>' + items.length + '</strong></div>'
      + '<div><label>Total general (USD)</label>'
        + '<strong style="font-size:1.1rem;color:var(--green)">$' + grand.toFixed(2) + '</strong></div>'
    + '</div>';
}

function renderSummaryFromState() {
  if (!cotState) return;
  var grand = 0;
  cotState.items.forEach(function(item) {
    var inputs = document.querySelectorAll('[data-item-id="' + item.cot_item_id + '"]');
    var sumaCostosKg = 0;
    inputs.forEach(function(i) { sumaCostosKg += parseFloat(i.value || 0); });
    var pf     = parseFloat(item.costo_lote_kg || 0) + sumaCostosKg;
    var factor = factorPresentacion(item.presentacion, item.cantidad_unidades);
    var pu     = pf * factor;
    var cant   = parseFloat(item.cantidad_unidades || 0);
    grand += item.presentacion === 'Granel' ? pu : pu * cant;
  });

  var el = document.getElementById('cot-summary');
  if (el) el.innerHTML =
    '<strong>Resumen de cotización</strong>'
    + '<div class="form-grid mt-1">'
      + '<div><label>Ítems</label><strong>' + cotState.items.length + '</strong></div>'
      + '<div><label>Total general (USD)</label>'
        + '<strong style="font-size:1.1rem;color:var(--green)">$' + grand.toFixed(2) + '</strong></div>'
    + '</div>';
}
 + Math.round(v).toLocaleString('es-CO'); }
function formatUSD(v) { return 'US

function renderSummaryFromState() {
  if (!cotState) return;
  var grand = 0;
  cotState.items.forEach(function(item) {
    var inputs = document.querySelectorAll('[data-item-id="' + item.cot_item_id + '"]');
    var sumaCostosKg = 0;
    inputs.forEach(function(i) { sumaCostosKg += parseFloat(i.value || 0); });
    var pf     = parseFloat(item.costo_lote_kg || 0) + sumaCostosKg;
    var factor = factorPresentacion(item.presentacion, item.cantidad_unidades);
    var pu     = pf * factor;
    var cant   = parseFloat(item.cantidad_unidades || 0);
    grand += item.presentacion === 'Granel' ? pu : pu * cant;
  });

  var el = document.getElementById('cot-summary');
  if (el) el.innerHTML =
    '<strong>Resumen de cotización</strong>'
    + '<div class="form-grid mt-1">'
      + '<div><label>Ítems</label><strong>' + cotState.items.length + '</strong></div>'
      + '<div><label>Total general (USD)</label>'
        + '<strong style="font-size:1.1rem;color:var(--green)">$' + grand.toFixed(2) + '</strong></div>'
    + '</div>';
}
 + v.toFixed(0) + ' <span class="tag tag-blue" style="font-size:.65rem">' + (c.moneda || 'COP') + '</span></td>'
        : '<td style="display:flex;gap:.3rem;align-items:center">' +
            '<input type="number" step="1" value="' + Math.round(v) + '"' +
            ' data-costo-id="'     + c.costo_id             + '"' +
            ' data-item-id="'      + item.cot_item_id        + '"' +
            ' data-cantidad="'     + item.cantidad_unidades   + '"' +
            ' data-presentacion="' + item.presentacion        + '"' +
            ' data-lote-costo="'   + item.costo_lote_kg       + '"' +
            ' data-moneda="'       + (c.moneda || 'COP')      + '"' +
            ' onchange="onCostoChange(this)" style="width:110px" />' +
            '<span class="tag tag-blue" style="font-size:.65rem">' + (c.moneda || 'COP') + '</span>' +
          '</td>';

      costoRowsHtml +=
        '<tr id="row-' + c.costo_id + '">'
        + '<td>' + c.nombre + '</td>'
        + '<td><span class="tag tag-blue">' + c.tipo + '</span></td>'
        + inputCell
        + '<td class="text-muted" style="font-size:.75rem">x ' + f.toFixed(4) + '</td>'
        + '<td id="sub-' + c.costo_id + '">$' + sub.toFixed(2) + '</td>'
        + '</tr>';
    });

    // Card
    var card = document.createElement('div');
    card.className = 'card';
    if (sinDisp) { card.style.border = '2px solid var(--red)'; }

    card.innerHTML =
      '<div class="card-title">'
        + '📦 ' + (item.variedad || '—') + ' · ' + (item.origen || '—')
        + ' <span class="tag tag-blue" style="margin-left:.5rem">' + item.presentacion + '</span>'
        + ' <span class="tag tag-green" style="margin-left:.25rem">' + item.tier + '</span>'
        + badgeSinDisp
      + '</div>'
      + '<div class="form-grid" style="margin-bottom:.75rem">'
        + '<div><label>Fecha requerida</label>'
          + '<span' + (!fechaRaw ? ' style="color:var(--red)"' : '') + '>' + fechaReq + '</span></div>'
        + '<div><label>Presentación</label><span>' + item.presentacion + '</span></div>'
        + '<div><label>Cantidad</label><span>' + item.cantidad_unidades + ' ' + labelUnidad(item.presentacion) + '</span></div>'
        + '<div><label>Costo lote (USD/kg)</label>'
          + '<span' + (sinDisp ? ' style="color:var(--red);font-weight:700"' : '') + '>'
          + '$' + parseFloat(item.costo_lote_kg || 0).toFixed(4) + '</span></div>'
        + '<div><label>Precio/kg final</label><strong id="pf-' + item.cot_item_id + '">$' + precioFinalKg.toFixed(4) + '</strong></div>'
        + '<div><label>Precio/' + labelUnidad(item.presentacion) + '</label><strong id="pu-' + item.cot_item_id + '">$' + precioUnitario.toFixed(4) + '</strong></div>'
        + '<div><label>Total (USD)</label><strong id="tot-' + item.cot_item_id + '">$' + totalUsd.toFixed(2) + '</strong></div>'
      + '</div>'
      + selectorLote
      + '<div class="tbl-wrap"><table>'
        + '<thead><tr><th>Costo</th><th>Tipo</th><th>USD/kg</th><th>Factor</th><th>Subtotal</th></tr></thead>'
        + '<tbody>' + costoRowsHtml + '</tbody>'
      + '</table></div>'
      + (!soloLectura ? '<p class="text-muted mt-1">cot_item_id: <code>' + item.cot_item_id + '</code></p>' : '');

    section.appendChild(card);
  });

  renderSummary(items, costos);
}

// ── Recálculo inline ──────────────────────────────────────
function onCostoChange(input) {
  var costoId      = input.dataset.costoId;
  var itemId       = input.dataset.itemId;
  var cantidad     = parseFloat(input.dataset.cantidad || 0);
  var presentacion = input.dataset.presentacion;
  var loteCosto    = parseFloat(input.dataset.loteCosto || 0);
  var newVal       = parseFloat(input.value || 0);

  pendingEdits[costoId] = { costo_id: costoId, valor_usd_kg: newVal, cot_item_id: itemId };

  var factor   = factorPresentacion(presentacion, cantidad);
  var subUn    = newVal * factor;
  var subTotal = presentacion === 'Granel' ? subUn : subUn * cantidad;
  var subEl    = document.getElementById('sub-' + costoId);
  if (subEl) subEl.textContent = '$' + subTotal.toFixed(2);

  recalcItemUI(itemId, loteCosto, cantidad, presentacion);
  renderSummaryFromState();
}

function recalcItemUI(itemId, loteCosto, cantidad, presentacion) {
  var inputs = document.querySelectorAll('[data-item-id="' + itemId + '"]');
  var sumaCostosKg = 0;
  inputs.forEach(function(i) { sumaCostosKg += parseFloat(i.value || 0); });

  var precioFinalKg  = loteCosto + sumaCostosKg;
  var factor         = factorPresentacion(presentacion, cantidad);
  var precioUnitario = precioFinalKg * factor;
  var totalUsd       = presentacion === 'Granel' ? precioUnitario : precioUnitario * cantidad;

  var pfEl  = document.getElementById('pf-'  + itemId);
  var puEl  = document.getElementById('pu-'  + itemId);
  var totEl = document.getElementById('tot-' + itemId);
  if (pfEl)  pfEl.textContent  = '$' + precioFinalKg.toFixed(4);
  if (puEl)  puEl.textContent  = '$' + precioUnitario.toFixed(4);
  if (totEl) totEl.textContent = '$' + totalUsd.toFixed(2);
}

// ── Resumen ───────────────────────────────────────────────
function renderSummary(items, costos) {
  var grand = 0;
  items.forEach(function(item) {
    var sum = costos
      .filter(function(c) { return c.cot_item_id === item.cot_item_id; })
      .reduce(function(s, c) { return s + parseFloat(c.valor_usd_kg || 0); }, 0);
    var pf     = parseFloat(item.costo_lote_kg || 0) + sum;
    var factor = factorPresentacion(item.presentacion, item.cantidad_unidades);
    var pu     = pf * factor;
    var cant   = parseFloat(item.cantidad_unidades || 0);
    grand += item.presentacion === 'Granel' ? pu : pu * cant;
  });

  var el = document.getElementById('cot-summary');
  if (el) el.innerHTML =
    '<strong>Resumen de cotización</strong>'
    + '<div class="form-grid mt-1">'
      + '<div><label>Ítems</label><strong>' + items.length + '</strong></div>'
      + '<div><label>Total general (USD)</label>'
        + '<strong style="font-size:1.1rem;color:var(--green)">$' + grand.toFixed(2) + '</strong></div>'
    + '</div>';
}

function renderSummaryFromState() {
  if (!cotState) return;
  var grand = 0;
  cotState.items.forEach(function(item) {
    var inputs = document.querySelectorAll('[data-item-id="' + item.cot_item_id + '"]');
    var sumaCostosKg = 0;
    inputs.forEach(function(i) { sumaCostosKg += parseFloat(i.value || 0); });
    var pf     = parseFloat(item.costo_lote_kg || 0) + sumaCostosKg;
    var factor = factorPresentacion(item.presentacion, item.cantidad_unidades);
    var pu     = pf * factor;
    var cant   = parseFloat(item.cantidad_unidades || 0);
    grand += item.presentacion === 'Granel' ? pu : pu * cant;
  });

  var el = document.getElementById('cot-summary');
  if (el) el.innerHTML =
    '<strong>Resumen de cotización</strong>'
    + '<div class="form-grid mt-1">'
      + '<div><label>Ítems</label><strong>' + cotState.items.length + '</strong></div>'
      + '<div><label>Total general (USD)</label>'
        + '<strong style="font-size:1.1rem;color:var(--green)">$' + grand.toFixed(2) + '</strong></div>'
    + '</div>';
}
 + (v).toFixed(2); }
function formatEUR(v) { return '€' + (v).toFixed(2); }

function renderSummary(items, costos) {
  var tUSD   = parseFloat((document.getElementById('tasa-usd') || {}).value || tasaUSD || 0);
  var tEUR   = parseFloat((document.getElementById('tasa-eur') || {}).value || tasaEUR || 0);
  var monRFQ = cotState ? (cotState.cotizacion.moneda_solicitada || 'USD').toUpperCase() : 'USD';

  var grandCOP = 0;
  var itemRows = '';

  items.forEach(function(item) {
    var costoItemCOP = costos
      .filter(function(c) { return c.cot_item_id === item.cot_item_id; })
      .reduce(function(s, c) {
        return s + aCOP(parseFloat(c.valor_kg || 0), c.moneda, tUSD, tEUR);
      }, 0);

    var pfKgCOP    = parseFloat(item.costo_lote_kg || 0) + costoItemCOP;
    var factor     = factorPresentacion(item.presentacion, item.cantidad_unidades);
    var puCOP      = pfKgCOP * factor;
    var cant       = parseFloat(item.cantidad_unidades || 0);
    var totalCOP   = item.presentacion === 'Granel' ? puCOP : puCOP * cant;
    var totalUSD   = tUSD > 0 ? totalCOP / tUSD : 0;
    var totalEUR   = tEUR > 0 ? totalCOP / tEUR : 0;
    grandCOP      += totalCOP;

    var cols = [
      '<td>' + (item.variedad || '—') + ' ' + item.presentacion + ' ×' + item.cantidad_unidades + '</td>',
      cell(formatCOP(totalCOP), monRFQ === 'COP'),
      cell(formatUSD(totalUSD), monRFQ === 'USD'),
      cell(formatEUR(totalEUR), monRFQ === 'EUR'),
    ].join('');
    itemRows += '<tr>' + cols + '</tr>';
  });

  var grandUSD = tUSD > 0 ? grandCOP / tUSD : 0;
  var grandEUR = tEUR > 0 ? grandCOP / tEUR : 0;

  var el = document.getElementById('cot-summary');
  if (!el) return;

  el.innerHTML =
    '<strong>Resumen de cotización</strong>' +
    '<details style="margin-top:.75rem">' +
      '<summary style="cursor:pointer;font-size:.85rem;color:var(--accent2);margin-bottom:.5rem">' +
        'Ver detalle por ítem ▸' +
      '</summary>' +
      '<div class="tbl-wrap" style="margin-top:.5rem">' +
        '<table><thead><tr>' +
          '<th>Ítem</th>' +
          thCol('COP', monRFQ === 'COP') +
          thCol('USD', monRFQ === 'USD') +
          thCol('EUR', monRFQ === 'EUR') +
        '</tr></thead><tbody>' + itemRows + '</tbody></table>' +
      '</div>' +
    '</details>' +
    '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:.75rem;margin-top:.75rem">' +
      summaryCard('Total COP', formatCOP(grandCOP), monRFQ === 'COP') +
      summaryCard('Total USD', formatUSD(grandUSD), monRFQ === 'USD') +
      summaryCard('Total EUR', formatEUR(grandEUR), monRFQ === 'EUR') +
    '</div>' +
    ((!tUSD || !tEUR)
      ? '<p style="margin-top:.5rem;font-size:.78rem;color:var(--red)">⚠ Ingresa las tasas de cambio para ver los totales en USD y EUR.</p>'
      : '');
}

function thCol(label, resaltado) {
  return '<th style="' + (resaltado ? 'background:#8b6240' : '') + '">' + label + '</th>';
}

function cell(texto, resaltado) {
  return '<td style="' + (resaltado ? 'font-weight:700;color:var(--accent)' : '') + '">' + texto + '</td>';
}

function summaryCard(label, valor, resaltado) {
  var bg     = resaltado ? 'background:var(--accent);color:#fff' : 'background:var(--bg)';
  var border = resaltado ? 'border:2px solid var(--accent)' : 'border:1px solid var(--border)';
  return '<div style="' + bg + ';' + border + ';border-radius:var(--radius);padding:.75rem;text-align:center">' +
    '<div style="font-size:.75rem;opacity:.8;margin-bottom:.25rem">' + label + '</div>' +
    '<div style="font-size:1.05rem;font-weight:700">' + valor + '</div>' +
  '</div>';
}

function renderSummaryFromState() {
  if (!cotState) return;
  var grand = 0;
  cotState.items.forEach(function(item) {
    var inputs = document.querySelectorAll('[data-item-id="' + item.cot_item_id + '"]');
    var sumaCostosKg = 0;
    inputs.forEach(function(i) { sumaCostosKg += parseFloat(i.value || 0); });
    var pf     = parseFloat(item.costo_lote_kg || 0) + sumaCostosKg;
    var factor = factorPresentacion(item.presentacion, item.cantidad_unidades);
    var pu     = pf * factor;
    var cant   = parseFloat(item.cantidad_unidades || 0);
    grand += item.presentacion === 'Granel' ? pu : pu * cant;
  });

  var el = document.getElementById('cot-summary');
  if (el) el.innerHTML =
    '<strong>Resumen de cotización</strong>'
    + '<div class="form-grid mt-1">'
      + '<div><label>Ítems</label><strong>' + cotState.items.length + '</strong></div>'
      + '<div><label>Total general (USD)</label>'
        + '<strong style="font-size:1.1rem;color:var(--green)">$' + grand.toFixed(2) + '</strong></div>'
    + '</div>';
}
 + v.toFixed(0) + ' <span class="tag tag-blue" style="font-size:.65rem">' + (c.moneda || 'COP') + '</span></td>'
        : '<td style="display:flex;gap:.3rem;align-items:center">' +
            '<input type="number" step="1" value="' + Math.round(v) + '"' +
            ' data-costo-id="'     + c.costo_id             + '"' +
            ' data-item-id="'      + item.cot_item_id        + '"' +
            ' data-cantidad="'     + item.cantidad_unidades   + '"' +
            ' data-presentacion="' + item.presentacion        + '"' +
            ' data-lote-costo="'   + item.costo_lote_kg       + '"' +
            ' data-moneda="'       + (c.moneda || 'COP')      + '"' +
            ' onchange="onCostoChange(this)" style="width:110px" />' +
            '<span class="tag tag-blue" style="font-size:.65rem">' + (c.moneda || 'COP') + '</span>' +
          '</td>';

      costoRowsHtml +=
        '<tr id="row-' + c.costo_id + '">'
        + '<td>' + c.nombre + '</td>'
        + '<td><span class="tag tag-blue">' + c.tipo + '</span></td>'
        + inputCell
        + '<td class="text-muted" style="font-size:.75rem">x ' + f.toFixed(4) + '</td>'
        + '<td id="sub-' + c.costo_id + '">$' + sub.toFixed(2) + '</td>'
        + '</tr>';
    });

    // Card
    var card = document.createElement('div');
    card.className = 'card';
    if (sinDisp) { card.style.border = '2px solid var(--red)'; }

    card.innerHTML =
      '<div class="card-title">'
        + '📦 ' + (item.variedad || '—') + ' · ' + (item.origen || '—')
        + ' <span class="tag tag-blue" style="margin-left:.5rem">' + item.presentacion + '</span>'
        + ' <span class="tag tag-green" style="margin-left:.25rem">' + item.tier + '</span>'
        + badgeSinDisp
      + '</div>'
      + '<div class="form-grid" style="margin-bottom:.75rem">'
        + '<div><label>Fecha requerida</label>'
          + '<span' + (!fechaRaw ? ' style="color:var(--red)"' : '') + '>' + fechaReq + '</span></div>'
        + '<div><label>Presentación</label><span>' + item.presentacion + '</span></div>'
        + '<div><label>Cantidad</label><span>' + item.cantidad_unidades + ' ' + labelUnidad(item.presentacion) + '</span></div>'
        + '<div><label>Costo lote (USD/kg)</label>'
          + '<span' + (sinDisp ? ' style="color:var(--red);font-weight:700"' : '') + '>'
          + '$' + parseFloat(item.costo_lote_kg || 0).toFixed(4) + '</span></div>'
        + '<div><label>Precio/kg final</label><strong id="pf-' + item.cot_item_id + '">$' + precioFinalKg.toFixed(4) + '</strong></div>'
        + '<div><label>Precio/' + labelUnidad(item.presentacion) + '</label><strong id="pu-' + item.cot_item_id + '">$' + precioUnitario.toFixed(4) + '</strong></div>'
        + '<div><label>Total (USD)</label><strong id="tot-' + item.cot_item_id + '">$' + totalUsd.toFixed(2) + '</strong></div>'
      + '</div>'
      + selectorLote
      + '<div class="tbl-wrap"><table>'
        + '<thead><tr><th>Costo</th><th>Tipo</th><th>USD/kg</th><th>Factor</th><th>Subtotal</th></tr></thead>'
        + '<tbody>' + costoRowsHtml + '</tbody>'
      + '</table></div>'
      + (!soloLectura ? '<p class="text-muted mt-1">cot_item_id: <code>' + item.cot_item_id + '</code></p>' : '');

    section.appendChild(card);
  });

  renderSummary(items, costos);
}

// ── Recálculo inline ──────────────────────────────────────
function onCostoChange(input) {
  var costoId      = input.dataset.costoId;
  var itemId       = input.dataset.itemId;
  var cantidad     = parseFloat(input.dataset.cantidad || 0);
  var presentacion = input.dataset.presentacion;
  var loteCosto    = parseFloat(input.dataset.loteCosto || 0);
  var newVal       = parseFloat(input.value || 0);

  pendingEdits[costoId] = { costo_id: costoId, valor_usd_kg: newVal, cot_item_id: itemId };

  var factor   = factorPresentacion(presentacion, cantidad);
  var subUn    = newVal * factor;
  var subTotal = presentacion === 'Granel' ? subUn : subUn * cantidad;
  var subEl    = document.getElementById('sub-' + costoId);
  if (subEl) subEl.textContent = '$' + subTotal.toFixed(2);

  recalcItemUI(itemId, loteCosto, cantidad, presentacion);
  renderSummaryFromState();
}

function recalcItemUI(itemId, loteCosto, cantidad, presentacion) {
  var inputs = document.querySelectorAll('[data-item-id="' + itemId + '"]');
  var sumaCostosKg = 0;
  inputs.forEach(function(i) { sumaCostosKg += parseFloat(i.value || 0); });

  var precioFinalKg  = loteCosto + sumaCostosKg;
  var factor         = factorPresentacion(presentacion, cantidad);
  var precioUnitario = precioFinalKg * factor;
  var totalUsd       = presentacion === 'Granel' ? precioUnitario : precioUnitario * cantidad;

  var pfEl  = document.getElementById('pf-'  + itemId);
  var puEl  = document.getElementById('pu-'  + itemId);
  var totEl = document.getElementById('tot-' + itemId);
  if (pfEl)  pfEl.textContent  = '$' + precioFinalKg.toFixed(4);
  if (puEl)  puEl.textContent  = '$' + precioUnitario.toFixed(4);
  if (totEl) totEl.textContent = '$' + totalUsd.toFixed(2);
}

// ── Resumen ───────────────────────────────────────────────
function renderSummary(items, costos) {
  var grand = 0;
  items.forEach(function(item) {
    var sum = costos
      .filter(function(c) { return c.cot_item_id === item.cot_item_id; })
      .reduce(function(s, c) { return s + parseFloat(c.valor_usd_kg || 0); }, 0);
    var pf     = parseFloat(item.costo_lote_kg || 0) + sum;
    var factor = factorPresentacion(item.presentacion, item.cantidad_unidades);
    var pu     = pf * factor;
    var cant   = parseFloat(item.cantidad_unidades || 0);
    grand += item.presentacion === 'Granel' ? pu : pu * cant;
  });

  var el = document.getElementById('cot-summary');
  if (el) el.innerHTML =
    '<strong>Resumen de cotización</strong>'
    + '<div class="form-grid mt-1">'
      + '<div><label>Ítems</label><strong>' + items.length + '</strong></div>'
      + '<div><label>Total general (USD)</label>'
        + '<strong style="font-size:1.1rem;color:var(--green)">$' + grand.toFixed(2) + '</strong></div>'
    + '</div>';
}

function renderSummaryFromState() {
  if (!cotState) return;
  var grand = 0;
  cotState.items.forEach(function(item) {
    var inputs = document.querySelectorAll('[data-item-id="' + item.cot_item_id + '"]');
    var sumaCostosKg = 0;
    inputs.forEach(function(i) { sumaCostosKg += parseFloat(i.value || 0); });
    var pf     = parseFloat(item.costo_lote_kg || 0) + sumaCostosKg;
    var factor = factorPresentacion(item.presentacion, item.cantidad_unidades);
    var pu     = pf * factor;
    var cant   = parseFloat(item.cantidad_unidades || 0);
    grand += item.presentacion === 'Granel' ? pu : pu * cant;
  });

  var el = document.getElementById('cot-summary');
  if (el) el.innerHTML =
    '<strong>Resumen de cotización</strong>'
    + '<div class="form-grid mt-1">'
      + '<div><label>Ítems</label><strong>' + cotState.items.length + '</strong></div>'
      + '<div><label>Total general (USD)</label>'
        + '<strong style="font-size:1.1rem;color:var(--green)">$' + grand.toFixed(2) + '</strong></div>'
    + '</div>';
}
