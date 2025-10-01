-- Esquema para la base de datos de Asistencia Pro 2.0

-- Tabla para gestionar los grupos/clases
CREATE TABLE IF NOT EXISTS Groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_name TEXT NOT NULL,
    subject_name TEXT NOT NULL,
    start_date TEXT NOT NULL, -- Formato 'YYYY-MM-DD'
    end_date TEXT NOT NULL, -- Formato 'YYYY-MM-DD'
    class_days TEXT NOT NULL, -- Ej: "1,3,5" para Lunes, Miércoles, Viernes
    partial1_end_date TEXT NOT NULL -- Formato 'YYYY-MM-DD'
);

-- Tabla para gestionar los alumnos
CREATE TABLE IF NOT EXISTS Students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_name TEXT NOT NULL,
    student_id TEXT, -- Matrícula, puede ser NULL
    group_id INTEGER NOT NULL,
    FOREIGN KEY (group_id) REFERENCES Groups(id) ON DELETE CASCADE
);

-- Tabla para registrar la asistencia
CREATE TABLE IF NOT EXISTS Attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL,
    attendance_date TEXT NOT NULL, -- Formato 'YYYY-MM-DD'
    status TEXT NOT NULL CHECK(status IN ('Presente', 'Ausente', 'Retardo')),
    FOREIGN KEY (student_id) REFERENCES Students(id) ON DELETE CASCADE,
    UNIQUE(student_id, attendance_date) -- Asegura que solo haya un registro por alumno por fecha
);