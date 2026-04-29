function doGet() {
  return jsonResponse({
    ok: true,
    service: 'focades-gas-pdf',
    now: new Date().toISOString()
  }, 200);
}

function doPost(e) {
  try {
    var payloadRaw = parseRequestBody(e);
    var authCheck = validateAuth(payloadRaw);
    if (!authCheck.ok) {
      return jsonResponse({ ok: false, error: authCheck.error }, 401);
    }

    var source = String(payloadRaw.source || 'aspirantes');
    var documents = Array.isArray(payloadRaw.documents) ? payloadRaw.documents : [];
    var payload = payloadRaw.payload || {};

    if (documents.length === 0) {
      return jsonResponse({ ok: false, error: 'No se recibieron documentos para generar.' }, 400);
    }

    var output = [];
    for (var i = 0; i < documents.length; i++) {
      var docCfg = documents[i] || {};
      var docResult = generateOneDocument(source, docCfg, payload);
      output.push(docResult);
    }

    return jsonResponse({
      ok: true,
      source: source,
      generated: output.length,
      documents: output
    }, 200);

  } catch (err) {
    return jsonResponse({
      ok: false,
      error: String(err && err.message ? err.message : err)
    }, 500);
  }
}

function parseRequestBody(e) {
  if (!e || !e.postData || !e.postData.contents) {
    throw new Error('Solicitud sin body JSON.');
  }
  var raw = e.postData.contents;
  var parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Body JSON invalido.');
  }
  return parsed;
}

function validateAuth(body) {
  var expectedApiKey = String(PropertiesService.getScriptProperties().getProperty('DOCS_GAS_API_KEY') || '').trim();
  var expectedSecret = String(PropertiesService.getScriptProperties().getProperty('DOCS_GAS_SHARED_SECRET') || '').trim();

  var receivedApiKey = String((body && body.api_key) || '').trim();
  var receivedSecret = String((body && body.shared_secret) || '').trim();

  if (!expectedApiKey && !expectedSecret) {
    return { ok: true };
  }

  if (expectedApiKey && expectedApiKey !== receivedApiKey) {
    return { ok: false, error: 'API key invalida.' };
  }

  if (expectedSecret && expectedSecret !== receivedSecret) {
    return { ok: false, error: 'Shared secret invalido.' };
  }

  return { ok: true };
}

function generateOneDocument(source, docCfg, payload) {
  var tipo = String(docCfg.tipo || '').trim();
  if (!tipo) {
    throw new Error('Cada documento requiere campo tipo.');
  }

  var templateId = resolveTemplateId(tipo, docCfg);
  if (!templateId) {
    throw new Error('No se encontro templateId para tipo: ' + tipo);
  }

  var fileName = String(docCfg.fileName || (tipo + '.pdf')).trim();
  var title = String(docCfg.titulo || tipo).trim();

  var folder = resolveOutputFolder();
  var copyName = buildCopyName(fileName, payload, tipo);

  var templateFile = DriveApp.getFileById(templateId);
  var docCopy = templateFile.makeCopy(copyName, folder);
  var docId = docCopy.getId();

  try {
    var doc = DocumentApp.openById(docId);
    var body = doc.getBody();

    var tokenMap = buildTokenMap(source, payload);

    replaceTextPlaceholders(body, tokenMap);

    insertSignatureAtPlaceholder(body, payload, ['{{firma_aspirante}}', '{{firma_placeholder}}']);

    cleanupRemainingPlaceholders(body);

    doc.saveAndClose();

    var pdfBlob = DriveApp.getFileById(docId).getAs(MimeType.PDF);
    var pdfBase64 = Utilities.base64Encode(pdfBlob.getBytes());

    var keepCopy = String(PropertiesService.getScriptProperties().getProperty('KEEP_DOC_COPY') || 'false').toLowerCase() === 'true';
    if (!keepCopy) {
      DriveApp.getFileById(docId).setTrashed(true);
    }

    return {
      tipo: tipo,
      titulo: title,
      file_name: fileName,
      mime_type: 'application/pdf',
      provider_id: docId,
      pdf_base64: pdfBase64
    };

  } catch (err) {
    throw new Error('Error generando ' + tipo + ': ' + String(err && err.message ? err.message : err));
  }
}

function resolveTemplateId(tipo, docCfg) {
  var explicit = String(docCfg.templateId || '').trim();
  if (explicit) return explicit;

  var props = PropertiesService.getScriptProperties();

  var byTipo = {
    formulario_credito_educativo: 'TEMPLATE_FORMULARIO_ID',
    aceptacion_terminos_condiciones: 'TEMPLATE_TERMINOS_ID',
    autorizacion_tratamiento_datos: 'TEMPLATE_DATOS_ID',
    aceptacion_terminos: 'TEMPLATE_HISTORICOS_TERMINOS_ID',
    tratamiento_datos: 'TEMPLATE_HISTORICOS_DATOS_ID'
  };

  var key = byTipo[tipo];
  if (!key) return '';

  return String(props.getProperty(key) || '').trim();
}

function resolveOutputFolder() {
  var folderId = String(PropertiesService.getScriptProperties().getProperty('OUTPUT_FOLDER_ID') || '').trim();
  if (!folderId) return DriveApp.getRootFolder();
  return DriveApp.getFolderById(folderId);
}

function buildCopyName(fileName, payload, tipo) {
  var baseName = String(fileName || tipo || 'documento').replace(/\.pdf$/i, '');
  var radicado = String((payload && payload.radicado) || '').trim();
  var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmmss');
  return (radicado ? radicado + '-' : '') + baseName + '-' + stamp;
}

function buildTokenMap(source, payload) {
  var form = payload.form_data || {};
  var profile = payload.profile || {};
  var tokens = payload.tokens || {};
  var soportes = (form && form.soportes) ? form.soportes : {};
  var signature = payload.signature || {};

  var m = {};

  m.radicado = payload.radicado || '';
  m.inscripcion_id = payload.inscripcion_id || '';
  m.generated_at_label = payload.generated_at_label || '';

  m.nombre_completo = valueOr(form.nombre_completo, profile.nombre_completo);
  m.n_documento = valueOr(form.n_documento, profile.n_documento);
  m.tipo_documento = valueOr(form.tipo_documento, profile.tipo_documento);
  m.genero = valueOr(form.genero, '');
  m.enfoque_diferencial = valueOr(form.enfoque_diferencial, '');
  m.fecha_nacimiento = valueOr(form.fecha_nacimiento, '');
  m.direccion_residencia = valueOr(form.direccion_residencia, '');
  m.pais_nacimiento = valueOr(form.pais_nacimiento, '');
  m.dpto_nacimiento = valueOr(form.dpto_nacimiento, '');
  m.municipio_nacimiento = valueOr(form.municipio_nacimiento, '');
  m.dpto_residencia = valueOr(form.dpto_residencia, '');
  m.municipio_residencia = valueOr(form.municipio_residencia, '');
  m.n_celular = valueOr(form.n_celular, '');
  m.email = valueOr(form.email, profile.email);
  m.recibe_subsidio = valueOr(form.recibe_subsidio, '');

  m.nombre_padre = valueOr(form.nombre_padre, '');
  m.documento_padre = valueOr(form.documento_padre, '');
  m.doc_padre = m.documento_padre;
  m.ocupacion_padre = valueOr(form.ocupacion_padre, '');
  m.ingresos_padre = valueOr(form.ingresos_padre, '');

  m.nombre_madre = valueOr(form.nombre_madre, '');
  m.documento_madre = valueOr(form.documento_madre, '');
  m.doc_madre = m.documento_madre;
  m.ocupacion_madre = valueOr(form.ocupacion_madre, '');
  m.ingresos_madre = valueOr(form.ingresos_madre, '');

  m.titulo_obtenido = valueOr(form.titulo_obtenido, '');
  m.ano_graduacion = valueOr(form.ano_graduacion, '');
  m.establecimiento_educativo = valueOr(form.establecimiento_educativo, '');

  m.modalidad = valueOr(form.modalidad, '');
  m.puntaje_icfes = valueOr(form.puntaje_icfes, '');
  m.zona_residencia = valueOr(form.zona_residencia, '');
  m.barrio_corregimiento = valueOr(form.barrio_corregimiento, '');
  m.nivel_formacion = valueOr(form.nivel_formacion, '');
  m.tipo_educacion = m.nivel_formacion;
  m.institucion_superior = valueOr(form.institucion_superior, '');
  m.programa_academico = valueOr(form.programa_academico, '');
  m.semestre_ingreso = valueOr(form.semestre_ingreso, '');
  m.ciudad_institucion = valueOr(form.ciudad_institucion, '');

  m.acepta_terminos = boolText(form.acepta_terminos);
  m['accept-terms'] = m.acepta_terminos;

  m.firma_timestamp = valueOr(tokens.firma_timestamp, '');
  m.firma_hash_datos = valueOr(tokens.firma_hash_datos, '');
  m.timestamp = m.firma_timestamp;

  var soporteUrls = buildSoporteUrls(soportes);
  m.url_doc_identidad = soporteUrls.documento_identidad;
  m.url_acta_grado = soporteUrls.acta_grado;
  m.url_diploma = soporteUrls.diploma;
  m.url_pruebas_saber = soporteUrls.pruebas_saber;
  m.url_cert_matricula = soporteUrls.cert_matricula;
  m.url_ficha_sisben = soporteUrls.ficha_sisben;
  m.url_cert_enfoque = soporteUrls.cert_enfoque;
  m.url_cert_notas = soporteUrls.cert_notas;

  m.url_terminos_condiciones = valueOr(payload.url_terminos_condiciones, '');
  m.url_tratamiento_datos = valueOr(payload.url_tratamiento_datos, '');

  m.signature_mime_type = valueOr(signature.mime_type, '');
  m.signature_file_name = valueOr(signature.file_name, '');

  var tokenKeys = Object.keys(tokens);
  for (var i = 0; i < tokenKeys.length; i++) {
    var tk = tokenKeys[i];
    if (!m.hasOwnProperty(tk)) {
      m[tk] = valueOr(tokens[tk], '');
    }
  }

  return m;
}

function buildSoporteUrls(soportes) {
  var out = {
    documento_identidad: '',
    acta_grado: '',
    diploma: '',
    pruebas_saber: '',
    cert_matricula: '',
    ficha_sisben: '',
    cert_enfoque: '',
    cert_notas: ''
  };

  var publicBase = String(PropertiesService.getScriptProperties().getProperty('SUPABASE_PUBLIC_BASE_URL') || '').trim();

  var keys = Object.keys(out);
  for (var i = 0; i < keys.length; i++) {
    var k = keys[i];
    var rawPath = String((soportes && soportes[k]) || '').trim();
    if (!rawPath) {
      out[k] = '';
      continue;
    }

    if (publicBase) {
      var normalized = rawPath.replace(/^soportes\//, '').replace(/^\/+/, '');
      out[k] = publicBase.replace(/\/+$/, '') + '/storage/v1/object/public/soportes/' + normalized;
    } else {
      out[k] = rawPath;
    }
  }

  return out;
}

function replaceTextPlaceholders(body, tokenMap) {
  var keys = Object.keys(tokenMap);
  for (var i = 0; i < keys.length; i++) {
    var key = keys[i];
    var value = safeText(tokenMap[key]);
    var pattern = escapeForReplaceText('{{' + key + '}}');
    body.replaceText(pattern, value);
  }
}

function insertSignatureAtPlaceholder(body, payload, placeholders) {
  var signature = payload.signature || {};
  var b64 = String(signature.base64 || '').trim();
  if (!b64) return;

  var mime = String(signature.mime_type || 'image/png').trim();
  var fileName = String(signature.file_name || 'firma.png').trim();

  var cleanB64 = stripDataUrlPrefix(b64);
  var bytes = Utilities.base64Decode(cleanB64);
  var blob = Utilities.newBlob(bytes, mime, fileName);

  // Ancho objetivo en puntos (180 pt ~ 6.35 cm)
  var TARGET_WIDTH = parseInt(
    PropertiesService.getScriptProperties().getProperty('SIGNATURE_TARGET_WIDTH_PT') || '180',
    10
  );

  function applyProportionalSize(img) {
    try {
      var originalWidth = img.getWidth();
      var originalHeight = img.getHeight();
      if (originalWidth > 0 && originalHeight > 0) {
        var ratio = originalHeight / originalWidth;
        var newHeight = Math.round(TARGET_WIDTH * ratio);
        img.setWidth(TARGET_WIDTH);
        img.setHeight(newHeight);
      } else {
        img.setWidth(TARGET_WIDTH);
      }
    } catch (_) {
      try { img.setWidth(TARGET_WIDTH); } catch (__) {}
    }
  }

  for (var i = 0; i < placeholders.length; i++) {
    var marker = placeholders[i];
    var found = body.findText(escapeForReplaceText(marker));
    if (!found) continue;

    var textEl = found.getElement().asText();
    var start = found.getStartOffset();
    var end = found.getEndOffsetInclusive();
    textEl.deleteText(start, end);

    var parent = textEl.getParent();
    if (parent.getType() === DocumentApp.ElementType.PARAGRAPH) {
      var p = parent.asParagraph();
      var img = p.appendInlineImage(blob);
      applyProportionalSize(img);
    } else {
      body.appendParagraph('');
      var fallbackP = body.appendParagraph('');
      var fallbackImg = fallbackP.appendInlineImage(blob);
      applyProportionalSize(fallbackImg);
    }
    return;
  }
}

function cleanupRemainingPlaceholders(body) {
  var remove = String(PropertiesService.getScriptProperties().getProperty('CLEANUP_UNUSED_PLACEHOLDERS') || 'false').toLowerCase() === 'true';
  if (!remove) return;

  body.replaceText('\\{\\{[a-zA-Z0-9_\\-\\.]+\\}\\}', '');
}

function stripDataUrlPrefix(b64) {
  if (b64.indexOf('data:') === 0) {
    var idx = b64.indexOf(',');
    if (idx >= 0) return b64.substring(idx + 1);
  }
  return b64;
}

function escapeForReplaceText(text) {
  return String(text).replace(/([\\^$.|?*+(){}\[\]])/g, '\\$1');
}

function valueOr(a, b) {
  if (a !== null && a !== undefined && String(a).trim() !== '') return a;
  if (b !== null && b !== undefined && String(b).trim() !== '') return b;
  return '';
}

function safeText(v) {
  if (v === null || v === undefined) return '';
  return String(v);
}

function boolText(v) {
  return v ? 'SI' : 'NO';
}

function jsonResponse(obj, statusCode) {
  var output = ContentService.createTextOutput(JSON.stringify(obj));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}
