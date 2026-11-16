const { fetchJson } = require('../servicios/http.service');

const WIKIPEDIA_ES = 'https://es.wikipedia.org/w/api.php';
const WIKIPEDIA_EN = 'https://en.wikipedia.org/w/api.php';

function normalizar(texto = '') {
  return String(texto)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9+#. ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Desambigua nombres de tecnologías que también pueden referirse a otros temas.
function mejorarBusqueda(tema) {
  const equivalencias = {
    java: 'Java lenguaje de programación',
    python: 'Python lenguaje de programación',
    javascript: 'JavaScript lenguaje de programación',
    typescript: 'TypeScript lenguaje de programación',
    rust: 'Rust lenguaje de programación',
    php: 'PHP lenguaje de programación',
    'c++': 'C++ lenguaje de programación',
    'c#': 'C# lenguaje de programación',
    go: 'Go lenguaje de programación',
    algoritmo: 'Algoritmo informática',
    algoritmos: 'Algoritmos informática',
    'arboles binarios': 'Árbol binario informática',
    'árboles binarios': 'Árbol binario informática',
    'binary trees': 'Binary tree computer science'
  };
  return equivalencias[normalizar(tema)] || tema;
}

// Consulta el índice de Wikipedia. Se prueban variantes para evitar depender
// de que el título de la página sea idéntico al texto escrito por el usuario.
async function buscarPaginas(baseUrl, tema) {
  const variantes = [
    { query: tema, profile: 'strict' },
    { query: `${tema} informática programación tecnología`, profile: 'broad' }
  ];
  const porId = new Map();

  for (const variante of variantes) {
    const params = new URLSearchParams({
      action: 'query',
      list: 'search',
      srsearch: variante.query,
      srnamespace: '0',
      srlimit: '10',
      srwhat: 'text',
      format: 'json',
      formatversion: '2'
    });
    const data = await fetchJson(`${baseUrl}?${params.toString()}`);
    for (const item of data.query?.search || []) {
      if (!porId.has(item.pageid)) porId.set(item.pageid, item);
    }
    if (porId.size >= 5) break;
  }

  const palabras = normalizar(tema).split(' ').filter((word) => word.length > 1);
  const resultados = [...porId.values()].map((item) => {
    const titulo = normalizar(item.title);
    const fragmento = normalizar(item.snippet.replace(/<[^>]*>/g, ' '));
    let score = 0;
    if (titulo === normalizar(tema)) score += 100;
    if (titulo.includes(normalizar(tema))) score += 50;
    for (const palabra of palabras) {
      if (titulo.includes(palabra)) score += 12;
      if (fragmento.includes(palabra)) score += 2;
    }
    return { ...item, relevance: score };
  });

  resultados.sort((a, b) => b.relevance - a.relevance);
  return resultados;
}

async function obtenerDetalle(baseUrl, pageIds) {
  const params = new URLSearchParams({
    action: 'query',
    pageids: pageIds.join('|'),
    prop: 'extracts|pageimages|info',
    exchars: '2200',
    explaintext: '1',
    piprop: 'thumbnail',
    pithumbsize: '640',
    inprop: 'url',
    redirects: '1',
    format: 'json',
    formatversion: '2'
  });
  const data = await fetchJson(`${baseUrl}?${params.toString()}`);
  return data.query?.pages || [];
}

async function buscarEnIdioma(baseUrl, tema) {
  const resultados = await buscarPaginas(baseUrl, tema);
  if (!resultados.length) return null;

  const detalles = await obtenerDetalle(baseUrl, resultados.slice(0, 6).map((item) => item.pageid));
  const porId = new Map(detalles.map((item) => [item.pageid, item]));
  const principalBusqueda = resultados[0];
  const principal = porId.get(principalBusqueda.pageid);
  if (!principal || principal.missing !== undefined) return null;

  const idioma = baseUrl.includes('es.wikipedia.org') ? 'es' : 'en';
  const convertir = (pagina, fallback) => ({
    title: pagina.title || fallback.title || tema,
    extract: pagina.extract || fallback.snippet?.replace(/<[^>]*>/g, ' ') || 'El artículo no tiene un resumen disponible.',
    image: pagina.thumbnail?.source || null,
    url: pagina.fullurl || `https://${idioma}.wikipedia.org/wiki/${encodeURIComponent(pagina.title || fallback.title)}`,
    pageId: pagina.pageid
  });

  const article = convertir(principal, principalBusqueda);
  const related = resultados
    .filter((item) => item.pageid !== principal.pageid)
    .map((item) => {
      const page = porId.get(item.pageid);
      if (!page || page.missing !== undefined) return null;
      return convertir(page, item);
    })
    .filter(Boolean)
    .slice(0, 5);

  return { ...article, language: idioma, related };
}

async function getSummary(params = {}) {
  const topic = String(params.topic || '').trim().slice(0, 200);
  if (!topic) {
    const error = new Error('Escribe un concepto para buscar.');
    error.status = 400;
    throw error;
  }

  const termino = mejorarBusqueda(topic);
  let article = null;
  let lastError;

  // Un fallo de una Wikipedia no impide probar la otra.
  for (const baseUrl of [WIKIPEDIA_ES, WIKIPEDIA_EN]) {
    try {
      article = await buscarEnIdioma(baseUrl, termino);
      if (article) break;
    } catch (error) {
      lastError = error;
    }
  }

  if (!article && lastError) throw lastError;
  if (!article) {
    const error = new Error(`No encontramos un artículo para “${topic}” en Wikipedia en español ni en inglés. Prueba con una frase relacionada o revisa los conceptos sugeridos.`);
    error.status = 404;
    throw error;
  }

  return { ...article, searchedTopic: topic };
}

module.exports = { getSummary };
