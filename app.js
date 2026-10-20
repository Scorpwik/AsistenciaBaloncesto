function normalizarScriptUrl(valor) {
    const v = String(valor || "").trim();
    if (/^https?:\/\//i.test(v)) return v.replace(/\/+$/, "");
    if (/^AKfycb/i.test(v)) return `https://script.google.com/macros/s/${v}/exec`;
    return v;
}

const GOOGLE_SCRIPT_URL = normalizarScriptUrl(
    "https://script.google.com/macros/s/AKfycbxKMDX7JeFnqBlAYKI2saf1lv_IaX61PqcHcpcot5nyohzSr0teO-OB9qcMVSDvjIK9/exec"
);
const CACHE_ALUMNOS = "basketCacheAlumnos";
const CACHE_ASISTENCIA = "basketCacheAsistencia";

let mockData = {};
let paralelosDisponibles = [];
let flatpickrInstance = null;
let editorParalelo = null;
let lastHistoryKey = "";
let historialSesiones = [];
let historialFechaAbierta = "";

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
    editorSchedulesView: document.getElementById('editorSchedulesView'),
    editorStudentsView: document.getElementById('editorStudentsView'),
    horariosList: document.getElementById('horariosList'),
    formNewHorario: document.getElementById('formNewHorario'),
    newHorarioName: document.getElementById('newHorarioName'),
    btnBackHorarios: document.getElementById('btnBackHorarios'),
    editorHorarioTitle: document.getElementById('editorHorarioTitle'),
    studentSearch: document.getElementById('studentSearch'),
    formAddStudent: document.getElementById('formAddStudent'),
    editorList: document.getElementById('editorList'),
    newStudentBanner: document.getElementById('newStudentBanner'),
    newStudentName: document.getElementById('newStudentName'),
    btnAddStudent: document.getElementById('btnAddStudent'),
    historialList: document.getElementById('historialList'),
    historialContext: document.getElementById('historialContext'),
    historialSearch: document.getElementById('historialSearch'),
    historialHint: document.getElementById('historialHint'),
    btnFetchHistory: document.getElementById('btnFetchHistory'),
    historialActionContainer: document.getElementById('historialActionContainer'),
    btnSaveHistoryEdits: document.getElementById('btnSaveHistoryEdits'),
    toast: document.getElementById('toast'),
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
        if (activeNav === 'panel-historial') {
            const paralelo = localStorage.getItem('selectedParalelo');
            if (historialSesiones._paralelo === paralelo && elements.historialList.querySelector('.hist-day')) {
                actualizarHintHistorial(dateStr, historialSesiones);
                const existe = historialSesiones.some(s => s.fecha === dateStr);
                abrirDiaHistorial(existe ? dateStr : '', existe);
            } else {
                cargarHistorial();
            }
        }
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

function escapeHtml(valor) {
    return String(valor || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function textoBusqueda(valor) {
    return String(valor || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function formatearFechaHumana(iso) {
    const partes = String(iso || "").split("-");
    if (partes.length !== 3) return iso;
    return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

const DIAS_SEMANA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function partesFechaIso(iso) {
    const partes = String(iso || "").split("-").map(Number);
    if (partes.length !== 3 || partes.some(n => !n && n !== 0)) return null;
    return { y: partes[0], m: partes[1], d: partes[2] };
}

function diaSemanaIso(iso) {
    const p = partesFechaIso(iso);
    if (!p) return "";
    return DIAS_SEMANA[new Date(p.y, p.m - 1, p.d).getDay()] || "";
}

function etiquetaMes(iso) {
    const p = partesFechaIso(iso);
    if (!p) return "";
    return `${MESES[p.m - 1] || ""} ${p.y}`;
}

function claveMes(iso) {
    return String(iso || "").slice(0, 7);
}

function resumenEstados(registros) {
    const resumen = { Presente: 0, Falta: 0, Atraso: 0, total: registros.length };
    registros.forEach(reg => {
        if (resumen[reg.estado] !== undefined) resumen[reg.estado] += 1;
    });
    return resumen;
}

function fechaSeleccionada() {
    if (flatpickrInstance && flatpickrInstance.selectedDates[0]) {
        return flatpickrInstance.formatDate(flatpickrInstance.selectedDates[0], "Y-m-d");
    }
    return String(elements.fecha.value || "").trim();
}

function elegirFechaHistorial(iso) {
    if (!iso || !flatpickrInstance) return;
    flatpickrInstance.setDate(iso, true);
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
        const fechaCache = fechaSeleccionada();
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
        const fecha = fechaSeleccionada();
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
                mostrarVistaHorarios();
            } else if (tab === 'panel-historial') {
                cargarHistorial();
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
            if (activeNav === 'panel-editor') mostrarVistaHorarios();
            if (activeNav === 'panel-historial') cargarHistorial();
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

    const controls = document.querySelector('.controls');

    if (idFinal === 'panel-asistencia') {
        elements.headerTitle.innerText = 'Asistencia';
        elements.legendBar.style.display = 'flex';
        elements.fab.style.display = 'block';
        elements.fecha.style.display = 'block';
        if (controls) controls.style.display = 'flex';
        if (!opciones.skipFetch) cargarYRenderizarAsistencia();
    }
    else if (idFinal === 'panel-editor') {
        elements.headerTitle.innerText = 'Editor';
        elements.legendBar.style.display = 'none';
        elements.fab.style.display = 'none';
        elements.fecha.style.display = 'none';
        if (controls) controls.style.display = 'none';
        mostrarVistaHorarios();
    }
    else if (idFinal === 'panel-historial') {
        elements.headerTitle.innerText = 'Historial';
        elements.legendBar.style.display = 'none';
        elements.fab.style.display = 'none';
        elements.fecha.style.display = 'block';
        if (controls) controls.style.display = 'flex';
        cargarHistorial();
    }
}

elements.navItems.forEach(item => {
    item.addEventListener('click', () => { activarPestana(item.getAttribute('data-target')); });
    item.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            activarPestana(item.getAttribute('data-target'));
        }
    });
});

async function cargarYRenderizarAsistencia() {
    const paralelo = localStorage.getItem('selectedParalelo');
    const fecha = fechaSeleccionada();
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

    const fecha = fechaSeleccionada();
    const requestData = {
        action: "guardar_asistencia",
        paralelo: paralelo,
        fecha: fecha,
        registros: payload
    };
    enviar(requestData, `Asistencia registrada para el ${formatearFechaHumana(fecha)}`, () => {
        guardarCacheAsistencia(paralelo, fecha, payload);
    });
});

function mostrarVistaHorarios() {
    editorParalelo = null;
    elements.editorSchedulesView.hidden = false;
    elements.editorStudentsView.hidden = true;
    elements.headerTitle.innerText = 'Horarios';
    renderHorarios();
}

function abrirHorario(paralelo) {
    editorParalelo = paralelo;
    localStorage.setItem('selectedParalelo', paralelo);
    elements.selectedParaleloText.innerText = paralelo;
    document.querySelectorAll('.dropdown-option').forEach(o => {
        o.classList.toggle('selected', o.innerText === paralelo);
    });
    elements.editorSchedulesView.hidden = true;
    elements.editorStudentsView.hidden = false;
    elements.headerTitle.innerText = 'Estudiantes';
    elements.editorHorarioTitle.textContent = paralelo;
    elements.studentSearch.value = '';
    renderEditorEstudiantes();
}

function renderHorarios() {
    elements.horariosList.innerHTML = '';
    if (paralelosDisponibles.length === 0) {
        elements.horariosList.innerHTML = '<div class="empty-state">No hay horarios. Crea el primero arriba.</div>';
        return;
    }

    const fragment = document.createDocumentFragment();
    paralelosDisponibles.forEach(p => {
        const alumnos = mockData[p] || [];
        const card = document.createElement('div');
        card.className = 'horario-card';
        card.innerHTML = `
            <button type="button" class="horario-card-main">
                <span class="horario-name">${escapeHtml(p)}</span>
                <div class="horario-meta">${alumnos.length} estudiante${alumnos.length === 1 ? '' : 's'}</div>
            </button>
            <button type="button" class="btn-danger">Borrar</button>
        `;
        card.querySelector('.horario-card-main').addEventListener('click', () => abrirHorario(p));
        card.querySelector('.btn-danger').addEventListener('click', () => borrarHorario(p));
        fragment.appendChild(card);
    });
    elements.horariosList.appendChild(fragment);
}

function renderEditorEstudiantes() {
    const paralelo = editorParalelo;
    elements.editorList.innerHTML = '';
    if (!paralelo) return;
    if (!mockData[paralelo]) mockData[paralelo] = [];

    const query = textoBusqueda(elements.studentSearch.value);
    const alumnos = mockData[paralelo]
        .map((student, index) => ({ student, index }))
        .filter(({ student }) => {
            if (!query) return true;
            return textoBusqueda(student.nombre).includes(query) || textoBusqueda(student.banner).includes(query);
        });

    const count = document.createElement('div');
    count.className = 'student-count';
    count.textContent = query
        ? `${alumnos.length} resultado${alumnos.length === 1 ? '' : 's'} en ${paralelo}`
        : `${mockData[paralelo].length} estudiante${mockData[paralelo].length === 1 ? '' : 's'} en ${paralelo}`;
    elements.editorList.appendChild(count);

    if (alumnos.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty-state';
        empty.textContent = query ? 'No hay coincidencias con esa búsqueda.' : 'Este horario aún no tiene estudiantes.';
        elements.editorList.appendChild(empty);
        return;
    }

    const paralelosOptions = paralelosDisponibles.map(p =>
        `<option value="${escapeHtml(p)}" ${p === paralelo ? 'selected' : ''}>${escapeHtml(p)}</option>`
    ).join('');

    const fragment = document.createDocumentFragment();
    alumnos.forEach(({ student, index }) => {
        const row = document.createElement('div');
        row.className = 'list-row';
        row.innerHTML = `
            <div class="student-info">
                <span class="student-name">${escapeHtml(student.nombre)}</span><br>
                <small style="color:var(--text-muted); font-size:0.75rem;">Código: ${escapeHtml(student.banner || 'N/A')}</small>
            </div>
            <div class="editor-actions">
                <button type="button" class="btn-icon btn-edit">Editar</button>
                <button type="button" class="btn-icon btn-delete">Eliminar</button>
            </div>
            <div class="edit-container" hidden>
                <div class="edit-input-group">
                    <select class="input-edit-paralelo" style="flex:1; background: rgba(15, 23, 42, 0.7); border: 1px solid var(--glass-border); color: var(--text-main); border-radius: 10px; padding: 10px; outline: none;">
                        ${paralelosOptions}
                    </select>
                    <input type="text" class="input-edit-banner" value="${escapeHtml(student.banner)}" placeholder="Código Banner" style="flex:1;">
                </div>
                <div class="edit-input-group" style="margin-top: 8px;">
                    <input type="text" class="input-edit-nombre" value="${escapeHtml(student.nombre)}" placeholder="Nombre Completo" style="flex:1;">
                </div>
                <div class="btn-group-edit" style="margin-top: 8px;">
                    <button type="button" class="btn-save-edit" style="flex:1;">Guardar cambios</button>
                    <button type="button" class="btn-cancel-edit" style="flex:1;">Cancelar</button>
                </div>
            </div>
        `;
        const editBox = row.querySelector('.edit-container');
        row.querySelector('.btn-edit').addEventListener('click', () => {
            editBox.hidden = false;
            row.querySelector('.input-edit-nombre').focus();
        });
        row.querySelector('.btn-cancel-edit').addEventListener('click', () => { editBox.hidden = true; });
        row.querySelector('.btn-save-edit').addEventListener('click', () => {
            guardarEdicionEstudiante(index, paralelo, {
                paralelo: row.querySelector('.input-edit-paralelo').value,
                banner: row.querySelector('.input-edit-banner').value.trim(),
                nombre: row.querySelector('.input-edit-nombre').value.trim()
            });
        });
        row.querySelector('.btn-delete').addEventListener('click', () => eliminarEstudiante(index, paralelo));
        fragment.appendChild(row);
    });
    elements.editorList.appendChild(fragment);
}

function guardarEdicionEstudiante(index, paraleloAnterior, cambios) {
    if (!cambios.nombre) return showModal("Atención", "El nombre no puede estar vacío.");
    const actual = mockData[paraleloAnterior][index];
    if (!actual) return;
    const oldName = actual.nombre;
    const oldBanner = actual.banner;

    if (paraleloAnterior !== cambios.paralelo) {
        mockData[paraleloAnterior].splice(index, 1);
        if (!mockData[cambios.paralelo]) mockData[cambios.paralelo] = [];
        mockData[cambios.paralelo].push({ banner: cambios.banner, nombre: cambios.nombre });
    } else {
        actual.banner = cambios.banner;
        actual.nombre = cambios.nombre;
    }

    enviar({
        action: "editar_alumno",
        paraleloAnterior: paraleloAnterior,
        paraleloNuevo: cambios.paralelo,
        bannerAnterior: oldBanner,
        nombreAnterior: oldName,
        bannerNuevo: cambios.banner,
        nombreNuevo: cambios.nombre
    }, "Datos y registro histórico del alumno actualizados.", () => {
        guardarCacheAlumnos({ alumnos: mockData, paralelos: paralelosDisponibles });
    });

    if (paraleloAnterior !== cambios.paralelo) abrirHorario(cambios.paralelo);
    else renderEditorEstudiantes();
}

elements.formAddStudent.addEventListener('submit', (e) => {
    e.preventDefault();
    const banner = elements.newStudentBanner.value.trim();
    const name = elements.newStudentName.value.trim();
    const paralelo = editorParalelo;
    if (!name || !paralelo) return showModal("Atención", "Entra a un horario e ingresa un nombre válido.");
    if (!mockData[paralelo]) mockData[paralelo] = [];

    mockData[paralelo].push({ banner: banner, nombre: name });
    elements.newStudentBanner.value = '';
    elements.newStudentName.value = '';

    enviar({ action: "agregar_alumno", paralelo: paralelo, banner: banner, nombre: name }, "Alumno agregado al registro", () => {
        guardarCacheAlumnos({ alumnos: mockData, paralelos: paralelosDisponibles });
    });
    renderEditorEstudiantes();
});

function eliminarEstudiante(index, paralelo) {
    showModal("Eliminar alumno", "¿Deseas eliminar permanentemente a este alumno de la lista?", true, () => {
        const nameToDelete = mockData[paralelo][index].nombre;
        mockData[paralelo].splice(index, 1);
        enviar({ action: "eliminar_alumno", paralelo: paralelo, nombreAnterior: nameToDelete }, "Alumno eliminado del registro", () => {
            guardarCacheAlumnos({ alumnos: mockData, paralelos: paralelosDisponibles });
        });
        renderEditorEstudiantes();
    });
}

elements.formNewHorario.addEventListener('submit', (e) => {
    e.preventDefault();
    const nombre = elements.newHorarioName.value.trim();
    if (!nombre) return showModal("Atención", "Escribe un nombre para el horario.");
    if (paralelosDisponibles.includes(nombre) || mockData[nombre]) {
        return showModal("Atención", "Ya existe un horario con ese nombre.");
    }

    mockData[nombre] = [];
    paralelosDisponibles = [...paralelosDisponibles, nombre].sort();
    elements.newHorarioName.value = '';
    actualizarSelector();
    enviar({ action: "crear_paralelo", paralelo: nombre }, "Horario creado.", () => {
        guardarCacheAlumnos({ alumnos: mockData, paralelos: paralelosDisponibles });
    });
    renderHorarios();
});

function borrarHorario(paralelo) {
    showModal("Borrar horario", `Se borrará "${paralelo}" y sus estudiantes de la hoja. Esta acción no se puede deshacer.`, true, () => {
        delete mockData[paralelo];
        paralelosDisponibles = paralelosDisponibles.filter(p => p !== paralelo);
        if (editorParalelo === paralelo) editorParalelo = null;
        actualizarSelector();
        enviar({ action: "eliminar_paralelo", paralelo: paralelo }, "Horario eliminado.", () => {
            guardarCacheAlumnos({ alumnos: mockData, paralelos: paralelosDisponibles });
        });
        mostrarVistaHorarios();
    });
}

elements.btnBackHorarios.addEventListener('click', mostrarVistaHorarios);
elements.studentSearch.addEventListener('input', renderEditorEstudiantes);

async function fetchJsonAsistencia(params) {
    const response = await fetch(`${GOOGLE_SCRIPT_URL}?${new URLSearchParams(params)}`);
    return response.json();
}

async function obtenerSesionesHorario(paralelo, fecha, onProgreso) {
    const todoData = await fetchJsonAsistencia({
        action: "obtener_asistencia",
        todo: "1",
        paralelo
    });
    if (Array.isArray(todoData.sesiones) && todoData.sesiones.length) {
        return todoData.sesiones;
    }

    const data = await fetchJsonAsistencia({
        action: "obtener_asistencia",
        paralelo,
        fecha: fecha || ""
    });
    const fechas = Array.isArray(data.fechas) ? data.fechas.slice() : [];
    if (fecha && Array.isArray(data.registros) && data.registros.length && !fechas.includes(fecha)) {
        fechas.unshift(fecha);
    }
    if (!fechas.length) {
        if (Array.isArray(data.registros) && data.registros.length) {
            return [{ fecha: fecha || "", registros: data.registros }];
        }
        return [];
    }

    const sesiones = [];
    const lote = 4;
    for (let i = 0; i < fechas.length; i += lote) {
        const slice = fechas.slice(i, i + lote);
        const parte = await Promise.all(slice.map(async iso => {
            const d = await fetchJsonAsistencia({
                action: "obtener_asistencia",
                paralelo,
                fecha: iso
            });
            return { fecha: iso, registros: Array.isArray(d.registros) ? d.registros : [] };
        }));
        sesiones.push(...parte);
        if (onProgreso) onProgreso(Math.min(i + lote, fechas.length), fechas.length);
    }
    return sesiones;
}

function actualizarHintHistorial(fecha, sesiones) {
    if (!elements.historialHint) return;
    const hayFecha = sesiones.some(s => s.fecha === fecha);
    if (!fecha || hayFecha || !sesiones.length) {
        elements.historialHint.hidden = true;
        elements.historialHint.textContent = "";
        return;
    }
    elements.historialHint.hidden = false;
    elements.historialHint.textContent = `No hay clase el ${formatearFechaHumana(fecha)}. Abre otro día de la lista.`;
}

function pintarFilaHistorial(reg, radioName) {
    const row = document.createElement('div');
    row.className = 'list-row hist-student';
    row.dataset.nombre = reg.estudiante;
    row.dataset.banner = reg.banner || '';
    row.innerHTML = `
        <div class="student-info">
            <span class="student-name">${escapeHtml(reg.estudiante)}</span><br>
            <small style="color:var(--text-muted); font-size:0.75rem;">Código: ${escapeHtml(reg.banner || 'N/A')}</small>
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
            <input type="text" class="notes-input" placeholder="Nota..." value="${escapeHtml(reg.notas || '')}">
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
    return row;
}

function abrirDiaHistorial(iso, scroll) {
    historialFechaAbierta = iso || "";
    document.querySelectorAll('#historialList .hist-day').forEach(day => {
        const abierto = day.dataset.fecha === iso;
        day.classList.toggle('open', abierto);
        const body = day.querySelector('.hist-day-body');
        const head = day.querySelector('.hist-day-head');
        if (body) body.hidden = !abierto;
        if (head) head.setAttribute('aria-expanded', abierto ? 'true' : 'false');
        if (abierto && scroll) day.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    elements.historialActionContainer.hidden = !iso;
}

function filtrarHistorial() {
    const q = textoBusqueda(elements.historialSearch ? elements.historialSearch.value : "");
    document.querySelectorAll('#historialList .hist-month').forEach(month => {
        let visibles = 0;
        month.querySelectorAll('.hist-day').forEach(day => {
            const hay = !q || textoBusqueda(day.dataset.busca || "").includes(q);
            day.hidden = !hay;
            if (hay) visibles += 1;
        });
        month.hidden = visibles === 0;
    });
}

async function cargarHistorial() {
    const fecha = fechaSeleccionada();
    const paralelo = localStorage.getItem('selectedParalelo');
    if (elements.historialContext) {
        elements.historialContext.textContent = paralelo
            ? `${paralelo} · ${historialSesiones.length ? historialSesiones.length + ' días' : 'todas las fechas'}`
            : '';
    }
    if (!paralelo) {
        elements.historialList.innerHTML = '<div class="empty-state">Selecciona un horario.</div>';
        elements.historialActionContainer.hidden = true;
        return;
    }

    lastHistoryKey = paralelo;
    if (!historialSesiones.length || historialSesiones._paralelo !== paralelo) {
        elements.historialList.innerHTML = '<div class="empty-state">Cargando historial...</div>';
        elements.historialActionContainer.hidden = true;
    }

    try {
        const sesiones = await obtenerSesionesHorario(paralelo, fecha, (hecho, total) => {
            if (lastHistoryKey !== paralelo) return;
            if (total > 1) {
                elements.historialList.innerHTML = `<div class="empty-state">Cargando días ${hecho}/${total}...</div>`;
            }
        });
        if (lastHistoryKey !== paralelo) return;
        historialSesiones = sesiones;
        historialSesiones._paralelo = paralelo;
        if (elements.historialContext) {
            elements.historialContext.textContent = `${paralelo} · ${sesiones.length} ${sesiones.length === 1 ? 'día' : 'días'}`;
        }
        if (!sesiones.length) {
            elements.historialList.innerHTML = '<div class="empty-state">Este horario todavía no tiene asistencias guardadas.</div>';
            elements.historialActionContainer.hidden = true;
            actualizarHintHistorial(fecha, []);
            return;
        }
        sesiones.forEach(sesion => {
            guardarCacheAsistencia(paralelo, sesion.fecha, sesion.registros);
        });
        pintarHistorial(sesiones, fecha);
    } catch (error) {
        if (!historialSesiones.length || historialSesiones._paralelo !== paralelo) {
            elements.historialList.innerHTML = '<div class="empty-state" style="color:var(--absent);">No se pudo cargar el historial. Revisa la conexión o vuelve a publicar el Apps Script.</div>';
            elements.historialActionContainer.hidden = true;
        }
    }
}

function pintarHistorial(sesiones, fechaFocus) {
    elements.historialList.innerHTML = '';
    actualizarHintHistorial(fechaFocus, sesiones);
    const fragment = document.createDocumentFragment();
    let mesActual = "";
    let mesWrap = null;
    let stripe = 0;

    sesiones.forEach((sesion, idx) => {
        const mes = claveMes(sesion.fecha);
        if (mes !== mesActual) {
            mesActual = mes;
            mesWrap = document.createElement('section');
            mesWrap.className = 'hist-month';
            const titulo = document.createElement('h2');
            titulo.className = 'hist-month-title';
            titulo.textContent = etiquetaMes(sesion.fecha);
            mesWrap.appendChild(titulo);
            fragment.appendChild(mesWrap);
            stripe = 0;
        }
        const resumen = resumenEstados(sesion.registros || []);
        const day = document.createElement('article');
        day.className = `hist-day ${stripe % 2 === 0 ? 'hist-day--a' : 'hist-day--b'}`;
        day.dataset.fecha = sesion.fecha;
        day.dataset.busca = [
            sesion.fecha,
            formatearFechaHumana(sesion.fecha),
            diaSemanaIso(sesion.fecha),
            etiquetaMes(sesion.fecha),
            ...(sesion.registros || []).map(r => `${r.estudiante} ${r.banner}`)
        ].join(' ');
        stripe += 1;

        const head = document.createElement('button');
        head.type = 'button';
        head.className = 'hist-day-head';
        head.setAttribute('aria-expanded', 'false');
        head.innerHTML = `
            <span class="hist-day-when">
                <span class="hist-day-date">${escapeHtml(formatearFechaHumana(sesion.fecha))}</span>
                <span class="hist-day-week">${escapeHtml(diaSemanaIso(sesion.fecha))}</span>
            </span>
            <span class="hist-day-stats" aria-label="${resumen.Presente} presentes, ${resumen.Atraso} atrasos, ${resumen.Falta} faltas">
                <span class="hist-stat present">${resumen.Presente} P</span>
                <span class="hist-stat late">${resumen.Atraso} A</span>
                <span class="hist-stat absent">${resumen.Falta} F</span>
            </span>
            <span class="hist-day-count">${resumen.total}</span>
        `;
        head.addEventListener('click', () => {
            const yaAbierto = day.classList.contains('open');
            abrirDiaHistorial(yaAbierto ? '' : sesion.fecha, false);
        });

        const body = document.createElement('div');
        body.className = 'hist-day-body';
        body.hidden = true;
        (sesion.registros || []).forEach((reg, i) => {
            body.appendChild(pintarFilaHistorial(reg, `hist-${sesion.fecha}-${idx}-${i}`));
        });

        day.appendChild(head);
        day.appendChild(body);
        mesWrap.appendChild(day);
    });

    elements.historialList.appendChild(fragment);
    filtrarHistorial();
    const existe = sesiones.some(s => s.fecha === fechaFocus);
    abrirDiaHistorial(existe ? fechaFocus : '', existe);
}

elements.btnFetchHistory.addEventListener('click', () => { cargarHistorial(); });
if (elements.historialSearch) {
    elements.historialSearch.addEventListener('input', filtrarHistorial);
}

elements.btnSaveHistoryEdits.addEventListener('click', () => {
    const payload = [];
    let incompleto = false;
    const paralelo = localStorage.getItem('selectedParalelo');
    const fecha = historialFechaAbierta || fechaSeleccionada();
    const day = document.querySelector(`#historialList .hist-day[data-fecha="${fecha}"]`);
    if (!day) return showModal("Atención", "Abre un día para guardar sus cambios.");

    day.querySelectorAll('.list-row').forEach(row => {
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
    enviar(requestData, `Historial del ${formatearFechaHumana(fecha)} actualizado`, () => {
        guardarCacheAsistencia(paralelo, fecha, payload);
        const sesion = historialSesiones.find(s => s.fecha === fecha);
        if (sesion) sesion.registros = payload;
        pintarHistorial(historialSesiones, fecha);
    });
});

let enviosPendientes = 0;
let avisoTemporizador = 0;

function mostrarAviso(texto, tipo) {
    if (!elements.toast) return;
    elements.toast.hidden = false;
    elements.toast.textContent = texto;
    elements.toast.className = `toast toast-${tipo} visible`;
    clearTimeout(avisoTemporizador);
    avisoTemporizador = setTimeout(() => {
        elements.toast.classList.remove('visible');
    }, tipo === 'error' ? 0 : tipo === 'info' ? 2600 : 3800);
}

function actualizarBotonGuardar() {
    if (!elements.fab) return;
    elements.fab.disabled = enviosPendientes > 0;
    elements.fab.textContent = enviosPendientes > 0 ? 'Guardando…' : 'Guardar Asistencia';
}

async function enviar(datos, mensajeExito, onOk) {
    enviosPendientes += 1;
    actualizarBotonGuardar();
    mostrarAviso('Guardando en Excel. Puedes seguir usando la app; el registro se está enviando.', 'info');

    try {
        const response = await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(datos),
            redirect: 'follow'
        });
        if (!response.ok) {
            throw new Error(`El servidor respondió con error (${response.status}).`);
        }
        const texto = await response.text();
        let data = {};
        try { data = JSON.parse(texto); } catch (e) { data = {}; }
        if (data.status === "error") {
            throw new Error(data.message || "El servidor no pudo guardar.");
        }
        if (onOk) onOk();
        mostrarAviso(mensajeExito, 'ok');
    } catch (error) {
        console.error("Error al guardar:", error);
        const detalle = error && error.message ? String(error.message) : "";
        const esServidor = detalle && detalle !== "Failed to fetch" && !detalle.includes("respondió con error");
        showModal("No se guardó", esServidor
            ? `Ocurrió un problema al guardar en Excel: ${detalle}`
            : "Ocurrió un problema de conexión. Revisa que la URL de Apps Script esté completa y publicada.");
    } finally {
        enviosPendientes = Math.max(0, enviosPendientes - 1);
        actualizarBotonGuardar();
    }
}

cargarDatosIniciales();

if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
        navigator.serviceWorker.register("./sw.js").catch((err) => {
            console.warn("No se pudo registrar el service worker:", err);
        });
    });
}