# 🏛️ FOCADES-PRO

**Sistema de Gestión de Beneficiarios - Plataforma Integral**

Aplicación web fullstack para gestión de beneficiarios, cargue de documentos, condonación de sesiones y reporting integrado con Supabase y almacenamiento en Cloudflare R2.

---

## 📚 Documentación

La documentación completa está centralizada y organizada por temas:

👉 **[VER DOCUMENTACIÓN COMPLETA](docs/INDEX.md)**

| Necesidad | Enlace |
|-----------|--------|
| 🔧 Setup inicial | [docs/documentation/setup/INDEX.md](docs/documentation/setup/INDEX.md) |
| 🚀 Deployment | [docs/documentation/deployment/INDEX.md](docs/documentation/deployment/INDEX.md) |
| 📊 Migraciones | [docs/documentation/migration/INDEX.md](docs/documentation/migration/INDEX.md) |
| ✨ Features | [docs/documentation/features/INDEX.md](docs/documentation/features/INDEX.md) |
| 🔧 Troubleshooting | [docs/documentation/troubleshooting/INDEX.md](docs/documentation/troubleshooting/INDEX.md) |
| 📈 Estado del Proyecto | [docs/documentation/status/INDEX.md](docs/documentation/status/INDEX.md) |

---

## 🚀 Inicio Rápido

### Requisitos
- Node.js 18+ 
- npm o yarn
- Supabase CLI
- Cuenta en Cloudflare (para R2)

### Instalación

```bash
# Clonar e instalar dependencias
git clone <repo>
cd focades-pro
npm install

# Configurar variables de entorno
cp .env.example .env.local
# Editar .env.local con tus credenciales

# Iniciar desarrollo
npm run dev

# Build para producción
npm run build
```

### Scripts Disponibles

```bash
npm run dev                 # Inicia dev server (Vite)
npm run build              # Build para producción
npm run lint               # Ejecutar ESLint
npm run preview            # Preview del build
npm run mock:html-pdf      # Mock server para testing PDF
npm run activar-beneficiarios    # Script: activar beneficiarios en batch
npm run smoke:historicos         # Script: smoke test de datos históricos
```

Ver más scripts en [`scripts/INDEX.md`](scripts/INDEX.md)

---

## 📁 Estructura del Proyecto

```
focades-pro/
├── src/                           # Código fuente React
│   ├── components/                # Componentes reutilizables
│   ├── pages/                     # Páginas (Admin, Beneficiario, Público)
│   ├── layouts/                   # Layouts por rol
│   ├── lib/                       # Utilidades (Supabase, R2, Auth, etc.)
│   ├── assets/                    # Imágenes y recursos estáticos
│   └── diagnostics/               # Herramientas de debugging
│
├── supabase/                      # Backend y base de datos
│   ├── migrations/                # Scripts SQL versionados (100+)
│   ├── functions/                 # Edge Functions Deno (50+)
│   └── config.toml                # Configuración
│
├── scripts/                       # Scripts operacionales
│   ├── setup/                     # Setup inicial
│   ├── migration/                 # Migraciones de datos
│   ├── admin/                     # Operaciones admin
│   ├── testing/                   # Tests y smoke tests
│   ├── utils/                     # Utilidades y diagnósticos
│   └── INDEX.md                   # Guía de scripts
│
├── docs/                          # 📚 DOCUMENTACIÓN CENTRALIZADA
│   ├── documentation/             # Guías organizadas por tema
│   ├── logs/archived/             # Logs históricos
│   └── INDEX.md                   # Punto de entrada de docs
│
├── public/                        # Archivos estáticos públicos
├── .github/                       # Config de GitHub (skills, workflows)
├── package.json                   # Dependencias y scripts npm
├── vite.config.js                 # Config de build (Vite)
├── tailwind.config.js             # Config de estilos (Tailwind)
└── README.md                      # Este archivo
```

---

## 🔑 Características Principales

### 👥 Gestión de Beneficiarios
- Portales por rol (Admin, Beneficiarios, Aspirantes)
- Autenticación con Supabase Auth
- Perfiles con documentos e historial

### 📄 Cargue de Documentos
- Cargue masivo de documentos
- Almacenamiento en Cloudflare R2
- Validación y aprobación por admin
- Historial de cambios

### 📊 Reporting
- Generación de reportes operacionales (OP)
- Reportes de pagos (RP)
- Reportes de contabilidad
- Exportación a Excel/PDF

### 🔔 Notificaciones
- Email con Resend o SendGrid
- Sistema de tickets de soporte
- Notificaciones en tiempo real

### 🔐 Seguridad
- Row Level Security (RLS) en Supabase
- Tokens JWT seguros
- Variables de entorno protegidas
- Auditoría de acciones

---

## 🛠️ Tech Stack

### Frontend
- **React 19** + Vite
- **Tailwind CSS 4** - Estilos
- **React Router** - Navegación
- **Lucide React** - Íconos

### Backend
- **Supabase** - BDD PostgreSQL y Auth
- **Deno** - Edge Functions TypeScript
- **Cloudflare R2** - Almacenamiento en nube

### Herramientas
- **AWS SDK** - Compatibilidad S3 con R2
- **DOCX** - Generación de Word
- **ExcelJS** - Generación de Excel
- **jsPDF** - Generación de PDF

---

## ⚙️ Configuración

### Variables de Entorno (.env.local)

```bash
# Supabase (claves públicas - OK exponer)
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=xxxxx

# R2 (Cloudflare) - configurado en Supabase
# Service Role Key - SOLO para Edge Functions
# Nunca en frontend
```

**⚠️ IMPORTANTE:** Las credenciales secretas (`SERVICE_ROLE_KEY`, `API_KEYS`, etc.) nunca deben estar en `.env` o código. Se configuran en Edge Functions vía `supabase secrets`.

---

## 📊 Datos y Migraciones

### Estructura de BD
- **Beneficiarios** - Perfiles de beneficiarios
- **Documentos** - Historial de documentos cargados
- **Sesiones** - Control de acceso
- **Tickets** - Sistema de soporte
- **Roles y RLS** - Control de acceso granular

### Migraciones
- Versionadas en `supabase/migrations/`
- Patrón: `YYYYMMDDHHMM_descripcion.sql`
- Ver: [docs/documentation/migration/INDEX.md](docs/documentation/migration/INDEX.md)

---

## 🚀 Deployment

### Producción
- **Frontend:** Vercel
- **Backend:** Supabase Cloud
- **Storage:** Cloudflare R2

Ver guía completa en: [docs/documentation/deployment/INDEX.md](docs/documentation/deployment/INDEX.md)

---

## 🐛 Troubleshooting

Consultar documentación: [docs/documentation/troubleshooting/INDEX.md](docs/documentation/troubleshooting/INDEX.md)

---

## 📅 Changelog

Ver [docs/documentation/status/BUILD_LOG.md](docs/documentation/status/BUILD_LOG.md)

---

## ✨ Recursos Adicionales

- 📖 [Documentación Completa](docs/INDEX.md)
- 🔧 [Scripts Operacionales](scripts/INDEX.md)
- 📊 [Logs Históricos](docs/logs/archived/)

---

**Última actualización:** Oct 13, 2026  
**Responsable:** Development Team  
**Versión:** 1.0.0 (Production Ready)
