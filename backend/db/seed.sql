INSERT INTO careers (id, name) VALUES 
(1, 'Ciencia de la Computación'),
(2, 'Administración de Negocios'),
(3, 'Ingeniería Civil'),
(4, 'Derecho'),
(5, 'Arquitectura y Urbanismo'),
(6, 'Medicina Humana')
ON CONFLICT DO NOTHING;

INSERT INTO courses (career_id, name, semester) VALUES 
-- Ciencia de la Computación
(1, 'Programación I', 1),
(1, 'Cálculo I', 1),
(1, 'Estructuras de Datos', 3),
(1, 'Base de Datos', 4),
(1, 'Cloud Computing', 8),
-- Administración de Negocios
(2, 'Fundamentos de Administración', 1),
(2, 'Contabilidad General', 2),
(2, 'Marketing', 4),
(2, 'Finanzas Corporativas', 6),
-- Ingeniería Civil
(3, 'Dibujo de Ingeniería', 1),
(3, 'Estática', 3),
(3, 'Resistencia de Materiales', 4),
(3, 'Diseño en Acero', 8),
-- Derecho
(4, 'Introducción al Derecho', 1),
(4, 'Derecho Constitucional', 3),
(4, 'Derecho Penal I', 5),
(4, 'Derecho Procesal Civil', 7),
-- Arquitectura y Urbanismo
(5, 'Taller de Diseño Básico', 1),
(5, 'Historia de la Arquitectura', 2),
(5, 'Urbanismo I', 6),
-- Medicina Humana
(6, 'Anatomía Humana', 1),
(6, 'Fisiología', 3),
(6, 'Farmacología', 5)
ON CONFLICT DO NOTHING;
