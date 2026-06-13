const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-jwt-key-for-campus-share-ucsp';

app.use(cors());
app.use(express.json());

// --- CONFIGURACIÓN DE POSTGRESQL ---
let pool = null;
if (process.env.DATABASE_URL) {
    console.log("Conectando a PostgreSQL de DigitalOcean...");
    pool = new Pool({
        connectionString: process.env.DATABASE_URL.replace('?sslmode=require', ''),
        ssl: { rejectUnauthorized: false }
    });
    
    const initDb = async () => {
        try {
            const schema = fs.readFileSync(path.join(__dirname, 'db', 'schema.sql'), 'utf8');
            const seed = fs.readFileSync(path.join(__dirname, 'db', 'seed.sql'), 'utf8');
            await pool.query(schema);
            await pool.query(seed);
            console.log("✅ Base de datos inicializada con esquema y semillas.");
        } catch (error) {
            console.error("❌ Error inicializando PostgreSQL:", error.message);
        }
    };
    
    // Esperar 15 segundos antes de inicializar para permitir que DO App Platform termine de provisionar permisos
    setTimeout(() => {
        initDb();
    }, 15000);
} else {
    console.log("⚠️ DATABASE_URL no encontrada. Usando fallback local (limitado).");
}

// --- CONFIGURACIÓN DE SPACES (S3) ---
let s3Client = null;
if (process.env.SPACES_ACCESS_KEY && process.env.SPACES_SECRET_KEY) {
    s3Client = new S3Client({
        endpoint: "https://nyc3.digitaloceanspaces.com", 
        region: "us-east-1",
        credentials: {
          accessKeyId: process.env.SPACES_ACCESS_KEY,
          secretAccessKey: process.env.SPACES_SECRET_KEY
        }
    });
}
const BUCKET_NAME = process.env.SPACES_BUCKET_NAME || "campus-share-bucket";

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, '-'))
});
const upload = multer({ storage });
app.use('/uploads', express.static(uploadDir));

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

// --- RUTAS DE LA API ---

app.get('/api/init', async (req, res) => {
    try {
        const schema = fs.readFileSync(path.join(__dirname, 'db', 'schema.sql'), 'utf8');
        const seed = fs.readFileSync(path.join(__dirname, 'db', 'seed.sql'), 'utf8');
        await pool.query(schema);
        await pool.query(seed);
        res.json({ message: "Base de datos inicializada correctamente" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Register Auth endpoint
app.post('/api/register', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email.endsWith('@ucsp.edu.pe')) {
            return res.status(400).json({ error: 'Solo se permiten correos de estudiantes UCSP (@ucsp.edu.pe)' });
        }
        if (!pool) return res.status(500).json({ error: 'Base de datos no configurada' });

        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await pool.query(
            'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email',
            [email, hashedPassword]
        );
        res.status(201).json({ message: 'Usuario registrado exitosamente', user: result.rows[0] });
    } catch (err) {
        if (err.code === '23505') return res.status(400).json({ error: 'El correo ya está registrado' });
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!pool) return res.status(500).json({ error: 'Base de datos no configurada' });

        const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
        const user = result.rows[0];

        if (!user || !(await bcrypt.compare(password, user.password_hash))) {
            return res.status(401).json({ error: 'Credenciales inválidas' });
        }

        const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ token, user: { id: user.id, email: user.email } });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Carreras y Cursos
app.get('/api/careers', async (req, res) => {
    if (!pool) return res.json([]);
    try {
        const result = await pool.query('SELECT * FROM careers ORDER BY name');
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/courses', async (req, res) => {
    if (!pool) return res.json([]);
    try {
        const { career_id } = req.query;
        let query = 'SELECT * FROM courses';
        const params = [];
        if (career_id) {
            query += ' WHERE career_id = $1';
            params.push(career_id);
        }
        query += ' ORDER BY semester, name';
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Materiales
app.get('/api/materials', async (req, res) => {
    if (!pool) return res.json([]);
    try {
        const query = `
            SELECT m.*, c.name as course_name, u.email as user_email
            FROM materials m 
            JOIN courses c ON m.course_id = c.id
            LEFT JOIN users u ON m.user_id = u.id
            ORDER BY m.upvotes DESC
        `;
        const result = await pool.query(query);
        // Limpiamos el email para mostrar solo el usuario (seguridad visual)
        const safeRows = result.rows.map(r => ({
            ...r,
            user_name: r.user_email ? r.user_email.split('@')[0] : 'Anónimo'
        }));
        res.json(safeRows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/materials', authenticateToken, upload.single('file'), async (req, res) => {
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

        if (!pool) return res.status(500).json({ error: 'Base de datos no configurada' });
        
        const query = `
            INSERT INTO materials (course_id, user_id, title, description, file_url) 
            VALUES ($1, $2, $3, $4, $5) RETURNING *
        `;
        const result = await pool.query(query, [course_id, user_id, title, description, fileUrl]);
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error("Error en upload:", error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.post('/api/materials/:id/upvote', authenticateToken, async (req, res) => {
    const id = parseInt(req.params.id);
    if (!pool) return res.status(500).json({ error: 'Base de datos no configurada' });
    try {
        const result = await pool.query('UPDATE materials SET upvotes = upvotes + 1 WHERE id = $1 RETURNING upvotes', [id]);
        if (result.rows.length > 0) res.json({ success: true, upvotes: result.rows[0].upvotes });
        else res.status(404).json({ error: 'No encontrado' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor backend corriendo en puerto ${PORT}`);
});
