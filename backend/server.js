const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8080;

// JWT_SECRET es obligatorio: sin fallback inseguro. El servidor no arranca sin él.
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error('[startup] ❌ FATAL: falta la variable de entorno JWT_SECRET. Configúrala (p. ej. `openssl rand -base64 48`).');
    process.exit(1);
}

// Detrás del proxy de DigitalOcean: necesario para que el rate-limit use la IP real.
app.set('trust proxy', 1);

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

// Register Auth endpoint
app.post('/api/auth/register', authLimiter, async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: "Email y contraseña son obligatorios" });
        }
        if (!email.endsWith('@ucsp.edu.pe')) {
            return res.status(400).json({ error: "Solo se permiten correos de la UCSP" });
        }
        if (password.length < 8) {
            return res.status(400).json({ error: "La contraseña debe tener al menos 8 caracteres" });
        }

        const existing = (await pool.query('SELECT * FROM users WHERE email = $1', [email])).rows[0];
        if (existing) {
            return res.status(400).json({ error: "El correo ya está registrado" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        await pool.query('INSERT INTO users (email, password_hash) VALUES ($1, $2)', [email, hashedPassword]);
        res.status(201).json({ message: "Usuario registrado exitosamente" });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.post('/api/auth/login', authLimiter, async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ error: "Email y contraseña son obligatorios" });
        }
        const user = (await pool.query('SELECT * FROM users WHERE email = $1', [email])).rows[0];

        if (!user || !(await bcrypt.compare(password, user.password_hash))) {
            return res.status(401).json({ error: "Credenciales inválidas" });
        }

        const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ token, user: { id: user.id, email: user.email } });
    } catch (error) {
        console.error(error);
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
            const uploadParams = {
                Bucket: BUCKET_NAME,
                Key: req.file.filename,
                Body: fileStream,
                ACL: 'public-read'
            };
            await s3Client.send(new PutObjectCommand(uploadParams));
            fileUrl = `https://${BUCKET_NAME}.nyc3.digitaloceanspaces.com/${req.file.filename}`;
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

// Asegurar que las tablas existan antes de servir peticiones.
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
