/**
 * Basket Tracker — backend de Google Apps Script (optimizado).
 *
 * Cómo aplicarlo:
 * 1. En la hoja: Extensiones > Apps Script.
 * 2. Reemplaza TODO el código por este archivo.
 * 3. Guarda y, si hace falta, vuelve a implementar la implementación
 *    existente de la app web (misma URL, ejecutar como tú, acceso: cualquiera).
 *
 * Cambio principal: guardar asistencia ya no borra/escribe alumno por alumno.
 * Eso era lo que hacía esperar tanto al pulsar Guardar.
 */

var HOJAS_IGNORADAS = {
  Estudiantes: true,
  Estudiantes_Old_Backup: true,
  Lista_Estudiantes: true
};

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("🏀 Basket Tracker")
    .addItem("Activar Sincronización Automática", "configurarSincronizacion")
    .addToUi();
}

function configurarSincronizacion() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet();
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() == "alCambiarNombreHoja") {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  ScriptApp.newTrigger("alCambiarNombreHoja").forSpreadsheet(sheet).onChange();
  guardarNombresHojas(sheet);
  actualizarValidacionParalelos(sheet);
  SpreadsheetApp.getUi().alert("Sincronización activada. Los desplegables se actualizarán automáticamente si cambias el nombre de las hojas.");
}

function guardarNombresHojas(ss) {
  var hojas = ss.getSheets();
  var props = PropertiesService.getDocumentProperties();
  var mapa = {};
  hojas.forEach(function (h) {
    mapa[h.getSheetId()] = h.getName();
  });
  props.setProperty("mapaHojas", JSON.stringify(mapa));
}

function esHojaIgnorada(nombre) {
  return !!HOJAS_IGNORADAS[nombre];
}

function actualizarValidacionParalelos(ss) {
  var estSheet = ss.getSheetByName("Estudiantes");
  if (!estSheet) return;
  var nombres = [];
  ss.getSheets().forEach(function (h) {
    var n = h.getName();
    if (!esHojaIgnorada(n)) nombres.push(n);
  });
  if (nombres.length > 0) {
    var rule = SpreadsheetApp.newDataValidation().requireValueInList(nombres, true).build();
    estSheet.getRange("A2:A").setDataValidation(rule);
  }
}

function alCambiarNombreHoja(e) {
  if (e.changeType !== "OTHER" && e.changeType !== "INSERT_GRID" && e.changeType !== "REMOVE_GRID") return;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var props = PropertiesService.getDocumentProperties();
  var mapaAntiguo = JSON.parse(props.getProperty("mapaHojas") || "{}");
  var nombreViejo = null;
  var nombreNuevo = null;

  ss.getSheets().forEach(function (h) {
    var id = String(h.getSheetId());
    var name = h.getName();
    if (mapaAntiguo[id] && mapaAntiguo[id] !== name) {
      nombreViejo = mapaAntiguo[id];
      nombreNuevo = name;
    }
  });

  if (nombreViejo && nombreNuevo) {
    var estSheet = ss.getSheetByName("Estudiantes");
    if (estSheet && estSheet.getLastRow() > 1) {
      var data = estSheet.getRange(2, 1, estSheet.getLastRow() - 1, 1).getValues();
      for (var i = 0; i < data.length; i++) {
        if (data[i][0] === nombreViejo) data[i][0] = nombreNuevo;
      }
      estSheet.getRange(2, 1, data.length, 1).setValues(data);
    }
  }
  guardarNombresHojas(ss);
  actualizarValidacionParalelos(ss);
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function asegurarHojaEstudiantes(sheet) {
  var estSheet = sheet.getSheetByName("Estudiantes");
  if (estSheet) return estSheet;
  estSheet = sheet.insertSheet("Estudiantes");
  estSheet.getRange("A1:C1").setValues([["Paralelo", "Código Banner", "Nombre"]]);
  estSheet.getRange("A1:C1").setFontWeight("bold");
  return estSheet;
}

function asegurarHojaAsistencia(sheet, paralelo) {
  var targetSheet = sheet.getSheetByName(paralelo);
  if (!targetSheet) {
    targetSheet = sheet.insertSheet(paralelo);
    targetSheet.getRange("A1:E1").setValues([["Fecha", "Banner", "Estudiante", "Estado", "Notas"]]);
    targetSheet.getRange("A1:E1").setFontWeight("bold");
    asegurarFormatoEstado(targetSheet);
    return targetSheet;
  }
  var lastCol = Math.max(1, targetSheet.getLastColumn());
  var headers = targetSheet.getRange(1, 1, 1, lastCol).getValues()[0];
  if (headers[1] !== "Banner" && headers[1] !== "Código Banner") {
    targetSheet.insertColumnAfter(1);
    targetSheet.getRange("B1").setValue("Banner");
  }
  asegurarFormatoEstado(targetSheet);
  return targetSheet;
}

function asegurarFormatoEstado(targetSheet) {
  var rules = targetSheet.getConditionalFormatRules() || [];
  var yaTiene = rules.some(function (rule) {
    var cond = rule.getBooleanCondition();
    if (!cond) return false;
    var vals = cond.getValues() || [];
    return vals.join(" ").indexOf("Presente") !== -1;
  });
  if (yaTiene) return;
  var rango = targetSheet.getRange("D2:D");
  rules.push(
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("Presente").setBackground("#10b981").setFontColor("#FFFFFF").setRanges([rango]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("Falta").setBackground("#ef4444").setFontColor("#FFFFFF").setRanges([rango]).build(),
    SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("Atraso").setBackground("#f59e0b").setFontColor("#000000").setRanges([rango]).build()
  );
  targetSheet.setConditionalFormatRules(rules);
}

function listarAlumnos(sheet) {
  var estSheet = asegurarHojaEstudiantes(sheet);
  var result = { paralelos: [], alumnos: {} };
  var paralelosSet = {};

  sheet.getSheets().forEach(function (s) {
    var sName = s.getName();
    if (esHojaIgnorada(sName)) return;
    paralelosSet[sName] = true;
    if (!result.alumnos[sName]) result.alumnos[sName] = [];
  });

  if (estSheet.getLastRow() > 1) {
    var data = estSheet.getRange(2, 1, estSheet.getLastRow() - 1, 3).getDisplayValues();
    for (var i = 0; i < data.length; i++) {
      var p = String(data[i][0] || "").trim();
      var b = String(data[i][1] || "").trim();
      var n = String(data[i][2] || "").trim();
      if (!p || !n) continue;
      paralelosSet[p] = true;
      if (!result.alumnos[p]) result.alumnos[p] = [];
      result.alumnos[p].push({ banner: b, nombre: n });
    }
  }

  result.paralelos = Object.keys(paralelosSet).sort();
  return result;
}

function obtenerRegistrosAsistencia(sheet, tz, paralelo, fecha) {
  var registros = [];
  var targetSheet = sheet.getSheetByName(paralelo);
  if (!targetSheet || targetSheet.getLastRow() <= 1) return registros;

  var lastCol = Math.max(5, targetSheet.getLastColumn());
  var data = targetSheet.getRange(1, 1, targetSheet.getLastRow(), Math.min(5, lastCol)).getDisplayValues();
  var colBanner = 1;
  var colNombre = 2;
  var colEstado = 3;
  var colNotas = 4;
  if (data[0][1] !== "Banner" && data[0][1] !== "Código Banner") {
    colBanner = -1;
    colNombre = 1;
    colEstado = 2;
    colNotas = 3;
  }

  for (var i = 1; i < data.length; i++) {
    if (normalizeDate(data[i][0], tz) !== fecha) continue;
    registros.push({
      banner: colBanner >= 0 ? String(data[i][colBanner] || "") : "",
      estudiante: String(data[i][colNombre] || ""),
      estado: String(data[i][colEstado] || ""),
      notas: String(data[i][colNotas] || "")
    });
  }
  return registros;
}

function escribirBloque(targetSheet, startRow, rows) {
  if (!rows.length) return;
  targetSheet.getRange(startRow, 1, rows.length, 5).setValues(rows);
  targetSheet.getRange(startRow, 1, rows.length, 2).setNumberFormat("@");
  var bgs = [];
  var fgs = [];
  for (var i = 0; i < rows.length; i++) {
    var est = rows[i][3];
    if (est === "Presente") {
      bgs.push(["#10b981"]);
      fgs.push(["#FFFFFF"]);
    } else if (est === "Falta") {
      bgs.push(["#ef4444"]);
      fgs.push(["#FFFFFF"]);
    } else if (est === "Atraso") {
      bgs.push(["#f59e0b"]);
      fgs.push(["#000000"]);
    } else {
      bgs.push([null]);
      fgs.push([null]);
    }
  }
  targetSheet.getRange(startRow, 4, rows.length, 1).setBackgrounds(bgs).setFontColors(fgs);
}

function reemplazarAsistenciaFecha(targetSheet, tz, fecha, nuevasFilas) {
  var lastRow = targetSheet.getLastRow();
  if (lastRow > 1) {
    var dates = targetSheet.getRange(2, 1, lastRow - 1, 1).getDisplayValues();
    var first = -1;
    var last = -1;
    var count = 0;
    var contiguous = true;
    for (var i = 0; i < dates.length; i++) {
      if (normalizeDate(dates[i][0], tz) !== fecha) continue;
      if (first === -1) first = i;
      else if (i !== last + 1) contiguous = false;
      last = i;
      count++;
    }

    if (count > 0 && contiguous) {
      targetSheet.deleteRows(first + 2, count);
    } else if (count > 0) {
      var data = targetSheet.getRange(2, 1, lastRow - 1, 5).getDisplayValues();
      var kept = [];
      for (var r = 0; r < data.length; r++) {
        if (normalizeDate(data[r][0], tz) === fecha) continue;
        kept.push([data[r][0], data[r][1], data[r][2], data[r][3], data[r][4]]);
      }
      targetSheet.getRange(2, 1, lastRow - 1, 5).clearContent();
      if (kept.length) {
        targetSheet.getRange(2, 1, kept.length, 5).setValues(kept);
      }
    }
  }

  if (!nuevasFilas.length) return;
  var start = Math.max(2, targetSheet.getLastRow() + 1);
  escribirBloque(targetSheet, start, nuevasFilas);
}

function doGet(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet();
  var tz = sheet.getSpreadsheetTimeZone();
  var params = e && e.parameter ? e.parameter : {};

  if (params.action === "obtener_asistencia") {
    return jsonOut({
      registros: obtenerRegistrosAsistencia(sheet, tz, params.paralelo, params.fecha)
    });
  }

  var result = listarAlumnos(sheet);
  if (params.incluir_asistencia === "1" && params.fecha) {
    var paraleloAsistencia = params.paralelo || result.paralelos[0];
    if (paraleloAsistencia) {
      result.registros = obtenerRegistrosAsistencia(sheet, tz, paraleloAsistencia, params.fecha);
    }
  }
  return jsonOut(result);
}

function doPost(e) {
  var lock = LockService.getDocumentLock();
  lock.waitLock(30000);
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet();
    var tz = sheet.getSpreadsheetTimeZone();
    var payload = JSON.parse(e.postData.contents);
    var action = payload.action;

    if (action === "agregar_alumno") {
      asegurarHojaEstudiantes(sheet).appendRow([payload.paralelo, payload.banner, payload.nombre]);
    }

    if (action === "editar_alumno") {
      editarAlumno(sheet, tz, payload);
    }

    if (action === "eliminar_alumno") {
      var estSheet = sheet.getSheetByName("Estudiantes");
      if (estSheet && estSheet.getLastRow() > 1) {
        var estData = estSheet.getRange(2, 1, estSheet.getLastRow() - 1, 3).getValues();
        for (var i = estData.length - 1; i >= 0; i--) {
          if (estData[i][0] == payload.paralelo && estData[i][2] == payload.nombreAnterior) {
            estSheet.deleteRow(i + 2);
            break;
          }
        }
      }
    }

    if (action === "guardar_asistencia") {
      var targetSheet = asegurarHojaAsistencia(sheet, payload.paralelo);
      var nuevasFilas = (payload.registros || []).map(function (reg) {
        return [
          payload.fecha,
          String(reg.banner || ""),
          String(reg.estudiante || ""),
          String(reg.estado || ""),
          String(reg.notas || "")
        ];
      });
      reemplazarAsistenciaFecha(targetSheet, tz, payload.fecha, nuevasFilas);
    }

    return jsonOut({ status: "ok" });
  } finally {
    lock.releaseLock();
  }
}

function editarAlumno(sheet, tz, payload) {
  var estSheet = sheet.getSheetByName("Estudiantes");
  if (estSheet && estSheet.getLastRow() > 1) {
    var estData = estSheet.getRange(2, 1, estSheet.getLastRow() - 1, 3).getValues();
    for (var i = 0; i < estData.length; i++) {
      if (estData[i][0] == payload.paraleloAnterior && estData[i][2] == payload.nombreAnterior) {
        estSheet.getRange(i + 2, 1, 1, 3).setValues([[payload.paraleloNuevo, payload.bannerNuevo, payload.nombreNuevo]]);
        break;
      }
    }
  }

  var oldTargetSheet = sheet.getSheetByName(payload.paraleloAnterior);
  if (!oldTargetSheet || oldTargetSheet.getLastRow() < 1) return;

  var oldData = oldTargetSheet.getRange(1, 1, oldTargetSheet.getLastRow(), Math.max(5, oldTargetSheet.getLastColumn())).getValues();
  if (oldData[0][1] !== "Banner" && oldData[0][1] !== "Código Banner") {
    oldTargetSheet.insertColumnAfter(1);
    oldTargetSheet.getRange("B1").setValue("Banner");
    oldData = oldTargetSheet.getRange(1, 1, oldTargetSheet.getLastRow(), 5).getValues();
  }

  var kept = [oldData[0].slice(0, 5)];
  var rowsToMove = [];
  var mudanza = payload.paraleloAnterior !== payload.paraleloNuevo;

  for (var j = 1; j < oldData.length; j++) {
    if (oldData[j][2] != payload.nombreAnterior) {
      kept.push(oldData[j].slice(0, 5));
      continue;
    }
    if (mudanza) {
      rowsToMove.push([
        normalizeDate(oldData[j][0], tz),
        payload.bannerNuevo,
        payload.nombreNuevo,
        oldData[j][3],
        oldData[j][4]
      ]);
    } else {
      var row = oldData[j].slice(0, 5);
      row[1] = payload.bannerNuevo;
      row[2] = payload.nombreNuevo;
      kept.push(row);
    }
  }

  var lastRow = oldTargetSheet.getLastRow();
  if (lastRow > 0) oldTargetSheet.getRange(1, 1, lastRow, 5).clearContent();
  if (kept.length) {
    oldTargetSheet.getRange(1, 1, kept.length, 5).setValues(kept);
    oldTargetSheet.getRange("A1:E1").setFontWeight("bold");
    if (kept.length > 1) {
      oldTargetSheet.getRange(2, 1, kept.length - 1, 2).setNumberFormat("@");
    }
  }

  if (mudanza && rowsToMove.length > 0) {
    var newTargetSheet = asegurarHojaAsistencia(sheet, payload.paraleloNuevo);
    escribirBloque(newTargetSheet, newTargetSheet.getLastRow() + 1, rowsToMove);
  }
}

function normalizeDate(val, tz) {
  if (!val) return "";
  if (val instanceof Date) return Utilities.formatDate(val, tz, "yyyy-MM-dd");
  var str = String(val).trim();
  if (str.indexOf("T") !== -1) str = str.split("T")[0];
  var match = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return match[0];
  return str;
}
