export const CERTIFICATE_SIGNATURE_ROLES = [
  {
    cargo: 'alcalde',
    label: 'Alcalde',
    defaultName: 'Alcalde Municipal',
    defaultTitle: 'Alcalde Municipal',
  },
  {
    cargo: 'secretario_educacion',
    label: 'Secretario de Educación',
    defaultName: 'Secretario de Educación',
    defaultTitle: 'Secretaría de Educación Municipal',
  },
];

const esc = (text) =>
  String(text ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

const formatCurrency = (value) =>
  new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

const formatDateTime = (value) => {
  if (!value) return 'No disponible';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'No disponible';
  return d.toLocaleString('es-CO');
};

const buildSignatureCell = (signature, fallbackRole) => {
  const role = CERTIFICATE_SIGNATURE_ROLES.find((item) => item.cargo === fallbackRole);
  const nombre = signature?.nombre_firmante || role?.defaultName || 'Firma autorizada';
  const titulo = signature?.titulo_firmante || role?.defaultTitle || 'Firma autorizada';
  const firmaUrl = signature?.firma_url || null;

  return `
    <div class="sign-box">
      ${firmaUrl ? `<img class="sign-img" src="${esc(firmaUrl)}" alt="Firma de ${esc(nombre)}" />` : '<div class="sign-placeholder"></div>'}
      <div class="sign-line"></div>
      <p class="sign-name">${esc(nombre)}</p>
      <p class="sign-title">${esc(titulo)}</p>
    </div>
  `;
};

const buildCertificateHtml = (cert) => {
  const verifyUrl = cert.verify_url;
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(verifyUrl)}`;
  const logoSrc = 'https://raw.githubusercontent.com/focades-debug/mis-imagenes-apps-script/main/logo-focades-alcadia.png';
  const signatures = cert.signatures || {};

  const alcaldeHtml = buildSignatureCell(signatures.alcalde, 'alcalde');
  const secretarioHtml = buildSignatureCell(signatures.secretario_educacion, 'secretario_educacion');

  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Paz y Salvo - FOCADES</title>
  <style>
    @page { size: A4; margin: 14mm 16mm; }
    body { font-family: 'Times New Roman', Georgia, serif; background: #eef2f6; margin: 0; padding: 16px; color: #111827; }
    .sheet { max-width: 860px; margin: 0 auto; background: #fff; border: 1px solid #cbd5e1; box-shadow: 0 10px 28px rgba(15, 23, 42, 0.08); }
    .wrap { padding: 24px 30px; position: relative; }
    .code-top { position: absolute; top: 18px; right: 24px; font-family: 'Courier New', monospace; font-size: 14px; font-weight: 700; }

    .header { text-align: center; border-bottom: 1px solid #cbd5e1; padding-bottom: 12px; }
    .logo { width: 240px; max-width: 100%; height: auto; margin-bottom: 4px; }
    .h-main { margin: 2px 0 0; font-size: 27px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.3px; }
    .h-sub { margin: 3px 0 0; font-size: 14px; color: #374151; }
    .h-certifica { margin: 10px 0 0; font-size: 22px; font-weight: 700; letter-spacing: 1px; }

    .ref { margin-top: 14px; font-weight: 700; text-transform: uppercase; font-size: 17px; }
    .intro { margin-top: 12px; font-size: 16px; line-height: 1.48; text-align: justify; }

    .data-table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    .data-table td { padding: 4px 2px; vertical-align: top; font-size: 16px; }
    .data-table td:first-child { width: 43%; color: #374151; }
    .data-table td:last-child { font-weight: 700; }

    .expedicion { margin-top: 14px; font-size: 16px; line-height: 1.5; text-align: justify; }
    .legal { margin-top: 10px; font-weight: 700; text-transform: uppercase; line-height: 1.35; font-size: 15px; }

    .sign-grid { display: grid; grid-template-columns: 1fr 1fr 120px; gap: 16px; margin-top: 16px; align-items: end; }
    .sign-box { text-align: center; }
    .sign-img { width: 180px; height: 54px; object-fit: contain; object-position: center; display: block; margin: 0 auto 6px; }
    .sign-placeholder { height: 54px; }
    .sign-line { border-top: 1px solid #111827; margin-top: 2px; }
    .sign-name { margin: 5px 0 0; font-weight: 700; font-size: 12px; }
    .sign-title { margin: 1px 0 0; font-size: 11px; color: #374151; text-transform: uppercase; }

    .qr { text-align: center; align-self: center; }
    .qr img { width: 96px; height: 96px; border: 1px solid #d1d5db; padding: 3px; background: #fff; }
    .qr p { margin: 4px 0 0; font-size: 10px; color: #4b5563; line-height: 1.2; }

    .meta { margin-top: 12px; border-top: 1px dashed #d1d5db; padding-top: 8px; font-size: 10px; color: #4b5563; }
    .code-inline { font-family: 'Courier New', monospace; background: #f3f4f6; border: 1px solid #d1d5db; padding: 2px 6px; border-radius: 4px; }

    @media print {
      body { background: #fff; padding: 0; }
      .sheet { border: 1px solid #cbd5e1; box-shadow: none; }
    }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="wrap">
      <div class="code-top">No. ${esc(cert.codigo_certificado || 'N/A')}</div>

      <div class="header">
        <img class="logo" src="${esc(logoSrc)}" alt="FOCADES" />
        <h1 class="h-main">Municipio de Montelíbano</h1>
        <p class="h-sub">Secretaría de Educación Municipal</p>
        <p class="h-certifica">CERTIFICA</p>
      </div>

      <p class="ref">Ref. Certificado de paz y salvo</p>

      <p class="intro">
        Según consta en el sistema del Fondo Educativo para la Educación Superior (FOCADES),
        el beneficiario relacionado a continuación se encuentra a paz y salvo por concepto
        de condonación del crédito educativo semestral.
      </p>

      <table class="data-table">
        <tr>
          <td>Código de certificado:</td>
          <td>${esc(cert.codigo_certificado || 'No disponible')}</td>
        </tr>
        <tr>
          <td>Beneficiario:</td>
          <td>${esc(cert.beneficiario_nombre || 'No disponible')}</td>
        </tr>
        <tr>
          <td>Documento:</td>
          <td>${esc(cert.beneficiario_documento || 'No disponible')}</td>
        </tr>
        <tr>
          <td>Período académico:</td>
          <td>${esc(cert.semestre_texto || 'No disponible')}</td>
        </tr>
        <tr>
          <td>Valor condonado:</td>
          <td>${esc(formatCurrency(cert.monto_condonado))}</td>
        </tr>
        <tr>
          <td>Estado del certificado:</td>
          <td>${esc(cert.estado || 'vigente')}</td>
        </tr>
        <tr>
          <td>Emitido el:</td>
          <td>${esc(formatDateTime(cert.fecha_emision))}</td>
        </tr>
      </table>

      <p class="expedicion">
        Se expide el presente certificado para fines administrativos y/o notariales,
        con validación electrónica mediante código único y hash de integridad.
      </p>

      <p class="legal">
        Para cualquier trámite administrativo será obligatorio validar el código único de certificación.
      </p>

      <div class="sign-grid">
        ${alcaldeHtml}
        ${secretarioHtml}
        <div class="qr">
          <img src="${esc(qrSrc)}" alt="QR verificación" />
          <p>Escanear para verificar</p>
        </div>
      </div>

      <div class="meta">
        Verificación pública: <a href="${esc(verifyUrl)}" target="_blank">${esc(verifyUrl)}</a><br/>
        Hash de integridad: <span class="code-inline">${esc(cert.hash_integridad || 'No disponible')}</span><br/>
        Documento generado electrónicamente por la plataforma FOCADES.
      </div>
    </div>
  </div>
</body>
</html>`;
};

const PREVIEW_MODAL_ID = 'certificado-paz-y-salvo-preview';

const removePazYSalvoPreviewModal = () => {
  const existing = document.getElementById(PREVIEW_MODAL_ID);
  if (existing?.parentNode) {
    existing.parentNode.removeChild(existing);
  }
  document.body.style.overflow = '';
};

const showPazYSalvoPreviewModal = (html) => {
  removePazYSalvoPreviewModal();

  const overlay = document.createElement('div');
  overlay.id = PREVIEW_MODAL_ID;
  overlay.style.position = 'fixed';
  overlay.style.inset = '0';
  overlay.style.zIndex = '9999';
  overlay.style.background = 'rgba(15, 23, 42, 0.72)';
  overlay.style.display = 'flex';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.style.padding = '24px';

  const panel = document.createElement('div');
  panel.style.width = 'min(1180px, 96vw)';
  panel.style.height = 'min(92vh, 900px)';
  panel.style.background = '#ffffff';
  panel.style.borderRadius = '20px';
  panel.style.overflow = 'hidden';
  panel.style.boxShadow = '0 24px 60px rgba(15, 23, 42, 0.32)';
  panel.style.display = 'flex';
  panel.style.flexDirection = 'column';

  const header = document.createElement('div');
  header.style.display = 'flex';
  header.style.alignItems = 'center';
  header.style.justifyContent = 'space-between';
  header.style.gap = '12px';
  header.style.padding = '16px 18px';
  header.style.borderBottom = '1px solid #e2e8f0';
  header.style.background = '#f8fafc';

  const title = document.createElement('div');
  title.innerHTML = '<strong style="display:block;font-size:16px;color:#0f172a;">Vista previa del certificado</strong><span style="font-size:13px;color:#475569;">Desde este visor puedes revisar e imprimir el documento.</span>';

  const actions = document.createElement('div');
  actions.style.display = 'flex';
  actions.style.alignItems = 'center';
  actions.style.gap = '10px';
  actions.style.flexWrap = 'wrap';

  const printButton = document.createElement('button');
  printButton.type = 'button';
  printButton.textContent = 'Imprimir';
  printButton.style.cssText = 'border:0;background:#0f2b54;color:#fff;padding:10px 14px;border-radius:10px;font-weight:700;cursor:pointer;';

  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.textContent = 'Cerrar';
  closeButton.style.cssText = 'border:1px solid #cbd5e1;background:#fff;color:#475569;padding:10px 14px;border-radius:10px;font-weight:700;cursor:pointer;';

  const iframe = document.createElement('iframe');
  iframe.title = 'Vista previa del certificado de paz y salvo';
  iframe.style.width = '100%';
  iframe.style.height = '100%';
  iframe.style.border = '0';
  iframe.srcdoc = html;

  printButton.onclick = () => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
  };

  closeButton.onclick = () => {
    removePazYSalvoPreviewModal();
  };

  overlay.onclick = (event) => {
    if (event.target === overlay) {
      removePazYSalvoPreviewModal();
    }
  };

  actions.appendChild(printButton);
  actions.appendChild(closeButton);
  header.appendChild(title);
  header.appendChild(actions);
  panel.appendChild(header);
  panel.appendChild(iframe);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);
  document.body.style.overflow = 'hidden';
};

export const openPazYSalvoPrintView = (cert) => {
  const html = buildCertificateHtml(cert || {});
  showPazYSalvoPreviewModal(html);
};

export const loadActiveCertificateSignatures = async (supabase) => {
  const result = {
    alcalde: null,
    secretario_educacion: null,
  };

  const { data, error } = await supabase
    .from('portal_certificados_firmas')
    .select('cargo,nombre_firmante,titulo_firmante,firma_storage_path,activo')
    .eq('activo', true);

  if (error || !Array.isArray(data)) {
    return result;
  }

  for (const row of data) {
    const roleInfo = CERTIFICATE_SIGNATURE_ROLES.find((item) => item.cargo === row.cargo);
    if (!roleInfo) continue;

    let firmaUrl = null;
    if (row.firma_storage_path) {
      const { data: signedData } = await supabase.storage
        .from('soportes')
        .createSignedUrl(row.firma_storage_path, 60 * 60 * 24 * 7);
      firmaUrl = signedData?.signedUrl || null;
    }

    result[row.cargo] = {
      cargo: row.cargo,
      nombre_firmante: row.nombre_firmante || roleInfo.defaultName,
      titulo_firmante: row.titulo_firmante || roleInfo.defaultTitle,
      firma_storage_path: row.firma_storage_path || null,
      firma_url: firmaUrl,
    };
  }

  return result;
};