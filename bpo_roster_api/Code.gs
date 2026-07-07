/**
 * BPO Roster API
 * -----------------------------------------------------------------------
 * Standalone Google Apps Script web service backed by two sheets:
 *   - dim_accounts
 *   - dim_staff
 *
 * Completely independent of any other project in this repo. Deploy this
 * script bound to its own Google Sheet (see README.md for setup steps).
 *
 * Endpoints (both GET and POST share the same URL, routed by method):
 *
 *   GET  ?resource=accounts&apiKey=...[&id=ACC-001]
 *   GET  ?resource=staff&apiKey=...[&id=STF-00001][&account_id=ACC-001][&employment_status=Active]
 *   POST body: { "apiKey": "...", "resource": "accounts"|"staff", "action": "create"|"update"|"delete", "data": {...} }
 *
 * Auth: a single shared secret stored in Script Properties (API_KEY),
 * passed as ?apiKey=... on GET or "apiKey" in the JSON body on POST.
 */

var SHEET_ACCOUNTS = 'dim_accounts';
var SHEET_STAFF = 'dim_staff';

var ACCOUNTS_COLUMNS = [
  'account_id', 'account_name', 'account_code', 'industry', 'region',
  'program_type', 'contract_start_date', 'contract_status', 'seat_capacity',
  'account_manager', 'timezone_coverage', 'created_at'
];

var STAFF_COLUMNS = [
  'staff_id', 'first_name', 'last_name', 'email', 'account_id', 'role',
  'department', 'site_location', 'shift', 'seniority_level',
  'employment_status', 'hire_date', 'manager_id', 'updated_at'
];

function doGet(e) {
  try {
    checkApiKey(e.parameter.apiKey);
    var resource = e.parameter.resource;

    if (resource === 'accounts') {
      return respond(listAccounts(e.parameter));
    }
    if (resource === 'staff') {
      return respond(listStaff(e.parameter));
    }
    return respond({ error: 'Unknown resource. Use resource=accounts or resource=staff.' }, 400);
  } catch (err) {
    return respond({ error: err.message }, err.httpStatus || 500);
  }
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents || '{}');
    checkApiKey(body.apiKey);

    var resource = body.resource;
    var action = body.action;
    var data = body.data || {};

    if (resource !== 'accounts' && resource !== 'staff') {
      return respond({ error: 'Unknown resource. Use "accounts" or "staff".' }, 400);
    }
    if (['create', 'update', 'delete'].indexOf(action) === -1) {
      return respond({ error: 'Unknown action. Use "create", "update" or "delete".' }, 400);
    }

    var sheetName = resource === 'accounts' ? SHEET_ACCOUNTS : SHEET_STAFF;
    var columns = resource === 'accounts' ? ACCOUNTS_COLUMNS : STAFF_COLUMNS;
    var idColumn = resource === 'accounts' ? 'account_id' : 'staff_id';

    if (action === 'create') {
      return respond(createRow(sheetName, columns, idColumn, data));
    }
    if (action === 'update') {
      return respond(updateRow(sheetName, columns, idColumn, data));
    }
    return respond(deleteRow(sheetName, idColumn, data[idColumn]));
  } catch (err) {
    return respond({ error: err.message }, err.httpStatus || 500);
  }
}

// ---------------------------------------------------------------------------
// Resource handlers
// ---------------------------------------------------------------------------

function listAccounts(params) {
  var rows = sheetToObjects(SHEET_ACCOUNTS, ACCOUNTS_COLUMNS);

  if (params.id) {
    var match = rows.filter(function (r) { return r.account_id === params.id; })[0];
    if (!match) return notFound('Account', params.id);
    return { data: match };
  }
  if (params.contract_status) {
    rows = rows.filter(function (r) { return r.contract_status === params.contract_status; });
  }
  if (params.industry) {
    rows = rows.filter(function (r) { return r.industry === params.industry; });
  }
  return { data: rows, count: rows.length };
}

function listStaff(params) {
  var rows = sheetToObjects(SHEET_STAFF, STAFF_COLUMNS);

  if (params.id) {
    var match = rows.filter(function (r) { return r.staff_id === params.id; })[0];
    if (!match) return notFound('Staff member', params.id);
    return { data: match };
  }
  if (params.account_id) {
    rows = rows.filter(function (r) { return r.account_id === params.account_id; });
  }
  if (params.employment_status) {
    rows = rows.filter(function (r) { return r.employment_status === params.employment_status; });
  }
  if (params.role) {
    rows = rows.filter(function (r) { return r.role === params.role; });
  }
  return { data: rows, count: rows.length };
}

function createRow(sheetName, columns, idColumn, data) {
  if (!data[idColumn]) {
    throw httpError(idColumn + ' is required.', 400);
  }
  var sheet = getSheet(sheetName);
  var rows = sheetToObjects(sheetName, columns);
  if (rows.some(function (r) { return r[idColumn] === data[idColumn]; })) {
    throw httpError(idColumn + ' "' + data[idColumn] + '" already exists.', 409);
  }
  var rowValues = columns.map(function (col) { return data[col] !== undefined ? data[col] : ''; });
  sheet.appendRow(rowValues);
  return { data: data, message: 'Created.' };
}

function updateRow(sheetName, columns, idColumn, data) {
  if (!data[idColumn]) {
    throw httpError(idColumn + ' is required.', 400);
  }
  var sheet = getSheet(sheetName);
  var values = sheet.getDataRange().getValues();
  var header = values[0];
  var idIdx = header.indexOf(idColumn);

  for (var i = 1; i < values.length; i++) {
    if (values[i][idIdx] === data[idColumn]) {
      var rowNumber = i + 1; // 1-indexed, +1 for header
      columns.forEach(function (col, colIdx) {
        if (data[col] !== undefined) {
          sheet.getRange(rowNumber, colIdx + 1).setValue(data[col]);
        }
      });
      return { data: data, message: 'Updated.' };
    }
  }
  return notFound(idColumn, data[idColumn]);
}

function deleteRow(sheetName, idColumn, idValue) {
  if (!idValue) {
    throw httpError(idColumn + ' is required.', 400);
  }
  var sheet = getSheet(sheetName);
  var values = sheet.getDataRange().getValues();
  var header = values[0];
  var idIdx = header.indexOf(idColumn);

  for (var i = 1; i < values.length; i++) {
    if (values[i][idIdx] === idValue) {
      sheet.deleteRow(i + 1);
      return { message: idColumn + ' "' + idValue + '" deleted.' };
    }
  }
  return notFound(idColumn, idValue);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getSheet(sheetName) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) throw httpError('Sheet "' + sheetName + '" not found.', 500);
  return sheet;
}

function sheetToObjects(sheetName, columns) {
  var sheet = getSheet(sheetName);
  var values = sheet.getDataRange().getValues();
  var header = values[0];
  var colIdx = columns.map(function (col) { return header.indexOf(col); });

  var out = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    if (row.every(function (cell) { return cell === ''; })) continue; // skip blank rows
    var obj = {};
    columns.forEach(function (col, j) {
      var idx = colIdx[j];
      obj[col] = idx === -1 ? '' : row[idx];
    });
    out.push(obj);
  }
  return out;
}

function notFound(label, id) {
  throw httpError(label + ' "' + id + '" not found.', 404);
}

function httpError(message, status) {
  var err = new Error(message);
  err.httpStatus = status;
  return err;
}

function checkApiKey(providedKey) {
  var expectedKey = PropertiesService.getScriptProperties().getProperty('API_KEY');
  if (!expectedKey) {
    throw httpError('Server misconfigured: API_KEY script property is not set.', 500);
  }
  if (providedKey !== expectedKey) {
    throw httpError('Unauthorized: missing or invalid apiKey.', 401);
  }
}

function respond(body, statusCode) {
  // Apps Script web apps cannot set arbitrary HTTP status codes; the status
  // is embedded in the payload so clients can check it explicitly.
  var payload = statusCode ? Object.assign({ status: statusCode }, body) : Object.assign({ status: 200 }, body);
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
