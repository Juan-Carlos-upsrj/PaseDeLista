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

    // --- LÓGICA DE ASISTENCIA (TABLA ESTÁNDAR) ---
    const statusIconMap = { 'Presente': 'P', 'Ausente': 'A', 'Retardo': 'R', 'Intercambio': 'I', 'Pendiente': '—' };

    attendanceGroupSelect.addEventListener('change', () => {
        const groupId = parseInt(attendanceGroupSelect.value);
        if (groupId) {
            renderAttendanceGrid(groupId);
        } else {
            attendanceGridContainer.innerHTML = '';
        }
    });

function generateAttendanceGridHTML(group, students, attendanceData, settings, options = {}) {
    const { includeSummaryColumns = false, forPDF = false } = options;
    const { globalStartDate, globalEndDate, globalPartial1EndDate } = settings;

    const classDays = group.class_days.split(',').map(Number);
    const partial1End = new Date(globalPartial1EndDate + 'T00:00:00');
    const allClassDates = [];

    for (let d = new Date(globalStartDate + 'T00:00:00'); d <= new Date(globalEndDate + 'T00:00:00'); d.setDate(d.getDate() + 1)) {
        if (classDays.includes(d.getDay())) {
            allClassDates.push(new Date(d));
        }
    }

    const attendanceMap = new Map();
    attendanceData.forEach(att => attendanceMap.set(`${att.student_id}-${att.attendance_date}`, att.status));

    const todayString = new Date().toISOString().split('T')[0];
    let tableHTML = `<table class="${forPDF ? 'attendance-table' : 'data-table'}" ${forPDF ? '' : 'id="attendance-table"'}>`;

    // --- ENCABEZADO ---
    const monthColspans = {};
    const partialColspans = {};
    allClassDates.forEach(date => {
        const monthName = date.toLocaleDateString('es-MX', { month: 'long' }).toUpperCase();
        const partialName = date <= partial1End ? "Primer Parcial" : "Segundo Parcial";
        monthColspans[monthName] = (monthColspans[monthName] || 0) + 1;
        partialColspans[`${monthName}-${partialName}`] = (partialColspans[`${monthName}-${partialName}`] || 0) + 1;
    });

    let monthRow = `<thead><th class="student-name-cell" rowspan="3">Alumno</th>`;
    let partialRow = `<tr>`;
    let dateRow = `<tr>`;

    const addedMonths = new Set();
    let colorIndex = 1;
    allClassDates.forEach(date => {
        const monthName = date.toLocaleDateString('es-MX', { month: 'long' }).toUpperCase();
        if (!addedMonths.has(monthName)) {
            monthRow += `<th colspan="${monthColspans[monthName]}" class="month-header ${forPDF ? '' : `month-bg-${colorIndex}`}">${monthName}</th>`;
            addedMonths.add(monthName);
            colorIndex = colorIndex === 1 ? 2 : 1;
        }
    });
    if (includeSummaryColumns) {
        monthRow += `<th class="summary-cell" colspan="4">Resumen</th>`;
    }
    monthRow += `</tr>`;

    const addedPartials = new Set();
    allClassDates.forEach(date => {
        const monthName = date.toLocaleDateString('es-MX', { month: 'long' }).toUpperCase();
        const partialName = date <= partial1End ? "Primer Parcial" : "Segundo Parcial";
        if (!addedPartials.has(`${monthName}-${partialName}`)) {
            partialRow += `<th colspan="${partialColspans[`${monthName}-${partialName}`]}" class="partial-header">${partialName}</th>`;
            addedPartials.add(`${monthName}-${partialName}`);
        }
    });
    if (includeSummaryColumns) {
        partialRow += `<th class="summary-cell" rowspan="2">Asist.</th><th class="summary-cell" rowspan="2">Ret.</th><th class="summary-cell" rowspan="2">Faltas</th><th class="summary-cell" rowspan="2">% Asist.</th>`;
    }
    partialRow += `</tr>`;

    allClassDates.forEach(date => {
        const isToday = !forPDF && date.toISOString().split('T')[0] === todayString;
        const dateHeaderClass = forPDF ? 'date-header' : `date-header ${isToday ? 'today-col' : ''}`;
        dateRow += `<th class="${dateHeaderClass}">${forPDF ? date.toLocaleDateString('es-MX', { day: '2-digit' }) : date.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}</th>`;
    });
    dateRow += `</tr></thead>`;

    tableHTML += monthRow + partialRow + dateRow;

    // --- CUERPO ---
    tableHTML += '<tbody>';
    students.forEach(student => {
        let presente = 0, ausente = 0, retardo = 0;
        tableHTML += `<tr><td class="student-name-cell">${student.student_name}</td>`;
        allClassDates.forEach(date => {
            const dateString = date.toISOString().split('T')[0];
            const status = attendanceMap.get(`${student.id}-${dateString}`) || 'Pendiente';

            if (status === 'Presente') presente++;
            else if (status === 'Retardo') retardo++;
            else if (status === 'Ausente' || (includeSummaryColumns && status === 'Pendiente')) ausente++;

            if (forPDF) {
                 tableHTML += `<td class="status-cell">${statusIconMap[status]}</td>`;
            } else {
                const isToday = dateString === todayString;
                tableHTML += `<td class="status-cell status-${status.toLowerCase()} ${isToday ? 'today-col' : ''}" data-student-id="${student.id}" data-date="${dateString}" data-status="${status}">${statusIconMap[status]}</td>`;
            }
        });

        if (includeSummaryColumns) {
            const totalClasses = allClassDates.length;
            const percentage = totalClasses > 0 ? ((presente + retardo) / totalClasses) * 100 : 0;
            tableHTML += `<td class="summary-cell">${presente}</td><td class="summary-cell">${retardo}</td><td class="summary-cell">${ausente}</td><td class="summary-cell">${percentage.toFixed(1)}%</td>`;
        }
        tableHTML += `</tr>`;
    });
    tableHTML += '</tbody></table>';

    return tableHTML;
}


async function renderAttendanceGrid(groupId) {
    attendanceGridContainer.innerHTML = '<p class="p-4">Cargando...</p>';

    const { globalStartDate, globalEndDate, globalPartial1EndDate } = state.settings;
    if (!globalStartDate || !globalEndDate || !globalPartial1EndDate) {
        attendanceGridContainer.innerHTML = '<p class="p-4">Por favor, establece las fechas de inicio, fin de parcial y fin de cuatrimestre en la Configuración Global.</p>';
        return;
    }

    const [group, students, attendanceData] = await Promise.all([
        window.api.getGroupById(groupId),
        window.api.getStudents(groupId),
        window.api.getAttendance(groupId)
    ]);

    if (!group.class_days || students.length === 0) {
        attendanceGridContainer.innerHTML = '<p class="p-4">Este grupo no tiene días de clase configurados o no tiene alumnos.</p>';
        return;
    }

    const tableHTML = generateAttendanceGridHTML(group, students, attendanceData, state.settings, { includeSummaryColumns: false, forPDF: false });
    attendanceGridContainer.innerHTML = tableHTML;
}

    attendanceGridContainer.addEventListener('click', (e) => {
        if (e.target.classList.contains('status-cell')) {
            const cell = e.target;
            const currentStatus = cell.dataset.status;
            let newStatus;

            if (currentStatus === 'Pendiente') newStatus = 'Presente';
            else if (currentStatus === 'Presente') newStatus = 'Retardo';
            else if (currentStatus === 'Retardo') newStatus = 'Ausente';
            else if (currentStatus === 'Ausente') newStatus = 'Intercambio';
            else newStatus = 'Pendiente';

            cell.dataset.status = newStatus;
            cell.className = `status-cell status-${newStatus.toLowerCase()}`;
            cell.textContent = statusIconMap[newStatus];

            window.api.setAttendance({
                studentId: cell.dataset.studentId,
                date: cell.dataset.date,
                status: newStatus
            });
        }
    });

    document.getElementById('export-full-attendance-pdf-btn').addEventListener('click', async () => {
        const groupId = parseInt(attendanceGroupSelect.value);
        if (!groupId) {
            showNotification('Por favor, selecciona un grupo para exportar.', 'error');
            return;
        }

        showNotification('Generando PDF, por favor espera...');

        // 1. Obtener todos los datos necesarios
        const group = await window.api.getGroupById(groupId);
        const students = await window.api.getStudents(groupId);
        const attendanceData = await window.api.getAttendance(groupId);
        const { globalStartDate, globalEndDate, globalPartial1EndDate } = state.settings;

        // 2. Construir la tabla HTML usando la función refactorizada
        const tableHTML = generateAttendanceGridHTML(group, students, attendanceData, state.settings, { includeSummaryColumns: true, forPDF: true });

        // 3. Construir el HTML completo
        const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Reporte Completo de Asistencia</title>
                <style>
                    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; margin: 15px; font-size: 8px; }
                    .header { text-align: center; margin-bottom: 20px; }
                    .header h1 { margin: 0; font-size: 16px; }
                    .header p { margin: 2px 0; font-size: 10px; }
                    .attendance-table { width: 100%; border-collapse: collapse; font-size: 8px; }
                    .attendance-table th, .attendance-table td { border: 1px solid #ccc; padding: 4px; text-align: center; }
                    .attendance-table th { background-color: #f2f2f2; font-weight: bold; }
                    .student-name-cell { text-align: left; font-weight: bold; width: 120px; }
                    .summary-cell { background-color: #e8f4fd; font-weight: bold; }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>Reporte Completo de Asistencia</h1>
                    <p>${group.group_name} - ${group.subject_name}</p>
                    <p>Periodo: Cuatrimestre Completo</p>
                </div>
                ${tableHTML}
            </body>
            </html>
        `;

        // 4. Llamar a la API para exportar
        const safeGroupName = (`${group.group_name}_${group.subject_name}`).replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const defaultFilename = `asistencia_completa_${safeGroupName}.pdf`;

        const result = await window.api.exportFormattedPdf({ htmlContent, defaultFilename });
        if (result.success) {
            showNotification('Reporte PDF exportado con éxito.');
        } else if (!result.cancelled) {
            showNotification(`Error al exportar a PDF: ${result.error}`, 'error');
        }
    });

    document.getElementById('quick-pass-btn').addEventListener('click', async () => {
        const groupId = parseInt(attendanceGroupSelect.value);
        if (!groupId) return;

        const today = new Date().toISOString().split('T')[0];
        const cellsToUpdate = document.querySelectorAll(`#attendance-table td.status-cell[data-date="${today}"][data-status="Pendiente"]`);

        if (cellsToUpdate.length === 0) {
            showNotification('No hay alumnos pendientes para marcar hoy.', 'error');
            return;
        }

        const promises = [];
        cellsToUpdate.forEach(cell => {
            const studentId = cell.dataset.studentId;
            promises.push(window.api.setAttendance({ studentId, date: today, status: 'Presente' }));
        });

        await Promise.all(promises);
        showNotification(`${cellsToUpdate.length} alumnos marcados como "Presente".`);
        renderAttendanceGrid(groupId);
    });

    // --- LÓGICA DE REPORTES ---
    const generateReportBtn = document.getElementById('generate-report-btn');
    const reportResultsContainer = document.getElementById('report-results-container');
    const exportCsvBtn = document.getElementById('export-csv-btn');
    const exportPdfBtn = document.getElementById('export-pdf-btn');
    const reportSearchInput = document.getElementById('report-search-input');
    let reportChart = null; // Variable to hold the chart instance

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
        if (!state.reportData) {
            showNotification('Primero genera un reporte para poder exportarlo.', 'error');
            return;
        }

        const groupId = document.getElementById('report-group-select').value;
        const group = await window.api.getGroupById(groupId);
        const groupName = `${group.group_name} - ${group.subject_name}`;

        const periodSelect = document.getElementById('report-period-select');
        const periodName = periodSelect.options[periodSelect.selectedIndex].text;

        // 1. Construir la tabla HTML
        let tableHTML = `<table class="report-table">
            <thead>
                <tr>
                    <th>Matrícula</th>
                    <th>Alumno</th>
                    <th>Asist.</th>
                    <th>Ret.</th>
                    <th>Faltas</th>
                    <th>% Asist.</th>
                </tr>
            </thead>
            <tbody>`;

        state.reportData.forEach(res => {
            const lowAttendanceClass = parseFloat(res.percentage) < 80.0 ? 'low-attendance' : '';
            tableHTML += `<tr class="${lowAttendanceClass}">
                <td>${res.studentId || ''}</td>
                <td>${res.studentName}</td>
                <td>${res.presente}</td>
                <td>${res.retardo}</td>
                <td>${res.ausente}</td>
                <td>${res.percentage}%</td>
            </tr>`;
        });
        tableHTML += '</tbody></table>';

        // 2. Obtener la imagen del gráfico
        const chartImage = reportChart ? reportChart.toBase64Image() : '';
        const chartHtml = chartImage ? `
            <div class="chart-container">
                <h3>Resumen Gráfico</h3>
                <img src="${chartImage}" alt="Gráfico de Asistencia">
            </div>` : '';

        // 3. Construir el HTML completo con estilos y gráfico
        const htmlContent = `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Reporte de Asistencia</title>
                <style>
                    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; margin: 20px; font-size: 10px; }
                    .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #ccc; padding-bottom: 10px; }
                    .header img { max-height: 70px; }
                    .header-text { text-align: right; }
                    .header-text h1 { margin: 0; font-size: 18px; }
                    .header-text p { margin: 0; font-size: 12px; }
                    .report-info { margin-top: 20px; margin-bottom: 20px; }
                    .report-info h2, .report-info p { margin: 4px 0; }
                    .report-table { width: 100%; border-collapse: collapse; font-size: 10px; margin-bottom: 30px; }
                    .report-table th, .report-table td { border: 1px solid #ddd; padding: 6px; text-align: left; }
                    .report-table th { background-color: #f2f2f2; }
                    .report-table .low-attendance { color: #D32F2F; font-weight: bold; }
                    .chart-container { text-align: center; margin-top: 20px; page-break-inside: avoid; }
                    .chart-container img { max-width: 90%; height: auto; }
                    h3 { font-size: 14px; text-align: center; margin-bottom: 15px; }
                </style>
            </head>
            <body>
                <div class="header">
                    <img src="file://${await window.api.getAssetPath('iaev-logo.png')}" alt="Logo IAEV">
                    <div class="header-text">
                        <h1>Instituto de Altos Estudios Universitarios</h1>
                        <p>Reporte de Asistencia</p>
                    </div>
                </div>

                <div class="report-info">
                    <h2>${groupName}</h2>
                    <p><strong>Periodo:</strong> ${periodName}</p>
                </div>

                ${tableHTML}
                ${chartHtml}

            </body>
            </html>
        `;

        // 4. Llamar a la API para exportar
        const safeGroupName = groupName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const safePeriodName = periodName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const defaultFilename = `reporte_${safeGroupName}_${safePeriodName}.pdf`;

        const result = await window.api.exportFormattedPdf({ htmlContent, defaultFilename });
        if (result.success) {
            showNotification('Reporte PDF exportado con éxito.');
        } else if (!result.cancelled) {
            showNotification(`Error al exportar a PDF: ${result.error}`, 'error');
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

        // --- Render Chart ---
        if (reportChart) {
            reportChart.destroy();
        }

        const ctx = document.getElementById('report-chart').getContext('2d');
        const totals = reportResults.reduce((acc, curr) => {
            acc.presente += curr.presente;
            acc.retardo += curr.retardo;
            acc.ausente += curr.ausente;
            return acc;
        }, { presente: 0, retardo: 0, ausente: 0 });

        reportChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['Presente', 'Retardo', 'Ausente'],
                datasets: [{
                    label: 'Total de Asistencias del Grupo',
                    data: [totals.presente, totals.retardo, totals.ausente],
                    backgroundColor: [
                        'rgba(75, 192, 192, 0.6)',
                        'rgba(255, 206, 86, 0.6)',
                        'rgba(255, 99, 132, 0.6)'
                    ],
                    borderColor: [
                        'rgba(75, 192, 192, 1)',
                        'rgba(255, 206, 86, 1)',
                        'rgba(255, 99, 132, 1)'
                    ],
                    borderWidth: 1
                }]
            },
            options: {
                animation: false, // Important for generating a static image
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            precision: 0 // Ensure y-axis has whole numbers
                        }
                    }
                },
                responsive: true,
                maintainAspectRatio: false
            }
        });
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

        let buttonsHTML = '';
        if (isInteractive) {
            card.classList.add('interactive');
            card.dataset.groupId = group.id; // For navigating to the grid view
            buttonsHTML = `
                <div class="class-card-actions">
                    <button class="btn btn-primary btn-sm quick-roll-call-btn" data-group-id="${group.id}">Pase Rápido</button>
                </div>
            `;
        }

        card.innerHTML = `
            <div>
                <h4>${group.group_name}</h4>
                <p>${group.subject_name}</p>
            </div>
            ${buttonsHTML}
        `;
        return card;
    }

    // --- LÓGICA DE CUMPLEAÑOS Y FRASES ---
    async function checkBirthdays() {
        const teachers = await window.api.getTeachers();
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const currentYear = today.getFullYear();
        const upcomingBirthdays = [];

        teachers.forEach(teacher => {
            const [month, day] = teacher.birthdate.split('-');
            let birthdayDate = new Date(currentYear, month - 1, day);

            if (birthdayDate < today) {
                birthdayDate.setFullYear(currentYear + 1);
            }

            const diffTime = birthdayDate - today;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays >= 0 && diffDays <= 7) {
                upcomingBirthdays.push({ ...teacher, daysUntil: diffDays });
            }
        });

        renderBirthdayContent(upcomingBirthdays);
    }

    async function renderBirthdayContent(birthdays) {
        const birthdaySection = document.getElementById('birthday-section');
        const birthdayContainer = document.getElementById('birthday-container');
        const motivationalSection = document.getElementById('motivational-quote-section');
        const quoteContainer = document.getElementById('quote-container');

        if (birthdays.length === 0) {
            birthdaySection.style.display = 'none';
            motivationalSection.style.display = 'block';

            const result = await window.api.getQuotes();
            if (result.success) {
                const motivationalQuotes = result.quotes;
                if (motivationalQuotes.length > 0) {
                    const randomIndex = Math.floor(Math.random() * motivationalQuotes.length);
                    const randomQuote = motivationalQuotes[randomIndex];

                    quoteContainer.innerHTML = `
                        <p class="quote-text">"${randomQuote.quote}"</p>
                        <p class="quote-author">- ${randomQuote.author}</p>
                    `;
                } else {
                    quoteContainer.innerHTML = '<p>No hay frases disponibles en el archivo quotes.json.</p>';
                }
            } else {
                // Muestra un error detallado si la carga falla
                quoteContainer.innerHTML = `<p style="color: var(--danger-color);">Error: ${result.error}</p>`;
            }
            return;
        }

        birthdaySection.style.display = 'block';
        motivationalSection.style.display = 'none';

        birthdays.sort((a, b) => a.daysUntil - b.daysUntil);

        let htmlContent = '';
        let isBirthdayToday = false;

        birthdays.forEach(birthday => {
            if (birthday.daysUntil === 0) {
                isBirthdayToday = true;
                htmlContent += `
                    <div class="birthday-item birthday-today">
                        <p class="birthday-item-name">🎉 ¡Feliz cumpleaños, ${birthday.name}!</p>
                        <p class="birthday-item-message">¡Que tengas un día excelente!</p>
                    </div>`;
            } else {
                htmlContent += `
                    <div class="birthday-item birthday-upcoming">
                        <p>El cumpleaños de <strong>${birthday.name}</strong> es en <strong>${birthday.daysUntil}</strong> ${birthday.daysUntil === 1 ? 'día' : 'días'}! 🎂</p>
                    </div>`;
            }
        });

        birthdayContainer.innerHTML = htmlContent;

        if (isBirthdayToday) {
            triggerBirthdayAnimation();
        }
    }

    function triggerBirthdayAnimation() {
        const celebrationContainer = document.getElementById('birthday-celebration');
        if (!celebrationContainer) return;

        const colors = ['#f44336', '#e91e63', '#9c27b0', '#673ab7', '#3f51b5', '#2196f3', '#03a9f4', '#00bcd4', '#009688', '#4caf50', '#8bc34a', '#cddc39', '#ffeb3b', '#ffc107', '#ff9800'];

        for (let i = 0; i < 20; i++) {
            const balloon = document.createElement('div');
            balloon.className = 'balloon';
            const randomColor = colors[Math.floor(Math.random() * colors.length)];
            balloon.style.backgroundColor = randomColor;
            balloon.style.color = randomColor;
            balloon.style.left = `${Math.random() * 100}vw`;
            balloon.style.animationDelay = `${Math.random() * 2}s`;
            balloon.style.animationDuration = `${Math.random() * 6 + 8}s`;
            celebrationContainer.appendChild(balloon);
        }

        for (let i = 0; i < 50; i++) {
            const confetti = document.createElement('div');
            confetti.className = 'confetti';
            confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
            confetti.style.left = `${Math.random() * 100}vw`;
            confetti.style.animationDelay = `${Math.random() * 5}s`;
            confetti.style.transform = `rotate(${Math.random() * 360}deg)`;
            celebrationContainer.appendChild(confetti);
        }

        setTimeout(() => {
            celebrationContainer.innerHTML = '';
        }, 10000);
    }

    async function renderAttendanceSummary() {
        const container = document.getElementById('attendance-summary-container');
        if (!container) return;

        container.innerHTML = '<p>Cargando resumen...</p>';
        const data = await window.api.getAttendanceSummary();

        if (!data || data.length === 0) {
            container.innerHTML = '<p>No hay datos de asistencia para mostrar.</p>';
            return;
        }

        container.innerHTML = data
            .sort((a, b) => b.value - a.value)
            .map(item => {
                let colorClass = 'progress-bar-green';
                if (item.value < 90) colorClass = 'progress-bar-yellow';
                if (item.value < 80) colorClass = 'progress-bar-red';

                return `
                    <div>
                        <div class="summary-header">
                            <span>${item.label}</span>
                            <strong>${item.value}%</strong>
                        </div>
                        <div class="progress-bar-bg">
                            <div class="${colorClass}" style="width: ${item.value}%"></div>
                        </div>
                    </div>
                `;
            }).join('');
    }

    function checkGradeDeadlines() {
        const reminderSection = document.getElementById('deadline-reminder-section');
        if (!reminderSection) return;

        const { globalPartial1EndDate, globalEndDate } = state.settings;
        if (!globalPartial1EndDate && !globalEndDate) {
            reminderSection.style.display = 'none';
            return;
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const deadlines = [
            { name: "Primer Parcial", date: globalPartial1EndDate },
            { name: "Fin de Cuatrimestre", date: globalEndDate }
        ];

        let upcomingDeadline = null;
        let daysUntil = Infinity;

        // Encontrar la próxima fecha límite más cercana
        for (const deadline of deadlines) {
            if (deadline.date) {
                const deadlineDate = new Date(deadline.date + 'T00:00:00');
                if (deadlineDate >= today) {
                    const diffTime = deadlineDate - today;
                    const currentDaysUntil = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    if (currentDaysUntil < daysUntil) {
                        daysUntil = currentDaysUntil;
                        upcomingDeadline = deadline;
                    }
                }
            }
        }

        // Mostrar el recordatorio si falta una semana o menos
        if (upcomingDeadline && daysUntil <= 7) {
            let message;
            if (daysUntil === 0) {
                message = `¡Hoy es el último día para la entrega de calificaciones del <strong>${upcomingDeadline.name}</strong>!`;
            } else {
                message = `¡Atención! La entrega de calificaciones para el <strong>${upcomingDeadline.name}</strong> es en <strong>${daysUntil} ${daysUntil === 1 ? 'día' : 'días'}</strong>.`;
            }

            reminderSection.innerHTML = `
                <div class="card">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/></svg>
                    <p>${message}</p>
                </div>
            `;
            reminderSection.style.display = 'block';
        } else {
            reminderSection.style.display = 'none';
        }
    }

    async function loadDashboard() {
        renderAttendanceSummary();
        checkGradeDeadlines();
        const todayCardsContainer = document.getElementById('today-classes-cards');
        const futureContentContainer = document.getElementById('future-classes-content');

        todayCardsContainer.innerHTML = '<p>Cargando...</p>';
        futureContentContainer.innerHTML = '';

        // Cargar cumpleaños y clases en paralelo
        const [info] = await Promise.all([
            window.api.getDashboardInfo(),
            checkBirthdays()
        ]);

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
        const quickRollCallBtn = e.target.closest('.quick-roll-call-btn');
        const card = e.target.closest('.class-card.interactive');

        if (quickRollCallBtn) {
            const groupId = quickRollCallBtn.dataset.groupId;
            startRollCall(groupId);
        } else if (card) {
            const groupId = card.dataset.groupId;
            navigateTo('asistencia');
            setTimeout(() => {
                attendanceGroupSelect.value = groupId;
                attendanceGroupSelect.dispatchEvent(new Event('change'));
            }, 100);
        }
    });

    // --- LÓGICA DEL PASE DE LISTA RÁPIDO (MODAL) ---
    const rollCallModal = document.getElementById('roll-call-modal');
    let rollCallState = {
        students: [],
        currentIndex: 0,
        groupId: null,
        attendances: []
    };

    async function startRollCall(groupId) {
        const today = new Date().toISOString().split('T')[0];
        const students = await window.api.getStudents(groupId);
        const attendanceData = await window.api.getAttendance(groupId);
        const attendanceMap = new Map();
        attendanceData.forEach(att => {
            if (att.attendance_date === today) {
                attendanceMap.set(att.student_id, att.status);
            }
        });

        const pendingStudents = students.filter(s => !attendanceMap.has(s.id));

        if (pendingStudents.length === 0) {
            showNotification('Todos los alumnos de este grupo ya tienen un estado de asistencia para hoy.');
            return;
        }

        rollCallState = {
            students: pendingStudents,
            currentIndex: 0,
            groupId: groupId,
            attendances: []
        };

        rollCallModal.classList.remove('hidden');
        updateRollCallView();
        document.addEventListener('keydown', handleRollCallKeyPress);
    }

    function updateRollCallView() {
        if (rollCallState.currentIndex >= rollCallState.students.length) {
            finishRollCall();
            return;
        }
        const student = rollCallState.students[rollCallState.currentIndex];
        document.getElementById('roll-call-student-name').textContent = student.student_name;
        document.getElementById('roll-call-progress').textContent = `Alumno ${rollCallState.currentIndex + 1} de ${rollCallState.students.length}`;
    }

    function processRollCallAction(status) {
        const student = rollCallState.students[rollCallState.currentIndex];
        rollCallState.attendances.push({
            studentId: student.id,
            date: new Date().toISOString().split('T')[0],
            status: status
        });
        rollCallState.currentIndex++;
        updateRollCallView();
    }

    function handleRollCallKeyPress(e) {
        if (e.key.toLowerCase() === 'p') processRollCallAction('Presente');
        else if (e.key.toLowerCase() === 'a') processRollCallAction('Ausente');
        else if (e.key.toLowerCase() === 'r') processRollCallAction('Retardo');
        else if (e.key.toLowerCase() === 'i') processRollCallAction('Intercambio');
        else if (e.key.toLowerCase() === 's') processRollCallAction('Pendiente');
    }

    rollCallModal.querySelector('.roll-call-actions').addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON') {
            processRollCallAction(e.target.dataset.status);
        }
    });
     rollCallModal.querySelector('.roll-call-skip').addEventListener('click', (e) => {
        if (e.target.tagName === 'BUTTON') {
            processRollCallAction(e.target.dataset.status);
        }
    });

    async function finishRollCall() {
        document.removeEventListener('keydown', handleRollCallKeyPress);
        rollCallModal.classList.add('hidden');

        const filteredAttendances = rollCallState.attendances.filter(a => a.status !== 'Pendiente');

        if (filteredAttendances.length > 0) {
            await window.api.setBulkAttendance(filteredAttendances);
            showNotification(`Pase de lista guardado para ${filteredAttendances.length} alumnos.`);
        } else {
            showNotification('Pase de lista finalizado sin cambios.', 'error');
        }

        // Navegar a la vista de asistencia y refrescar la tabla
        navigateTo('asistencia');

        // Espera un breve momento para asegurar que la navegación se complete
        setTimeout(() => {
            attendanceGroupSelect.value = rollCallState.groupId;
            // Dispara el evento 'change' para que se cargue la tabla de asistencia del grupo correcto
            attendanceGroupSelect.dispatchEvent(new Event('change'));
        }, 100);
    }

    document.getElementById('finish-roll-call-btn').addEventListener('click', finishRollCall);

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

        // Cargar y aplicar tema guardado
        const themeToggle = document.getElementById('theme-toggle');
        if (state.settings.theme === 'dark') {
            themeToggle.checked = true;
            document.body.setAttribute('data-theme', 'dark');
        }

        themeToggle.addEventListener('change', () => {
            const theme = themeToggle.checked ? 'dark' : 'light';
            document.body.setAttribute('data-theme', theme);
            window.api.saveSetting({ key: 'theme', value: theme });
        });

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

    function checkFriday() {
        const today = new Date();
        if (today.getDay() === 5) { // 5 = Viernes
            const celebrationContainer = document.getElementById('friday-celebration');
            const messageEl = celebrationContainer.querySelector('.friday-message');

            messageEl.textContent = '¡Ya casi es momento de descansar, suerte en el día!';
            celebrationContainer.classList.remove('hidden');

            // Ocultar la animación después de unos segundos
            setTimeout(() => {
                celebrationContainer.classList.add('hidden');
            }, 5000); // Muestra la animación por 5 segundos
        }
    }

    init();
    checkFriday();
});