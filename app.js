// app.js
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyC-1xxiO38re7hNkEEKyl6boBfy-mR_2DpDC3l20lmDSiY4n_GL9cb6ovAFZSW8IYq/exec";

let mockData = {};
let paralelosDisponibles = [];
let flatpickrInstance = null;

const elements = {
    customDropdown: document.getElementById('customDropdown'),
    dropdownTrigger: document.getElementById('dropdownTrigger'),
    dropdownMenu: document.getElementById('dropdownMenu'),
    selectedParaleloText: document.getElementById('selectedParaleloText'),
    fecha: document.getElementById('fechaInput'),
    headerTitle: document.getElementById('headerTitle'),
    legendBar: document.getElementById('legendBar'),
    fab: document.getElementById('guardarBtn'),
    navItems: document.querySelectorAll('.nav-item'),
    paneles: document.querySelectorAll('.panel'),
    asistenciaList: document.getElementById('asistenciaList'),
    btnTodos: document.getElementById('marcarTodosBtn'),
    editorList: document.getElementById('editorList'),
    newStudentName: document.getElementById('newStudentName'),
    btnAddStudent: document.getElementById('btnAddStudent'),
    historialList: document.getElementById('historialList'),
    btnFetchHistory: document.getElementById('btnFetchHistory'),
    historialActionContainer: document.getElementById('historialActionContainer'),
    btnSaveHistoryEdits: document.getElementById('btnSaveHistoryEdits'),
    overlay: document.getElementById('loaderOverlay'),
    spinner: document.getElementById('spinner'),
    modal: document.getElementById('customModal'),
    modalTitle: document.getElementById('modalTitle'),
    modalText: document.getElementById('modalText'),
    modalPrimaryBtn: document.getElementById('modalPrimaryBtn'),
    modalSecondaryBtn: document.getElementById('modalSecondaryBtn')
};

function showModal(title, text, isConfirm = false, onConfirm = null) {
    elements.modalTitle.innerText = title;
    elements.modalText.innerText = text;
    elements.spinner.style.display = 'none';
    elements.modal.style.display = 'block';
    elements.overlay.classList.add('active');

    if (isConfirm) {
        elements.modalSecondaryBtn.style.display = 'block';
        elements.modalPrimaryBtn.innerText = "Confirmar";
        
        const handlePrimary = () => {
            cleanup();
            if (onConfirm) onConfirm();
        };
        const handleSecondary = () => {
            cleanup();
        };
        const cleanup = () => {
            elements.overlay.classList.remove('active');
            elements.modalPrimaryBtn.removeEventListener('click', handlePrimary);
            elements.modalSecondaryBtn.removeEventListener('click', handleSecondary);
        };

        elements.modalPrimaryBtn.addEventListener('click', handlePrimary);
        elements.modalSecondaryBtn.addEventListener('click', handleSecondary);
    } else {
        elements.modalSecondaryBtn.style.display = 'none';
        elements.modalPrimaryBtn.innerText = "Aceptar";
        
        const handleClose = () => {
            elements.overlay.classList.remove('active');
            elements.modalPrimaryBtn.removeEventListener('click', handleClose);
        };
        elements.modalPrimaryBtn.addEventListener('click', handleClose);
    }
}

const savedFecha = localStorage.getItem('selectedFecha') || new Date().toISOString().split('T')[0];

flatpickrInstance = flatpickr("#fechaInput", {
    locale: "es",
    dateFormat: "Y-m-d",
    defaultDate: savedFecha,
    disableMobile: "true",
    clickOpens: false,
    onReady: function(selectedDates, dateStr, instance) {
        const todayBtn = document.createElement("button");
        todayBtn.type = "button";
        todayBtn.className = "flatpickr-today-btn";
        todayBtn.innerText = "Hoy";
        todayBtn.addEventListener("click", function(e) {
            e.stopPropagation();
            instance.setDate(new Date(), true);
            instance.close();
        });
        instance.calendarContainer.appendChild(todayBtn);
    },
    onChange: function(selectedDates, dateStr) {
        localStorage.setItem('selectedFecha', dateStr);
        const activeNav = localStorage.getItem('activeTab') || 'panel-asistencia';
        if(activeNav === 'panel-asistencia') cargarYRenderizarAsistencia();
    }
});

elements.fecha.addEventListener('click', (e) => {
    e.stopPropagation();
    flatpickrInstance.toggle();
});

async function cargarDatosIniciales() {
    elements.overlay.classList.add('active');
    elements.spinner.style.display = 'block';
    elements.modal.style.display = 'none';
    
    try {
        const response = await fetch(GOOGLE_SCRIPT_URL);
        const data = await response.json();
        
        if (data && data.alumnos) {
            mockData = data.alumnos;
            paralelosDisponibles = data.paralelos || [];
            actualizarSelector();
            
            const tabGuardada = localStorage.getItem('activeTab') || 'panel-asistencia';
            activarPestana(tabGuardada);
        }
    } catch (error) {
        showModal("Error", "No se pudieron obtener los datos de la hoja.");
    } finally {
        elements.spinner.style.display = 'none';
        elements.overlay.classList.remove('active');
    }
}

function actualizarSelector() {
    const savedParalelo = localStorage.getItem('selectedParalelo');
    elements.dropdownMenu.innerHTML = '';

    if (paralelosDisponibles.length === 0) {
        elements.selectedParaleloText.innerText = "Sin paralelos";
        return;
    }

    let paraleloActivo = paralelosDisponibles[0];
    if (savedParalelo && paralelosDisponibles.includes(savedParalelo)) {
        paraleloActivo = savedParalelo;
    }

    elements.selectedParaleloText.innerText = paraleloActivo;
    localStorage.setItem('selectedParalelo', paraleloActivo);

    paralelosDisponibles.forEach(p => {
        const opt = document.createElement('div');
        opt.className = `dropdown-option ${p === paraleloActivo ? 'selected' : ''}`;
        opt.innerText = p;
        opt.addEventListener('click', (e) => {
            e.stopPropagation();
            elements.selectedParaleloText.innerText = p;
            localStorage.setItem('selectedParalelo', p);
            elements.customDropdown.classList.remove('open');
            
            document.querySelectorAll('.dropdown-option').forEach(o => o.classList.remove('selected'));
            opt.classList.add('selected');

            const activeNav = localStorage.getItem('activeTab') || 'panel-asistencia';
            if(activeNav === 'panel-asistencia') cargarYRenderizarAsistencia();
            if(activeNav === 'panel-editor') renderEditor(p);
            if(activeNav === 'panel-historial') {
                elements.historialActionContainer.style.display = 'none';
                elements.historialList.innerHTML = '<div class="empty-state">Paralelo cambiado. Presiona Cargar Historial.</div>';
            }
        });
        elements.dropdownMenu.appendChild(opt);
    });
}

elements.dropdownTrigger.addEventListener('click', (e) => {
    e.stopPropagation();
    elements.customDropdown.classList.toggle('open');
});

document.addEventListener('click', () => {
    elements.customDropdown.classList.remove('open');
});

function activarPestana(targetId) {
    const item = Array.from(elements.navItems).find(n => n.getAttribute('data-target') === targetId) || elements.navItems[0];
    
    elements.navItems.forEach(nav => nav.classList.remove('active'));
    elements.paneles.forEach(panel => panel.classList.remove('active'));
    
    item.classList.add('active');
    const idFinal = item.getAttribute('data-target');
    document.getElementById(idFinal).classList.add('active');
    localStorage.setItem('activeTab', idFinal);

    const actualParalelo = localStorage.getItem('selectedParalelo');

    if(idFinal === 'panel-asistencia') {
        elements.headerTitle.innerText = 'Asistencia';
        elements.legendBar.style.display = 'flex';
        elements.fab.style.display = 'block';
        elements.fecha.style.display = 'block';
        cargarYRenderizarAsistencia();
    } 
    else if (idFinal === 'panel-editor') {
        elements.headerTitle.innerText = 'Editor de Alumnos';
        elements.legendBar.style.display = 'none';
        elements.fab.style.display = 'none';
        elements.fecha.style.display = 'none';
        renderEditor(actualParalelo);
    } 
    else if (idFinal === 'panel-historial') {
        elements.headerTitle.innerText = 'Historial';
        elements.legendBar.style.display = 'none';
        elements.fab.style.display = 'none';
        elements.fecha.style.display = 'block';
        elements.historialActionContainer.style.display = 'none';
        elements.historialList.innerHTML = '<div class="empty-state">Selecciona una fecha y presiona Cargar Historial</div>';
    }
}

elements.navItems.forEach(item => {
    item.addEventListener('click', () => {
        activarPestana(item.getAttribute('data-target'));
    });
});

async function cargarYRenderizarAsistencia() {
    const paralelo = localStorage.getItem('selectedParalelo');
    const fecha = elements.fecha.value;
    if (!paralelo || !fecha) return;

    elements.asistenciaList.innerHTML = '<div class="empty-state">Cargando asistencia...</div>';

    try {
        const url = `${GOOGLE_SCRIPT_URL}?action=obtener_asistencia&paralelo=${encodeURIComponent(paralelo)}&fecha=${encodeURIComponent(fecha)}`;
        const response = await fetch(url);
        const data = await response.json();
        renderAsistencia(paralelo, data.registros || []);
    } catch (error) {
        renderAsistencia(paralelo, []);
    }
}

function renderAsistencia(paralelo, registrosGuardados = []) {
    elements.asistenciaList.innerHTML = '';
    if (!paralelo || !mockData[paralelo]) return;

    const mapaRegistros = {};
    registrosGuardados.forEach(r => { mapaRegistros[r.estudiante] = r; });

    const fragment = document.createDocumentFragment();

    mockData[paralelo].forEach((student, index) => {
        const row = document.createElement('div');
        row.className = 'list-row';
        row.dataset.nombre = student.nombre;
        const radioName = `st-${index}`; 
        
        const regExistente = mapaRegistros[student.nombre];
        const estadoActual = regExistente ? regExistente.estado : '';
        const notaActual = regExistente ? regExistente.notas || '' : '';

        row.innerHTML = `
            <div class="student-info"><span class="student-name">${student.nombre}</span></div>
            <div class="status-group">
                <label>
                    <input type="radio" name="${radioName}" value="Presente" class="status-radio" ${estadoActual === 'Presente' ? 'checked' : ''}>
                    <div class="status-btn">P</div>
                </label>
                <label>
                    <input type="radio" name="${radioName}" value="Falta" class="status-radio" ${estadoActual === 'Falta' ? 'checked' : ''}>
                    <div class="status-btn">F</div>
                </label>
                <label>
                    <input type="radio" name="${radioName}" value="Atraso" class="status-radio" ${estadoActual === 'Atraso' ? 'checked' : ''}>
                    <div class="status-btn">A</div>
                </label>
                <button class="note-toggle" type="button">Nota</button>
            </div>
            <div class="notes-container ${notaActual ? 'active' : ''}">
                <input type="text" class="notes-input" placeholder="Nota rápida..." value="${notaActual}">
            </div>
        `;

        if (estadoActual === 'Presente') row.style.borderColor = 'var(--present)';
        if (estadoActual === 'Falta') row.style.borderColor = 'var(--absent)';
        if (estadoActual === 'Atraso') row.style.borderColor = 'var(--late)';

        row.querySelector('.note-toggle').addEventListener('click', () => {
            const notesContainer = row.querySelector('.notes-container');
            notesContainer.classList.toggle('active');
            if(notesContainer.classList.contains('active')) row.querySelector('.notes-input').focus();
        });

        row.querySelectorAll('.status-radio').forEach(radio => {
            radio.addEventListener('change', (e) => {
                row.style.borderColor = e.target.value === 'Presente' ? 'var(--present)' : 
                                       e.target.value === 'Falta' ? 'var(--absent)' : 'var(--late)';
            });
        });

        fragment.appendChild(row);
    });

    elements.asistenciaList.appendChild(fragment);
}

elements.btnTodos.addEventListener('click', () => {
    document.querySelectorAll('#asistenciaList .list-row').forEach(row => {
        const presentRadio = row.querySelector('input[value="Presente"]');
        if(presentRadio) { presentRadio.checked = true; row.style.borderColor = 'var(--present)'; }
    });
});

elements.fab.addEventListener('click', () => {
    const payload = [];
    let incompleto = false;
    const paralelo = localStorage.getItem('selectedParalelo');

    if (!paralelo) return showModal("Atención", "Selecciona un paralelo primero.");

    document.querySelectorAll('#asistenciaList .list-row').forEach(row => {
        const radio = row.querySelector('input[type="radio"]:checked');
        if (!radio) incompleto = true;
        else {
            payload.push({
                estudiante: row.dataset.nombre,
                estado: radio.value,
                notas: row.querySelector('.notes-input').value
            });
        }
    });

    if (incompleto) return showModal("Incompleto", "Por favor marca el estado de todos los alumnos.");

    const requestData = {
        action: "guardar_asistencia",
        paralelo: paralelo,
        fecha: elements.fecha.value,
        registros: payload
    };
    enviar(requestData, "Asistencia registrada exitosamente");
});

function renderEditor(paralelo) {
    elements.editorList.innerHTML = '';
    if (!paralelo || !mockData[paralelo]) return;

    const fragment = document.createDocumentFragment();

    mockData[paralelo].forEach((student, index) => {
        const row = document.createElement('div');
        row.className = 'list-row';
        row.innerHTML = `
            <div class="student-info">
                <span class="student-name">${student.nombre}</span>
            </div>
            <div class="editor-actions">
                <button class="btn-icon" onclick="enableEditStudent(${index})">Editar</button>
                <button class="btn-icon" onclick="deleteStudent(${index}, '${paralelo}')">Eliminar</button>
            </div>
            <div class="edit-container" id="edit-box-${index}" style="display: none;">
                <input type="text" id="input-edit-${index}" value="${student.nombre}">
                <button class="btn-save-edit" onclick="saveEditStudent(${index}, '${paralelo}')">Guardar</button>
                <button class="btn-cancel-edit" onclick="cancelEditStudent(${index})">Cancelar</button>
            </div>
        `;
        fragment.appendChild(row);
    });

    elements.editorList.appendChild(fragment);
}

window.enableEditStudent = function(index) {
    document.getElementById(`edit-box-${index}`).style.display = 'flex';
    document.getElementById(`input-edit-${index}`).focus();
};

window.cancelEditStudent = function(index) {
    document.getElementById(`edit-box-${index}`).style.display = 'none';
};

window.saveEditStudent = function(index, paralelo) {
    const newName = document.getElementById(`input-edit-${index}`).value.trim();
    if (!newName) return showModal("Atención", "El nombre no puede estar vacío.");

    const oldName = mockData[paralelo][index].nombre;
    mockData[paralelo][index].nombre = newName;

    const requestData = { 
        action: "editar_alumno", 
        paralelo: paralelo, 
        nombreAnterior: oldName, 
        nombreNuevo: newName 
    };
    enviar(requestData, "Nombre actualizado correctamente");
    renderEditor(paralelo);
};

elements.btnAddStudent.addEventListener('click', () => {
    const name = elements.newStudentName.value.trim();
    const paralelo = localStorage.getItem('selectedParalelo');
    if(!name || !paralelo) return showModal("Atención", "Ingresa un nombre válido.");

    mockData[paralelo].push({ nombre: name });
    elements.newStudentName.value = '';

    const requestData = { action: "agregar_alumno", paralelo: paralelo, nombre: name };
    enviar(requestData, "Alumno agregado al registro");
    renderEditor(paralelo);
});

window.deleteStudent = function(index, paralelo) {
    showModal("Eliminar Alumno", "¿Deseas eliminar permanentemente a este alumno?", true, () => {
        const nameToDelete = mockData[paralelo][index].nombre;
        mockData[paralelo].splice(index, 1);

        const requestData = { action: "eliminar_alumno", paralelo: paralelo, nombreAnterior: nameToDelete };
        enviar(requestData, "Alumno eliminado del registro");
        renderEditor(paralelo);
    });
};

elements.btnFetchHistory.addEventListener('click', async () => {
    const fecha = elements.fecha.value;
    const paralelo = localStorage.getItem('selectedParalelo');
    if (!paralelo || !fecha) return showModal("Atención", "Selecciona una fecha válida.");

    elements.historialList.innerHTML = '<div class="empty-state">Cargando registros...</div>';
    elements.historialActionContainer.style.display = 'none';

    try {
        const url = `${GOOGLE_SCRIPT_URL}?action=obtener_asistencia&paralelo=${encodeURIComponent(paralelo)}&fecha=${encodeURIComponent(fecha)}`;
        const response = await fetch(url);
        const data = await response.json();
        const registros = data.registros || [];

        if (registros.length === 0) {
            elements.historialList.innerHTML = '<div class="empty-state" style="color:var(--absent);">No existen registros guardados para esta fecha.</div>';
            return;
        }

        elements.historialList.innerHTML = '';
        const fragment = document.createDocumentFragment();

        registros.forEach((reg, idx) => {
            const radioName = `hist-${idx}`;
            const row = document.createElement('div');
            row.className = 'list-row';
            row.dataset.nombre = reg.estudiante;
            
            row.innerHTML = `
                <div class="student-info"><span class="student-name">${reg.estudiante}</span></div>
                <div class="status-group">
                    <label>
                        <input type="radio" name="${radioName}" value="Presente" class="status-radio" ${reg.estado === 'Presente' ? 'checked' : ''}>
                        <div class="status-btn">P</div>
                    </label>
                    <label>
                        <input type="radio" name="${radioName}" value="Falta" class="status-radio" ${reg.estado === 'Falta' ? 'checked' : ''}>
                        <div class="status-btn">F</div>
                    </label>
                    <label>
                        <input type="radio" name="${radioName}" value="Atraso" class="status-radio" ${reg.estado === 'Atraso' ? 'checked' : ''}>
                        <div class="status-btn">A</div>
                    </label>
                    <button class="note-toggle" type="button">Nota</button>
                </div>
                <div class="notes-container ${reg.notas ? 'active' : ''}">
                    <input type="text" class="notes-input" placeholder="Nota..." value="${reg.notas || ''}">
                </div>
            `;

            if (reg.estado === 'Presente') row.style.borderColor = 'var(--present)';
            if (reg.estado === 'Falta') row.style.borderColor = 'var(--absent)';
            if (reg.estado === 'Atraso') row.style.borderColor = 'var(--late)';

            row.querySelector('.note-toggle').addEventListener('click', () => {
                const notesContainer = row.querySelector('.notes-container');
                notesContainer.classList.toggle('active');
                if(notesContainer.classList.contains('active')) row.querySelector('.notes-input').focus();
            });

            row.querySelectorAll('.status-radio').forEach(radio => {
                radio.addEventListener('change', (e) => {
                    row.style.borderColor = e.target.value === 'Presente' ? 'var(--present)' : 
                                           e.target.value === 'Falta' ? 'var(--absent)' : 'var(--late)';
                });
            });

            fragment.appendChild(row);
        });

        elements.historialList.appendChild(fragment);
        elements.historialActionContainer.style.display = 'block';
    } catch (error) {
        elements.historialList.innerHTML = '<div class="empty-state" style="color:var(--absent);">Error al cargar registros.</div>';
    }
});

elements.btnSaveHistoryEdits.addEventListener('click', () => {
    const payload = [];
    let incompleto = false;
    const paralelo = localStorage.getItem('selectedParalelo');
    const fecha = elements.fecha.value;

    document.querySelectorAll('#historialList .list-row').forEach(row => {
        const radio = row.querySelector('input[type="radio"]:checked');
        if (!radio) incompleto = true;
        else {
            payload.push({
                estudiante: row.dataset.nombre,
                estado: radio.value,
                notas: row.querySelector('.notes-input').value
            });
        }
    });

    if (incompleto) return showModal("Atención", "Marca el estado de todos los alumnos.");

    const requestData = {
        action: "guardar_asistencia",
        paralelo: paralelo,
        fecha: fecha,
        registros: payload
    };
    enviar(requestData, "Historial actualizado en Excel");
});

async function enviar(datos, mensajeExito) {
    elements.overlay.classList.add('active');
    elements.spinner.style.display = 'block';
    elements.modal.style.display = 'none';

    try {
        await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify(datos)
        });

        elements.spinner.style.display = 'none';
        showModal("Completado", mensajeExito);
    } catch (error) {
        elements.spinner.style.display = 'none';
        showModal("Error", "Ocurrió un problema de conexión.");
    }
}

cargarDatosIniciales();