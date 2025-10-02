const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // General
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // Settings
  getSetting: (key) => ipcRenderer.invoke('get-setting', key),
  setSetting: (key, value) => ipcRenderer.invoke('set-setting', key, value),

  // Groups
  getGroups: () => ipcRenderer.invoke('get-groups'),
  addGroup: (group) => ipcRenderer.invoke('add-group', group),
  deleteGroup: (groupId) => ipcRenderer.invoke('delete-group', groupId),

  // Students
  getStudents: (groupId) => ipcRenderer.invoke('get-students', groupId),
  addStudent: (student) => ipcRenderer.invoke('add-student', student),
  importStudentsFromCSV: (groupId) => ipcRenderer.invoke('import-students-from-csv', groupId),
  deleteStudent: (studentId) => ipcRenderer.invoke('delete-student', studentId),

  // Attendance
  getAttendance: (groupId, date) => ipcRenderer.invoke('get-attendance', groupId, date),
  saveAttendance: (attendanceData) => ipcRenderer.invoke('save-attendance', attendanceData),

  // Reports
  generateReport: (groupId, period) => ipcRenderer.invoke('generate-report', groupId, period),
  exportToCSV: (data) => ipcRenderer.invoke('export-csv', data),
  exportToPDF: (data) => ipcRenderer.invoke('export-pdf', data),

  // Dashboard
  getTodayClasses: () => ipcRenderer.invoke('get-today-classes'),

  // UI Feedback
  on: (channel, callback) => {
    ipcRenderer.on(channel, (event, ...args) => callback(...args));
  }
});