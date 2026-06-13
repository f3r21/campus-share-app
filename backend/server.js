require('dotenv').config();

// --- SENTRY (monitoreo de errores) ---
// Gated por env: NO-OP completo cuando SENTRY_DSN no está definido. Se inicializa
// lo antes posible (antes de cargar Express y demás módulos) para que el SDK pueda
// instrumentarlos correctamente. Si SENTRY_DSN está vacío, no se hace nada.
const Sentry = require('@sentry/node');
const SENTRY_ENABLED = !!process.env.SENTRY_DSN;
if (SENTRY_ENABLED) {
    Sentry.init({
        dsn: process.env.SENTRY_DSN,
        environment: process.env.NODE_ENV || 'production',
        tracesSampleRate: 0.1
    });
    console.log('[sentry] ✅ Monitoreo de errores habilitado.');
}

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { Pool } = require('pg');
const { OAuth2Client } = require('google-auth-library');

const app = express();
const PORT = process.env.PORT || 8080;

// JWT_SECRET es obligatorio: sin fallback inseguro. El servidor no arranca sin él.
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error('[startup] ❌ FATAL: falta la variable de entorno JWT_SECRET. Configúrala (p. ej. `openssl rand -base64 48`).');
    process.exit(1);
}

// Google Sign-In: el Client ID se usa como "audience" al verificar el ID token.
// NO se hace fail-fast si falta: el servidor debe arrancar para el resto de
// endpoints; la ruta /api/auth/google responde 503 cuando no está configurado.
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);
const UCSP_DOMAIN = 'ucsp.edu.pe';

// Detrás del proxy de DigitalOcean: necesario para que el rate-limit use la IP real.
app.set('trust proxy', 1);

// --- CABECERAS DE SEGURIDAD (helmet) ---
// La API sirve JSON (no HTML), así que se deshabilita la CSP de helmet para no
// romper el JSON (la SPA define su propia CSP). Se mantienen las defensas
// relevantes: HSTS, X-Content-Type-Options nosniff, frameguard deny y
// Referrer-Policy. crossOriginResourcePolicy se desactiva para no interferir
// con CORS ni con la descarga de /uploads desde otro origen.
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    frameguard: { action: 'deny' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
}));

// CORS configurable: si FRONTEND_ORIGIN está definido, se restringe a ese origen.
app.use(cors({ origin: process.env.FRONTEND_ORIGIN || true }));
app.use(express.json());

// --- RATE LIMITERS ---
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Demasiados intentos. Inténtalo de nuevo más tarde.' }
});
const uploadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Demasiadas subidas. Inténtalo de nuevo más tarde.' }
});

// --- POOL DE POSTGRESQL ---
// DO managed PG requiere SSL. Se desactiva automáticamente en local
// (localhost/127.0.0.1) o con DB_SSL=false, para desarrollo sin SSL.
const DATABASE_URL = process.env.DATABASE_URL;
const isLocalDb = /@(localhost|127\.0\.0\.1)[:/]/.test(DATABASE_URL || '');
const sslOff = process.env.DB_SSL === 'false' || isLocalDb;
const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: DATABASE_URL && !sslOff ? { rejectUnauthorized: false } : false
});

// initDb: lee schema.sql y luego seed.sql, idempotente, sin pérdida de datos.
const initDb = async () => {
    try {
        const schema = fs.readFileSync(path.join(__dirname, 'db', 'schema.sql'), 'utf8');
        const seed = fs.readFileSync(path.join(__dirname, 'db', 'seed.sql'), 'utf8');
        await pool.query(schema);
        await pool.query(seed);
        console.log("[initDb] ✅ Base de datos PostgreSQL inicializada.");
    } catch (error) {
        console.error("[initDb] ❌ Error inicializando PostgreSQL:", error.message);
        throw error;
    }
};

// --- CONFIGURACIÓN DE SPACES (S3) ---
const SPACES_ENDPOINT = process.env.SPACES_ENDPOINT || 'https://nyc3.digitaloceanspaces.com';
const SPACES_REGION = process.env.SPACES_REGION || 'us-east-1';

let s3Client = null;
if (process.env.SPACES_ACCESS_KEY && process.env.SPACES_SECRET_KEY) {
    s3Client = new S3Client({
        endpoint: SPACES_ENDPOINT,
        region: SPACES_REGION,
        credentials: {
          accessKeyId: process.env.SPACES_ACCESS_KEY,
          secretAccessKey: process.env.SPACES_SECRET_KEY
        }
    });
}
const BUCKET_NAME = process.env.SPACES_BUCKET_NAME || "campus-share-bucket";

console.log('[storage] almacenamiento de archivos: ' + (s3Client ? 'R2/S3 activo' : 'local efímero (sin credenciales S3)'));

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const ALLOWED_MIME = new Set([
    'application/pdf',
    'image/png',
    'image/jpeg',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
]);

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    // Nombre seguro: id aleatorio + extensión saneada (evita path traversal).
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '');
        cb(null, `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`);
    }
});
const fileFilter = (req, file, cb) => {
    if (ALLOWED_MIME.has(file.mimetype)) return cb(null, true);
    cb(new Error('Tipo de archivo no permitido. Sube PDF, imágenes o documentos de Office.'));
};
const upload = multer({ storage, fileFilter, limits: { fileSize: 10 * 1024 * 1024 } });

// Captura errores de multer (tipo/tamaño) y responde JSON 400 limpio.
const uploadSingle = (req, res, next) => {
    upload.single('file')(req, res, (err) => {
        if (err) {
            const msg = err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE'
                ? 'El archivo excede el límite de 10MB'
                : err.message;
            return res.status(400).json({ error: msg });
        }
        next();
    });
};

// Servir uploads forzando descarga (mitiga XSS almacenado en el mismo origen).
app.use('/uploads', express.static(uploadDir, {
    setHeaders: (res) => {
        res.setHeader('Content-Disposition', 'attachment');
        res.setHeader('X-Content-Type-Options', 'nosniff');
    }
}));

// --- MIDDLEWARE DE AUTENTICACIÓN ---
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.status(401).json({ error: 'Acceso denegado. Token no proporcionado.' });

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ error: 'Token inválido o expirado.' });
        req.user = user;
        next();
    });
};

// Auth opcional: NO rechaza si falta el token. Solo establece req.user cuando
// hay un token válido. Nunca responde 401/403; siempre continúa.
const optionalAuth = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return next();

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (!err) req.user = user;
        next();
    });
};

// --- RUTAS DE LA API ---

// Healthcheck para DigitalOcean
app.get('/', (req, res) => {
    console.log("Healthcheck hit on /");
    res.status(200).send('OK');
});
app.get('/api', (req, res) => {
    console.log("Healthcheck hit on /api");
    res.status(200).send('OK');
});

// TEMPORAL: verificación de Sentry. Lanza un error no controlado a propósito
// para confirmar que Sentry lo captura. SE ELIMINA tras la prueba.
app.get('/api/debug/sentry-test', (req, res) => {
    throw new Error('Sentry test error (intencional) — verificación temporal');
});

// Inicio de sesión con Google (Google Identity Services).
// El frontend envía el ID token (JWT firmado por Google) y aquí se verifica
// criptográficamente firma, audience y expiración con google-auth-library.
// Solo se admiten cuentas institucionales de la UCSP (@ucsp.edu.pe).
app.post('/api/auth/google', authLimiter, async (req, res) => {
    const { credential } = req.body;
    if (!credential) {
        return res.status(400).json({ error: "Falta el credential de Google" });
    }
    if (!GOOGLE_CLIENT_ID) {
        console.error('[auth/google] ❌ GOOGLE_CLIENT_ID no configurado. Define la variable de entorno con el mismo Client ID que el frontend (VITE_GOOGLE_CLIENT_ID).');
        return res.status(503).json({ error: "Autenticación con Google no configurada" });
    }

    // Paso 1: verificación criptográfica del ID token (firma de Google,
    // audience = Client ID, expiry). Un fallo aquí => token inválido/expirado => 401.
    let payload;
    try {
        const ticket = await googleClient.verifyIdToken({
            idToken: credential,
            audience: GOOGLE_CLIENT_ID
        });
        payload = ticket.getPayload();
    } catch (error) {
        console.error('[auth/google] Token de Google inválido o expirado:', error.message);
        return res.status(401).json({ error: "Token de Google inválido" });
    }

    // Paso 2: autorización + alta/login. Errores aquí (p. ej. BD) => 500 genérico.
    try {
        // Correo verificado + dominio Workspace (hd) de la UCSP. hd es la claim
        // autoritativa del dominio; el sufijo del email se valida como defensa
        // en profundidad.
        const email = payload.email;
        const isUcsp =
            payload.email_verified === true &&
            payload.hd === UCSP_DOMAIN &&
            !!email &&
            email.toLowerCase().endsWith(`@${UCSP_DOMAIN}`);

        if (!isUcsp) {
            return res.status(403).json({ error: "Debes iniciar sesión con tu cuenta institucional de la UCSP (@ucsp.edu.pe)" });
        }

        const normalizedEmail = email.toLowerCase();

        // Buscar usuario por email; si no existe, crearlo (sin password_hash).
        let user = (await pool.query('SELECT id, email FROM users WHERE email = $1', [normalizedEmail])).rows[0];
        if (!user) {
            user = (await pool.query(
                'INSERT INTO users (email) VALUES ($1) RETURNING id, email',
                [normalizedEmail]
            )).rows[0];
        }

        const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ token, user: { id: user.id, email: user.email } });
    } catch (error) {
        console.error('[auth/google] Error procesando el inicio de sesión:', error.message);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Carreras y Cursos
app.get('/api/careers', async (req, res) => {
    try {
        const result = (await pool.query('SELECT * FROM careers ORDER BY name ASC')).rows;
        res.json(result);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.get('/api/courses', async (req, res) => {
    try {
        const { career_id } = req.query;
        let sql = 'SELECT * FROM courses';
        let params = [];
        if (career_id) {
            sql += ' WHERE career_id = $1';
            params.push(career_id);
        }
        sql += ' ORDER BY semester, name';
        const result = (await pool.query(sql, params)).rows;
        res.json(result);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Materiales
app.get('/api/materials', optionalAuth, async (req, res) => {
    try {
        const { sort = 'upvotes', query = '' } = req.query;
        // Whitelist del ordenamiento: nunca interpolar input del usuario.
        // 'upvotes' usa el alias calculado (conteo de likes), no la columna obsoleta.
        let orderBy = 'upvotes DESC';
        if (sort === 'newest') orderBy = 'm.created_at DESC';
        if (sort === 'oldest') orderBy = 'm.created_at ASC';

        // $1 = id del usuario solicitante (0 si no autenticado; ningún user tiene id 0).
        const userId = req.user?.id || 0;
        const params = [userId];

        // Columnas explícitas: NO exponemos m.* (incluye la columna obsoleta upvotes).
        let sql = `
            SELECT m.id, m.course_id, m.user_id, m.title, m.description, m.file_url, m.created_at,
                   c.name AS course_name, u.email AS user_email,
                   (SELECT COUNT(*) FROM likes l WHERE l.material_id = m.id)::int AS upvotes,
                   EXISTS (SELECT 1 FROM likes l WHERE l.material_id = m.id AND l.user_id = $1) AS liked_by_me
            FROM materials m
            LEFT JOIN courses c ON m.course_id = c.id
            LEFT JOIN users u ON m.user_id = u.id
        `;

        if (query) {
            sql += ` WHERE m.title ILIKE $2 OR m.description ILIKE $2 OR c.name ILIKE $2`;
            params.push(`%${query}%`);
        }

        sql += ` ORDER BY ${orderBy}`;

        const result = (await pool.query(sql, params)).rows;
        res.json(result);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.post('/api/materials', uploadLimiter, authenticateToken, uploadSingle, async (req, res) => {
    try {
        const { course_id, title, description } = req.body;
        const user_id = req.user.id;
        if (!req.file) return res.status(400).json({ error: 'Archivo requerido' });

        let fileUrl = `/uploads/${req.file.filename}`;

        if (s3Client) {
            const fileStream = fs.createReadStream(req.file.path);
            // R2 (cuando STORAGE_PUBLIC_URL está definido) controla el acceso
            // público a nivel de bucket y NO admite ACLs por objeto; DO Spaces sí
            // requiere public-read por objeto. Por eso la ACL es condicional.
            const uploadParams = {
                Bucket: BUCKET_NAME,
                Key: req.file.filename,
                Body: fileStream,
                ...(process.env.STORAGE_PUBLIC_URL ? {} : { ACL: 'public-read' })
            };
            await s3Client.send(new PutObjectCommand(uploadParams));
            // URL pública configurable. R2 (Cloudflare) reutiliza el cliente S3 pero
            // expone otra URL pública: define STORAGE_PUBLIC_URL con la base de tu
            // bucket. Sin esa variable, se mantiene la URL de DO Spaces (nyc3).
            // .trim() + quitar barras finales: tolera espacios/saltos accidentales
            // en STORAGE_PUBLIC_URL (un espacio sobrante rompía el enlace).
            const publicBase = (process.env.STORAGE_PUBLIC_URL || '').trim().replace(/\/+$/, '');
            fileUrl = publicBase
                ? `${publicBase}/${req.file.filename}`
                : `https://${BUCKET_NAME}.nyc3.digitaloceanspaces.com/${req.file.filename}`;
        }

        const newMaterial = (await pool.query(
            'INSERT INTO materials (course_id, user_id, title, description, file_url) VALUES ($1, $2, $3, $4, $5) RETURNING *',
            [course_id, user_id, title, description, fileUrl]
        )).rows[0];
        res.status(201).json(newMaterial);
    } catch (error) {
        console.error("Error en upload:", error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Toggle de "me gusta" (corazón) por usuario. Inserta o elimina la fila en likes.
app.post('/api/materials/:id/like', authenticateToken, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'ID inválido' });

    const userId = req.user.id;
    try {
        const material = (await pool.query('SELECT id FROM materials WHERE id = $1', [id])).rows[0];
        if (!material) return res.status(404).json({ error: 'No encontrado' });

        const existing = (await pool.query(
            'SELECT 1 FROM likes WHERE user_id = $1 AND material_id = $2',
            [userId, id]
        )).rows[0];

        let liked;
        if (existing) {
            await pool.query('DELETE FROM likes WHERE user_id = $1 AND material_id = $2', [userId, id]);
            liked = false;
        } else {
            await pool.query(
                'INSERT INTO likes (user_id, material_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
                [userId, id]
            );
            liked = true;
        }

        const upvotes = (await pool.query(
            'SELECT COUNT(*)::int AS count FROM likes WHERE material_id = $1',
            [id]
        )).rows[0].count;

        res.json({ liked, upvotes });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// --- MANEJO DE ERRORES ---
// El handler de Sentry debe registrarse DESPUÉS de las rutas y ANTES de cualquier
// otro middleware de error. Es un NO-OP cuando SENTRY_DSN no está definido.
if (SENTRY_ENABLED && typeof Sentry.setupExpressErrorHandler === 'function') {
    Sentry.setupExpressErrorHandler(app);
}

// Middleware final de error: captura en Sentry (si está habilitado) y responde
// un JSON limpio sin filtrar detalles internos al cliente.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
    if (SENTRY_ENABLED) {
        Sentry.captureException(err);
    }
    console.error('[error]', err && err.message ? err.message : err);
    if (res.headersSent) return next(err);
    res.status(500).json({ error: 'Error interno del servidor' });
});

// Arranque del servidor: solo cuando se ejecuta directamente (no al importarse
// desde tests). Los tests importan { app, pool, initDb } y controlan initDb()
// y el cierre del pool por su cuenta, sin abrir un listener ni llamar process.exit.
const start = () => {
    initDb()
        .then(() => {
            app.listen(PORT, '0.0.0.0', () => {
                console.log(`🚀 Servidor backend corriendo en puerto ${PORT} (0.0.0.0)`);
            });
        })
        .catch((error) => {
            console.error("[startup] ❌ No se pudo inicializar la base de datos:", error.message);
            process.exit(1);
        });
};

if (require.main === module) {
    start();
}

module.exports = { app, pool, initDb };
