// ============================================================
//  COFFEE QUOTATION SYSTEM — Google Apps Script Backend
//  ES5 compatible — sin arrow functions, sin spread, sin const/let
// ============================================================

var SS = SpreadsheetApp.getActiveSpreadsheet();

var SHEETS = {
  VARIEDADES:                  'Variedades',
  DIRECTORIO:                  'Directorio',
  DISPONIBILIDADES:            'Disponibilidades',
  COSTOS_ESTANDAR:             'Costos_estandar',
  TASAS:                       'Tasas',
  RFQ:                         'RFQ',
  RFQ_ITEMS:                   'RFQ_items',
  RFQ_TRAZA:                   'RFQ_traza',
  COTIZACIONES:                'Cotizaciones',
  COTIZACION_ITEMS:            'Cotizacion_items',
  COTIZACION_COSTOS:           'Cotizacion_costos',
  COTIZACION_COSTOS_HISTORIAL: 'Cotizacion_costos_historial',
  COTIZACION_TASAS:            'Cotizacion_tasas',
  LISTAS:                      'Listas',
  ETIQUETAS:                   'Etiquetas',
};

// ── Helpers generales ─────────────────────────────────────

function uid() {
  return Utilities.getUuid();
}

function now() {
  return new Date().toISOString();
}

function getSheet(name) {
  var sh = SS.getSheetByName(name);
  if (!sh) throw new Error('Hoja no encontrada: ' + name);
  return sh;
}

function sheetToObjects(name) {
  var sh      = getSheet(name);
  var data    = sh.getDataRange().getValues();
  if (data.length < 2) return [];
  var headers = data[0].map(function(h) { return String(h).trim(); });
  var result  = [];
  for (var i = 1; i < data.length; i++) {
    var row     = data[i];
    var isEmpty = true;
    for (var k = 0; k < row.length; k++) {
      if (row[k] !== '' && row[k] !== null) { isEmpty = false; break; }
    }
    if (isEmpty) continue;
    var obj = {};
    for (var j = 0; j < headers.length; j++) {
      obj[headers[j]] = row[j];
    }
    result.push(obj);
  }
  return result;
}

// Write multiple rows in a single Sheets API call
function batchAppendRows(name, objs) {
  if (!objs || !objs.length) return;
  var sh      = getSheet(name);
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0]
    .map(function(h) { return String(h).trim(); });
  var lastRow = sh.getLastRow();
  var matrix  = [];
  for (var i = 0; i < objs.length; i++) {
    var row = [];
    for (var j = 0; j < headers.length; j++) {
      row.push(objs[i][headers[j]] !== undefined ? objs[i][headers[j]] : '');
    }
    matrix.push(row);
  }
  sh.getRange(lastRow + 1, 1, matrix.length, headers.length).setValues(matrix);
}

function appendRow(name, obj) {
  var sh      = getSheet(name);
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var row     = [];
  for (var i = 0; i < headers.length; i++) {
    var key = String(headers[i]).trim();
    row.push(obj[key] !== undefined ? obj[key] : '');
  }
  sh.appendRow(row);
}

function updateRows(name, predicate, updater) {
  var sh      = getSheet(name);
  var data    = sh.getDataRange().getValues();
  var headers = data[0];
  var updated = 0;
  for (var i = 1; i < data.length; i++) {
    var obj = {};
    for (var j = 0; j < headers.length; j++) {
      obj[String(headers[j]).trim()] = data[i][j];
    }
    if (!predicate(obj)) continue;
    var newObj = updater(obj);
    for (var j = 0; j < headers.length; j++) {
      var key = String(headers[j]).trim();
      if (newObj[key] !== undefined) data[i][j] = newObj[key];
    }
    updated++;
  }
  if (updated > 0) sh.getDataRange().setValues(data);
  return updated;
}

// Like updateRows but updater(obj) returns merged obj or null to skip.
// Does ONE sheet read + ONE write regardless of how many rows match.
function bulkUpdateRows(name, updater) {
  var sh      = getSheet(name);
  var data    = sh.getDataRange().getValues();
  var headers = data[0].map(function(h) { return String(h).trim(); });
  var updated = 0;
  for (var i = 1; i < data.length; i++) {
    var obj = {};
    for (var j = 0; j < headers.length; j++) { obj[headers[j]] = data[i][j]; }
    var newObj = updater(obj);
    if (!newObj) continue;
    for (var j = 0; j < headers.length; j++) {
      if (newObj[headers[j]] !== undefined) data[i][j] = newObj[headers[j]];
    }
    updated++;
  }
  if (updated > 0) sh.getDataRange().setValues(data);
  return updated;
}

function mergeObj(base, overrides) {
  var result = {};
  for (var k in base)      { if (base.hasOwnProperty(k))      result[k] = base[k]; }
  for (var k in overrides) { if (overrides.hasOwnProperty(k)) result[k] = overrides[k]; }
  return result;
}

// Rewrites the sheet keeping only rows where predicate(obj) is falsy.
function deleteRows(name, predicate) {
  var sh      = getSheet(name);
  var data    = sh.getDataRange().getValues();
  if (data.length < 2) return 0;
  var headers = data[0];
  var kept    = [headers];
  var deleted = 0;
  for (var i = 1; i < data.length; i++) {
    var obj     = {};
    var isEmpty = true;
    for (var j = 0; j < headers.length; j++) {
      obj[String(headers[j]).trim()] = data[i][j];
      if (data[i][j] !== '' && data[i][j] !== null) isEmpty = false;
    }
    if (isEmpty || predicate(obj)) {
      deleted++;
    } else {
      kept.push(data[i]);
    }
  }
  if (deleted > 0) {
    sh.clearContents();
    sh.getRange(1, 1, kept.length, headers.length).setValues(kept);
  }
  return deleted;
}

// Splits a comma-separated etiquetas string into a trimmed, lowercase array.
function _parseEtiquetas(val) {
  if (!val || String(val).trim() === '') return [];
  return String(val).split(',').map(function(t) { return t.trim().toLowerCase(); }).filter(Boolean);
}

// Returns true if a cost's etiquetas apply to the item's etiquetas.
// '*' or empty cost etiquetas → applies to all.
// Otherwise at least one tag must intersect.
function _etiquetasMatch(costEtiquetas, itemEtiquetas) {
  var costTags = _parseEtiquetas(costEtiquetas);
  if (costTags.length === 0 || costTags[0] === '*') return true;
  var itemTags = _parseEtiquetas(itemEtiquetas);
  for (var i = 0; i < costTags.length; i++) {
    for (var j = 0; j < itemTags.length; j++) {
      if (costTags[i] === itemTags[j]) return true;
    }
  }
  return false;
}

function jsonResponse(data, status) {
  var payload = JSON.stringify(mergeObj({ ok: status !== 'error' }, data));
  return ContentService.createTextOutput(payload)
    .setMimeType(ContentService.MimeType.JSON);
}

function findOne(arr, predicate) {
  for (var i = 0; i < arr.length; i++) {
    if (predicate(arr[i])) return arr[i];
  }
  return null;
}

function filterArr(arr, predicate) {
  var result = [];
  for (var i = 0; i < arr.length; i++) {
    if (predicate(arr[i])) result.push(arr[i]);
  }
  return result;
}

function mapArr(arr, fn) {
  var result = [];
  for (var i = 0; i < arr.length; i++) result.push(fn(arr[i]));
  return result;
}

function reduceArr(arr, fn, initial) {
  var acc = initial;
  for (var i = 0; i < arr.length; i++) acc = fn(acc, arr[i]);
  return acc;
}

// ── Conversión de moneda ──────────────────────────────────
//  tasa_usd = COP por 1 USD (ej. 4100)
//  tasa_eur = COP por 1 EUR (ej. 4500)

function aCOP(valor, moneda, tasa_usd, tasa_eur) {
  valor    = parseFloat(valor    || 0);
  tasa_usd = parseFloat(tasa_usd || 1);
  tasa_eur = parseFloat(tasa_eur || 1);
  var m = (moneda || 'COP').toUpperCase();
  if (m === 'USD') return valor * tasa_usd;
  if (m === 'EUR') return valor * tasa_eur;
  return valor;
}

// ── Factor de presentación ────────────────────────────────

function factorPresentacion(presentacion, cantidad_kg) {
  var p = (presentacion || '').trim();
  if (p === '250g')   return 0.25;
  if (p === '500g')   return 0.5;
  if (p === '1Kg')    return 1;
  if (p === '12Kg')   return 12;
  if (p === 'Granel') return parseFloat(cantidad_kg || 1);
  return 1;
}

// ── Router ────────────────────────────────────────────────

function doGet(e) {
  var cb = e.parameter.callback;
  try {
    var p      = e.parameter;
    var result;

    if (p._post === '1') {
      var body   = JSON.parse(decodeURIComponent(p.data || '{}'));
      var action = body.action;
      if      (action === 'crearRFQ')          result = crearRFQ(body);
      else if (action === 'guardarCotizacion') result = guardarCotizacion(body);
      else if (action === 'agregarVariedad')   result = agregarVariedad(body);
      else if (action === 'asignarLote')       result = asignarLote(body);
      else if (action === 'guardarTasas')      result = guardarTasas(body);
      else if (action === 'guardarAgricultor') result = guardarAgricultor(body);
      else if (action === 'forkCotizacion')    result = forkCotizacion(body);
      else if (action === 'editarRFQ')         result = editarRFQ(body);
      else if (action === 'marcarItemIgnorado') result = marcarItemIgnorado(body);
      else result = { ok: false, error: 'Accion POST desconocida: ' + action };
    } else {
      var action = p.action;
      if      (action === 'getVariedades')           result = getVariedades();
      else if (action === 'getDirectorio')           result = getDirectorio();
      else if (action === 'getRFQ')                  result = getRFQ(p.rfqId);
      else if (action === 'getCotizacion')           result = getCotizacion(p.cotizacionId);
      else if (action === 'getCotizacionesPorRFQ')   result = getCotizacionesPorRFQ(p.rfqId);
      else if (action === 'getDisponibles')          result = getDisponibilidades();
      else if (action === 'getCostosEstandar')       result = getCostosEstandar();
      else if (action === 'getEtiquetas')            result = getEtiquetas();
      else if (action === 'listRFQs')                result = listRFQs();
      else if (action === 'verificarDisponibilidad') result = verificarDisponibilidad(p.cotizacionId);
      else if (action === 'getTasas')                result = getTasas();
      else result = { ok: false, error: 'Accion desconocida: ' + action };
    }

    if (cb) {
      return ContentService
        .createTextOutput(cb + '(' + JSON.stringify(result) + ')')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return jsonResponse(result);

  } catch (err) {
    var msg = JSON.stringify({ ok: false, error: err.message });
    if (cb) {
      return ContentService.createTextOutput(cb + '(' + msg + ')')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return jsonResponse({ error: err.message }, 'error');
  }
}

function doPost(e) {
  try {
    var body   = JSON.parse(e.postData.contents);
    var action = body.action;
    var result;
    if      (action === 'crearRFQ')          result = crearRFQ(body);
    else if (action === 'guardarCotizacion') result = guardarCotizacion(body);
    else if (action === 'agregarVariedad')   result = agregarVariedad(body);
    else if (action === 'asignarLote')       result = asignarLote(body);
    else if (action === 'guardarTasas')      result = guardarTasas(body);
    else if (action === 'guardarAgricultor') result = guardarAgricultor(body);
    else if (action === 'forkCotizacion')    result = forkCotizacion(body);
    else if (action === 'editarRFQ')         result = editarRFQ(body);
    else if (action === 'marcarItemIgnorado') result = marcarItemIgnorado(body);
    else result = { ok: false, error: 'Accion POST desconocida: ' + action };
    return jsonResponse(result);
  } catch (err) {
    return jsonResponse({ error: err.message }, 'error');
  }
}

// ── Ignorar ítem ─────────────────────────────────────────

function marcarItemIgnorado(body) {
  var cotItemId = String(body.cot_item_id || '');
  var ignorado  = body.ignorado === true || String(body.ignorado).toLowerCase() === 'true';
  if (!cotItemId) return { ok: false, error: 'cot_item_id requerido' };
  updateRows(SHEETS.COTIZACION_ITEMS,
    function(r) { return r.cot_item_id === cotItemId; },
    function(r) { r.ignorado = ignorado; return r; }
  );
  return { ok: true };
}

// ── Variedades ────────────────────────────────────────────

function getVariedades() {
  var rows      = sheetToObjects(SHEETS.VARIEDADES);
  var variedades = [];
  for (var i = 0; i < rows.length; i++) {
    var nombre = String(rows[i].nombre || '').trim();
    if (nombre) variedades.push({ variedad_id: rows[i].variedad_id, nombre: nombre });
  }
  return { ok: true, variedades: variedades };
}

function agregarVariedad(body) {
  var nombre = (body.nombre || '').trim();
  if (!nombre) return { ok: false, error: 'nombre requerido' };

  var rows = sheetToObjects(SHEETS.VARIEDADES);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i].nombre || '').toLowerCase() === nombre.toLowerCase()) {
      return { ok: true, ya_existia: true };
    }
  }

  appendRow(SHEETS.VARIEDADES, {
    variedad_id: uid(),
    nombre:      nombre,
    activo:      true,
    created_at:  now(),
  });
  return { ok: true, ya_existia: false };
}

// ── Directorio ────────────────────────────────────────────

function getDirectorio() {
  return { ok: true, agricultores: sheetToObjects(SHEETS.DIRECTORIO) };
}

function guardarAgricultor(body) {
  var agricultor_id = body.agricultor_id;
  var esNuevo       = !agricultor_id;

  if (esNuevo) {
    // Crear nuevo
    appendRow(SHEETS.DIRECTORIO, {
      agricultor_id:      uid(),
      finca:              body.finca              || '',
      origen:             body.origen             || '',
      agricultor:         body.agricultor         || '',
      telefono:           body.telefono           || '',
      correo:             body.correo             || '',
      contacto_preferido: body.contacto_preferido || 'WhatsApp',
    });
    return { ok: true, creado: true };
  }

  // Actualizar existente
  var updated = updateRows(SHEETS.DIRECTORIO,
    function(r) { return r.agricultor_id === agricultor_id; },
    function(r) { return mergeObj(r, {
      finca:              body.finca              || r.finca,
      origen:             body.origen             || r.origen,
      agricultor:         body.agricultor         || r.agricultor,
      telefono:           body.telefono           !== undefined ? body.telefono : r.telefono,
      correo:             body.correo             !== undefined ? body.correo   : r.correo,
      contacto_preferido: body.contacto_preferido || r.contacto_preferido,
    }); }
  );

  if (!updated) return { ok: false, error: 'Agricultor no encontrado' };
  return { ok: true, creado: false };
}



function getDisponibilidades() {
  return { ok: true, disponibilidades: sheetToObjects(SHEETS.DISPONIBILIDADES) };
}

function getCostosEstandar() {
  return { ok: true, costos: sheetToObjects(SHEETS.COSTOS_ESTANDAR) };
}

function getEtiquetas() {
  var rows = sheetToObjects(SHEETS.ETIQUETAS);
  var etiquetas = filterArr(rows, function(r) {
    return r.etiqueta_id !== undefined && r.etiqueta_id !== '' &&
           r.etiqueta_nombre !== undefined && r.etiqueta_nombre !== '';
  }).map(function(r) {
    return { etiqueta_id: String(r.etiqueta_id).trim(), etiqueta_nombre: String(r.etiqueta_nombre).trim() };
  });
  return { ok: true, etiquetas: etiquetas };
}

// ── Recalcular costos estándar ────────────────────────────
//  Elimina todos los costos no-manuales del cotizacion y los regenera
//  aplicando el matching de etiquetas contra costos_estandar.
//  No se ejecuta si la cotización está en estado 'enviado' o 'cancelado'.

function _recalcularCostosEstandar(cotizacionId) {
  var cots = filterArr(sheetToObjects(SHEETS.COTIZACIONES),
    function(r) { return r.cotizacion_id === cotizacionId; });
  if (!cots.length) return;
  var estado = (cots[0].estado || '').toLowerCase();
  if (estado === 'enviado' || estado === 'cancelado') return;

  var cotItems       = filterArr(sheetToObjects(SHEETS.COTIZACION_ITEMS),
    function(i) { return i.cotizacion_id === cotizacionId; });
  var costosEstandar = filterArr(sheetToObjects(SHEETS.COSTOS_ESTANDAR),
    function(c) { return c.activo !== false && c.activo !== 'FALSE'; });

  // Remove all existing non-manual costs for this cotizacion
  deleteRows(SHEETS.COTIZACION_COSTOS, function(r) {
    return r.cotizacion_id === cotizacionId && (r.tipo || '') !== 'manual';
  });

  // Re-add standard costs based on etiquetas matching (deduplicated per item)
  var timestamp   = now();
  var nuevaFilas  = [];
  for (var i = 0; i < cotItems.length; i++) {
    var item          = cotItems[i];
    var estadoProceso = (item.estado_proceso || 'Verde').toLowerCase();
    var aplicables    = filterArr(costosEstandar, function(c) {
      var etiquetasOk = _etiquetasMatch(c.etiquetas, item.etiquetas);
      var procOk      = !c.presentacion || c.presentacion === '*' ||
                        c.presentacion.toLowerCase() === estadoProceso;
      return etiquetasOk && procOk;
    });
    // Dedup by cost nombre within this item (a cost matching multiple tags
    // should only be added once)
    var seen = {};
    for (var j = 0; j < aplicables.length; j++) {
      var c = aplicables[j];
      if (seen[c.nombre]) continue;
      seen[c.nombre] = true;
      nuevaFilas.push({
        costo_id:      uid(),
        cotizacion_id: cotizacionId,
        cot_item_id:   item.cot_item_id,
        nombre:        c.nombre,
        tipo:          c.tipo || 'estandar',
        moneda:        'COP',
        valor_kg:      parseFloat(c.valor_cop_kg || 0),
        incoterm_id:   parseFloat(c.incoterm_max  || 0),
        editable:      true,
        created_at:    timestamp,
        updated_at:    timestamp,
      });
    }
  }
  if (nuevaFilas.length) batchAppendRows(SHEETS.COTIZACION_COSTOS, nuevaFilas);
}

// ── Verificación de disponibilidad ───────────────────────

function verificarDisponibilidad(cotizacionId) {
  if (!cotizacionId) return { ok: false, error: 'cotizacionId requerido' };

  _recalcularCostosEstandar(cotizacionId);

  var cotItems    = filterArr(sheetToObjects(SHEETS.COTIZACION_ITEMS),
    function(i) { return i.cotizacion_id === cotizacionId; });
  var rfqItems    = sheetToObjects(SHEETS.RFQ_ITEMS);
  var disponibles = filterArr(sheetToObjects(SHEETS.DISPONIBILIDADES),
    function(d) { return d.activo === true || d.activo === 'TRUE'; });

  var resultados     = [];
  var hayIncompletos = false;

  for (var idx = 0; idx < cotItems.length; idx++) {
    var item         = cotItems[idx];
    var rfqItem      = findOne(rfqItems, function(r) { return r.rfq_item_id === item.rfq_item_id; }) || {};
    var fechaReqRaw  = rfqItem.fecha_requerida;
    var cantidadUnid = parseFloat(item.cantidad_unidades || 0);

    if (!fechaReqRaw) {
      resultados.push({ cot_item_id: item.cot_item_id, variedad: item.variedad,
                        estado: 'sin_fecha_requerida', lotes: [] });
      hayIncompletos = true;
      continue;
    }

    var fechaReq = fechaReqRaw instanceof Date ? fechaReqRaw : new Date(fechaReqRaw);
    if (isNaN(fechaReq.getTime())) {
      resultados.push({ cot_item_id: item.cot_item_id, variedad: item.variedad,
                        estado: 'sin_fecha_requerida', lotes: [] });
      hayIncompletos = true;
      continue;
    }

    var factor       = factorPresentacion(item.presentacion, cantidadUnid);
    var cantidadKg   = item.presentacion === 'Granel' ? cantidadUnid : cantidadUnid * factor;
    var variedadItem = (item.variedad || '').toLowerCase();
    var lotesCandidatos = filterArr(disponibles, function(d) {
      if ((d.variedad || '').toLowerCase() !== variedadItem) return false;
      var dDesde = d.fecha_disponible_desde instanceof Date
        ? d.fecha_disponible_desde : new Date(d.fecha_disponible_desde);
      var dHasta = d.fecha_disponible_hasta instanceof Date
        ? d.fecha_disponible_hasta : new Date(d.fecha_disponible_hasta);
      if (isNaN(dDesde.getTime()) || isNaN(dHasta.getTime())) return false;
      return fechaReq >= dDesde && fechaReq <= dHasta &&
             parseFloat(d.kilos_disponibles || 0) >= cantidadKg;
    });

    if (lotesCandidatos.length === 0) {
      _actualizarEstadoItem(item.cot_item_id, '', 0, 'sin_disponibilidad');
      resultados.push({ cot_item_id: item.cot_item_id, variedad: item.variedad,
                        estado: 'sin_disponibilidad', lotes: [] });
      hayIncompletos = true;
    } else {
      lotesCandidatos.sort(function(a, b) {
        return parseFloat(a.costo_cop_kg || 0) - parseFloat(b.costo_cop_kg || 0);
      });
      var loteOptimo     = lotesCandidatos[0];
      var costo_lote_cop = parseFloat(loteOptimo.costo_cop_kg || 0);

      _actualizarEstadoItem(item.cot_item_id, loteOptimo.lote_id, costo_lote_cop, 'completo');

      var lotesInfo = mapArr(lotesCandidatos, function(l) {
        return {
          lote_id:                l.lote_id,
          variedad:               l.variedad,
          origen:                 l.origen,
          proceso:                l.proceso,
          costo_cop_kg:           parseFloat(l.costo_cop_kg || 0),
          costo_cop:              parseFloat(l.costo_cop_kg || 0),
          kilos_disponibles:      parseFloat(l.kilos_disponibles || 0),
          fecha_disponible_desde: l.fecha_disponible_desde,
          fecha_disponible_hasta: l.fecha_disponible_hasta,
        };
      });

      resultados.push({
        cot_item_id:   item.cot_item_id,
        variedad:      item.variedad,
        estado:        'completo',
        lote_asignado: loteOptimo.lote_id,
        lotes:         lotesInfo,
      });
    }
  }

  var nuevoEstado = hayIncompletos ? 'incompleta' : 'revisado';
  updateRows(SHEETS.COTIZACIONES,
    function(r) { return r.cotizacion_id === cotizacionId; },
    function(r) { return mergeObj(r, { estado: nuevoEstado, updated_at: now() }); }
  );

  return { ok: true, resultados: resultados, hay_incompletos: hayIncompletos };
}

// ── Asignar lote ──────────────────────────────────────────

function asignarLote(body) {
  var cot_item_id   = body.cot_item_id;
  var lote_id       = body.lote_id;
  var cotizacion_id = body.cotizacion_id;

  if (!cot_item_id || !lote_id) return { ok: false, error: 'cot_item_id y lote_id requeridos' };

  var lotes = sheetToObjects(SHEETS.DISPONIBILIDADES);
  var lote  = findOne(lotes, function(l) { return l.lote_id === lote_id; });
  if (!lote) return { ok: false, error: 'Lote no encontrado' };

  var costo_lote_cop = parseFloat(lote.costo_cop_kg || 0);

  _actualizarEstadoItem(cot_item_id, lote_id, costo_lote_cop, 'completo');
  recalcularTotales(cotizacion_id);

  var items          = filterArr(sheetToObjects(SHEETS.COTIZACION_ITEMS),
    function(i) { return i.cotizacion_id === cotizacion_id; });
  var hayIncompletos = false;
  for (var i = 0; i < items.length; i++) {
    if (items[i].estado_disponibilidad !== 'completo') { hayIncompletos = true; break; }
  }

  if (!hayIncompletos) {
    updateRows(SHEETS.COTIZACIONES,
      function(r) { return r.cotizacion_id === cotizacion_id; },
      function(r) { return mergeObj(r, { estado: 'revisado', updated_at: now() }); }
    );
  }

  return { ok: true, hay_incompletos: hayIncompletos };
}

function _guardarPerfil(cot_item_id, perfil_sensorial) {
  updateRows(SHEETS.COTIZACION_ITEMS,
    function(r) { return r.cot_item_id === cot_item_id; },
    function(r) { return mergeObj(r, { perfil_sensorial: perfil_sensorial }); }
  );
}

function _actualizarEstadoItem(cot_item_id, lote_id, costo_lote_kg, estado) {
  updateRows(SHEETS.COTIZACION_ITEMS,
    function(r) { return r.cot_item_id === cot_item_id; },
    function(r) { return mergeObj(r, {
      lote_id:               lote_id,
      costo_lote_kg:         costo_lote_kg,
      estado_disponibilidad: estado,
    }); }
  );
}

// ── Cotizaciones por RFQ ──────────────────────────────────

function getCotizacionesPorRFQ(rfqId) {
  if (!rfqId) return { ok: false, error: 'rfqId requerido' };
  var cots = filterArr(sheetToObjects(SHEETS.COTIZACIONES),
    function(c) { return c.rfq_id === rfqId; });
  return { ok: true, cotizaciones: cots };
}

// ── Fork de cotización ────────────────────────────────────
//  Crea una cotización nueva para un RFQ existente,
//  heredando todos los ítems del RFQ original.
//  body: { rfq_id, nombre, asesor }

function forkCotizacion(body) {
  var rfqId  = body.rfq_id;
  var nombre = (body.nombre || '').trim();
  if (!rfqId)  return { ok: false, error: 'rfq_id requerido' };
  if (!nombre) return { ok: false, error: 'nombre requerido' };

  var rfqs = filterArr(sheetToObjects(SHEETS.RFQ),
    function(r) { return r.rfq_id === rfqId; });
  if (!rfqs.length) return { ok: false, error: 'RFQ no encontrado' };

  var rfq       = rfqs[0];
  var rfqItems  = filterArr(sheetToObjects(SHEETS.RFQ_ITEMS),
    function(r) { return r.rfq_id === rfqId; });

  var cotId     = uid();
  var timestamp = now();

  var disponibles    = sheetToObjects(SHEETS.DISPONIBILIDADES);
  var costosEstandar = sheetToObjects(SHEETS.COSTOS_ESTANDAR);

  for (var i = 0; i < rfqItems.length; i++) {
    var item      = rfqItems[i];
    var cotItemId = uid();

    var lote          = findOne(disponibles, function(d) { return d.lote_id === item.lote_id; }) || {};
    var costo_lote_kg = parseFloat(lote.costo_cop_kg || 0);

    appendRow(SHEETS.COTIZACION_ITEMS, {
      cot_item_id:       cotItemId,
      cotizacion_id:     cotId,
      rfq_item_id:       item.rfq_item_id,
      lote_id:           '',
      variedad:          item.variedad          || '',
      origen:            item.origen            || '',
      cantidad_unidades: item.cantidad_unidades || 0,
      presentacion:      item.presentacion      || '1Kg',
      estado_proceso:    item.estado_proceso     || 'Verde',
      etiquetas:         item.etiquetas         || '',
      costo_lote_kg:     0,
      precio_final_kg:   0,
      precio_unitario:   0,
      total_cop:         0,
      total_usd:         0,
      total_eur:         0,
      perfil_sensorial:  item.perfil_sensorial  || '',
    });

    var estadoProceso = (item.estado_proceso || 'Verde').toLowerCase();
    var aplicables    = filterArr(costosEstandar, function(c) {
      if (c.activo === false || c.activo === 'FALSE') return false;
      var etiquetasOk = _etiquetasMatch(c.etiquetas, item.etiquetas);
      var procOk = !c.presentacion || c.presentacion === '*' ||
                   c.presentacion.toLowerCase() === estadoProceso;
      return etiquetasOk && procOk;
    });

    for (var j = 0; j < aplicables.length; j++) {
      var c = aplicables[j];
      appendRow(SHEETS.COTIZACION_COSTOS, {
        costo_id:      uid(),
        cotizacion_id: cotId,
        cot_item_id:   cotItemId,
        nombre:        c.nombre,
        tipo:          c.tipo || 'estandar',
        moneda:        'COP',
        valor_kg:      parseFloat(c.valor_cop_kg || 0),
        incoterm_id:   parseFloat(c.incoterm_max  || 0),
        editable:      true,
        created_at:    timestamp,
        updated_at:    timestamp,
      });
    }
  }

  appendRow(SHEETS.COTIZACIONES, {
    cotizacion_id:     cotId,
    rfq_id:            rfqId,
    nombre:            nombre,
    cliente:           rfq.cliente           || '',
    asesor:            body.asesor           || rfq.asesor || '',
    moneda_solicitada: rfq.moneda_solicitada || 'USD',
    tasa_usd:          0,
    tasa_eur:          0,
    estado:            'borrador',
    created_at:        timestamp,
    updated_at:        timestamp,
  });

  return { ok: true, cotizacion_id: cotId };
}



// ── Editar RFQ ────────────────────────────────────────────
//  Actualiza encabezado e ítems del RFQ y registra trazabilidad.
//  Las cotizaciones existentes NO se modifican.
//  body: { rfq_id, usuario, encabezado: {...}, items: [{rfq_item_id, ...}] }

function editarRFQ(body) {
  var rfqId   = body.rfq_id;
  var usuario = body.usuario || 'anon';
  if (!rfqId) return { ok: false, error: 'rfq_id requerido' };

  var timestamp   = now();
  var rfqs        = filterArr(sheetToObjects(SHEETS.RFQ),
    function(r) { return r.rfq_id === rfqId; });
  if (!rfqs.length) return { ok: false, error: 'RFQ no encontrado' };

  var rfqActual   = rfqs[0];
  var enc         = body.encabezado || {};
  var CAMPOS_ENC  = ['cliente', 'asesor', 'fecha', 'moneda_solicitada'];
  var CAMPOS_ITEM = ['variedad', 'cantidad_unidades', 'fecha_requerida', 'destino'];

  // ── 1. Actualizar encabezado ──────────────────────────
  var encUpd = {};
  for (var e = 0; e < CAMPOS_ENC.length; e++) {
    var campo = CAMPOS_ENC[e];
    var valNuevo   = enc[campo];
    var valActual  = rfqActual[campo];
    // Ignorar si el valor nuevo es vacío o undefined
    if (valNuevo === undefined || valNuevo === null || String(valNuevo).trim() === '') continue;
    if (String(valNuevo).trim() === String(valActual).trim()) continue;
    _registrarTraza(rfqId, null, campo,
      String(valActual), String(valNuevo), timestamp, usuario);
    encUpd[campo] = valNuevo;
  }
  if (Object.keys(encUpd).length > 0) {
    updateRows(SHEETS.RFQ,
      function(r) { return r.rfq_id === rfqId; },
      function(r) { return mergeObj(r, encUpd); }
    );
  }

  // ── 2. Actualizar ítems ───────────────────────────────
  var items        = body.items || [];
  var rfqItemsAll  = filterArr(sheetToObjects(SHEETS.RFQ_ITEMS),
    function(r) { return r.rfq_id === rfqId; });

  for (var i = 0; i < items.length; i++) {
    var itemNuevo = items[i];
    var itemId    = itemNuevo.rfq_item_id;
    var itemActual = findOne(rfqItemsAll,
      function(r) { return r.rfq_item_id === itemId; });
    if (!itemActual) continue;

    var itemUpd = {};
    for (var f = 0; f < CAMPOS_ITEM.length; f++) {
      var campo    = CAMPOS_ITEM[f];
      var valNuevo = itemNuevo[campo];
      var valActual = itemActual[campo];
      // Ignorar si el valor nuevo es vacío o undefined
      if (valNuevo === undefined || valNuevo === null || String(valNuevo).trim() === '') continue;
      if (String(valNuevo).trim() === String(valActual).trim()) continue;
      _registrarTraza(rfqId, itemId, campo,
        String(valActual), String(valNuevo), timestamp, usuario);
      itemUpd[campo] = valNuevo;
    }
    if (Object.keys(itemUpd).length > 0) {
      updateRows(SHEETS.RFQ_ITEMS,
        function(r) { return r.rfq_item_id === itemId; },
        function(r) { return mergeObj(r, itemUpd); }
      );
    }
  }

  return { ok: true };
}

function _registrarTraza(rfq_id, rfq_item_id, campo,
                          valor_anterior, valor_nuevo, timestamp, usuario) {
  appendRow(SHEETS.RFQ_TRAZA, {
    traza_id:       uid(),
    rfq_id:         rfq_id,
    rfq_item_id:    rfq_item_id || '',
    campo:          campo,
    valor_anterior: valor_anterior,
    valor_nuevo:    valor_nuevo,
    timestamp:      timestamp,
    usuario:        usuario,
  });
}

// ── RFQ ───────────────────────────────────────────────────

function listRFQs() {
  return { ok: true, rfqs: sheetToObjects(SHEETS.RFQ) };
}

function getRFQ(rfqId) {
  if (!rfqId) return { ok: false, error: 'rfqId requerido' };
  var rfqs  = filterArr(sheetToObjects(SHEETS.RFQ), function(r) { return r.rfq_id === rfqId; });
  var items = filterArr(sheetToObjects(SHEETS.RFQ_ITEMS), function(r) { return r.rfq_id === rfqId; });
  if (!rfqs.length) return { ok: false, error: 'RFQ no encontrado' };
  return { ok: true, rfq: rfqs[0], items: items };
}

// ── Cotización ────────────────────────────────────────────

function getCotizacion(cotizacionId) {
  if (!cotizacionId) return { ok: false, error: 'cotizacionId requerido' };

  var cots     = filterArr(sheetToObjects(SHEETS.COTIZACIONES),
    function(r) { return r.cotizacion_id === cotizacionId; });
  var cotItems = filterArr(sheetToObjects(SHEETS.COTIZACION_ITEMS),
    function(r) { return r.cotizacion_id === cotizacionId; });
  var costos   = filterArr(sheetToObjects(SHEETS.COTIZACION_COSTOS),
    function(r) { return r.cotizacion_id === cotizacionId; });

  if (!cots.length) return { ok: false, error: 'Cotización no encontrada' };

  var rfqItemIds = mapArr(cotItems, function(i) { return i.rfq_item_id; });
  var rfqItems   = filterArr(sheetToObjects(SHEETS.RFQ_ITEMS), function(r) {
    for (var i = 0; i < rfqItemIds.length; i++) {
      if (rfqItemIds[i] === r.rfq_item_id) return true;
    }
    return false;
  });

  var allComisiones = SS.getSheetByName(SHEETS.COTIZACION_TASAS)
    ? sheetToObjects(SHEETS.COTIZACION_TASAS) : [];
  var comisiones = filterArr(allComisiones,
    function(r) { return r.cotizacion_id === cotizacionId; });

  return { ok: true, cotizacion: cots[0], items: cotItems,
           costos: costos, rfqItems: rfqItems,
           comisiones: comisiones };
}

// ── Crear RFQ ─────────────────────────────────────────────

function crearRFQ(body) {
  var rfqId     = uid();
  var cotId     = uid();
  var timestamp = now();
  var items     = body.items || [];

  appendRow(SHEETS.RFQ, {
    rfq_id:            rfqId,
    cotizacion_id:     cotId,
    cliente:           body.cliente           || '',
    asesor:            body.asesor            || '',
    fecha:             body.fecha             || timestamp,
    moneda_solicitada: body.moneda_solicitada || 'USD',
    estado:            'borrador',
    created_at:        timestamp,
  });

  var disponibles    = sheetToObjects(SHEETS.DISPONIBILIDADES);
  var costosEstandar = sheetToObjects(SHEETS.COSTOS_ESTANDAR);

  var rfqItemsRows   = [];
  var cotItemsRows   = [];
  var cotCostosRows  = [];

  for (var i = 0; i < items.length; i++) {
    var item      = items[i];
    var rfqItemId = uid();
    var cotItemId = uid();

    rfqItemsRows.push({
      rfq_item_id:       rfqItemId,
      rfq_id:            rfqId,
      variedad:          item.variedad          || '',
      origen:            item.origen            || '',
      destino:           item.destino           || '',
      fecha_requerida:   item.fecha_requerida   || '',
      cantidad_unidades: item.cantidad_unidades || 0,
      presentacion:      item.presentacion      || '1Kg',
      estado_proceso:    item.estado_proceso     || 'Verde',
      etiquetas:         item.etiquetas         || '',
      lote_id:           item.lote_id           || '',
      perfil_sensorial:  item.perfil_sensorial  || '',
    });

    var lote          = findOne(disponibles, function(d) { return d.lote_id === item.lote_id; }) || {};
    var costo_lote_kg = parseFloat(lote.costo_cop_kg || 0);

    cotItemsRows.push({
      cot_item_id:       cotItemId,
      cotizacion_id:     cotId,
      rfq_item_id:       rfqItemId,
      lote_id:           item.lote_id           || '',
      variedad:          item.variedad          || '',
      origen:            item.origen            || '',
      cantidad_unidades: item.cantidad_unidades || 0,
      presentacion:      item.presentacion      || '1Kg',
      estado_proceso:    item.estado_proceso     || 'Verde',
      etiquetas:         item.etiquetas         || '',
      costo_lote_kg:     costo_lote_kg,
      precio_final_kg:   0,
      precio_unitario:   0,
      total_cop:         0,
      total_usd:         0,
      total_eur:         0,
      perfil_sensorial:  item.perfil_sensorial  || '',
    });

    var estadoProceso = (item.estado_proceso || 'Verde').toLowerCase();
    var aplicables = filterArr(costosEstandar, function(c) {
      if (c.activo === false || c.activo === 'FALSE') return false;
      var etiquetasOk = _etiquetasMatch(c.etiquetas, item.etiquetas);
      var procOk = !c.presentacion || c.presentacion === '*' ||
                   c.presentacion.toLowerCase() === estadoProceso;
      return etiquetasOk && procOk;
    });

    for (var j = 0; j < aplicables.length; j++) {
      var c = aplicables[j];
      cotCostosRows.push({
        costo_id:      uid(),
        cotizacion_id: cotId,
        cot_item_id:   cotItemId,
        nombre:        c.nombre,
        tipo:          c.tipo || 'estandar',
        moneda:        'COP',
        valor_kg:      parseFloat(c.valor_cop_kg || 0),
        incoterm_id:   parseFloat(c.incoterm_max  || 0),
        editable:      true,
        created_at:    timestamp,
        updated_at:    timestamp,
      });
    }
  }

  // Write all rows in three batch calls instead of N×M individual appends
  batchAppendRows(SHEETS.RFQ_ITEMS,        rfqItemsRows);
  batchAppendRows(SHEETS.COTIZACION_ITEMS, cotItemsRows);
  batchAppendRows(SHEETS.COTIZACION_COSTOS, cotCostosRows);

  appendRow(SHEETS.COTIZACIONES, {
    cotizacion_id:     cotId,
    rfq_id:            rfqId,
    nombre:            body.nombre_cotizacion || 'Cotización 1',
    cliente:           body.cliente           || '',
    asesor:            body.asesor            || '',
    moneda_solicitada: body.moneda_solicitada || 'USD',
    tasa_usd:          body.tasa_usd          || 0,
    tasa_eur:          body.tasa_eur          || 0,
    estado:            'borrador',
    created_at:        timestamp,
    updated_at:        timestamp,
  });

  recalcularTotales(cotId);
  return { ok: true, rfq_id: rfqId, cotizacion_id: cotId };
}

// ── Guardar cotización ────────────────────────────────────

function guardarCotizacion(body) {
  var cotizacion_id = body.cotizacion_id;
  var usuario       = body.usuario       || 'anon';
  var costos        = body.costos        || [];
  var costos_nuevos = body.costos_nuevos || [];
  var perfiles      = body.perfiles      || [];
  var tasa_usd      = body.tasa_usd;
  var tasa_eur      = body.tasa_eur;

  if (!cotizacion_id) return { ok: false, error: 'cotizacion_id requerido' };

  Logger.log('perfiles recibidos: ' + JSON.stringify(perfiles));

  var timestamp = now();

  if (tasa_usd !== undefined || tasa_eur !== undefined) {
    updateRows(SHEETS.COTIZACIONES,
      function(r) { return r.cotizacion_id === cotizacion_id; },
      function(r) {
        var upd = { updated_at: timestamp };
        if (tasa_usd !== undefined) upd.tasa_usd = parseFloat(tasa_usd);
        if (tasa_eur !== undefined) upd.tasa_eur = parseFloat(tasa_eur);
        return mergeObj(r, upd);
      }
    );
  }

  var costosActuales = filterArr(sheetToObjects(SHEETS.COTIZACION_COSTOS),
    function(c) { return c.cotizacion_id === cotizacion_id; });

  // Build change map and historial entries without touching the sheet yet
  var costosChangeMap = {};
  var historialEntries = [];
  for (var i = 0; i < costos.length; i++) {
    var edit   = costos[i];
    var actual = findOne(costosActuales, function(c) { return c.costo_id === edit.costo_id; });
    if (!actual) continue;
    var valorAnterior = parseFloat(actual.valor_kg || 0);
    var valorNuevo    = parseFloat(edit.valor_kg   || 0);
    if (valorAnterior === valorNuevo) continue;
    costosChangeMap[edit.costo_id] = { valor_kg: valorNuevo, updated_at: timestamp };
    historialEntries.push({
      historial_id:   uid(),
      cotizacion_id:  cotizacion_id,
      cot_item_id:    actual.cot_item_id,
      costo_id:       edit.costo_id,
      nombre_costo:   actual.nombre,
      moneda:         actual.moneda || 'COP',
      valor_anterior: valorAnterior,
      valor_nuevo:    valorNuevo,
      timestamp:      timestamp,
      usuario:        usuario,
    });
  }
  // Single read-modify-write for all changed costs
  if (historialEntries.length > 0) {
    bulkUpdateRows(SHEETS.COTIZACION_COSTOS, function(r) {
      return costosChangeMap[r.costo_id] || null;
    });
    for (var h = 0; h < historialEntries.length; h++) {
      appendRow(SHEETS.COTIZACION_COSTOS_HISTORIAL, historialEntries[h]);
    }
  }

  for (var i = 0; i < costos_nuevos.length; i++) {
    var nuevo   = costos_nuevos[i];
    var costoId = uid();
    var moneda  = (nuevo.moneda || 'COP').toUpperCase();

    appendRow(SHEETS.COTIZACION_COSTOS, {
      costo_id:      costoId,
      cotizacion_id: cotizacion_id,
      cot_item_id:   nuevo.cot_item_id || '',
      nombre:        nuevo.nombre      || 'Costo adicional',
      tipo:          nuevo.tipo        || 'manual',
      moneda:        moneda,
      valor_kg:      parseFloat(nuevo.valor_kg   || 0),
      incoterm_id:   parseFloat(nuevo.incoterm_id || 0),
      editable:      true,
      created_at:    timestamp,
      updated_at:    timestamp,
    });

    appendRow(SHEETS.COTIZACION_COSTOS_HISTORIAL, {
      historial_id:   uid(),
      cotizacion_id:  cotizacion_id,
      cot_item_id:    nuevo.cot_item_id || '',
      costo_id:       costoId,
      nombre_costo:   nuevo.nombre || 'Costo adicional',
      moneda:         moneda,
      valor_anterior: 0,
      valor_nuevo:    parseFloat(nuevo.valor_kg || 0),
      timestamp:      timestamp,
      usuario:        usuario,
    });
  }

  for (var p = 0; p < perfiles.length; p++) {
    Logger.log('guardando perfil: ' + JSON.stringify(perfiles[p]));
    _guardarPerfil(perfiles[p].cot_item_id, perfiles[p].perfil_sensorial);
  }

  // ── Guardar overrides de comisiones/descuentos ──────────
  var comisiones = body.comisiones || [];
  if (comisiones.length > 0) {
    // Read sheet once before the loop
    var _ctRows = SS.getSheetByName(SHEETS.COTIZACION_TASAS)
      ? sheetToObjects(SHEETS.COTIZACION_TASAS) : [];

    var comisionesChangeMap = {};
    var comisionesNuevas    = [];

    for (var ci = 0; ci < comisiones.length; ci++) {
      var com      = comisiones[ci];
      var existing = findOne(_ctRows, function(r) {
        return r.cotizacion_id === cotizacion_id
            && String(r.cot_item_id) === String(com.cot_item_id)
            && String(r.tasa_id)    === String(com.tasa_id);
      });
      if (existing) {
        comisionesChangeMap[existing.cotizacion_tasa_id] = {
          tasa_valor: parseFloat(com.tasa_valor || 0),
          updated_at: timestamp,
        };
      } else {
        comisionesNuevas.push({
          cotizacion_tasa_id: uid(),
          cotizacion_id:      cotizacion_id,
          cot_item_id:        com.cot_item_id || '',
          tasa_id:            com.tasa_id,
          tasa_valor:         parseFloat(com.tasa_valor || 0),
          created_at:         timestamp,
          updated_at:         timestamp,
        });
      }
    }
    // Single write for all updates
    if (Object.keys(comisionesChangeMap).length > 0) {
      bulkUpdateRows(SHEETS.COTIZACION_TASAS, function(r) {
        return comisionesChangeMap[r.cotizacion_tasa_id] || null;
      });
    }
    for (var cn = 0; cn < comisionesNuevas.length; cn++) {
      appendRow(SHEETS.COTIZACION_TASAS, comisionesNuevas[cn]);
    }
  }

  recalcularTotales(cotizacion_id);

  updateRows(SHEETS.COTIZACIONES,
    function(r) { return r.cotizacion_id === cotizacion_id; },
    function(r) { return mergeObj(r, { estado: 'revisado', updated_at: timestamp }); }
  );

  return { ok: true, cotizacion_id: cotizacion_id };
}

// ── Tasas de comisiones / descuentos ──────────────────────

function getTasas() {
  return { ok: true, tasas: sheetToObjects(SHEETS.TASAS) };
}

// ── Guardar tasas ─────────────────────────────────────────

function guardarTasas(body) {
  var cotizacion_id = body.cotizacion_id;
  var tasa_usd      = body.tasa_usd;
  var tasa_eur      = body.tasa_eur;

  if (!cotizacion_id) return { ok: false, error: 'cotizacion_id requerido' };
  if (!tasa_usd && !tasa_eur) return { ok: false, error: 'Se requiere al menos una tasa' };

  updateRows(SHEETS.COTIZACIONES,
    function(r) { return r.cotizacion_id === cotizacion_id; },
    function(r) {
      var upd = { updated_at: now() };
      if (tasa_usd) upd.tasa_usd = parseFloat(tasa_usd);
      if (tasa_eur) upd.tasa_eur = parseFloat(tasa_eur);
      return mergeObj(r, upd);
    }
  );
  recalcularTotales(cotizacion_id);
  return { ok: true };
}

// ── Recalcular totales ────────────────────────────────────

function recalcularTotales(cotizacion_id) {
  var cot      = findOne(sheetToObjects(SHEETS.COTIZACIONES),
    function(c) { return c.cotizacion_id === cotizacion_id; }) || {};
  var tasa_usd = parseFloat(cot.tasa_usd || 1);
  var tasa_eur = parseFloat(cot.tasa_eur || 1);

  var items  = filterArr(sheetToObjects(SHEETS.COTIZACION_ITEMS),
    function(i) { return i.cotizacion_id === cotizacion_id; });
  var costos = filterArr(sheetToObjects(SHEETS.COTIZACION_COSTOS),
    function(c) { return c.cotizacion_id === cotizacion_id; });

  // Compute all item updates first, then write once
  var itemUpdatesMap = {};
  for (var i = 0; i < items.length; i++) {
    var item = items[i];

    var itemCostos = filterArr(costos,
      function(c) { return c.cot_item_id === item.cot_item_id; });

    var sumaCostosKgCOP = reduceArr(itemCostos, function(sum, c) {
      return sum + aCOP(parseFloat(c.valor_kg || 0), c.moneda, tasa_usd, tasa_eur);
    }, 0);

    var precio_final_kg = parseFloat(item.costo_lote_kg || 0) + sumaCostosKgCOP;
    var cantidad        = parseFloat(item.cantidad_unidades || 0);
    var factor          = factorPresentacion(item.presentacion, item.cantidad_unidades);
    var precio_unitario = precio_final_kg * factor;
    var total_cop       = item.presentacion === 'Granel' ? precio_unitario : precio_unitario * cantidad;

    itemUpdatesMap[item.cot_item_id] = {
      precio_final_kg: precio_final_kg,
      precio_unitario: precio_unitario,
      total_cop:       total_cop,
      total_usd:       tasa_usd > 0 ? total_cop / tasa_usd : 0,
      total_eur:       tasa_eur > 0 ? total_cop / tasa_eur : 0,
    };
  }

  // Single read-modify-write for all items
  bulkUpdateRows(SHEETS.COTIZACION_ITEMS, function(r) {
    return itemUpdatesMap[r.cot_item_id] || null;
  });
}
