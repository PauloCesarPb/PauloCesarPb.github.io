let resultados = [];
let indicePreviewActual = 0;
let cvCargado = false;

// Fotos/cartillas guardadas automáticamente por la cámara en vivo
let cartillasCapturadas = [];
let cartillasProcesadasPDF = [];

// Variables del escáner automático
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
  /*
    Coordenadas objetivo tomadas de la plantilla oficial ZipGrade 100 preguntas.
    Se usan las esquinas/cuadrados negros principales para enderezar la hoja.
  */
  superiorIzquierdo: { x: 0.118873, y: 0.099116 },
  superiorDerecho: { x: 0.905637, y: 0.099116 },
  inferiorIzquierdo: { x: 0.118873, y: 0.918245 },
  inferiorDerecho: { x: 0.905637, y: 0.918245 }
};

/*
  PLANTILLA BASE POR TRAMOS DE 10 PREGUNTAS

  xA = centro aproximado de la alternativa A
  xE = centro aproximado de la alternativa E
  yPrimera = centro aproximado de la primera pregunta del tramo
  yUltima = centro aproximado de la última pregunta del tramo

  Esta plantilla se ajusta con los cuadraditos internos detectados.
*/
const PLANTILLA_TRAMOS_BASE = [
  /*
    Coordenadas normalizadas desde zipgrade100questionv2.pdf.
    Esta versión deja de usar posiciones aproximadas a ojo.
  */
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

/*
  CUADRADITOS INTERNOS ESPERADOS

  NO se buscan cuadrados en toda la hoja.
  Solo se buscan dentro de ventanitas proporcionales donde sabemos
  que la plantilla ZipGrade tiene un cuadrado negro guía.

  guiaX / guiaY = posición aproximada del cuadradito.
  rx / ry = tamaño de la ventana de búsqueda.
*/
const GUIAS_INTERNAS_ESPERADAS = [
  /*
    Cuadraditos internos esperados en la plantilla oficial ZipGrade 100.
    Se buscan solo en ventanas pequeñas para no confundir textos o manchas.
  */
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



/*
  =========================================================
  NAVEGACIÓN DE FOTOS SELECCIONADAS
  =========================================================
  Permite revisar las fotos seleccionadas con flecha izquierda/derecha.
*/
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

  /*
    Segunda calibración:
    con la plantilla ya guiada por cuadraditos internos,
    buscamos círculos reales cercanos y corregimos cada tramo.
  */
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

/*
  Busca cuadraditos internos dentro de zonas esperadas.
*/
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

/*
  Usa los cuadraditos internos para ajustar la plantilla:
  - mueve xA/xE usando el desplazamiento horizontal del cuadrado,
  - mueve yPrimera/yUltima usando el desplazamiento vertical del cuadrado,
  - conserva el alto del tramo para no deformar demasiado.
*/
function ajustarPlantillaConGuias(guias) {
  return PLANTILLA_TRAMOS_BASE.map(base => {
    const ajustado = { ...base };

    const guiaEsperada = GUIAS_INTERNAS_ESPERADAS.find(g => g.tramo === base.id);
    if (!guiaEsperada) return ajustado;

    const guiaDetectada = guias[guiaEsperada.id];
    if (!guiaDetectada) return ajustado;

    const dx = guiaDetectada.cx / ANCHO_OBJETIVO - guiaEsperada.x;
    const dy = guiaDetectada.cy / ALTO_OBJETIVO - guiaEsperada.y;

    const anchoTramo = base.xE - base.xA;
    const altoTramo = base.yUltima - base.yPrimera;

    const offsetXA = base.xA - guiaEsperada.x;
    const offsetYPrimera = base.yPrimera - guiaEsperada.y;

    ajustado.xA = guiaDetectada.cx / ANCHO_OBJETIVO + offsetXA;
    ajustado.xE = ajustado.xA + anchoTramo;

    ajustado.yPrimera = guiaDetectada.cy / ALTO_OBJETIVO + offsetYPrimera;
    ajustado.yUltima = ajustado.yPrimera + altoTramo;

    // Suavizado para evitar saltos excesivos si detecta mal un cuadrado.
    ajustado.xA = base.xA + (ajustado.xA - base.xA) * 0.75;
    ajustado.xE = base.xE + (ajustado.xE - base.xE) * 0.75;
    ajustado.yPrimera = base.yPrimera + (ajustado.yPrimera - base.yPrimera) * 0.75;
    ajustado.yUltima = base.yUltima + (ajustado.yUltima - base.yUltima) * 0.75;

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

/*
  AUTO-CALIBRACIÓN POR CÍRCULOS

  Esta función usa la plantilla ajustada con cuadraditos internos
  y luego busca círculos reales cercanos en cada tramo.

  Para cada tramo:
  - toma varios círculos detectados,
  - calcula cuánto se movieron respecto a la plantilla,
  - corrige xA, xE, yPrimera y yUltima,
  - usa mediana para que manchas raras no arruinen el ajuste.
*/
function calibrarPlantillaConCirculos(mat, ancho, alto, totalPreguntas, plantilla) {
  const opciones = document.getElementById("alternativas").value.split("");
  const maxCorrX = 0.012;
  const maxCorrY = 0.020;

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

    /*
      Si no hay suficientes círculos detectados, dejamos el tramo como estaba.
      Esto evita que una mala detección mueva todo el bloque.
    */
    if (muestras.length < 6) {
      return ajustado;
    }

    const totalFilas = fin - inicio;

    const muestrasIzquierda = muestras.filter(m => m.col <= 1);
    const muestrasDerecha = muestras.filter(m => m.col >= opciones.length - 2);

    const muestrasArriba = muestras.filter(m => m.fila <= Math.min(2, totalFilas));
    const muestrasAbajo = muestras.filter(m => m.fila >= Math.max(0, totalFilas - 2));

    const dxGlobal = mediana(muestras.map(m => m.dx));
    const dyGlobal = mediana(muestras.map(m => m.dy));

    let dxA = dxGlobal;
    let dxE = dxGlobal;
    let dyPrimera = dyGlobal;
    let dyUltima = dyGlobal;

    if (muestrasIzquierda.length >= 3) {
      dxA = mediana(muestrasIzquierda.map(m => m.dx));
    }

    if (muestrasDerecha.length >= 3) {
      dxE = mediana(muestrasDerecha.map(m => m.dx));
    }

    if (muestrasArriba.length >= 3) {
      dyPrimera = mediana(muestrasArriba.map(m => m.dy));
    }

    if (muestrasAbajo.length >= 3) {
      dyUltima = mediana(muestrasAbajo.map(m => m.dy));
    }

    dxA = limitar(dxA, -maxCorrX, maxCorrX);
    dxE = limitar(dxE, -maxCorrX, maxCorrX);
    dyPrimera = limitar(dyPrimera, -maxCorrY, maxCorrY);
    dyUltima = limitar(dyUltima, -maxCorrY, maxCorrY);

    /*
      Suavizado.
      0.85 es fuerte pero todavía evita saltos bruscos.
    */
    const k = 0.85;

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
  /*
    DETECCIÓN LOCAL DEL CÍRCULO MÁS CERCANO

    Esta función busca el círculo real alrededor del punto aproximado.
    No busca en toda la hoja; solo en una ventana pequeña.

    Reglas:
    - Si encuentra un círculo cercano, mueve el centro hacia ese círculo.
    - Si el círculo está demasiado lejos, no lo usa.
    - Si no detecta círculo, usa el punto aproximado.
    - Así evitamos que la lectura se vaya hacia manchas del lápiz o texto.
  */

  const radioBusqueda = 22;
  const movimientoMaximoPermitido = 8.5;

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

  /*
    Método 1: HoughCircles.
    Busca círculos reales aunque estén vacíos.
  */
  if (typeof cv.HoughCircles === "function") {
    try {
      cv.HoughCircles(
        blur,
        circles,
        cv.HOUGH_GRADIENT,
        1,
        10,
        75,
        10,
        6,
        14
      );

      for (let i = 0; i < circles.cols; i++) {
        const x = circles.data32F[i * 3];
        const y = circles.data32F[i * 3 + 1];
        const r = circles.data32F[i * 3 + 2];

        const cx = x0 + x;
        const cy = y0 + y;
        const distancia = Math.hypot(cx - xAprox, cy - yAprox);

        if (distancia <= movimientoMaximoPermitido && r >= 6 && r <= 14) {
          candidatos.push({
            x: cx,
            y: cy,
            distancia,
            radio: r,
            metodo: "hough",
            score: distancia
          });
        }
      }
    } catch (e) {
      // Si Hough falla en alguna versión de OpenCV.js, usamos contornos.
    }
  }

  /*
    Método 2: contornos con Canny.
    Sirve como respaldo cuando Hough no encuentra círculos.
  */
  cv.Canny(blur, edges, 40, 110);

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
      rect.width >= 10 &&
      rect.width <= 30 &&
      rect.height >= 10 &&
      rect.height <= 30 &&
      proporcion > 0.65 &&
      proporcion < 1.45 &&
      distancia <= movimientoMaximoPermitido &&
      circularidad > 0.25
    ) {
      candidatos.push({
        x: cx,
        y: cy,
        distancia,
        radio: Math.max(rect.width, rect.height) / 2,
        metodo: "contorno",
        score: distancia + Math.abs(1 - proporcion) * 4
      });
    }

    cnt.delete();
  }

  /*
    Método 3: cuando la burbuja está muy marcada, el contorno puede ser una mancha.
    En ese caso NO usamos el centro de la mancha si se aleja mucho.
    Solo usamos este método si queda muy cerca del punto aproximado.
  */
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
      rect.width <= 28 &&
      rect.height >= 8 &&
      rect.height <= 28 &&
      area >= 20 &&
      proporcion > 0.55 &&
      proporcion < 1.60 &&
      distancia <= 4.5
    ) {
      candidatos.push({
        x: cx,
        y: cy,
        distancia,
        radio: Math.max(rect.width, rect.height) / 2,
        metodo: "marca_cercana",
        score: distancia + 3
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

    /*
      Celeste = se detectó círculo local real.
      Azul = se usó solo la plantilla porque no encontró círculo cercano.
    */
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

  /*
    IMPORTANTE:
    La cantidad real de preguntas se toma automáticamente desde la clave.
    Así funciona para simulacros de 90, 100 u otra cantidad, sin que aparezca
    el error de "debe tener 100 respuestas".
  */
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

      /*
        Guardamos la imagen YA PROCESADA, con puntos y corrección encima,
        para descargarla luego en PDF como evidencia de lectura.
      */
      cartillasProcesadasPDF.push({
        orden: i + 1,
        nombre: archivos[i].name,
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
  /*
    PUNTAJE NORMALIZADO

    Compara el interior de la burbuja con un anillo exterior.
    Esto ayuda a no confundir:
    - burbuja vacía: borde oscuro, centro claro
    - burbuja marcada: centro oscuro
  */

  const rInterior = 6;
  const rAnilloMin = 9;
  const rAnilloMax = 13;

  let totalInterior = 0;
  let sumaInterior = 0;
  let pixelesOscurosInterior = 0;

  let totalAnillo = 0;
  let sumaAnillo = 0;

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
        sumaInterior += oscuridad;

        if (luminancia < 190) {
          pixelesOscurosInterior++;
        }

        totalInterior++;
      } else if (d2 >= rAnilloMin * rAnilloMin && d2 <= rAnilloMax * rAnilloMax) {
        sumaAnillo += oscuridad;
        totalAnillo++;
      }
    }
  }

  if (totalInterior === 0) return 0;

  const promedioInterior = sumaInterior / totalInterior;
  const proporcionOscuraInterior = pixelesOscurosInterior / totalInterior;
  const promedioAnillo = totalAnillo > 0 ? sumaAnillo / totalAnillo : 0;

  /*
    El interior manda.
    El anillo resta un poco para que el borde de una burbuja vacía no parezca marca.
  */
  let puntaje =
    promedioInterior * 0.55 +
    proporcionOscuraInterior * 0.55 -
    promedioAnillo * 0.15;

  return Math.max(0, Math.min(1, puntaje));
}

function elegirRespuestaMejorada(puntajes, opciones) {
  /*
    Criterio de decisión:
    - Si todo está casi blanco, devuelve "?".
    - Si hay dos alternativas prácticamente iguales y muy marcadas, devuelve "?".
    - Si una destaca aunque sea moderadamente, la acepta.
  */

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

  if (max < 0.045) {
    return "?";
  }

  /*
    Marca muy débil: solo aceptamos si destaca claramente.
  */
  if (max < 0.10 && ventajaSobrePromedio < 0.018) {
    return "?";
  }

  /*
    Posible doble marca.
  */
  if (max >= 0.18 && ratioSegundo > 0.94 && diff < 0.018) {
    return "?";
  }

  /*
    Cuando las 5 alternativas están parecidas, no inventar.
  */
  if (max < 0.16 && diff < 0.010 && ventajaSobrePromedio < 0.025) {
    return "?";
  }

  return primero.opcion;
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



/*
  Nombres de grupos / cursos
  Puedes escribirlos uno por línea o separados por coma.
  Si dejas vacío, se usará G1, G2, G3...
*/
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

function exportarExcel() {
  if (resultados.length === 0) {
    alert("Primero debes leer las cartillas.");
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

  let encabezados = [
    "Orden",
    "Buenas",
    "Malas",
    "Blancas"
  ];

  for (let i = 1; i <= cantidadGrupos; i++) {
    const inicio = (i - 1) * tamanoGrupo + 1;
    const fin = Math.min(i * tamanoGrupo, totalPreguntas);
    const nombreGrupo = nombresGrupos[i - 1];

    encabezados.push(`${nombreGrupo} (${inicio}-${fin})`);
  }

  let filas = [];
  filas.push(encabezados);

  resultados.forEach(item => {
    let fila = [
      item.orden,
      item.totalBuenas,
      item.totalMalas,
      item.blancas
    ];

    item.grupos.forEach(valor => {
      fila.push(valor);
    });

    filas.push(fila);
  });

  const contenidoCSV = filas
    .map(fila => fila.map(celda => `"${celda}"`).join(";"))
    .join("\n");

  const blob = new Blob([contenidoCSV], {
    type: "text/csv;charset=utf-8;"
  });

  const url = URL.createObjectURL(blob);

  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = "resultados_cartillas.csv";
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



/*
  =========================================================
  PDF DE CARTILLAS ESCANEADAS
  =========================================================
  Descarga un solo PDF con una página por cada cartilla guardada
  por el escáner automático. Sirve para revisar evidencia de escaneo.
*/
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
  /*
    PDF DE CARTILLAS PROCESADAS

    Este PDF NO usa las fotos originales.
    Usa las imágenes ya procesadas por la app, es decir,
    con la cartilla enderezada, puntos detectados y marcas de corrección.
  */

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
  const tituloH = 10;
  const maxW = pageW - margen * 2;
  const maxH = pageH - margen * 2 - tituloH;

  for (let i = 0; i < cartillasProcesadasPDF.length; i++) {
    if (i > 0) {
      pdf.addPage("a4", "portrait");
    }

    const item = cartillasProcesadasPDF[i];
    const dataUrl = item.dataUrl;
    const img = await cargarImagenDesdeDataURL(dataUrl);

    let imgW = maxW;
    let imgH = (img.height * imgW) / img.width;

    if (imgH > maxH) {
      imgH = maxH;
      imgW = (img.width * imgH) / img.height;
    }

    const x = (pageW - imgW) / 2;
    const y = margen + tituloH;

    pdf.setFontSize(10);
    pdf.text(`Orden ${item.orden} - Cartilla procesada: ${item.nombre}`, margen, margen + 5);

    pdf.addImage(dataUrl, "JPEG", x, y, imgW, imgH);
  }

  pdf.save("cartillas_procesadas_corregidas.pdf");
}

/*
  Botón opcional:
  lee todas las cartillas y luego descarga el Excel.
*/
async function leerYExportarExcel() {
  await procesarCartillas();

  if (resultados && resultados.length > 0) {
    exportarExcel();
  }
}



/*
  =========================================================
  MODO RÁPIDO POR SELECCIÓN DE FOTOS
  =========================================================
  Este modo evita el escaneo en vivo. Tú tomas fotos normal con la cámara
  del celular, luego las seleccionas todas en la app y se procesan juntas.
*/
function actualizarContadorFotosSeleccionadas() {
  const archivos = obtenerArchivosCartillas ? obtenerArchivosCartillas() : [];
  const contador = document.getElementById("contadorFotosSeleccionadas");

  if (contador) {
    contador.textContent = `Fotos seleccionadas: ${archivos.length}`;
  }
}

function mostrarVistaPrevia() {
  const archivos = obtenerArchivosCartillas();
  const listaArchivos = document.getElementById("listaArchivos");
  const preview = document.querySelector(".preview");
  const previewImagen = document.getElementById("previewImagen");

  if (listaArchivos) {
    listaArchivos.innerHTML = "";
  }

  if (!archivos || archivos.length === 0) {
    if (preview) preview.style.display = "none";
    if (previewImagen) previewImagen.src = "";
    actualizarContadorFotosSeleccionadas();
    return;
  }

  if (listaArchivos) {
    archivos.forEach((archivo, index) => {
      const item = document.createElement("div");
      item.textContent = `${index + 1}. ${archivo.name}`;
      listaArchivos.appendChild(item);
    });
  }

  if (preview && previewImagen) {
    const lector = new FileReader();

    lector.onload = function(e) {
      previewImagen.src = e.target.result;
      preview.style.display = "block";
    };

    lector.readAsDataURL(archivos[0]);
  }

  actualizarContadorFotosSeleccionadas();
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
