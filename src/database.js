const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

let db;

function initDatabase(appDataPath) {
    // Define la ruta completa para el archivo de la base de datos
    const dbPath = path.join(appDataPath, 'asistencia-pro.db');
    console.log(`Ruta de la base de datos: ${dbPath}`);

    // Crea la conexión a la base de datos
    db = new sqlite3.Database(dbPath, (err) => {
        if (err) {
            console.error('Error al conectar con la base de datos:', err.message);
        } else {
            console.log('Conexión exitosa con la base de datos SQLite.');
            setupDatabase();
        }
    });
}

function setupDatabase() {
    // Lee el script SQL para crear las tablas
    const schemaPath = path.join(__dirname, 'sql', 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    // Ejecuta el script para crear las tablas
    db.exec(schema, (err) => {
        if (err) {
            console.error('Error al crear las tablas:', err.message);
        } else {
            console.log('Tablas creadas o ya existentes.');
        }
    });
}

function getDB() {
    if (!db) {
        throw new Error('La base de datos no ha sido inicializada. Llama a initDatabase() primero.');
    }
    return db;
}

// --- Funciones CRUD para Grupos ---

// Añadir un nuevo grupo
function addGroup(group) {
    const { group_name, subject_name, start_date, end_date, class_days, partial1_end_date } = group;
    const sql = `INSERT INTO Groups (group_name, subject_name, start_date, end_date, class_days, partial1_end_date)
                 VALUES (?, ?, ?, ?, ?, ?)`;
    return new Promise((resolve, reject) => {
        db.run(sql, [group_name, subject_name, start_date, end_date, class_days, partial1_end_date], function(err) {
            if (err) {
                console.error('Error al añadir grupo:', err.message);
                reject(err);
            } else {
                console.log(`Grupo añadido con ID: ${this.lastID}`);
                resolve({ id: this.lastID });
            }
        });
    });
}

// Obtener todos los grupos
function getGroups() {
    const sql = `SELECT * FROM Groups ORDER BY group_name ASC`;
    return new Promise((resolve, reject) => {
        db.all(sql, [], (err, rows) => {
            if (err) {
                console.error('Error al obtener grupos:', err.message);
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
}

// Actualizar un grupo existente
function updateGroup(group) {
    const { id, group_name, subject_name, start_date, end_date, class_days, partial1_end_date } = group;
    const sql = `UPDATE Groups
                 SET group_name = ?, subject_name = ?, start_date = ?, end_date = ?, class_days = ?, partial1_end_date = ?
                 WHERE id = ?`;
    return new Promise((resolve, reject) => {
        db.run(sql, [group_name, subject_name, start_date, end_date, class_days, partial1_end_date, id], function(err) {
            if (err) {
                console.error('Error al actualizar grupo:', err.message);
                reject(err);
            } else {
                console.log(`Grupo con ID ${id} actualizado.`);
                resolve({ changes: this.changes });
            }
        });
    });
}

// Obtener un grupo por su ID
function getGroupById(id) {
    const sql = `SELECT * FROM Groups WHERE id = ?`;
    return new Promise((resolve, reject) => {
        db.get(sql, [id], (err, row) => {
            if (err) {
                console.error(`Error al obtener el grupo ${id}:`, err.message);
                reject(err);
            }
            else resolve(row);
        });
    });
}

// Eliminar un grupo
function deleteGroup(id) {
    const sql = `DELETE FROM Groups WHERE id = ?`;
    return new Promise((resolve, reject) => {
        db.run(sql, [id], function(err) {
            if (err) {
                console.error('Error al eliminar grupo:', err.message);
                reject(err);
            } else {
                console.log(`Grupo con ID ${id} eliminado.`);
                resolve({ changes: this.changes });
            }
        });
    });
}

// --- Funciones CRUD para Alumnos ---

// Añadir un nuevo alumno
function addStudent(student) {
    const { student_name, student_id, group_id } = student;
    const sql = `INSERT INTO Students (student_name, student_id, group_id) VALUES (?, ?, ?)`;
    return new Promise((resolve, reject) => {
        db.run(sql, [student_name, student_id, group_id], function(err) {
            if (err) reject(err);
            else resolve({ id: this.lastID });
        });
    });
}

// Obtener todos los alumnos de un grupo
function getStudentsByGroup(groupId) {
    const sql = `SELECT * FROM Students WHERE group_id = ? ORDER BY student_name ASC`;
    return new Promise((resolve, reject) => {
        db.all(sql, [groupId], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

// Actualizar un alumno
function updateStudent(student) {
    const { id, student_name, student_id } = student;
    const sql = `UPDATE Students SET student_name = ?, student_id = ? WHERE id = ?`;
    return new Promise((resolve, reject) => {
        db.run(sql, [student_name, student_id, id], function(err) {
            if (err) reject(err);
            else resolve({ changes: this.changes });
        });
    });
}

// Eliminar un alumno
function deleteStudent(id) {
    const sql = `DELETE FROM Students WHERE id = ?`;
    return new Promise((resolve, reject) => {
        db.run(sql, [id], function(err) {
            if (err) reject(err);
            else resolve({ changes: this.changes });
        });
    });
}

// --- Funciones para Asistencia ---

// Obtener todos los registros de asistencia para un grupo
// Esto se usa para rellenar la tabla de asistencia al cargarla
function getAttendance(groupId) {
    const sql = `
        SELECT a.student_id, a.attendance_date, a.status
        FROM Attendance a
        JOIN Students s ON a.student_id = s.id
        WHERE s.group_id = ?
    `;
    return new Promise((resolve, reject) => {
        db.all(sql, [groupId], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

// Crear o actualizar un registro de asistencia (upsert)
function upsertAttendance(record) {
    const { student_id, attendance_date, status } = record;
    // La sentencia ON CONFLICT(student_id, attendance_date) requiere el índice UNIQUE en la tabla
    const sql = `
        INSERT INTO Attendance (student_id, attendance_date, status)
        VALUES (?, ?, ?)
        ON CONFLICT(student_id, attendance_date) DO UPDATE SET
        status = excluded.status
    `;
    return new Promise((resolve, reject) => {
        db.run(sql, [student_id, attendance_date, status], function(err) {
            if (err) reject(err);
            else resolve({ changes: this.changes });
        });
    });
}

// --- Funciones para el Dashboard ---

// Obtener las clases programadas para el día actual
function getTodaysClasses() {
    const todayWeekday = new Date().getDay().toString();
    const sql = `
        SELECT * FROM Groups
        WHERE class_days LIKE ?
          AND date('now', 'localtime') BETWEEN start_date AND end_date
    `;
    return new Promise((resolve, reject) => {
        db.all(sql, [`%${todayWeekday}%`], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

// Obtener todas las fechas donde se ha registrado asistencia, agrupadas por grupo
function getRecordedAttendanceDates() {
    const sql = `
        SELECT s.group_id, a.attendance_date
        FROM Attendance a
        JOIN Students s ON a.student_id = s.id
        GROUP BY s.group_id, a.attendance_date
    `;
    return new Promise((resolve, reject) => {
        db.all(sql, [], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}


// --- Funciones para Operaciones en Lote ---

// Borrar asistencias que no coinciden con los nuevos días de clase
function deleteAttendanceOnScheduleChange(groupId, validClassDays) {
    // Construye la parte de la cláusula IN para los días válidos
    const placeholders = validClassDays.map(() => '?').join(',');

    // strftime('%w', ...) devuelve el día de la semana (0=Domingo, 1=Lunes, ..., 6=Sábado)
    const sql = `
        DELETE FROM Attendance
        WHERE student_id IN (SELECT id FROM Students WHERE group_id = ?)
          AND strftime('%w', attendance_date) NOT IN (${placeholders})
    `;

    const params = [groupId, ...validClassDays];

    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) {
                console.error('Error al borrar asistencias obsoletas:', err.message);
                reject(err);
            } else {
                console.log(`${this.changes} registros de asistencia obsoletos eliminados.`);
                resolve({ changes: this.changes });
            }
        });
    });
}

// Añadir multiples alumnos en una transacción
function addMultipleStudents(students) {
    const sql = `INSERT INTO Students (student_name, student_id, group_id) VALUES (?, ?, ?)`;

    return new Promise((resolve, reject) => {
        db.serialize(() => {
            db.run('BEGIN TRANSACTION', (err) => { if (err) return reject(err); });

            const stmt = db.prepare(sql);
            let errorOccurred = false;

            students.forEach(student => {
                stmt.run(student.student_name, student.student_id, student.group_id, function(err) {
                    if (err) {
                        console.error('Error al añadir alumno en lote:', err.message);
                        errorOccurred = true;
                    }
                });
            });

            stmt.finalize((err) => {
                if (err) {
                    db.run('ROLLBACK');
                    return reject(err);
                }

                if (errorOccurred) {
                    db.run('ROLLBACK');
                    reject(new Error('Ocurrió un error al insertar uno o más alumnos.'));
                } else {
                    db.run('COMMIT', (commitErr) => {
                        if (commitErr) {
                            db.run('ROLLBACK');
                            return reject(commitErr);
                        }
                        resolve({ success: true, count: students.length });
                    });
                }
            });
        });
    });
}


module.exports = {
    initDatabase,
    getDB,
    addGroup,
    getGroups,
    updateGroup,
    deleteGroup,
    addStudent,
    getStudentsByGroup,
    updateStudent,
    deleteStudent,
    getAttendance,
    upsertAttendance,
    addMultipleStudents,
    getGroupById,
    deleteAttendanceOnScheduleChange,
    getTodaysClasses,
    getRecordedAttendanceDates,
};