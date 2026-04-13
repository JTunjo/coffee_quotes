// ============================================================
//  app.js — Lógica de negocio
//  Depende de: api.js, ui.js
// ============================================================

const USUARIO = 'asesor@cafe.com';

// ── Navegación ────────────────────────────────────────────

function showPage(p) {
  ['rfq', 'list', 'cot', 'dir'].forEach(function(id) {
    document.getElementById('page-' + id).classList.toggle('hidden', id !== p);
  });
  document.querySelectorAll('nav button').forEach(function(b, i) {
    b.classList.toggle('active', ['rfq', 'list', 'cot', 'dir'][i] === p);
  });
  if (p === 'list') loadRFQList();
  if (p === 'dir')  loadDirectorio();
}


var rfqItemCount = 0;
var currentCotId = null;
var cotState     = null;
var pendingEdits = {};
var pendingNew   = [];
var variedades   = [];
var tasaUSD      = 0;
var tasaEUR      = 0;

// ══════════════════════════════════════════════════════════
//  EDITAR RFQ — popup
// ══════════════════════════════════════════════════════════

var rfqEditando = null; // RFQ cargado en el popup

// Normaliza cualquier valor de fecha a YYYY-MM-DD
function normalizarFecha(f) {
  if (!f) return '';
  if (f instanceof Date) return f.toISOString().slice(0, 10);
  var s = String(f).trim();
  // Si ya es YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // Si viene como Date serial de Sheets (número)
  var n = parseFloat(s);
  if (!isNaN(n) && n > 40000) {
    var d = new Date(Math.round((n - 25569) * 86400 * 1000));
    return d.toISOString().slice(0, 10);
  }
  // Intento genérico
  var d2 = new Date(s);
  if (!isNaN(d2.getTime())) return d2.toISOString().slice(0, 10);
  return '';
}

async function abrirEditarRFQ(rfqId) {
  toast('⏳ Cargando RFQ...');
  var res = await apiGet({ action: 'getRFQ', rfqId: rfqId });
  if (!res.ok) return toast('❌ ' + res.error);

  rfqEditando = res;
  var rfq   = res.rfq;
  var items = res.items;

  document.getElementById('edit-rfq-id').value      = rfq.rfq_id;
  document.getElementById('edit-rfq-cliente').value = rfq.cliente           || '';
  document.getElementById('edit-rfq-asesor').value  = rfq.asesor            || '';
  document.getElementById('edit-rfq-fecha').value   = normalizarFecha(rfq.fecha);
  document.getElementById('edit-rfq-moneda').value  = rfq.moneda_solicitada || 'USD';

  var cont = document.getElementById('edit-rfq-items');
  cont.innerHTML = '';
  for (var i = 0; i < items.length; i++) {
    cont.appendChild(crearFilaEditItem(items[i]));
  }

  document.getElementById('modal-edit-rfq').classList.add('show');
  toast('');
}

function crearFilaEditItem(item) {
  var div = document.createElement('div');
  div.style.cssText = 'border:1px solid var(--border);border-radius:var(--radius);' +
    'padding:.6rem;margin-bottom:.5rem;background:var(--bg)';
  div.dataset.rfqItemId = item.rfq_item_id;
  div.innerHTML =
    '<div style="font-size:.75rem;color:var(--muted);margin-bottom:.4rem">' +
      'Ítem: <code>' + item.rfq_item_id.slice(0,8) + '…</code>' +
    '</div>' +
    '<div class="form-grid">' +
      '<div><label>Variedad</label>' +
        '<select data-campo="variedad">' + buildVariedadOptions(item.variedad) + '</select></div>' +
      '<div><label>Destino</label>' +
        '<input data-campo="destino" value="' + (item.destino || '') + '" /></div>' +
      '<div><label>Fecha requerida</label>' +
        '<input type="date" data-campo="fecha_requerida" value="' +
          (item.fecha_requerida instanceof Date
            ? item.fecha_requerida.toISOString().slice(0,10)
            : String(item.fecha_requerida || '').slice(0,10)) + '" /></div>' +
      '<div><label>Cantidad</label>' +
        '<input type="number" min="1" data-campo="cantidad_unidades" value="' +
          (item.cantidad_unidades || '') + '" /></div>' +
    '</div>';
  return div;
}

function buildVariedadOptions(selected) {
  var opts = '<option value="">Selecciona…</option>';
  for (var i = 0; i < variedades.length; i++) {
    opts += '<option value="' + variedades[i] + '"' +
      (variedades[i] === selected ? ' selected' : '') + '>' +
      variedades[i] + '</option>';
  }
  return opts;
}

function cerrarEditarRFQ() {
  document.getElementById('modal-edit-rfq').classList.remove('show');
  rfqEditando = null;
}

async function guardarEditarRFQ() {
  var rfqId = document.getElementById('edit-rfq-id').value;
  if (!rfqId) return;

  var encabezado = {
    cliente:           document.getElementById('edit-rfq-cliente').value.trim(),
    asesor:            document.getElementById('edit-rfq-asesor').value.trim(),
    fecha:             document.getElementById('edit-rfq-fecha').value,
    moneda_solicitada: document.getElementById('edit-rfq-moneda').value,
  };

  var items = [];
  var filas = document.querySelectorAll('#edit-rfq-items [data-rfq-item-id]');
  filas.forEach(function(fila) {
    var obj = { rfq_item_id: fila.dataset.rfqItemId };
    fila.querySelectorAll('[data-campo]').forEach(function(el) {
      obj[el.dataset.campo] = el.value;
    });
    items.push(obj);
  });

  toast('⏳ Guardando...');
  var res = await apiPost({
    action:     'editarRFQ',
    rfq_id:     rfqId,
    usuario:    USUARIO,
    encabezado: encabezado,
    items:      items,
  });

  if (!res.ok) return toast('❌ Error: ' + res.error);

  toast('✅ RFQ actualizado');
  cerrarEditarRFQ();
  loadRFQList();
}



var CONTACTO_OPTS = ['Llamada', 'WhatsApp', 'Correo', 'Otro'];

async function loadDirectorio() {
  var tbody = document.getElementById('dir-body');
  tbody.innerHTML = '<tr><td colspan="7">Cargando...</td></tr>';
  var res = await apiGet({ action: 'getDirectorio' });
  if (!res.ok) {
    tbody.innerHTML = '<tr><td colspan="7" style="color:var(--red)">Error al cargar directorio.</td></tr>';
    return;
  }
  tbody.innerHTML = '';
  res.agricultores.forEach(function(a) {
    tbody.appendChild(crearFilaDir(a));
  });
}

function crearFilaDir(a) {
  var tr = document.createElement('tr');
  tr.dataset.id = a.agricultor_id || '';
  tr.innerHTML = celdaEdit(a.finca,              'finca')
    + celdaEdit(a.origen,            'origen')
    + celdaEdit(a.agricultor,        'agricultor')
    + celdaEdit(a.telefono,          'telefono')
    + celdaEdit(a.correo,            'correo')
    + celdaSelect(a.contacto_preferido)
    + '<td>'
      + '<button class="btn btn-secondary btn-sm" onclick="guardarFila(this)">💾</button>'
    + '</td>';
  return tr;
}

function celdaEdit(valor, campo) {
  return '<td><input data-campo="' + campo + '" value="' + (valor || '') + '"'
    + ' style="min-width:100px" /></td>';
}

function celdaSelect(valorActual) {
  var opts = CONTACTO_OPTS.map(function(o) {
    return '<option' + (o === valorActual ? ' selected' : '') + '>' + o + '</option>';
  }).join('');
  return '<td><select data-campo="contacto_preferido">' + opts + '</select></td>';
}

function agregarFilaDirectorio() {
  var tbody = document.getElementById('dir-body');
  var tr    = crearFilaDir({
    agricultor_id:      '',
    finca:              '',
    origen:             '',
    agricultor:         '',
    telefono:           '',
    correo:             '',
    contacto_preferido: 'WhatsApp',
  });
  tbody.insertBefore(tr, tbody.firstChild);
  tr.querySelector('input').focus();
}

async function guardarFila(btn) {
  var tr   = btn.closest('tr');
  var id   = tr.dataset.id || '';
  var data = { agricultor_id: id };

  tr.querySelectorAll('[data-campo]').forEach(function(el) {
    data[el.dataset.campo] = el.value.trim();
  });

  if (!data.agricultor) return toast('⚠️ El nombre del agricultor es requerido');

  btn.disabled    = true;
  btn.textContent = '⏳';

  var res = await apiPost({ action: 'guardarAgricultor', agricultor_id: id || undefined,
                            finca:              data.finca,
                            origen:             data.origen,
                            agricultor:         data.agricultor,
                            telefono:           data.telefono,
                            correo:             data.correo,
                            contacto_preferido: data.contacto_preferido });

  btn.disabled    = false;
  btn.textContent = '💾';

  if (!res.ok) return toast('❌ Error: ' + res.error);

  toast('✅ Agricultor guardado');
  loadDirectorio();
}



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
    '<div><label>Estado proceso</label>' +
      '<select data-field="estado_proceso">' +
        '<option value="Pergamino">Pergamino</option>' +
        '<option value="Verde" selected>Verde</option>' +
        '<option value="Tostado">Tostado</option>' +
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
  tbody.innerHTML = '<tr><td colspan="5">Cargando...</td></tr>';

  var resRFQ = await apiGet({ action: 'listRFQs' });
  if (!resRFQ.ok || !resRFQ.rfqs.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="color:var(--muted)">Sin RFQs aún.</td></tr>';
    return;
  }

  // Cargar todas las cotizaciones de una vez
  var resCots = await apiGet({ action: 'listRFQs' });
  // Usamos listCotizaciones si existiera, pero por ahora cargamos por RFQ
  // Construimos las filas secuencialmente
  tbody.innerHTML = '';
  for (var i = 0; i < resRFQ.rfqs.length; i++) {
    var r   = resRFQ.rfqs[i];
    var res = await apiGet({ action: 'getCotizacionesPorRFQ', rfqId: r.rfq_id });
    var cots = (res.ok && res.cotizaciones) ? res.cotizaciones : [];

    var optsHtml = cots.map(function(c) {
      return '<option value="' + c.cotizacion_id + '">'
        + (c.nombre || 'Sin nombre')
        + ' — ' + c.estado
        + '</option>';
    }).join('');

    var selectHtml = cots.length
      ? '<select id="sel-cot-' + r.rfq_id + '" style="max-width:220px;margin-right:.4rem">' + optsHtml + '</select>'
        + '<button class="btn btn-secondary btn-sm" onclick="abrirCotSeleccionada(\'' + r.rfq_id + '\')">Abrir</button>'
      : '<span class="text-muted" style="font-size:.8rem">Sin cotizaciones</span>';

    var tr = document.createElement('tr');
    tr.innerHTML =
      '<td><code style="font-size:.75rem">' + r.rfq_id.slice(0, 8) + '…</code></td>' +
      '<td>' + r.cliente + '</td>' +
      '<td>' + r.asesor  + '</td>' +
      '<td>' + r.fecha   + '</td>' +
      '<td>' +
        '<div style="display:flex;align-items:center;gap:.4rem;flex-wrap:wrap">' +
          selectHtml +
          '<button class="btn btn-ghost btn-sm" onclick="nuevaCotizacion(\'' + r.rfq_id + '\',\'' + (r.asesor || '') + '\')">+ Nueva</button>' +
          '<button class="btn btn-ghost btn-sm" onclick="abrirEditarRFQ(\'' + r.rfq_id + '\')">✏️ Editar</button>' +
        '</div>' +
      '</td>';
    tbody.appendChild(tr);
  }
}

function abrirCotSeleccionada(rfqId) {
  var sel   = document.getElementById('sel-cot-' + rfqId);
  var cotId = sel ? sel.value : null;
  if (!cotId) return toast('⚠️ Selecciona una cotización');
  openCotFromRFQ(cotId);
}

async function nuevaCotizacion(rfqId, asesor) {
  var nombre = (prompt('Nombre para la nueva cotización:') || '').trim();
  if (!nombre) return toast('⚠️ El nombre es obligatorio');

  toast('⏳ Creando cotización...');
  var res = await apiPost({
    action: 'forkCotizacion',
    rfq_id: rfqId,
    nombre: nombre,
    asesor: asesor,
  });

  if (!res.ok) return toast('❌ Error: ' + res.error);

  toast('✅ Cotización "' + nombre + '" creada');
  loadRFQList(); // refrescar lista
  // Navegar a la nueva cotización
  document.getElementById('cot-search-id').value = res.cotizacion_id;
  showPage('cot');
  loadCotizacion(res.cotizacion_id);
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

// Muestra/oculta campos condicionales según si se ingresó item_id
function onCostoItemChange(input) {
  var itemId      = (input.value || '').trim();
  var itemFields  = document.getElementById('costo-item-fields');
  var globalField = document.getElementById('costo-global-field');
  if (itemId) {
    itemFields.classList.remove('hidden');
    globalField.classList.add('hidden');
    onCostoPorChange();
  } else {
    itemFields.classList.add('hidden');
    globalField.classList.remove('hidden');
  }
}

function onCostoPorChange() {
  var por      = document.getElementById('new-costo-por').value;
  var lblValor = document.getElementById('new-costo-valor-label');
  var lblCalc  = document.getElementById('new-costo-calc-label');
  lblValor.textContent = por === 'kg' ? 'Valor/Kg' : 'Valor/Und';
  lblCalc.textContent  = por === 'kg' ? 'Valor/Und (calculado)' : 'Valor/Kg (calculado)';
  onCostoValorChange();
}

function onCostoValorChange() {
  var itemId = (document.getElementById('new-costo-item').value || '').trim();
  if (!itemId || !cotState) return;
  var itemFound = cotState.items.filter(function(i) { return i.cot_item_id === itemId; })[0];
  if (!itemFound) return;
  var factor = factorPresentacion(itemFound.presentacion, itemFound.cantidad_unidades);
  var por    = document.getElementById('new-costo-por').value;
  var valor  = parseFloat(document.getElementById('new-costo-valor').value || 0);
  var calc   = document.getElementById('new-costo-calc');
  calc.value = por === 'kg'
    ? (valor * factor).toFixed(4)
    : (factor > 0 ? (valor / factor).toFixed(4) : '0');
}

function addManualCost() {
  var nombre   = document.getElementById('new-costo-nombre').value.trim();
  var itemId   = document.getElementById('new-costo-item').value.trim();
  var moneda   = document.getElementById('new-costo-moneda').value;
  var tipo     = document.getElementById('new-costo-tipo').value;
  var incoterm = document.getElementById('new-costo-incoterm').value.trim();

  if (!nombre) return toast('⚠️ El nombre del costo es requerido');

  var costEntry;

  if (itemId) {
    if (!cotState || !cotState.items) return toast('⚠️ No hay cotización cargada');
    var itemFound = cotState.items.filter(function(i) { return i.cot_item_id === itemId; })[0];
    if (!itemFound) {
      toast('⚠️ ID de ítem no encontrado en esta cotización');
      return;
    }
    var por    = document.getElementById('new-costo-por').value;
    var valor  = parseFloat(document.getElementById('new-costo-valor').value || 0);
    var factor = factorPresentacion(itemFound.presentacion, itemFound.cantidad_unidades);
    var cant   = parseFloat(itemFound.cantidad_unidades || 0);
    var valorKg, valorUnd;
    if (por === 'kg') {
      valorKg  = valor;
      valorUnd = valor * factor;
    } else {
      valorUnd = valor;
      valorKg  = factor > 0 ? valor / factor : 0;
    }
    var tUSD   = parseFloat(tasaUSD || 0);
    var tEUR   = parseFloat(tasaEUR || 0);
    var vCOP   = aCOP(valorKg, moneda, tUSD, tEUR);
    var totCOP = itemFound.presentacion === 'Granel' ? vCOP * factor : vCOP * factor * cant;
    costEntry = {
      nombre:      nombre,
      tipo:        tipo,
      incoterm:    incoterm,
      moneda:      moneda,
      cot_item_id: itemId,
      valor_kg:    valorKg,
      valor_und:   valorUnd,
      valor_total: totCOP,
      es_global:   false,
    };
  } else {
    var valorTotal = parseFloat(document.getElementById('new-costo-valor-global').value || 0);
    costEntry = {
      nombre:      nombre,
      tipo:        tipo,
      incoterm:    incoterm,
      moneda:      moneda,
      cot_item_id: '',
      valor_kg:    0,
      valor_und:   0,
      valor_total: valorTotal,
      es_global:   true,
    };
  }

  pendingNew.push(costEntry);

  document.getElementById('new-costo-nombre').value        = '';
  document.getElementById('new-costo-item').value          = '';
  document.getElementById('new-costo-incoterm').value      = '';
  document.getElementById('new-costo-valor').value         = '';
  document.getElementById('new-costo-calc').value          = '';
  document.getElementById('new-costo-valor-global').value  = '';
  onCostoItemChange(document.getElementById('new-costo-item'));

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
        '<td>' + (c.incoterm || '—') + '</td>' +
        '<td><span class="tag tag-yellow">' + c.moneda + '</span></td>' +
        '<td style="font-size:.75rem;color:var(--muted)">' + (c.cot_item_id || '<em>Global</em>') + '</td>' +
        '<td>' + (c.es_global ? '—' : parseFloat(c.valor_kg  || 0).toFixed(2)) + '</td>' +
        '<td>' + (c.es_global ? '—' : parseFloat(c.valor_und || 0).toFixed(2)) + '</td>' +
        '<td>' + parseFloat(c.valor_total || 0).toLocaleString('es-CO') + '</td>' +
        '<td><button class="btn btn-danger btn-sm" onclick="removePendingCosto(' + i + ')">✕</button></td>' +
      '</tr>';
  }
  body.innerHTML = rows;
}

// ── Ignorar ítem ──────────────────────────────────────────

async function toggleIgnorarItem(checkbox, cotItemId) {
  var ignorado = checkbox.checked;
  var card = checkbox.closest('.card');
  if (card) card.style.opacity = ignorado ? '0.55' : '1';

  var res = await apiPost({
    action:      'marcarItemIgnorado',
    cot_item_id: cotItemId,
    ignorado:    ignorado,
  });

  if (!res.ok) {
    checkbox.checked = !ignorado;
    if (card) card.style.opacity = !ignorado ? '0.55' : '1';
    return toast('❌ Error al actualizar: ' + (res.error || ''));
  }

  // Recalcular estado del botón imprimir
  var hayIncompletos = false;
  document.querySelectorAll('.card[data-cot-item-id]').forEach(function(c) {
    var cb  = c.querySelector('input[type="checkbox"]');
    var isIgn = cb && cb.checked;
    if (!isIgn && c.style.border && c.style.border.indexOf('red') !== -1) {
      hayIncompletos = true;
    }
  });
  var btnImprimir = document.getElementById('btn-imprimir');
  if (btnImprimir) {
    btnImprimir.disabled = hayIncompletos;
    btnImprimir.title = hayIncompletos
      ? 'Resuelve o ignora los ítems sin disponibilidad para imprimir'
      : 'Imprimir cotización';
  }
  toast(ignorado ? '⚠️ Ítem ignorado' : '✅ Ítem incluido');
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
