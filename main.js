// main.js
// Módulos para controlar el ciclo de vida de la aplicación y crear ventanas de navegador nativas.
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

// --- DATOS DE PROFESORES ---
// En una aplicación real, esto vendría de una base de datos o un archivo de configuración.
const teachers = [
    { name: 'Prof. Armando', birthdate: '10-28' },
    { name: 'Profa. Brenda', birthdate: '11-05' },
    { name: 'Prof. Carlos', birthdate: '10-21' },
    { name: 'Profa. Diana', birthdate: '01-01' },
    { name: 'Prof. Esteban', birthdate: '10-25' },
];

// --- CONFIGURACIÓN DE LA BASE DE DATOS ---
// Establece la ubicación de la base de datos en la carpeta de Documentos del usuario para un acceso fácil y seguro.
const dataPath = path.join(app.getPath('documents'), 'AsistenciaApp-Data');

// Asegurarse de que el directorio de datos exista.
if (!fs.existsSync(dataPath)) {
    try {
        fs.mkdirSync(dataPath, { recursive: true });
        console.log(`Directorio de datos creado en: ${dataPath}`);
    } catch (err) {
        console.error('Error al crear el directorio de datos:', err);
        dialog.showErrorBox('Error Crítico', `No se pudo crear la carpeta de datos en ${dataPath}. La aplicación se cerrará.`);
        app.quit();
        process.exit(1);
    }
}

const dbPath = path.join(dataPath, 'asistencia.db');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error("Error abriendo la base de datos", err.message);
        dialog.showErrorBox('Error de Base de Datos', `No se pudo abrir la base de datos en ${dbPath}.\n\nError: ${err.message}`);
        app.quit();
    } else {
        console.log(`Conectado exitosamente a la base de datos en: ${dbPath}`);
        db.run("PRAGMA foreign_keys = ON;", (pragmaErr) => {
            if (pragmaErr) console.error("Error habilitando PRAGMA foreign_keys", pragmaErr.message);
        });
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
            status TEXT NOT NULL CHECK(status IN ('Presente', 'Ausente', 'Retardo', 'Intercambio', 'Justificada')),
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

// --- MIGRACIÓN DE BASE DE DATOS ---
// Script de migración robusto para actualizar la tabla de Asistencia.
async function runMigrations() {
    return new Promise(async (resolve, reject) => {
        try {
            const tableInfo = await dbAll("SELECT sql FROM sqlite_master WHERE type='table' AND name='Attendance'");

            // Si la tabla no existe o ya tiene el esquema nuevo (incluye 'Justificada'), no se necesita migración.
            if (tableInfo.length === 0 || (tableInfo[0].sql && tableInfo[0].sql.includes('Justificada'))) {
                return resolve();
            }

            console.log("Esquema de base de datos antiguo detectado. Iniciando migración...");

            // Este script se ejecuta como una única transacción. Si cualquier paso falla,
            // la base de datos revierte todos los cambios, previniendo la corrupción.
            const migrationScript = `
                BEGIN TRANSACTION;

                -- En caso de una migración fallida anterior, la tabla temporal podría existir. La eliminamos.
                DROP TABLE IF EXISTS Attendance_old;

                -- Renombramos la tabla actual para respaldar los datos.
                ALTER TABLE Attendance RENAME TO Attendance_old;

                -- Creamos la nueva tabla con el esquema correcto y todas las constraints.
                CREATE TABLE Attendance (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    student_id INTEGER NOT NULL,
                    attendance_date TEXT NOT NULL,
                    status TEXT NOT NULL CHECK(status IN ('Presente', 'Ausente', 'Retardo', 'Intercambio', 'Justificada')),
                    FOREIGN KEY (student_id) REFERENCES Students (id) ON DELETE CASCADE,
                    UNIQUE(student_id, attendance_date)
                );

                -- Copiamos los datos válidos desde la tabla antigua a la nueva.
                INSERT INTO Attendance(id, student_id, attendance_date, status)
                SELECT id, student_id, attendance_date, status FROM Attendance_old WHERE status IN ('Presente', 'Ausente', 'Retardo');

                -- Eliminamos la tabla de respaldo una vez que los datos han sido copiados.
                DROP TABLE Attendance_old;

                COMMIT;
            `;

            // db.exec ejecuta todo el script. Si hay un error, automáticamente hace ROLLBACK.
            db.exec(migrationScript, (err) => {
                if (err) {
                    console.error("Falló la migración de la base de datos. La transacción fue revertida.", err);
                    reject(err);
                } else {
                    console.log("Migración de la base de datos completada exitosamente.");
                    resolve();
                }
            });

        } catch (err) {
            console.error("Error crítico durante la preparación de la migración:", err);
            reject(err);
        }
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

app.whenReady().then(async () => {
    try {
        await runMigrations();
        createWindow();
    } catch (err) {
        dialog.showErrorBox('Error Crítico de Migración', `No se pudo actualizar la base de datos a la última versión. La aplicación se cerrará.\n\nError: ${err.message}`);
        app.quit();
    }
});

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
ipcMain.handle('get-student-by-id', async (event, id) => {
    return await dbAll('SELECT * FROM Students WHERE id = ?', [id]).then(rows => rows[0]);
});
ipcMain.handle('update-student', async (event, { id, name, studentId }) => {
    return await dbRun(
        'UPDATE Students SET student_name = ?, student_id = ? WHERE id = ?',
        [name, studentId || null, id]
    );
});

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

ipcMain.handle('delete-attendance', async (event, { studentId, date }) => {
    const sql = 'DELETE FROM Attendance WHERE student_id = ? AND attendance_date = ?';
    return await dbRun(sql, [studentId, date]);
});

// Replaces the old bulk update logic with a more robust transactional approach.
ipcMain.handle('save-roll-call', async (event, { groupId, date, attendances }) => {
    // Get all student IDs for the group to ensure we are only deleting records for this group.
    const studentsInGroup = await dbAll('SELECT id FROM Students WHERE group_id = ?', [groupId]);
    const studentIds = studentsInGroup.map(s => s.id);

    if (studentIds.length === 0) {
        return { success: true, changes: 0 }; // No students, nothing to do.
    }

    const deleteSql = `DELETE FROM Attendance WHERE student_id IN (${studentIds.map(() => '?').join(',')}) AND attendance_date = ?`;
    const insertSql = 'INSERT INTO Attendance (student_id, attendance_date, status) VALUES (?, ?, ?)';

    await dbRun('BEGIN TRANSACTION');
    try {
        // 1. Delete all existing records for this group on this date.
        await dbRun(deleteSql, [...studentIds, date]);

        // 2. Insert new records for students who don't have a 'Pendiente' status.
        const filteredAttendances = attendances.filter(att => att.status !== 'Pendiente');
        const stmt = db.prepare(insertSql);
        for (const att of filteredAttendances) {
             await new Promise((resolve, reject) => {
                stmt.run(att.studentId, date, att.status, (err) => {
                    if (err) return reject(err);
                    resolve();
                });
            });
        }
        await new Promise((resolve, reject) => stmt.finalize(err => err ? reject(err) : resolve()));

        await dbRun('COMMIT');
        return { success: true, changes: filteredAttendances.length };
    } catch (error) {
        console.error('Error during save-roll-call, rolling back transaction.', error);
        await dbRun('ROLLBACK');
        throw error;
    }
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

ipcMain.handle('export-full-attendance-pdf', async (event, { groupName, dates, students }) => {
    const { filePath } = await dialog.showSaveDialog({
        title: 'Exportar Tabla Completa de Asistencia a PDF',
        defaultPath: `asistencia-completa-${groupName.replace(/\s+/g, '_')}.pdf`,
        filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
    });

    if (!filePath) {
        return { success: false, cancelled: true };
    }

    try {
        // 1. Leer la plantilla HTML
        const templatePath = path.join(__dirname, 'pdf-template.html');
        let templateHtml = fs.readFileSync(templatePath, 'utf8');

        // 2. Generar encabezado de la tabla (thead)
        let tableHead = '<tr><th class="sticky-col">Alumno</th>';
        dates.forEach(date => {
            const [year, month, day] = date.split('-');
            tableHead += `<th>${day}/${month}</th>`;
        });
        tableHead += '</tr>';

        // 3. Generar cuerpo de la tabla (tbody)
        let tableBody = '';
        students.forEach(student => {
            tableBody += `<tr><td class="sticky-col">${student.name}</td>`;
            dates.forEach(date => {
                const attendance = student.attendances[date] || { status: '' };
                let statusChar = '';
                switch (attendance.status) {
                    case 'Presente': statusChar = 'P'; break;
                    case 'Ausente': statusChar = 'A'; break;
                    case 'Retardo': statusChar = 'R'; break;
                    case 'Justificada': statusChar = 'J'; break;
                    case 'Intercambio': statusChar = 'I'; break;
                }
                tableBody += `<td>${statusChar}</td>`;
            });
            tableBody += '</tr>';
        });

        // 4. Inyectar datos en la plantilla
        const currentDate = new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });

        const logoLeftPath = path.join(__dirname, 'assets', 'logo-left.svg');
        const logoRightPath = path.join(__dirname, 'assets', 'logo-right.svg');

        const logoLeftb64 = fs.readFileSync(logoLeftPath).toString('base64');
        const logoRightb64 = fs.readFileSync(logoRightPath).toString('base64');

        const logoLeftSrc = `data:image/svg+xml;base64,${logoLeftb64}`;
        const logoRightSrc = `data:image/svg+xml;base64,${logoRightb64}`;

        templateHtml = templateHtml
            .replace('{{logo_left_src}}', logoLeftSrc)
            .replace('{{logo_right_src}}', logoRightSrc)
            .replace('{{group_name}}', groupName)
            .replace('{{current_date}}', currentDate)
            .replace('{{table_head_content}}', tableHead)
            .replace('{{table_body_content}}', tableBody);

        // 5. Crear ventana oculta e imprimir a PDF
        const pdfWindow = new BrowserWindow({
            show: false,
            webPreferences: { contextIsolation: true }
        });

        await pdfWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(templateHtml)}`);

        await new Promise(resolve => setTimeout(resolve, 500)); // Espera breve para renderizado

        const pdfData = await pdfWindow.webContents.printToPDF({
            landscape: true,
            pageSize: 'A3',
            printBackground: true,
            margins: { top: 20, bottom: 20, left: 20, right: 20 }
        });

        // 6. Guardar el PDF y limpiar
        fs.writeFileSync(filePath, pdfData);
        pdfWindow.close();

        return { success: true, path: filePath };

    } catch (err) {
        console.error("Error al generar el PDF completo de asistencia:", err);
        return { success: false, error: err.message };
    }
});


// --- LÓGICA DEL DASHBOARD ---
ipcMain.handle('getDashboardInfo', async () => {
    const settingsRows = await dbAll('SELECT key, value FROM Settings WHERE key IN ("globalStartDate", "globalEndDate")');
    const globalStartDate = settingsRows.find(s => s.key === 'globalStartDate')?.value;
    const globalEndDate = settingsRows.find(s => s.key === 'globalEndDate')?.value;

    if (!globalStartDate || !globalEndDate) {
        return { today: [], tomorrow: [], nextAvailable: null };
    }

    const allGroups = await dbAll('SELECT * FROM Groups');

    const getClassesForDate = (date) => {
        const dateString = date.toISOString().split('T')[0];
        if (dateString < globalStartDate || dateString > globalEndDate) {
            return [];
        }
        const dayOfWeek = date.getDay();
        return allGroups.filter(g => g.class_days && g.class_days.split(',').map(Number).includes(dayOfWeek));
    };

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const todayClasses = getClassesForDate(today);
    const tomorrowClasses = getClassesForDate(tomorrow);

    let nextAvailable = null;
    if (tomorrowClasses.length === 0) {
        let nextDate = new Date(tomorrow);
        for (let i = 0; i < 365; i++) { // Search up to a year ahead
            nextDate.setDate(nextDate.getDate() + 1);
            const nextClasses = getClassesForDate(nextDate);
            if (nextClasses.length > 0) {
                nextAvailable = {
                    date: nextDate.toISOString(),
                    classes: nextClasses
                };
                break;
            }
        }
    }

    return {
        today: todayClasses,
        tomorrow: tomorrowClasses,
        nextAvailable: nextAvailable
    };
});

// El handler 'check-pending-attendance' ya no es necesario, el nuevo dashboard lo reemplaza.
ipcMain.handle('check-pending-attendance', async () => []);

// --- DATOS DE CUMPLEAÑOS ---
ipcMain.handle('get-teachers', async () => {
    // Retorna la lista hardcodeada. En un futuro, podría leerse desde un archivo o base de datos.
    return teachers;
});

// --- FRASES MOTIVACIONALES ---
ipcMain.handle('get-quotes', async () => {
    const userQuotesPath = path.join(dataPath, 'quotes.json');
    const templateQuotesPath = path.join(__dirname, 'quotes.default.json');

    try {
        // Asegurarse de que el archivo de plantilla exista.
        if (!fs.existsSync(templateQuotesPath)) {
            throw new Error('El archivo de plantilla de frases (quotes.default.json) no fue encontrado.');
        }

        // Forzar la copia del archivo de plantilla sobre el archivo del usuario cada vez.
        fs.copyFileSync(templateQuotesPath, userQuotesPath);

        const data = fs.readFileSync(userQuotesPath, 'utf8');
        return { success: true, quotes: JSON.parse(data) };
    } catch (error) {
        console.error('Error al gestionar el archivo de frases (quotes.json):', error.message);
        return { success: false, error: error.message };
    }
});

// --- RESUMEN DE ASISTENCIA (DASHBOARD) ---
ipcMain.handle('get-attendance-summary', async () => {
    const groups = await dbAll('SELECT id, group_name FROM Groups');
    const settings = (await dbAll('SELECT * FROM Settings')).reduce((acc, s) => {
        acc[s.key] = s.value;
        return acc;
    }, {});

    if (!settings.globalStartDate || !settings.globalEndDate) return [];

    const summary = [];

    for (const group of groups) {
        const groupDetails = await new Promise((resolve, reject) => {
            db.get('SELECT class_days FROM Groups WHERE id = ?', [group.id], (err, row) => err ? reject(err) : resolve(row));
        });
        if (!groupDetails || !groupDetails.class_days) continue;

        const classDays = groupDetails.class_days.split(',').map(Number);
        const classDates = [];
        for (let d = new Date(settings.globalStartDate + 'T00:00:00'); d <= new Date(settings.globalEndDate + 'T00:00:00'); d.setDate(d.getDate() + 1)) {
            if (classDays.includes(d.getDay())) {
                classDates.push(d.toISOString().split('T')[0]);
            }
        }

        const totalPossibleAttendances = (await dbAll('SELECT COUNT(id) as count FROM Students WHERE group_id = ?', [group.id]))[0].count * classDates.length;

        if (totalPossibleAttendances === 0) {
            summary.push({ label: group.group_name, value: 0 });
            continue;
        }

        const attendedCountResult = await dbAll(`
            SELECT COUNT(a.id) as count FROM Attendance a
            JOIN Students s ON a.student_id = s.id
            WHERE s.group_id = ? AND (a.status = 'Presente' OR a.status = 'Retardo')
              AND a.attendance_date IN (${classDates.map(d => `'${d}'`).join(',')})
        `, [group.id]);

        const attendedCount = attendedCountResult[0].count;
        const percentage = totalPossibleAttendances > 0 ? Math.round((attendedCount / totalPossibleAttendances) * 100) : 0;

        summary.push({ label: group.group_name, value: percentage });
    }

    return summary;
});