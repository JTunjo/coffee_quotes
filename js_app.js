// ============================================================
//  app.js — Lógica de negocio: RFQ, cotización, costos
//  Depende de: api.js, ui.js
// ============================================================

const USUARIO = 'asesor@cafe.com'; // mock; reemplazar con auth real

// ── Estado global ─────────────────────────────────────────
var rfqItemCount = 0;
var currentCotId = null;
var cotState     = null;
var pendingEdits = {};
var pendingNew   = [];
var variedades   = [];

// ══════════════════════════════════════════════════════════
//  RFQ
// ══════════════════════════════════════════════════════════


// Construye las <option> del select de variedad
function buildVariedadOptions() {
  if (!variedades.length) {
    return '<option value="">— Sin variedades cargadas —</option>';
  }
  return '<option value="">Selecciona…</option>' +
    variedades.map(function(v) {
      return '<option value="' + v + '">' + v + '</option>';
    }).join('');
}

// Refresca todos los selects de variedad activos en el formulario
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
      '<select data-field="variedad">' +
        buildVariedadOptions() +
      '</select></div>' +
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
    if (!item.variedad)
      errores.push('Ítem ' + n + ': variedad requerida');
    if (!item.cantidad_unidades || item.cantidad_unidades <= 0)
      errores.push('Ítem ' + n + ': cantidad requerida');
    if (!item.presentacion)
      errores.push('Ítem ' + n + ': presentación requerida');
    if (!item.fecha_requerida)
      errores.push('Ítem ' + n + ': fecha requerida');
    if (!item.destino)
      errores.push('Ítem ' + n + ': destino requerido');
  });
  return errores;
}

function resetRfqForm() {
  document.getElementById('rfq-cliente').value = '';
  document.getElementById('rfq-asesor').value  = '';
  document.getElementById('rfq-fecha').value   = new Date().toISOString().slice(0, 10);
  document.getElementById('rfq-items-container').innerHTML = '';
  rfqItemCount = 0;
  addRfqItem();
}

async function submitRFQ() {
  var cliente = document.getElementById('rfq-cliente').value.trim();
  var asesor  = document.getElementById('rfq-asesor').value.trim();
  var fecha   = document.getElementById('rfq-fecha').value;
  var items   = collectRfqItems();

  if (!cliente || !asesor) return toast('⚠️ Completa cliente y asesor');
  if (!items.length)        return toast('⚠️ Agrega al menos un ítem');

  var errores = validateRfqItems(items);
  if (errores.length) {
    toast('⚠️ ' + errores[0] +
      (errores.length > 1 ? ' (+' + (errores.length - 1) + ' más)' : ''));
    return;
  }

  toast('⏳ Creando RFQ...');
  try {
    var res = await apiPost({ action: 'crearRFQ', cliente: cliente,
                              asesor: asesor, fecha: fecha, items: items });

    // Siempre limpiar el formulario, independiente del resultado
    resetRfqForm();

    if (!res || !res.ok) {
      showPopupError(res && res.error ? res.error : 'Error desconocido del servidor.');
      return;
    }

    // Éxito: guardar cotId antes de cualquier otra operación
    var cotId = res.cotizacion_id;
    showPopupSuccess();
    setTimeout(function() {
      document.getElementById('cot-search-id').value = cotId;
      showPage('cot');
      loadCotizacion(cotId);
    }, 1100);

  } catch(err) {
    resetRfqForm();
    showPopupError('No se pudo conectar con el servidor.<br>Verifica tu conexión e inténtalo de nuevo.');
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
    tbody.innerHTML =
      '<tr><td colspan="6" style="color:var(--muted)">Sin RFQs aún.</td></tr>';
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

  currentCotId = cotId;
  cotState     = res;
  pendingEdits = {};
  pendingNew   = [];

  renderCotizacion(res);
  document.getElementById('cot-editor').classList.remove('hidden');

  toast('⏳ Verificando disponibilidad...');
  var vRes = await apiGet({ action: 'verificarDisponibilidad', cotizacionId: cotId });
  if (!vRes.ok) { toast('❌ Error al verificar disponibilidad'); return; }

  await handleVerificacion(vRes, cotId);
  toast('✅ Cotización lista');
}

async function handleVerificacion(vRes, cotId) {
  renderDisponibilidadBanner(vRes.resultados);

  var btnImpr      = document.getElementById('btn-imprimir');
  btnImpr.disabled = vRes.hay_incompletos;
  btnImpr.title    = vRes.hay_incompletos
    ? 'Resuelve los ítems sin disponibilidad para imprimir'
    : 'Imprimir cotización';

  var pendientes = vRes.resultados.filter(function(r) {
    return r.estado === 'seleccion_requerida';
  });
  for (var i = 0; i < pendientes.length; i++) {
    await mostrarModalSeleccionLote(pendientes[i], cotId);
  }

  if (pendientes.length) {
    var res2 = await apiGet({ action: 'getCotizacion', cotizacionId: cotId });
    if (res2.ok) { cotState = res2; renderCotizacion(res2); }
  }
}

// ── Costos manuales ───────────────────────────────────────

function addManualCost() {
  var nombre = document.getElementById('new-costo-nombre').value.trim();
  var itemId = document.getElementById('new-costo-item').value.trim();
  var valor  = parseFloat(document.getElementById('new-costo-valor').value || 0);
  var tipo   = document.getElementById('new-costo-tipo').value;

  if (!nombre || !itemId) return toast('⚠️ Nombre e ID de item son requeridos');

  pendingNew.push({ nombre: nombre, tipo: tipo, valor_usd_kg: valor, cot_item_id: itemId });
  toast('✅ Costo "' + nombre + '" agregado (pendiente de guardar)');

  document.getElementById('new-costo-nombre').value = '';
  document.getElementById('new-costo-item').value   = '';
  document.getElementById('new-costo-valor').value  = '';
}

async function saveCotizacion() {
  if (!currentCotId) return toast('⚠️ No hay cotización cargada');

  var costos        = Object.values(pendingEdits);
  var costos_nuevos = pendingNew;
  if (!costos.length && !costos_nuevos.length)
    return toast('ℹ️ Sin cambios que guardar');

  toast('⏳ Guardando...');
  var res = await apiPost({
    action:        'guardarCotizacion',
    cotizacion_id: currentCotId,
    usuario:       USUARIO,
    costos:        costos,
    costos_nuevos: costos_nuevos,
  });

  if (!res.ok) return toast('❌ Error: ' + res.error);

  toast('✅ Cotización guardada con historial de auditoría');
  pendingEdits = {};
  pendingNew   = [];
  await loadCotizacion(currentCotId);
}

function resetEditor() {
  pendingEdits = {};
  pendingNew   = [];
  if (currentCotId) loadCotizacion(currentCotId);
}

// ══════════════════════════════════════════════════════════
//  Init
// ══════════════════════════════════════════════════════════

async function init() {
  document.getElementById('rfq-fecha').value = new Date().toISOString().slice(0, 10);
  try {
    var res = await apiGet({ action: 'getVariedades' });
    if (res.ok && res.variedades.length) {
      variedades = res.variedades.map(function(v) { return v.nombre; });
    }
  } catch(e) { /* continúa sin catálogo */ }
  // addRfqItem se llama DESPUÉS de cargar variedades
  addRfqItem();
}

document.addEventListener('DOMContentLoaded', init);
