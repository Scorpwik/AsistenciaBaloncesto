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

var MARCA_SESION = "__FECHA__";
var DIAS_SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
var COLOR_SESION = "#2c2a26";
var COLOR_DIA_A = "#ece8e1";
var COLOR_DIA_B = "#f7f5f1";
var COLOR_PRESENTE = "#3f5c4a";
var COLOR_FALTA = "#7a3e3e";
var COLOR_ATRASO = "#8a6a3b";

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("🏀 Basket Tracker")
    .addItem("Agrupar fechas en esta hoja", "menuOrganizarVista")
    .addItem("Activar Sincronización Automática", "configurarSincronizacion")
    .addToUi();
}

function menuOrganizarVista() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var hoja = ss.getActiveSheet();
  if (esHojaIgnorada(hoja.getName())) {
    ss.getUi().alert("Abre una hoja de horario (Horario1, Horario2...) y vuelve a intentar.");
    return;
  }
  organizarVistaAsistencia(hoja, ss.getSpreadsheetTimeZone(), "");
  ss.getUi().alert("Listo. A la izquierda de las filas aparecen + y − para abrir o cerrar cada fecha.");
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
    targetSheet.getRange("A:A").setNumberFormat("yyyy-mm-dd");
    targetSheet.getRange("B:B").setNumberFormat("@");
    return targetSheet;
  }
  var lastCol = Math.max(1, targetSheet.getLastColumn());
  var headers = targetSheet.getRange(1, 1, 1, lastCol).getValues()[0];
  if (headers[1] !== "Banner" && headers[1] !== "Código Banner") {
    targetSheet.insertColumnAfter(1);
    targetSheet.getRange("B1").setValue("Banner");
  }
  asegurarFormatoEstado(targetSheet);
  targetSheet.getRange("A:A").setNumberFormat("yyyy-mm-dd");
  targetSheet.getRange("B:B").setNumberFormat("@");
  return targetSheet;
}

function asegurarFormatoEstado(targetSheet) {
  var rules = [];
  try {
    rules = targetSheet.getConditionalFormatRules() || [];
  } catch (e) {
    return;
  }
  var yaTiene = false;
  for (var i = 0; i < rules.length; i++) {
    try {
      var cond = rules[i].getBooleanCondition();
      if (!cond) continue;
      var vals = [];
      if (typeof cond.getCriteriaValues === "function") vals = cond.getCriteriaValues() || [];
      else if (typeof cond.getValues === "function") vals = cond.getValues() || [];
      if (vals.join(" ").indexOf("Presente") !== -1) {
        yaTiene = true;
        break;
      }
    } catch (e2) {}
  }
  if (yaTiene) return;
  try {
    var rango = targetSheet.getRange("D2:D");
    rules.push(
      SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("Presente").setBackground(COLOR_PRESENTE).setFontColor("#FFFFFF").setRanges([rango]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("Falta").setBackground(COLOR_FALTA).setFontColor("#FFFFFF").setRanges([rango]).build(),
      SpreadsheetApp.newConditionalFormatRule().whenTextEqualTo("Atraso").setBackground(COLOR_ATRASO).setFontColor("#FFFFFF").setRanges([rango]).build()
    );
    targetSheet.setConditionalFormatRules(rules);
  } catch (e3) {}
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

function consultarAsistencia(sheet, tz, paralelo, fecha, incluirSesiones) {
  var registros = [];
  var fechasMap = {};
  var sesionesMap = {};
  var fechaNorm = normalizeDate(fecha, tz);
  var targetSheet = sheet.getSheetByName(paralelo);
  if (!targetSheet || targetSheet.getLastRow() <= 1) {
    return { registros: registros, fechas: [], sesiones: [] };
  }

  var lastCol = Math.max(5, targetSheet.getLastColumn());
  var rango = targetSheet.getRange(1, 1, targetSheet.getLastRow(), Math.min(5, lastCol));
  var data = rango.getValues();
  var shown = rango.getDisplayValues();
  var headers = data[0].map(function (h) { return String(h || "").trim(); });
  var colBanner = 1;
  var colNombre = 2;
  var colEstado = 3;
  var colNotas = 4;
  if (headers[1] !== "Banner" && headers[1] !== "Código Banner") {
    colBanner = -1;
    colNombre = 1;
    colEstado = 2;
    colNotas = 3;
  }

  for (var i = 1; i < data.length; i++) {
    var d = fechaVisible(data[i][0], shown[i][0], tz);
    var fila = {
      banner: colBanner >= 0 ? String(data[i][colBanner] || "") : "",
      estudiante: String(data[i][colNombre] || ""),
      estado: String(data[i][colEstado] || ""),
      notas: String(data[i][colNotas] || "")
    };
    if (fila.banner === MARCA_SESION) continue;
    if (d) {
      fechasMap[d] = true;
      if (incluirSesiones) {
        if (!sesionesMap[d]) sesionesMap[d] = [];
        sesionesMap[d].push(fila);
      }
    }
    if (!fechaNorm || !fechaCeldaCoincide(data[i][0], shown[i][0], tz, fechaNorm)) continue;
    registros.push(fila);
  }

  var fechas = Object.keys(fechasMap).sort().reverse();
  var out = { registros: registros, fechas: fechas };
  if (incluirSesiones) {
    out.sesiones = fechas.map(function (f) {
      return { fecha: f, registros: sesionesMap[f] || [] };
    });
  }
  return out;
}

function obtenerRegistrosAsistencia(sheet, tz, paralelo, fecha) {
  return consultarAsistencia(sheet, tz, paralelo, fecha).registros;
}

function fechaParaHoja(fecha, tz) {
  var iso = normalizeDate(fecha, tz);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    throw new Error("Fecha inválida: " + fecha);
  }
  return Utilities.parseDate(iso, tz, "yyyy-MM-dd");
}

function escribirBloque(targetSheet, startRow, rows) {
  if (!rows.length) return;
  var numRows = rows.length;
  targetSheet.getRange(startRow, 1, numRows, 1).setNumberFormat("yyyy-mm-dd");
  targetSheet.getRange(startRow, 2, numRows, 1).setNumberFormat("@");
  targetSheet.getRange(startRow, 1, numRows, 5).setValues(rows);
  var bgs = [];
  var fgs = [];
  for (var i = 0; i < numRows; i++) {
    var est = rows[i][3];
    if (est === "Presente") {
      bgs.push([COLOR_PRESENTE]);
      fgs.push(["#FFFFFF"]);
    } else if (est === "Falta") {
      bgs.push([COLOR_FALTA]);
      fgs.push(["#FFFFFF"]);
    } else if (est === "Atraso") {
      bgs.push([COLOR_ATRASO]);
      fgs.push(["#FFFFFF"]);
    } else {
      bgs.push([null]);
      fgs.push([null]);
    }
  }
  targetSheet.getRange(startRow, 4, numRows, 1).setBackgrounds(bgs).setFontColors(fgs);
}

function reemplazarAsistenciaFecha(targetSheet, tz, fecha, nuevasFilas) {
  var fechaNorm = normalizeDate(fecha, tz);
  var lastRow = targetSheet.getLastRow();
  if (lastRow > 1) {
    var dateRange = targetSheet.getRange(2, 1, lastRow - 1, 1);
    var dates = dateRange.getValues();
    var shown = dateRange.getDisplayValues();
    var first = -1;
    var last = -1;
    var count = 0;
    var contiguous = true;
    for (var i = 0; i < dates.length; i++) {
      if (!fechaCeldaCoincide(dates[i][0], shown[i][0], tz, fechaNorm)) continue;
      if (first === -1) first = i;
      else if (i !== last + 1) contiguous = false;
      last = i;
      count++;
    }

    if (count > 0 && contiguous) {
      targetSheet.deleteRows(first + 2, count);
    } else if (count > 0) {
      var dataRange = targetSheet.getRange(2, 1, lastRow - 1, 5);
      var data = dataRange.getValues();
      var dataShown = dataRange.getDisplayValues();
      var kept = [];
      for (var r = 0; r < data.length; r++) {
        if (fechaCeldaCoincide(data[r][0], dataShown[r][0], tz, fechaNorm)) continue;
        kept.push([data[r][0], data[r][1], data[r][2], data[r][3], data[r][4]]);
      }
      dataRange.clearContent();
      if (kept.length) {
        targetSheet.getRange(2, 1, kept.length, 5).setValues(kept);
      }
    }
  }

  if (nuevasFilas.length) {
    var start = Math.max(2, targetSheet.getLastRow() + 1);
    escribirBloque(targetSheet, start, nuevasFilas);
  }
}

function doGet(e) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet();
  var tz = sheet.getSpreadsheetTimeZone();
  var params = e && e.parameter ? e.parameter : {};

  if (params.action === "obtener_asistencia") {
    var todo = params.todo === "1";
    var consulta = consultarAsistencia(sheet, tz, params.paralelo, todo ? "" : params.fecha, todo);
    return jsonOut(consulta);
  }

  var result = listarAlumnos(sheet);
  if (params.incluir_asistencia === "1" && params.fecha) {
    var paraleloAsistencia = params.paralelo || result.paralelos[0];
    if (paraleloAsistencia) {
      var extra = consultarAsistencia(sheet, tz, paraleloAsistencia, params.fecha);
      result.registros = extra.registros;
      result.fechas = extra.fechas;
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
    if (!e || !e.postData || !e.postData.contents) {
      return jsonOut({ status: "error", message: "Sin datos" });
    }
    var payload = JSON.parse(e.postData.contents);
    var action = payload.action;

    if (action === "crear_paralelo") {
      var creado = crearParalelo(sheet, payload.paralelo);
      if (creado.status === "error") return jsonOut(creado);
    }

    if (action === "eliminar_paralelo") {
      var eliminado = eliminarParalelo(sheet, payload.paralelo);
      if (eliminado.status === "error") return jsonOut(eliminado);
    }

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
      var fechaIso = normalizeDate(payload.fecha, tz);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaIso)) {
        return jsonOut({ status: "error", message: "Fecha inválida: " + payload.fecha });
      }
      var fechaHoja = fechaParaHoja(fechaIso, tz);
      var targetSheet = asegurarHojaAsistencia(sheet, payload.paralelo);
      var nuevasFilas = (payload.registros || []).map(function (reg) {
        return [
          fechaHoja,
          String(reg.banner || ""),
          String(reg.estudiante || ""),
          String(reg.estado || ""),
          String(reg.notas || "")
        ];
      });
      reemplazarAsistenciaFecha(targetSheet, tz, fechaIso, nuevasFilas);
      return jsonOut({ status: "ok", fecha: fechaIso, filas: nuevasFilas.length });
    }

    return jsonOut({ status: "ok" });
  } catch (err) {
    return jsonOut({ status: "error", message: String(err && err.message ? err.message : err) });
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

function nombreParaleloValido(nombre) {
  var n = String(nombre || "").trim();
  if (!n) return { ok: false, message: "El nombre del horario está vacío." };
  if (esHojaIgnorada(n)) return { ok: false, message: "Ese nombre está reservado." };
  if (/[\[\]\*\/\\\?\:]/.test(n)) return { ok: false, message: "El nombre no puede incluir [ ] * / \\ ? :" };
  if (n.length > 80) return { ok: false, message: "El nombre es demasiado largo." };
  return { ok: true, nombre: n };
}

function crearParalelo(sheet, nombre) {
  var check = nombreParaleloValido(nombre);
  if (!check.ok) return { status: "error", message: check.message };
  if (sheet.getSheetByName(check.nombre)) {
    return { status: "error", message: "Ya existe un horario con ese nombre." };
  }
  asegurarHojaAsistencia(sheet, check.nombre);
  actualizarValidacionParalelos(sheet);
  guardarNombresHojas(sheet);
  return { status: "ok" };
}

function eliminarParalelo(sheet, nombre) {
  var check = nombreParaleloValido(nombre);
  if (!check.ok) return { status: "error", message: check.message };
  var target = sheet.getSheetByName(check.nombre);
  if (!target) return { status: "error", message: "No se encontró ese horario." };
  if (sheet.getSheets().length <= 1) {
    return { status: "error", message: "No se puede borrar la única hoja del libro." };
  }

  var estSheet = sheet.getSheetByName("Estudiantes");
  if (estSheet && estSheet.getLastRow() > 1) {
    var estData = estSheet.getRange(2, 1, estSheet.getLastRow() - 1, 3).getValues();
    for (var i = estData.length - 1; i >= 0; i--) {
      if (String(estData[i][0] || "").trim() === check.nombre) {
        estSheet.deleteRow(i + 2);
      }
    }
  }

  sheet.deleteSheet(target);
  actualizarValidacionParalelos(sheet);
  guardarNombresHojas(sheet);
  return { status: "ok" };
}

function esFilaSesion(banner) {
  return String(banner || "") === MARCA_SESION;
}

function fechaHumanaGs(iso) {
  var partes = String(iso || "").split("-");
  if (partes.length !== 3) return String(iso || "");
  return partes[2] + "/" + partes[1] + "/" + partes[0];
}

function diaSemanaGs(iso) {
  var partes = String(iso || "").split("-");
  if (partes.length !== 3) return "";
  var fecha = new Date(Number(partes[0]), Number(partes[1]) - 1, Number(partes[2]));
  return DIAS_SEMANA[fecha.getDay()] || "";
}

function resumenFilas(filas) {
  var p = 0;
  var a = 0;
  var f = 0;
  for (var i = 0; i < filas.length; i++) {
    var est = String(filas[i][3] || "");
    if (est === "Presente") p++;
    else if (est === "Atraso") a++;
    else if (est === "Falta") f++;
  }
  return filas.length + " alumnos  ·  " + p + " P   " + a + " A   " + f + " F";
}

function limpiarGruposFilas(sheet) {
  var last = sheet.getLastRow();
  if (last < 2) return;
  for (var i = 0; i < 4; i++) {
    try {
      sheet.getRange(2, 1, last - 1, 1).shiftRowGroupDepth(-1);
    } catch (e) {
      break;
    }
  }
}

function organizarVistaAsistencia(targetSheet, tz, fechaAbierta) {
  var lastRow = targetSheet.getLastRow();
  if (lastRow < 2) {
    targetSheet.setFrozenRows(1);
    return;
  }

  limpiarGruposFilas(targetSheet);

  var lastCol = Math.max(5, targetSheet.getLastColumn());
  var rango = targetSheet.getRange(2, 1, lastRow - 1, Math.min(5, lastCol));
  var data = rango.getValues();
  var shown = rango.getDisplayValues();
  var grupos = {};
  var orden = [];

  for (var i = 0; i < data.length; i++) {
    if (esFilaSesion(data[i][1])) continue;
    var d = fechaVisible(data[i][0], shown[i][0], tz);
    if (!d) continue;
    if (!grupos[d]) {
      grupos[d] = [];
      orden.push(d);
    }
    grupos[d].push([data[i][0], data[i][1], data[i][2], data[i][3], data[i][4]]);
  }

  orden.sort().reverse();
  if (!orden.length) return;

  orden.forEach(function (iso) {
    grupos[iso].sort(function (a, b) {
      return String(a[2] || "").localeCompare(String(b[2] || ""), "es", { sensitivity: "base" });
    });
  });

  var filas = [];
  var bloques = [];
  for (var g = 0; g < orden.length; g++) {
    var iso = orden[g];
    var alumnos = grupos[iso];
    var inicio = filas.length + 2;
    filas.push([
      fechaParaHoja(iso, tz),
      MARCA_SESION,
      fechaHumanaGs(iso) + "  ·  " + diaSemanaGs(iso) + "  ·  " + resumenFilas(alumnos),
      "",
      ""
    ]);
    for (var a = 0; a < alumnos.length; a++) filas.push(alumnos[a]);
    bloques.push({
      iso: iso,
      headerRow: inicio,
      firstStudent: inicio + 1,
      count: alumnos.length,
      stripe: g % 2 === 0
    });
  }

  var destino = targetSheet.getRange(2, 1, filas.length, 5);
  destino.setNumberFormats(filas.map(function (fila) {
    return ["yyyy-mm-dd", esFilaSesion(fila[1]) ? ";;;" : "@", "@", "@", "@"];
  }));
  destino.setValues(filas);

  var sobra = targetSheet.getLastRow() - (filas.length + 1);
  if (sobra > 0) {
    targetSheet.getRange(filas.length + 2, 1, sobra, 5).clearContent().clearFormat();
  }

  var fondos = [];
  var fuentes = [];
  var pesos = [];
  var fondosEstado = [];
  var fuentesEstado = [];
  for (var b = 0; b < bloques.length; b++) {
    var bloque = bloques[b];
    var tono = bloque.stripe ? COLOR_DIA_A : COLOR_DIA_B;
    fondos.push([COLOR_SESION, COLOR_SESION, COLOR_SESION, COLOR_SESION, COLOR_SESION]);
    fuentes.push(["#ffffff", "#ffffff", "#ffffff", "#ffffff", "#ffffff"]);
    pesos.push(["bold", "bold", "bold", "bold", "bold"]);
    fondosEstado.push([COLOR_SESION]);
    fuentesEstado.push(["#ffffff"]);
    for (var s = 0; s < bloque.count; s++) {
      fondos.push([tono, tono, tono, null, tono]);
      fuentes.push(["#1e293b", "#1e293b", "#1e293b", null, "#1e293b"]);
      pesos.push(["normal", "normal", "normal", "normal", "normal"]);
      var est = String(filas[bloque.firstStudent - 2 + s][3] || "");
      if (est === "Presente") {
        fondosEstado.push([COLOR_PRESENTE]);
        fuentesEstado.push(["#ffffff"]);
      } else if (est === "Falta") {
        fondosEstado.push([COLOR_FALTA]);
        fuentesEstado.push(["#ffffff"]);
      } else if (est === "Atraso") {
        fondosEstado.push([COLOR_ATRASO]);
        fuentesEstado.push(["#ffffff"]);
      } else {
        fondosEstado.push([tono]);
        fuentesEstado.push(["#1e293b"]);
      }
    }
  }

  destino.setBackgrounds(fondos);
  destino.setFontColors(fuentes);
  destino.setFontWeights(pesos);
  targetSheet.getRange(2, 4, filas.length, 1).setBackgrounds(fondosEstado).setFontColors(fuentesEstado);

  targetSheet.getRange(1, 1, 1, 5)
    .setFontWeight("bold")
    .setBackground("#0b1220")
    .setFontColor("#f8fafc");
  targetSheet.setFrozenRows(1);
  targetSheet.setColumnWidth(1, 110);
  targetSheet.setColumnWidth(2, 100);
  targetSheet.setColumnWidth(3, 360);
  targetSheet.setColumnWidth(4, 100);
  targetSheet.setColumnWidth(5, 180);

  var abierta = fechaAbierta || orden[0];
  for (var k = 0; k < bloques.length; k++) {
    if (bloques[k].count < 1) continue;
    var grupoRango = targetSheet.getRange(bloques[k].firstStudent, 1, bloques[k].count, 1);
    grupoRango.shiftRowGroupDepth(1);
    try {
      var grupo = targetSheet.getRowGroup(bloques[k].firstStudent, 1);
      if (bloques[k].iso === abierta) grupo.expand();
      else grupo.collapse();
    } catch (e2) {}
  }
}

function fechaVisible(valor, mostrado, tz) {
  return normalizeDate(mostrado, tz) || normalizeDate(valor, tz);
}

function fechaCeldaCoincide(valor, mostrado, tz, fechaNorm) {
  if (!fechaNorm) return false;
  if (normalizeDate(mostrado, tz) === fechaNorm) return true;
  if (normalizeDate(valor, tz) === fechaNorm) return true;
  if (Object.prototype.toString.call(valor) === "[object Date]" && !isNaN(valor.getTime())) {
    if (Utilities.formatDate(valor, "UTC", "yyyy-MM-dd") === fechaNorm) return true;
  }
  return false;
}

function normalizeDate(val, tz) {
  if (val === null || val === undefined || val === "") return "";
  var zone = tz || Session.getScriptTimeZone();
  if (Object.prototype.toString.call(val) === "[object Date]" && !isNaN(val.getTime())) {
    var local = Utilities.formatDate(val, zone, "yyyy-MM-dd");
    var utc = Utilities.formatDate(val, "UTC", "yyyy-MM-dd");
    return local || utc;
  }
  var str = String(val).trim();
  if (!str) return "";
  if (str.indexOf("T") !== -1) str = str.split("T")[0];
  var iso = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[1] + "-" + iso[2] + "-" + iso[3];
  var slash = str.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
  if (slash) {
    var a = parseInt(slash[1], 10);
    var b = parseInt(slash[2], 10);
    var y = slash[3];
    var day = a;
    var month = b;
    if (b > 12 && a <= 12) {
      month = a;
      day = b;
    }
    return y + "-" + ("0" + month).slice(-2) + "-" + ("0" + day).slice(-2);
  }
  return "";
}
