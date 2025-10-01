const { contextBridge, ipcRenderer } = require('electron');

// Exponer de forma segura las API del proceso principal al proceso de renderizado
contextBridge.exposeInMainWorld('electronAPI', {
  // Funciones para Grupos
  getGroups: () => ipcRenderer.invoke('get-groups'),
  addGroup: (group) => ipcRenderer.invoke('add-group', group),
  updateGroup: (group) => ipcRenderer.invoke('update-group', group),
  deleteGroup: (id) => ipcRenderer.invoke('delete-group', id),

  // Funciones para Alumnos
  getStudentsByGroup: (groupId) => ipcRenderer.invoke('get-students-by-group', groupId),
  addStudent: (student) => ipcRenderer.invoke('add-student', student),
  updateStudent: (student) => ipcRenderer.invoke('update-student', student),
  deleteStudent: (id) => ipcRenderer.invoke('delete-student', id),

  // Funciones para Asistencia
  getAttendance: (groupId) => ipcRenderer.invoke('get-attendance', groupId),
  upsertAttendance: (record) => ipcRenderer.invoke('upsert-attendance', record),

  // Funciones en Lote
  addMultipleStudents: (students) => ipcRenderer.invoke('add-multiple-students', students),
  importStudentsCSV: (groupId) => ipcRenderer.invoke('import-students-csv', groupId),

  // Funciones del Dashboard
  getDashboardData: () => ipcRenderer.invoke('get-dashboard-data'),

  // Funciones de Configuración
  getSetting: (key) => ipcRenderer.invoke('get-setting', key),
  setSetting: (key, value) => ipcRenderer.invoke('set-setting', { key, value }),
});

console.log('preload.js cargado y APIs expuestas.');