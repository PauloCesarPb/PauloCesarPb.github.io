let resultados = [];
let configuracionActivaRevision = null;
let indicePreviewActual = 0;
let cvCargado = false;

let cartillasCapturadas = [];
let cartillasProcesadasPDF = [];

let streamCamara = null;
let escaneoActivo = false;
let rafEscaneo = null;
let ultimoAnalisisCamara = 0;
let framesValidosHoja = 0;
let framesSinHoja = 0;
let esperandoRetiroHoja = false;
let numeroAutoEscaneo = 0;
const INTERVALO_ANALISIS_MS = 280;
const FRAMES_VALIDOS_PARA_CAPTURAR = 3;
const FRAMES_SIN_HOJA_PARA_REARMAR = 5;

const ANCHO_OBJETIVO = 1224;
const ALTO_OBJETIVO = 1584;

const MARCAS_OBJETIVO = {
  
  superiorIzquierdo: { x: 0.118873, y: 0.099116 },
  superiorDerecho: { x: 0.905637, y: 0.099116 },
  inferiorIzquierdo: { x: 0.118873, y: 0.918245 },
  inferiorDerecho: { x: 0.905637, y: 0.918245 }
};

const PLANTILLA_TRAMOS_BASE = [
  
  { id: "T1",  inicio: 1,  fin: 10,  xA: 0.253431, xE: 0.358742, yPrimera: 0.428157, yUltima: 0.641288 },
  { id: "T2",  inicio: 11, fin: 20,  xA: 0.253431, xE: 0.358742, yPrimera: 0.678157, yUltima: 0.892424 },

  { id: "T3",  inicio: 21, fin: 30,  xA: 0.424510, xE: 0.530065, yPrimera: 0.428030, yUltima: 0.641288 },
  { id: "T4",  inicio: 31, fin: 40,  xA: 0.424510, xE: 0.530065, yPrimera: 0.678409, yUltima: 0.892172 },

  { id: "T5",  inicio: 41, fin: 50,  xA: 0.590114, xE: 0.697631, yPrimera: 0.176768, yUltima: 0.389773 },
  { id: "T6",  inicio: 51, fin: 60,  xA: 0.590114, xE: 0.697631, yPrimera: 0.427273, yUltima: 0.640909 },
  { id: "T7",  inicio: 61, fin: 70,  xA: 0.590114, xE: 0.697631, yPrimera: 0.677904, yUltima: 0.892298 },

  { id: "T8",  inicio: 71, fin: 80,  xA: 0.757925, xE: 0.864624, yPrimera: 0.176641, yUltima: 0.389520 },
  { id: "T9",  inicio: 81, fin: 90,  xA: 0.757925, xE: 0.864624, yPrimera: 0.427399, yUltima: 0.641035 },
  { id: "T10", inicio: 91, fin: 100, xA: 0.757925, xE: 0.864624, yPrimera: 0.677652, yUltima: 0.892298 }
];

const GUIAS_INTERNAS_ESPERADAS = [
  
  { id: "G_T5",  tramo: "T5",  x: 0.560458, y: 0.157513, rx: 0.025, ry: 0.018 },
  { id: "G_T8",  tramo: "T8",  x: 0.727941, y: 0.158144, rx: 0.025, ry: 0.018 },

  { id: "G_T1",  tramo: "T1",  x: 0.392157, y: 0.409407, rx: 0.025, ry: 0.018 },
  { id: "G_T3",  tramo: "T3",  x: 0.392157, y: 0.409407, rx: 0.025, ry: 0.018 },
  { id: "G_T6",  tramo: "T6",  x: 0.560458, y: 0.409407, rx: 0.025, ry: 0.018 },
  { id: "G_T9",  tramo: "T9",  x: 0.727941, y: 0.409407, rx: 0.025, ry: 0.018 },

  { id: "G_T2",  tramo: "T2",  x: 0.392565, y: 0.660669, rx: 0.025, ry: 0.018 },
  { id: "G_T4",  tramo: "T4",  x: 0.392565, y: 0.660669, rx: 0.025, ry: 0.018 },
  { id: "G_T7",  tramo: "T7",  x: 0.560458, y: 0.660669, rx: 0.025, ry: 0.018 },
  { id: "G_T10", tramo: "T10", x: 0.727941, y: 0.660038, rx: 0.025, ry: 0.018 }
];

function opencvListo() {
  const estado = document.getElementById("estadoOpenCV");

  if (typeof cv === "undefined") {
    if (estado) estado.textContent = "OpenCV no cargó. Revisa tu conexión a internet.";
    return;
  }

  cv["onRuntimeInitialized"] = () => {
    cvCargado = true;
    if (estado) estado.textContent = "OpenCV listo. Ya puedes detectar esquinas.";
  };

  setTimeout(() => {
    if (typeof cv !== "undefined" && cv.Mat) {
      cvCargado = true;
      if (estado) estado.textContent = "OpenCV listo. Ya puedes detectar esquinas.";
    }
  }, 1500);
}

function abrirSelectorFotos() {
  const input = document.getElementById("cartillas");
  if (input) input.click();
}

function abrirCamaraCelularRapida() {
  const input = document.getElementById("fotoCamaraInput");
  if (input) input.click();
}

function recibirFotoCamaraRapida(event) {
  const archivos = Array.from(event.target.files || []);

  archivos.forEach((archivo) => {
    const numero = cartillasCapturadas.length + 1;
    const extension = archivo.type && archivo.type.includes("png") ? "png" : "jpg";
    const nombre = `foto_camara_${String(numero).padStart(3, "0")}.${extension}`;

    const nuevoArchivo = new File(
      [archivo],
      nombre,
      { type: archivo.type || "image/jpeg" }
    );

    cartillasCapturadas.push(nuevoArchivo);
  });

  event.target.value = "";

  mostrarVistaPrevia();
  actualizarContadorFotosSeleccionadas();

  const estado = document.getElementById("estado");
  if (estado && archivos.length > 0) {
    estado.textContent = `Foto agregada. Total de fotos: ${obtenerArchivosCartillas().length}`;
  }
}

function eliminarFotoActual() {
  const archivos = obtenerArchivosCartillas();

  if (!archivos || archivos.length === 0) {
    return;
  }

  const confirmar = confirm(`¿Eliminar la foto ${indicePreviewActual + 1} de ${archivos.length}?`);
  if (!confirmar) return;

  
  const input = document.getElementById("cartillas");
  const totalInput = input && input.files ? input.files.length : 0;

  if (indicePreviewActual < totalInput && input && input.files) {
    const dt = new DataTransfer();

    Array.from(input.files).forEach((archivo, idx) => {
      if (idx !== indicePreviewActual) {
        dt.items.add(archivo);
      }
    });

    input.files = dt.files;
  } else {
    const idxCapturada = indicePreviewActual - totalInput;

    if (idxCapturada >= 0 && idxCapturada < cartillasCapturadas.length) {
      cartillasCapturadas.splice(idxCapturada, 1);
    }
  }

  const nuevosArchivos = obtenerArchivosCartillas();

  if (indicePreviewActual >= nuevosArchivos.length) {
    indicePreviewActual = Math.max(0, nuevosArchivos.length - 1);
  }

  mostrarVistaPrevia();
  actualizarContadorFotosSeleccionadas();
}

function quitarUltimaFoto() {
  const input = document.getElementById("cartillas");

  if (cartillasCapturadas.length > 0) {
    cartillasCapturadas.pop();
  } else if (input && input.files && input.files.length > 0) {
    input.value = "";
  }

  mostrarVistaPrevia();
  actualizarContadorFotosSeleccionadas();
}

function obtenerArchivosCartillas() {
  const inputCartillas = document.getElementById("cartillas");

  const archivosCargados =
    inputCartillas && inputCartillas.files
      ? Array.from(inputCartillas.files)
      : [];

  return [...archivosCargados, ...cartillasCapturadas];
}

function actualizarContadorEscaneo() {
  const contador = document.getElementById("contadorEscaneoAuto");

  if (contador) {
    contador.textContent =
      `Cartillas escaneadas automáticamente: ${cartillasCapturadas.length}`;
  }
}

function mostrarImagenPreviewIndice() {
  const archivos = obtenerArchivosCartillas();
  const preview = document.querySelector(".preview");
  const previewImagen = document.getElementById("previewImagen");
  const indicador = document.getElementById("indicadorPreview");
  const nombre = document.getElementById("nombrePreview");

  if (!archivos || archivos.length === 0) {
    if (preview) preview.style.display = "none";
    if (previewImagen) previewImagen.src = "";
    if (indicador) indicador.textContent = "0 / 0";
    if (nombre) nombre.textContent = "";
    return;
  }

  if (indicePreviewActual < 0) {
    indicePreviewActual = archivos.length - 1;
  }

  if (indicePreviewActual >= archivos.length) {
    indicePreviewActual = 0;
  }

  const archivo = archivos[indicePreviewActual];

  const lector = new FileReader();

  lector.onload = function(e) {
    previewImagen.src = e.target.result;
    preview.style.display = "block";

    if (indicador) {
      indicador.textContent = `${indicePreviewActual + 1} / ${archivos.length}`;
    }

    if (nombre) {
      nombre.textContent = archivo.name;
    }
  };

  lector.readAsDataURL(archivo);
}

function cambiarPreviewFoto(direccion) {
  const archivos = obtenerArchivosCartillas();

  if (!archivos || archivos.length === 0) {
    return;
  }

  indicePreviewActual += direccion;

  if (indicePreviewActual < 0) {
    indicePreviewActual = archivos.length - 1;
  }

  if (indicePreviewActual >= archivos.length) {
    indicePreviewActual = 0;
  }

  mostrarImagenPreviewIndice();
}

function mostrarVistaPrevia() {
  const archivos = obtenerArchivosCartillas();
  const listaArchivos = document.getElementById("listaArchivos");

  if (listaArchivos) {
    listaArchivos.innerHTML = "";
  }

  if (!archivos || archivos.length === 0) {
    indicePreviewActual = 0;
    mostrarImagenPreviewIndice();
    actualizarContadorFotosSeleccionadas();
    return;
  }

  if (indicePreviewActual >= archivos.length) {
    indicePreviewActual = 0;
  }

  if (listaArchivos) {
    archivos.forEach((archivo, index) => {
      const item = document.createElement("div");
      item.textContent = `${index + 1}. ${archivo.name}`;
      listaArchivos.appendChild(item);
    });
  }

  mostrarImagenPreviewIndice();
  actualizarContadorFotosSeleccionadas();
}

function cargarImagen(archivo) {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();

    lector.onload = function(e) {
      const img = new Image();

      img.onload = function() {
        resolve(img);
      };

      img.onerror = reject;
      img.src = e.target.result;
    };

    lector.onerror = reject;
    lector.readAsDataURL(archivo);
  });
}

async function detectarCuadradosPrimeraImagen() {
  if (!cvCargado) {
    alert("OpenCV todavía está cargando. Espera unos segundos.");
    return;
  }

  if (!validarAntesDeProcesar()) {
    return;
  }

  const archivos = obtenerArchivosCartillas();

  if (archivos.length === 0) {
    alert("Primero carga una imagen de cartilla.");
    return;
  }

  const img = await cargarImagen(archivos[0]);

  const canvasDebug = document.getElementById("canvasDebug");
  const ctxDebug = canvasDebug.getContext("2d");

  canvasDebug.width = img.naturalWidth;
  canvasDebug.height = img.naturalHeight;
  ctxDebug.drawImage(img, 0, 0, canvasDebug.width, canvasDebug.height);

  const src = cv.imread(canvasDebug);
  const cuadrados = detectarCuadradosEnMat(src, canvasDebug.width, canvasDebug.height);

  const esquinas = seleccionarCuadradosEsquinas(
    cuadrados,
    canvasDebug.width,
    canvasDebug.height
  );

  dibujarEsquinasSeleccionadas(canvasDebug, esquinas);

  const estado = document.getElementById("estadoOpenCV");

  if (!esquinas.completas) {
    estado.textContent = "No se encontraron las 4 esquinas.";
    src.delete();
    return;
  }

  const canvasAlineado = document.getElementById("canvasAlineado");
  enderezarMatEnCanvas(src, esquinas, canvasAlineado);

  const guias = detectarGuiasInternas(canvasAlineado);
  let plantillaAjustada = ajustarPlantillaConGuias(guias);

  dibujarGuiasInternas(canvasAlineado, guias);

  const matAlineado = cv.imread(canvasAlineado);

  
  plantillaAjustada = calibrarPlantillaConCirculos(
    matAlineado,
    canvasAlineado.width,
    canvasAlineado.height,
    90,
    plantillaAjustada
  );

  const centros = obtenerTodosLosCentrosAjustados(
    matAlineado,
    canvasAlineado.width,
    canvasAlineado.height,
    90,
    plantillaAjustada
  );

  dibujarPuntosAzules(canvasAlineado, centros);
  matAlineado.delete();

  estado.textContent =
    "Esquinas: 4 | Guías internas detectadas: " +
    Object.keys(guias).length +
    " | Centros dibujados.";

  src.delete();
}

function detectarCuadradosEnMat(src, ancho, alto) {
  let gray = new cv.Mat();
  let blur = new cv.Mat();
  let thresh = new cv.Mat();
  let contours = new cv.MatVector();
  let hierarchy = new cv.Mat();

  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
  cv.GaussianBlur(gray, blur, new cv.Size(5, 5), 0);

  cv.threshold(
    blur,
    thresh,
    0,
    255,
    cv.THRESH_BINARY_INV + cv.THRESH_OTSU
  );

  cv.findContours(
    thresh,
    contours,
    hierarchy,
    cv.RETR_EXTERNAL,
    cv.CHAIN_APPROX_SIMPLE
  );

  let cuadrados = [];

  for (let i = 0; i < contours.size(); i++) {
    let cnt = contours.get(i);
    let peri = cv.arcLength(cnt, true);
    let approx = new cv.Mat();

    cv.approxPolyDP(cnt, approx, 0.04 * peri, true);

    const area = cv.contourArea(cnt);
    const rect = cv.boundingRect(cnt);
    const proporcion = rect.width / rect.height;

    const areaMin = ancho * alto * 0.00008;
    const areaMax = ancho * alto * 0.012;

    if (
      approx.rows === 4 &&
      area > areaMin &&
      area < areaMax &&
      proporcion > 0.55 &&
      proporcion < 1.45
    ) {
      cuadrados.push({
        x: rect.x,
        y: rect.y,
        w: rect.width,
        h: rect.height,
        area: area,
        cx: rect.x + rect.width / 2,
        cy: rect.y + rect.height / 2
      });
    }

    approx.delete();
    cnt.delete();
  }

  gray.delete();
  blur.delete();
  thresh.delete();
  contours.delete();
  hierarchy.delete();

  return filtrarCuadradosRepetidos(cuadrados);
}

function filtrarCuadradosRepetidos(cuadrados) {
  cuadrados.sort((a, b) => b.area - a.area);

  let filtrados = [];

  for (const c of cuadrados) {
    let repetido = false;

    for (const f of filtrados) {
      const distancia = Math.hypot(c.cx - f.cx, c.cy - f.cy);

      if (distancia < Math.max(c.w, c.h) * 1.5) {
        repetido = true;
        break;
      }
    }

    if (!repetido) filtrados.push(c);
  }

  return filtrados;
}

function seleccionarCuadradosEsquinas(cuadrados, ancho, alto) {
  const zonaSuperior = alto * 0.45;
  const zonaInferior = alto * 0.65;
  const zonaIzquierda = ancho * 0.35;
  const zonaDerecha = ancho * 0.65;

  const candidatosSI = cuadrados.filter(c => c.cx < zonaIzquierda && c.cy < zonaSuperior);
  const candidatosSD = cuadrados.filter(c => c.cx > zonaDerecha && c.cy < zonaSuperior);
  const candidatosII = cuadrados.filter(c => c.cx < zonaIzquierda && c.cy > zonaInferior);
  const candidatosID = cuadrados.filter(c => c.cx > zonaDerecha && c.cy > zonaInferior);

  const superiorIzquierdo = elegirMasCercano(candidatosSI, 0, 0);
  const superiorDerecho = elegirMasCercano(candidatosSD, ancho, 0);
  const inferiorIzquierdo = elegirMasCercano(candidatosII, 0, alto);
  const inferiorDerecho = elegirMasCercano(candidatosID, ancho, alto);

  const completas =
    superiorIzquierdo &&
    superiorDerecho &&
    inferiorIzquierdo &&
    inferiorDerecho;

  return {
    superiorIzquierdo,
    superiorDerecho,
    inferiorIzquierdo,
    inferiorDerecho,
    completas
  };
}

function elegirMasCercano(lista, xObjetivo, yObjetivo) {
  if (lista.length === 0) return null;

  let mejor = lista[0];
  let menorDistancia = Math.hypot(mejor.cx - xObjetivo, mejor.cy - yObjetivo);

  for (let i = 1; i < lista.length; i++) {
    const c = lista[i];
    const distancia = Math.hypot(c.cx - xObjetivo, c.cy - yObjetivo);

    if (distancia < menorDistancia) {
      menorDistancia = distancia;
      mejor = c;
    }
  }

  return mejor;
}

function dibujarEsquinasSeleccionadas(canvas, esquinas) {
  const ctx = canvas.getContext("2d");

  const lista = [
    { nombre: "SI", punto: esquinas.superiorIzquierdo },
    { nombre: "SD", punto: esquinas.superiorDerecho },
    { nombre: "II", punto: esquinas.inferiorIzquierdo },
    { nombre: "ID", punto: esquinas.inferiorDerecho }
  ];

  ctx.lineWidth = Math.max(5, canvas.width * 0.006);
  ctx.strokeStyle = "lime";
  ctx.fillStyle = "lime";
  ctx.font = `${Math.max(22, canvas.width * 0.03)}px Arial`;

  lista.forEach(item => {
    const c = item.punto;
    if (!c) return;

    ctx.strokeRect(c.x, c.y, c.w, c.h);

    ctx.beginPath();
    ctx.arc(c.cx, c.cy, Math.max(8, canvas.width * 0.008), 0, Math.PI * 2);
    ctx.fill();

    ctx.fillText(item.nombre, c.x, c.y - 8);
  });

  if (esquinas.completas) {
    ctx.beginPath();
    ctx.moveTo(esquinas.superiorIzquierdo.cx, esquinas.superiorIzquierdo.cy);
    ctx.lineTo(esquinas.superiorDerecho.cx, esquinas.superiorDerecho.cy);
    ctx.lineTo(esquinas.inferiorDerecho.cx, esquinas.inferiorDerecho.cy);
    ctx.lineTo(esquinas.inferiorIzquierdo.cx, esquinas.inferiorIzquierdo.cy);
    ctx.closePath();
    ctx.stroke();
  }
}

function enderezarMatEnCanvas(src, esquinas, canvasDestino) {
  const srcPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
    esquinas.superiorIzquierdo.cx, esquinas.superiorIzquierdo.cy,
    esquinas.superiorDerecho.cx, esquinas.superiorDerecho.cy,
    esquinas.inferiorIzquierdo.cx, esquinas.inferiorIzquierdo.cy,
    esquinas.inferiorDerecho.cx, esquinas.inferiorDerecho.cy
  ]);

  const dstPts = cv.matFromArray(4, 1, cv.CV_32FC2, [
    MARCAS_OBJETIVO.superiorIzquierdo.x * ANCHO_OBJETIVO,
    MARCAS_OBJETIVO.superiorIzquierdo.y * ALTO_OBJETIVO,

    MARCAS_OBJETIVO.superiorDerecho.x * ANCHO_OBJETIVO,
    MARCAS_OBJETIVO.superiorDerecho.y * ALTO_OBJETIVO,

    MARCAS_OBJETIVO.inferiorIzquierdo.x * ANCHO_OBJETIVO,
    MARCAS_OBJETIVO.inferiorIzquierdo.y * ALTO_OBJETIVO,

    MARCAS_OBJETIVO.inferiorDerecho.x * ANCHO_OBJETIVO,
    MARCAS_OBJETIVO.inferiorDerecho.y * ALTO_OBJETIVO
  ]);

  const M = cv.getPerspectiveTransform(srcPts, dstPts);
  const dst = new cv.Mat();

  cv.warpPerspective(
    src,
    dst,
    M,
    new cv.Size(ANCHO_OBJETIVO, ALTO_OBJETIVO),
    cv.INTER_LINEAR,
    cv.BORDER_CONSTANT,
    new cv.Scalar()
  );

  cv.imshow(canvasDestino, dst);

  srcPts.delete();
  dstPts.delete();
  M.delete();
  dst.delete();
}

function detectarGuiasInternas(canvas) {
  let guias = {};

  GUIAS_INTERNAS_ESPERADAS.forEach(guia => {
    const encontrada = buscarGuiaInterna(canvas, guia);

    if (encontrada) {
      guias[guia.id] = encontrada;
    }
  });

  return guias;
}

function buscarGuiaInterna(canvas, guia) {
  const ancho = canvas.width;
  const alto = canvas.height;

  const centroEsperadoX = guia.x * ancho;
  const centroEsperadoY = guia.y * alto;

  const x0 = Math.max(0, Math.round((guia.x - guia.rx) * ancho));
  const y0 = Math.max(0, Math.round((guia.y - guia.ry) * alto));
  const x1 = Math.min(ancho, Math.round((guia.x + guia.rx) * ancho));
  const y1 = Math.min(alto, Math.round((guia.y + guia.ry) * alto));

  const w = x1 - x0;
  const h = y1 - y0;

  if (w <= 0 || h <= 0) return null;

  const temp = document.createElement("canvas");
  temp.width = w;
  temp.height = h;

  const ctx = temp.getContext("2d");
  ctx.drawImage(canvas, x0, y0, w, h, 0, 0, w, h);

  let src = cv.imread(temp);
  let gray = new cv.Mat();
  let blur = new cv.Mat();
  let thresh = new cv.Mat();
  let contours = new cv.MatVector();
  let hierarchy = new cv.Mat();

  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
  cv.GaussianBlur(gray, blur, new cv.Size(3, 3), 0);

  cv.threshold(
    blur,
    thresh,
    0,
    255,
    cv.THRESH_BINARY_INV + cv.THRESH_OTSU
  );

  cv.findContours(
    thresh,
    contours,
    hierarchy,
    cv.RETR_EXTERNAL,
    cv.CHAIN_APPROX_SIMPLE
  );

  let candidatos = [];

  for (let i = 0; i < contours.size(); i++) {
    const cnt = contours.get(i);
    const rect = cv.boundingRect(cnt);
    const area = cv.contourArea(cnt);
    const proporcion = rect.width / rect.height;

    let relleno = 0;

    if (rect.width > 0 && rect.height > 0) {
      const roi = thresh.roi(rect);
      relleno = cv.countNonZero(roi) / (rect.width * rect.height);
      roi.delete();
    }

    const cx = x0 + rect.x + rect.width / 2;
    const cy = y0 + rect.y + rect.height / 2;
    const distancia = Math.hypot(cx - centroEsperadoX, cy - centroEsperadoY);

    if (
      rect.width >= 8 &&
      rect.width <= 28 &&
      rect.height >= 8 &&
      rect.height <= 28 &&
      proporcion > 0.65 &&
      proporcion < 1.35 &&
      area > 35 &&
      relleno > 0.42 &&
      distancia < Math.min(w, h) * 0.55
    ) {
      candidatos.push({
        id: guia.id,
        tramo: guia.tramo,
        x: x0 + rect.x,
        y: y0 + rect.y,
        w: rect.width,
        h: rect.height,
        cx,
        cy,
        relleno,
        distancia
      });
    }

    cnt.delete();
  }

  src.delete();
  gray.delete();
  blur.delete();
  thresh.delete();
  contours.delete();
  hierarchy.delete();

  if (candidatos.length === 0) return null;

  candidatos.sort((a, b) => {
    if (Math.abs(b.relleno - a.relleno) > 0.10) {
      return b.relleno - a.relleno;
    }

    return a.distancia - b.distancia;
  });

  return candidatos[0];
}

function ajustarPlantillaConGuias(guias) {
  return PLANTILLA_TRAMOS_BASE.map(base => {
    const ajustado = { ...base };

    const guiaEsperada = GUIAS_INTERNAS_ESPERADAS.find(g => g.tramo === base.id);
    if (!guiaEsperada) return ajustado;

    const guiaDetectada = guias[guiaEsperada.id];
    if (!guiaDetectada) return ajustado;

    const anchoTramo = base.xE - base.xA;
    const altoTramo = base.yUltima - base.yPrimera;

    const offsetXA = base.xA - guiaEsperada.x;
    const offsetYPrimera = base.yPrimera - guiaEsperada.y;

    ajustado.xA = guiaDetectada.cx / ANCHO_OBJETIVO + offsetXA;
    ajustado.xE = ajustado.xA + anchoTramo;

    ajustado.yPrimera = guiaDetectada.cy / ALTO_OBJETIVO + offsetYPrimera;
    ajustado.yUltima = ajustado.yPrimera + altoTramo;

    ajustado.xA = base.xA + (ajustado.xA - base.xA) * 0.95;
    ajustado.xE = base.xE + (ajustado.xE - base.xE) * 0.95;
    ajustado.yPrimera = base.yPrimera + (ajustado.yPrimera - base.yPrimera) * 0.95;
    ajustado.yUltima = base.yUltima + (ajustado.yUltima - base.yUltima) * 0.95;

    return ajustado;
  });
}



function dibujarGuiasInternas(canvas, guias) {
  const ctx = canvas.getContext("2d");

  ctx.lineWidth = 3;
  ctx.strokeStyle = "cyan";
  ctx.fillStyle = "cyan";
  ctx.font = "bold 13px Arial";

  Object.values(guias).forEach(g => {
    ctx.strokeRect(g.x, g.y, g.w, g.h);

    ctx.beginPath();
    ctx.arc(g.cx, g.cy, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillText(g.tramo, g.x, g.y - 4);
  });
}

function mediana(valores) {
  if (!valores || valores.length === 0) return 0;

  const ordenados = [...valores].sort((a, b) => a - b);
  const mitad = Math.floor(ordenados.length / 2);

  if (ordenados.length % 2 === 0) {
    return (ordenados[mitad - 1] + ordenados[mitad]) / 2;
  }

  return ordenados[mitad];
}

function limitar(valor, minimo, maximo) {
  return Math.max(minimo, Math.min(maximo, valor));
}

function calibrarPlantillaConCirculos(mat, ancho, alto, totalPreguntas, plantilla) {
  const opciones = document.getElementById("alternativas").value.split("");
  const maxCorrX = 0.026;
  const maxCorrY = 0.032;

  return plantilla.map(tramo => {
    const ajustado = { ...tramo };
    const inicio = tramo.inicio;
    const fin = Math.min(tramo.fin, totalPreguntas);

    if (fin < inicio) {
      return ajustado;
    }

    let muestras = [];

    for (let pregunta = inicio; pregunta <= fin; pregunta++) {
      const centrosAprox = obtenerCentrosPreguntaAproximados(
        pregunta,
        ancho,
        alto,
        opciones.length,
        plantilla
      );

      if (!centrosAprox) continue;

      for (let col = 0; col < centrosAprox.length; col++) {
        const centro = centrosAprox[col];
        const corregido = ajustarCentroBurbuja(mat, centro.x, centro.y);

        if (!corregido.ajustado) continue;

        const dx = (corregido.x - centro.x) / ancho;
        const dy = (corregido.y - centro.y) / alto;

        if (Math.abs(dx) > maxCorrX || Math.abs(dy) > maxCorrY) continue;

        muestras.push({
          pregunta,
          fila: pregunta - inicio,
          col,
          dx,
          dy
        });
      }
    }

    if (muestras.length < 4) {
      return ajustado;
    }

    const totalFilas = fin - inicio;

    const muestrasIzquierda = muestras.filter(m => m.col <= 1);
    const muestrasCentro = muestras.filter(m => m.col >= 1 && m.col <= opciones.length - 2);
    const muestrasDerecha = muestras.filter(m => m.col >= opciones.length - 2);

    const muestrasArriba = muestras.filter(m => m.fila <= Math.min(2, totalFilas));
    const muestrasMedio = muestras.filter(m => m.fila > 2 && m.fila < Math.max(0, totalFilas - 2));
    const muestrasAbajo = muestras.filter(m => m.fila >= Math.max(0, totalFilas - 2));

    const dxGlobal = mediana(muestras.map(m => m.dx));
    const dyGlobal = mediana(muestras.map(m => m.dy));

    let dxA = dxGlobal;
    let dxE = dxGlobal;
    let dyPrimera = dyGlobal;
    let dyUltima = dyGlobal;

    if (muestrasIzquierda.length >= 2) {
      dxA = mediana(muestrasIzquierda.map(m => m.dx));
    }

    if (muestrasDerecha.length >= 2) {
      dxE = mediana(muestrasDerecha.map(m => m.dx));
    }

    if (muestrasCentro.length >= 3) {
      const dxCentro = mediana(muestrasCentro.map(m => m.dx));
      dxA = dxA * 0.75 + dxCentro * 0.25;
      dxE = dxE * 0.75 + dxCentro * 0.25;
    }

    if (muestrasArriba.length >= 2) {
      dyPrimera = mediana(muestrasArriba.map(m => m.dy));
    }

    if (muestrasAbajo.length >= 2) {
      dyUltima = mediana(muestrasAbajo.map(m => m.dy));
    }

    if (muestrasMedio.length >= 3) {
      const dyMedio = mediana(muestrasMedio.map(m => m.dy));
      dyPrimera = dyPrimera * 0.80 + dyMedio * 0.20;
      dyUltima = dyUltima * 0.80 + dyMedio * 0.20;
    }

    dxA = limitar(dxA, -maxCorrX, maxCorrX);
    dxE = limitar(dxE, -maxCorrX, maxCorrX);
    dyPrimera = limitar(dyPrimera, -maxCorrY, maxCorrY);
    dyUltima = limitar(dyUltima, -maxCorrY, maxCorrY);

    const k = 1.0;

    ajustado.xA = tramo.xA + dxA * k;
    ajustado.xE = tramo.xE + dxE * k;
    ajustado.yPrimera = tramo.yPrimera + dyPrimera * k;
    ajustado.yUltima = tramo.yUltima + dyUltima * k;

    return ajustado;
  });
}



function obtenerCentrosPreguntaAproximados(numeroPregunta, ancho, alto, cantidadOpciones, plantilla) {
  const tramo = plantilla.find(t => {
    return numeroPregunta >= t.inicio && numeroPregunta <= t.fin;
  });

  if (!tramo) return null;

  const fila = numeroPregunta - tramo.inicio;
  const totalFilas = tramo.fin - tramo.inicio;

  const xA = tramo.xA * ancho;
  const xE = tramo.xE * ancho;

  const yPrimera = tramo.yPrimera * alto;
  const yUltima = tramo.yUltima * alto;

  const pasoX = (xE - xA) / (cantidadOpciones - 1);
  const pasoY = totalFilas === 0 ? 0 : (yUltima - yPrimera) / totalFilas;

  let centros = [];

  for (let opcion = 0; opcion < cantidadOpciones; opcion++) {
    centros.push({
      x: xA + opcion * pasoX,
      y: yPrimera + fila * pasoY
    });
  }

  return centros;
}

function ajustarCentroBurbuja(mat, xAprox, yAprox) {
  const radioBusqueda = 34;
  const movimientoMaximoPermitido = 16.5;

  const x0 = Math.max(0, Math.round(xAprox - radioBusqueda));
  const y0 = Math.max(0, Math.round(yAprox - radioBusqueda));
  const x1 = Math.min(mat.cols, Math.round(xAprox + radioBusqueda));
  const y1 = Math.min(mat.rows, Math.round(yAprox + radioBusqueda));

  const w = x1 - x0;
  const h = y1 - y0;

  if (w <= 0 || h <= 0) {
    return { x: xAprox, y: yAprox, ajustado: false, metodo: "sin_roi" };
  }

  const roiRect = new cv.Rect(x0, y0, w, h);
  const roi = mat.roi(roiRect);

  let gray = new cv.Mat();
  let blur = new cv.Mat();
  let edges = new cv.Mat();
  let circles = new cv.Mat();
  let thresh = new cv.Mat();
  let contours = new cv.MatVector();
  let hierarchy = new cv.Mat();

  cv.cvtColor(roi, gray, cv.COLOR_RGBA2GRAY);
  cv.GaussianBlur(gray, blur, new cv.Size(3, 3), 0);

  let candidatos = [];

  if (typeof cv.HoughCircles === "function") {
    try {
      cv.HoughCircles(
        blur,
        circles,
        cv.HOUGH_GRADIENT,
        1,
        9,
        70,
        8,
        6,
        15
      );

      for (let i = 0; i < circles.cols; i++) {
        const x = circles.data32F[i * 3];
        const y = circles.data32F[i * 3 + 1];
        const r = circles.data32F[i * 3 + 2];

        const cx = x0 + x;
        const cy = y0 + y;
        const distancia = Math.hypot(cx - xAprox, cy - yAprox);

        if (distancia <= movimientoMaximoPermitido && r >= 6 && r <= 15) {
          candidatos.push({
            x: cx,
            y: cy,
            distancia,
            radio: r,
            metodo: "hough",
            score: distancia * 0.85 + Math.abs(r - 10) * 0.25
          });
        }
      }
    } catch (e) {
    }
  }

  cv.Canny(blur, edges, 35, 105);

  cv.findContours(
    edges,
    contours,
    hierarchy,
    cv.RETR_EXTERNAL,
    cv.CHAIN_APPROX_SIMPLE
  );

  for (let i = 0; i < contours.size(); i++) {
    const cnt = contours.get(i);
    const rect = cv.boundingRect(cnt);
    const area = cv.contourArea(cnt);
    const perimetro = cv.arcLength(cnt, true);

    const proporcion = rect.width / rect.height;
    const cx = x0 + rect.x + rect.width / 2;
    const cy = y0 + rect.y + rect.height / 2;
    const distancia = Math.hypot(cx - xAprox, cy - yAprox);

    let circularidad = 0;

    if (perimetro > 0) {
      circularidad = (4 * Math.PI * area) / (perimetro * perimetro);
    }

    if (
      rect.width >= 9 &&
      rect.width <= 32 &&
      rect.height >= 9 &&
      rect.height <= 32 &&
      proporcion > 0.58 &&
      proporcion < 1.58 &&
      distancia <= movimientoMaximoPermitido &&
      circularidad > 0.20
    ) {
      candidatos.push({
        x: cx,
        y: cy,
        distancia,
        radio: Math.max(rect.width, rect.height) / 2,
        metodo: "contorno",
        score: distancia + Math.abs(1 - proporcion) * 3.2 + Math.abs(10 - Math.max(rect.width, rect.height) / 2) * 0.2
      });
    }

    cnt.delete();
  }

  cv.threshold(
    blur,
    thresh,
    0,
    255,
    cv.THRESH_BINARY_INV + cv.THRESH_OTSU
  );

  let contours2 = new cv.MatVector();
  let hierarchy2 = new cv.Mat();

  cv.findContours(
    thresh,
    contours2,
    hierarchy2,
    cv.RETR_EXTERNAL,
    cv.CHAIN_APPROX_SIMPLE
  );

  for (let i = 0; i < contours2.size(); i++) {
    const cnt = contours2.get(i);
    const rect = cv.boundingRect(cnt);
    const area = cv.contourArea(cnt);
    const proporcion = rect.width / rect.height;

    const cx = x0 + rect.x + rect.width / 2;
    const cy = y0 + rect.y + rect.height / 2;
    const distancia = Math.hypot(cx - xAprox, cy - yAprox);

    if (
      rect.width >= 8 &&
      rect.width <= 30 &&
      rect.height >= 8 &&
      rect.height <= 30 &&
      area >= 18 &&
      proporcion > 0.50 &&
      proporcion < 1.70 &&
      distancia <= 10.5
    ) {
      candidatos.push({
        x: cx,
        y: cy,
        distancia,
        radio: Math.max(rect.width, rect.height) / 2,
        metodo: "marca_cercana",
        score: distancia + 3.5
      });
    }

    cnt.delete();
  }

  contours2.delete();
  hierarchy2.delete();

  gray.delete();
  blur.delete();
  edges.delete();
  circles.delete();
  thresh.delete();
  contours.delete();
  hierarchy.delete();
  roi.delete();

  if (candidatos.length === 0) {
    return { x: xAprox, y: yAprox, ajustado: false, metodo: "plantilla" };
  }

  candidatos.sort((a, b) => a.score - b.score);

  const mejor = candidatos[0];

  return {
    x: mejor.x,
    y: mejor.y,
    ajustado: true,
    metodo: mejor.metodo
  };
}



function obtenerTodosLosCentrosAjustados(mat, ancho, alto, totalPreguntas, plantilla) {
  const opciones = document.getElementById("alternativas").value.split("");
  let todos = [];

  for (let pregunta = 1; pregunta <= totalPreguntas; pregunta++) {
    const centrosAprox = obtenerCentrosPreguntaAproximados(
      pregunta,
      ancho,
      alto,
      opciones.length,
      plantilla
    );

    if (!centrosAprox) continue;

    centrosAprox.forEach((centro, idx) => {
      const ajustado = ajustarCentroBurbuja(mat, centro.x, centro.y);

      todos.push({
        pregunta,
        opcion: opciones[idx],
        x: ajustado.x,
        y: ajustado.y,
        ajustado: ajustado.ajustado
      });
    });
  }

  return todos;
}

function dibujarPuntosAzules(canvas, centros) {
  const ctx = canvas.getContext("2d");

  centros.forEach(c => {
    ctx.beginPath();

    
    ctx.fillStyle = c.ajustado ? "cyan" : "blue";
    ctx.arc(c.x, c.y, 2.7, 0, Math.PI * 2);
    ctx.fill();
  });
}

async function obtenerImagenAlineada(archivo) {
  const img = await cargarImagen(archivo);

  const canvasTemporal = document.createElement("canvas");
  const ctxTemporal = canvasTemporal.getContext("2d");

  canvasTemporal.width = img.naturalWidth;
  canvasTemporal.height = img.naturalHeight;
  ctxTemporal.drawImage(img, 0, 0, canvasTemporal.width, canvasTemporal.height);

  const src = cv.imread(canvasTemporal);

  const cuadrados = detectarCuadradosEnMat(
    src,
    canvasTemporal.width,
    canvasTemporal.height
  );

  const esquinas = seleccionarCuadradosEsquinas(
    cuadrados,
    canvasTemporal.width,
    canvasTemporal.height
  );

  if (!esquinas.completas) {
    src.delete();
    throw new Error("No se encontraron las 4 esquinas.");
  }

  const canvasAlineado = document.getElementById("canvasAlineado");
  enderezarMatEnCanvas(src, esquinas, canvasAlineado);

  const guias = detectarGuiasInternas(canvasAlineado);
  let plantillaAjustada = ajustarPlantillaConGuias(guias);

  const matCalibracion = cv.imread(canvasAlineado);
  const claveTextoCal = document.getElementById("clave").value.trim().toUpperCase();
  const claveCal = claveTextoCal.split(/\s+/).filter(x => x !== "");
  const totalPreguntasActual = claveCal.length || parseInt(document.getElementById("totalPreguntas").value) || 90;

  
  plantillaAjustada = calibrarPlantillaConCirculos(
    matCalibracion,
    canvasAlineado.width,
    canvasAlineado.height,
    totalPreguntasActual,
    plantillaAjustada
  );

  plantillaAjustada = calibrarPlantillaConCirculos(
    matCalibracion,
    canvasAlineado.width,
    canvasAlineado.height,
    totalPreguntasActual,
    plantillaAjustada
  );

  plantillaAjustada = calibrarPlantillaConCirculos(
    matCalibracion,
    canvasAlineado.width,
    canvasAlineado.height,
    totalPreguntasActual,
    plantillaAjustada
  );

  plantillaAjustada = calibrarPlantillaConCirculos(
    matCalibracion,
    canvasAlineado.width,
    canvasAlineado.height,
    totalPreguntasActual,
    plantillaAjustada
  );

  matCalibracion.delete();

  const ctx = canvasAlineado.getContext("2d", { willReadFrequently: true });
  const imageData = ctx.getImageData(0, 0, canvasAlineado.width, canvasAlineado.height);

  src.delete();

  return {
    data: imageData.data,
    ancho: canvasAlineado.width,
    alto: canvasAlineado.height,
    canvas: canvasAlineado,
    plantilla: plantillaAjustada,
    guias
  };
}

async function procesarCartillas() {
  if (!cvCargado) {
    alert("OpenCV todavía está cargando. Espera unos segundos.");
    return;
  }

  let totalPreguntas = parseInt(document.getElementById("totalPreguntas").value);
  const tamanoGrupo = parseInt(document.getElementById("tamanoGrupo").value);
  const archivos = obtenerArchivosCartillas();

  const claveTexto = document.getElementById("clave").value.trim().toUpperCase();
  const clave = claveTexto.split(/\s+/).filter(x => x !== "");

  
  if (clave.length > 0) {
    totalPreguntas = clave.length;
    const inputTotal = document.getElementById("totalPreguntas");
    if (inputTotal) inputTotal.value = String(totalPreguntas);
  }

  const invalidasClave = clave.filter(x => !["A", "B", "C", "D", "E"].includes(x));

  if (invalidasClave.length > 0) {
    alert("La clave contiene respuestas inválidas. Solo usa A, B, C, D, E.");
    return;
  }

  const estado = document.getElementById("estado");
  const respuestasDetectadas = document.getElementById("respuestasDetectadas");

  estado.textContent = "";
  respuestasDetectadas.value = "";

  if (!totalPreguntas || totalPreguntas <= 0) {
    alert("Coloca un total de preguntas válido.");
    return;
  }

  if (!tamanoGrupo || tamanoGrupo <= 0) {
    alert("Coloca un tamaño de grupo válido.");
    return;
  }

  if (clave.length === 0) {
    alert("Pega primero la clave de respuestas.");
    return;
  }

  if (archivos.length === 0) {
    alert("Carga al menos una imagen de cartilla.");
    return;
  }

  resultados = [];
  cartillasProcesadasPDF = [];
  cartillasProcesadasPDF = [];

  for (let i = 0; i < archivos.length; i++) {
    try {
      estado.textContent = `Leyendo cartilla ${i + 1} de ${archivos.length}...`;

      const imagenAlineada = await obtenerImagenAlineada(archivos[i]);

      const lectura = leerRespuestasDesdeImagenAlineada(
        imagenAlineada,
        totalPreguntas,
        clave,
        true
      );

      
      
      const zonaNombreAlumno = recortarZonaNombreAlumno(imagenAlineada.canvas);
      dibujarMarcoNombreEnCartilla(imagenAlineada.canvas, zonaNombreAlumno);

      cartillasProcesadasPDF.push({
        orden: i + 1,
        nombre: archivos[i].name,
        recorteNombre: zonaNombreAlumno.dataUrl,
        dataUrl: imagenAlineada.canvas.toDataURL("image/jpeg", 0.90)
      });

      const resultado = corregirCartilla({
        orden: i + 1,
        nombreCartilla: archivos[i].name,
        clave,
        respuestas: lectura.respuestas,
        tamanoGrupo,
        blancas: lectura.blancas
      });

      resultados.push(resultado);
    } catch (error) {
      resultados.push({
        orden: i + 1,
        cartilla: archivos[i].name,
        totalBuenas: 0,
        totalMalas: totalPreguntas,
        blancas: totalPreguntas,
        respuestas: Array(totalPreguntas).fill("?"),
        grupos: Array(Math.ceil(totalPreguntas / tamanoGrupo)).fill(0)
      });
    }
  }

  mostrarResultados(totalPreguntas, tamanoGrupo);
  mostrarRespuestasDetectadas();

  estado.textContent = "Lectura terminada.";
}

function leerRespuestasDesdeImagenAlineada(imagen, totalPreguntas, clave, dibujarDebug = false) {
  const opciones = document.getElementById("alternativas").value.split("");
  const mat = cv.imread(imagen.canvas);

  let respuestas = [];
  let cantidadBlancas = 0;
  let detalles = [];
  let puntos = [];

  for (let pregunta = 1; pregunta <= totalPreguntas; pregunta++) {
    const centrosAprox = obtenerCentrosPreguntaAproximados(
      pregunta,
      imagen.ancho,
      imagen.alto,
      opciones.length,
      imagen.plantilla
    );

    if (!centrosAprox) {
      respuestas.push("?");
      cantidadBlancas++;
      continue;
    }

    let puntajes = [];
    let centrosFinales = [];

    for (let i = 0; i < centrosAprox.length; i++) {
      const centro = ajustarCentroBurbuja(mat, centrosAprox[i].x, centrosAprox[i].y);

      const puntaje = calcularOscuridadInterior(
        imagen.data,
        imagen.ancho,
        imagen.alto,
        centro.x,
        centro.y
      );

      puntajes.push(puntaje);

      centrosFinales.push({
        x: centro.x,
        y: centro.y,
        opcion: opciones[i],
        puntaje
      });

      puntos.push({
        pregunta,
        opcion: opciones[i],
        x: centro.x,
        y: centro.y
      });
    }

    const lectura = elegirRespuestaMejorada(puntajes, opciones);

    if (lectura === "?") {
      cantidadBlancas++;
    }

    respuestas.push(lectura);

    detalles.push({
      pregunta,
      respuesta: lectura,
      clave: clave[pregunta - 1],
      centros: centrosFinales
    });
  }

  mat.delete();

  if (dibujarDebug) {
    dibujarGuiasInternas(imagen.canvas, imagen.guias);
    dibujarPuntosAzules(imagen.canvas, puntos);
    dibujarCorreccionVisual(imagen.canvas, detalles);
  }

  return {
    respuestas,
    blancas: cantidadBlancas
  };
}

function calcularOscuridadInterior(data, ancho, alto, cx, cy) {
  

  const rInterior = 7;
  const rAnilloMin = 10;
  const rAnilloMax = 14;

  let totalInterior = 0;
  let sumaInterior = 0;
  let pixelesOscurosInterior = 0;
  let pixelesMuyOscurosInterior = 0;

  let totalAnillo = 0;
  let sumaAnillo = 0;

  const cuadrantes = [
    { total: 0, oscuros: 0 },
    { total: 0, oscuros: 0 },
    { total: 0, oscuros: 0 },
    { total: 0, oscuros: 0 }
  ];

  const centroX = Math.round(cx);
  const centroY = Math.round(cy);

  for (let y = -rAnilloMax; y <= rAnilloMax; y++) {
    for (let x = -rAnilloMax; x <= rAnilloMax; x++) {
      const d2 = x * x + y * y;

      const px = centroX + x;
      const py = centroY + y;

      if (px < 0 || py < 0 || px >= ancho || py >= alto) continue;

      const idx = (py * ancho + px) * 4;

      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      const luminancia = 0.299 * r + 0.587 * g + 0.114 * b;
      const oscuridad = Math.max(0, (245 - luminancia) / 245);

      if (d2 <= rInterior * rInterior) {
        totalInterior++;
        sumaInterior += oscuridad;

        const esOscuro = luminancia < 185;
        const esMuyOscuro = luminancia < 145;

        if (esOscuro) pixelesOscurosInterior++;
        if (esMuyOscuro) pixelesMuyOscurosInterior++;

        let q = 0;
        if (x >= 0 && y < 0) q = 1;
        if (x < 0 && y >= 0) q = 2;
        if (x >= 0 && y >= 0) q = 3;

        cuadrantes[q].total++;
        if (esOscuro) cuadrantes[q].oscuros++;
      }

      if (d2 >= rAnilloMin * rAnilloMin && d2 <= rAnilloMax * rAnilloMax) {
        totalAnillo++;
        sumaAnillo += oscuridad;
      }
    }
  }

  if (totalInterior === 0) return 0;

  const promedioInterior = sumaInterior / totalInterior;
  const proporcionOscura = pixelesOscurosInterior / totalInterior;
  const proporcionMuyOscura = pixelesMuyOscurosInterior / totalInterior;
  const promedioAnillo = totalAnillo > 0 ? sumaAnillo / totalAnillo : 0;

  const proporcionesCuadrantes = cuadrantes.map(q => {
    return q.total > 0 ? q.oscuros / q.total : 0;
  });

  const cuadrantesConMarca = proporcionesCuadrantes.filter(v => v >= 0.16).length;
  const promedioCuadrantes =
    proporcionesCuadrantes.reduce((a, b) => a + b, 0) / proporcionesCuadrantes.length;
  const minCuadrante = Math.min(...proporcionesCuadrantes);
  const maxCuadrante = Math.max(...proporcionesCuadrantes);

  
  let uniformidad = 0;

  if (promedioCuadrantes > 0) {
    uniformidad = Math.min(1, minCuadrante / (promedioCuadrantes * 0.70));
  }

  
  const desbalance = maxCuadrante - minCuadrante;

  let puntaje =
    promedioInterior * 0.34 +
    proporcionOscura * 0.34 +
    proporcionMuyOscura * 0.12 +
    uniformidad * 0.28 -
    promedioAnillo * 0.12;

  

  
  if (proporcionOscura < 0.20) {
    puntaje = Math.min(puntaje, 0.055);
  }

  
  if (cuadrantesConMarca <= 1) {
    puntaje = Math.min(puntaje, 0.050);
  }

  
  if (cuadrantesConMarca === 2 && proporcionOscura < 0.30) {
    puntaje = Math.min(puntaje, 0.070);
  }

  
  if (desbalance > 0.55 && uniformidad < 0.45) {
    puntaje = Math.min(puntaje, 0.075);
  }

  
  if (promedioInterior < 0.18 && proporcionMuyOscura < 0.08) {
    puntaje = Math.min(puntaje, 0.070);
  }

  return Math.max(0, Math.min(1, puntaje));
}

function analizarRespuestaMejorada(puntajes, opciones) {
  

  const pares = puntajes.map((valor, indice) => ({
    valor,
    indice,
    opcion: opciones[indice]
  }));

  pares.sort((a, b) => b.valor - a.valor);

  const primero = pares[0];
  const segundo = pares[1];
  const tercero = pares[2];

  const max = primero.valor;
  const diff = primero.valor - segundo.valor;
  const ratioSegundo = max > 0 ? segundo.valor / max : 0;

  const promedioOtros =
    (segundo.valor + tercero.valor + pares[3].valor + pares[4].valor) / 4;

  const ventajaSobrePromedio = max - promedioOtros;

  
  if (max < 0.115) {
    return {
      respuesta: "?",
      motivo: "sombreado insuficiente",
      opcionSospechosa: primero.opcion,
      puntaje: max
    };
  }

  
  if (max < 0.175 && ventajaSobrePromedio < 0.050) {
    return {
      respuesta: "?",
      motivo: "marca débil o parcial",
      opcionSospechosa: primero.opcion,
      puntaje: max
    };
  }

  
  if (diff < 0.022 && ratioSegundo > 0.82) {
    return {
      respuesta: "?",
      motivo: `duda entre ${primero.opcion} y ${segundo.opcion}`,
      opcionSospechosa: `${primero.opcion}/${segundo.opcion}`,
      puntaje: max
    };
  }

  
  if (max >= 0.18 && ratioSegundo > 0.88 && diff < 0.035) {
    return {
      respuesta: "?",
      motivo: `posible doble marca ${primero.opcion}/${segundo.opcion}`,
      opcionSospechosa: `${primero.opcion}/${segundo.opcion}`,
      puntaje: max
    };
  }

  
  if (max < 0.22 && ventajaSobrePromedio < 0.045) {
    return {
      respuesta: "?",
      motivo: "marca no destaca claramente",
      opcionSospechosa: primero.opcion,
      puntaje: max
    };
  }

  return {
    respuesta: primero.opcion,
    motivo: "",
    opcionSospechosa: primero.opcion,
    puntaje: max
  };
}

function elegirRespuestaMejorada(puntajes, opciones) {
  return analizarRespuestaMejorada(puntajes, opciones).respuesta;
}

function dibujarCorreccionVisual(canvas, detalles) {
  const ctx = canvas.getContext("2d");

  ctx.lineWidth = 3;
  ctx.font = "bold 13px Arial";

  detalles.forEach(item => {
    const centroMarcado = item.centros.find(c => c.opcion === item.respuesta);
    const centroCorrecto = item.centros.find(c => c.opcion === item.clave);

    if (item.respuesta === "?") {
      const ordenados = [...item.centros].sort((a, b) => b.puntaje - a.puntaje);
      const centroDudoso = ordenados[0];

      ctx.strokeStyle = "yellow";
      ctx.fillStyle = "yellow";

      if (centroDudoso) {
        ctx.beginPath();
        ctx.arc(centroDudoso.x, centroDudoso.y, 8, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillText("?", centroDudoso.x + 8, centroDudoso.y - 6);
      }

      return;
    }

    if (item.respuesta === item.clave) {
      ctx.strokeStyle = "lime";

      if (centroMarcado) {
        ctx.beginPath();
        ctx.arc(centroMarcado.x, centroMarcado.y, 8, 0, Math.PI * 2);
        ctx.stroke();
      }
    } else {
      ctx.strokeStyle = "red";

      if (centroMarcado) {
        ctx.beginPath();
        ctx.arc(centroMarcado.x, centroMarcado.y, 8, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.strokeStyle = "lime";

      if (centroCorrecto) {
        ctx.beginPath();
        ctx.arc(centroCorrecto.x, centroCorrecto.y, 8, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  });
}

function recortarZonaNombreAlumno(canvasAlineado) {
  const ancho = canvasAlineado.width;
  const alto = canvasAlineado.height;

  
  
  const xRatio = 0.155;
  const yRatio = 0.088;
  const wRatio = 0.565;
  const hRatio = 0.052;

  const x = Math.round(ancho * xRatio);
  const y = Math.round(alto * yRatio);
  const w = Math.round(ancho * wRatio);
  const h = Math.round(alto * hRatio);

  const crop = document.createElement("canvas");
  crop.width = w;
  crop.height = h;

  const ctx = crop.getContext("2d");
  ctx.drawImage(canvasAlineado, x, y, w, h, 0, 0, w, h);

  return {
    dataUrl: crop.toDataURL("image/jpeg", 0.92),
    x,
    y,
    w,
    h
  };
}

function dibujarMarcoNombreEnCartilla(canvasAlineado, zonaNombre) {
  const ctx = canvasAlineado.getContext("2d");

  ctx.save();
  ctx.lineWidth = 3;
  ctx.strokeStyle = "orange";
  ctx.fillStyle = "orange";
  ctx.font = "bold 16px Arial";

  ctx.strokeRect(zonaNombre.x, zonaNombre.y, zonaNombre.w, zonaNombre.h);
  ctx.fillText("Zona nombre", zonaNombre.x, Math.max(18, zonaNombre.y - 6));

  ctx.restore();
}

function corregirCartilla({ orden, nombreCartilla, clave, respuestas, tamanoGrupo, blancas }) {
  let totalBuenas = 0;
  let totalMalas = 0;
  let totalBlancas = 0;
  let grupos = [];

  const cantidadGrupos = Math.ceil(clave.length / tamanoGrupo);

  for (let i = 0; i < cantidadGrupos; i++) {
    grupos.push(0);
  }

  for (let i = 0; i < clave.length; i++) {
    const respuesta = respuestas[i];

    if (respuesta === clave[i]) {
      totalBuenas++;
      const numeroGrupo = Math.floor(i / tamanoGrupo);
      grupos[numeroGrupo]++;
    } else if (respuesta === "?" || respuesta === "" || respuesta == null) {
      totalBlancas++;
    } else {
      totalMalas++;
    }
  }

  return {
    orden,
    cartilla: nombreCartilla,
    totalBuenas,
    totalMalas,
    blancas: totalBlancas,
    respuestas,
    grupos
  };
}


function obtenerNombresGrupos(cantidadGrupos) {
  const campo = document.getElementById("nombresGrupos");

  if (!campo) {
    return Array.from({ length: cantidadGrupos }, (_, i) => `G${i + 1}`);
  }

  const texto = campo.value.trim();

  if (!texto) {
    return Array.from({ length: cantidadGrupos }, (_, i) => `G${i + 1}`);
  }

  const nombres = texto
    .split(/\n|,/)
    .map(x => x.trim())
    .filter(x => x !== "");

  let resultado = [];

  for (let i = 0; i < cantidadGrupos; i++) {
    resultado.push(nombres[i] || `G${i + 1}`);
  }

  return resultado;
}

function actualizarInfoClaveYGrupos() {
  const claveCampo = document.getElementById("clave");
  const info = document.getElementById("infoClaveGrupos");

  if (!claveCampo || !info) return;

  const clave = claveCampo.value
    .trim()
    .toUpperCase()
    .split(/\s+/)
    .filter(x => x !== "");

  const total = clave.length;
  const grupos = Math.ceil(total / 5);

  if (total === 0) {
    info.textContent = "Clave detectada: 0 respuestas.";
    return;
  }

  const invalidas = clave.filter(x => !["A", "B", "C", "D", "E"].includes(x));

  if (invalidas.length > 0) {
    info.textContent = `Clave detectada: ${total} respuestas. Hay ${invalidas.length} respuestas inválidas. Solo usa A, B, C, D, E.`;
    return;
  }

  info.textContent = `Clave detectada: ${total} respuestas. Se crearán ${grupos} grupos de 5 preguntas.`;
}

function validarAntesDeProcesar() {
  if (!configuracionActivaRevision) {
    alert("Primero elige un grupo.");
    return false;
  }

  const archivos = obtenerArchivosCartillas();

  if (!archivos || archivos.length === 0) {
    alert("Primero selecciona las fotos de las cartillas.");
    return false;
  }

  const claveTexto = document.getElementById("clave").value.trim().toUpperCase();
  const clave = claveTexto.split(/\s+/).filter(x => x !== "");

  if (clave.length === 0) {
    alert("No hay clave cargada para este grupo.");
    return false;
  }

  const invalidas = clave.filter(x => !["A", "B", "C", "D", "E"].includes(x));

  if (invalidas.length > 0) {
    alert("La clave contiene respuestas inválidas. Comunica esto al encargado.");
    return false;
  }

  return true;
}

function mostrarResultados(totalPreguntas, tamanoGrupo) {
  const thead = document.querySelector("#tablaResultados thead");
  const tbody = document.querySelector("#tablaResultados tbody");

  thead.innerHTML = "";
  tbody.innerHTML = "";

  const cantidadGrupos = Math.ceil(totalPreguntas / tamanoGrupo);
  const nombresGrupos = obtenerNombresGrupos(cantidadGrupos);

  let cabecera = `
    <tr>
      <th>Orden</th>
      <th>Buenas</th>
      <th>Malas</th>
      <th>Blancas</th>
  `;

  for (let i = 1; i <= cantidadGrupos; i++) {
    const inicio = (i - 1) * tamanoGrupo + 1;
    const fin = Math.min(i * tamanoGrupo, totalPreguntas);
    const nombreGrupo = nombresGrupos[i - 1];

    cabecera += `<th>${nombreGrupo}<br>${inicio}-${fin}</th>`;
  }

  cabecera += `</tr>`;
  thead.innerHTML = cabecera;

  resultados.forEach(item => {
    let fila = `
      <tr>
        <td>${item.orden}</td>
        <td>${item.totalBuenas}</td>
        <td>${item.totalMalas}</td>
        <td>${item.blancas}</td>
    `;

    item.grupos.forEach(valor => {
      fila += `<td>${valor}</td>`;
    });

    fila += `</tr>`;
    tbody.innerHTML += fila;
  });
}

function mostrarRespuestasDetectadas() {
  const cuadro = document.getElementById("respuestasDetectadas");

  let texto = "";

  resultados.forEach(item => {
    texto += `${item.orden}. ${item.cartilla}\n`;
    texto += item.respuestas.join(" ");
    texto += "\n\n";
  });

  cuadro.value = texto.trim();
}

async function exportarExcel() {
  

  if (resultados.length === 0) {
    alert("Primero debes leer las cartillas.");
    return;
  }

  if (!window.ExcelJS) {
    alert("No cargó la librería ExcelJS. Revisa conexión a internet o vuelve a abrir la página.");
    return;
  }

  const claveTexto = document.getElementById("clave").value.trim().toUpperCase();
  const clave = claveTexto.split(/\s+/).filter(x => x !== "");

  const totalPreguntas =
    resultados[0] && resultados[0].respuestas
      ? resultados[0].respuestas.length
      : clave.length || parseInt(document.getElementById("totalPreguntas").value);

  const tamanoGrupo = parseInt(document.getElementById("tamanoGrupo").value);
  const cantidadGrupos = Math.ceil(totalPreguntas / tamanoGrupo);
  const nombresGrupos = obtenerNombresGrupos(cantidadGrupos);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Corrector de Cartillas";
  workbook.created = new Date();

  const ws = workbook.addWorksheet("Resultados");

  const encabezados = [
    { header: "Orden", key: "orden", width: 10 },
    { header: "Nombre escrito", key: "nombre", width: 42 },
    { header: "Buenas", key: "buenas", width: 12 },
    { header: "Malas", key: "malas", width: 12 },
    { header: "Blancas", key: "blancas", width: 12 }
  ];

  for (let i = 1; i <= cantidadGrupos; i++) {
    const inicio = (i - 1) * tamanoGrupo + 1;
    const fin = Math.min(i * tamanoGrupo, totalPreguntas);
    const nombreGrupo = nombresGrupos[i - 1];

    encabezados.push({
      header: `${nombreGrupo} (${inicio}-${fin})`,
      key: `g${i}`,
      width: 18
    });
  }

  ws.columns = encabezados;

  ws.getRow(1).font = { bold: true };
  ws.getRow(1).alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  ws.getRow(1).height = 30;

  resultados.forEach((item, index) => {
    const filaData = {
      orden: item.orden,
      nombre: "",
      buenas: item.totalBuenas,
      malas: item.totalMalas,
      blancas: item.blancas
    };

    item.grupos.forEach((valor, i) => {
      filaData[`g${i + 1}`] = valor;
    });

    const row = ws.addRow(filaData);
    const rowNumber = row.number;

    row.height = 42;
    row.alignment = { vertical: "middle", horizontal: "center" };

    const itemPDF = cartillasProcesadasPDF.find(x => x.orden === item.orden);

    if (itemPDF && itemPDF.recorteNombre) {
      const imageId = workbook.addImage({
        base64: itemPDF.recorteNombre,
        extension: "jpeg"
      });

      
      ws.addImage(imageId, {
        tl: { col: 1.05, row: rowNumber - 0.92 },
        ext: { width: 250, height: 34 }
      });
    } else {
      ws.getCell(`B${rowNumber}`).value = "Sin recorte";
    }
  });

  
  ws.eachRow(row => {
    row.eachCell(cell => {
      cell.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" }
      };

      cell.alignment = {
        vertical: "middle",
        horizontal: "center",
        wrapText: true
      };
    });
  });

  
  ws.views = [{ state: "frozen", ySplit: 1 }];

  const buffer = await workbook.xlsx.writeBuffer();

  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });

  const url = URL.createObjectURL(blob);

  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = `${obtenerNombreBaseExportacion()}_Resultados.xlsx`;
  enlace.click();

  URL.revokeObjectURL(url);
}

function limpiarTodo() {
  detenerEscaneoAutomatico();
  resultados = [];
  cartillasCapturadas = [];
  numeroAutoEscaneo = 0;
  actualizarContadorEscaneo();

  document.getElementById("cartillas").value = "";
  document.getElementById("listaArchivos").innerHTML = "";
  document.getElementById("estado").textContent = "";
  document.getElementById("estadoOpenCV").textContent = cvCargado
    ? "OpenCV listo. Ya puedes detectar esquinas."
    : "Cargando detector de imagen...";
  document.getElementById("respuestasDetectadas").value = "";

  document.querySelector(".preview").style.display = "none";
  document.getElementById("previewImagen").src = "";

  limpiarCanvas("canvasDebug");
  limpiarCanvas("canvasAlineado");

  document.querySelector("#tablaResultados thead").innerHTML = "";
  document.querySelector("#tablaResultados tbody").innerHTML = "";
}

function limpiarCanvas(id) {
  const canvas = document.getElementById(id);
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function fileToDataURL(archivo) {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();

    lector.onload = function(e) {
      resolve(e.target.result);
    };

    lector.onerror = reject;
    lector.readAsDataURL(archivo);
  });
}

function cargarImagenDesdeDataURL(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = function() {
      resolve(img);
    };

    img.onerror = reject;
    img.src = dataUrl;
  });
}

async function descargarPDFEscaneos() {
  

  if (!cartillasProcesadasPDF || cartillasProcesadasPDF.length === 0) {
    alert("Primero presiona 'Leer cartillas'. Luego podrás descargar el PDF procesado.");
    return;
  }

  if (!window.jspdf || !window.jspdf.jsPDF) {
    alert("No cargó la librería para generar PDF. Revisa conexión o vuelve a abrir la app.");
    return;
  }

  const { jsPDF } = window.jspdf;

  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4"
  });

  const pageW = 210;
  const pageH = 297;
  const margen = 8;

  const nombreBoxH = 24;
  const tituloY = margen + 5;
  const nombreTituloY = margen + 13;
  const nombreImgY = margen + 16;
  const cartillaY = margen + nombreBoxH + 12;

  const maxW = pageW - margen * 2;
  const maxH = pageH - cartillaY - margen;

  for (let i = 0; i < cartillasProcesadasPDF.length; i++) {
    if (i > 0) {
      pdf.addPage("a4", "portrait");
    }

    const item = cartillasProcesadasPDF[i];

    pdf.setFontSize(13);
    pdf.text(`ORDEN ${String(item.orden).padStart(3, "0")}`, margen, tituloY);

    if (configuracionActivaRevision) {
      pdf.setFontSize(9);
      pdf.text(
        `${configuracionActivaRevision.simulacro || ""} - ${configuracionActivaRevision.grupo || ""}`,
        margen + 38,
        tituloY
      );
    }

    const resultadoPDF = resultados.find(r => r.orden === item.orden);
    if (resultadoPDF) {
      pdf.setFontSize(9);
      pdf.text(
        `Buenas: ${resultadoPDF.totalBuenas} | Malas: ${resultadoPDF.totalMalas} | Blancas: ${resultadoPDF.blancas}`,
        margen,
        margen + 10
      );
    }

    pdf.setFontSize(9);
    pdf.text("Nombre escrito por el alumno:", margen, nombreTituloY);

    if (item.recorteNombre) {
      const imgNombre = await cargarImagenDesdeDataURL(item.recorteNombre);

      let nombreW = 120;
      let nombreH = (imgNombre.height * nombreW) / imgNombre.width;

      if (nombreH > 18) {
        nombreH = 18;
        nombreW = (imgNombre.width * nombreH) / imgNombre.height;
      }

      pdf.addImage(item.recorteNombre, "JPEG", margen, nombreImgY, nombreW, nombreH);
      pdf.rect(margen, nombreImgY, nombreW, nombreH);
    } else {
      pdf.text("[No se pudo recortar nombre]", margen, nombreImgY + 5);
    }

    const dataUrl = item.dataUrl;
    const img = await cargarImagenDesdeDataURL(dataUrl);

    let imgW = maxW;
    let imgH = (img.height * imgW) / img.width;

    if (imgH > maxH) {
      imgH = maxH;
      imgW = (img.width * imgH) / img.height;
    }

    const x = (pageW - imgW) / 2;

    pdf.addImage(dataUrl, "JPEG", x, cartillaY, imgW, imgH);
  }

  pdf.save(`${obtenerNombreBaseExportacion()}_Cartillas_Procesadas.pdf`);
}

async function leerYExportarExcel() {
  await procesarCartillas();

  if (resultados && resultados.length > 0) {
    exportarExcel();
  }
}

function actualizarContadorFotosSeleccionadas() {
  const archivos = obtenerArchivosCartillas ? obtenerArchivosCartillas() : [];
  const contador = document.getElementById("contadorFotosSeleccionadas");

  if (contador) {
    contador.textContent = `Fotos seleccionadas: ${archivos.length}`;
  }
}

async function procesarYExportarExcel() {
  await procesarCartillas();

  if (resultados && resultados.length > 0) {
    exportarExcel();
  }
}

function borrarFotosSeleccionadas() {
  indicePreviewActual = 0;

  const input = document.getElementById("cartillas");

  if (input) {
    input.value = "";
  }

  if (typeof cartillasCapturadas !== "undefined") {
    cartillasCapturadas = [];
  }

  actualizarContadorFotosSeleccionadas();
  mostrarVistaPrevia();
}

const GRUPOS_OFICIALES = [
  "5to Primaria",
  "6to Primaria",
  "1ro Secundaria",
  "2do Secundaria",
  "3ro Secundaria",
  "4to Secundaria",
  "5to Secundaria",
  "Círculo 1",
  "Círculo 2"
];

function normalizarTextoArchivo(texto) {
  return (texto || "Sin_nombre")
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .substring(0, 80);
}

function obtenerNombreBaseExportacion() {
  if (configuracionActivaRevision) {
    const simulacro = normalizarTextoArchivo(configuracionActivaRevision.simulacro || "Simulacro");
    const grupo = normalizarTextoArchivo(configuracionActivaRevision.grupo || "Grupo");
    return `${simulacro}_${grupo}`;
  }

  return "resultados_cartillas";
}

function poblarSelectAdmin() {
  const select = document.getElementById("adminGrupo");
  if (!select) return;

  select.innerHTML = "";

  GRUPOS_OFICIALES.forEach(grupo => {
    const option = document.createElement("option");
    option.value = grupo;
    option.textContent = grupo;
    select.appendChild(option);
  });
}

function mostrarPantalla(nombrePantalla) {
  const inicio = document.getElementById("pantallaInicio");
  const admin = document.getElementById("pantallaAdmin");
  const revision = document.getElementById("pantallaRevision");

  if (inicio) inicio.style.display = nombrePantalla === "inicio" ? "block" : "none";
  if (admin) admin.style.display = nombrePantalla === "admin" ? "block" : "none";
  if (revision) revision.style.display = nombrePantalla === "revision" ? "block" : "none";

  if (nombrePantalla === "admin") {
    poblarSelectAdmin();
    cargarConfigAdminSeleccionada();
    renderizarResumenAdmin();
  }

  if (nombrePantalla === "revision") {
    renderizarBotonesRevision();
  }
}

function cargarConfigAdminSeleccionada() {
  const grupo = document.getElementById("adminGrupo")?.value;
  const configs = obtenerConfiguracionesGuardadas();
  const config = configs[grupo];

  const simulacro = document.getElementById("adminSimulacro");
  const clave = document.getElementById("adminClave");
  const cursos = document.getElementById("adminCursos");

  if (simulacro) simulacro.value = config?.simulacro || "";
  if (clave) clave.value = Array.isArray(config?.clave) ? config.clave.join(" ") : "";
  if (cursos) cursos.value = Array.isArray(config?.cursos) ? config.cursos.join("\n") : "";
}

function guardarConfigAdmin() {
  const grupo = document.getElementById("adminGrupo")?.value;
  const simulacro = document.getElementById("adminSimulacro")?.value.trim();
  const claveTexto = document.getElementById("adminClave")?.value.trim().toUpperCase() || "";
  const cursosTexto = document.getElementById("adminCursos")?.value.trim() || "";

  const clave = claveTexto.split(/\s+/).filter(x => x !== "");
  const cursos = cursosTexto.split(/\n|,/).map(x => x.trim()).filter(x => x !== "");

  if (!grupo) {
    alert("Selecciona un grupo.");
    return;
  }

  if (!simulacro) {
    alert("Escribe el nombre del simulacro.");
    return;
  }

  if (clave.length === 0) {
    alert("Pega la clave de respuestas.");
    return;
  }

  const invalidas = clave.filter(x => !["A", "B", "C", "D", "E"].includes(x));
  if (invalidas.length > 0) {
    alert("La clave contiene respuestas inválidas. Solo usa A, B, C, D, E.");
    return;
  }

  const gruposEsperados = Math.ceil(clave.length / 5);

  if (cursos.length > 0 && cursos.length !== gruposEsperados) {
    const continuar = confirm(
      `La clave tiene ${clave.length} respuestas, por lo que se crearán ${gruposEsperados} grupos de 5.\n` +
      `Pero ingresaste ${cursos.length} nombres de cursos/grupos.\n\n` +
      `¿Deseas guardar de todos modos?`
    );

    if (!continuar) return;
  }

  const configs = obtenerConfiguracionesGuardadas();

  configs[grupo] = {
    grupo,
    simulacro,
    clave,
    cursos,
    preguntas: clave.length,
    grupos: gruposEsperados,
    actualizado: new Date().toISOString()
  };

  guardarConfiguraciones(configs);
  renderizarResumenAdmin();

  alert(`Clave guardada para ${grupo}.`);
}

function eliminarConfigAdmin() {
  const grupo = document.getElementById("adminGrupo")?.value;
  if (!grupo) return;

  const confirmar = confirm(`¿Eliminar la clave guardada para ${grupo}?`);
  if (!confirmar) return;

  const configs = obtenerConfiguracionesGuardadas();
  delete configs[grupo];
  guardarConfiguraciones(configs);

  cargarConfigAdminSeleccionada();
  renderizarResumenAdmin();
  alert("Configuración eliminada.");
}

function renderizarResumenAdmin() {
  const contenedor = document.getElementById("adminResumen");
  if (!contenedor) return;

  const configs = obtenerConfiguracionesGuardadas();

  let html = "<table><thead><tr><th>Grupo</th><th>Simulacro</th><th>Preguntas</th><th>Grupos</th><th>Estado</th></tr></thead><tbody>";

  GRUPOS_OFICIALES.forEach(grupo => {
    const c = configs[grupo];

    html += `
      <tr>
        <td>${grupo}</td>
        <td>${c?.simulacro || "-"}</td>
        <td>${c?.preguntas || "-"}</td>
        <td>${c?.grupos || "-"}</td>
        <td>${c ? "Guardado" : "Pendiente"}</td>
      </tr>
    `;
  });

  html += "</tbody></table>";
  contenedor.innerHTML = html;
}

function exportarConfiguracionesJSON() {
  const configs = obtenerConfiguracionesGuardadas();
  const blob = new Blob([JSON.stringify(configs, null, 2)], {
    type: "application/json;charset=utf-8;"
  });

  const url = URL.createObjectURL(blob);
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = "claves_corrector_cartillas.json";
  enlace.click();
  URL.revokeObjectURL(url);
}

function importarConfiguracionesJSON(event) {
  const archivo = event.target.files && event.target.files[0];
  if (!archivo) return;

  const lector = new FileReader();

  lector.onload = function(e) {
    try {
      const configs = JSON.parse(e.target.result);
      guardarConfiguraciones(configs);
      cargarConfigAdminSeleccionada();
      renderizarResumenAdmin();
      renderizarBotonesRevision();
      alert("Configuraciones importadas correctamente.");
    } catch (error) {
      alert("No se pudo importar el archivo JSON.");
    }

    event.target.value = "";
  };

  lector.readAsText(archivo, "utf-8");
}

function renderizarBotonesRevision() {
  const contenedor = document.getElementById("botonesRevision");
  if (!contenedor) return;

  const configs = obtenerConfiguracionesGuardadas();
  contenedor.innerHTML = "";

  GRUPOS_OFICIALES.forEach(grupo => {
    const config = configs[grupo];

    const boton = document.createElement("button");
    boton.textContent = config ? grupo : `${grupo} (sin clave)`;
    boton.disabled = !config;
    boton.className = config ? "" : "btn-deshabilitado";
    boton.onclick = () => seleccionarGrupoRevision(grupo);

    contenedor.appendChild(boton);
  });
}

function seleccionarGrupoRevision(grupo) {
  const configs = obtenerConfiguracionesGuardadas();
  const config = configs[grupo];

  if (!config) {
    alert("Este grupo todavía no tiene clave cargada en Admin.");
    return;
  }

  configuracionActivaRevision = config;

  const clave = document.getElementById("clave");
  const nombresGrupos = document.getElementById("nombresGrupos");
  const totalPreguntas = document.getElementById("totalPreguntas");
  const info = document.getElementById("infoGrupoSeleccionado");

  if (clave) clave.value = config.clave.join(" ");
  if (nombresGrupos) nombresGrupos.value = (config.cursos || []).join("\n");
  if (totalPreguntas) totalPreguntas.value = String(config.clave.length);

  if (info) {
    info.innerHTML = `
      <strong>Grupo seleccionado:</strong> ${config.grupo}<br>
      <strong>Simulacro:</strong> ${config.simulacro}<br>
      <strong>Preguntas:</strong> ${config.clave.length}<br>
      <strong>Grupos de 5:</strong> ${Math.ceil(config.clave.length / 5)}
    `;
  }

  actualizarInfoClaveYGrupos();

  const areaTrabajo = document.getElementById("areaTrabajoRevision");
  if (areaTrabajo) areaTrabajo.style.display = "block";

  limpiarSoloResultados();
}

function limpiarSoloResultados() {
  resultados = [];
  cartillasProcesadasPDF = [];

  const estado = document.getElementById("estado");
  if (estado) estado.textContent = "";

  const tablaHead = document.querySelector("#tablaResultados thead");
  const tablaBody = document.querySelector("#tablaResultados tbody");

  if (tablaHead) tablaHead.innerHTML = "";
  if (tablaBody) tablaBody.innerHTML = "";
}

document.addEventListener("DOMContentLoaded", () => {
  poblarSelectAdmin();
  renderizarBotonesRevision();

  const adminGrupo = document.getElementById("adminGrupo");
  if (adminGrupo) {
    adminGrupo.addEventListener("change", cargarConfigAdminSeleccionada);
  }
});

const CONFIGURACION_EXAMEN_CODIGO = {
  simulacro: "Simulacro de prueba - 90 preguntas",

  
  grupos: {
    "5to Primaria": {
      clave: `
A B C D E A B C D E
A B C D E A B C D E
A B C D E A B C D E
A B C D E A B C D E
A B C D E A B C D E
A B C D E A B C D E
A B C D E A B C D E
A B C D E A B C D E
A B C D E A B C D E
      `,
      cursos: `
Comunicación
Matemática
Ciencia y Tecnología
Personal Social
Inglés
Razonamiento Verbal
Razonamiento Matemático
Álgebra
Geometría
Aritmética
Historia
Geografía
Biología
Física
Química
Lenguaje
Literatura
Cultura General
      `
    },

    "6to Primaria": {
      clave: `
B C D E A B C D E A
B C D E A B C D E A
B C D E A B C D E A
B C D E A B C D E A
B C D E A B C D E A
B C D E A B C D E A
B C D E A B C D E A
B C D E A B C D E A
B C D E A B C D E A
      `,
      cursos: `
Comunicación
Matemática
Ciencia y Tecnología
Personal Social
Inglés
Razonamiento Verbal
Razonamiento Matemático
Álgebra
Geometría
Aritmética
Historia
Geografía
Biología
Física
Química
Lenguaje
Literatura
Cultura General
      `
    },

    "1ro Secundaria": {
      clave: `
C D E A B C D E A B
C D E A B C D E A B
C D E A B C D E A B
C D E A B C D E A B
C D E A B C D E A B
C D E A B C D E A B
C D E A B C D E A B
C D E A B C D E A B
C D E A B C D E A B
      `,
      cursos: `
Comunicación
Matemática
Ciencia y Tecnología
Personal Social
Inglés
Razonamiento Verbal
Razonamiento Matemático
Álgebra
Geometría
Aritmética
Historia
Geografía
Biología
Física
Química
Lenguaje
Literatura
Cultura General
      `
    },

    "2do Secundaria": {
      clave: `
D E A B C D E A B C
D E A B C D E A B C
D E A B C D E A B C
D E A B C D E A B C
D E A B C D E A B C
D E A B C D E A B C
D E A B C D E A B C
D E A B C D E A B C
D E A B C D E A B C
      `,
      cursos: `
Comunicación
Matemática
Ciencia y Tecnología
Personal Social
Inglés
Razonamiento Verbal
Razonamiento Matemático
Álgebra
Geometría
Aritmética
Historia
Geografía
Biología
Física
Química
Lenguaje
Literatura
Cultura General
      `
    },

    "3ro Secundaria": {
      clave: `
E A B C D E A B C D
E A B C D E A B C D
E A B C D E A B C D
E A B C D E A B C D
E A B C D E A B C D
E A B C D E A B C D
E A B C D E A B C D
E A B C D E A B C D
E A B C D E A B C D
      `,
      cursos: `
Comunicación
Matemática
Ciencia y Tecnología
Personal Social
Inglés
Razonamiento Verbal
Razonamiento Matemático
Álgebra
Geometría
Aritmética
Historia
Geografía
Biología
Física
Química
Lenguaje
Literatura
Cultura General
      `
    },

    "4to Secundaria": {
      clave: `
A C E B D A C E B D
A C E B D A C E B D
A C E B D A C E B D
A C E B D A C E B D
A C E B D A C E B D
A C E B D A C E B D
A C E B D A C E B D
A C E B D A C E B D
A C E B D A C E B D
      `,
      cursos: `
Comunicación
Matemática
Ciencia y Tecnología
Personal Social
Inglés
Razonamiento Verbal
Razonamiento Matemático
Álgebra
Geometría
Aritmética
Historia
Geografía
Biología
Física
Química
Lenguaje
Literatura
Cultura General
      `
    },

    "5to Secundaria": {
      clave: `
B D A E C B D A E C
B D A E C B D A E C
B D A E C B D A E C
B D A E C B D A E C
B D A E C B D A E C
B D A E C B D A E C
B D A E C B D A E C
B D A E C B D A E C
B D A E C B D A E C
      `,
      cursos: `
Comunicación
Matemática
Ciencia y Tecnología
Personal Social
Inglés
Razonamiento Verbal
Razonamiento Matemático
Álgebra
Geometría
Aritmética
Historia
Geografía
Biología
Física
Química
Lenguaje
Literatura
Cultura General
      `
    },

    "Círculo 1": {
      clave: `
C A D B E C A D B E
C A D B E C A D B E
C A D B E C A D B E
C A D B E C A D B E
C A D B E C A D B E
C A D B E C A D B E
C A D B E C A D B E
C A D B E C A D B E
C A D B E C A D B E
      `,
      cursos: `
Comunicación
Matemática
Ciencia y Tecnología
Personal Social
Inglés
Razonamiento Verbal
Razonamiento Matemático
Álgebra
Geometría
Aritmética
Historia
Geografía
Biología
Física
Química
Lenguaje
Literatura
Cultura General
      `
    },

    "Círculo 2": {
      clave: `
E C A D B E C A D B
E C A D B E C A D B
E C A D B E C A D B
E C A D B E C A D B
E C A D B E C A D B
E C A D B E C A D B
E C A D B E C A D B
E C A D B E C A D B
E C A D B E C A D B
      `,
      cursos: `
Comunicación
Matemática
Ciencia y Tecnología
Personal Social
Inglés
Razonamiento Verbal
Razonamiento Matemático
Álgebra
Geometría
Aritmética
Historia
Geografía
Biología
Física
Química
Lenguaje
Literatura
Cultura General
      `
    }
  }
};

function convertirTextoClaveAArray(texto) {
  return (texto || "")
    .trim()
    .toUpperCase()
    .split(/\s+/)
    .filter(x => x !== "");
}

function convertirTextoCursosAArray(texto) {
  return (texto || "")
    .trim()
    .split(/\n|,/)
    .map(x => x.trim())
    .filter(x => x !== "");
}

function obtenerConfiguracionesGuardadas() {
  const configs = {};

  GRUPOS_OFICIALES.forEach(grupo => {
    const data = CONFIGURACION_EXAMEN_CODIGO.grupos[grupo];

    if (!data) return;

    const clave = convertirTextoClaveAArray(data.clave);
    const cursos = convertirTextoCursosAArray(data.cursos);

    if (clave.length === 0) return;

    configs[grupo] = {
      grupo,
      simulacro: CONFIGURACION_EXAMEN_CODIGO.simulacro,
      clave,
      cursos,
      preguntas: clave.length,
      grupos: Math.ceil(clave.length / 5),
      actualizado: "configurado_en_codigo"
    };
  });

  return configs;
}

function guardarConfiguraciones() {
  alert("En esta versión las claves se actualizan directamente en el código.");
}

document.addEventListener("DOMContentLoaded", () => {
  renderizarBotonesRevision();
});
