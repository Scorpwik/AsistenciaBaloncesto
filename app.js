// app.js
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxaZXgvmz9lCwtGffE1A55TkpHqQjuVEODl1fxorba5XF8HKPFvC7fVb2RXCnsPuebv/exec";

let mockData = {
    "Paralelo A": [
        { id: 1, nombre: "Mateo Pérez" }, { id: 2, nombre: "Lucas Gómez" },
        { id: 3, nombre: "Sofía López" }
    ],
    "Lu/Mi 16:00": [
        { id: 6, nombre: "Juan Castro" }, { id: 7, nombre: "Pedro Torres" }
    ]
};

const mockHistory = {
    "Paralelo A": {
        "2023-10-01": [
            { estudiante: "Mateo Pérez", estado: "Presente", notas: "" },
            { estudiante: "Lucas Gómez", estado: "Falta", notas: "Justificado médica" },
            { estudiante: "Sofía López", estado: "Atraso", notas: "10 min" }
        ]
    }
};

const elements = {
    paralelo: document.getElementById('paraleloSelect'),
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

    overlay: document.getElementById('loaderOverlay'),
    spinner: document.getElementById('spinner'),
    modal: document.getElementById('successModal'),
    btnCerrar: document.getElementById('cerrarModalBtn'),
    modalTitle: document.getElementById('modalTitle'),
    modalText: document.getElementById('modalText')
};

elements.fecha.valueAsDate = new Date();

elements.navItems.forEach(item => {
    item.addEventListener('click', () => {
        elements.navItems.forEach(nav => nav.classList.remove('active'));
        elements.paneles.forEach(panel => panel.classList.remove('active'));
        
        item.classList.add('active');
        const targetId = item.getAttribute('data-target');
        document.getElementById(targetId).classList.add('active');

        if(targetId === 'panel-asistencia') {
            elements.headerTitle.innerHTML = '🏀 Asistencia';
            elements.legendBar.style.display = 'flex';
            elements.fab.style.display = 'block';
            elements.fecha.style.display = 'block';
            renderAsistencia(elements.paralelo.value);
        } 
        else if (targetId === 'panel-editor') {
            elements.headerTitle.innerHTML = '👥 Editor de Alumnos';
            elements.legendBar.style.display = 'none';
            elements.fab.style.display = 'none';
            elements.fecha.style.display = 'none';
            renderEditor(elements.paralelo.value);
        } 
        else if (targetId === 'panel-historial') {
            elements.headerTitle.innerHTML = '📅 Historial';
            elements.legendBar.style.display = 'none';
            elements.fab.style.display = 'none';
            elements.fecha.style.display = 'block';
            elements.historialList.innerHTML = '<div style="padding:15px;text-align:center;color:#666;">Selecciona una fecha y presiona "Cargar Historial"</div>';
        }
    });
});

elements.paralelo.addEventListener('change', (e) => {
    const activeNav = document.querySelector('.nav-item.active').getAttribute('data-target');
    if(activeNav === 'panel-asistencia') renderAsistencia(e.target.value);
    if(activeNav === 'panel-editor') renderEditor(e.target.value);
    if(activeNav === 'panel-historial') elements.historialList.innerHTML = '<div style="padding:15px;text-align:center;color:#666;">Paralelo cambiado. Presiona Cargar.</div>';
});

// PANEL 1: ASISTENCIA
function renderAsistencia(paralelo) {
    elements.asistenciaList.innerHTML = '';
    (mockData[paralelo] || []).forEach(student => {
        const row = document.createElement('div');
        row.className = 'list-row';
        row.dataset.nombre = student.nombre;

        row.innerHTML = `
            <div class="student-info"><span class="student-name">${student.nombre}</span></div>
            <div class="status-group">
                <label>
                    <input type="radio" name="st-${student.id}" value="Presente" class="status-radio">
                    <div class="status-btn">P</div>
                </label>
                <label>
                    <input type="radio" name="st-${student.id}" value="Falta" class="status-radio">
                    <div class="status-btn">F</div>
                </label>
                <label>
                    <input type="radio" name="st-${student.id}" value="Atraso" class="status-radio">
                    <div class="status-btn">A</div>
                </label>
                <button class="note-toggle" type="button">✎</button>
            </div>
            <div class="notes-container">
                <input type="text" class="notes-input" placeholder="Nota rápida...">
            </div>
        `;

        row.querySelector('.note-toggle').addEventListener('click', () => {
            const notesContainer = row.querySelector('.notes-container');
            notesContainer.classList.toggle('active');
            if(notesContainer.classList.contains('active')) row.querySelector('.notes-input').focus();
        });

        row.querySelectorAll('.status-radio').forEach(radio => {
            radio.addEventListener('change', (e) => {
                row.style.background = e.target.value === 'Presente' ? '#f1f8e9' : 
                                       e.target.value === 'Falta' ? '#ffebee' : '#fff8e1';
            });
        });

        elements.asistenciaList.appendChild(row);
    });
}

elements.btnTodos.addEventListener('click', () => {
    document.querySelectorAll('#asistenciaList .list-row').forEach(row => {
        const presentRadio = row.querySelector('input[value="Presente"]');
        if(presentRadio) { presentRadio.checked = true; row.style.background = '#f1f8e9'; }
    });
});

elements.fab.addEventListener('click', () => {
    const payload = [];
    let incompleto = false;

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

    if (incompleto) return alert("Marca el estado de todos los alumnos.");

    const requestData = {
        action: "guardar_asistencia",
        paralelo: elements.paralelo.value,
        fecha: elements.fecha.value,
        registros: payload
    };
    enviar(requestData, "Asistencia guardada correctamente");
});

// PANEL 2: EDITOR (Con opción de modificar nombre)
function renderEditor(paralelo) {
    elements.editorList.innerHTML = '';
    (mockData[paralelo] || []).forEach((student) => {
        const row = document.createElement('div');
        row.className = 'list-row';
        row.id = `row-student-${student.id}`;
        row.innerHTML = `
            <div class="student-info">
                <span class="student-name" id="name-display-${student.id}">${student.nombre}</span>
            </div>
            <div class="editor-actions">
                <button class="btn-icon" onclick="enableEditStudent(${student.id})">✏️</button>
                <button class="btn-icon" onclick="deleteStudent(${student.id}, '${paralelo}')">🗑️</button>
            </div>
            <div class="edit-container" id="edit-box-${student.id}" style="display: none;">
                <input type="text" id="input-edit-${student.id}" value="${student.nombre}">
                <button class="btn-save-edit" onclick="saveEditStudent(${student.id}, '${paralelo}')">Guardar</button>
                <button class="btn-cancel-edit" onclick="cancelEditStudent(${student.id})">✕</button>
            </div>
        `;
        elements.editorList.appendChild(row);
    });
}

window.enableEditStudent = function(id) {
    document.getElementById(`edit-box-${id}`).style.display = 'flex';
    document.getElementById(`input-edit-${id}`).focus();
};

window.cancelEditStudent = function(id) {
    document.getElementById(`edit-box-${id}`).style.display = 'none';
};

window.saveEditStudent = function(id, paralelo) {
    const newName = document.getElementById(`input-edit-${id}`).value.trim();
    if (!newName) return alert("El nombre no puede estar vacío.");

    const student = mockData[paralelo].find(s => s.id === id);
    if (student) {
        const oldName = student.nombre;
        student.nombre = newName;

        const requestData = { 
            action: "editar_alumno", 
            paralelo: paralelo, 
            id: id, 
            nombreAnterior: oldName, 
            nombreNuevo: newName 
        };
        enviar(requestData, "Nombre modificado correctamente");

        renderEditor(paralelo);
    }
};

elements.btnAddStudent.addEventListener('click', () => {
    const name = elements.newStudentName.value.trim();
    const paralelo = elements.paralelo.value;
    if(!name) return alert("Ingresa un nombre.");

    const newId = Date.now();
    mockData[paralelo].push({ id: newId, nombre: name });
    elements.newStudentName.value = '';

    const requestData = { action: "agregar_alumno", paralelo: paralelo, nombre: name };
    enviar(requestData, "Alumno agregado correctamente");

    renderEditor(paralelo);
});

window.deleteStudent = function(id, paralelo) {
    if(!confirm("¿Seguro que deseas eliminar este alumno?")) return;

    mockData[paralelo] = mockData[paralelo].filter(s => s.id !== id);

    const requestData = { action: "eliminar_alumno", paralelo: paralelo, id: id };
    enviar(requestData, "Alumno eliminado");

    renderEditor(paralelo);
};

// PANEL 3: HISTORIAL
elements.btnFetchHistory.addEventListener('click', async () => {
    const fecha = elements.fecha.value;
    const paralelo = elements.paralelo.value;
    elements.historialList.innerHTML = '<div style="padding:15px;text-align:center;">Cargando...</div>';

    setTimeout(() => {
        const data = mockHistory[paralelo]?.[fecha];

        if(!data || data.length === 0) {
            elements.historialList.innerHTML = '<div style="padding:15px;text-align:center;color:#f44336;">No hay registros para esta fecha.</div>';
            return;
        }

        elements.historialList.innerHTML = '';
        data.forEach(reg => {
            const cssClass = reg.estado === 'Presente' ? 'bg-p' : reg.estado === 'Falta' ? 'bg-f' : 'bg-a';
            const row = document.createElement('div');
            row.className = 'list-row';
            row.style.flexDirection = 'column';
            row.style.alignItems = 'flex-start';
            row.innerHTML = `
                <div style="display:flex; justify-content:space-between; width:100%;">
                    <span class="student-name">${reg.estudiante}</span>
                    <span class="history-badge ${cssClass}">${reg.estado}</span>
                </div>
                ${reg.notas ? `<div class="history-note">Nota: ${reg.notas}</div>` : ''}
            `;
            elements.historialList.appendChild(row);
        });
    }, 800);
});

// FUNCIONES GLOBALES (FETCH)
async function enviar(datos, mensajeExito) {
    elements.overlay.classList.add('active');
    elements.spinner.style.display = 'block';
    elements.modal.style.display = 'none';

    try {
        await fetch(GOOGLE_SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(datos)
        });

        elements.spinner.style.display = 'none';
        elements.modalTitle.innerText = "¡Completado!";
        elements.modalText.innerText = mensajeExito;
        elements.modal.style.display = 'block';
    } catch (error) {
        elements.spinner.style.display = 'none';
        elements.modalTitle.innerText = "Error";
        elements.modalTitle.style.color = "var(--absent)";
        elements.modalText.innerText = "Hubo un problema de conexión.";
        elements.modal.style.display = 'block';
    }
}

elements.btnCerrar.addEventListener('click', () => {
    elements.overlay.classList.remove('active');
    if(document.getElementById('panel-asistencia').classList.contains('active')) {
        renderAsistencia(elements.paralelo.value);
    }
});

renderAsistencia(elements.paralelo.value);