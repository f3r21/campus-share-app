# CampusShare

> Repositorio de apuntes para la comunidad UCSP.

CampusShare es una plataforma web donde los estudiantes de la **Universidad Católica San Pablo (UCSP)** suben, buscan y comparten apuntes y material de estudio organizados por carrera y curso. El acceso está restringido a cuentas institucionales `@ucsp.edu.pe`.

---

## Características

- **Login con Google restringido a la UCSP.** Solo se admiten cuentas institucionales `@ucsp.edu.pe`; el dominio se valida en el backend con la claim `hd` del ID token de Google.
- **Subida de apuntes por carrera y curso.** Cada material se asocia a un curso, que a su vez pertenece a una carrera. Se aceptan PDF, imágenes (PNG/JPEG) y documentos de Office, con un límite de 10 MB por archivo.
- **Corazón (like) por usuario.** Cada usuario puede dar o quitar un corazón a un material; el conteo de votos se calcula a partir de los likes únicos.
- **Búsqueda y ordenamiento.** Los materiales se pueden filtrar por texto y ordenar por número de corazones, más recientes o más antiguos.
- **Diseño editorial.** Interfaz construida con React, Tailwind y animaciones con Framer Motion.

---

## Arquitectura / Stack

| Capa | Tecnología |
|------|------------|
| Frontend | Vite + React 19 + Tailwind CSS (sitio estático) |
| Backend | Node.js + Express 5 |
| Base de datos | PostgreSQL (alojada en [Neon](https://neon.tech)) |
| Autenticación | Google Identity Services + JWT propio |
| Despliegue | DigitalOcean App Platform (backend service + static site) |
| Almacenamiento de archivos | DigitalOcean Spaces / Cloudflare R2 (S3-compatible, **opcional**) |

El frontend es un **sitio estático** que se sirve desde DigitalOcean App Platform y consume la API del backend bajo las rutas `/api` y `/uploads`. El backend expone una API REST en Express y persiste todo en PostgreSQL.

**Almacenamiento de archivos:** si se configuran las credenciales `SPACES_*`, los archivos subidos se guardan en un bucket S3-compatible (DigitalOcean Spaces o Cloudflare R2) y se sirven desde ahí. Si **no** se configuran, los archivos se guardan en el disco local del contenedor (`backend/uploads`) y son **efímeros**: se pierden en cada redeploy o reinicio. Para producción se recomienda activar el almacenamiento externo.

---

## Desarrollo local

### Requisitos

- Node.js 22+
- PostgreSQL local (nativo o vía Docker)

### Backend

```bash
cd backend

# 1. Copia el ejemplo de variables de entorno y complétalo
cp .env.example .env
#    Edita .env: DATABASE_URL y JWT_SECRET son obligatorios.
#    Genera un secreto fuerte con: openssl rand -base64 48

# 2. Levanta Postgres local (opción Docker):
docker run --name campus-pg -e POSTGRES_USER=campus \
  -e POSTGRES_PASSWORD=campus -e POSTGRES_DB=campus_share \
  -p 5432:5432 -d postgres:16
#    Para esa instancia: DATABASE_URL=postgres://campus:campus@localhost:5432/campus_share

# 3. Instala dependencias y arranca
npm install
node server.js
```

El servidor arranca en el puerto `8080` (configurable con `PORT`). En el arranque inicializa el esquema y los datos semilla de forma idempotente (`db/schema.sql` y `db/seed.sql`).

> SSL se desactiva automáticamente cuando `DATABASE_URL` apunta a `localhost`/`127.0.0.1` o cuando defines `DB_SSL=false`. En producción (Neon) el SSL queda activo.

### Frontend

```bash
cd frontend

# (Opcional) configura el Client ID de Google para el login
cp .env.example .env
#    Define VITE_GOOGLE_CLIENT_ID con el mismo valor que GOOGLE_CLIENT_ID del backend

npm install
npm run dev
```

El servidor de desarrollo de Vite proxea `/api` y `/uploads` hacia `http://localhost:8080`, por lo que el frontend habla con el backend local sin configuración adicional de CORS.

---

## Variables de entorno

| Variable | Componente | Scope | Obligatoria | Descripción |
|----------|------------|-------|-------------|-------------|
| `DATABASE_URL` | backend | runtime (secret) | Sí | Cadena de conexión de PostgreSQL. En producción (Neon) debe forzar SSL, p. ej. `...neon.tech/db?sslmode=require`. |
| `JWT_SECRET` | backend | runtime (secret) | Sí | Secreto para firmar los JWT propios. El servidor **no arranca** sin él. Genéralo con `openssl rand -base64 48`. |
| `GOOGLE_CLIENT_ID` | backend | runtime | Sí (para login) | Client ID OAuth 2.0 (Web) usado como *audience* al verificar el ID token. Mismo valor que `VITE_GOOGLE_CLIENT_ID`. Sin él, `POST /api/auth/google` responde `503`. |
| `VITE_GOOGLE_CLIENT_ID` | frontend | build-time | Sí (para login) | Client ID OAuth 2.0 (Web) que usa Google Identity Services en el navegador. Se incrusta en el bundle en tiempo de build. Es público por diseño. Mismo valor que `GOOGLE_CLIENT_ID`. |
| `PORT` | backend | runtime | No | Puerto del servidor. Por defecto `8080`. |
| `FRONTEND_ORIGIN` | backend | runtime | No | Origen permitido para CORS. Si se omite, se permite cualquier origen. En producción, fíjalo a la URL del frontend. |
| `DB_SSL` | backend | runtime | No | `false` desactiva SSL en la conexión a Postgres (útil para Postgres local o CI). |
| `SPACES_ACCESS_KEY` | backend | runtime (secret) | No | Clave de acceso del bucket S3-compatible (Spaces / R2). Habilita el almacenamiento externo de archivos. |
| `SPACES_SECRET_KEY` | backend | runtime (secret) | No | Clave secreta del bucket S3-compatible. |
| `SPACES_BUCKET_NAME` | backend | runtime | No | Nombre del bucket. Por defecto `campus-share-bucket`. |
| `SPACES_ENDPOINT` | backend | runtime | No | Endpoint del servicio S3-compatible. Por defecto `https://nyc3.digitaloceanspaces.com`. |
| `SPACES_REGION` | backend | runtime | No | Región del servicio. Por defecto `us-east-1`. |
| `STORAGE_PUBLIC_URL` | backend | runtime | No | URL pública base del bucket para los enlaces de descarga (p. ej. la URL `r2.dev` de Cloudflare R2). Si se omite, se usa la URL de DigitalOcean Spaces. |
| `SENTRY_DSN` | backend | runtime | No | DSN de Sentry para monitoreo de errores del backend. Si se omite, Sentry queda desactivado (no-op). |
| `VITE_SENTRY_DSN` | frontend | build-time | No | DSN de Sentry para el frontend. Público; no-op si se omite. |
| `ENFORCE_STUDENT_CODES` | backend | runtime | No | `'true'` activa la lista blanca de códigos de matrícula (solo alumnos con código del padrón pueden registrarse). Cualquier otro valor = alta libre para cualquier `@ucsp.edu.pe`. Actívalo SOLO con la tabla `student_codes` ya cargada (ver HANDOVER). |

> **Nota:** las claves `SPACES_*` aplican a cualquier almacenamiento S3-compatible. Para Cloudflare R2 usa el endpoint, las credenciales y el bucket de R2. El almacenamiento de archivos es **opcional**: sin él los uploads son efímeros.

---

## Despliegue

El despliegue corre sobre **DigitalOcean App Platform** con dos componentes: el `backend` (service Node/Express) y el `frontend` (static site Vite).

- **`deploy_on_push` desde `main`:** cada push a la rama `main` dispara un despliegue automático de ambos componentes.
- **La configuración viva está en el panel de DigitalOcean.** El archivo `.do/app.yaml` documenta la forma de la app, pero **App Platform no lo lee automáticamente** en cada deploy; la configuración efectiva (rutas, variables, escalado) vive en el dashboard. Trátalo como referencia, no como fuente de verdad operativa.
- **Los secretos se configuran en el dashboard de DO**, por componente (Settings → Environment Variables). Nunca pongas secretos en `.do/app.yaml` ni en el repositorio.
- **Rutas:** el backend conserva el prefijo de la ruta (`preserve_path_prefix`) en `/api` y `/uploads`, de modo que Express recibe los paths tal cual están registrados en `server.js`.

---

## Cómo funciona el login

1. El frontend usa **Google Identity Services** para que el usuario inicie sesión con su cuenta de Google.
2. Google devuelve un **ID token** (un JWT firmado por Google). El frontend lo envía a `POST /api/auth/google`.
3. El backend verifica el ID token con `google-auth-library`: comprueba la **firma de Google**, que el **audience** sea el `GOOGLE_CLIENT_ID` y que no esté expirado.
4. **Restricción de dominio:** el backend solo acepta el login si el correo está verificado (`email_verified`), la claim `hd` del token es `ucsp.edu.pe`, y el email termina en `@ucsp.edu.pe`. Cualquier otra cuenta recibe `403`.
5. Si el usuario no existe, se crea automáticamente. El backend emite entonces su **propio JWT** (firmado con `JWT_SECRET`, válido 24 h) que el frontend usa para las llamadas autenticadas posteriores.
