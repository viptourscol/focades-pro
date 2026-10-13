#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const files = [
  '../src/pages/BeneficiarioActualizacion.jsx',
  '../src/pages/BeneficiarioAuthSetup.jsx',
  '../src/pages/BeneficiarioCompletarPerfil.jsx',
  '../src/pages/BeneficiarioCondonacion.jsx',
  '../src/pages/BeneficiarioHistorial.jsx',
  '../src/pages/BeneficiarioHome.jsx',
  '../src/pages/BeneficiarioOnboardingCompleto.jsx',
  '../src/pages/BeneficiarioResumen.jsx',
  '../src/pages/BeneficiarioTickets.jsx',
  '../src/components/BeneficiarioDetailModal.jsx',
  '../src/components/BeneficiarioLoginForm.jsx',
  '../src/components/BeneficiarioNotificacionesPanel.jsx'
];

function removeConsoleLogs() {
  console.log(`Procesando ${files.length} archivos...`);
  
  for (const file of files) {
    const filePath = path.join(__dirname, file);
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Eliminar console.log, console.error, console.warn, console.info, console.debug
    // Incluyendo los casos multilínea
    content = content.replace(/\s*console\.(log|error|warn|info|debug)\([^)]*\);?\s*/g, '');
    
    // Limpiar líneas vacías múltiples
    content = content.replace(/\n{3,}/g, '\n\n');
    
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`✓ ${file}`);
  }
  
  console.log('\nConsole logs eliminados exitosamente.');
}

removeConsoleLogs();
