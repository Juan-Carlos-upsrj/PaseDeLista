// main.js
// Módulos para controlar el ciclo de vida de la aplicación y crear ventanas de navegador nativas.
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

// --- CONFIGURACIÓN DE LA BASE DE DATOS ---
// Define la ruta de la base de datos en la carpeta de datos del usuario.
const dbPath = path.join(app.getPath('userData'), 'asistencia_pro.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error("Error abriendo la base de datos", err.message);
    } else {
        console.log("Conectado a la base de datos SQLite.");
        // Habilitar claves foráneas
        db.run("PRAGMA foreign_keys = ON;", (pragmaErr) => {
            if (pragmaErr) console.error("Error habilitando PRAGMA foreign_keys", pragmaErr.message);
        });
        // Crear tablas si no existen
        createTables();
    }
});

// Función para crear las tablas de la base de datos.
function createTables() {
    const sql = `
        CREATE TABLE IF NOT EXISTS Groups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            group_name TEXT NOT NULL,
            subject_name TEXT NOT NULL,
            start_date TEXT,
            end_date TEXT,
            class_days TEXT,
            partial1_end_date TEXT
        );

        CREATE TABLE IF NOT EXISTS Students (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_name TEXT NOT NULL,
            student_id TEXT,
            group_id INTEGER,
            FOREIGN KEY (group_id) REFERENCES Groups (id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS Attendance (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id INTEGER NOT NULL,
            attendance_date TEXT NOT NULL,
            status TEXT NOT NULL CHECK(status IN ('Presente', 'Ausente', 'Retardo')),
            FOREIGN KEY (student_id) REFERENCES Students (id) ON DELETE CASCADE,
            UNIQUE(student_id, attendance_date)
        );

        CREATE TABLE IF NOT EXISTS Settings (
            key TEXT PRIMARY KEY,
            value TEXT
        );
    `;
    db.exec(sql, (err) => {
        if (err) {
            console.error("Error creando tablas", err.message);
        } else {
            console.log("Tablas verificadas/creadas correctamente.");
        }
    });
}


// --- GESTIÓN DE LA VENTANA PRINCIPAL ---
function createWindow() {
    // Crea la ventana del navegador.
    const mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 940,
        minHeight: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    // Carga el index.html de la app.
    mainWindow.loadFile('index.html');

    // Abre las DevTools (opcional).
    // mainWindow.webContents.openDevTools();
}

// Este método será llamado cuando Electron haya finalizado
// la inicialización y esté listo para crear ventanas de navegador.
app.whenReady().then(createWindow);

// Salir cuando todas las ventanas estén cerradas (excepto en macOS).
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        db.close(); // Cierra la conexión a la BD
        app.quit();
    }
});

app.on('activate', () => {
    // En macOS, es común recrear una ventana en la app cuando el
    // ícono del dock es presionado y no hay otras ventanas abiertas.
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});


// --- COMUNICACIÓN CON EL RENDERER PROCESS (IPC) ---
// En este archivo puedes incluir el resto de la lógica del proceso principal de tu app.
// Aquí manejamos todas las interacciones con la base de datos.

// Función genérica para consultas SELECT (devuelve todas las filas)
function dbAll(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

// Función genérica para consultas INSERT, UPDATE, DELETE (devuelve info de la ejecución)
function dbRun(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function(err) {
            if (err) reject(err);
            else resolve({ lastID: this.lastID, changes: this.changes });
        });
    });
}

// --- GRUPOS ---
ipcMain.handle('get-groups', async () => await dbAll('SELECT * FROM Groups ORDER BY group_name'));
ipcMain.handle('add-group', async (event, group) => {
    const { name, subject, startDate, endDate, classDays, partial1EndDate } = group;
    return await dbRun(
        'INSERT INTO Groups (group_name, subject_name, start_date, end_date, class_days, partial1_end_date) VALUES (?, ?, ?, ?, ?, ?)',
        [name, subject, startDate, endDate, classDays.join(','), partial1EndDate]
    );
});
ipcMain.handle('update-group', async (event, group) => {
    const { id, name, subject, startDate, endDate, classDays, partial1EndDate } = group;
    return await dbRun(
        'UPDATE Groups SET group_name = ?, subject_name = ?, start_date = ?, end_date = ?, class_days = ?, partial1_end_date = ? WHERE id = ?',
        [name, subject, startDate, endDate, classDays.join(','), partial1EndDate, id]
    );
});
ipcMain.handle('delete-group', async (event, id) => await dbRun('DELETE FROM Groups WHERE id = ?', [id]));
ipcMain.handle('get-group-by-id', async (event, id) => {
    return new Promise((resolve, reject) => {
        db.get('SELECT * FROM Groups WHERE id = ?', [id], (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
});


// --- ALUMNOS ---
ipcMain.handle('get-students', async (event, groupId) => await dbAll('SELECT * FROM Students WHERE group_id = ? ORDER BY student_name', [groupId]));
ipcMain.handle('add-student', async (event, { name, studentId, groupId }) => {
    return await dbRun(
        'INSERT INTO Students (student_name, student_id, group_id) VALUES (?, ?, ?)',
        [name, studentId || null, groupId]
    );
});
ipcMain.handle('add-multiple-students', async (event, { students, groupId }) => {
    const stmt = db.prepare('INSERT INTO Students (student_name, student_id, group_id) VALUES (?, ?, ?)');
    let changes = 0;
    for (const student of students) {
        await new Promise((resolve, reject) => {
            stmt.run([student.name, student.id || null, groupId], function(err) {
                if(err) reject(err);
                changes += this.changes;
                resolve();
            });
        });
    }
    stmt.finalize();
    return { changes };
});
ipcMain.handle('delete-student', async (event, id) => await dbRun('DELETE FROM Students WHERE id = ?', [id]));

// --- ASISTENCIA ---
ipcMain.handle('get-attendance', async (event, groupId) => {
    const sql = `
        SELECT a.student_id, a.attendance_date, a.status
        FROM Attendance a
        JOIN Students s ON s.id = a.student_id
        WHERE s.group_id = ?
    `;
    return await dbAll(sql, [groupId]);
});
ipcMain.handle('set-attendance', async (event, { studentId, date, status }) => {
    // 'INSERT OR REPLACE' (UPSERT) para insertar o actualizar si ya existe.
    const sql = 'INSERT OR REPLACE INTO Attendance (student_id, attendance_date, status) VALUES (?, ?, ?)';
    return await dbRun(sql, [studentId, date, status]);
});


// --- CONFIGURACIÓN ---
ipcMain.handle('get-settings', async () => {
    const rows = await dbAll('SELECT * FROM Settings');
    // Convertir el array de filas en un objeto clave-valor
    return rows.reduce((acc, setting) => {
        acc[setting.key] = setting.value;
        return acc;
    }, {});
});
ipcMain.handle('save-setting', async (event, { key, value }) => {
    const sql = 'INSERT OR REPLACE INTO Settings (key, value) VALUES (?, ?)';
    return await dbRun(sql, [key, value]);
});


// --- LÓGICA DEL DASHBOARD ---
ipcMain.handle('check-pending-attendance', async () => {
    const groups = await dbAll('SELECT * FROM Groups');
    const pendingNotifications = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Normalizar a la medianoche

    for (const group of groups) {
        if (!group.start_date || !group.end_date || !group.class_days) continue;

        const startDate = new Date(group.start_date);
        const classDays = group.class_days.split(',').map(Number);
        
        // Iterar desde el inicio de clases hasta ayer
        for (let d = startDate; d < today; d.setDate(d.getDate() + 1)) {
            const currentDate = new Date(d); // Clonar fecha para no modificar la original
            const dayOfWeek = currentDate.getDay();

            if (classDays.includes(dayOfWeek)) {
                const dateString = currentDate.toISOString().split('T')[0];
                const sql = `
                    SELECT COUNT(*) as count 
                    FROM Attendance a
                    JOIN Students s ON s.id = a.student_id
                    WHERE s.group_id = ? AND a.attendance_date = ?`;

                const result = await new Promise((resolve, reject) => {
                    db.get(sql, [group.id, dateString], (err, row) => {
                        if (err) reject(err);
                        else resolve(row);
                    });
                });
                
                if (result.count === 0) {
                     pendingNotifications.push({
                        groupName: `${group.group_name} - ${group.subject_name}`,
                        date: dateString
                    });
                }
            }
        }
    }
    return pendingNotifications;
});
