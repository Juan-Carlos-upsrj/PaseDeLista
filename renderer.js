document.addEventListener('DOMContentLoaded', () => {
    const sections = document.querySelectorAll('main section');
    const navButtons = document.querySelectorAll('nav button');
    const notificationDiv = document.getElementById('notification');
    let currentReportData = null;

    // --- Navigation ---
    navButtons.forEach(button => {
        button.addEventListener('click', () => {
            const sectionId = button.getAttribute('data-section');
            sections.forEach(section => section.id === sectionId ? section.classList.remove('hidden') : section.classList.add('hidden'));
            navButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');
            if (sectionId === 'inicio') loadTodayClasses();
            if (sectionId === 'reportes') loadGroupsIntoReportFilter();
        });
    });

    // --- Notifications ---
    function showNotification(message, type = 'success') {
        notificationDiv.textContent = message;
        notificationDiv.className = `notification ${type}`;
        setTimeout(() => {
            notificationDiv.className = 'notification hidden';
        }, 3000);
    }

    // --- Dashboard: Today's Classes ---
    const todayClassesList = document.getElementById('today-classes-list');
    async function loadTodayClasses() {
        try {
            const classes = await window.api.getTodayClasses();
            if (classes.length === 0) {
                todayClassesList.innerHTML = '<p>No hay clases programadas para hoy.</p>';
                return;
            }
            const list = document.createElement('ul');
            classes.forEach(c => {
                const item = document.createElement('li');
                item.textContent = c.name;
                list.appendChild(item);
            });
            todayClassesList.innerHTML = '';
            todayClassesList.appendChild(list);
        } catch (error) {
            console.error("Error fetching today's classes:", error);
            showNotification('Error al cargar las clases de hoy.', 'error');
            todayClassesList.innerHTML = '<p>Error al cargar las clases.</p>';
        }
    }

    // --- Reports ---
    const reportGroupFilter = document.getElementById('report-group-filter');
    const reportPeriodFilter = document.getElementById('report-period-filter');
    const generateReportBtn = document.getElementById('generate-report-btn');
    const reportResultsDiv = document.getElementById('report-results');
    const exportCsvBtn = document.getElementById('export-csv-btn');
    const exportPdfBtn = document.getElementById('export-pdf-btn');

    async function loadGroupsIntoReportFilter() {
        try {
            const groups = await window.api.getGroups();
            reportGroupFilter.innerHTML = '<option value="">Seleccione un grupo</option>';
            groups.forEach(group => {
                const option = document.createElement('option');
                option.value = group.id;
                option.textContent = group.name;
                reportGroupFilter.appendChild(option);
            });
        } catch (error) {
            console.error('Error loading groups for report filter:', error);
            showNotification('Error al cargar grupos.', 'error');
        }
    }

    generateReportBtn.addEventListener('click', async () => {
        const groupId = reportGroupFilter.value;
        const period = reportPeriodFilter.value;
        if (!groupId) {
            showNotification('Por favor, seleccione un grupo.', 'error');
            return;
        }
        try {
            const reportData = await window.api.generateReport(groupId, period);
            currentReportData = reportData;
            displayReport(reportData);
            exportCsvBtn.disabled = !reportData || reportData.length === 0;
            exportPdfBtn.disabled = !reportData || reportData.length === 0;
        } catch (error) {
            console.error('Error generating report:', error);
            showNotification('Error al generar el reporte.', 'error');
            reportResultsDiv.innerHTML = '<p>No se pudo generar el reporte.</p>';
            exportCsvBtn.disabled = true;
            exportPdfBtn.disabled = true;
        }
    });

    function displayReport(data) {
        if (!data || data.length === 0) {
            reportResultsDiv.innerHTML = '<p>No hay datos de asistencia para este grupo en el periodo seleccionado.</p>';
            return;
        }
        const table = document.createElement('table');
        table.innerHTML = `
            <thead>
                <tr><th>Matrícula</th><th>Nombre</th><th>Asistencias</th><th>Faltas</th><th>Retardos</th><th>Asistencia (%)</th></tr>
            </thead>
            <tbody>
                ${data.map(student => `
                    <tr class="${student.attendance_percentage <= 80 ? 'low-attendance' : ''}">
                        <td>${student.student_id}</td><td>${student.name}</td><td>${student.present_count}</td>
                        <td>${student.absent_count}</td><td>${student.late_count}</td><td>${student.attendance_percentage.toFixed(2)}%</td>
                    </tr>`).join('')}
            </tbody>`;
        reportResultsDiv.innerHTML = '';
        reportResultsDiv.appendChild(table);
    }

    exportCsvBtn.addEventListener('click', async () => {
        if (!currentReportData) return showNotification('No hay datos de reporte para exportar.', 'error');
        try {
            const result = await window.api.exportToCSV(currentReportData);
            if (result.success) showNotification(`Reporte guardado en: ${result.path}`);
            else showNotification(result.error || 'La exportación a CSV fue cancelada o falló.', 'error');
        } catch (error) {
            showNotification(`Error al exportar a CSV: ${error.message}`, 'error');
        }
    });

    exportPdfBtn.addEventListener('click', async () => {
        if (!currentReportData) return showNotification('No hay datos de reporte para exportar.', 'error');
        try {
            const result = await window.api.exportToPDF(currentReportData);
            if (result.success) showNotification(`Reporte guardado en: ${result.path}`);
            else showNotification(result.error || 'La exportación a PDF fue cancelada o falló.', 'error');
        } catch (error) {
            showNotification(`Error al exportar a PDF: ${error.message}`, 'error');
        }
    });

    // --- Modals ---
    const addStudentModal = document.getElementById('add-student-modal');
    const closeModalBtn = document.querySelector('#add-student-modal .modal-close-btn');
    const openModalBtn = document.getElementById('open-add-student-modal-btn');
    const addStudentForm = document.getElementById('add-student-form');
    const studentIdInput = document.getElementById('student-id-input');
    const studentNameInput = document.getElementById('student-name-input');
    const addStudentGroupIdInput = document.getElementById('add-student-group-id');

    openModalBtn.addEventListener('click', () => {
        const selectedGroupId = reportGroupFilter.value;
        if (!selectedGroupId) {
            showNotification('Por favor, seleccione un grupo primero.', 'error');
            return;
        }
        addStudentGroupIdInput.value = selectedGroupId;
        addStudentModal.classList.remove('hidden');
    });

    closeModalBtn.addEventListener('click', () => addStudentModal.classList.add('hidden'));

    addStudentForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const student = {
            student_id: studentIdInput.value,
            name: studentNameInput.value,
            group_id: addStudentGroupIdInput.value
        };

        if (!student.student_id || !student.name || !student.group_id) {
            return showNotification('Todos los campos son requeridos.', 'error');
        }

        try {
            await window.api.addStudent(student);
            showNotification('Alumno añadido con éxito.');
            addStudentForm.reset();
            addStudentModal.classList.add('hidden');
            // Optionally, refresh the report to show the new student
            generateReportBtn.click();
        } catch (error) {
            console.error('Error adding student:', error);
            showNotification(`Error al añadir alumno: ${error.message}`, 'error');
        }
    });

    // --- Initial Load ---
    document.querySelector('nav button[data-section="inicio"]').click();
});