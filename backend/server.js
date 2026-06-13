const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { Pool } = require('pg');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// --- CONFIGURACIÓN DE POSTGRESQL ---
let pool = null;
if (process.env.DATABASE_URL) {
    console.log("Conectando a PostgreSQL de DigitalOcean...");
    pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false }
    });
    
    // Inicializar base de datos si está vacía
    const initDb = async () => {
        try {
            const schema = fs.readFileSync(path.join(__dirname, 'db', 'schema.sql'), 'utf8');
            await pool.query(schema);
            console.log("✅ Tablas de Base de datos PostgreSQL inicializadas.");
        } catch (error) {
            console.error("❌ Error inicializando PostgreSQL:", error.message);
        }
    };
    initDb();
} else {
    console.log("⚠️  DATABASE_URL no encontrada. Usando modo Mock en memoria para local.");
}

// --- MOCK DATABASE (Fallback local) ---
let mockCourses = [
    { id: 1, name: 'Programación I', semester: 1 },
    { id: 2, name: 'Cálculo I', semester: 1 },
    { id: 3, name: 'Base de Datos', semester: 4 },
    { id: 4, name: 'Cloud Computing', semester: 8 }
];
let mockMaterials = [];

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
    console.log("✅ DigitalOcean Spaces configurado correctamente.");
} else {
    console.log("⚠️  Credenciales de Spaces no encontradas. Las subidas se guardarán en disco local.");
}
const BUCKET_NAME = process.env.SPACES_BUCKET_NAME || "campus-share-bucket";

// --- CONFIGURACIÓN DE UPLOADS LOCAL (Multer) ---
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, '-'))
});
const upload = multer({ storage });
app.use('/uploads', express.static(uploadDir));

// --- RUTAS DE LA API ---

app.get('/api/courses', async (req, res) => {
    if (pool) {
        try {
            const result = await pool.query('SELECT * FROM courses ORDER BY semester, name');
            res.json(result.rows);
        } catch (err) { res.status(500).json({ error: err.message }); }
    } else {
        res.json(mockCourses);
    }
});

app.get('/api/materials', async (req, res) => {
    if (pool) {
        try {
            const query = `
                SELECT m.*, c.name as course_name 
                FROM materials m 
                JOIN courses c ON m.course_id = c.id 
                ORDER BY m.upvotes DESC
            `;
            const result = await pool.query(query);
            res.json(result.rows);
        } catch (err) { res.status(500).json({ error: err.message }); }
    } else {
        const result = mockMaterials.map(m => {
            const c = mockCourses.find(c => c.id == m.course_id);
            return { ...m, course_name: c ? c.name : 'Desconocido' };
        }).sort((a, b) => b.upvotes - a.upvotes);
        res.json(result);
    }
});

app.post('/api/materials', upload.single('file'), async (req, res) => {
    try {
        const { course_id, title, description } = req.body;
        if (!req.file) return res.status(400).json({ error: 'Archivo requerido' });

        let fileUrl = `/uploads/${req.file.filename}`;

        // Intentar subir a DigitalOcean Spaces si las credenciales están configuradas
        if (s3Client) {
            const fileStream = fs.createReadStream(req.file.path);
            const uploadParams = {
                Bucket: BUCKET_NAME,
                Key: req.file.filename,
                Body: fileStream,
                ACL: 'public-read' // Para que pueda ser descargado desde la URL
            };
            await s3Client.send(new PutObjectCommand(uploadParams));
            fileUrl = `https://${BUCKET_NAME}.nyc3.digitaloceanspaces.com/${req.file.filename}`;
            console.log("✅ Archivo subido exitosamente a DO Spaces:", fileUrl);
        }

        // Guardar en la Base de Datos
        if (pool) {
            const query = `
                INSERT INTO materials (course_id, title, description, file_url) 
                VALUES ($1, $2, $3, $4) RETURNING *
            `;
            const result = await pool.query(query, [course_id, title, description, fileUrl]);
            res.status(201).json(result.rows[0]);
        } else {
            const newMaterial = {
                id: mockMaterials.length + 1,
                course_id: parseInt(course_id),
                title, description, file_url: fileUrl,
                upvotes: 0, created_at: new Date()
            };
            mockMaterials.push(newMaterial);
            res.status(201).json(newMaterial);
        }
    } catch (error) {
        console.error("Error en upload:", error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

app.post('/api/materials/:id/upvote', async (req, res) => {
    const id = parseInt(req.params.id);
    if (pool) {
        try {
            const result = await pool.query('UPDATE materials SET upvotes = upvotes + 1 WHERE id = $1 RETURNING upvotes', [id]);
            if (result.rows.length > 0) res.json({ success: true, upvotes: result.rows[0].upvotes });
            else res.status(404).json({ error: 'No encontrado' });
        } catch (err) { res.status(500).json({ error: err.message }); }
    } else {
        const material = mockMaterials.find(m => m.id === id);
        if (material) {
            material.upvotes += 1;
            res.json({ success: true, upvotes: material.upvotes });
        } else {
            res.status(404).json({ error: 'No encontrado' });
        }
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Servidor backend corriendo en puerto ${PORT}`);
});
