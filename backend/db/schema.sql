-- Esquema de Base de Datos para CampusShare (PostgreSQL)
-- Diseñado para DigitalOcean Managed Databases

CREATE TABLE IF NOT EXISTS courses (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    semester INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS materials (
    id SERIAL PRIMARY KEY,
    course_id INTEGER REFERENCES courses(id),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    file_url VARCHAR(512) NOT NULL,
    upvotes INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Datos de prueba por defecto
INSERT INTO courses (name, semester) VALUES 
('Programación I', 1), 
('Cálculo I', 1), 
('Base de Datos', 4),
('Cloud Computing', 8)
ON CONFLICT DO NOTHING;
