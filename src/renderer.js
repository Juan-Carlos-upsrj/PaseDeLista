document.addEventListener('DOMContentLoaded', () => {
    const navLinks = document.querySelectorAll('.sidebar-nav a');
    const mainHeader = document.querySelector('.main-header h1');
    const contentArea = document.getElementById('content-area');

    // Función para manejar la navegación
    function navigate(viewName, title) {
        // Actualiza el título principal
        mainHeader.textContent = title;

        // Limpia el área de contenido y muestra un placeholder
        contentArea.innerHTML = `<p>Contenido para ${title} aparecerá aquí.</p>`;

        // Actualiza el estado activo en la navegación
        navLinks.forEach(link => {
            link.parentElement.classList.remove('active');
            if (link.id === `nav-${viewName}`) {
                link.parentElement.classList.add('active');
            }
        });
    }

    // Añade event listeners a los links de navegación
    document.getElementById('nav-dashboard').addEventListener('click', (e) => {
        e.preventDefault();
        navigate('dashboard', 'Dashboard');
    });

    document.getElementById('nav-groups').addEventListener('click', (e) => {
        e.preventDefault();
        renderGroupsView();
    });

    document.getElementById('nav-settings').addEventListener('click', (e) => {
        e.preventDefault();
        navigate('settings', 'Configuración');
    });

    // --- LÓGICA DEL MODAL DE GRUPOS ---
    const groupModal = document.getElementById('group-modal');
    const groupForm = document.getElementById('group-form');
    const cancelGroupModalBtn = document.getElementById('cancel-group-modal');
    const modalTitle = document.getElementById('modal-title');
    const groupIdInput = document.getElementById('group-id-input');

    function openGroupModal() {
        groupForm.reset();
        modalTitle.textContent = 'Crear Nuevo Grupo';
        groupIdInput.value = '';
        groupModal.style.display = 'flex';
    }

    function openGroupModalForEdit(group) {
        groupForm.reset();
        modalTitle.textContent = 'Editar Grupo';

        // Rellenar el formulario con los datos del grupo
        groupIdInput.value = group.id;
        document.getElementById('group-name').value = group.group_name;
        document.getElementById('subject-name').value = group.subject_name;
        document.getElementById('start-date').value = group.start_date;
        document.getElementById('end-date').value = group.end_date;
        document.getElementById('partial1-end-date').value = group.partial1_end_date;

        // Marcar los checkboxes de los días de clase
        const classDays = group.class_days.split(',');
        document.querySelectorAll('input[name="class_day"]').forEach(checkbox => {
            checkbox.checked = classDays.includes(checkbox.value);
        });

        groupModal.style.display = 'flex';
    }

    function closeGroupModal() {
        groupModal.style.display = 'none';
    }

    // Event listeners para el modal
    cancelGroupModalBtn.addEventListener('click', closeGroupModal);

    groupForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const selectedDays = Array.from(document.querySelectorAll('input[name="class_day"]:checked'))
                                 .map(cb => cb.value);
        if (selectedDays.length === 0) {
            alert('Debes seleccionar al menos un día de clase.');
            return;
        }

        const groupData = {
            group_name: document.getElementById('group-name').value,
            subject_name: document.getElementById('subject-name').value,
            start_date: document.getElementById('start-date').value,
            end_date: document.getElementById('end-date').value,
            partial1_end_date: document.getElementById('partial1-end-date').value,
            class_days: selectedDays.join(','),
            id: groupIdInput.value || null
        };

        try {
            let result;
            if (groupData.id) {
                result = await window.electronAPI.updateGroup(groupData);
                if (result.cancelled) {
                    // Si el usuario canceló la advertencia de cambio de horario, no cerramos el modal
                    return;
                }
            } else {
                result = await window.electronAPI.addGroup(groupData);
            }
            closeGroupModal();
            await loadAndDisplayGroups();
        } catch (error) {
            console.error('Error al guardar el grupo:', error);
            alert('No se pudo guardar el grupo. Revisa la consola para más detalles.');
        }
    });


    // --- VISTA DE GESTIÓN DE GRUPOS ---

    async function renderGroupsView() {
        navigate('groups', 'Gestión de Grupos');

        const contentArea = document.getElementById('content-area');
        contentArea.innerHTML = `
            <div class="view-header">
                <button id="add-new-group-btn" class="btn btn-primary">Crear Nuevo Grupo</button>
            </div>
            <div id="groups-list-container">
                <p>Cargando grupos...</p>
            </div>
        `;

        // Añadir event listener para el nuevo botón
        document.getElementById('add-new-group-btn').addEventListener('click', openGroupModal);

        await loadAndDisplayGroups();
    }

    async function loadAndDisplayGroups() {
        const container = document.getElementById('groups-list-container');
        try {
            const groups = await window.electronAPI.getGroups();
            if (groups.length === 0) {
                container.innerHTML = '<p>No hay grupos creados todavía. ¡Crea el primero!</p>';
                return;
            }

            // Crear la tabla de grupos
            container.innerHTML = `
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Nombre del Grupo</th>
                            <th>Materia</th>
                            <th>Periodo</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${groups.map(group => `
                            <tr data-group-id="${group.id}">
                                <td>${group.group_name}</td>
                                <td>${group.subject_name}</td>
                                <td>${group.start_date} al ${group.end_date}</td>
                                <td class="actions-cell">
                                    <button class="btn btn-primary btn-sm take-attendance-btn">Pasar Lista</button>
                                    <button class="btn btn-secondary btn-sm manage-students-btn">Alumnos</button>
                                    <button class="btn btn-secondary btn-sm edit-group-btn">Editar</button>
                                    <button class="btn btn-danger btn-sm delete-group-btn">Eliminar</button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;

            // Añadir event listeners para los botones de acción de cada grupo
            container.querySelectorAll('.take-attendance-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const groupId = e.target.closest('tr').dataset.groupId;
                    const group = groups.find(g => g.id == groupId);
                    renderAttendanceView(group);
                });
            });

            container.querySelectorAll('.manage-students-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const groupId = e.target.closest('tr').dataset.groupId;
                    const group = groups.find(g => g.id == groupId);
                    renderStudentsView(groupId, group.group_name);
                });
            });

            // Añadir event listeners para los botones de acción de cada grupo
            container.querySelectorAll('.view-students-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const groupId = e.target.closest('tr').dataset.groupId;
                    console.log(`Ver alumnos del grupo ${groupId}`);
                    // Aquí irá la lógica para navegar a la vista de pase de lista
                });
            });

            container.querySelectorAll('.edit-group-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const groupId = e.target.closest('tr').dataset.groupId;
                    const groupToEdit = groups.find(g => g.id == groupId);
                    if (groupToEdit) {
                        openGroupModalForEdit(groupToEdit);
                    }
                });
            });

            container.querySelectorAll('.delete-group-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const groupId = e.target.closest('tr').dataset.groupId;
                    const groupToDelete = groups.find(g => g.id == groupId);

                    const confirmation = confirm(`¿Estás seguro de que quieres eliminar el grupo "${groupToDelete.group_name}"?\n\n¡ATENCIÓN! Se eliminarán también todos los alumnos y registros de asistencia asociados a este grupo.`);

                    if (confirmation) {
                        try {
                            await window.electronAPI.deleteGroup(groupId);
                            await loadAndDisplayGroups();
                        } catch (error) {
                            console.error('Error al eliminar el grupo:', error);
                            alert('No se pudo eliminar el grupo.');
                        }
                    }
                });
            });

        } catch (error) {
            console.error('Error al cargar los grupos:', error);
            container.innerHTML = '<p class="error-message">No se pudieron cargar los grupos. Inténtalo de nuevo más tarde.</p>';
        }
    }

    // --- LÓGICA DE MODALES DE ALUMNOS ---
    const studentModal = document.getElementById('student-modal');
    const studentForm = document.getElementById('student-form');
    const studentModalTitle = document.getElementById('student-modal-title');
    const studentIdInput = document.getElementById('student-id-input');
    const studentGroupIdInput = document.getElementById('student-group-id-input');
    const cancelStudentModalBtn = document.getElementById('cancel-student-modal');

    const multipleStudentsModal = document.getElementById('multiple-students-modal');
    const multipleStudentsForm = document.getElementById('multiple-students-form');
    const multipleStudentsGroupIdInput = document.getElementById('multiple-students-group-id-input');
    const cancelMultipleStudentsModalBtn = document.getElementById('cancel-multiple-students-modal');
    const studentsTextarea = document.getElementById('students-textarea');

    // Modal de Alumno Individual
    function openStudentModal(groupId, student = null) {
        studentForm.reset();
        studentGroupIdInput.value = groupId;
        if (student) {
            studentModalTitle.textContent = 'Editar Alumno';
            studentIdInput.value = student.id;
            document.getElementById('student-id-field').value = student.student_id || '';
            document.getElementById('student-name').value = student.student_name;
        } else {
            studentModalTitle.textContent = 'Añadir Alumno';
            studentIdInput.value = '';
        }
        studentModal.style.display = 'flex';
    }

    function closeStudentModal() {
        studentModal.style.display = 'none';
    }

    cancelStudentModalBtn.addEventListener('click', closeStudentModal);

    studentForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const studentData = {
            id: studentIdInput.value || null,
            student_id: document.getElementById('student-id-field').value.trim() || null,
            student_name: document.getElementById('student-name').value.trim(),
            group_id: studentGroupIdInput.value
        };
        try {
            if (studentData.id) {
                await window.electronAPI.updateStudent(studentData);
            } else {
                await window.electronAPI.addStudent(studentData);
            }
            closeStudentModal();
            await loadAndDisplayStudents(studentData.group_id);
        } catch (error) {
            console.error('Error al guardar el alumno:', error);
            alert('No se pudo guardar el alumno.');
        }
    });

    // Modal de Varios Alumnos
    function openMultipleStudentsModal(groupId) {
        multipleStudentsForm.reset();
        multipleStudentsGroupIdInput.value = groupId;
        multipleStudentsModal.style.display = 'flex';
    }

    function closeMultipleStudentsModal() {
        multipleStudentsModal.style.display = 'none';
    }

    cancelMultipleStudentsModalBtn.addEventListener('click', closeMultipleStudentsModal);

    multipleStudentsForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const groupId = multipleStudentsGroupIdInput.value;
        const lines = studentsTextarea.value.trim().split('\n');
        const students = lines.filter(line => line.trim() !== '').map(line => {
            const parts = line.split(',').map(p => p.trim());
            if (parts.length > 1) {
                return { student_id: parts[0], student_name: parts.slice(1).join(',').trim(), group_id: groupId };
            }
            return { student_id: null, student_name: parts[0], group_id: groupId };
        });

        if (students.length === 0) {
            alert('No se encontraron alumnos válidos en el texto.');
            return;
        }

        try {
            await window.electronAPI.addMultipleStudents(students);
            closeMultipleStudentsModal();
            await loadAndDisplayStudents(groupId);
            alert(`${students.length} alumnos añadidos correctamente.`);
        } catch (error) {
            console.error('Error al añadir varios alumnos:', error);
            alert('No se pudieron añadir los alumnos.');
        }
    });

    // --- VISTA DE GESTIÓN DE ALUMNOS ---
    async function renderStudentsView(groupId, groupName) {
        navigate('students', `Alumnos del Grupo: ${groupName}`);
        const contentArea = document.getElementById('content-area');
        contentArea.innerHTML = `
            <div class="view-header" style="justify-content: space-between;">
                <button id="back-to-groups-btn" class="btn btn-secondary">← Volver a Grupos</button>
                <div style="display: flex; gap: 10px;">
                    <button id="add-student-btn" class="btn btn-primary">Añadir Alumno</button>
                    <button id="add-multiple-students-btn" class="btn btn-primary">Añadir Varios</button>
                    <button id="import-csv-btn" class="btn btn-primary">Importar CSV</button>
                </div>
            </div>
            <div id="students-list-container"><p>Cargando alumnos...</p></div>
        `;

        document.getElementById('back-to-groups-btn').addEventListener('click', renderGroupsView);
        document.getElementById('add-student-btn').addEventListener('click', () => openStudentModal(groupId));
        document.getElementById('add-multiple-students-btn').addEventListener('click', () => openMultipleStudentsModal(groupId));

        document.getElementById('import-csv-btn').addEventListener('click', async () => {
            try {
                const result = await window.electronAPI.importStudentsCSV(groupId);
                if (result.success) {
                    alert(`${result.count} alumnos importados correctamente.`);
                    await loadAndDisplayStudents(groupId);
                } else {
                    if (result.message !== 'Importación cancelada.') {
                        alert(`Error al importar: ${result.message}`);
                    }
                }
            } catch (error) {
                console.error('Error en la importación de CSV:', error);
                alert('Ocurrió un error inesperado durante la importación.');
            }
        });

        await loadAndDisplayStudents(groupId);
    }

    async function loadAndDisplayStudents(groupId) {
        const container = document.getElementById('students-list-container');
        try {
            const students = await window.electronAPI.getStudentsByGroup(groupId);
            if (students.length === 0) {
                container.innerHTML = '<p>No hay alumnos en este grupo todavía.</p>';
                return;
            }
            container.innerHTML = `
                <table class="data-table">
                    <thead>
                        <tr>
                            <th class="student-id-col">Matrícula</th>
                            <th>Nombre Completo</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${students.map(student => `
                            <tr data-student-id="${student.id}">
                                <td class="student-id-col">${student.student_id || 'N/A'}</td>
                                <td>${student.student_name}</td>
                                <td class="actions-cell">
                                    <button class="btn btn-secondary btn-sm edit-student-btn">Editar</button>
                                    <button class="btn btn-danger btn-sm delete-student-btn">Eliminar</button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;

            container.querySelectorAll('.edit-student-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const studentId = e.target.closest('tr').dataset.studentId;
                    const studentToEdit = students.find(s => s.id == studentId);
                    if (studentToEdit) {
                        openStudentModal(groupId, studentToEdit);
                    }
                });
            });

            container.querySelectorAll('.delete-student-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const studentId = e.target.closest('tr').dataset.studentId;
                    const studentToDelete = students.find(s => s.id == studentId);
                    if (confirm(`¿Estás seguro de que quieres eliminar a "${studentToDelete.student_name}"?`)) {
                        try {
                            await window.electronAPI.deleteStudent(studentId);
                            await loadAndDisplayStudents(groupId);
                        } catch (error) {
                            console.error('Error al eliminar alumno:', error);
                            alert('No se pudo eliminar el alumno.');
                        }
                    }
                });
            });
        } catch (error) {
            console.error('Error al cargar los alumnos:', error);
            container.innerHTML = '<p class="error-message">No se pudieron cargar los alumnos.</p>';
        }
    }


    // --- VISTA DE PASE DE LISTA (ATTENDANCE) ---

    function generateClassDates(group) {
        const dates = [];
        const classDays = group.class_days.split(',').map(d => parseInt(d, 10));

        // Aseguramos que las fechas se traten como locales para evitar problemas de zona horaria
        const startDate = new Date(group.start_date.replace(/-/g, '/'));
        const endDate = new Date(group.end_date.replace(/-/g, '/'));

        let currentDate = startDate;
        while (currentDate <= endDate) {
            if (classDays.includes(currentDate.getDay())) {
                dates.push(currentDate.toISOString().slice(0, 10));
            }
            currentDate.setDate(currentDate.getDate() + 1);
        }
        return dates;
    }

    async function renderAttendanceView(group) {
        navigate('attendance', `Pase de Lista: ${group.group_name}`);
        const contentArea = document.getElementById('content-area');
        contentArea.innerHTML = `
            <div class="view-header">
                <button id="back-to-groups-from-attendance-btn" class="btn btn-secondary">← Volver a Grupos</button>
            </div>
            <div id="attendance-table-container" style="overflow-x: auto;">
                <p>Generando tabla de asistencia...</p>
            </div>
        `;

        document.getElementById('back-to-groups-from-attendance-btn').addEventListener('click', renderGroupsView);

        try {
            // 1. Obtener todos los datos necesarios en paralelo
            const [students, attendanceRecords] = await Promise.all([
                window.electronAPI.getStudentsByGroup(group.id),
                window.electronAPI.getAttendance(group.id)
            ]);

            const classDates = generateClassDates(group);

            // 2. Procesar los registros de asistencia para una búsqueda rápida
            const attendanceMap = new Map(
                attendanceRecords.map(r => [`${r.student_id}-${r.attendance_date}`, r.status])
            );

            // 3. Construir el HTML de la tabla
            const partial1EndDate = new Date(group.partial1_end_date.replace(/-/g, '/'));
            const partial1Dates = classDates.filter(d => new Date(d.replace(/-/g, '/')) <= partial1EndDate);
            const partial2Dates = classDates.filter(d => new Date(d.replace(/-/g, '/')) > partial1EndDate);

            const tableContainer = document.getElementById('attendance-table-container');
            tableContainer.innerHTML = `
                <table class="attendance-table">
                    <thead>
                        <tr>
                            <th class="student-name-header">Alumno</th>
                            ${partial1Dates.length > 0 ? `<th colspan="${partial1Dates.length}" class="partial-header">Primer Parcial</th>` : ''}
                            ${partial2Dates.length > 0 ? `<th colspan="${partial2Dates.length}" class="partial-header">Segundo Parcial</th>` : ''}
                        </tr>
                        <tr>
                            <th class="student-name-header"></th>
                            ${classDates.map(date => `<th class="date-header">${new Date(date.replace(/-/g, '/')).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody>
                        ${students.map(student => `
                            <tr>
                                <td class="student-name-cell">${student.student_name}</td>
                                ${classDates.map(date => {
                                    const status = attendanceMap.get(`${student.id}-${date}`) || '';
                                    const statusClass = status ? `status-${status.toLowerCase()}` : 'status-empty';
                                    return `<td class="attendance-cell ${statusClass}" data-student-id="${student.id}" data-date="${date}">${status.charAt(0)}</td>`;
                                }).join('')}
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;

            // 4. Añadir interactividad
            addAttendanceCellListeners(tableContainer);

        } catch (error) {
            console.error("Error al renderizar la vista de asistencia:", error);
            document.getElementById('attendance-table-container').innerHTML = `<p class="error-message">Error al cargar los datos de asistencia.</p>`;
        }
    }

    function addAttendanceCellListeners(container) {
        container.addEventListener('click', async (e) => {
            if (!e.target.classList.contains('attendance-cell')) return;

            const cell = e.target;
            const studentId = cell.dataset.studentId;
            const date = cell.dataset.date;

            const currentStatus = cell.textContent;
            const statusCycle = { '': 'P', 'P': 'R', 'R': 'A', 'A': '' };
            const newStatusInitial = statusCycle[currentStatus];

            const statusMap = { 'P': 'Presente', 'R': 'Retardo', 'A': 'Ausente' };
            const newStatus = newStatusInitial ? statusMap[newStatusInitial] : null;

            try {
                if (newStatus) {
                    await window.electronAPI.upsertAttendance({ student_id: studentId, attendance_date: date, status: newStatus });
                } else {
                    // Si el nuevo estado es vacío, deberíamos eliminar el registro.
                    // Por ahora, la lógica de upsert con un valor nulo no elimina.
                    // Esto se puede implementar si es necesario, pero por ahora lo dejamos como "vacío".
                }

                // Actualizar UI
                cell.textContent = newStatusInitial;
                cell.className = 'attendance-cell'; // Reset class
                if (newStatus) {
                    cell.classList.add(`status-${newStatus.toLowerCase()}`);
                } else {
                    cell.classList.add('status-empty');
                }

            } catch (error) {
                console.error('Error al actualizar la asistencia:', error);
                // Opcional: revertir el cambio en la UI si falla el guardado
            }
        });
    }


    // --- VISTA DEL DASHBOARD ---

    async function renderDashboardView() {
        navigate('dashboard', 'Dashboard');
        const contentArea = document.getElementById('content-area');
        contentArea.innerHTML = '<p>Cargando datos del dashboard...</p>';

        try {
            const { todaysClasses, pendingAttendances } = await window.electronAPI.getDashboardData();

            let pendingAlertHTML = '';
            if (pendingAttendances.length > 0) {
                let alertMessage;
                if (pendingAttendances.length <= 3) {
                    // Mensaje detallado
                    const details = pendingAttendances.map(p => `<li>Grupo <strong>${p.groupName}</strong> el día <strong>${new Date(p.date.replace(/-/g, '/')).toLocaleDateString('es-ES')}</strong></li>`).join('');
                    alertMessage = `Parece que no se registró la asistencia para:<ul class="pending-list">${details}</ul>`;
                } else {
                    // Mensaje general
                    alertMessage = `Tienes <strong>${pendingAttendances.length}</strong> clases pasadas con asistencia pendiente de registrar.`;
                }
                pendingAlertHTML = `<div class="alert alert-warning"><h3>Alerta de Asistencia Pendiente</h3>${alertMessage}</div>`;
            }

            let todaysClassesHTML = '<h3>No hay clases programadas para hoy</h3>';
            if (todaysClasses.length > 0) {
                const classItems = todaysClasses.map(group => `<li class="class-item">${group.group_name} - <em>${group.subject_name}</em></li>`).join('');
                todaysClassesHTML = `<h3>Clases de Hoy</h3><ul class="today-classes-list">${classItems}</ul>`;
            }

            contentArea.innerHTML = `
                ${pendingAlertHTML}
                <div class="dashboard-section">
                    ${todaysClassesHTML}
                </div>
            `;

        } catch (error) {
            console.error('Error al cargar datos del dashboard:', error);
            contentArea.innerHTML = '<p class="error-message">No se pudieron cargar los datos del dashboard.</p>';
        }
    }


    // --- VISTA DE REPORTES ---

    async function renderReportsView() {
        navigate('reports', 'Reportes de Asistencia');
        const contentArea = document.getElementById('content-area');

        try {
            const groups = await window.electronAPI.getGroups();
            let groupOptions = '<option value="">Selecciona un grupo...</option>';
            if (groups.length > 0) {
                groupOptions += groups.map(g => `<option value='${JSON.stringify(g)}'>${g.group_name} - ${g.subject_name}</option>`).join('');
            }

            contentArea.innerHTML = `
                <div class="report-filters">
                    <div class="form-group">
                        <label for="report-group-select">Grupo</label>
                        <select id="report-group-select">${groupOptions}</select>
                    </div>
                    <div class="form-group">
                        <label for="report-period-select">Periodo</label>
                        <select id="report-period-select">
                            <option value="all">Completo</option>
                            <option value="partial1">Primer Parcial</option>
                            <option value="partial2">Segundo Parcial</option>
                        </select>
                    </div>
                    <button id="generate-report-btn" class="btn btn-primary">Generar Reporte</button>
                </div>
                <div id="report-results-container"></div>
            `;

            document.getElementById('generate-report-btn').addEventListener('click', generateReport);

        } catch (error) {
            console.error('Error al cargar la vista de reportes:', error);
            contentArea.innerHTML = '<p class="error-message">No se pudo cargar la sección de reportes.</p>';
        }
    }

    async function generateReport() {
        const resultsContainer = document.getElementById('report-results-container');
        resultsContainer.innerHTML = '<p>Generando reporte...</p>';

        const groupSelect = document.getElementById('report-group-select');
        const periodSelect = document.getElementById('report-period-select');

        if (!groupSelect.value) {
            resultsContainer.innerHTML = '<p class="error-message">Por favor, selecciona un grupo.</p>';
            return;
        }

        const group = JSON.parse(groupSelect.value);
        const period = periodSelect.value;

        try {
            const [students, attendanceRecords] = await Promise.all([
                window.electronAPI.getStudentsByGroup(group.id),
                window.electronAPI.getAttendance(group.id)
            ]);

            const allClassDates = generateClassDates(group);
            const partial1EndDate = new Date(group.partial1_end_date.replace(/-/g, '/'));

            let relevantDates;
            if (period === 'partial1') {
                relevantDates = new Set(allClassDates.filter(d => new Date(d.replace(/-/g, '/')) <= partial1EndDate));
            } else if (period === 'partial2') {
                relevantDates = new Set(allClassDates.filter(d => new Date(d.replace(/-/g, '/')) > partial1EndDate));
            } else {
                relevantDates = new Set(allClassDates);
            }

            const reportData = students.map(student => {
                const studentRecords = attendanceRecords.filter(r => r.student_id === student.id && relevantDates.has(r.attendance_date));
                const presents = studentRecords.filter(r => r.status === 'Presente').length;
                const tardies = studentRecords.filter(r => r.status === 'Retardo').length;
                const absents = studentRecords.filter(r => r.status === 'Ausente').length;
                const totalPossibleClasses = relevantDates.size;
                const totalAttended = presents + tardies;
                const attendancePercentage = totalPossibleClasses > 0 ? (totalAttended / totalPossibleClasses) * 100 : 0;

                return {
                    ...student,
                    presents,
                    tardies,
                    absents,
                    totalClasses: totalPossibleClasses,
                    percentage: attendancePercentage.toFixed(1)
                };
            });

            if (reportData.length === 0) {
                resultsContainer.innerHTML = '<p>No hay alumnos en este grupo para generar un reporte.</p>';
                return;
            }

            resultsContainer.innerHTML = `
                <div class="report-header">
                    <h3>Reporte para: ${group.group_name}</h3>
                    <div class="report-actions">
                        <button id="export-pdf-btn" class="btn btn-secondary btn-sm">Exportar a PDF</button>
                        <button id="export-csv-btn" class="btn btn-secondary btn-sm">Exportar a CSV</button>
                    </div>
                </div>
                <table class="data-table">
                    <thead>
                        <tr>
                            <th class="student-id-col">Matrícula</th>
                            <th>Alumno</th>
                            <th>Asistencias</th>
                            <th>Retardos</th>
                            <th>Faltas</th>
                            <th>% Asistencia</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${reportData.map(data => `
                            <tr class="${data.percentage <= 80 ? 'low-attendance' : ''}">
                                <td class="student-id-col">${data.student_id || 'N/A'}</td>
                                <td>${data.student_name}</td>
                                <td>${data.presents}</td>
                                <td>${data.tardies}</td>
                                <td>${data.absents}</td>
                                <td>${data.percentage}%</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;

            // Placeholder listeners para exportación
            document.getElementById('export-pdf-btn').addEventListener('click', () => alert('Función de exportar a PDF no implementada aún.'));
            document.getElementById('export-csv-btn').addEventListener('click', () => alert('Función de exportar a CSV no implementada aún.'));

        } catch (error) {
            console.error('Error al generar el reporte:', error);
            resultsContainer.innerHTML = '<p class="error-message">No se pudo generar el reporte.</p>';
        }
    }

    // --- LÓGICA DE CONFIGURACIÓN ---
    const settingsModal = document.getElementById('settings-modal');
    const closeSettingsModalBtn = document.getElementById('close-settings-modal');
    const showStudentIdToggle = document.getElementById('show-student-id-toggle');

    let appSettings = {
        showStudentId: true
    };

    function openSettingsModal() {
        showStudentIdToggle.checked = appSettings.showStudentId;
        settingsModal.style.display = 'flex';
    }

    function closeSettingsModal() {
        settingsModal.style.display = 'none';
    }

    async function applySettings() {
        document.body.classList.toggle('hide-student-id-col', !appSettings.showStudentId);
    }

    async function loadAndApplySettings() {
        const showStudentId = await window.electronAPI.getSetting('showStudentId');
        // Si no está definido, el valor por defecto es true.
        appSettings.showStudentId = showStudentId !== false;
        applySettings();
    }

    closeSettingsModalBtn.addEventListener('click', closeSettingsModal);
    showStudentIdToggle.addEventListener('change', (e) => {
        appSettings.showStudentId = e.target.checked;
        window.electronAPI.setSetting('showStudentId', appSettings.showStudentId);
        applySettings();
    });


    // --- Event Listeners de Navegación ---
    document.getElementById('nav-dashboard').addEventListener('click', (e) => {
        e.preventDefault();
        renderDashboardView();
    });

    document.getElementById('nav-reports').addEventListener('click', (e) => {
        e.preventDefault();
        renderReportsView();
    });

    document.getElementById('nav-settings').addEventListener('click', (e) => {
        e.preventDefault();
        openSettingsModal();
    });

    // Carga la configuración y la vista inicial
    loadAndApplySettings().then(() => {
        renderDashboardView();
    });
});