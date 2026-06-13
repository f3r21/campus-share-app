const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Configuración de Multer (Almacenamiento Local Mockeando DigitalOcean Spaces)
// En producción (DigitalOcean), esto se reemplazaría por AWS-SDK apuntando a Spaces
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, '-'));
    }
});
const upload = multer({ storage: storage });

// Servir archivos estáticos (para simular la descarga desde la CDN de DO Spaces)
app.use('/uploads', express.static(uploadDir));

// --- MOCK DATABASE ---
// (Usamos un Mock en memoria para garantizar que el proyecto te corra a la primera 
// sin tener que instalar y configurar PostgreSQL en tu laptop local. 
// Para el despliegue real, se usa el archivo /db/schema.sql en DO Managed Database).
let courses = [
    { id: 1, name: 'Programación I', semester: 1 },
    { id: 2, name: 'Cálculo I', semester: 1 },
    { id: 3, name: 'Base de Datos', semester: 4 },
    { id: 4, name: 'Cloud Computing', semester: 8 }
];

let materials = [
    { 
        id: 1, 
        course_id: 4, 
        title: 'Resumen Arquitecturas en la Nube', 
        description: 'Explicación de PaaS, IaaS y SaaS para el examen.', 
        file_url: '#', 
        upvotes: 15, 
        created_at: new Date() 
    }
];

// --- RUTAS DE LA API ---

app.get('/api/courses', (req, res) => {
    res.json(courses);
});

// Obtener todos los materiales subidos
app.get('/api/materials', (req, res) => {
    const result = materials.map(m => {
        const course = courses.find(c => c.id == m.course_id);
        return { ...m, course_name: course ? course.name : 'Desconocido' };
    });
    // Ordenar por más votados
    result.sort((a, b) => b.upvotes - a.upvotes);
    res.json(result);
});

// Subir un nuevo archivo
app.post('/api/materials', upload.single('file'), (req, res) => {
    try {
        const { course_id, title, description } = req.body;
        const fileUrl = req.file ? `/uploads/${req.file.filename}` : null;

        if (!fileUrl) {
            return res.status(400).json({ error: 'Se requiere adjuntar un archivo (PDF/Docx)' });
        }

        const newMaterial = {
            id: materials.length + 1,
            course_id: parseInt(course_id),
            title,
            description,
            file_url: fileUrl,
            upvotes: 0,
            created_at: new Date()
        };

        materials.push(newMaterial);
        res.status(201).json(newMaterial);
    } catch (error) {
        console.error("Error en upload:", error);
        res.status(500).json({ error: 'Error interno del servidor' });
    }
});

// Dar "Upvote" (Like) a un apunte
app.post('/api/materials/:id/upvote', (req, res) => {
    const id = parseInt(req.params.id);
    const material = materials.find(m => m.id === id);
    if (material) {
        material.upvotes += 1;
        res.json({ success: true, upvotes: material.upvotes });
    } else {
        res.status(404).json({ error: 'Apunte no encontrado' });
    }
});

// Iniciar Servidor
app.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(`🚀 Servidor Backend CampusShare corriendo en el puerto ${PORT}`);
    console.log(`🌐 API Endpoint: http://localhost:${PORT}/api/materials`);
    console.log(`⚠️  Nota: Ejecutando Mock DB para facilitar pruebas locales.`);
    console.log(`======================================================\n`);
});
