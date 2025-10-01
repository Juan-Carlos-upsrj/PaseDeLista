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

    // Funciones para Asistencia
    getAttendance: (groupId) => ipcRenderer.invoke('get-attendance', groupId),
    setAttendance: (attendance) => ipcRenderer.invoke('set-attendance', attendance),
    
    // Funciones para Configuración
    getSettings: () => ipcRenderer.invoke('get-settings'),
    saveSetting: (setting) => ipcRenderer.invoke('save-setting', setting),
    
    // Funciones para el Dashboard
    checkPendingAttendance: () => ipcRenderer.invoke('check-pending-attendance'),
});
