const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { open } = require('sqlite');
const sqlite3 = require('sqlite3').verbose();
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-jwt-key-for-campus-share-ucsp';

app.use(cors());
app.use(express.json());

let db;

const initDb = async () => {
    try {
        db = await open({
            filename: path.join(__dirname, 'database.sqlite'),
            driver: sqlite3.Database
        });

        const schema = fs.readFileSync(path.join(__dirname, 'db', 'schema.sql'), 'utf8');
        const seed = fs.readFileSync(path.join(__dirname, 'db', 'seed.sql'), 'utf8');
        await db.exec(schema);
        await db.exec(seed);
        console.log("✅ Base de datos SQLite inicializada.");
    } catch (error) {
        console.error("❌ Error inicializando SQLite:", error.message);
    }
};

initDb();

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

// Healthcheck para DigitalOcean
app.get('/', (req, res) => {
    console.log("Healthcheck hit on /");
    res.status(200).send('OK');
});
app.get('/api', (req, res) => {
    console.log("Healthcheck hit on /api");
    res.status(200).send('OK');
});

app.get('/api/init', async (req, res) => {
    try {
        const schema = fs.readFileSync(path.join(__dirname, 'db', 'schema.sql'), 'utf8');
        const seed = fs.readFileSync(path.join(__dirname, 'db', 'seed.sql'), 'utf8');
        await db.exec(schema);
        await db.exec(seed);
        res.json({ message: "Base de datos inicializada correctamente" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Register Auth endpoint
app.post('/api/auth/register', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email.endsWith('@ucsp.edu.pe')) {
            return res.status(400).json({ error: "Solo se permiten correos de la UCSP" });
        }
        
        const existing = await db.get('SELECT * FROM users WHERE email = ?', [email]);
        if (existing) {
            return res.status(400).json({ error: "El correo ya está registrado" });
        }
        
        const hashedPassword = await bcrypt.hash(password, 10);
        await db.run('INSERT INTO users (email, password_hash) VALUES (?, ?)', [email, hashedPassword]);
        res.status(201).json({ message: "Usuario registrado exitosamente" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await db.get('SELECT * FROM users WHERE email = ?', [email]);
        
        if (!user || !(await bcrypt.compare(password, user.password_hash))) {
            return res.status(401).json({ error: "Credenciales inválidas" });
        }
        
        const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '24h' });
        res.json({ token, user: { id: user.id, email: user.email } });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Carreras y Cursos
app.get('/api/careers', async (req, res) => {
    try {
        const result = await db.all('SELECT * FROM careers ORDER BY name ASC');
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/courses', async (req, res) => {
    try {
        const { career_id } = req.query;
        let sql = 'SELECT * FROM courses';
        let params = [];
        if (career_id) {
            sql += ' WHERE career_id = ?';
            params.push(career_id);
        }
        sql += ' ORDER BY semester, name';
        const result = await db.all(sql, params);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Materiales
app.get('/api/materials', async (req, res) => {
    try {
        const { sort = 'upvotes', query = '' } = req.query;
        let orderBy = 'm.upvotes DESC';
        if (sort === 'newest') orderBy = 'm.created_at DESC';
        if (sort === 'oldest') orderBy = 'm.created_at ASC';

        let sql = `
            SELECT m.*, c.name as course_name, u.email as user_email
            FROM materials m
            LEFT JOIN courses c ON m.course_id = c.id
            LEFT JOIN users u ON m.user_id = u.id
        `;
        let params = [];

        if (query) {
            sql += ` WHERE m.title LIKE ? OR m.description LIKE ? OR c.name LIKE ?`;
            params = [`%${query}%`, `%${query}%`, `%${query}%`];
        }

        sql += ` ORDER BY ${orderBy}`;

        const result = await db.all(sql, params);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
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

        if (!db) return res.status(500).json({ error: 'Base de datos no configurada' });
        
        const result = await db.run(
            'INSERT INTO materials (course_id, user_id, title, description, file_url) VALUES (?, ?, ?, ?, ?)',
            [course_id, user_id, title, description, fileUrl]
        );
        const newMaterial = await db.get('SELECT * FROM materials WHERE id = ?', [result.lastID]);
        res.status(201).json(newMaterial);
    } catch (error) {
        console.error("Error en upload:", error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.post('/api/materials/:id/upvote', authenticateToken, async (req, res) => {
    const id = parseInt(req.params.id);
    if (!db) return res.status(500).json({ error: 'Base de datos no configurada' });
    try {
        await db.run('UPDATE materials SET upvotes = upvotes + 1 WHERE id = ?', [id]);
        const updated = await db.get('SELECT upvotes FROM materials WHERE id = ?', [id]);
        if (updated) res.json({ success: true, upvotes: updated.upvotes });
        else res.status(404).json({ error: 'No encontrado' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Servidor backend corriendo en puerto ${PORT} (0.0.0.0)`);
});
