// preload.js
// Proporciona una comunicación segura entre el renderer y el main process.
const { contextBridge, ipcRenderer } = require('electron');

// Expone un objeto 'api' globalmente en el renderer process.
contextBridge.exposeInMainWorld('api', {
    // Funciones para Grupos
    getGroups: () => ipcRenderer.invoke('get-groups'),
    addGroup: (group) => ipcRenderer.invoke('add-group', group),
    updateGroup: (group) => ipcRenderer.invoke('update-group', group),
    deleteGroup: (id) => ipcRenderer.invoke('delete-group', id),
    getGroupById: (id) => ipcRenderer.invoke('get-group-by-id', id),

    // Funciones para Alumnos
    getStudents: (groupId) => ipcRenderer.invoke('get-students', groupId),
    addStudent: (student) => ipcRenderer.invoke('add-student', student),
    addMultipleStudents: (data) => ipcRenderer.invoke('add-multiple-students', data),
    deleteStudent: (id) => ipcRenderer.invoke('delete-student', id),
    getStudentById: (id) => ipcRenderer.invoke('get-student-by-id', id),
    updateStudent: (student) => ipcRenderer.invoke('update-student', student),

    // Funciones para Asistencia
    getAttendance: (groupId) => ipcRenderer.invoke('get-attendance', groupId),
    setAttendance: (attendance) => ipcRenderer.invoke('set-attendance', attendance),
    deleteAttendance: (data) => ipcRenderer.invoke('delete-attendance', data),
    saveRollCall: (data) => ipcRenderer.invoke('save-roll-call', data),

    // Funciones para Configuración
    getSettings: () => ipcRenderer.invoke('get-settings'),
    saveSetting: (setting) => ipcRenderer.invoke('save-setting', setting),

    // Funciones para el Dashboard
    getDashboardInfo: () => ipcRenderer.invoke('getDashboardInfo'),

    // Función para obtener datos de cumpleaños
    getTeachers: () => ipcRenderer.invoke('get-teachers'),

    // Nueva función para el resumen de asistencia
    getAttendanceSummary: () => ipcRenderer.invoke('get-attendance-summary'),

    // Función para obtener las frases motivacionales
    getQuotes: () => ipcRenderer.invoke('get-quotes'),

    // Exportación
    exportCsv: (data) => ipcRenderer.invoke('export-csv', data),
    exportPdf: (data) => ipcRenderer.invoke('export-pdf', data),
    exportFullAttendancePdf: (data) => ipcRenderer.invoke('export-full-attendance-pdf', data)
});
