// ============================================================
//  ui.js — Componentes de interfaz
//  Toast, popup, banner, render de cotización
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

  var html = '<strong>⚠️ Atención — Esta cotización tiene ítems sin disponibilidad</strong>' +
    '<ul style="margin:.5rem 0 0 1rem">';
  sinDisp.forEach(function(r) {
    html += '<li><strong>' + r.variedad + '</strong>: no hay lotes que cumplan ' +
      'variedad + fecha requerida + stock suficiente.</li>';
  });
  sinFecha.forEach(function(r) {
    html += '<li><strong>' + r.variedad + '</strong>: sin fecha requerida en el RFQ.</li>';
  });
  html += '</ul><p style="margin-top:.5rem;font-size:.8rem">El botón <strong>Imprimir</strong> ' +
    'permanece desactivado hasta resolver todos los ítems.</p>';

  banner.innerHTML = html;
  banner.classList.remove('hidden');
}

// ── Mapa de costos por lote (para selector inline) ────────
var loteCostosMap = {};

function onLoteChange(sel, cotItemId, cantidad, presentacion) {
  var loteId        = sel.value;
  var costosPorLote = loteCostosMap[cotItemId] || {};
  var nuevoCostoKg  = parseFloat(costosPorLote[loteId] || 0);

  document.querySelectorAll('[data-item-id="' + cotItemId + '"]').forEach(function(inp) {
    inp.dataset.loteCosto = nuevoCostoKg;
  });

  recalcItemUI(cotItemId, nuevoCostoKg, cantidad, presentacion);
  renderSummaryFromState();
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

// ── Render cotización ─────────────────────────────────────
function renderCotizacion(data, soloLectura, resultadosDisp) {
  soloLectura    = soloLectura    || false;
  resultadosDisp = resultadosDisp || [];

  var cotizacion = data.cotizacion;
  var items      = data.items;
  var costos     = data.costos;

  var dispMap = {};
  resultadosDisp.forEach(function(r) { dispMap[r.cot_item_id] = r; });

  document.getElementById('cot-header-info').innerHTML =
    '<div><label>ID Cotización</label>' +
      '<strong style="font-size:.82rem">' + cotizacion.cotizacion_id + '</strong></div>' +
    '<div><label>Cliente</label><strong>' + cotizacion.cliente + '</strong></div>' +
    '<div><label>Asesor</label><strong>'  + cotizacion.asesor  + '</strong></div>' +
    '<div><label>Estado</label>' +
      '<span class="tag ' + (soloLectura ? 'tag-green' : 'tag-yellow') + '">' +
      cotizacion.estado + '</span></div>' +
    '<div><label>Actualizado</label>' +
      '<span class="text-muted">' + (cotizacion.updated_at || '—') + '</span></div>' +
    (soloLectura ? '<div><span class="tag tag-blue">🔒 Solo lectura</span></div>' : '');

  var section = document.getElementById('cot-items-section');
  section.innerHTML = '';

  items.forEach(function(item) {
    var dispResult   = dispMap[item.cot_item_id] || {};
    var sinDisp      = dispResult.estado === 'sin_disponibilidad';
    var itemCostos   = costos.filter(function(c) { return c.cot_item_id === item.cot_item_id; });
    var sumaCostosKg = itemCostos.reduce(function(s, c) {
      return s + parseFloat(c.valor_usd_kg || 0);
    }, 0);
    var precioFinalKg  = parseFloat(item.costo_lote_kg || 0) + sumaCostosKg;
    var factor         = factorPresentacion(item.presentacion, item.cantidad_unidades);
    var precioUnitario = precioFinalKg * factor;
    var cantidad       = parseFloat(item.cantidad_unidades || 0);
    var totalUsd       = item.presentacion === 'Granel'
      ? precioUnitario
      : precioUnitario * cantidad;

    // Buscar fecha_requerida desde rfq_items via cotState
    var rfqItem      = (cotState && cotState.rfqItems || []).find(function(r) {
      return r.rfq_item_id === item.rfq_item_id;
    }) || {};
    var fechaReq     = rfqItem.fecha_requerida
      ? (rfqItem.fecha_requerida instanceof Date
          ? rfqItem.fecha_requerida.toISOString().slice(0, 10)
          : String(rfqItem.fecha_requerida).slice(0, 10))
      : '—';

    // ── Selector de lote ──────────────────────────────────
    var selectorLote = '';
    if (!soloLectura && dispResult.lotes && dispResult.lotes.length > 1) {
      // Guardar costos en mapa para onLoteChange
      loteCostosMap[item.cot_item_id] = {};
      dispResult.lotes.forEach(function(l) {
        loteCostosMap[item.cot_item_id][l.lote_id] = parseFloat(l.costo_usd_kg || 0);
      });

      var optsHtml = '';
      dispResult.lotes.forEach(function(l) {
        var sel = (l.lote_id === item.lote_id) ? ' selected' : '';
        optsHtml += '<option value="' + l.lote_id + '"' + sel + '>' +
          l.origen + ' · ' + l.proceso +
          ' · $' + parseFloat(l.costo_usd_kg).toFixed(2) + '/kg' +
          ' · ' + l.kilos_disponibles + ' kg disp.' +
          '</option>';
      });

      var cbName = 'onLoteChange(this,' +
        JSON.stringify(item.cot_item_id) + ',' +
        parseFloat(item.cantidad_unidades) + ',' +
        JSON.stringify(item.presentacion) + ')';

      selectorLote =
        '<div style="margin-bottom:.75rem">' +
          '<label>Lote disponible ' +
            '<span class="tag tag-yellow" style="margin-left:.5rem">' +
              dispResult.lotes.length + ' opciones</span>' +
          '</label>' +
          '<select data-lote-selector="1"' +
            ' data-cot-item-id="' + item.cot_item_id + '"' +
            ' data-lote-original="' + (item.lote_id || '') + '"' +
            ' onchange="' + cbName + '">' +
            optsHtml +
          '</select>' +
        '</div>';

    } else if (!soloLectura && item.lote_id) {
      selectorLote =
        '<div style="margin-bottom:.75rem">' +
          '<label>Lote asignado</label>' +
          '<span style="font-size:.85rem">' + item.lote_id + '</span>' +
        '</div>';
    }

    // ── Card ──────────────────────────────────────────────
    var badgeSinDisp = sinDisp
      ? '<span style="background:var(--red);color:#fff;font-size:.72rem;font-weight:700;' +
        'padding:.2rem .6rem;border-radius:99px;margin-left:.5rem">⚠ Sin disponibilidad</span>'
      : '';

    var card = document.createElement('div');
    card.className = 'card';
    if (sinDisp) card.style.border = '2px solid var(--red)';

    card.innerHTML =
      '<div class="card-title">' +
        '📦 ' + (item.variedad || '—') + ' · ' + (item.origen || '—') +
        ' <span class="tag tag-blue" style="margin-left:.5rem">' + item.presentacion + '</span>' +
        ' <span class="tag tag-green" style="margin-left:.25rem">' + item.tier + '</span>' +
        badgeSinDisp +
      '</div>' +
      '<div class="form-grid" style="margin-bottom:.75rem">' +
        '<div><label>Fecha requerida</label>' +
          '<span' + (!rfqItem.fecha_requerida ? ' style="color:var(--red)"' : '') + '>' +
          fechaReq + '</span></div>' +
        '<div><label>Presentación</label><span>' + item.presentacion + '</span></div>' +
        '<div><label>Cantidad</label><span>' +
          item.cantidad_unidades + ' ' + labelUnidad(item.presentacion) + '</span></div>' +
        '<div><label>Costo lote (USD/kg)</label>' +
          '<span' + (sinDisp ? ' style="color:var(--red);font-weight:700"' : '') + '>' +
          '
      selectorLote +
      '<div class="tbl-wrap">' +
        '<table>' +
          '<thead><tr>' +
            '<th>Costo</th><th>Tipo</th><th>USD/kg</th><th>Factor</th><th>Subtotal</th>' +
          '</tr></thead>' +
          '<tbody>' +
            renderCostoRows(itemCostos, item, soloLectura) +
          '</tbody>' +
        '</table>' +
      '</div>' +
      (!soloLectura
        ? '<p class="text-muted mt-1">cot_item_id: <code>' + item.cot_item_id + '</code></p>'
        : '');

    section.appendChild(card);
  });

  renderSummary(items, costos);
}

function renderCostoRows(itemCostos, item, soloLectura) {
  var html = '';
  itemCostos.forEach(function(c) {
    var factor = factorPresentacion(item.presentacion, item.cantidad_unidades);
    var val    = parseFloat(c.valor_usd_kg || 0);
    var cant   = parseFloat(item.cantidad_unidades || 0);
    var sub    = item.presentacion === 'Granel' ? val * factor : val * factor * cant;

    var inputCell = soloLectura
      ? '<td>$' + val.toFixed(4) + '</td>'
      : '<td><input type="number" step="0.0001" value="' + val.toFixed(4) + '"' +
          ' data-costo-id="'    + c.costo_id            + '"' +
          ' data-item-id="'     + item.cot_item_id       + '"' +
          ' data-cantidad="'    + item.cantidad_unidades  + '"' +
          ' data-presentacion="'+ item.presentacion       + '"' +
          ' data-lote-costo="'  + item.costo_lote_kg      + '"' +
          ' onchange="onCostoChange(this)" style="width:100px" /></td>';

    html +=
      '<tr id="row-' + c.costo_id + '">' +
        '<td>' + c.nombre + '</td>' +
        '<td><span class="tag tag-blue">' + c.tipo + '</span></td>' +
        inputCell +
        '<td class="text-muted" style="font-size:.75rem">× ' + factor.toFixed(4) + '</td>' +
        '<td id="sub-' + c.costo_id + '">$' + sub.toFixed(2) + '</td>' +
      '</tr>';
  });
  return html;
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
    '<strong>Resumen de cotización</strong>' +
    '<div class="form-grid mt-1">' +
      '<div><label>Ítems</label><strong>' + items.length + '</strong></div>' +
      '<div><label>Total general (USD)</label>' +
        '<strong style="font-size:1.1rem;color:var(--green)">$' + grand.toFixed(2) + '</strong></div>' +
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
    '<strong>Resumen de cotización</strong>' +
    '<div class="form-grid mt-1">' +
      '<div><label>Ítems</label><strong>' + cotState.items.length + '</strong></div>' +
      '<div><label>Total general (USD)</label>' +
        '<strong style="font-size:1.1rem;color:var(--green)">$' + grand.toFixed(2) + '</strong></div>' +
    '</div>';
}
 + parseFloat(item.costo_lote_kg || 0).toFixed(4) + '</span></div>' +
        '<div><label>Precio/kg final</label>' +
          '<strong id="pf-' + item.cot_item_id + '">
      selectorLote +
      '<div class="tbl-wrap">' +
        '<table>' +
          '<thead><tr>' +
            '<th>Costo</th><th>Tipo</th><th>USD/kg</th><th>Factor</th><th>Subtotal</th>' +
          '</tr></thead>' +
          '<tbody>' +
            renderCostoRows(itemCostos, item, soloLectura) +
          '</tbody>' +
        '</table>' +
      '</div>' +
      (!soloLectura
        ? '<p class="text-muted mt-1">cot_item_id: <code>' + item.cot_item_id + '</code></p>'
        : '');

    section.appendChild(card);
  });

  renderSummary(items, costos);
}

function renderCostoRows(itemCostos, item, soloLectura) {
  var html = '';
  itemCostos.forEach(function(c) {
    var factor = factorPresentacion(item.presentacion, item.cantidad_unidades);
    var val    = parseFloat(c.valor_usd_kg || 0);
    var cant   = parseFloat(item.cantidad_unidades || 0);
    var sub    = item.presentacion === 'Granel' ? val * factor : val * factor * cant;

    var inputCell = soloLectura
      ? '<td>$' + val.toFixed(4) + '</td>'
      : '<td><input type="number" step="0.0001" value="' + val.toFixed(4) + '"' +
          ' data-costo-id="'    + c.costo_id            + '"' +
          ' data-item-id="'     + item.cot_item_id       + '"' +
          ' data-cantidad="'    + item.cantidad_unidades  + '"' +
          ' data-presentacion="'+ item.presentacion       + '"' +
          ' data-lote-costo="'  + item.costo_lote_kg      + '"' +
          ' onchange="onCostoChange(this)" style="width:100px" /></td>';

    html +=
      '<tr id="row-' + c.costo_id + '">' +
        '<td>' + c.nombre + '</td>' +
        '<td><span class="tag tag-blue">' + c.tipo + '</span></td>' +
        inputCell +
        '<td class="text-muted" style="font-size:.75rem">× ' + factor.toFixed(4) + '</td>' +
        '<td id="sub-' + c.costo_id + '">$' + sub.toFixed(2) + '</td>' +
      '</tr>';
  });
  return html;
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
    '<strong>Resumen de cotización</strong>' +
    '<div class="form-grid mt-1">' +
      '<div><label>Ítems</label><strong>' + items.length + '</strong></div>' +
      '<div><label>Total general (USD)</label>' +
        '<strong style="font-size:1.1rem;color:var(--green)">$' + grand.toFixed(2) + '</strong></div>' +
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
    '<strong>Resumen de cotización</strong>' +
    '<div class="form-grid mt-1">' +
      '<div><label>Ítems</label><strong>' + cotState.items.length + '</strong></div>' +
      '<div><label>Total general (USD)</label>' +
        '<strong style="font-size:1.1rem;color:var(--green)">$' + grand.toFixed(2) + '</strong></div>' +
    '</div>';
}
 + precioFinalKg.toFixed(4) + '</strong></div>' +
        '<div><label>Precio/' + labelUnidad(item.presentacion) + '</label>' +
          '<strong id="pu-' + item.cot_item_id + '">
      selectorLote +
      '<div class="tbl-wrap">' +
        '<table>' +
          '<thead><tr>' +
            '<th>Costo</th><th>Tipo</th><th>USD/kg</th><th>Factor</th><th>Subtotal</th>' +
          '</tr></thead>' +
          '<tbody>' +
            renderCostoRows(itemCostos, item, soloLectura) +
          '</tbody>' +
        '</table>' +
      '</div>' +
      (!soloLectura
        ? '<p class="text-muted mt-1">cot_item_id: <code>' + item.cot_item_id + '</code></p>'
        : '');

    section.appendChild(card);
  });

  renderSummary(items, costos);
}

function renderCostoRows(itemCostos, item, soloLectura) {
  var html = '';
  itemCostos.forEach(function(c) {
    var factor = factorPresentacion(item.presentacion, item.cantidad_unidades);
    var val    = parseFloat(c.valor_usd_kg || 0);
    var cant   = parseFloat(item.cantidad_unidades || 0);
    var sub    = item.presentacion === 'Granel' ? val * factor : val * factor * cant;

    var inputCell = soloLectura
      ? '<td>$' + val.toFixed(4) + '</td>'
      : '<td><input type="number" step="0.0001" value="' + val.toFixed(4) + '"' +
          ' data-costo-id="'    + c.costo_id            + '"' +
          ' data-item-id="'     + item.cot_item_id       + '"' +
          ' data-cantidad="'    + item.cantidad_unidades  + '"' +
          ' data-presentacion="'+ item.presentacion       + '"' +
          ' data-lote-costo="'  + item.costo_lote_kg      + '"' +
          ' onchange="onCostoChange(this)" style="width:100px" /></td>';

    html +=
      '<tr id="row-' + c.costo_id + '">' +
        '<td>' + c.nombre + '</td>' +
        '<td><span class="tag tag-blue">' + c.tipo + '</span></td>' +
        inputCell +
        '<td class="text-muted" style="font-size:.75rem">× ' + factor.toFixed(4) + '</td>' +
        '<td id="sub-' + c.costo_id + '">$' + sub.toFixed(2) + '</td>' +
      '</tr>';
  });
  return html;
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
    '<strong>Resumen de cotización</strong>' +
    '<div class="form-grid mt-1">' +
      '<div><label>Ítems</label><strong>' + items.length + '</strong></div>' +
      '<div><label>Total general (USD)</label>' +
        '<strong style="font-size:1.1rem;color:var(--green)">$' + grand.toFixed(2) + '</strong></div>' +
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
    '<strong>Resumen de cotización</strong>' +
    '<div class="form-grid mt-1">' +
      '<div><label>Ítems</label><strong>' + cotState.items.length + '</strong></div>' +
      '<div><label>Total general (USD)</label>' +
        '<strong style="font-size:1.1rem;color:var(--green)">$' + grand.toFixed(2) + '</strong></div>' +
    '</div>';
}
 + precioUnitario.toFixed(4) + '</strong></div>' +
        '<div><label>Total (USD)</label>' +
          '<strong id="tot-' + item.cot_item_id + '">
      selectorLote +
      '<div class="tbl-wrap">' +
        '<table>' +
          '<thead><tr>' +
            '<th>Costo</th><th>Tipo</th><th>USD/kg</th><th>Factor</th><th>Subtotal</th>' +
          '</tr></thead>' +
          '<tbody>' +
            renderCostoRows(itemCostos, item, soloLectura) +
          '</tbody>' +
        '</table>' +
      '</div>' +
      (!soloLectura
        ? '<p class="text-muted mt-1">cot_item_id: <code>' + item.cot_item_id + '</code></p>'
        : '');

    section.appendChild(card);
  });

  renderSummary(items, costos);
}

function renderCostoRows(itemCostos, item, soloLectura) {
  var html = '';
  itemCostos.forEach(function(c) {
    var factor = factorPresentacion(item.presentacion, item.cantidad_unidades);
    var val    = parseFloat(c.valor_usd_kg || 0);
    var cant   = parseFloat(item.cantidad_unidades || 0);
    var sub    = item.presentacion === 'Granel' ? val * factor : val * factor * cant;

    var inputCell = soloLectura
      ? '<td>$' + val.toFixed(4) + '</td>'
      : '<td><input type="number" step="0.0001" value="' + val.toFixed(4) + '"' +
          ' data-costo-id="'    + c.costo_id            + '"' +
          ' data-item-id="'     + item.cot_item_id       + '"' +
          ' data-cantidad="'    + item.cantidad_unidades  + '"' +
          ' data-presentacion="'+ item.presentacion       + '"' +
          ' data-lote-costo="'  + item.costo_lote_kg      + '"' +
          ' onchange="onCostoChange(this)" style="width:100px" /></td>';

    html +=
      '<tr id="row-' + c.costo_id + '">' +
        '<td>' + c.nombre + '</td>' +
        '<td><span class="tag tag-blue">' + c.tipo + '</span></td>' +
        inputCell +
        '<td class="text-muted" style="font-size:.75rem">× ' + factor.toFixed(4) + '</td>' +
        '<td id="sub-' + c.costo_id + '">$' + sub.toFixed(2) + '</td>' +
      '</tr>';
  });
  return html;
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
    '<strong>Resumen de cotización</strong>' +
    '<div class="form-grid mt-1">' +
      '<div><label>Ítems</label><strong>' + items.length + '</strong></div>' +
      '<div><label>Total general (USD)</label>' +
        '<strong style="font-size:1.1rem;color:var(--green)">$' + grand.toFixed(2) + '</strong></div>' +
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
    '<strong>Resumen de cotización</strong>' +
    '<div class="form-grid mt-1">' +
      '<div><label>Ítems</label><strong>' + cotState.items.length + '</strong></div>' +
      '<div><label>Total general (USD)</label>' +
        '<strong style="font-size:1.1rem;color:var(--green)">$' + grand.toFixed(2) + '</strong></div>' +
    '</div>';
}
 + totalUsd.toFixed(2) + '</strong></div>' +
      '</div>' +
      selectorLote +
      '<div class="tbl-wrap">' +
        '<table>' +
          '<thead><tr>' +
            '<th>Costo</th><th>Tipo</th><th>USD/kg</th><th>Factor</th><th>Subtotal</th>' +
          '</tr></thead>' +
          '<tbody>' +
            renderCostoRows(itemCostos, item, soloLectura) +
          '</tbody>' +
        '</table>' +
      '</div>' +
      (!soloLectura
        ? '<p class="text-muted mt-1">cot_item_id: <code>' + item.cot_item_id + '</code></p>'
        : '');

    section.appendChild(card);
  });

  renderSummary(items, costos);
}

function renderCostoRows(itemCostos, item, soloLectura) {
  var html = '';
  itemCostos.forEach(function(c) {
    var factor = factorPresentacion(item.presentacion, item.cantidad_unidades);
    var val    = parseFloat(c.valor_usd_kg || 0);
    var cant   = parseFloat(item.cantidad_unidades || 0);
    var sub    = item.presentacion === 'Granel' ? val * factor : val * factor * cant;

    var inputCell = soloLectura
      ? '<td>$' + val.toFixed(4) + '</td>'
      : '<td><input type="number" step="0.0001" value="' + val.toFixed(4) + '"' +
          ' data-costo-id="'    + c.costo_id            + '"' +
          ' data-item-id="'     + item.cot_item_id       + '"' +
          ' data-cantidad="'    + item.cantidad_unidades  + '"' +
          ' data-presentacion="'+ item.presentacion       + '"' +
          ' data-lote-costo="'  + item.costo_lote_kg      + '"' +
          ' onchange="onCostoChange(this)" style="width:100px" /></td>';

    html +=
      '<tr id="row-' + c.costo_id + '">' +
        '<td>' + c.nombre + '</td>' +
        '<td><span class="tag tag-blue">' + c.tipo + '</span></td>' +
        inputCell +
        '<td class="text-muted" style="font-size:.75rem">× ' + factor.toFixed(4) + '</td>' +
        '<td id="sub-' + c.costo_id + '">$' + sub.toFixed(2) + '</td>' +
      '</tr>';
  });
  return html;
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
    '<strong>Resumen de cotización</strong>' +
    '<div class="form-grid mt-1">' +
      '<div><label>Ítems</label><strong>' + items.length + '</strong></div>' +
      '<div><label>Total general (USD)</label>' +
        '<strong style="font-size:1.1rem;color:var(--green)">$' + grand.toFixed(2) + '</strong></div>' +
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
    '<strong>Resumen de cotización</strong>' +
    '<div class="form-grid mt-1">' +
      '<div><label>Ítems</label><strong>' + cotState.items.length + '</strong></div>' +
      '<div><label>Total general (USD)</label>' +
        '<strong style="font-size:1.1rem;color:var(--green)">$' + grand.toFixed(2) + '</strong></div>' +
    '</div>';
}
