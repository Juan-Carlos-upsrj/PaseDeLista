const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { parse } = require('csv-parse/sync');
const Store = require('electron-store');

const store = new Store();
const {
  initDatabase,
  getGroups, addGroup, updateGroup, deleteGroup,
  getStudentsByGroup, addStudent, updateStudent, deleteStudent,
  getAttendance, upsertAttendance,
  addMultipleStudents,
  getGroupById, deleteAttendanceOnScheduleChange,
  getTodaysClasses, getRecordedAttendanceDates
} = require('./database');

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  // Open the DevTools.
  // mainWindow.webContents.openDevTools();
}

app.on('ready', () => {
  // Inicializa la base de datos en la carpeta de datos del usuario
  const userDataPath = app.getPath('userData');
  initDatabase(userDataPath);

  createWindow();
});

// --- Manejadores IPC para Grupos ---
ipcMain.handle('get-groups', async () => {
  return await getGroups();
});

ipcMain.handle('add-group', async (event, group) => {
  return await addGroup(group);
});

ipcMain.handle('update-group', async (event, group) => {
  const oldGroup = await getGroupById(group.id);

  // Compara si los días de clase han cambiado
  if (oldGroup && oldGroup.class_days !== group.class_days) {
    const result = await dialog.showMessageBox({
      type: 'warning',
      buttons: ['Cancelar', 'Sí, cambiar horario'],
      defaultId: 0,
      title: 'Confirmar cambio de horario',
      message: '¡Atención! Estás a punto de cambiar los días de clase.',
      detail: 'Al cambiar el horario, se eliminarán todos los registros de asistencia de los días que ya no forman parte del grupo. Esta acción no se puede deshacer. ¿Estás seguro de que quieres continuar?'
    });

    if (result.response === 0) { // El usuario canceló
      return { success: false, cancelled: true, message: 'Actualización cancelada por el usuario.' };
    }

    // El usuario confirmó, proceder con la actualización y limpieza
    await deleteAttendanceOnScheduleChange(group.id, group.class_days.split(','));
  }

  // Proceder con la actualización normal si no hay cambios de horario o si el usuario confirmó
  return await updateGroup(group);
});

ipcMain.handle('delete-group', async (event, id) => {
  return await deleteGroup(id);
});

// --- Manejadores IPC para Alumnos ---
ipcMain.handle('get-students-by-group', async (event, groupId) => {
  return await getStudentsByGroup(groupId);
});

ipcMain.handle('add-student', async (event, student) => {
  return await addStudent(student);
});

ipcMain.handle('update-student', async (event, student) => {
  return await updateStudent(student);
});

ipcMain.handle('delete-student', async (event, id) => {
  return await deleteStudent(id);
});

ipcMain.handle('add-multiple-students', async (event, students) => {
  return await addMultipleStudents(students);
});

ipcMain.handle('import-students-csv', async (event, groupId) => {
  // 1. Mostrar el diálogo para seleccionar archivo
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Archivos CSV', extensions: ['csv'] }]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { success: false, message: 'Importación cancelada.' };
  }

  const filePath = result.filePaths[0];

  try {
    // 2. Leer y parsear el archivo CSV
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const records = parse(fileContent, {
      columns: false,
      skip_empty_lines: true,
      trim: true,
    });

    // 3. Mapear los registros a objetos de alumno
    const students = records.map(record => ({
      student_id: record.length > 1 ? record[0] : null,
      student_name: record.length > 1 ? record[1] : record[0],
      group_id: groupId
    }));

    if (students.length === 0) {
      return { success: false, message: 'El archivo CSV está vacío.' };
    }

    // 4. Añadir los alumnos a la base de datos
    const dbResult = await addMultipleStudents(students);
    return { success: true, count: dbResult.count };

  } catch (error) {
    console.error('Error al importar CSV:', error);
    return { success: false, message: `Error al procesar el archivo: ${error.message}` };
  }
});

// --- Manejadores IPC para Asistencia ---
ipcMain.handle('get-attendance', async (event, groupId) => {
  return await getAttendance(groupId);
});

ipcMain.handle('upsert-attendance', async (event, record) => {
  return await upsertAttendance(record);
});

// --- Manejador IPC para el Dashboard ---
ipcMain.handle('get-dashboard-data', async () => {
    const [allGroups, recordedDates, todaysClasses] = await Promise.all([
        getGroups(),
        getRecordedAttendanceDates(),
        getTodaysClasses()
    ]);

    const recordedSet = new Set(recordedDates.map(r => `${r.group_id}-${r.attendance_date}`));
    const pendingAttendances = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Normalizar a la medianoche

    for (const group of allGroups) {
        const classDays = group.class_days.split(',').map(d => parseInt(d, 10));
        let currentDate = new Date(group.start_date.replace(/-/g, '/'));

        while (currentDate <= today) {
            if (classDays.includes(currentDate.getDay())) {
                const dateString = currentDate.toISOString().slice(0, 10);
                if (!recordedSet.has(`${group.id}-${dateString}`)) {
                    pendingAttendances.push({
                        groupName: group.group_name,
                        date: dateString
                    });
                }
            }
            currentDate.setDate(currentDate.getDate() + 1);
        }
    }

    return { todaysClasses, pendingAttendances };
});

// --- Manejadores IPC para Configuración ---
ipcMain.handle('get-setting', (event, key) => {
    return store.get(key);
});

ipcMain.handle('set-setting', (event, { key, value }) => {
    store.set(key, value);
});


app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});