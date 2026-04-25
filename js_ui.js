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
function renderDisponibilidadBanner(resultados, conversionesFaltantes) {
  var banner    = document.getElementById('disponibilidad-banner');
  var sinDisp   = resultados.filter(function(r) { return r.estado === 'sin_disponibilidad'; });
  var sinFecha  = resultados.filter(function(r) { return r.estado === 'sin_fecha_requerida'; });
  var huerfanos = conversionesFaltantes || [];

  if (!sinDisp.length && !sinFecha.length && !huerfanos.length) {
    banner.classList.add('hidden');
    return;
  }

  var html = '';

  if (sinDisp.length || sinFecha.length) {
    html += '<strong>⚠️ Atención — ítems sin disponibilidad</strong><ul style="margin:.5rem 0 0 1rem">';
    sinDisp.forEach(function(r) {
      html += '<li><strong>' + r.variedad + '</strong>: no hay lotes que cumplan variedad, fecha y stock.</li>';
    });
    sinFecha.forEach(function(r) {
      html += '<li><strong>' + r.variedad + '</strong>: sin fecha requerida en el RFQ.</li>';
    });
    html += '</ul><p style="margin-top:.5rem;font-size:.8rem">Imprimir desactivado hasta resolver.</p>';
  }

  if (huerfanos.length) {
    html += '<p style="margin-top:.6rem"><strong>⚠️ Conversiones faltantes</strong> — las siguientes combinaciones no tienen ruta en <em>conversiones_tipo</em>:</p>';
    html += '<ul style="margin:.3rem 0 0 1rem;font-size:.85rem">';
    huerfanos.forEach(function(h) {
      html += '<li><code>' + h.de + '</code> → <code>' + h.a + '</code></li>';
    });
    html += '</ul>';
  }

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
function formatMon(v, moneda) {
  switch ((moneda || 'USD').toUpperCase()) {
    case 'USD': return formatUSD(v);
    case 'EUR': return formatEUR(v);
    default:    return formatCOP(v);
  }
}

// ── Helpers de cálculo ────────────────────────────────────
function factorPresentacion(presentacion) {
  var p = (presentacion || '').trim();
  if (presentacionesCache) {
    for (var i = 0; i < presentacionesCache.length; i++) {
      if (String(presentacionesCache[i].nombre).trim() === p) {
        return parseFloat(presentacionesCache[i].relacion_kilo || 1);
      }
    }
  }
  switch (p) {
    case '250g':  return 0.25;
    case '500g':  return 0.5;
    case '1Kg':   return 1;
    case '12Kg':  return 12;
    default:      return 1;
  }
}

function labelUnidad(presentacion) {
  return presentacion === 'Granel' ? 'lote' : 'bolsa ' + presentacion;
}

// ── Incoterms ─────────────────────────────────────────────
var INCOTERMS = [
  { id: 1, nombre: 'EXW' },
  { id: 2, nombre: 'FOB' },
  { id: 3, nombre: 'CIF' },
  { id: 4, nombre: 'DDP' },
];

// Costo total acumulado hasta el nivel de incoterm dado (en COP)
// El costo base del lote (disponibilidades) siempre se incluye en nivel >= 1
function calcIncotermTotal(loteCosto, itemCostos, nivel, tUSD, tEUR, factor, cant) {
  if (!nivel) return 0;
  var cantKg   = parseFloat(cant) * factor;
  var baseKgCOP = parseFloat(loteCosto || 0); // lote base → EXW
  itemCostos.forEach(function(c) {
    var cNivel = parseFloat(c.incoterm_id || 0);
    if (cNivel > 0 && cNivel <= nivel) {
      baseKgCOP += aCOP(parseFloat(c.valor_kg || 0), c.moneda, tUSD, tEUR);
    }
  });
  return baseKgCOP * cantKg;
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
  var rfqItems   = data.rfqItems   || [];
  var tasas      = data.tasas      || [];
  var comisiones = data.comisiones || [];
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

  // kg totales de todos los ítems (para prorrateo de costos globales)
  var totalKgTodos = 0;
  items.forEach(function(item) {
    var f = factorPresentacion(item.presentacion);
    var c = parseFloat(item.cantidad_unidades || 0);
    totalKgTodos += c * f;
  });

  // Costos globales: los que no tienen cot_item_id
  var globalCostos = costos.filter(function(c) { return !c.cot_item_id; });

  var tblHeader =
    '<thead><tr>' +
      '<th>Costo</th><th>Tipo</th><th>Incoterm</th>' +
      '<th>Valor/Kg (COP)</th><th>Valor/Und (COP)</th>' +
      '<th>Valor Total (COP)</th><th>Valor Total (' + monedaRFQ + ')</th>' +
    '</tr></thead>';

  items.forEach(function(item) {
    var dispResult = dispMap[item.cot_item_id] || {};
    var sinDisp    = dispResult.estado === 'sin_disponibilidad';
    var ignorado   = item.ignorado === true || String(item.ignorado).toUpperCase() === 'TRUE';

    var itemCostos = costos.filter(function(c) { return c.cot_item_id === item.cot_item_id; });
    var tiposAdic  = ['manual', 'logistica', 'financiero'];
    var costosBase = itemCostos.filter(function(c) { return tiposAdic.indexOf((c.tipo || '').toLowerCase()) === -1; });
    var costosAdic = itemCostos.filter(function(c) { return tiposAdic.indexOf((c.tipo || '').toLowerCase()) !== -1; });

    var tUSD = parseFloat(tasaUSD || 0);
    var tEUR = parseFloat(tasaEUR || 0);

    var sumaCostosKgCOP = itemCostos.reduce(function(s, c) {
      return s + aCOP(parseFloat(c.valor_kg || 0), c.moneda, tUSD, tEUR);
    }, 0);

    var pfKgCOP = parseFloat(item.costo_lote_kg || 0) + sumaCostosKgCOP;
    var factor  = factorPresentacion(item.presentacion);
    var cant    = parseFloat(item.cantidad_unidades || 0);
    var cantKg  = cant * factor;
    var puCOP   = pfKgCOP * factor;
    var totalCOP  = puCOP * cant;
    var totalUSD  = tUSD > 0 ? totalCOP / tUSD : 0;
    var totalEUR  = tEUR > 0 ? totalCOP / tEUR : 0;

    var pfKgMon = monedaRFQ === 'USD' && tUSD > 0 ? pfKgCOP / tUSD
                : monedaRFQ === 'EUR' && tEUR > 0 ? pfKgCOP / tEUR : pfKgCOP;
    var puMon   = monedaRFQ === 'USD' && tUSD > 0 ? puCOP / tUSD
                : monedaRFQ === 'EUR' && tEUR > 0 ? puCOP / tEUR : puCOP;

    var costoDispKg  = parseFloat(item.costo_disponibilidad_kg || 0);
    var costoTargetKg = parseFloat(item.costo_lote_kg || 0);
    var coteLoteCOP   = totalCOP;
    var coteLoteMon   = monedaRFQ === 'USD' && tUSD > 0 ? totalCOP / tUSD
                      : monedaRFQ === 'EUR' && tEUR > 0 ? totalCOP / tEUR
                      : totalCOP;

    var rfqItem  = rfqItems.find(function(r) { return r.rfq_item_id === item.rfq_item_id; }) || {};
    var fechaRaw = rfqItem.fecha_requerida;
    var fechaReq = fechaRaw
      ? (fechaRaw instanceof Date ? fechaRaw.toISOString().slice(0, 10) : String(fechaRaw).slice(0, 10))
      : '—';

    var dispBadge = sinDisp
      ? '<span class="tag" style="background:var(--red);color:#fff;margin-left:.4rem">⚠ Sin disponibilidad</span>'
      : '<span class="tag tag-green" style="margin-left:.4rem">✓ Disponible</span>';

    var ignorarHtml = !soloLectura
      ? '<label style="display:flex;align-items:center;gap:.3rem;font-size:.78rem;cursor:pointer;margin-left:auto;white-space:nowrap">' +
          '<input type="checkbox"' + (ignorado ? ' checked' : '') +
          ' onchange="toggleIgnorarItem(this,\'' + item.cot_item_id + '\')" />' +
          'Ignorar' +
        '</label>'
      : (ignorado ? '<span class="tag tag-yellow" style="margin-left:auto">Ignorado</span>' : '');

    // Selector de lote (lógica existente sin cambios)
    var selectorLote = '';
    if (!soloLectura && dispResult.lotes && dispResult.lotes.length > 1) {
      loteCostosMap[item.cot_item_id] = {};
      dispResult.lotes.forEach(function(l) {
        loteCostosMap[item.cot_item_id][l.lote_id] = parseFloat(l.costo_cop_kg || 0);
      });
      var optsHtml = '';
      dispResult.lotes.forEach(function(l) {
        var sel = (l.lote_id === item.lote_id) ? ' selected' : '';
        optsHtml += '<option value="' + l.lote_id + '"' + sel + '>'
          + l.origen + ' · ' + l.proceso
          + ' · $' + parseFloat(l.costo_cop_kg).toFixed(0) + ' COP/kg'
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
            ' onchange="onLoteChange(this,\'' + item.cot_item_id + '\',' + cant + ',\'' + item.presentacion + '\')">' +
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

    // Helper local: genera fila de tabla de costos con nuevas columnas
    function costoRow(c) {
      var v    = parseFloat(c.valor_kg || 0);
      var mon  = (c.moneda || 'COP').toUpperCase();
      var vCOP = aCOP(v, mon, tUSD, tEUR);
      var undCOP  = vCOP * factor;
      var totCOP  = vCOP * factor * cant;
      var totMon  = monedaRFQ === 'USD' && tUSD > 0 ? totCOP / tUSD
                  : monedaRFQ === 'EUR' && tEUR > 0 ? totCOP / tEUR : totCOP;

      var valKgCell = soloLectura
        ? '<td>' + Math.round(vCOP).toLocaleString('es-CO') + '</td>'
        : '<td style="display:flex;gap:.3rem;align-items:center">' +
            '<input type="number" step="1" value="' + Math.round(v) + '"' +
            ' data-costo-id="'     + c.costo_id            + '"' +
            ' data-item-id="'      + item.cot_item_id       + '"' +
            ' data-cantidad="'     + item.cantidad_unidades  + '"' +
            ' data-presentacion="' + item.presentacion       + '"' +
            ' data-lote-costo="'   + item.costo_lote_kg      + '"' +
            ' data-moneda="'       + mon                     + '"' +
            ' onchange="onCostoChange(this)" style="width:100px" />' +
            '<span class="tag tag-blue" style="font-size:.65rem">' + mon + '</span>' +
          '</td>';

      return '<tr id="row-' + c.costo_id + '">' +
        '<td>' + c.nombre + '</td>' +
        '<td><span class="tag tag-blue">' + c.tipo + '</span></td>' +
        '<td>' + (['—','EXW','FOB','CIF','DDP'][parseFloat(c.incoterm_id || 0)] || '—') + '</td>' +
        valKgCell +
        '<td>' + Math.round(undCOP).toLocaleString('es-CO') + '</td>' +
        '<td id="sub-' + c.costo_id + '">' + Math.round(totCOP).toLocaleString('es-CO') + '</td>' +
        '<td>' + formatMon(totMon, monedaRFQ) + '</td>' +
      '</tr>';
    }

    var emptyRow = '<tr><td colspan="7" style="color:var(--muted);font-size:.78rem;text-align:center">Sin registros</td></tr>';
    var costosBaseRows = costosBase.map(costoRow).join('');
    var costosAdicRows = costosAdic.map(costoRow).join('');

    // Valores globales prorrateados para este ítem
    var prorrateoHtml = '';
    if (globalCostos.length && totalKgTodos > 0) {
      var proporcion = cantKg / totalKgTodos;
      var rows = globalCostos.map(function(gc) {
        var vCOP    = aCOP(parseFloat(gc.valor_kg || 0), gc.moneda, tUSD, tEUR);
        var prorCOP = vCOP * proporcion;
        var prorMon    = monedaRFQ === 'USD' && tUSD > 0 ? prorCOP / tUSD
                       : monedaRFQ === 'EUR' && tEUR > 0 ? prorCOP / tEUR : prorCOP;
        return '<tr>' +
          '<td>' + gc.nombre + '</td>' +
          '<td><span class="tag tag-blue">' + gc.tipo + '</span></td>' +
          '<td>' + (proporcion * 100).toFixed(1) + '%</td>' +
          '<td>' + Math.round(prorCOP).toLocaleString('es-CO') + ' COP</td>' +
          '<td>' + formatMon(prorMon, monedaRFQ) + '</td>' +
        '</tr>';
      }).join('');
      prorrateoHtml =
        '<div style="margin-bottom:1rem">' +
          '<div style="font-size:.8rem;font-weight:700;color:var(--accent2);margin-bottom:.35rem">Valores Globales Prorrateados</div>' +
          '<div class="tbl-wrap"><table>' +
            '<thead><tr><th>Costo</th><th>Tipo</th><th>Proporción</th><th>Valor (COP)</th><th>Valor (' + monedaRFQ + ')</th></tr></thead>' +
            '<tbody>' + rows + '</tbody>' +
          '</table></div>' +
        '</div>';
    }

    var card = document.createElement('div');
    card.className = 'card';
    card.dataset.cotItemId = item.cot_item_id;
    if (sinDisp && !ignorado) card.style.border = '2px solid var(--red)';
    if (ignorado) card.style.opacity = '0.55';

    card.innerHTML =
      // ── Encabezado del ítem ──────────────────────────────
      '<div style="display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;' +
        'margin-bottom:.75rem;padding-bottom:.6rem;border-bottom:1px solid var(--border)">' +
        '<span style="font-weight:700;color:var(--accent)">📦 ' + (item.variedad || '—') + '</span>' +
        '<span class="tag tag-blue">' + (item.origen || '—') + '</span>' +
        '<span style="color:var(--muted);font-size:.8rem">→</span>' +
        '<span class="tag tag-green">' + (rfqItem.destino || item.destino || '—') + '</span>' +
        dispBadge +
        ignorarHtml +
      '</div>' +
      // ── Línea 1: datos del ítem ──────────────────────────
      '<div class="form-grid" style="margin-bottom:.75rem">' +
        '<div><label>Fecha requerida</label>' +
          '<span' + (!fechaRaw ? ' style="color:var(--red)"' : '') + '>' + fechaReq + '</span></div>' +
        '<div><label>Presentación</label><span class="tag tag-blue">' + item.presentacion + '</span></div>' +
        '<div><label>Estado proceso</label><span class="tag tag-blue">' + (item.estado_proceso || '—') + '</span></div>' +
        '<div><label>Etiquetas</label><span class="tag tag-green">' + (item.etiquetas || '—') + '</span></div>' +
        '<div><label>Cantidad</label><span>' + item.cantidad_unidades + ' ' + labelUnidad(item.presentacion) + '</span></div>' +
      '</div>' +
      // ── Línea 2: costos por unidad / kg ─────────────────
      '<div class="form-grid" style="margin-bottom:.75rem">' +
        '<div><label>Costo x Und (COP)</label>' +
          '<strong id="pu-cop-' + item.cot_item_id + '">' + formatCOP(puCOP) + '</strong></div>' +
        '<div><label>Costo x Und (' + monedaRFQ + ')</label>' +
          '<strong id="pu-mon-' + item.cot_item_id + '">' + formatMon(puMon, monedaRFQ) + '</strong></div>' +
        '<div><label>Costo x Kg (COP)</label>' +
          '<strong id="pkg-cop-' + item.cot_item_id + '">' + formatCOP(pfKgCOP) + '</strong></div>' +
        '<div><label>Costo x Kg (' + monedaRFQ + ')</label>' +
          '<strong id="pkg-mon-' + item.cot_item_id + '">' + formatMon(pfKgMon, monedaRFQ) + '</strong></div>' +
      '</div>' +
      // ── Línea 3: totales del lote ────────────────────────
      '<div class="form-grid" style="margin-bottom:.75rem">' +
        '<div><label>Costo Compra / Kg (Disponible)</label>' +
          '<strong>' + formatCOP(costoDispKg) + '</strong></div>' +
        '<div><label>Costo Compra / Kg (Target)</label>' +
          '<strong>' + formatCOP(costoTargetKg) + '</strong></div>' +
        '<div><label>Costo Total Lote (COP)</label>' +
          '<strong id="tot-cop-' + item.cot_item_id + '">' + formatCOP(coteLoteCOP) + '</strong></div>' +
        '<div><label>Costo Total Lote (' + monedaRFQ + ')</label>' +
          '<strong id="tot-mon-' + item.cot_item_id + '">' + formatMon(coteLoteMon, monedaRFQ) + '</strong></div>' +
      '</div>' +
      selectorLote +
      // ── Detalle Costos ───────────────────────────────────
      '<div style="margin-bottom:1rem">' +
        '<div style="font-size:.8rem;font-weight:700;color:var(--accent2);margin-bottom:.35rem">Detalle Costos</div>' +
        '<div class="tbl-wrap"><table>' + tblHeader +
          '<tbody>' + (costosBaseRows || emptyRow) + '</tbody>' +
        '</table></div>' +
      '</div>' +
      // ── Costos adicionales ───────────────────────────────
      '<div style="margin-bottom:1rem">' +
        '<div style="font-size:.8rem;font-weight:700;color:var(--accent2);margin-bottom:.35rem">Costos adicionales</div>' +
        '<div class="tbl-wrap"><table>' + tblHeader +
          '<tbody>' + (costosAdicRows || emptyRow) + '</tbody>' +
        '</table></div>' +
      '</div>' +
      // ── Sub-totales por Incoterm ─────────────────────────
      '<div style="margin-bottom:1rem">' +
        '<div style="font-size:.8rem;font-weight:700;color:var(--accent2);margin-bottom:.35rem">Sub-totales por Incoterm</div>' +
        '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:.4rem">' +
        INCOTERMS.map(function(inc) {
          var totInc    = calcIncotermTotal(parseFloat(item.costo_lote_kg || 0), itemCostos, inc.id, tUSD, tEUR, factor, cant);
          var totIncMon = monedaRFQ === 'USD' && tUSD > 0 ? totInc / tUSD
                        : monedaRFQ === 'EUR' && tEUR > 0 ? totInc / tEUR : totInc;
          return '<div style="background:var(--bg);border:1px solid var(--border);border-radius:var(--radius);padding:.4rem .6rem;text-align:center">' +
            '<div style="font-size:.7rem;font-weight:700;color:var(--muted)">' + inc.nombre + '</div>' +
            '<div style="font-size:.8rem;font-weight:700">' + (totInc / 1e6).toFixed(3) + ' MM COP</div>' +
            '<div style="font-size:.7rem;color:var(--muted)">' + formatMon(totIncMon / 1000, monedaRFQ) + ' K</div>' +
          '</div>';
        }).join('') +
        '</div>' +
      '</div>' +
      // ── Comisiones y Descuentos (dinámico) ───────────────
      (function() {
        var emptyComision = '<tr><td colspan="5" style="color:var(--muted);text-align:center;font-size:.78rem">Sin tasas configuradas en la hoja Tasas</td></tr>';
        var comisionRows = tasas.map(function(tasa) {
          var override  = comisiones.filter(function(c) {
            return String(c.cot_item_id) === String(item.cot_item_id)
                && String(c.tasa_id) === String(tasa.tasa_id);
          })[0];
          var tasaValor = override ? parseFloat(override.tasa_valor) : parseFloat(tasa.tasa_valor || 0);
          var nivel     = parseFloat(tasa.incoterm_aplicable || 0);
          var baseTotal = calcIncotermTotal(parseFloat(item.costo_lote_kg || 0), itemCostos, nivel, tUSD, tEUR, factor, cant);
          var descuenta = tasa.descuenta === true || String(tasa.descuenta).toUpperCase() === 'TRUE';
          var valor     = baseTotal * (tasaValor / 100) * (descuenta ? -1 : 1);
          var valorUSD  = tUSD > 0 ? valor / tUSD : 0;
          var valorEUR  = tEUR > 0 ? valor / tEUR : 0;
          var incLabel  = (INCOTERMS.filter(function(i) { return i.id === nivel; })[0] || {}).nombre || '—';

          var pctCell = soloLectura
            ? '<td>' + tasaValor.toFixed(2) + '%</td>'
            : '<td><div style="display:flex;align-items:center;gap:.3rem">' +
                '<input type="number" step="0.01" value="' + tasaValor.toFixed(2) + '"' +
                ' data-comision-item="' + item.cot_item_id + '"' +
                ' data-tasa-id="' + tasa.tasa_id + '"' +
                ' data-base-calculo="' + Math.round(baseTotal) + '"' +
                ' data-descuenta="' + descuenta + '"' +
                ' onchange="onComisionChange(this)"' +
                ' style="width:80px" />' +
                '<span style="font-size:.75rem;color:var(--muted)">%</span>' +
              '</div></td>';

          return '<tr>' +
            '<td>' + (tasa.tasa_detalle || '—') +
              ' <span class="tag tag-blue" style="font-size:.62rem">' + incLabel + '</span>' +
              (descuenta ? ' <span class="tag tag-yellow" style="font-size:.62rem">↓ Desc.</span>' : '') +
            '</td>' +
            pctCell +
            '<td id="com-cop-' + item.cot_item_id + '-' + tasa.tasa_id + '">' + Math.round(valor).toLocaleString('es-CO') + ' COP</td>' +
            '<td id="com-usd-' + item.cot_item_id + '-' + tasa.tasa_id + '">' + formatUSD(valorUSD) + '</td>' +
            '<td id="com-eur-' + item.cot_item_id + '-' + tasa.tasa_id + '">' + formatEUR(valorEUR) + '</td>' +
          '</tr>';
        }).join('');

        return '<div style="margin-bottom:1rem">' +
          '<div style="font-size:.8rem;font-weight:700;color:var(--accent2);margin-bottom:.35rem">Detalle Comisiones y Descuentos</div>' +
          '<div class="tbl-wrap"><table>' +
            '<thead><tr>' +
              '<th>Detalle</th><th>% (Editable)</th>' +
              '<th>Valor (COP)</th><th>Valor (USD)</th><th>Valor (EUR)</th>' +
            '</tr></thead>' +
            '<tbody>' + (comisionRows || emptyComision) + '</tbody>' +
          '</table></div>' +
        '</div>';
      })() +
      prorrateoHtml +
      // ── Perfil sensorial (sin cambios) ───────────────────
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
  var factor = factorPresentacion(presentacion);
  var vCOP   = aCOP(newVal, moneda, tUSD, tEUR);
  var subCOP = vCOP * factor * cantidad;

  var subEl = document.getElementById('sub-' + costoId);
  if (subEl) subEl.textContent = Math.round(subCOP).toLocaleString('es-CO');

  recalcItemUI(itemId, loteCosto, cantidad, presentacion);
  renderSummaryFromState();
}

function recalcItemUI(itemId, loteCosto, cantidad, presentacion) {
  var tUSD   = parseFloat(tasaUSD || 0);
  var tEUR   = parseFloat(tasaEUR || 0);
  var monRFQ = cotState ? (cotState.cotizacion.moneda_solicitada || 'USD').toUpperCase() : 'USD';

  var inputs  = document.querySelectorAll('[data-item-id="' + itemId + '"]');
  var sumaCOP = 0;
  inputs.forEach(function(inp) {
    var mon = inp.dataset.moneda || 'COP';
    sumaCOP += aCOP(parseFloat(inp.value || 0), mon, tUSD, tEUR);
  });

  var pfKgCOP  = loteCosto + sumaCOP;
  var factor   = factorPresentacion(presentacion);
  var cant     = parseFloat(cantidad || 0);
  var puCOP    = pfKgCOP * factor;
  var totalCOP = puCOP * cant;
  var totalUSD = tUSD > 0 ? totalCOP / tUSD : 0;
  var totalEUR = tEUR > 0 ? totalCOP / tEUR : 0;

  var pfKgMon = monRFQ === 'USD' && tUSD > 0 ? pfKgCOP / tUSD
              : monRFQ === 'EUR' && tEUR > 0 ? pfKgCOP / tEUR : pfKgCOP;
  var puMon   = monRFQ === 'USD' && tUSD > 0 ? puCOP / tUSD
              : monRFQ === 'EUR' && tEUR > 0 ? puCOP / tEUR : puCOP;

  var el;
  el = document.getElementById('pu-cop-'  + itemId); if (el) el.textContent = formatCOP(puCOP);
  el = document.getElementById('pu-mon-'  + itemId); if (el) el.textContent = formatMon(puMon, monRFQ);
  el = document.getElementById('pkg-cop-' + itemId); if (el) el.textContent = formatCOP(pfKgCOP);
  el = document.getElementById('pkg-mon-' + itemId); if (el) el.textContent = formatMon(pfKgMon, monRFQ);
  var totalMon = monRFQ === 'USD' && tUSD > 0 ? totalCOP / tUSD
               : monRFQ === 'EUR' && tEUR > 0 ? totalCOP / tEUR
               : totalCOP;
  el = document.getElementById('tot-cop-' + itemId); if (el) el.textContent = formatCOP(totalCOP);
  el = document.getElementById('tot-mon-' + itemId); if (el) el.textContent = formatMon(totalMon, monRFQ);
}

// ── Resumen multicurrency ─────────────────────────────────
function renderSummary(items, costos) {
  var tUSD   = parseFloat(tasaUSD || 0);
  var tEUR   = parseFloat(tasaEUR || 0);
  var monRFQ = cotState ? (cotState.cotizacion.moneda_solicitada || 'USD').toUpperCase() : 'USD';

  var globalCostos = costos.filter(function(c) { return !c.cot_item_id; });
  var tasas        = cotState ? (cotState.tasas      || []) : [];
  var comisiones   = cotState ? (cotState.comisiones || []) : [];

  var grandCOP = 0;
  var grandUSD = 0;
  var grandEUR = 0;

  // ── 1. Ítems ──────────────────────────────────────────────
  var itemRows = '';
  items.forEach(function(item) {
    var loteCosto = parseFloat(item.costo_lote_kg || 0);
    var inputs    = document.querySelectorAll('[data-item-id="' + item.cot_item_id + '"]');
    var sumaCOP   = 0;

    if (inputs.length > 0) {
      inputs.forEach(function(inp) {
        var mon = inp.dataset.moneda || 'COP';
        sumaCOP += aCOP(parseFloat(inp.value || 0), mon, tUSD, tEUR);
      });
    } else {
      var itemCostos = costos.filter(function(c) { return c.cot_item_id === item.cot_item_id; });
      itemCostos.forEach(function(c) {
        sumaCOP += aCOP(parseFloat(c.valor_kg || 0), c.moneda, tUSD, tEUR);
      });
    }

    var pfKgCOP = loteCosto + sumaCOP;
    var factor  = factorPresentacion(item.presentacion);
    var cant    = parseFloat(item.cantidad_unidades || 0);
    var puCOP   = pfKgCOP * factor;
    var totCOP  = puCOP * cant;
    var totUSD  = tUSD > 0 ? totCOP / tUSD : 0;
    var totEUR  = tEUR > 0 ? totCOP / tEUR : 0;

    var pfKgMon = monRFQ === 'USD' && tUSD > 0 ? pfKgCOP / tUSD
                : monRFQ === 'EUR' && tEUR > 0 ? pfKgCOP / tEUR : pfKgCOP;
    var puMon   = monRFQ === 'USD' && tUSD > 0 ? puCOP / tUSD
                : monRFQ === 'EUR' && tEUR > 0 ? puCOP / tEUR : puCOP;

    grandCOP += totCOP;
    grandUSD += totUSD;
    grandEUR += totEUR;

    itemRows +=
      '<tr>' +
        '<td>' + (item.variedad || '—') + ' ' + item.presentacion + ' ×' + item.cantidad_unidades + '</td>' +
        summaryCell(formatCOP(totCOP),   monRFQ === 'COP') +
        summaryCell(formatUSD(totUSD),   monRFQ === 'USD') +
        summaryCell(formatEUR(totEUR),   monRFQ === 'EUR') +
        '<td>' + formatMon(pfKgMon, monRFQ) + '/kg</td>' +
        '<td>' + formatMon(puMon,   monRFQ) + '/und</td>' +
      '</tr>';
  });

  // ── 2. Tasas (grouped across all items) ──────────────────
  var tasaTotals = {}; // { tasa_id: { detalle, cop, usd, eur } }
  if (tasas.length > 0) {
    items.forEach(function(item) {
      var itemCostos = costos.filter(function(c) { return c.cot_item_id === item.cot_item_id; });
      var factor     = factorPresentacion(item.presentacion);
      var cant       = parseFloat(item.cantidad_unidades || 0);
      var loteCosto  = parseFloat(item.costo_lote_kg || 0);

      tasas.forEach(function(tasa) {
        var override  = comisiones.filter(function(c) {
          return String(c.cot_item_id) === String(item.cot_item_id)
              && String(c.tasa_id)     === String(tasa.tasa_id);
        })[0];
        var tasaValor = override ? parseFloat(override.tasa_valor) : parseFloat(tasa.tasa_valor || 0);
        var nivel     = parseFloat(tasa.incoterm_aplicable || 0);
        var baseTotal = calcIncotermTotal(loteCosto, itemCostos, nivel, tUSD, tEUR, factor, cant);
        var descuenta = tasa.descuenta === true || String(tasa.descuenta).toUpperCase() === 'TRUE';
        var valor     = baseTotal * (tasaValor / 100) * (descuenta ? -1 : 1);
        var valorUSD  = tUSD > 0 ? valor / tUSD : 0;
        var valorEUR  = tEUR > 0 ? valor / tEUR : 0;

        var tid = String(tasa.tasa_id);
        if (!tasaTotals[tid]) {
          tasaTotals[tid] = { detalle: tasa.tasa_detalle || '—', cop: 0, usd: 0, eur: 0 };
        }
        tasaTotals[tid].cop += valor;
        tasaTotals[tid].usd += valorUSD;
        tasaTotals[tid].eur += valorEUR;
      });
    });
  }

  var tasaRows = '';
  var tasaIds  = Object.keys(tasaTotals);
  for (var t = 0; t < tasaIds.length; t++) {
    var tt = tasaTotals[tasaIds[t]];
    grandCOP += tt.cop;
    grandUSD += tt.usd;
    grandEUR += tt.eur;
    tasaRows +=
      '<tr>' +
        '<td>' + tt.detalle + '</td>' +
        summaryCell(formatCOP(tt.cop), monRFQ === 'COP') +
        summaryCell(formatUSD(tt.usd), monRFQ === 'USD') +
        summaryCell(formatEUR(tt.eur), monRFQ === 'EUR') +
      '</tr>';
  }

  // ── 3. Costos globales ────────────────────────────────────
  // valor_kg stores a flat total in the cost's own currency (not per-kg).
  var globalRows = '';
  globalCostos.forEach(function(gc) {
    var totGCOP = aCOP(parseFloat(gc.valor_kg || 0), gc.moneda, tUSD, tEUR);
    var totGUSD = tUSD > 0 ? totGCOP / tUSD : 0;
    var totGEUR = tEUR > 0 ? totGCOP / tEUR : 0;
    grandCOP += totGCOP;
    grandUSD += totGUSD;
    grandEUR += totGEUR;
    globalRows +=
      '<tr>' +
        '<td>' + gc.nombre + '</td>' +
        summaryCell(formatCOP(totGCOP), monRFQ === 'COP') +
        summaryCell(formatUSD(totGUSD), monRFQ === 'USD') +
        summaryCell(formatEUR(totGEUR), monRFQ === 'EUR') +
      '</tr>';
  });

  // ── Render ────────────────────────────────────────────────
  var el = document.getElementById('cot-summary');
  if (!el) return;

  var sinTasas = !tUSD || !tEUR;

  el.innerHTML =
    '<strong>Resumen de cotización</strong>' +
    (sinTasas
      ? '<p style="margin:.4rem 0;font-size:.78rem;color:var(--red)">⚠ Ingresa las tasas de cambio para ver totales en USD y EUR.</p>'
      : '') +
    // 1. Ítems (collapsible)
    '<details style="margin-top:.75rem">' +
      '<summary style="cursor:pointer;font-size:.85rem;color:var(--accent2);margin-bottom:.5rem">Ver detalle por ítem ▸</summary>' +
      '<div class="tbl-wrap" style="margin-top:.5rem"><table>' +
        '<thead><tr>' +
          '<th>Ítem</th>' +
          summaryTH('Total COP', monRFQ === 'COP') +
          summaryTH('Total USD', monRFQ === 'USD') +
          summaryTH('Total EUR', monRFQ === 'EUR') +
          '<th>' + monRFQ + '/Kg</th>' +
          '<th>' + monRFQ + '/Und</th>' +
        '</tr></thead>' +
        '<tbody>' + itemRows + '</tbody>' +
      '</table></div>' +
    '</details>' +
    // 2. Tasas (solo si existen)
    (tasaIds.length
      ? '<div class="tbl-wrap" style="margin-top:.75rem"><table>' +
          '<thead><tr>' +
            summaryTH('Tasa', false) +
            summaryTH('Total COP', monRFQ === 'COP') +
            summaryTH('Total USD', monRFQ === 'USD') +
            summaryTH('Total EUR', monRFQ === 'EUR') +
          '</tr></thead>' +
          '<tbody>' + tasaRows + '</tbody>' +
        '</table></div>'
      : '') +
    // 3. Costos globales (solo si existen)
    (globalCostos.length
      ? '<div class="tbl-wrap" style="margin-top:.75rem"><table>' +
          '<thead><tr>' +
            summaryTH('Costos Globales', false) +
            summaryTH('Total COP', monRFQ === 'COP') +
            summaryTH('Total USD', monRFQ === 'USD') +
            summaryTH('Total EUR', monRFQ === 'EUR') +
          '</tr></thead>' +
          '<tbody>' + globalRows + '</tbody>' +
        '</table></div>'
      : '') +
    // Gran total
    '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:.75rem;margin-top:.75rem">' +
      summaryCard('Gran Total COP', formatCOP(grandCOP), monRFQ === 'COP') +
      summaryCard('Gran Total USD', formatUSD(grandUSD), monRFQ === 'USD') +
      summaryCard('Gran Total EUR', formatEUR(grandEUR), monRFQ === 'EUR') +
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
