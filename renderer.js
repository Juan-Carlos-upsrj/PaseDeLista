// renderer.js
// Este archivo maneja toda la lógica del lado del cliente (interfaz de usuario).

document.addEventListener('DOMContentLoaded', () => {
    // --- ESTADO GLOBAL DE LA APLICACIÓN ---
    const state = {
        currentView: 'inicio',
        selectedGroupId: null,
        groups: [],
        settings: {}, // Will hold showMatricula, globalStartDate, globalPartial1EndDate, globalEndDate
        reportData: null,
        virtualGrid: { // State for the virtualized attendance grid
            data: [],
            students: [],
            classDates: [],
            rowHeight: 40,
            colWidth: 80,
            scrollTop: 0,
            scrollLeft: 0,
        }
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

        if (sectionId === 'grupos') loadGroups();
        if (sectionId === 'asistencia') loadGroupsForSelect(attendanceGroupSelect, true);
        if (sectionId === 'reportes') loadGroupsForSelect(document.getElementById('report-group-select'), true);
        if (sectionId === 'inicio') {
            loadDashboard();
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

    // --- LÓGICA DE ASISTENCIA (VIRTUALIZADA) ---
    const statusIconMap = {
        'Presente': 'P',
        'Ausente': 'A',
        'Retardo': 'R',
        'Pendiente': '—'
    };

    attendanceGroupSelect.addEventListener('change', () => {
        const groupId = parseInt(attendanceGroupSelect.value);
        if (groupId) {
            setupAttendanceGrid(groupId);
        } else {
            attendanceGridContainer.innerHTML = '';
        }
    });

    let lastScrollListener = null;
    attendanceGridContainer.removeEventListener('scroll', lastScrollListener);
    lastScrollListener = () => renderVisibleGrid();
    attendanceGridContainer.addEventListener('scroll', lastScrollListener);

    async function setupAttendanceGrid(groupId) {
        attendanceGridContainer.innerHTML = '<p class="p-4">Cargando datos de asistencia...</p>';

        const { globalStartDate, globalEndDate } = state.settings;
        if (!globalStartDate || !globalEndDate) {
            attendanceGridContainer.innerHTML = '<p class="p-4">Por favor, establece las fechas de "Inicio y Fin de Cuatrimestre" en la Configuración Global para continuar.</p>';
            return;
        }

        const [group, students, attendanceData] = await Promise.all([
            window.api.getGroupById(groupId),
            window.api.getStudents(groupId),
            window.api.getAttendance(groupId)
        ]);

        if (!group.class_days) {
            attendanceGridContainer.innerHTML = '<p class="p-4">Este grupo no tiene configurados los días de clase.</p>';
            return;
        }

        const classDays = group.class_days.split(',').map(Number);
        const classDates = [];
        for (let d = new Date(globalStartDate + 'T00:00:00'); d <= new Date(globalEndDate + 'T00:00:00'); d.setDate(d.getDate() + 1)) {
            if (classDays.includes(d.getDay())) {
                classDates.push(new Date(d));
            }
        }

        const attendanceMap = new Map();
        attendanceData.forEach(att => attendanceMap.set(`${att.student_id}-${att.attendance_date}`, att.status));

        state.virtualGrid.data = students.map(student => {
            return classDates.map(date => {
                const dateString = date.toISOString().split('T')[0];
                return attendanceMap.get(`${student.id}-${dateString}`) || 'Pendiente';
            });
        });
        state.virtualGrid.students = students;
        state.virtualGrid.classDates = classDates;
        state.virtualGrid.colWidth = 60;
        state.virtualGrid.rowHeight = 35;

        attendanceGridContainer.innerHTML = '';
        const content = document.createElement('div');
        content.className = 'attendance-grid-content';
        content.style.width = `${classDates.length * state.virtualGrid.colWidth + 200}px`;
        content.style.height = `${students.length * state.virtualGrid.rowHeight}px`;
        attendanceGridContainer.appendChild(content);

        renderVisibleGrid();
    }

    function renderVisibleGrid() {
        const { data, students, classDates, rowHeight, colWidth } = state.virtualGrid;
        const content = attendanceGridContainer.querySelector('.attendance-grid-content');
        if (!content) return;

        const scrollTop = attendanceGridContainer.scrollTop;
        const scrollLeft = attendanceGridContainer.scrollLeft;
        const viewportHeight = attendanceGridContainer.clientHeight;
        const viewportWidth = attendanceGridContainer.clientWidth;

        const firstRow = Math.max(0, Math.floor(scrollTop / rowHeight));
        const lastRow = Math.min(data.length, Math.ceil((scrollTop + viewportHeight) / rowHeight));

        const firstCol = Math.max(0, Math.floor(scrollLeft / colWidth));
        const lastCol = Math.min(classDates.length, Math.ceil((scrollLeft + viewportWidth) / colWidth) + 1);

        const fragment = document.createDocumentFragment();

        const header = document.createElement('div');
        header.className = 'attendance-grid-header';
        header.style.width = `${200 + classDates.length * colWidth}px`;

        const studentHeaderCell = document.createElement('div');
        studentHeaderCell.className = 'attendance-grid-cell student-name-cell';
        studentHeaderCell.textContent = 'Alumno';
        studentHeaderCell.style.width = '200px';
        studentHeaderCell.style.position = 'sticky';
        studentHeaderCell.style.left = '0';
        header.appendChild(studentHeaderCell);

        for (let j = 0; j < classDates.length; j++) {
            const date = classDates[j];
            const dateCell = document.createElement('div');
            dateCell.className = 'attendance-grid-cell date-header-cell';
            dateCell.textContent = date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
            dateCell.style.width = `${colWidth}px`;
            dateCell.style.flexShrink = '0';
            header.appendChild(dateCell);
        }
        fragment.appendChild(header);

        for (let i = firstRow; i < lastRow; i++) {
            const student = students[i];
            const top = i * rowHeight;

            const nameCell = document.createElement('div');
            nameCell.className = 'attendance-grid-cell student-name-cell';
            nameCell.textContent = student.student_name;
            nameCell.style.width = '200px';
            nameCell.style.height = `${rowHeight}px`;
            nameCell.style.top = `${top}px`;
            nameCell.style.left = `${scrollLeft}px`;
            fragment.appendChild(nameCell);

            for (let j = firstCol; j < lastCol; j++) {
                const status = data[i][j];
                const cell = document.createElement('div');
                cell.className = `attendance-grid-cell status-cell status-${status.toLowerCase()}`;
                cell.textContent = statusIconMap[status];
                cell.dataset.studentId = student.id;
                cell.dataset.date = classDates[j].toISOString().split('T')[0];
                cell.dataset.status = status;
                cell.dataset.row = i;
                cell.dataset.col = j;
                cell.style.width = `${colWidth}px`;
                cell.style.height = `${rowHeight}px`;
                cell.style.top = `${top}px`;
                cell.style.left = `${200 + j * colWidth}px`;
                fragment.appendChild(cell);
            }
        }

        content.innerHTML = '';
        content.appendChild(fragment);
    }

    attendanceGridContainer.addEventListener('click', (e) => {
        if(e.target.classList.contains('status-cell')) {
            const cell = e.target;
            const currentStatus = cell.dataset.status;
            let newStatus;

            if (currentStatus === 'Pendiente') newStatus = 'Presente';
            else if (currentStatus === 'Presente') newStatus = 'Retardo';
            else if (currentStatus === 'Retardo') newStatus = 'Ausente';
            else newStatus = 'Presente';

            const attendance = {
                studentId: cell.dataset.studentId,
                date: cell.dataset.date,
                status: newStatus
            };

            window.api.setAttendance(attendance);

            cell.textContent = statusIconMap[newStatus];
            cell.className = `status-cell status-${newStatus.toLowerCase()}`;
            cell.dataset.status = newStatus;

            state.virtualGrid.data[cell.dataset.row][cell.dataset.col] = newStatus;
        }
    });

    document.getElementById('quick-pass-btn').addEventListener('click', async () => {
        const { data, students, classDates } = state.virtualGrid;

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const todayIndex = classDates.findIndex(d => d.getTime() === today.getTime());

        if (todayIndex === -1) {
            showNotification('No hay clase programada para hoy.', 'error');
            return;
        }

        const todayDateString = classDates[todayIndex].toISOString().split('T')[0];
        let updates = 0;
        const promises = [];

        for (let i = 0; i < data.length; i++) {
            if (data[i][todayIndex] === 'Pendiente') {
                const studentId = students[i].id;
                promises.push(window.api.setAttendance({ studentId, date: todayDateString, status: 'Presente' }));
                data[i][todayIndex] = 'Presente';
                updates++;
            }
        }

        if (updates > 0) {
            await Promise.all(promises);
            renderVisibleGrid();
            showNotification(`${updates} alumnos marcados como "Presente" para hoy.`);
        } else {
            showNotification('No hay alumnos pendientes para marcar en la fecha de hoy.', 'error');
        }
    });

    // --- LÓGICA DE REPORTES ---
    const generateReportBtn = document.getElementById('generate-report-btn');
    const reportResultsContainer = document.getElementById('report-results-container');
    const exportCsvBtn = document.getElementById('export-csv-btn');
    const exportPdfBtn = document.getElementById('export-pdf-btn');
    const reportSearchInput = document.getElementById('report-search-input');

    generateReportBtn.addEventListener('click', generateReport);
    reportSearchInput.addEventListener('input', () => renderReportTable(state.reportData));

    function renderReportTable(data) {
        if (!data) {
            reportResultsContainer.innerHTML = '<p>No hay datos de reporte para mostrar. Genera un reporte primero.</p>';
            return;
        }

        const searchTerm = reportSearchInput.value.toLowerCase();
        const filteredData = data.filter(row => row.studentName.toLowerCase().includes(searchTerm));

        if (filteredData.length === 0) {
            reportResultsContainer.innerHTML = '<p>No se encontraron alumnos que coincidan con la búsqueda.</p>';
            return;
        }

        let tableHTML = `<table class="data-table report-table">
            <thead>
                <tr>
                    <th class="matricula-col">Matrícula</th>
                    <th class="student-name-col">Alumno</th>
                    <th class="number-col">Asist.</th>
                    <th class="number-col">Ret.</th>
                    <th class="number-col">Faltas</th>
                    <th class="number-col">% Asist.</th>
                </tr>
            </thead>
            <tbody>`;

        filteredData.forEach(res => {
            const lowAttendanceClass = parseFloat(res.percentage) <= 80.0 ? 'low-attendance-row' : '';
            tableHTML += `<tr class="${lowAttendanceClass}">
                <td class="matricula-col">${res.studentId || ''}</td>
                <td class="student-name-col">${res.studentName}</td>
                <td class="number-col">${res.presente}</td>
                <td class="number-col">${res.retardo}</td>
                <td class="number-col">${res.ausente}</td>
                <td class="number-col">${res.percentage}%</td>
            </tr>`;
        });

        tableHTML += '</tbody></table>';
        reportResultsContainer.innerHTML = tableHTML;
        applyMatriculaVisibility();
    }

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
        const { globalStartDate, globalPartial1EndDate, globalEndDate } = state.settings;

        reportSearchInput.value = '';

        if (!groupId) {
            showNotification('Por favor, selecciona un grupo.', 'error');
            return;
        }
        if (!globalStartDate || !globalPartial1EndDate || !globalEndDate) {
            showNotification('Por favor, configura todas las fechas globales (Inicio, Fin de Parcial y Fin de Cuatrimestre) en la Configuración Global.', 'error');
            return;
        }

        reportResultsContainer.innerHTML = 'Generando reporte...';
        exportCsvBtn.disabled = true;
        exportPdfBtn.disabled = true;
        state.reportData = null;

        const group = await window.api.getGroupById(groupId);
        const students = await window.api.getStudents(groupId);
        const attendanceData = await window.api.getAttendance(groupId);

        if (!group.class_days) {
            reportResultsContainer.innerHTML = '<p>El grupo seleccionado no tiene configurados los días de clase.</p>';
            return;
        }

        const groupStartDate = new Date(globalStartDate + 'T00:00:00');
        const groupEndDate = new Date(globalEndDate + 'T00:00:00');
        const partial1EndDate = new Date(globalPartial1EndDate + 'T00:00:00');

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
        renderReportTable(state.reportData);
        exportCsvBtn.disabled = false;
        exportPdfBtn.disabled = false;
    }

    // --- LÓGICA DE CONFIGURACIÓN ---
    const settingsModal = document.getElementById('settings-modal');
    const matriculaToggle = document.getElementById('show-matricula-toggle');
    const globalStartDateInput = document.getElementById('global-start-date');
    const globalPartial1EndDateInput = document.getElementById('global-partial1-end-date');
    const globalEndDateInput = document.getElementById('global-end-date');

    document.getElementById('settings-btn').addEventListener('click', () => settingsModal.classList.remove('hidden'));
    document.getElementById('close-settings-modal-btn').addEventListener('click', () => settingsModal.classList.add('hidden'));

    matriculaToggle.addEventListener('change', async () => {
        const isChecked = matriculaToggle.checked;
        state.settings.showMatricula = isChecked.toString();
        await window.api.saveSetting({ key: 'showMatricula', value: state.settings.showMatricula });
        applyMatriculaVisibility();
    });

    globalStartDateInput.addEventListener('change', async () => {
        const value = globalStartDateInput.value;
        state.settings.globalStartDate = value;
        await window.api.saveSetting({ key: 'globalStartDate', value });
    });

    globalPartial1EndDateInput.addEventListener('change', async () => {
        const value = globalPartial1EndDateInput.value;
        state.settings.globalPartial1EndDate = value;
        await window.api.saveSetting({ key: 'globalPartial1EndDate', value });
    });

    globalEndDateInput.addEventListener('change', async () => {
        const value = globalEndDateInput.value;
        state.settings.globalEndDate = value;
        await window.api.saveSetting({ key: 'globalEndDate', value });
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
        globalStartDateInput.value = settings.globalStartDate || '';
        globalPartial1EndDateInput.value = settings.globalPartial1EndDate || '';
        globalEndDateInput.value = settings.globalEndDate || '';
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
    function createClassCard(group, isInteractive = false) {
        const card = document.createElement('div');
        card.className = 'class-card';
        if (isInteractive) {
            card.classList.add('interactive');
            card.dataset.groupId = group.id;
        }

        card.innerHTML = `
            <h4>${group.group_name}</h4>
            <p>${group.subject_name}</p>
        `;
        return card;
    }

    async function loadDashboard() {
        const todayCardsContainer = document.getElementById('today-classes-cards');
        const futureContentContainer = document.getElementById('future-classes-content');

        todayCardsContainer.innerHTML = '<p>Cargando...</p>';
        futureContentContainer.innerHTML = '';

        const info = await window.api.getDashboardInfo();

        // Render Today's Classes
        todayCardsContainer.innerHTML = '';
        if (info.today.length > 0) {
            info.today.forEach(group => {
                const card = createClassCard(group, true);
                todayCardsContainer.appendChild(card);
            });
        } else {
            todayCardsContainer.innerHTML = '<p>No hay clases programadas para hoy.</p>';
        }

        // Render Future Classes
        futureContentContainer.innerHTML = '';
        if (info.tomorrow.length > 0) {
            futureContentContainer.innerHTML = '<h4>Mañana</h4>';
            const tomorrowCardsContainer = document.createElement('div');
            tomorrowCardsContainer.className = 'class-cards-container';
            info.tomorrow.forEach(group => {
                const card = createClassCard(group, false);
                tomorrowCardsContainer.appendChild(card);
            });
            futureContentContainer.appendChild(tomorrowCardsContainer);
        } else if (info.nextAvailable) {
            const nextDate = new Date(info.nextAvailable.date);
            const formattedDate = nextDate.toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

            futureContentContainer.innerHTML = `<p class="rest-day-message">Disfruta tu descanso. Tienes clase hasta el <strong>${formattedDate}</strong>.</p>`;

            const nextCardsContainer = document.createElement('div');
            nextCardsContainer.className = 'class-cards-container';
            info.nextAvailable.classes.forEach(group => {
                const card = createClassCard(group, false);
                nextCardsContainer.appendChild(card);
            });
            futureContentContainer.appendChild(nextCardsContainer);
        } else {
            futureContentContainer.innerHTML = '<p>No hay más clases programadas en el cuatrimestre.</p>';
        }
    }

    document.getElementById('today-classes-cards').addEventListener('click', (e) => {
        const card = e.target.closest('.class-card.interactive');
        if (card) {
            const groupId = card.dataset.groupId;

            navigateTo('asistencia');

            setTimeout(() => {
                attendanceGroupSelect.value = groupId;
                attendanceGroupSelect.dispatchEvent(new Event('change'));
            }, 100);
        }
    });

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