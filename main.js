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
            status TEXT NOT NULL CHECK(status IN ('Presente', 'Ausente', 'Retardo', 'Intercambio')),
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

ipcMain.handle('setBulkAttendance', async (event, attendances) => {
    const sql = 'INSERT OR REPLACE INTO Attendance (student_id, attendance_date, status) VALUES (?, ?, ?)';

    return new Promise((resolve, reject) => {
        db.serialize(() => {
            db.run('BEGIN TRANSACTION', err => {
                if (err) return reject(err);

                const stmt = db.prepare(sql);
                attendances.forEach(att => {
                    stmt.run(att.studentId, att.date, att.status, err => {
                        if (err) return reject(err);
                    });
                });

                stmt.finalize(err => {
                    if (err) return reject(err);

                    db.run('COMMIT', err => {
                        if (err) return reject(err);
                        resolve({ success: true, changes: attendances.length });
                    });
                });
            });
        });
    });
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

// --- OBTENER RUTA DE ASSETS ---
// Necesario para que el renderer pueda encontrar assets como logos para los PDFs.
ipcMain.handle('get-asset-path', (event, assetName) => {
    // __dirname apunta al directorio del script actual (main.js)
    // Esto funciona tanto en desarrollo como en una aplicación empaquetada.
    return path.join(__dirname, 'assets', assetName);
});

ipcMain.handle('export-formatted-pdf', async (event, { htmlContent, defaultFilename }) => {
    const { filePath } = await dialog.showSaveDialog({
        title: 'Guardar PDF',
        defaultPath: defaultFilename || 'reporte.pdf',
        filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
    });

    if (!filePath) {
        return { success: false, cancelled: true };
    }

    const pdfWindow = new BrowserWindow({
        show: false,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    try {
        let processedHtml = htmlContent;
        const fileRegex = /file:\/\/([^"']+)/g;
        const matches = [...htmlContent.matchAll(fileRegex)];

        for (const match of matches) {
            const filePath = match[1];
            try {
                if (fs.existsSync(filePath)) {
                    const imageBuffer = fs.readFileSync(filePath);
                    const base64Image = imageBuffer.toString('base64');
                    const ext = path.extname(filePath).toLowerCase().substring(1);
                    const mimeType = ext === 'png' ? 'image/png' :
                                   ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' :
                                   'image/png';
                    const dataUrl = `data:${mimeType};base64,${base64Image}`;
                    processedHtml = processedHtml.replace(match[0], dataUrl);
                }
            } catch (err) {
                console.error('Error procesando imagen:', err);
            }
        }

        await pdfWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(processedHtml)}`);
        await new Promise(resolve => setTimeout(resolve, 1000));

        const pdfData = await pdfWindow.webContents.printToPDF({
            printBackground: true,
            pageSize: 'Letter',
            landscape: true,
            margins: { top: 15, bottom: 15, left: 15, right: 15 }
        });

        fs.writeFileSync(filePath, pdfData);
        return { success: true, path: filePath };

    } catch (err) {
        console.error("Error generando PDF formateado:", err);
        return { success: false, error: err.message };
    } finally {
        if (pdfWindow && !pdfWindow.isDestroyed()) {
            pdfWindow.close();
        }
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