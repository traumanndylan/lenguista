const serverDir = window.location.hostname;
const socket = io(`http://${serverDir}:8000`);

const btnCrearGrupos = document.getElementById('btn-crear-grupos');
const btnRegresarTodos = document.getElementById('btn-regresar-todos');
const spanNombreSala = document.getElementById('nombre-sala');

socket.on('connect', () => {
    console.log(`Conectado al servidor, ID: ${socket.id}`);
});

btnCrearGrupos.addEventListener('click', () => {
    console.log("Solicitando al servidor crear Breakout Rooms...");

    socket.emit('solicitar_breakout', {
        cantidadGrupos: 2
    });

    btnCrearGrupos.disabled = true;
    btnRegresarTodos.disabled = false;
});

btnRegresarTodos.addEventListener('click', () => {
    console.log("Solicitando al servidor terminar los grupos...");

    socket.emit('terminar_breakout');

    btnCrearGrupos.disabled = false;
    btnRegresarTodos.disabled = true;
});

socket.on('cambio_de_sala', (datos) => {
    console.log(`El servidor me movió a la sala: ${datos.nombreSala}`);
    spanNombreSala.innerText = datos.nombreSala;

    if (datos.nombreSala !== 'Sala Principal') {
        document.body.style.backgroundColor = "#004d40";
    } else {
        document.body.style.backgroundColor = "#202124";
    }
});

const videoLocal = document.getElementById('video-local');
let flujoLocal;

async function iniciarCamara() {
    try {
        flujoLocal = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: true
        });

        videoLocal.srcObject = flujoLocal;
        console.log("Cámara y micrófono encendidos correctamente");

    } catch (error) {
        console.error("Error al acceder a la cámara:", error);
        alert("No se pudo acceder a la cámara. Revisa los permisos de tu navegador o asegúrate de haber aplicado el truco de chrome://flags.");
    }
}

iniciarCamara();