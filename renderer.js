// renderer.js
// Este archivo maneja toda la lógica del lado del cliente (interfaz de usuario).

document.addEventListener('DOMContentLoaded', () => {
    // --- ESTADO GLOBAL DE LA APLICACIÓN ---
    const state = {
        currentView: 'inicio',
        selectedGroupId: null,
        groups: [],
        settings: {}
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
        if (sectionId === 'inicio') checkPendingAttendance();
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
    
    // Clic en un grupo de la lista
    groupsList.addEventListener('click', (e) => {
        if (e.target.tagName === 'LI') {
            const groupId = parseInt(e.target.dataset.groupId);
            selectGroup(groupId);
        }
    });

    async function selectGroup(groupId) {
        state.selectedGroupId = groupId;
        // Resaltar en la lista
        document.querySelectorAll('#groups-list li').forEach(li => {
            li.classList.toggle('selected', parseInt(li.dataset.groupId) === groupId);
        });

        const group = await window.api.getGroupById(groupId);
        if (!group) return;

        // Rellenar formulario de configuración
        groupForm.querySelector('#group-id').value = group.id;
        groupForm.querySelector('#group-name').value = group.group_name;
        groupForm.querySelector('#subject-name').value = group.subject_name;
        groupForm.querySelector('#start-date').value = group.start_date;
        groupForm.querySelector('#end-date').value = group.end_date;
        groupForm.querySelector('#partial1-end-date').value = group.partial1_end_date;
        
        // Marcar checkboxes de días de clase
        const classDays = group.class_days ? group.class_days.split(',').map(Number) : [];
        document.querySelectorAll('#class-days-checkboxes input').forEach(cb => {
            cb.checked = classDays.includes(parseInt(cb.value));
        });

        // Cargar alumnos
        loadStudents(groupId);
        
        groupDetailsView.classList.remove('hidden');
        noGroupSelectedView.classList.add('hidden');
    }
    
    // Guardar grupo (nuevo o existente)
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

        if (id) {
            groupData.id = id;
            await window.api.updateGroup(groupData);
        } else {
            await window.api.addGroup(groupData);
        }
        resetGroupView();
    });
    
    // Botón para crear un nuevo grupo
    document.getElementById('add-group-btn').addEventListener('click', () => {
        state.selectedGroupId = null;
        groupForm.reset();
        document.getElementById('group-id').value = '';
        document.querySelectorAll('#groups-list li').forEach(li => li.classList.remove('selected'));
        studentsTableBody.innerHTML = ''; // Limpiar tabla de alumnos
        groupDetailsView.classList.remove('hidden');
        noGroupSelectedView.classList.add('hidden');
    });

    // Eliminar grupo
    document.getElementById('delete-group-btn').addEventListener('click', async () => {
        if(state.selectedGroupId && confirm('¿Estás seguro de que quieres eliminar este grupo y todos sus alumnos y registros de asistencia?')) {
            await window.api.deleteGroup(state.selectedGroupId);
            resetGroupView();
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
    
    // Eliminar un alumno
    studentsTableBody.addEventListener('click', async (e) => {
        if(e.target.classList.contains('action-link')) {
            const studentId = e.target.dataset.studentId;
            if (confirm('¿Seguro que quieres eliminar a este alumno?')) {
                await window.api.deleteStudent(studentId);
                loadStudents(state.selectedGroupId);
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
        
        // Construir la tabla HTML
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
    
    // Clic en una celda de asistencia para cambiar el estado
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

            // Actualizar DB
            window.api.setAttendance(attendance);

            // Actualizar UI
            cell.textContent = {'Presente': '✅', 'Ausente': '❌', 'Retardo': '🕒'}[newStatus];
            cell.className = `status-cell status-${newStatus.toLowerCase()}`;
        }
    });

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
            await window.api.addMultipleStudents({ students, groupId: state.selectedGroupId });
            loadStudents(state.selectedGroupId);
        }
        
        textarea.value = '';
        addMultipleModal.classList.add('hidden');
    });

    // --- LÓGICA DEL DASHBOARD ---
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

    // --- INICIALIZACIÓN ---
    async function init() {
        // Generar checkboxes de días de clase
        const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
        const container = document.getElementById('class-days-checkboxes');
        days.forEach((day, index) => {
            container.innerHTML += `<label><input type="checkbox" value="${index}"> ${day}</label>`;
        });
        
        await loadSettings();
        navigateTo('inicio'); // Vista inicial
    }
    
    // Función de ayuda para cargar grupos en un <select>
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
        // Disparar un change para cargar datos si hay un grupo seleccionado
        selectElement.dispatchEvent(new Event('change'));
    }

    // Pestañas en la vista de Grupos
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
