// renderer.js
// Este archivo maneja toda la lógica del lado del cliente (interfaz de usuario).

document.addEventListener('DOMContentLoaded', () => {
    // --- ESTADO GLOBAL DE LA APLICACIÓN ---
    const state = {
        currentView: 'inicio',
        selectedGroupId: null,
        groups: [],
        settings: {},
        reportData: null
    };

    // --- SELECTORES DE ELEMENTOS DEL DOM ---
    const sections = document.querySelectorAll('.content-section');
    const sidebarLinks = document.querySelectorAll('.sidebar-link');
    const groupsList = document.getElementById('groups-list');
    const groupDetailsView = document.getElementById('group-details-view');
    const noGroupSelectedView = document.getElementById('no-group-selected-view');
    const groupForm = document.getElementById('group-form');
    const studentsTableBody = document.getElementById('students-table-body');
    const attendanceGroupSelect = document.getElementById('attendance-group-select');
    const attendanceGridContainer = document.getElementById('attendance-grid-container');

    // --- NAVEGACIÓN ---
    sidebarLinks.forEach(link => {
        if (link.id === 'settings-btn') return;
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const sectionId = link.getAttribute('data-section');
            navigateTo(sectionId);
        });
    });

    function navigateTo(sectionId) {
        state.currentView = sectionId;
        sections.forEach(s => s.classList.toggle('active', s.id === sectionId));
        sidebarLinks.forEach(l => {
             if (l.id !== 'settings-btn') {
                l.classList.toggle('active', l.getAttribute('data-section') === sectionId)
             }
        });

        // Cargar datos relevantes para la nueva vista
        if (sectionId === 'grupos') loadGroups();
        if (sectionId === 'asistencia') loadGroupsForSelect(attendanceGroupSelect, true);
        if (sectionId === 'reportes') loadGroupsForSelect(document.getElementById('report-group-select'), true);
        if (sectionId === 'inicio') {
            checkPendingAttendance();
            loadTodayClasses();
        }
    }

    // --- LÓGICA DE GRUPOS ---
    async function loadGroups() {
        const groups = await window.api.getGroups();
        state.groups = groups;
        groupsList.innerHTML = '';
        groups.forEach(group => {
            const li = document.createElement('li');
            li.textContent = `${group.group_name} - ${group.subject_name}`;
            li.dataset.groupId = group.id;
            li.classList.toggle('selected', group.id === state.selectedGroupId);
            groupsList.appendChild(li);
        });
    }

    groupsList.addEventListener('click', (e) => {
        if (e.target.tagName === 'LI') {
            const groupId = parseInt(e.target.dataset.groupId);
            selectGroup(groupId);
        }
    });

    async function selectGroup(groupId) {
        state.selectedGroupId = groupId;
        document.querySelectorAll('#groups-list li').forEach(li => {
            li.classList.toggle('selected', parseInt(li.dataset.groupId) === groupId);
        });

        const group = await window.api.getGroupById(groupId);
        if (!group) return;

        groupForm.querySelector('#group-id').value = group.id;
        groupForm.querySelector('#group-name').value = group.group_name;
        groupForm.querySelector('#subject-name').value = group.subject_name;
        groupForm.querySelector('#start-date').value = group.start_date;
        groupForm.querySelector('#end-date').value = group.end_date;
        groupForm.querySelector('#partial1-end-date').value = group.partial1_end_date;

        const classDays = group.class_days ? group.class_days.split(',').map(Number) : [];
        document.querySelectorAll('#class-days-checkboxes input').forEach(cb => {
            cb.checked = classDays.includes(parseInt(cb.value));
        });

        loadStudents(groupId);

        groupDetailsView.classList.remove('hidden');
        noGroupSelectedView.classList.add('hidden');
    }

    groupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = parseInt(groupForm.querySelector('#group-id').value);
        const classDays = Array.from(document.querySelectorAll('#class-days-checkboxes input:checked')).map(cb => cb.value);
        const groupData = {
            name: document.getElementById('group-name').value,
            subject: document.getElementById('subject-name').value,
            startDate: document.getElementById('start-date').value,
            endDate: document.getElementById('end-date').value,
            partial1EndDate: document.getElementById('partial1-end-date').value,
            classDays: classDays
        };

        try {
            if (id) {
                groupData.id = id;
                await window.api.updateGroup(groupData);
            } else {
                await window.api.addGroup(groupData);
            }
            showNotification('Grupo guardado con éxito.');
            resetGroupView();
        } catch (error) {
            showNotification(`Error al guardar el grupo: ${error.message}`, 'error');
        }
    });

    document.getElementById('add-group-btn').addEventListener('click', () => {
        state.selectedGroupId = null;
        groupForm.reset();
        document.getElementById('group-id').value = '';
        document.querySelectorAll('#groups-list li').forEach(li => li.classList.remove('selected'));
        studentsTableBody.innerHTML = '';
        groupDetailsView.classList.remove('hidden');
        noGroupSelectedView.classList.add('hidden');
    });

    document.getElementById('delete-group-btn').addEventListener('click', async () => {
        if(state.selectedGroupId && confirm('¿Estás seguro de que quieres eliminar este grupo y todos sus alumnos y registros de asistencia?')) {
            try {
                await window.api.deleteGroup(state.selectedGroupId);
                showNotification('Grupo eliminado correctamente.');
                resetGroupView();
            } catch (error) {
                showNotification(`Error al eliminar el grupo: ${error.message}`, 'error');
            }
        }
    });

    function resetGroupView() {
        state.selectedGroupId = null;
        groupDetailsView.classList.add('hidden');
        noGroupSelectedView.classList.remove('hidden');
        loadGroups();
    }

    // --- LÓGICA DE ALUMNOS ---
    async function loadStudents(groupId) {
        const students = await window.api.getStudents(groupId);
        studentsTableBody.innerHTML = '';
        document.getElementById('students-list-header').textContent = `Alumnos (${students.length})`;
        students.forEach(student => {
            const row = studentsTableBody.insertRow();
            row.innerHTML = `
                <td class="matricula-col">${student.student_id || ''}</td>
                <td>${student.student_name}</td>
                <td><a href="#" class="action-link" data-student-id="${student.id}">Eliminar</a></td>
            `;
        });
        applyMatriculaVisibility();
    }

    studentsTableBody.addEventListener('click', async (e) => {
        if(e.target.classList.contains('action-link')) {
            const studentId = e.target.dataset.studentId;
            if (confirm('¿Seguro que quieres eliminar a este alumno?')) {
                try {
                    await window.api.deleteStudent(studentId);
                    showNotification('Alumno eliminado correctamente.');
                    loadStudents(state.selectedGroupId);
                } catch (error) {
                    showNotification(`Error al eliminar alumno: ${error.message}`, 'error');
                }
            }
        }
    });

    // --- LÓGICA DE ASISTENCIA ---
    attendanceGroupSelect.addEventListener('change', () => {
        const groupId = parseInt(attendanceGroupSelect.value);
        if (groupId) {
            renderAttendanceGrid(groupId);
        } else {
            attendanceGridContainer.innerHTML = '';
        }
    });

    async function renderAttendanceGrid(groupId) {
        attendanceGridContainer.innerHTML = 'Cargando...';
        const group = await window.api.getGroupById(groupId);
        const students = await window.api.getStudents(groupId);
        const attendanceData = await window.api.getAttendance(groupId);

        const attendanceMap = new Map();
        attendanceData.forEach(att => {
            attendanceMap.set(`${att.student_id}-${att.attendance_date}`, att.status);
        });

        if (!group.start_date || !group.end_date || !group.class_days) {
            attendanceGridContainer.innerHTML = '<p>Este grupo no tiene configuradas las fechas o días de clase.</p>';
            return;
        }

        const classDates = [];
        const classDays = group.class_days.split(',').map(Number);
        const startDate = new Date(group.start_date + 'T00:00:00');
        const endDate = new Date(group.end_date + 'T00:00:00');

        for (let d = startDate; d <= endDate; d.setDate(d.getDate() + 1)) {
            if (classDays.includes(d.getDay())) {
                classDates.push(new Date(d));
            }
        }

        let tableHTML = '<table id="attendance-table"><thead><tr>';
        tableHTML += '<th class="student-name-header">Alumno</th>';
        classDates.forEach(date => {
            tableHTML += `<th class="date-header">${date.toLocaleDateString('es-MX', {day:'2-digit', month:'2-digit'})}</th>`;
        });
        tableHTML += '</tr></thead><tbody>';

        students.forEach(student => {
            tableHTML += `<tr><td class="student-name-cell">${student.student_name}</td>`;
            classDates.forEach(date => {
                const dateString = date.toISOString().split('T')[0];
                const status = attendanceMap.get(`${student.id}-${dateString}`) || 'Presente';
                const statusClass = `status-${status.toLowerCase()}`;
                const statusIcon = {'Presente': '✅', 'Ausente': '❌', 'Retardo': '🕒'}[status];

                tableHTML += `<td class="status-cell ${statusClass}" data-student-id="${student.id}" data-date="${dateString}">${statusIcon}</td>`;
            });
            tableHTML += '</tr>';
        });

        tableHTML += '</tbody></table>';
        attendanceGridContainer.innerHTML = tableHTML;
    }

    attendanceGridContainer.addEventListener('click', (e) => {
        if(e.target.classList.contains('status-cell')) {
            const cell = e.target;
            const statuses = ['Presente', 'Ausente', 'Retardo'];
            const currentStatus = {'✅': 'Presente', '❌': 'Ausente', '🕒': 'Retardo'}[cell.textContent];
            const nextIndex = (statuses.indexOf(currentStatus) + 1) % statuses.length;
            const newStatus = statuses[nextIndex];

            const attendance = {
                studentId: cell.dataset.studentId,
                date: cell.dataset.date,
                status: newStatus
            };

            window.api.setAttendance(attendance);

            cell.textContent = {'Presente': '✅', 'Ausente': '❌', 'Retardo': '🕒'}[newStatus];
            cell.className = `status-cell status-${newStatus.toLowerCase()}`;
        }
    });

    // --- LÓGICA DE REPORTES ---
    const generateReportBtn = document.getElementById('generate-report-btn');
    const reportResultsContainer = document.getElementById('report-results-container');
    const exportCsvBtn = document.getElementById('export-csv-btn');
    const exportPdfBtn = document.getElementById('export-pdf-btn');

    generateReportBtn.addEventListener('click', generateReport);

    exportCsvBtn.addEventListener('click', async () => {
        if (state.reportData) {
            const result = await window.api.exportCsv(state.reportData);
            if (result.success) {
                showNotification('Reporte CSV exportado con éxito.');
            } else if (!result.cancelled) {
                showNotification(`Error al exportar a CSV: ${result.error}`, 'error');
            }
        }
    });

    exportPdfBtn.addEventListener('click', async () => {
        if (state.reportData) {
            const result = await window.api.exportPdf(state.reportData);
            if (result.success) {
                showNotification('Reporte PDF exportado con éxito.');
            } else if (!result.cancelled) {
                showNotification(`Error al exportar a PDF: ${result.error}`, 'error');
            }
        }
    });

    async function generateReport() {
        const groupId = document.getElementById('report-group-select').value;
        const period = document.getElementById('report-period-select').value;

        if (!groupId) {
            showNotification('Por favor, selecciona un grupo.', 'error');
            return;
        }

        reportResultsContainer.innerHTML = 'Generando reporte...';
        exportCsvBtn.disabled = true;
        exportPdfBtn.disabled = true;
        state.reportData = null;

        const group = await window.api.getGroupById(groupId);
        const students = await window.api.getStudents(groupId);
        const attendanceData = await window.api.getAttendance(groupId);

        if (!group.start_date || !group.end_date || !group.class_days || !group.partial1_end_date) {
            reportResultsContainer.innerHTML = '<p>El grupo seleccionado no tiene todas las fechas configuradas (inicio, fin, fin de primer parcial).</p>';
            return;
        }

        const groupStartDate = new Date(group.start_date + 'T00:00:00');
        const groupEndDate = new Date(group.end_date + 'T00:00:00');
        const partial1EndDate = new Date(group.partial1_end_date + 'T00:00:00');

        let periodStartDate, periodEndDate;
        if (period === 'p1') {
            periodStartDate = groupStartDate;
            periodEndDate = partial1EndDate;
        } else if (period === 'p2') {
            periodStartDate = new Date(partial1EndDate);
            periodStartDate.setDate(periodStartDate.getDate() + 1);
            periodEndDate = groupEndDate;
        } else {
            periodStartDate = groupStartDate;
            periodEndDate = groupEndDate;
        }

        const classDays = group.class_days.split(',').map(Number);
        const classDatesInPeriod = [];
        for (let d = new Date(groupStartDate); d <= groupEndDate; d.setDate(d.getDate() + 1)) {
            if (classDays.includes(d.getDay())) {
                const currentDate = new Date(d);
                if (currentDate >= periodStartDate && currentDate <= periodEndDate) {
                    classDatesInPeriod.push(currentDate.toISOString().split('T')[0]);
                }
            }
        }

        const totalClasses = classDatesInPeriod.length;
        if (totalClasses === 0) {
            reportResultsContainer.innerHTML = '<p>No hay clases programadas en el periodo seleccionado.</p>';
            return;
        }

        const attendanceMap = new Map();
        attendanceData.forEach(att => attendanceMap.set(`${att.student_id}-${att.attendance_date}`, att.status));

        const reportResults = students.map(student => {
            let presente = 0, ausente = 0, retardo = 0;
            classDatesInPeriod.forEach(date => {
                const status = attendanceMap.get(`${student.id}-${date}`);
                if (status === 'Presente') presente++;
                else if (status === 'Retardo') retardo++;
                else ausente++;
            });
            const attendancePercentage = totalClasses > 0 ? ((presente + retardo) / totalClasses) * 100 : 0;
            return {
                studentName: student.student_name,
                studentId: student.student_id,
                presente,
                retardo,
                ausente,
                percentage: attendancePercentage.toFixed(1)
            };
        });

        state.reportData = reportResults;

        let tableHTML = `<table class="data-table">
            <thead>
                <tr>
                    <th class="matricula-col">Matrícula</th>
                    <th>Alumno</th>
                    <th>Asistencias</th>
                    <th>Retardos</th>
                    <th>Faltas</th>
                    <th>% Asistencia</th>
                </tr>
            </thead>
            <tbody>`;

        reportResults.forEach(res => {
            const lowAttendanceClass = res.percentage <= 80.0 ? 'low-attendance-row' : '';
            tableHTML += `<tr class="${lowAttendanceClass}">
                <td class="matricula-col">${res.studentId || ''}</td>
                <td>${res.studentName}</td>
                <td>${res.presente}</td>
                <td>${res.retardo}</td>
                <td>${res.ausente}</td>
                <td>${res.percentage}%</td>
            </tr>`;
        });

        tableHTML += '</tbody></table>';
        reportResultsContainer.innerHTML = tableHTML;
        applyMatriculaVisibility();

        exportCsvBtn.disabled = false;
        exportPdfBtn.disabled = false;
    }

    // --- LÓGICA DE CONFIGURACIÓN ---
    const settingsModal = document.getElementById('settings-modal');
    const matriculaToggle = document.getElementById('show-matricula-toggle');

    document.getElementById('settings-btn').addEventListener('click', () => settingsModal.classList.remove('hidden'));
    document.getElementById('close-settings-modal-btn').addEventListener('click', () => settingsModal.classList.add('hidden'));

    matriculaToggle.addEventListener('change', async () => {
        const isChecked = matriculaToggle.checked;
        await window.api.saveSetting({ key: 'showMatricula', value: isChecked });
        state.settings.showMatricula = isChecked;
        applyMatriculaVisibility();
    });

    function applyMatriculaVisibility() {
        const show = state.settings.showMatricula === 'true';
        document.querySelectorAll('.matricula-col').forEach(col => {
            col.style.display = show ? '' : 'none';
        });
    }

    async function loadSettings() {
        const settings = await window.api.getSettings();
        state.settings = settings;
        matriculaToggle.checked = settings.showMatricula === 'true';
        applyMatriculaVisibility();
    }

    // --- LÓGICA DE AÑADIR VARIOS ALUMNOS ---
    const addMultipleModal = document.getElementById('add-multiple-students-modal');
    document.getElementById('add-multiple-students-btn').addEventListener('click', () => addMultipleModal.classList.remove('hidden'));
    document.getElementById('cancel-add-multiple-btn').addEventListener('click', () => addMultipleModal.classList.add('hidden'));
    document.getElementById('save-multiple-students-btn').addEventListener('click', async () => {
        const textarea = document.getElementById('student-list-textarea');
        const lines = textarea.value.trim().split('\n');
        const students = lines.map(line => {
            const parts = line.split(',');
            let id = null, name;
            if (parts.length > 1 && !isNaN(parts[0].trim())) {
                id = parts[0].trim();
                name = parts.slice(1).join(',').trim();
            } else {
                name = line.trim();
            }
            return { name, id };
        }).filter(s => s.name);

        if (students.length > 0) {
            try {
                await window.api.addMultipleStudents({ students, groupId: state.selectedGroupId });
                showNotification(`${students.length} alumnos añadidos con éxito.`);
                loadStudents(state.selectedGroupId);
            } catch (error) {
                showNotification(`Error al añadir alumnos: ${error.message}`, 'error');
            }
        }

        textarea.value = '';
        addMultipleModal.classList.add('hidden');
    });

    // --- LÓGICA DE AÑADIR UN ALUMNO (MODAL) ---
    const addStudentModal = document.getElementById('add-student-modal');
    const addStudentForm = document.getElementById('add-student-form');

    document.getElementById('add-student-btn').addEventListener('click', () => {
        if (state.selectedGroupId) {
            addStudentModal.classList.remove('hidden');
            addStudentForm.reset();
            document.getElementById('new-student-name').focus();
        } else {
            showNotification('Selecciona un grupo para añadir un alumno.', 'error');
        }
    });

    document.getElementById('cancel-add-student-btn').addEventListener('click', () => {
        addStudentModal.classList.add('hidden');
    });

    addStudentForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const studentData = {
            name: document.getElementById('new-student-name').value,
            studentId: document.getElementById('new-student-id').value,
            groupId: state.selectedGroupId
        };

        try {
            await window.api.addStudent(studentData);
            showNotification('Alumno añadido con éxito.');
            loadStudents(state.selectedGroupId);
            addStudentModal.classList.add('hidden');
        } catch (error) {
            showNotification(`Error al añadir alumno: ${error.message}`, 'error');
        }
    });

    // --- LÓGICA DEL DASHBOARD ---
    async function loadTodayClasses() {
        const list = document.getElementById('today-classes-list');
        const classes = await window.api.getTodayClasses();
        if (classes.length === 0) {
            list.innerHTML = '<p>No hay clases programadas para hoy.</p>';
            return;
        }
        list.innerHTML = '';
        const ul = document.createElement('ul');
        ul.className = 'today-classes-list';
        classes.forEach(c => {
            const li = document.createElement('li');
            li.textContent = `${c.group_name} - ${c.subject_name}`;
            ul.appendChild(li);
        });
        list.appendChild(ul);
    }

    async function checkPendingAttendance() {
        const alertsContainer = document.getElementById('dashboard-alerts');
        alertsContainer.innerHTML = '';
        const notifications = await window.api.checkPendingAttendance();
        notifications.forEach(noti => {
            const alertDiv = document.createElement('div');
            alertDiv.className = 'alert alert-warning';
            alertDiv.innerHTML = `<p><strong>Recordatorio:</strong> Parece que no se registró la asistencia para <strong>${noti.groupName}</strong> el día ${noti.date}.</p>`;
            alertsContainer.appendChild(alertDiv);
        });
    }

    // --- INICIALIZACIÓN Y HELPERS ---
    function showNotification(message, type = 'success') {
        const container = document.getElementById('notification-container');
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;

        container.appendChild(notification);

        setTimeout(() => {
            notification.remove();
        }, 4400);
    }

    async function init() {
        const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
        const container = document.getElementById('class-days-checkboxes');
        days.forEach((day, index) => {
            container.innerHTML += `<label><input type="checkbox" value="${index}"> ${day}</label>`;
        });

        await loadSettings();
        navigateTo('inicio');
    }

    async function loadGroupsForSelect(selectElement, showPrompt = false) {
        const groups = await window.api.getGroups();
        selectElement.innerHTML = '';
        if (showPrompt) {
            const option = document.createElement('option');
            option.value = '';
            option.textContent = '-- Selecciona un grupo --';
            selectElement.appendChild(option);
        }
        groups.forEach(group => {
            const option = document.createElement('option');
            option.value = group.id;
            option.textContent = `${group.group_name} - ${group.subject_name}`;
            selectElement.appendChild(option);
        });
        selectElement.dispatchEvent(new Event('change'));
    }

    document.querySelector('.tabs').addEventListener('click', (e) => {
        if(e.target.classList.contains('tab-link')) {
            const tabId = e.target.dataset.tab;
            document.querySelectorAll('.tab-link').forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');
            document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === tabId));
        }
    });

    init();
});