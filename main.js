const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const Store = require('electron-store');

const store = new Store();
let db;
let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      enableRemoteModule: false,
    },
  });

  mainWindow.loadFile('index.html');
  // mainWindow.webContents.openDevTools();
}

function initDatabase() {
  const dbPath = path.join(app.getPath('userData'), 'asistencia.db');
  db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('Error opening database', err.message);
      dialog.showErrorBox('Error de Base de Datos', `No se pudo conectar a la base de datos: ${err.message}`);
      app.quit();
    } else {
      console.log('Connected to the SQLite database.');
      db.run('PRAGMA foreign_keys = ON;');
      db.serialize(() => {
        db.run(`CREATE TABLE IF NOT EXISTS Groups (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE,
          start_date TEXT NOT NULL,
          end_date TEXT NOT NULL,
          class_days TEXT NOT NULL
        )`);
        db.run(`CREATE TABLE IF NOT EXISTS Students (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          student_id TEXT NOT NULL,
          name TEXT NOT NULL,
          group_id INTEGER NOT NULL,
          FOREIGN KEY (group_id) REFERENCES Groups (id) ON DELETE CASCADE,
          UNIQUE(student_id, group_id)
        )`);
        db.run(`CREATE TABLE IF NOT EXISTS Attendance (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          student_id INTEGER NOT NULL,
          group_id INTEGER NOT NULL,
          date TEXT NOT NULL,
          status TEXT NOT NULL,
          FOREIGN KEY (student_id) REFERENCES Students (id) ON DELETE CASCADE,
          FOREIGN KEY (group_id) REFERENCES Groups (id) ON DELETE CASCADE,
          UNIQUE(student_id, date)
        )`);

        // No seed data in production
      });
    }
  });
}

app.whenReady().then(() => {
  createWindow();
  initDatabase();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (db) db.close();
    app.quit();
  }
});

// --- IPC Handlers ---

// Settings
ipcMain.handle('get-setting', (event, key) => store.get(key));
ipcMain.handle('set-setting', (event, key, value) => store.set(key, value));

// Groups
ipcMain.handle('get-groups', () => {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM Groups ORDER BY name', [], (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
});

// Dashboard
ipcMain.handle('get-today-classes', () => {
    return new Promise((resolve, reject) => {
        const today = new Date();
        const dateString = today.toISOString().split('T')[0]; // YYYY-MM-DD
        const dayIndex = today.getDay(); // Sunday = 0, Monday = 1, etc.
        const dayMap = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
        const todayChar = dayMap[dayIndex];

        const query = `
            SELECT * FROM Groups
            WHERE start_date <= ?
            AND end_date >= ?
            AND class_days LIKE ?
        `;

        db.all(query, [dateString, dateString, `%${todayChar}%`], (err, rows) => {
            if (err) {
                console.error("Error fetching today's classes:", err);
                reject(err);
            } else {
                resolve(rows);
            }
        });
    });
});

// Students
ipcMain.handle('add-student', (event, student) => {
  return new Promise((resolve, reject) => {
    const { student_id, name, group_id } = student;
    const query = 'INSERT INTO Students (student_id, name, group_id) VALUES (?, ?, ?)';
    db.run(query, [student_id, name, group_id], function(err) {
      if (err) reject(err);
      else resolve({ id: this.lastID });
    });
  });
});

// Reports
ipcMain.handle('generate-report', async (event, groupId, period) => {
    const group = await new Promise((resolve, reject) => {
        db.get('SELECT * FROM Groups WHERE id = ?', [groupId], (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });

    if (!group) throw new Error('Group not found');

    const { start_date, end_date, class_days } = group;
    const groupStartDate = new Date(start_date);
    const groupEndDate = new Date(end_date);

    let reportStartDate, reportEndDate;

    // This logic assumes a 4-month period (cuatrimestre)
    // A more robust implementation might store explicit partial dates.
    const twoMonths = 60 * 24 * 60 * 60 * 1000;
    const midDate = new Date(groupStartDate.getTime() + twoMonths);

    if (period === 'primer-parcial') {
        reportStartDate = groupStartDate;
        reportEndDate = midDate > groupEndDate ? groupEndDate : midDate;
    } else if (period === 'segundo-parcial') {
        reportStartDate = midDate > groupEndDate ? groupEndDate : midDate;
        reportEndDate = groupEndDate;
    } else { // cuatrimestre-completo
        reportStartDate = groupStartDate;
        reportEndDate = groupEndDate;
    }

    const students = await new Promise((resolve, reject) => {
        const query = 'SELECT id, student_id, name FROM Students WHERE group_id = ? ORDER BY name';
        db.all(query, [groupId], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });

    const attendanceData = await new Promise((resolve, reject) => {
        const query = `
            SELECT student_id, status, COUNT(*) as count
            FROM Attendance
            WHERE group_id = ? AND date BETWEEN ? AND ?
            GROUP BY student_id, status
        `;
        db.all(query, [groupId, reportStartDate.toISOString().split('T')[0], reportEndDate.toISOString().split('T')[0]], (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });

    // Calculate total class days in the period
    let totalClasses = 0;
    const classDaysArr = class_days.split(',');
    const dayMap = { 'L': 1, 'M': 2, 'X': 3, 'J': 4, 'V': 5, 'S': 6, 'D': 0 };
    const classDaysIndices = classDaysArr.map(d => dayMap[d]);

    let currentDate = new Date(reportStartDate);
    while (currentDate <= reportEndDate) {
        if (classDaysIndices.includes(currentDate.getDay())) {
            totalClasses++;
        }
        currentDate.setDate(currentDate.getDate() + 1);
    }

    if (totalClasses === 0) return []; // Avoid division by zero

    const report = students.map(student => {
        const studentAttendance = {
            'Presente': 0,
            'Retardo': 0,
            'Falta': 0
        };

        attendanceData
            .filter(row => row.student_id === student.id)
            .forEach(row => {
                studentAttendance[row.status] = row.count;
            });

        const present_count = studentAttendance['Presente'];
        const late_count = studentAttendance['Retardo'];
        // Faltas can be calculated as total classes minus taken attendance
        const attended_classes = present_count + late_count + studentAttendance['Falta'];
        const absent_count = totalClasses - attended_classes + studentAttendance['Falta'];

        const percentage = totalClasses > 0 ? ((present_count + late_count) / totalClasses) * 100 : 0;

        return {
            ...student,
            present_count,
            late_count,
            absent_count,
            attendance_percentage: percentage
        };
    });

    return report;
});

// Exporting
ipcMain.handle('export-csv', async (event, data) => {
    const { filePath } = await dialog.showSaveDialog(mainWindow, {
        title: 'Exportar a CSV',
        defaultPath: `reporte-${Date.now()}.csv`,
        filters: [{ name: 'CSV Files', extensions: ['csv'] }]
    });

    if (filePath) {
        try {
            let csvContent = "Matricula,Nombre,Asistencias,Faltas,Retardos,Porcentaje Asistencia\n";
            data.forEach(row => {
                csvContent += `${row.student_id},"${row.name}",${row.present_count},${row.absent_count},${row.late_count},${row.attendance_percentage.toFixed(2)}%\n`;
            });
            fs.writeFileSync(filePath, csvContent, 'utf-8');
            return { success: true, path: filePath };
        } catch (error) {
            console.error('Failed to save CSV:', error);
            return { success: false, error: error.message };
        }
    }
    return { success: false, error: 'Save dialog cancelled' };
});

ipcMain.handle('export-pdf', async (event, data) => {
    const { filePath } = await dialog.showSaveDialog(mainWindow, {
        title: 'Exportar a PDF',
        defaultPath: `reporte-${Date.now()}.pdf`,
        filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
    });

    if (!filePath) return { success: false, error: 'Save dialog cancelled' };

    const htmlContent = `
        <html>
            <head>
                <style>
                    body { font-family: sans-serif; }
                    table { width: 100%; border-collapse: collapse; }
                    th, td { border: 1px solid #dddddd; text-align: left; padding: 8px; }
                    th { background-color: #f2f2f2; }
                    .low-attendance { background-color: #fff3cd; }
                </style>
            </head>
            <body>
                <h1>Reporte de Asistencia</h1>
                <table>
                    <thead>
                        <tr>
                            <th>Matrícula</th>
                            <th>Nombre</th>
                            <th>Asistencias</th>
                            <th>Faltas</th>
                            <th>Retardos</th>
                            <th>Asistencia (%)</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${data.map(student => `
                            <tr class="${student.attendance_percentage <= 80 ? 'low-attendance' : ''}">
                                <td>${student.student_id}</td>
                                <td>${student.name}</td>
                                <td>${student.present_count}</td>
                                <td>${student.absent_count}</td>
                                <td>${student.late_count}</td>
                                <td>${student.attendance_percentage.toFixed(2)}%</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </body>
        </html>
    `;

    const pdfWindow = new BrowserWindow({ show: false });
    pdfWindow.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(htmlContent));

    try {
        const pdfData = await pdfWindow.webContents.printToPDF({
            marginsType: 0,
            pageSize: 'A4',
            printBackground: true,
            landscape: false
        });
        fs.writeFileSync(filePath, pdfData);
        return { success: true, path: filePath };
    } catch (error) {
        console.error('Failed to create PDF:', error);
        return { success: false, error: error.message };
    } finally {
        pdfWindow.close();
    }
});