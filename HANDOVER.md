# Guía de relevo — CampusShare

Esta guía es para los **siguientes alumnos** que reciban el proyecto. Explica dónde vive cada cosa, cómo conseguir y transferir accesos, qué secretos deben existir en producción, los costos involucrados y un checklist de recepción y de egreso.

> ⚠️ **Lo más urgente antes de egresar:** la cuenta institucional de Google (`@ucsp.edu.pe`) se **desactiva al egresar**. El proyecto de Google Cloud que contiene el OAuth del login está atado a esa cuenta. **Agrega a tu sucesor como Owner del proyecto de Google Cloud ANTES de egresar** o se perderá el control del login. Ver más abajo.

---

## 1. Cuentas y dónde vive cada cosa

| Servicio | Para qué se usa | Quién es el dueño | Cómo conseguir acceso |
|----------|-----------------|-------------------|-----------------------|
| **GitHub** | Repositorio del código (`f3r21/campus-share-app`). Dispara los despliegues por push a `main`. | Cuenta personal del alumno que creó el repo (`f3r21`). | El dueño te agrega como colaborador, o se transfiere el repo a una organización/cuenta del sucesor. |
| **DigitalOcean App Platform** | Hosting de producción: el `backend` (service Node/Express) y el `frontend` (static site). Aquí viven las variables de entorno y secretos de producción. | Cuenta de DO del equipo (suele estar pagada con créditos del GitHub Student Pack). | El dueño te invita al equipo/proyecto de DO, o te pasa las credenciales de la cuenta. |
| **Neon (PostgreSQL)** | Base de datos de producción. Su cadena de conexión es el `DATABASE_URL`. | Cuenta de Neon del equipo. | El dueño te invita al proyecto de Neon, o te pasa las credenciales. |
| **Google Cloud** | Proyecto OAuth 2.0 que emite los ID tokens del login. **Creado con una cuenta `@ucsp.edu.pe`.** | La cuenta UCSP del alumno que configuró el OAuth. | **IAM:** el dueño te agrega como **Owner** del proyecto de Google Cloud. Hazlo antes de que la cuenta UCSP se desactive. |
| **Cloudflare R2 / DigitalOcean Spaces** | Almacenamiento de archivos subidos (S3-compatible). **Opcional**; solo si se activa el almacenamiento persistente. | Cuenta de Cloudflare o de DO del equipo. | El dueño te invita o te pasa las claves (`SPACES_ACCESS_KEY` / `SPACES_SECRET_KEY`). |

---

## 2. Cómo conseguir acceso / transferir

- **GitHub:** transfiere el repositorio a una **organización** (recomendado, sobrevive entre generaciones) o agrega al sucesor como **colaborador** con permisos de admin. Si está en una cuenta personal, considera transferir la propiedad del repo.
- **DigitalOcean:** invita al sucesor a la **cuenta/equipo** de DO, o entrega las credenciales de acceso. Verifica que tenga permiso para ver y editar las variables de entorno de ambos componentes.
- **Neon:** invita al sucesor al **proyecto** de Neon desde la consola, o entrega las credenciales. Asegúrate de que pueda regenerar la cadena de conexión si hiciera falta.
- **Google Cloud OAuth (CRÍTICO):** abre el proyecto en **IAM & Admin → IAM** y agrega al sucesor como **Owner** del proyecto. Hazlo **ANTES de egresar**, porque la cuenta `@ucsp.edu.pe` se desactiva y, si era el único Owner, se pierde el control del OAuth (y por tanto del login de toda la app). Si es posible, migra la propiedad del proyecto a una cuenta de Google que no se desactive.
- **DNS / dominio:** si la app usa un dominio propio (no el `*.ondigitalocean.app` por defecto), transfiere el control del **registrador de dominios** y de la **gestión de DNS** al sucesor. Documenta dónde está registrado el dominio.

---

## 3. Variables / secretos que deben existir en producción

Se configuran en el **dashboard de DigitalOcean**, por componente (Settings → Environment Variables). **Nunca** en el repositorio ni en `.do/app.yaml`.

### Backend (service)

| Variable | Tipo | Obligatoria | Notas |
|----------|------|-------------|-------|
| `DATABASE_URL` | Secret | Sí | Cadena de conexión de Neon. Debe forzar SSL (`?sslmode=require`). |
| `JWT_SECRET` | Secret | Sí | Secreto para firmar los JWT. El backend no arranca sin él. Genéralo con `openssl rand -base64 48`. |
| `GOOGLE_CLIENT_ID` | Plano | Sí (para login) | Client ID OAuth Web. Mismo valor que `VITE_GOOGLE_CLIENT_ID`. Sin él, el login da `503`. |
| `FRONTEND_ORIGIN` | Plano | Recomendada | URL del frontend en producción, para restringir CORS. |
| `SPACES_ACCESS_KEY` | Secret | Opcional | Solo si se activa almacenamiento externo de archivos. |
| `SPACES_SECRET_KEY` | Secret | Opcional | Solo si se activa almacenamiento externo. |
| `SPACES_BUCKET_NAME` | Plano | Opcional | Nombre del bucket. |
| `SPACES_ENDPOINT` / `SPACES_REGION` | Plano | Opcional | Endpoint y región del bucket S3-compatible (DO Spaces o R2). |
| `STORAGE_PUBLIC_URL` | Plano | Opcional | URL pública del bucket (R2) para los enlaces de descarga. |
| `SENTRY_DSN` | Plano | Opcional | DSN de Sentry (monitoreo de errores del backend). No-op si se omite. |

### Frontend (static site)

| Variable | Tipo | Obligatoria | Notas |
|----------|------|-------------|-------|
| `VITE_GOOGLE_CLIENT_ID` | Build-time | Sí (para login) | Client ID OAuth Web. Se incrusta en el bundle al compilar. Es público por diseño. Mismo valor que `GOOGLE_CLIENT_ID` del backend. |
| `VITE_SENTRY_DSN` | Build-time | Opcional | DSN de Sentry para el frontend. Público; no-op si se omite. |

> Si `GOOGLE_CLIENT_ID` (backend) y `VITE_GOOGLE_CLIENT_ID` (frontend) **no coinciden**, el login falla: el ID token emitido para el frontend no validará el *audience* en el backend.
>
> **Importante:** el almacenamiento de archivos es opcional. Sin las claves `SPACES_*`, los uploads se guardan en el disco del contenedor y se **pierden en cada redeploy**. Para producción real, activa el almacenamiento externo.

---

## 4. Costos y free tier

| Componente | Costo | Cobertura |
|------------|-------|-----------|
| Frontend (static site en DO) | **Gratis** | Los sitios estáticos de App Platform no tienen costo. |
| Base de datos (Neon) | **Gratis** | El free tier de Neon cubre el uso del proyecto. |
| Backend (service en DO) | **~$5/mes** | Cubierto por los créditos del **GitHub Student Pack / DigitalOcean** ($200 en créditos típicos para estudiantes). |
| Almacenamiento (Cloudflare R2) | **Gratis hasta 10 GB** | El free tier de R2 cubre el almacenamiento de los apuntes hasta ese límite. |

> **Renovar créditos cada generación.** Los créditos de DO del Student Pack son temporales. Cada nueva generación debe **activar su propio GitHub Student Pack** y aplicar los créditos de DigitalOcean, o el backend dejará de pagarse y se apagará. Vigila el saldo de créditos en el panel de DO.

---

## 5. Checklist al recibir el proyecto

- [ ] Tengo acceso al **repositorio de GitHub** (como colaborador o miembro de la organización).
- [ ] Tengo acceso a la **cuenta/equipo de DigitalOcean** y puedo ver ambos componentes (backend + frontend).
- [ ] Puedo ver y editar las **variables de entorno** de los dos componentes en DO.
- [ ] Tengo acceso al **proyecto de Neon** y a la `DATABASE_URL`.
- [ ] Soy **Owner del proyecto de Google Cloud** (OAuth) y puedo ver el Client ID y configurar orígenes/redirects autorizados.
- [ ] (Si aplica) Tengo acceso al **bucket de Cloudflare R2 / DO Spaces** y a sus claves.
- [ ] (Si aplica) Tengo control del **dominio y DNS**.
- [ ] Logré **clonar, instalar y arrancar el proyecto en local** siguiendo el `README.md`.
- [ ] Verifiqué que el **despliegue automático** funciona: un push de prueba a `main` redespliega.
- [ ] Confirmé el **saldo de créditos** de DigitalOcean y sé cuándo se agotan.

## 6. Checklist antes de egresar

- [ ] **Agregué a mi sucesor como Owner del proyecto de Google Cloud (OAuth)** — esto es lo más crítico, porque mi cuenta `@ucsp.edu.pe` se desactiva.
- [ ] Transferí o compartí el acceso al **repositorio de GitHub** (mejor: moverlo a una organización).
- [ ] Invité a mi sucesor a la **cuenta/equipo de DigitalOcean** (o le pasé credenciales).
- [ ] Invité a mi sucesor al **proyecto de Neon**.
- [ ] (Si aplica) Transferí el acceso al **bucket de Cloudflare R2 / DO Spaces**.
- [ ] (Si aplica) Transferí el control del **dominio y DNS**.
- [ ] Documenté **dónde están todos los secretos** y cómo regenerarlos (`JWT_SECRET`, claves de storage).
- [ ] Mi sucesor activó su propio **GitHub Student Pack** y renovó los **créditos de DigitalOcean**.
- [ ] Mi sucesor completó el **Checklist al recibir el proyecto** y confirmó que todo funciona **antes** de mi salida.
