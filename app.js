const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwROvO2s-PSKcr8RVTyAjYKh2QiaCCzoZD26tDXuv7TyJqqs94_q3Pd5MLUH946CVSf/exec"; // NO OLVIDES REEMPLAZAR ESTA URL
const CACHE_ALUMNOS = "basketCacheAlumnos";
const CACHE_ASISTENCIA = "basketCacheAsistencia";

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
    newStudentBanner: document.getElementById('newStudentBanner'),
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

        const handlePrimary = () => { cleanup(); if (onConfirm) onConfirm(); };
        const handleSecondary = () => { cleanup(); };
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
    onReady: function (selectedDates, dateStr, instance) {
        const todayBtn = document.createElement("button");
        todayBtn.type = "button";
        todayBtn.className = "flatpickr-today-btn";
        todayBtn.innerText = "Hoy";
        todayBtn.addEventListener("click", function (e) {
            e.stopPropagation();
            instance.setDate(new Date(), true);
            instance.close();
        });
        instance.calendarContainer.appendChild(todayBtn);
    },
    onChange: function (selectedDates, dateStr) {
        localStorage.setItem('selectedFecha', dateStr);
        const activeNav = localStorage.getItem('activeTab') || 'panel-asistencia';
        if (activeNav === 'panel-asistencia') cargarYRenderizarAsistencia();
    }
});

elements.fecha.addEventListener('click', (e) => {
    e.stopPropagation();
    flatpickrInstance.toggle();
});

function leerCacheAlumnos() {
    try {
        const data = JSON.parse(localStorage.getItem(CACHE_ALUMNOS) || "null");
        if (data && data.alumnos && Array.isArray(data.paralelos)) return data;
    } catch (error) { /* cache inválida */ }
    return null;
}

function guardarCacheAlumnos(data) {
    localStorage.setItem(CACHE_ALUMNOS, JSON.stringify({
        alumnos: data.alumnos,
        paralelos: data.paralelos || []
    }));
}

function claveAsistencia(paralelo, fecha) {
    return `${paralelo}|${fecha}`;
}

function leerCacheAsistencia(paralelo, fecha) {
    try {
        const data = JSON.parse(localStorage.getItem(CACHE_ASISTENCIA) || "null");
        if (data && data.clave === claveAsistencia(paralelo, fecha) && Array.isArray(data.registros)) {
            return data.registros;
        }
    } catch (error) { /* cache inválida */ }
    return null;
}

function guardarCacheAsistencia(paralelo, fecha, registros) {
    localStorage.setItem(CACHE_ASISTENCIA, JSON.stringify({
        clave: claveAsistencia(paralelo, fecha),
        registros: registros || []
    }));
}

function aplicarAlumnos(data) {
    mockData = data.alumnos;
    paralelosDisponibles = data.paralelos || [];
    actualizarSelector();
}

async function cargarDatosIniciales() {
    const cache = leerCacheAlumnos();
    const tabGuardada = localStorage.getItem('activeTab') || 'panel-asistencia';

    if (cache) {
        aplicarAlumnos(cache);
        activarPestana(tabGuardada, { skipFetch: true });
        const paraleloCache = localStorage.getItem('selectedParalelo');
        const fechaCache = elements.fecha.value;
        const registrosCache = leerCacheAsistencia(paraleloCache, fechaCache);
        if (tabGuardada === 'panel-asistencia' && registrosCache) {
            renderAsistencia(paraleloCache, registrosCache);
        } else if (tabGuardada === 'panel-asistencia') {
            elements.asistenciaList.innerHTML = '<div class="empty-state">Actualizando asistencia...</div>';
        }
    } else {
        elements.overlay.classList.add('active');
        elements.spinner.style.display = 'block';
        elements.modal.style.display = 'none';
    }

    try {
        const paralelo = localStorage.getItem('selectedParalelo') || '';
        const fecha = elements.fecha.value;
        const params = new URLSearchParams();
        params.set('incluir_asistencia', '1');
        if (paralelo) params.set('paralelo', paralelo);
        if (fecha) params.set('fecha', fecha);
        const url = `${GOOGLE_SCRIPT_URL}?${params}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data && data.alumnos) {
            aplicarAlumnos(data);
            guardarCacheAlumnos(data);
            const tab = localStorage.getItem('activeTab') || 'panel-asistencia';
            const paraleloActivo = localStorage.getItem('selectedParalelo');
            if (tab === 'panel-asistencia') {
                if (Array.isArray(data.registros)) {
                    guardarCacheAsistencia(paraleloActivo, fecha, data.registros);
                    renderAsistencia(paraleloActivo, data.registros);
                } else {
                    await cargarYRenderizarAsistencia();
                }
            } else if (!cache) {
                activarPestana(tab);
            } else if (tab === 'panel-editor') {
                renderEditor(paraleloActivo);
            }
        }
    } catch (error) {
        if (!cache) showModal("Error", "No se pudieron obtener los datos de la hoja.");
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
            if (activeNav === 'panel-asistencia') cargarYRenderizarAsistencia();
            if (activeNav === 'panel-editor') renderEditor(p);
            if (activeNav === 'panel-historial') {
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
document.addEventListener('click', () => { elements.customDropdown.classList.remove('open'); });

function activarPestana(targetId, opciones = {}) {
    const item = Array.from(elements.navItems).find(n => n.getAttribute('data-target') === targetId) || elements.navItems[0];
    elements.navItems.forEach(nav => nav.classList.remove('active'));
    elements.paneles.forEach(panel => panel.classList.remove('active'));

    item.classList.add('active');
    const idFinal = item.getAttribute('data-target');
    document.getElementById(idFinal).classList.add('active');
    localStorage.setItem('activeTab', idFinal);

    const actualParalelo = localStorage.getItem('selectedParalelo');

    if (idFinal === 'panel-asistencia') {
        elements.headerTitle.innerText = 'Asistencia';
        elements.legendBar.style.display = 'flex';
        elements.fab.style.display = 'block';
        elements.fecha.style.display = 'block';
        if (!opciones.skipFetch) cargarYRenderizarAsistencia();
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

elements.navItems.forEach(item => { item.addEventListener('click', () => { activarPestana(item.getAttribute('data-target')); }); });

async function cargarYRenderizarAsistencia() {
    const paralelo = localStorage.getItem('selectedParalelo');
    const fecha = elements.fecha.value;
    if (!paralelo || !fecha) return;

    const cacheRegistros = leerCacheAsistencia(paralelo, fecha);
    if (cacheRegistros && mockData[paralelo]) {
        renderAsistencia(paralelo, cacheRegistros);
    } else {
        elements.asistenciaList.innerHTML = '<div class="empty-state">Cargando asistencia...</div>';
    }

    try {
        const url = `${GOOGLE_SCRIPT_URL}?action=obtener_asistencia&paralelo=${encodeURIComponent(paralelo)}&fecha=${encodeURIComponent(fecha)}`;
        const response = await fetch(url);
        const data = await response.json();
        const registros = data.registros || [];
        guardarCacheAsistencia(paralelo, fecha, registros);
        renderAsistencia(paralelo, registros);
    } catch (error) {
        if (!cacheRegistros) renderAsistencia(paralelo, []);
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
        row.dataset.banner = student.banner;
        const radioName = `st-${index}`;

        const regExistente = mapaRegistros[student.nombre];
        const estadoActual = regExistente ? regExistente.estado : '';
        const notaActual = regExistente ? regExistente.notas || '' : '';

        row.innerHTML = `
            <div class="student-info">
                <span class="student-name">${student.nombre}</span><br>
                <small style="color:var(--text-muted); font-size:0.75rem; letter-spacing:0.5px;">Código: ${student.banner || 'N/A'}</small>
            </div>
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
            if (notesContainer.classList.contains('active')) row.querySelector('.notes-input').focus();
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
        if (presentRadio) { presentRadio.checked = true; row.style.borderColor = 'var(--present)'; }
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
                banner: row.dataset.banner,
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
    enviar(requestData, "Asistencia registrada exitosamente", () => {
        guardarCacheAsistencia(paralelo, elements.fecha.value, payload);
    });
});

function renderEditor(paralelo) {
    elements.editorList.innerHTML = '';
    if (!paralelo || !mockData[paralelo]) return;
    const fragment = document.createDocumentFragment();

    // Generamos las opciones de paralelos para el dropdown interno del editor
    const paralelosOptions = paralelosDisponibles.map(p =>
        `<option value="${p}" ${p === paralelo ? 'selected' : ''}>${p}</option>`
    ).join('');

    mockData[paralelo].forEach((student, index) => {
        const row = document.createElement('div');
        row.className = 'list-row';
        row.innerHTML = `
            <div class="student-info">
                <span class="student-name">${student.nombre}</span><br>
                <small style="color:var(--text-muted); font-size:0.75rem;">Código: ${student.banner || 'N/A'}</small>
            </div>
            <div class="editor-actions">
                <button class="btn-icon" onclick="enableEditStudent(${index})">Editar</button>
                <button class="btn-icon" onclick="deleteStudent(${index}, '${paralelo}')">Eliminar</button>
            </div>
            <div class="edit-container" id="edit-box-${index}" style="display: none;">
                <div class="edit-input-group">
                    <select id="input-edit-paralelo-${index}" style="flex:1; background: rgba(15, 23, 42, 0.7); border: 1px solid var(--glass-border); color: var(--text-main); border-radius: 10px; padding: 10px; outline: none;">
                        ${paralelosOptions}
                    </select>
                    <input type="text" id="input-edit-banner-${index}" value="${student.banner}" placeholder="Código Banner" style="flex:1;">
                </div>
                <div class="edit-input-group" style="margin-top: 8px;">
                    <input type="text" id="input-edit-nombre-${index}" value="${student.nombre}" placeholder="Nombre Completo" style="flex:1;">
                </div>
                <div class="btn-group-edit" style="margin-top: 8px;">
                    <button class="btn-save-edit" onclick="saveEditStudent(${index}, '${paralelo}')" style="flex:1;">Guardar Cambios</button>
                    <button class="btn-cancel-edit" onclick="cancelEditStudent(${index})" style="flex:1;">Cancelar</button>
                </div>
            </div>
        `;
        fragment.appendChild(row);
    });
    elements.editorList.appendChild(fragment);
}

window.enableEditStudent = function (index) {
    document.getElementById(`edit-box-${index}`).style.display = 'block'; // Cambiado de flex a block por los div internos
    document.getElementById(`input-edit-nombre-${index}`).focus();
};

window.cancelEditStudent = function (index) {
    document.getElementById(`edit-box-${index}`).style.display = 'none';
};

window.saveEditStudent = function (index, paraleloAnterior) {
    const newParalelo = document.getElementById(`input-edit-paralelo-${index}`).value;
    const newBanner = document.getElementById(`input-edit-banner-${index}`).value.trim();
    const newName = document.getElementById(`input-edit-nombre-${index}`).value.trim();
    if (!newName) return showModal("Atención", "El nombre no puede estar vacío.");

    const oldName = mockData[paraleloAnterior][index].nombre;
    const oldBanner = mockData[paraleloAnterior][index].banner;

    if (paraleloAnterior !== newParalelo) {
        mockData[paraleloAnterior].splice(index, 1);
        if (!mockData[newParalelo]) mockData[newParalelo] = [];
        mockData[newParalelo].push({ banner: newBanner, nombre: newName });
    } else {
        mockData[paraleloAnterior][index].banner = newBanner;
        mockData[paraleloAnterior][index].nombre = newName;
    }

    const requestData = {
        action: "editar_alumno",
        paraleloAnterior: paraleloAnterior,
        paraleloNuevo: newParalelo,
        bannerAnterior: oldBanner,
        nombreAnterior: oldName,
        bannerNuevo: newBanner,
        nombreNuevo: newName
    };
    enviar(requestData, "Datos y registro histórico del alumno actualizados.", () => {
        guardarCacheAlumnos({ alumnos: mockData, paralelos: paralelosDisponibles });
    });

    if (paraleloAnterior !== newParalelo) {
        elements.selectedParaleloText.innerText = newParalelo;
        localStorage.setItem('selectedParalelo', newParalelo);
        renderEditor(newParalelo);
    } else {
        renderEditor(paraleloAnterior);
    }
};

elements.btnAddStudent.addEventListener('click', () => {
    const banner = elements.newStudentBanner.value.trim();
    const name = elements.newStudentName.value.trim();
    const paralelo = localStorage.getItem('selectedParalelo');
    if (!name || !paralelo) return showModal("Atención", "Selecciona un paralelo e ingresa un nombre válido.");

    mockData[paralelo].push({ banner: banner, nombre: name });
    elements.newStudentBanner.value = '';
    elements.newStudentName.value = '';

    const requestData = { action: "agregar_alumno", paralelo: paralelo, banner: banner, nombre: name };
    enviar(requestData, "Alumno agregado al registro", () => {
        guardarCacheAlumnos({ alumnos: mockData, paralelos: paralelosDisponibles });
    });
    renderEditor(paralelo);
});

window.deleteStudent = function (index, paralelo) {
    showModal("Eliminar Alumno", "¿Deseas eliminar permanentemente a este alumno de la lista?", true, () => {
        const nameToDelete = mockData[paralelo][index].nombre;
        mockData[paralelo].splice(index, 1);
        const requestData = { action: "eliminar_alumno", paralelo: paralelo, nombreAnterior: nameToDelete };
        enviar(requestData, "Alumno eliminado del registro", () => {
            guardarCacheAlumnos({ alumnos: mockData, paralelos: paralelosDisponibles });
        });
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
            row.dataset.banner = reg.banner;

            row.innerHTML = `
                <div class="student-info">
                    <span class="student-name">${reg.estudiante}</span><br>
                    <small style="color:var(--text-muted); font-size:0.75rem;">Código: ${reg.banner || 'N/A'}</small>
                </div>
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
                if (notesContainer.classList.contains('active')) row.querySelector('.notes-input').focus();
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
                banner: row.dataset.banner,
                estudiante: row.dataset.nombre,
                estado: radio.value,
                notas: row.querySelector('.notes-input').value
            });
        }
    });

    if (incompleto) return showModal("Atención", "Marca el estado de todos los alumnos.");

    const requestData = { action: "guardar_asistencia", paralelo: paralelo, fecha: fecha, registros: payload };
    enviar(requestData, "Historial actualizado en Excel", () => {
        guardarCacheAsistencia(paralelo, fecha, payload);
    });
});

async function enviar(datos, mensajeExito, onOk) {
    elements.overlay.classList.add('active');
    elements.spinner.style.display = 'block';
    elements.modal.style.display = 'none';

    try {
        await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify(datos)
        });
        if (onOk) onOk();
        elements.spinner.style.display = 'none';
        showModal("Completado", mensajeExito);
    } catch (error) {
        elements.spinner.style.display = 'none';
        showModal("Error", "Ocurrió un problema de conexión.");
    }
}

cargarDatosIniciales();