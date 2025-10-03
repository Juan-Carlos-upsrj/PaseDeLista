// main.js
// Módulos para controlar el ciclo de vida de la aplicación y crear ventanas de navegador nativas.
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

// --- CONFIGURACIÓN DE LA BASE DE DATOS Y MIGRACIÓN ÚNICA ---

// 1. Definir la ruta de datos permanente y neutral en la carpeta de Documentos.
const permanentDataPath = path.join(app.getPath('documents'), 'AsistenciaApp-Data');
const dbPath = path.join(permanentDataPath, 'asistencia.db');
const migrationLockFile = path.join(permanentDataPath, '.migrated');

// 2. Realizar la migración de la ubicación de la base de datos si es necesario.
// Esta función se ejecuta de forma síncrona al inicio para garantizar que la BD esté en su sitio antes de conectarse.
function runDataLocationMigration() {
    if (fs.existsSync(migrationLockFile)) {
        console.log('La migración de la ubicación de datos ya se realizó. Omitiendo.');
        return;
    }

    if (!fs.existsSync(permanentDataPath)) {
        fs.mkdirSync(permanentDataPath, { recursive: true });
    }

    const appData = app.getPath('appData');
    // This path is an educated guess based on user feedback for where the app might be installed.
    const localProgramsPath = path.join(path.dirname(app.getPath('cache')), 'Programs');

    const oldDbPaths = [
        // Standard AppData/Roaming paths
        path.join(appData, 'Asistencia Pro', 'asistencia_pro.db'),
        path.join(appData, 'Asistencias IAEV', 'asistencia_pro.db'),
        // Paths from user feedback (installation directories)
        path.join(localProgramsPath, 'asistencia-pro', 'asistencia_pro.db'),
        path.join(localProgramsPath, 'asistencia-iaev', 'asistencia_pro.db')
    ];

    let sourceDbPath = null;
    let mostRecentTime = 0;

    oldDbPaths.forEach(p => {
        if (fs.existsSync(p)) {
            try {
                const stats = fs.statSync(p);
                if (stats.mtimeMs > mostRecentTime) {
                    mostRecentTime = stats.mtimeMs;
                    sourceDbPath = p;
                }
            } catch (err) {
                console.error(`Error al acceder a la base de datos antigua en ${p}:`, err);
            }
        }
    });

    if (sourceDbPath) {
        console.log(`Migrando la base de datos más reciente desde: ${sourceDbPath}`);
        try {
            fs.copyFileSync(sourceDbPath, dbPath);
            console.log('Base de datos migrada a la nueva ubicación permanente con éxito.');
        } catch (err) {
            console.error('Error al migrar el archivo de la base de datos:', err);
            return;
        }
    } else {
        console.log('No se encontraron bases de datos antiguas. Se creará una nueva si es necesario.');
    }

    try {
        fs.writeFileSync(migrationLockFile, new Date().toISOString());
    } catch (err) {
        console.error('Error al crear el archivo de bloqueo de migración:', err);
    }
}

// Ejecutar la migración de ubicación ANTES de cualquier otra cosa.
runDataLocationMigration();

// 3. Conectar a la base de datos en la ubicación permanente.
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error("Error abriendo la base de datos", err.message);
    } else {
        console.log("Conectado a la base de datos SQLite en la ubicación permanente.");
        db.run("PRAGMA foreign_keys = ON;", (pragmaErr) => {
            if (pragmaErr) console.error("Error habilitando PRAGMA foreign_keys", pragmaErr.message);
        });
        // Solo crear tablas si no existen. No se hacen más migraciones de esquema.
        createTables();
    }
});

// Función para crear las tablas de la base de datos si no existen.
function createTables() {
    const sql = `
        CREATE TABLE IF NOT EXISTS Groups (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            group_name TEXT NOT NULL,
            subject_name TEXT NOT NULL,
            class_days TEXT
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
    return new Promise((resolve, reject) => {
         db.exec(sql, (err) => {
            if (err) {
                console.error("Error creando tablas", err.message);
                reject(err);
            } else {
                console.log("Tablas verificadas/creadas correctamente.");
                resolve();
            }
        });
    });
}

// --- GESTIÓN DE LA VENTANA PRINCIPAL ---
function createWindow() {
    const mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 940,
        minHeight: 600,
        icon: path.join(__dirname, 'assets/icon.png'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    });

    mainWindow.loadFile('index.html');
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        db.close();
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});


// --- COMUNICACIÓN CON EL RENDERER PROCESS (IPC) ---
function dbAll(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

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
    const { name, subject, classDays } = group;
    return await dbRun(
        'INSERT INTO Groups (group_name, subject_name, class_days) VALUES (?, ?, ?)',
        [name, subject, classDays.join(',')]
    );
});
ipcMain.handle('update-group', async (event, group) => {
    const { id, name, subject, classDays } = group;
    return await dbRun(
        'UPDATE Groups SET group_name = ?, subject_name = ?, class_days = ? WHERE id = ?',
        [name, subject, classDays.join(','), id]
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
    const sql = 'INSERT OR REPLACE INTO Attendance (student_id, attendance_date, status) VALUES (?, ?, ?)';
    return await dbRun(sql, [studentId, date, status]);
});


// --- CONFIGURACIÓN ---
ipcMain.handle('get-settings', async () => {
    const rows = await dbAll('SELECT * FROM Settings');
    return rows.reduce((acc, setting) => {
        acc[setting.key] = setting.value;
        return acc;
    }, {});
});
ipcMain.handle('save-setting', async (event, { key, value }) => {
    const sql = 'INSERT OR REPLACE INTO Settings (key, value) VALUES (?, ?)';
    return await dbRun(sql, [key, value]);
});


// --- EXPORTACIÓN ---
ipcMain.handle('export-csv', async (event, data) => {
    const { filePath } = await dialog.showSaveDialog({
        title: 'Exportar a CSV',
        defaultPath: `reporte-asistencia.csv`,
        filters: [{ name: 'CSV Files', extensions: ['csv'] }]
    });

    if (filePath) {
        let csvContent = "Matricula,Alumno,Asistencias,Retardos,Faltas,% Asistencia\n";
        data.forEach(row => {
            csvContent += `${row.studentId || ''},${row.studentName},${row.presente},${row.retardo},${row.ausente},${row.percentage}%\n`;
        });

        try {
            fs.writeFileSync(filePath, csvContent, 'utf-8');
            return { success: true, path: filePath };
        } catch (err) {
            console.error("Error guardando el archivo CSV:", err);
            return { success: false, error: err.message };
        }
    }
    return { success: false, cancelled: true };
});

ipcMain.handle('export-pdf', async (event, data) => {
    const { filePath } = await dialog.showSaveDialog({
        title: 'Exportar a PDF',
        defaultPath: `reporte-asistencia.pdf`,
        filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
    });

    if (filePath) {
        let tableHTML = `
            <style>
                body { font-family: sans-serif; }
                table { width: 100%; border-collapse: collapse; }
                th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
                thead { background-color: #f2f2f2; }
                .low-attendance { background-color: #fffbeb; }
            </style>
            <h1>Reporte de Asistencia</h1>
            <table>
                <thead>
                    <tr>
                        <th>Matrícula</th>
                        <th>Alumno</th>
                        <th>Asistencias</th>
                        <th>Retardos</th>
                        <th>Faltas</th>
                        <th>% Asistencia</th>
                    </tr>
                </thead>
                <tbody>
        `;
        data.forEach(row => {
            const lowAttendanceClass = parseFloat(row.percentage) <= 80.0 ? 'class="low-attendance"' : '';
            tableHTML += `
                <tr ${lowAttendanceClass}>
                    <td>${row.studentId || ''}</td>
                    <td>${row.studentName}</td>
                    <td>${row.presente}</td>
                    <td>${row.retardo}</td>
                    <td>${row.ausente}</td>
                    <td>${row.percentage}%</td>
                </tr>
            `;
        });
        tableHTML += '</tbody></table>';

        const pdfWindow = new BrowserWindow({ show: false });
        await pdfWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(tableHTML)}`);

        try {
            const pdfData = await pdfWindow.webContents.printToPDF({
                marginsType: 0,
                pageSize: 'A4',
                printBackground: true,
                printSelectionOnly: false,
                landscape: false
            });
            fs.writeFileSync(filePath, pdfData);
            pdfWindow.close();
            return { success: true, path: filePath };
        } catch(err) {
            console.error("Error generando PDF:", err);
            pdfWindow.close();
            return { success: false, error: err.message };
        }
    }
    return { success: false, cancelled: true };
});

// --- LÓGICA DEL DASHBOARD ---
ipcMain.handle('get-today-classes', async () => {
    const settingsRows = await dbAll('SELECT key, value FROM Settings WHERE key IN ("globalStartDate", "globalEndDate")');
    const globalStartDate = settingsRows.find(s => s.key === 'globalStartDate')?.value;
    const globalEndDate = settingsRows.find(s => s.key === 'globalEndDate')?.value;

    if (!globalStartDate || !globalEndDate) {
        return [];
    }

    const today = new Date();
    const todayString = today.toISOString().split('T')[0];
    const dayOfWeek = today.getDay();

    const sql = `
        SELECT group_name, subject_name
        FROM Groups
        WHERE ? >= ? AND ? <= ?
          AND class_days LIKE ?
    `;

    return await dbAll(sql, [todayString, globalStartDate, todayString, globalEndDate, `%${dayOfWeek}%`]);
});

ipcMain.handle('check-pending-attendance', async () => {
    const settingsRows = await dbAll('SELECT key, value FROM Settings WHERE key IN ("globalStartDate", "globalEndDate")');
    const globalStartDate = settingsRows.find(s => s.key === 'globalStartDate')?.value;
    const globalEndDate = settingsRows.find(s => s.key === 'globalEndDate')?.value;


    if (!globalStartDate || !globalEndDate) {
        return [];
    }

    const groups = await dbAll('SELECT * FROM Groups');
    const pendingGroups = new Set();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const group of groups) {
        if (!group.class_days) continue;

        const startDate = new Date(globalStartDate);
        const endDate = new Date(globalEndDate);
        const classDays = group.class_days.split(',').map(Number);

        for (let d = new Date(startDate); d < today && d <= endDate; d.setDate(d.getDate() + 1)) {
            const dayOfWeek = d.getDay();

            if (classDays.includes(dayOfWeek)) {
                const dateString = d.toISOString().split('T')[0];
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
                    pendingGroups.add(`${group.group_name} - ${group.subject_name}`);
                    break;
                }
            }
        }
    }
    return Array.from(pendingGroups);
});