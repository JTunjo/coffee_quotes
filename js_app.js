// ============================================================
//  app.js — Lógica de negocio
//  Depende de: api.js, ui.js
// ============================================================

const USUARIO = 'asesor@cafe.com';

// ── Estado global ─────────────────────────────────────────
var rfqItemCount = 0;
var currentCotId = null;
var cotState     = null;
var pendingEdits = {};
var pendingNew   = [];
var variedades   = [];
var tasaUSD      = 0;
var tasaEUR      = 0;

// ══════════════════════════════════════════════════════════
//  RFQ
// ══════════════════════════════════════════════════════════

function buildVariedadOptions() {
  if (!variedades.length) {
    return '<option value="">— Sin variedades cargadas —</option>';
  }
  return '<option value="">Selecciona…</option>' +
    variedades.map(function(v) {
      return '<option value="' + v + '">' + v + '</option>';
    }).join('');
}

function refreshVariedadSelects() {
  document.querySelectorAll('select[data-field="variedad"]').forEach(function(sel) {
    var current = sel.value;
    sel.innerHTML = buildVariedadOptions();
    if (current) sel.value = current;
  });
}

function addRfqItem() {
  rfqItemCount++;
  var id  = 'item-' + rfqItemCount;
  var div = document.createElement('div');
  div.className = 'item-row';
  div.id = id;
  div.innerHTML =
    '<div><label>Variedad</label>' +
      '<select data-field="variedad">' + buildVariedadOptions() + '</select></div>' +
    '<div><label>Origen</label>' +
      '<input placeholder="Ej. Huila" data-field="origen" /></div>' +
    '<div><label>Destino</label>' +
      '<input placeholder="Ej. Oslo, Noruega" data-field="destino" /></div>' +
    '<div><label>Fecha requerida</label>' +
      '<input type="date" data-field="fecha_requerida" /></div>' +
    '<div><label>Cantidad</label>' +
      '<input type="number" min="1" value="100" data-field="cantidad_unidades" /></div>' +
    '<div><label>Presentación</label>' +
      '<select data-field="presentacion">' +
        '<option value="250g">250g</option>' +
        '<option value="500g">500g</option>' +
        '<option value="1Kg" selected>1 Kg</option>' +
        '<option value="12Kg">12 Kg</option>' +
        '<option value="Granel">Granel</option>' +
      '</select></div>' +
    '<div><label>Tier</label>' +
      '<select data-field="tier">' +
        '<option value="estandar">Estándar</option>' +
        '<option value="lavado">Lavado</option>' +
        '<option value="fermentado">Fermentado</option>' +
        '<option value="especial">Especial</option>' +
      '</select></div>' +
    '<div><label>Lote ID (opcional)</label>' +
      '<input placeholder="auto" data-field="lote_id" /></div>' +
    '<div style="grid-column:1/-1">' +
      '<label>Perfil sensorial <span style="color:var(--muted);font-weight:400">(opcional)</span></label>' +
      '<textarea data-field="perfil_sensorial" rows="2" ' +
        'placeholder="Ej. Notas a durazno, jazmín y panela con acidez brillante y cuerpo sedoso..." ' +
        'style="resize:vertical;font-size:.85rem"></textarea>' +
    '</div>' +
    '<div style="padding-top:1.2rem">' +
      '<button class="btn btn-danger btn-sm" ' +
        'onclick="document.getElementById(\'' + id + '\').remove()">✕</button></div>';
  document.getElementById('rfq-items-container').appendChild(div);
}

function collectRfqItems() {
  return Array.from(
    document.querySelectorAll('#rfq-items-container .item-row')
  ).map(function(row) {
    var obj = {};
    row.querySelectorAll('[data-field]').forEach(function(el) {
      obj[el.dataset.field] = el.value;
    });
    return obj;
  });
}

function validateRfqItems(items) {
  var errores = [];
  items.forEach(function(item, i) {
    var n = i + 1;
    if (!item.variedad)           errores.push('Ítem ' + n + ': variedad requerida');
    if (!item.cantidad_unidades || item.cantidad_unidades <= 0)
                                  errores.push('Ítem ' + n + ': cantidad requerida');
    if (!item.presentacion)       errores.push('Ítem ' + n + ': presentación requerida');
    if (!item.fecha_requerida)    errores.push('Ítem ' + n + ': fecha requerida');
    if (!item.destino)            errores.push('Ítem ' + n + ': destino requerido');
  });
  return errores;
}

function resetRfqForm() {
  document.getElementById('rfq-cliente').value = '';
  document.getElementById('rfq-asesor').value  = '';
  document.getElementById('rfq-fecha').value   = new Date().toISOString().slice(0, 10);
  document.getElementById('rfq-moneda').value  = 'USD';
  document.getElementById('rfq-items-container').innerHTML = '';
  rfqItemCount = 0;
  addRfqItem();
}

async function submitRFQ() {
  var cliente = document.getElementById('rfq-cliente').value.trim();
  var asesor  = document.getElementById('rfq-asesor').value.trim();
  var fecha   = document.getElementById('rfq-fecha').value;
  var moneda  = document.getElementById('rfq-moneda').value;
  var items   = collectRfqItems();

  if (!cliente || !asesor) return toast('⚠️ Completa cliente y asesor');
  if (!items.length)        return toast('⚠️ Agrega al menos un ítem');

  var errores = validateRfqItems(items);
  if (errores.length) {
    toast('⚠️ ' + errores[0] + (errores.length > 1 ? ' (+' + (errores.length - 1) + ' más)' : ''));
    return;
  }

  toast('⏳ Creando RFQ...');
  try {
    var res = await apiPost({
      action:            'crearRFQ',
      cliente:           cliente,
      asesor:            asesor,
      fecha:             fecha,
      moneda_solicitada: moneda,
      items:             items,
    });

    var cotId = res && res.cotizacion_id ? res.cotizacion_id : null;
    resetRfqForm();

    if (!res || !res.ok) {
      showPopupError(res && res.error ? res.error : 'Error desconocido del servidor.');
      return;
    }

    showPopupSuccess();
    setTimeout(function() {
      document.getElementById('cot-search-id').value = cotId;
      showPage('cot');
      loadCotizacion(cotId);
    }, 1100);

  } catch(err) {
    resetRfqForm();
    showPopupError('No se pudo conectar con el servidor.');
  }
}

// ══════════════════════════════════════════════════════════
//  Lista de RFQs
// ══════════════════════════════════════════════════════════

async function loadRFQList() {
  var tbody = document.getElementById('rfq-list-body');
  tbody.innerHTML = '<tr><td colspan="6">Cargando...</td></tr>';
  var res = await apiGet({ action: 'listRFQs' });
  if (!res.ok || !res.rfqs.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="color:var(--muted)">Sin RFQs aún.</td></tr>';
    return;
  }
  tbody.innerHTML = res.rfqs.map(function(r) {
    return '<tr>' +
      '<td><code style="font-size:.75rem">' + r.rfq_id.slice(0, 8) + '…</code></td>' +
      '<td>' + r.cliente + '</td>' +
      '<td>' + r.asesor  + '</td>' +
      '<td>' + r.fecha   + '</td>' +
      '<td><span class="tag tag-yellow">' + r.estado + '</span></td>' +
      '<td><button class="btn btn-secondary btn-sm" ' +
        'onclick="openCotFromRFQ(\'' + r.cotizacion_id + '\')">Ver cotización</button></td>' +
      '</tr>';
  }).join('');
}

function openCotFromRFQ(cotId) {
  document.getElementById('cot-search-id').value = cotId;
  showPage('cot');
  loadCotizacion(cotId);
}

// ══════════════════════════════════════════════════════════
//  Cotización
// ══════════════════════════════════════════════════════════

async function loadCotizacion(cotId) {
  cotId = cotId || document.getElementById('cot-search-id').value.trim();
  if (!cotId) return toast('⚠️ Ingresa un ID de cotización');

  toast('⏳ Cargando...');
  var res = await apiGet({ action: 'getCotizacion', cotizacionId: cotId });
  if (!res.ok) return toast('❌ ' + res.error);

  currentCotId      = cotId;
  cotState          = res;
  cotState.rfqItems = res.rfqItems || [];
  tasaUSD           = parseFloat(res.cotizacion.tasa_usd || 0);
  tasaEUR           = parseFloat(res.cotizacion.tasa_eur || 0);
  pendingEdits      = {};
  pendingNew        = [];

  var enviado = (res.cotizacion.estado || '').toLowerCase() === 'enviado';
  renderCotizacion(res, enviado);
  document.getElementById('cot-editor').classList.remove('hidden');
  document.getElementById('seccion-costo-manual').classList.toggle('hidden', enviado);
  document.getElementById('botones-cotizacion').classList.toggle('hidden', enviado);
  document.getElementById('btn-imprimir').disabled = false;

  if (enviado) {
    toast('✅ Cotización enviada — solo lectura');
    return;
  }

  toast('⏳ Verificando disponibilidad...');
  var vRes = await apiGet({ action: 'verificarDisponibilidad', cotizacionId: cotId });
  if (!vRes.ok) { toast('❌ Error al verificar disponibilidad'); return; }

  var res2 = await apiGet({ action: 'getCotizacion', cotizacionId: cotId });
  if (res2.ok) {
    cotState          = res2;
    cotState.rfqItems = res2.rfqItems || [];
    renderCotizacion(res2, false, vRes.resultados);
  }

  renderDisponibilidadBanner(vRes.resultados);
  document.getElementById('btn-imprimir').disabled = vRes.hay_incompletos;
  document.getElementById('btn-imprimir').title = vRes.hay_incompletos
    ? 'Resuelve los ítems sin disponibilidad para imprimir'
    : 'Imprimir cotización';

  toast('✅ Cotización lista');
}

// Llamado al cambiar tasa en el encabezado
function onTasaChange() {
  tasaUSD = parseFloat(document.getElementById('tasa-usd').value || 0);
  tasaEUR = parseFloat(document.getElementById('tasa-eur').value || 0);
  if (cotState) renderSummaryFromState();
}

async function saveCotizacion() {
  if (!currentCotId) return toast('⚠️ No hay cotización cargada');

  var costos        = Object.values(pendingEdits);
  var costos_nuevos = pendingNew;

  // Recoger lotes cambiados
  var lotesCambiados = [];
  document.querySelectorAll('select[data-lote-selector]').forEach(function(sel) {
    if (sel.dataset.loteOriginal !== sel.value) {
      lotesCambiados.push({ cot_item_id: sel.dataset.cotItemId, lote_id: sel.value });
    }
  });

  // Recoger perfiles sensoriales del DOM y validar
  var perfiles       = [];
  var faltanPerfiles = [];
  document.querySelectorAll('textarea[data-perfil-item]').forEach(function(ta) {
    var cotItemId = ta.dataset.perfilItem;
    var valor     = ta.value.trim();
    if (!valor) {
      var item = cotState && cotState.items
        ? cotState.items.filter(function(i) { return i.cot_item_id === cotItemId; })[0]
        : null;
      faltanPerfiles.push(item ? (item.variedad || cotItemId) : cotItemId);
    } else {
      perfiles.push({ cot_item_id: cotItemId, perfil_sensorial: valor });
    }
  });

  if (faltanPerfiles.length) {
    toast('⚠️ Perfil sensorial obligatorio en: ' + faltanPerfiles.join(', '), 5000);
    return;
  }

  var tasaUSDActual  = parseFloat(cotState.cotizacion.tasa_usd || 0);
  var tasaEURActual  = parseFloat(cotState.cotizacion.tasa_eur || 0);
  var sinCambios = !costos.length && !costos_nuevos.length &&
                   !lotesCambiados.length && !perfiles.length &&
                   tasaUSD === tasaUSDActual && tasaEUR === tasaEURActual;
  if (sinCambios) return toast('ℹ️ Sin cambios que guardar');

  toast('⏳ Guardando...');

  for (var i = 0; i < lotesCambiados.length; i++) {
    await apiPost({
      action:        'asignarLote',
      lote_id:       lotesCambiados[i].lote_id,
      cot_item_id:   lotesCambiados[i].cot_item_id,
      cotizacion_id: currentCotId,
    });
  }

  var res = await apiPost({
    action:        'guardarCotizacion',
    cotizacion_id: currentCotId,
    usuario:       USUARIO,
    tasa_usd:      tasaUSD,
    tasa_eur:      tasaEUR,
    costos:        costos,
    costos_nuevos: costos_nuevos,
    perfiles:      perfiles,
  });

  if (!res.ok) return toast('❌ Error: ' + res.error);

  toast('✅ Cotización guardada');
  pendingEdits = {};
  pendingNew   = [];
  renderPendingCostos();
  await loadCotizacion(currentCotId);
}

function resetEditor() {
  pendingEdits = {};
  pendingNew   = [];
  renderPendingCostos();
  if (currentCotId) loadCotizacion(currentCotId);
}

// ── Costos manuales ───────────────────────────────────────

function addManualCost() {
  var nombre = document.getElementById('new-costo-nombre').value.trim();
  var itemId = document.getElementById('new-costo-item').value.trim();
  var valor  = parseFloat(document.getElementById('new-costo-valor').value || 0);
  var moneda = document.getElementById('new-costo-moneda').value;
  var tipo   = document.getElementById('new-costo-tipo').value;

  if (!nombre) return toast('⚠️ El nombre del costo es requerido');

  pendingNew.push({
    nombre:      nombre,
    tipo:        tipo,
    moneda:      moneda,
    valor_kg:    valor,
    cot_item_id: itemId,
  });

  // Limpiar campos
  document.getElementById('new-costo-nombre').value = '';
  document.getElementById('new-costo-item').value   = '';
  document.getElementById('new-costo-valor').value  = '';

  renderPendingCostos();
  toast('✅ Costo "' + nombre + '" agregado a la lista');
}

function removePendingCosto(idx) {
  pendingNew.splice(idx, 1);
  renderPendingCostos();
}

function renderPendingCostos() {
  var wrap = document.getElementById('pending-costos-wrap');
  var body = document.getElementById('pending-costos-body');
  if (!wrap || !body) return;

  if (!pendingNew.length) {
    wrap.classList.add('hidden');
    body.innerHTML = '';
    return;
  }

  wrap.classList.remove('hidden');
  var rows = '';
  for (var i = 0; i < pendingNew.length; i++) {
    var c = pendingNew[i];
    rows +=
      '<tr>' +
        '<td>' + c.nombre + '</td>' +
        '<td><span class="tag tag-blue">' + c.tipo + '</span></td>' +
        '<td><span class="tag tag-yellow">' + c.moneda + '</span></td>' +
        '<td>' + (c.valor_kg || 0).toLocaleString('es-CO') + '</td>' +
        '<td style="font-size:.75rem;color:var(--muted)">' + (c.cot_item_id || 'Global') + '</td>' +
        '<td><button class="btn btn-danger btn-sm" onclick="removePendingCosto(' + i + ')">✕</button></td>' +
      '</tr>';
  }
  body.innerHTML = rows;
}

// ══════════════════════════════════════════════════════════
//  Init
// ══════════════════════════════════════════════════════════

async function init() {
  document.getElementById('rfq-fecha').value = new Date().toISOString().slice(0, 10);
  try {
    var res = await apiGet({ action: 'getVariedades' });
    console.log('[init] getVariedades →', res);
    if (res && res.ok && res.variedades && res.variedades.length) {
      variedades = res.variedades.map(function(v) { return String(v.nombre).trim(); });
      console.log('[init] variedades cargadas:', variedades);
    } else {
      console.warn('[init] No se cargaron variedades:', res);
    }
  } catch(e) {
    console.error('[init] Error:', e);
  }
  addRfqItem();
}

document.addEventListener('DOMContentLoaded', init);
