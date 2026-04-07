// ============================================================
//  ui.js — Componentes de interfaz
// ============================================================

// showPage vive en app.js — tiene acceso a loadDirectorio y loadRFQList

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

// ── Helpers de moneda ─────────────────────────────────────
function aCOP(valor, moneda, tUSD, tEUR) {
  switch ((moneda || 'COP').toUpperCase()) {
    case 'USD': return valor * parseFloat(tUSD || 1);
    case 'EUR': return valor * parseFloat(tEUR || 1);
    default:    return valor;
  }
}

function formatCOP(v) {
  return '$' + Math.round(v).toLocaleString('es-CO') + ' COP';
}
function formatUSD(v) { return 'US$ ' + parseFloat(v).toFixed(2); }
function formatEUR(v) { return '€ '   + parseFloat(v).toFixed(2); }

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
  var loteId        = sel.value;
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
  var monedaRFQ  = (cotizacion.moneda_solicitada || 'USD').toUpperCase();

  var dispMap = {};
  resultadosDisp.forEach(function(r) { dispMap[r.cot_item_id] = r; });

  // ── Header ────────────────────────────────────────────
  var tasaUSDVal = cotizacion.tasa_usd || '';
  var tasaEURVal = cotizacion.tasa_eur || '';
  var disabledAttr = soloLectura ? ' disabled' : '';

  document.getElementById('cot-header-info').innerHTML =
    '<div><label>ID Cotización</label><strong style="font-size:.82rem">' + cotizacion.cotizacion_id + '</strong></div>' +
    '<div><label>Cliente</label><strong>' + cotizacion.cliente + '</strong></div>' +
    '<div><label>Asesor</label><strong>' + cotizacion.asesor + '</strong></div>' +
    '<div><label>Moneda solicitada</label><span class="tag tag-blue">' + monedaRFQ + '</span></div>' +
    '<div><label>Estado</label><span class="tag ' + (soloLectura ? 'tag-green' : 'tag-yellow') + '">' + cotizacion.estado + '</span></div>' +
    '<div><label>Actualizado</label><span class="text-muted">' + (cotizacion.updated_at || '—') + '</span></div>' +
    (soloLectura ? '<div><span class="tag tag-blue">🔒 Solo lectura</span></div>' : '') +
    '<div style="grid-column:1/-1;display:flex;flex-wrap:wrap;gap:1rem;align-items:center;' +
      'background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);padding:.6rem .9rem;margin-top:.25rem">' +
      '<span style="font-size:.82rem;color:var(--muted)">💱 Tasas:</span>' +
      '<label style="margin:0;white-space:nowrap;font-size:.82rem">1 USD =</label>' +
      '<input id="tasa-usd" type="number" step="1" min="0"' +
        ' value="' + tasaUSDVal + '"' +
        ' placeholder="ej. 4100"' +
        disabledAttr +
        ' oninput="onTasaChange()"' +
        ' style="width:110px;margin:0" />' +
      '<span style="font-size:.82rem;color:var(--muted)">COP</span>' +
      '<label style="margin:0;white-space:nowrap;font-size:.82rem">1 EUR =</label>' +
      '<input id="tasa-eur" type="number" step="1" min="0"' +
        ' value="' + tasaEURVal + '"' +
        ' placeholder="ej. 4500"' +
        disabledAttr +
        ' oninput="onTasaChange()"' +
        ' style="width:110px;margin:0" />' +
      '<span style="font-size:.82rem;color:var(--muted)">COP</span>' +
    '</div>';

  // ── Items ─────────────────────────────────────────────
  var section = document.getElementById('cot-items-section');
  section.innerHTML = '';

  items.forEach(function(item) {
    var dispResult = dispMap[item.cot_item_id] || {};
    var sinDisp    = dispResult.estado === 'sin_disponibilidad';

    var itemCostos   = costos.filter(function(c) { return c.cot_item_id === item.cot_item_id; });
    var tUSD         = parseFloat(tasaUSD || 0);
    var tEUR         = parseFloat(tasaEUR || 0);
    var sumaCostosKgCOP = itemCostos.reduce(function(s, c) {
      return s + aCOP(parseFloat(c.valor_kg || 0), c.moneda, tUSD, tEUR);
    }, 0);
    var pfKgCOP      = parseFloat(item.costo_lote_kg || 0) + sumaCostosKgCOP;
    var factor       = factorPresentacion(item.presentacion, item.cantidad_unidades);
    var puCOP        = pfKgCOP * factor;
    var cant         = parseFloat(item.cantidad_unidades || 0);
    var totalCOP     = item.presentacion === 'Granel' ? puCOP : puCOP * cant;
    var totalUSD     = tUSD > 0 ? totalCOP / tUSD : 0;
    var totalEUR     = tEUR > 0 ? totalCOP / tEUR : 0;

    // Fecha requerida
    var rfqItem  = rfqItems.find(function(r) { return r.rfq_item_id === item.rfq_item_id; }) || {};
    var fechaRaw = rfqItem.fecha_requerida;
    var fechaReq = fechaRaw
      ? (fechaRaw instanceof Date ? fechaRaw.toISOString().slice(0, 10) : String(fechaRaw).slice(0, 10))
      : '—';

    // Badge sin disponibilidad
    var badgeSinDisp = sinDisp
      ? '<span style="background:var(--red);color:#fff;font-size:.72rem;font-weight:700;' +
        'padding:.2rem .6rem;border-radius:99px;margin-left:.5rem">⚠ Sin disponibilidad</span>'
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
          + ' · $' + parseFloat(l.costo_usd_kg).toFixed(0) + ' COP/kg'
          + ' · ' + l.kilos_disponibles + ' kg disp.'
          + '</option>';
      });
      selectorLote =
        '<div style="margin-bottom:.75rem">' +
          '<label>Lote disponible <span class="tag tag-yellow" style="margin-left:.5rem">' +
            dispResult.lotes.length + ' opciones</span></label>' +
          '<select data-lote-selector="1"' +
            ' data-cot-item-id="' + item.cot_item_id + '"' +
            ' data-lote-original="' + (item.lote_id || '') + '"' +
            ' onchange="onLoteChange(this, \'' + item.cot_item_id + '\', ' + cant + ', \'' + item.presentacion + '\')">' +
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

    // Filas de costos
    var costoRowsHtml = '';
    itemCostos.forEach(function(c) {
      var f    = factorPresentacion(item.presentacion, item.cantidad_unidades);
      var v    = parseFloat(c.valor_kg || 0);
      var mon  = (c.moneda || 'COP').toUpperCase();
      var vCOP = aCOP(v, mon, tUSD, tEUR);
      var sub  = item.presentacion === 'Granel' ? vCOP * f : vCOP * f * cant;

      var inputCell = soloLectura
        ? '<td>' + Math.round(v).toLocaleString('es-CO') +
            ' <span class="tag tag-blue" style="font-size:.65rem">' + mon + '</span></td>'
        : '<td style="display:flex;gap:.3rem;align-items:center">' +
            '<input type="number" step="1" value="' + Math.round(v) + '"' +
            ' data-costo-id="'     + c.costo_id            + '"' +
            ' data-item-id="'      + item.cot_item_id       + '"' +
            ' data-cantidad="'     + item.cantidad_unidades  + '"' +
            ' data-presentacion="' + item.presentacion       + '"' +
            ' data-lote-costo="'   + item.costo_lote_kg      + '"' +
            ' data-moneda="'       + mon                     + '"' +
            ' onchange="onCostoChange(this)" style="width:110px" />' +
            '<span class="tag tag-blue" style="font-size:.65rem">' + mon + '</span>' +
          '</td>';

      costoRowsHtml +=
        '<tr id="row-' + c.costo_id + '">' +
          '<td>' + c.nombre + '</td>' +
          '<td><span class="tag tag-blue">' + c.tipo + '</span></td>' +
          inputCell +
          '<td class="text-muted" style="font-size:.75rem">x ' + f.toFixed(4) + '</td>' +
          '<td id="sub-' + c.costo_id + '">' + formatCOP(sub) + '</td>' +
        '</tr>';
    });

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
          '<span' + (!fechaRaw ? ' style="color:var(--red)"' : '') + '>' + fechaReq + '</span></div>' +
        '<div><label>Estado proceso</label>' +
          '<span class="tag tag-blue">' + (item.estado_proceso || '—') + '</span></div>' +
        '<div><label>Presentación</label><span>' + item.presentacion + '</span></div>' +
        '<div><label>Cantidad</label><span>' + item.cantidad_unidades + ' ' + labelUnidad(item.presentacion) + '</span></div>' +
        '<div><label>Costo lote (COP/kg)</label>' +
          '<span' + (sinDisp ? ' style="color:var(--red);font-weight:700"' : '') + '>' +
          formatCOP(parseFloat(item.costo_lote_kg || 0)) + '</span></div>' +
        '<div><label>Total COP</label><strong id="tot-cop-' + item.cot_item_id + '">' + formatCOP(totalCOP) + '</strong></div>' +
        '<div><label>Total USD</label><strong id="tot-usd-' + item.cot_item_id + '">' + formatUSD(totalUSD) + '</strong></div>' +
        '<div><label>Total EUR</label><strong id="tot-eur-' + item.cot_item_id + '">' + formatEUR(totalEUR) + '</strong></div>' +
      '</div>' +
      selectorLote +
      '<div class="tbl-wrap"><table>' +
        '<thead><tr><th>Costo</th><th>Tipo</th><th>Valor/kg</th><th>Factor</th><th>Subtotal COP</th></tr></thead>' +
        '<tbody>' + costoRowsHtml + '</tbody>' +
      '</table></div>' +
      // Perfil sensorial — editable o solo lectura
      '<div style="margin-top:.75rem">' +
        '<label style="font-weight:700;color:var(--accent2)">Perfil sensorial' +
          (!soloLectura ? ' <span style="color:var(--red);font-size:.75rem">* obligatorio</span>' : '') +
        '</label>' +
        (soloLectura
          ? '<p style="font-size:.88rem;margin-top:.3rem;line-height:1.6">' +
              (item.perfil_sensorial || '<em style="color:var(--muted)">Sin perfil sensorial</em>') +
            '</p>'
          : '<textarea' +
              ' data-perfil-item="' + item.cot_item_id + '"' +
              ' rows="3"' +
              ' placeholder="Ej. Notas a durazno, jazmín y panela con acidez brillante y cuerpo sedoso..."' +
              ' style="margin-top:.3rem;resize:vertical;font-size:.85rem"' +
            '>' + (item.perfil_sensorial || '') + '</textarea>'
        ) +
      '</div>' +
      (!soloLectura ? '<p class="text-muted mt-1">cot_item_id: <code>' + item.cot_item_id + '</code></p>' : '');

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
  var moneda       = input.dataset.moneda || 'COP';
  var newVal       = parseFloat(input.value || 0);

  pendingEdits[costoId] = { costo_id: costoId, valor_kg: newVal, cot_item_id: itemId };

  var tUSD   = parseFloat(tasaUSD || 0);
  var tEUR   = parseFloat(tasaEUR || 0);
  var factor = factorPresentacion(presentacion, cantidad);
  var vCOP   = aCOP(newVal, moneda, tUSD, tEUR);
  var subCOP = presentacion === 'Granel' ? vCOP * factor : vCOP * factor * cantidad;

  var subEl = document.getElementById('sub-' + costoId);
  if (subEl) subEl.textContent = formatCOP(subCOP);

  recalcItemUI(itemId, loteCosto, cantidad, presentacion);
  renderSummaryFromState();
}

function recalcItemUI(itemId, loteCosto, cantidad, presentacion) {
  var tUSD = parseFloat(tasaUSD || 0);
  var tEUR = parseFloat(tasaEUR || 0);

  var inputs = document.querySelectorAll('[data-item-id="' + itemId + '"]');
  var sumaCOP = 0;
  inputs.forEach(function(inp) {
    var mon = inp.dataset.moneda || 'COP';
    sumaCOP += aCOP(parseFloat(inp.value || 0), mon, tUSD, tEUR);
  });

  var pfKgCOP    = loteCosto + sumaCOP;
  var factor     = factorPresentacion(presentacion, cantidad);
  var puCOP      = pfKgCOP * factor;
  var totalCOP   = presentacion === 'Granel' ? puCOP : puCOP * cantidad;
  var totalUSD   = tUSD > 0 ? totalCOP / tUSD : 0;
  var totalEUR   = tEUR > 0 ? totalCOP / tEUR : 0;

  var copEl = document.getElementById('tot-cop-' + itemId);
  var usdEl = document.getElementById('tot-usd-' + itemId);
  var eurEl = document.getElementById('tot-eur-' + itemId);
  if (copEl) copEl.textContent = formatCOP(totalCOP);
  if (usdEl) usdEl.textContent = formatUSD(totalUSD);
  if (eurEl) eurEl.textContent = formatEUR(totalEUR);
}

// ── Resumen multicurrency ─────────────────────────────────
function renderSummary(items, costos) {
  var tUSD   = parseFloat(tasaUSD || 0);
  var tEUR   = parseFloat(tasaEUR || 0);
  var monRFQ = cotState ? (cotState.cotizacion.moneda_solicitada || 'USD').toUpperCase() : 'USD';

  var grandCOP = 0;
  var itemRows = '';

  items.forEach(function(item) {
    var loteCosto = parseFloat(item.costo_lote_kg || 0);

    // Para cada ítem: priorizar valores editados en DOM sobre cotState
    var inputs = document.querySelectorAll('[data-item-id="' + item.cot_item_id + '"]');
    var sumaCOP = 0;

    if (inputs.length > 0) {
      // Hay inputs en el DOM — leer valores actuales (pueden tener ediciones pendientes)
      inputs.forEach(function(inp) {
        var mon = inp.dataset.moneda || 'COP';
        sumaCOP += aCOP(parseFloat(inp.value || 0), mon, tUSD, tEUR);
      });
    } else {
      // No hay inputs (solo lectura) — usar costos de cotState
      var itemCostos = costos.filter(function(c) { return c.cot_item_id === item.cot_item_id; });
      itemCostos.forEach(function(c) {
        sumaCOP += aCOP(parseFloat(c.valor_kg || 0), c.moneda, tUSD, tEUR);
      });
    }

    var pfKgCOP  = loteCosto + sumaCOP;
    var factor   = factorPresentacion(item.presentacion, item.cantidad_unidades);
    var puCOP    = pfKgCOP * factor;
    var cant     = parseFloat(item.cantidad_unidades || 0);
    var totCOP   = item.presentacion === 'Granel' ? puCOP : puCOP * cant;
    var totUSD   = tUSD > 0 ? totCOP / tUSD : 0;
    var totEUR   = tEUR > 0 ? totCOP / tEUR : 0;
    grandCOP    += totCOP;

    itemRows +=
      '<tr>' +
        '<td>' + (item.variedad || '—') + ' ' + item.presentacion + ' x' + item.cantidad_unidades + '</td>' +
        summaryCell(formatCOP(totCOP), monRFQ === 'COP') +
        summaryCell(formatUSD(totUSD), monRFQ === 'USD') +
        summaryCell(formatEUR(totEUR), monRFQ === 'EUR') +
      '</tr>';
  });

  var grandUSD = tUSD > 0 ? grandCOP / tUSD : 0;
  var grandEUR = tEUR > 0 ? grandCOP / tEUR : 0;

  var el = document.getElementById('cot-summary');
  if (!el) return;

  var sinTasas = !tUSD || !tEUR;

  el.innerHTML =
    '<strong>Resumen de cotización</strong>' +
    (sinTasas
      ? '<p style="margin:.4rem 0;font-size:.78rem;color:var(--red)">⚠ Ingresa las tasas de cambio para ver totales en USD y EUR.</p>'
      : '') +
    '<details style="margin-top:.75rem">' +
      '<summary style="cursor:pointer;font-size:.85rem;color:var(--accent2);margin-bottom:.5rem">Ver detalle por ítem ▸</summary>' +
      '<div class="tbl-wrap" style="margin-top:.5rem"><table>' +
        '<thead><tr>' +
          '<th>Ítem</th>' +
          summaryTH('COP', monRFQ === 'COP') +
          summaryTH('USD', monRFQ === 'USD') +
          summaryTH('EUR', monRFQ === 'EUR') +
        '</tr></thead>' +
        '<tbody>' + itemRows + '</tbody>' +
      '</table></div>' +
    '</details>' +
    '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:.75rem;margin-top:.75rem">' +
      summaryCard('Total COP', formatCOP(grandCOP), monRFQ === 'COP') +
      summaryCard('Total USD', formatUSD(grandUSD), monRFQ === 'USD') +
      summaryCard('Total EUR', formatEUR(grandEUR), monRFQ === 'EUR') +
    '</div>';
}

function summaryTH(label, resaltado) {
  return '<th' + (resaltado ? ' style="background:#8b6240"' : '') + '>' + label + '</th>';
}

function summaryCell(texto, resaltado) {
  return '<td' + (resaltado ? ' style="font-weight:700;color:var(--accent)"' : '') + '>' + texto + '</td>';
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
  renderSummary(cotState.items, cotState.costos);
}
