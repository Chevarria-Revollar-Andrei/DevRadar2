import React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, ArrowDownRight, ArrowUpRight, BookOpen, Bookmark, CheckCircle2, Code2, ExternalLink, Flame, Github, HelpCircle, Layers3, Lightbulb, Menu, Newspaper, Search, Sparkles, Star, Terminal, X, RefreshCw, Filter, Clock3, TrendingUp, ChevronDown, Copy, Download, Compass, Network, LogIn, LogOut, UserRound } from 'lucide-react';
import { api } from './servicios/clienteApis';
import SectionTitle from './componentes/TituloSeccion';
import RepoCard from './componentes/TarjetaRepositorio';
import Loading from './componentes/Cargando';
import './estilos/estilos.css';

// La búsqueda inicia vacía: las noticias iniciales deben ser recientes y generales.
const initialQuery = '';
const storageKey = 'devradar-favorites-v1';

// Componente principal: coordina las búsquedas, estados de carga y vistas del panel.
export default function App() {
  // query es lo que el usuario escribe; submittedQuery es el último término enviado.
  const [query, setQuery] = useState(initialQuery);
  const searchInputRef = useRef(null);
  const [submittedQuery, setSubmittedQuery] = useState(initialQuery);
  const [language, setLanguage] = useState('');
  const [sort, setSort] = useState('stars');
  const [repos, setRepos] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [stories, setStories] = useState([]);
  const [wiki, setWiki] = useState(null);
  const [favorites, setFavorites] = useState(() => {
    try { return JSON.parse(localStorage.getItem(storageKey) || '[]'); } catch { return []; }
  });
  const [loading, setLoading] = useState({ repos: true, questions: true, stories: true, wiki: true });
  const [errors, setErrors] = useState({});
  const [activeView, setActiveView] = useState('overview');
  const [mobileMenu, setMobileMenu] = useState(false);
  const [apiOnline, setApiOnline] = useState(false);
  const [notice, setNotice] = useState('');
  const [pages, setPages] = useState({ repos: 1, questions: 1, stories: 1 });
  const [loadingMore, setLoadingMore] = useState({});
  const [unansweredOnly, setUnansweredOnly] = useState(false);
  const [minNewsScore, setMinNewsScore] = useState('0');
  const [briefingOpen, setBriefingOpen] = useState(false);
  const [briefingText, setBriefingText] = useState('');
  const [user, setUser] = useState(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState('login');
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState('');
  const [searchHistory, setSearchHistory] = useState([]);
  const [libraryItems, setLibraryItems] = useState([]);

  useEffect(() => { localStorage.setItem(storageKey, JSON.stringify(favorites)); }, [favorites]);
  useEffect(() => { api.health().then(() => setApiOnline(true)).catch(() => setApiOnline(false)); }, []);

  // Recupera la sesión existente y los favoritos asociados a la cuenta.
  useEffect(() => {
    api.auth.me().then(async (result) => {
      if (!result.user) return;
      setUser(result.user);
      const [saved, history] = await Promise.all([api.auth.saved(), api.auth.history()]);
      const repoItems = saved.filter((item) => item.item_type === 'repository').map((item) => item.payload);
      setFavorites(repoItems);
      setSearchHistory(history || []);
      setLibraryItems(saved.filter((item) => item.item_type === 'research'));
    }).catch(() => {});
  }, []);

  // Al volver del inicio de sesión con GitHub, refresca el perfil y los datos guardados.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('auth') === 'success') {
      window.history.replaceState({}, '', window.location.pathname);
      api.auth.me().then(async (result) => {
        setUser(result.user);
        const [saved, history] = await Promise.all([api.auth.saved(), api.auth.history()]);
        setFavorites(saved.filter((item) => item.item_type === 'repository').map((item) => item.payload));
        setSearchHistory(history || []);
        setLibraryItems(saved.filter((item) => item.item_type === 'research'));
        setNotice('Sesión iniciada con GitHub.');
      }).catch((error) => setNotice(error.message));
    } else if (params.get('auth') === 'error') {
      window.history.replaceState({}, '', window.location.pathname);
      setNotice('No se pudo completar el acceso con GitHub. Inténtalo nuevamente.');
    }
  }, []);

  // Atajos de teclado: Ctrl/Cmd + K o / enfoca la búsqueda; Escape la limpia.
  useEffect(() => {
    const handleShortcut = (event) => {
      const target = event.target;
      const typing = target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchInputRef.current?.focus();
      } else if (event.key === '/' && !typing) {
        event.preventDefault();
        searchInputRef.current?.focus();
      } else if (event.key === 'Escape' && document.activeElement === searchInputRef.current) {
        setQuery('');
        searchInputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);

  // Consulta repositorios con los filtros elegidos y controla sus estados de carga/error.
  const loadRepos = useCallback(async (q = submittedQuery, lang = language, sortBy = sort) => {
    setLoading((old) => ({ ...old, repos: true })); setErrors((old) => ({ ...old, repos: '' }));
    try { setRepos(await api.github(q, lang, sortBy, 1)); setPages((old) => ({ ...old, repos: 1 })); }
    catch (e) { setErrors((old) => ({ ...old, repos: e.message })); setRepos([]); }
    finally { setLoading((old) => ({ ...old, repos: false })); }
  }, [submittedQuery, language, sort]);

  // Consulta las cuatro fuentes de datos. Las noticias reciben el término solo si existe.
  const loadEverything = useCallback(async (q) => {
    setLoading({ repos: true, questions: true, stories: true, wiki: true });
    setErrors({});
    setPages({ repos: 1, questions: 1, stories: 1 });
    const jobs = [
      ['repos', api.github(q || 'react', language, sort, 1), setRepos],
      ['questions', api.stackoverflow(q || 'javascript', 1), setQuestions],
      ['stories', api.hackernews(q, 1), setStories],
      ['wiki', api.wiki(q || 'software development'), setWiki]
    ];
    await Promise.all(jobs.map(async ([key, promise, setter]) => {
      try { setter(await promise); }
      catch (e) { setErrors((old) => ({ ...old, [key]: e.message })); if (key === 'wiki') setWiki(null); }
      finally { setLoading((old) => ({ ...old, [key]: false })); }
    }));
  }, [language, sort]);

  // Carga la siguiente página sin borrar los resultados ya visibles.
  const loadMore = async (key) => {
    if (loadingMore[key] || loading[key]) return;
    const nextPage = pages[key] + 1;
    setLoadingMore((old) => ({ ...old, [key]: true }));
    setErrors((old) => ({ ...old, [key]: '' }));
    try {
      let incoming = [];
      if (key === 'repos') incoming = await api.github(submittedQuery || 'react', language, sort, nextPage);
      if (key === 'questions') incoming = await api.stackoverflow(submittedQuery || 'javascript', nextPage);
      if (key === 'stories') incoming = await api.hackernews(submittedQuery, nextPage);
      const setter = key === 'repos' ? setRepos : key === 'questions' ? setQuestions : setStories;
      setter((current) => {
        const known = new Set(current.map((item) => item.id));
        return [...current, ...incoming.filter((item) => !known.has(item.id))];
      });
      setPages((old) => ({ ...old, [key]: nextPage }));
    } catch (e) {
      setErrors((old) => ({ ...old, [key]: e.message }));
    } finally {
      setLoadingMore((old) => ({ ...old, [key]: false }));
    }
  };

  // Primera carga: recursos de ejemplo y noticias recientes, sin filtrar por un tema.
  useEffect(() => { loadEverything(initialQuery); }, []);

  // Ejecuta la búsqueda general desde la barra superior.
  const runSearch = (event) => {
    event?.preventDefault();
    const clean = query.trim();
    if (!clean) { setNotice('Escribe una tecnología o concepto para buscar.'); return; }
    setNotice(''); setSubmittedQuery(clean); setActiveView('overview'); loadEverything(clean);
    if (user) api.auth.addHistory(clean).then(() => api.auth.history()).then((result) => setSearchHistory(result.data || [])).catch(() => {});
  };

  // Permite lanzar búsquedas rápidas desde los temas sugeridos.
  const searchTopic = (topic) => {
    setQuery(topic);
    setNotice('');
    setSubmittedQuery(topic);
    setActiveView('overview');
    loadEverything(topic);
    if (user) api.auth.addHistory(topic).then(() => api.auth.history()).then((result) => setSearchHistory(result.data || [])).catch(() => {});
  };

  // Guarda o elimina un repositorio en favoritos del navegador.
  const toggleFavorite = async (repo) => {
    const exists = favorites.some((item) => item.id === repo.id);
    setFavorites((old) => exists ? old.filter((item) => item.id !== repo.id) : [...old, repo]);
    setNotice(exists ? 'Repositorio eliminado de favoritos.' : (user ? 'Repositorio guardado en tu cuenta.' : 'Repositorio guardado en este navegador.'));
    if (user) {
      try {
        if (exists) await api.auth.remove('repository', repo.id);
        else await api.auth.save({ type: 'repository', externalId: repo.id, title: repo.name, url: repo.url, payload: repo });
      } catch (error) { setNotice(`No se pudo sincronizar el favorito: ${error.message}`); }
    }
  };

  const submitAuth = async (formData) => {
    setAuthBusy(true); setAuthError('');
    try {
      const result = authMode === 'register' ? await api.auth.register(formData) : await api.auth.login(formData);
      setUser(result.user);
      const [saved, history] = await Promise.all([api.auth.saved(), api.auth.history()]);
      setFavorites(saved.filter((item) => item.item_type === 'repository').map((item) => item.payload));
      setSearchHistory(history || []);
      setLibraryItems(saved.filter((item) => item.item_type === 'research'));
      setAuthOpen(false);
      setNotice(`Bienvenido${result.user.name ? `, ${result.user.name}` : ''}. Tus datos se guardarán en tu cuenta.`);
    } catch (error) { setAuthError(error.message); }
    finally { setAuthBusy(false); }
  };

  const logout = async () => {
    try { await api.auth.logout(); } catch {}
    setUser(null); setFavorites([]); setSearchHistory([]); setLibraryItems([]);
    setNotice('Sesión cerrada.');
  };
  const isSaved = (repo) => favorites.some((item) => item.id === repo.id);
  const favoriteIds = useMemo(() => new Set(favorites.map((item) => item.id)), [favorites]);
  const shownRepos = activeView === 'favorites' ? favorites : repos;
  const shownQuestions = questions;
  const goTo = (view) => { setActiveView(view); setMobileMenu(false); };

  // Efecto de luz que sigue al cursor y una inclinación muy sutil en las tarjetas.
  // Se actualizan variables CSS directamente para evitar renderizados por cada movimiento.
  const handlePointerMove = (event) => {
    const shell = event.currentTarget;
    shell.style.setProperty('--cursor-x', `${event.clientX}px`);
    shell.style.setProperty('--cursor-y', `${event.clientY}px`);
    const card = event.target.closest('.repo-card, .stat-card, .concept-card');
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    card.style.setProperty('--spot-x', `${x * 100}%`);
    card.style.setProperty('--spot-y', `${y * 100}%`);
    card.style.setProperty('--tilt-x', `${(0.5 - y) * 3}deg`);
    card.style.setProperty('--tilt-y', `${(x - 0.5) * 3}deg`);
  };
  const clearPointerEffects = (event) => {
    event.currentTarget.querySelectorAll('.repo-card, .stat-card, .concept-card').forEach((card) => {
      card.style.setProperty('--tilt-x', '0deg');
      card.style.setProperty('--tilt-y', '0deg');
    });
  };

  // Genera una ficha de investigación usando los resultados reales de las cuatro APIs.
  const buildBriefing = () => {
    const tema = submittedQuery || 'Panorama tecnológico reciente';
    const topRepos = repos.slice(0, 3).map((item, index) => `${index + 1}. ${item.name} (${item.stars} estrellas) — ${item.url}`).join('\n') || 'Sin repositorios disponibles.';
    const topQuestions = questions.slice(0, 3).map((item, index) => `${index + 1}. ${decodeHtml(item.title)} (${item.answers} respuestas) — ${item.url}`).join('\n') || 'Sin preguntas disponibles.';
    const topStories = stories.slice(0, 3).map((item, index) => `${index + 1}. ${item.title} (${item.score} puntos) — ${item.url}`).join('\n') || 'Sin noticias disponibles.';
    const concepto = wiki ? `${wiki.title}\n${wiki.extract}\nArtículo: ${wiki.url}` : 'No se encontró un concepto de Wikipedia.';
    setBriefingText(`# Ficha de investigación DevRadar\n\nTema: ${tema}\nFecha: ${new Date().toLocaleDateString('es-PE')}\n\n## Concepto base\n${concepto}\n\n## Repositorios recomendados\n${topRepos}\n\n## Preguntas de la comunidad\n${topQuestions}\n\n## Noticias relacionadas\n${topStories}\n\n---\nGenerado con DevRadar a partir de GitHub, Stack Exchange, Hacker News y Wikipedia.`);
    setBriefingOpen(true);
  };
  const saveBriefing = async () => {
    if (!user) { setAuthMode('login'); setAuthOpen(true); setNotice('Inicia sesión para guardar tu ficha en tu cuenta.'); return; }
    try {
      await api.auth.save({ type: 'note', externalId: `briefing-${Date.now()}`, title: `Ficha: ${submittedQuery || 'Panorama tecnológico'}`, url: window.location.href, payload: { markdown: briefingText } });
      const saved = await api.auth.saved();
      setLibraryItems(saved.filter((item) => item.item_type === 'research'));
      setNotice('Ficha de investigación guardada en tu cuenta.');
    } catch (error) { setNotice(error.message); }
  };

  const copyBriefing = async () => {
    try {
      await navigator.clipboard.writeText(briefingText);
      setNotice('Ficha técnica copiada al portapapeles.');
    } catch {
      setNotice('No se pudo copiar automáticamente. Puedes seleccionar y copiar el texto de la ficha.');
    }
  };
  const downloadBriefing = () => {
    const blob = new Blob([briefingText], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `devradar-${(submittedQuery || 'panorama').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return <div className="app-shell" onMouseMove={handlePointerMove} onMouseLeave={clearPointerEffects}>
    <aside className={`sidebar ${mobileMenu ? 'sidebar-open' : ''}`}>
      <div className="brand"><div className="brand-icon"><RadarLogo /></div><div><strong>DevRadar</strong><span>DEVELOPER HUB</span></div><button className="close-menu" onClick={() => setMobileMenu(false)}><X size={18} /></button></div>
      <div className="workspace-label">WORKSPACE</div>
      <nav className="nav-list">
        <button className={`nav-item ${activeView === 'overview' ? 'active' : ''}`} onClick={() => goTo('overview')}><Layers3 size={18} />Vista general</button>
        <button className={`nav-item ${activeView === 'repositories' ? 'active' : ''}`} onClick={() => goTo('repositories')}><Github size={18} />Repositorios <span className="nav-count">{repos.length}</span></button>
        <button className={`nav-item ${activeView === 'questions' ? 'active' : ''}`} onClick={() => goTo('questions')}><HelpCircle size={18} />Preguntas técnicas</button>
        <button className={`nav-item ${activeView === 'news' ? 'active' : ''}`} onClick={() => goTo('news')}><Newspaper size={18} />Noticias tech</button>
        <button className={`nav-item ${activeView === 'favorites' ? 'active' : ''}`} onClick={() => goTo('favorites')}><Bookmark size={18} />Favoritos <span className="nav-count">{favorites.length}</span></button>
        <button className={`nav-item ${activeView === 'library' ? 'active' : ''}`} onClick={() => goTo('library')}><BookOpen size={18} />Mi biblioteca <span className="nav-count">{libraryItems.length}</span></button>
      </nav>
      <div className="sidebar-bottom"><div className="api-status"><span className={`status-dot ${apiOnline ? 'online' : ''}`} /><div><strong>Backend API</strong><small>{apiOnline ? 'Conectado' : 'Sin conexión'}</small></div></div><div className="sidebar-foot"><span>DevRadar v1.0</span><span>Prototipo académico</span></div></div>
    </aside>
    {mobileMenu && <button className="mobile-scrim" aria-label="Cerrar menú" onClick={() => setMobileMenu(false)} />}

    <main className="main-content">
      <header className="topbar"><button className="mobile-menu-button" onClick={() => setMobileMenu(true)}><Menu size={21} /></button><div className="breadcrumb">Workspace <span>/</span> <strong>{({ overview: 'Vista general', repositories: 'Repositorios', questions: 'Preguntas técnicas', news: 'Noticias tech', favorites: 'Favoritos', library: 'Mi biblioteca' })[activeView]}</strong></div><div className="topbar-right"><span className="live-label"><i /> APIs en vivo</span>{user ? <button className="account-chip" onClick={logout} title="Cerrar sesión">{user.avatar ? <img src={user.avatar} alt="" /> : <UserRound size={16} />}<span>{user.name}</span><LogOut size={14} /></button> : <button className="account-button" onClick={() => { setAuthMode('login'); setAuthOpen(true); }}><LogIn size={15} /> Iniciar sesión</button>}</div></header>
      <div className="page-wrap">
        <section className="welcome-row"><div><div className="eyebrow"><Sparkles size={14} /> TU CENTRO DE DESARROLLO</div><h1>{activeView === 'favorites' ? 'Tus recursos guardados' : activeView === 'repositories' ? 'Explora repositorios' : activeView === 'questions' ? 'Resuelve tus dudas' : activeView === 'news' ? 'Mantente al día' : activeView === 'library' ? 'Tu biblioteca personal' : 'Hola, developer'} <span className="wave">{activeView === 'overview' ? '✦' : ''}</span></h1><p className="welcome-subtitle">{activeView === 'favorites' ? 'Todo lo que guardaste, en un solo lugar.' : 'Descubre herramientas, respuestas y tendencias para construir mejores proyectos.'}</p></div><div className="date-chip"><span className="date-dot" /> Actualizado desde fuentes públicas</div></section>

        <form className="search-panel" onSubmit={runSearch}><div className="search-icon"><Search size={20} /></div><input ref={searchInputRef} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Busca una tecnología, lenguaje, concepto o noticias..." aria-label="Buscar tecnología" /><div className="search-divider" /><select value={language} onChange={(e) => { setLanguage(e.target.value); }} aria-label="Filtrar por lenguaje"><option value="">Todos los lenguajes</option><option>JavaScript</option><option>TypeScript</option><option>Python</option><option>Java</option><option>Go</option><option>Rust</option><option>PHP</option><option>C++</option></select><button type="submit" className="search-button"><Search size={16} /> Buscar</button></form>
        <div className="quick-searches"><span>Prueba con</span>{['React', 'Python', 'Árboles binarios', 'Inteligencia artificial', 'Ciberseguridad'].map((topic) => <button key={topic} type="button" className="quick-search-chip" onClick={() => searchTopic(topic)}>{topic}<ArrowUpRight size={12} /></button>)}<span className="keyboard-hint">Atajo: <kbd>Ctrl</kbd> + <kbd>K</kbd></span></div>
        {notice && <div className="notice" role="status"><CheckCircle2 size={16} />{notice}<button onClick={() => setNotice('')} aria-label="Cerrar aviso"><X size={14} /></button></div>}

        {/* VISTA GENERAL: métricas y resumen de todas las fuentes. */}
        {activeView === 'overview' && <>
          <section className="stats-grid">
            <StatCard icon={Github} label="Repositorios encontrados" value={loading.repos ? '…' : repos.length} note="GitHub REST API" tint="blue" />
            <StatCard icon={HelpCircle} label="Preguntas relacionadas" value={loading.questions ? '…' : questions.length} note="Stack Exchange API" tint="purple" />
            <StatCard icon={Flame} label="Noticias destacadas" value={loading.stories ? '…' : stories.length} note="Hacker News API" tint="orange" />
            <StatCard icon={Bookmark} label="Tus favoritos" value={favorites.length} note="Guardados en este dispositivo" tint="green" />
          </section>

          <section className="section-block"><SectionTitle icon={Github} title="Repositorios populares" subtitle={submittedQuery ? `Proyectos de código abierto relacionados con “${submittedQuery}”` : "Proyectos populares de código abierto"} action="Ver todos" onAction={() => goTo('repositories')} />
            {loading.repos ? <Loading /> : errors.repos ? <ErrorMessage message={errors.repos} onRetry={() => loadRepos()} /> : repos.length ? <div className="repo-grid">{repos.slice(0, 6).map((repo) => <RepoCard key={repo.id} repo={repo} saved={favoriteIds.has(repo.id)} onToggle={toggleFavorite} />)}</div> : <EmptyMessage text="No encontramos repositorios para esa búsqueda." />}{!loading.repos && repos.length > 6 && <button className="load-more-button compact-load" onClick={() => goTo('repositories')}>Explorar los {repos.length} repositorios <ArrowUpRight size={15} /></button>}
          </section>

          <div className="content-grid">
            <section className="section-block questions-block"><SectionTitle icon={HelpCircle} title="Preguntas de la comunidad" subtitle="Respuestas y soluciones de Stack Overflow" action="Ver preguntas" onAction={() => goTo('questions')} />
              {loading.questions ? <Loading /> : errors.questions ? <ErrorMessage message={errors.questions} onRetry={() => loadEverything(submittedQuery)} /> : <div className="question-list">{shownQuestions.slice(0, 5).map((item) => <QuestionRow key={item.id} item={item} />)}</div>}
            </section>
            <section className="section-block news-block"><SectionTitle icon={Newspaper} title="Radar tecnológico" subtitle={submittedQuery ? `Noticias relacionadas con “${submittedQuery}”` : 'Noticias tecnológicas recientes de Hacker News'} action="Ver noticias" onAction={() => goTo('news')} />
              {loading.stories ? <Loading /> : errors.stories ? <ErrorMessage message={errors.stories} onRetry={() => loadEverything(submittedQuery)} /> : <div className="news-list">{stories.slice(0, 5).map((item) => <NewsRow key={item.id} item={item} />)}</div>}
            </section>
          </div>
          <section className="section-block concept-section"><SectionTitle icon={Lightbulb} title="Concepto para explorar" subtitle="Un resumen rápido para aprender algo nuevo" />
            {loading.wiki ? <Loading /> : errors.wiki ? <ErrorMessage message={errors.wiki} onRetry={() => loadEverything(submittedQuery)} /> : wiki && <>
              <div className="concept-card">{wiki.image && <img src={wiki.image} alt="" className="concept-image" />}<div className="concept-copy"><span className="concept-label"><BookOpen size={14} /> WIKIPEDIA · {wiki.language === 'en' ? 'ARTÍCULO EN INGLÉS' : 'ESPAÑOL'}</span><h3>{wiki.title}</h3><p>{wiki.extract}</p><a href={wiki.url} target="_blank" rel="noreferrer" className="inline-link">Leer artículo completo <ArrowUpRight size={15} /></a></div></div>
              {wiki.related?.length > 0 && <div className="related-concepts"><div className="related-heading"><Network size={16} /><div><strong>Sigue explorando</strong><span>Conceptos relacionados encontrados en Wikipedia</span></div></div><div className="related-grid">{wiki.related.map((item) => <button key={item.pageId || item.url} type="button" onClick={() => searchTopic(item.title)} className="related-concept-card"><span>{item.title}</span><ArrowUpRight size={14} /><small>{item.extract?.slice(0, 115)}{item.extract?.length > 115 ? '…' : ''}<b>Buscar este concepto en DevRadar</b></small></button>)}</div></div>}
            </>}
          </section>
          <section className="research-kit section-block">
            <div className="research-kit-copy"><span className="eyebrow"><Compass size={14} /> HERRAMIENTA DE INVESTIGACIÓN</span><h2>Convierte los resultados en una ficha técnica</h2><p>Reúne el concepto de Wikipedia, repositorios, preguntas y noticias en un resumen que puedes copiar o descargar en Markdown para tus apuntes o trabajos.</p></div>
            <div className="research-kit-actions"><button className="search-button" type="button" onClick={buildBriefing}><Sparkles size={16} /> Crear ficha técnica</button></div>
            {briefingOpen && <div className="briefing-output"><div className="briefing-toolbar"><strong><BookOpen size={15} /> Ficha de investigación · {submittedQuery || 'Panorama tecnológico'}</strong><div><button type="button" className="soft-button" onClick={saveBriefing}><Bookmark size={14} /> Guardar en mi cuenta</button><button type="button" className="soft-button" onClick={copyBriefing}><Copy size={14} /> Copiar</button><button type="button" className="soft-button" onClick={downloadBriefing}><Download size={14} /> Descargar .md</button><button type="button" className="soft-button" onClick={() => setBriefingOpen(false)}><X size={14} /> Cerrar</button></div></div><pre>{briefingText}</pre></div>}
          </section>
        </>}

        {/* VISTA DE REPOSITORIOS: listado completo y filtros de ordenamiento. */}
        {activeView === 'repositories' && <section className="section-block page-section"><SectionTitle icon={Github} title="Repositorios de GitHub" subtitle={`${submittedQuery ? `Resultados para “${submittedQuery}”` : "Repositorios populares"} · Ordenados por ${sort === 'stars' ? 'estrellas' : sort === 'forks' ? 'forks' : 'actualización'}`} /><div className="toolbar"><span><strong>{repos.length}</strong> resultados cargados · GitHub Search API</span><div className="toolbar-actions"><label className="toolbar-select-label"><TrendingUp size={15} /><select value={sort} onChange={(e) => { setSort(e.target.value); loadRepos(submittedQuery, language, e.target.value); }}><option value="stars">Más estrellas</option><option value="forks">Más forks</option><option value="updated">Actualizados recientemente</option></select></label><button className="soft-button" onClick={() => loadRepos()}><RefreshCw size={14} /> Actualizar</button></div></div>{loading.repos ? <Loading /> : errors.repos ? <ErrorMessage message={errors.repos} onRetry={() => loadRepos()} /> : repos.length ? <><div className="repo-grid">{repos.map((repo) => <RepoCard key={repo.id} repo={repo} saved={favoriteIds.has(repo.id)} onToggle={toggleFavorite} />)}</div><LoadMoreButton onClick={() => loadMore('repos')} loading={loadingMore.repos} /></> : <EmptyMessage text="No encontramos repositorios. Prueba con otro término." />}</section>}

        {/* VISTA DE PREGUNTAS: resultados técnicos de Stack Overflow. */}
        {activeView === 'questions' && <section className="section-block page-section"><SectionTitle icon={HelpCircle} title="Preguntas de Stack Overflow" subtitle={submittedQuery ? `Dudas técnicas relacionadas con “${submittedQuery}”` : "Preguntas técnicas populares de la comunidad"} /><div className="toolbar"><span><strong>{questions.length}</strong> preguntas cargadas</span><label className="check-filter"><input type="checkbox" checked={unansweredOnly} onChange={(e) => setUnansweredOnly(e.target.checked)} /> Solo sin respuesta <Filter size={14} /></label></div>{loading.questions ? <Loading /> : errors.questions ? <ErrorMessage message={errors.questions} onRetry={() => loadEverything(submittedQuery)} /> : <><div className="question-list full-list">{(unansweredOnly ? questions.filter((item) => !item.answered) : questions).map((item) => <QuestionRow key={item.id} item={item} />)}</div><LoadMoreButton onClick={() => loadMore('questions')} loading={loadingMore.questions} /></>}</section>}

        {/* VISTA DE NOTICIAS: recientes por defecto o relacionadas con la búsqueda. */}
        {activeView === 'news' && <section className="section-block page-section"><SectionTitle icon={Newspaper} title="Noticias y tendencias tech" subtitle={submittedQuery ? `Noticias relacionadas con “${submittedQuery}”` : 'Noticias tecnológicas recientes de Hacker News'} /><div className="toolbar"><span><strong>{stories.length}</strong> noticias cargadas · Hacker News</span><label className="toolbar-select-label"><Flame size={15} /><select value={minNewsScore} onChange={(e) => setMinNewsScore(e.target.value)}><option value="0">Todos los puntajes</option><option value="10">10+ puntos</option><option value="25">25+ puntos</option><option value="50">50+ puntos</option></select></label></div>{loading.stories ? <Loading /> : errors.stories ? <ErrorMessage message={errors.stories} onRetry={() => loadEverything(submittedQuery)} /> : <><div className="news-list full-list">{stories.filter((item) => item.score >= Number(minNewsScore)).map((item) => <NewsRow key={item.id} item={item} />)}</div><LoadMoreButton onClick={() => loadMore('stories')} loading={loadingMore.stories} /></>}</section>}

        {/* VISTA DE FAVORITOS: repositorios guardados en localStorage. */}
        {activeView === 'library' && <section className="section-block page-section"><SectionTitle icon={BookOpen} title="Fichas de investigación guardadas" subtitle="Tus apuntes y resúmenes almacenados en tu cuenta de DevRadar." />{!user ? <div className="empty-favorites"><h3>Inicia sesión para consultar tu biblioteca</h3><button className="search-button" onClick={() => { setAuthMode('login'); setAuthOpen(true); }}>Iniciar sesión</button></div> : libraryItems.length ? <div className="library-list">{libraryItems.map((item) => <article className="library-card" key={item.id}><div><span className="eyebrow"><BookOpen size={12} /> FICHA GUARDADA</span><h3>{item.title}</h3><p>{item.created_at ? new Date(item.created_at).toLocaleString('es-PE') : 'Guardada en tu cuenta'}</p></div><details><summary>Ver contenido</summary><pre>{item.payload?.markdown || 'Esta ficha no contiene texto disponible.'}</pre></details></article>)}</div> : <EmptyMessage text="Todavía no guardaste fichas. Genera una ficha técnica y pulsa «Guardar en mi cuenta»." />}</section>}

        {activeView === 'favorites' && <section className="section-block page-section"><SectionTitle icon={Bookmark} title="Repositorios favoritos" subtitle="Tus repositorios favoritos, guardados localmente o sincronizados con tu cuenta." />{shownRepos.length ? <div className="repo-grid">{shownRepos.map((repo) => <RepoCard key={repo.id} repo={repo} saved onToggle={toggleFavorite} />)}</div> : <div className="empty-favorites"><div className="empty-icon"><Bookmark size={24} /></div><h3>Aún no guardaste favoritos</h3><p>Usa el icono de marcador en cualquier repositorio para guardarlo aquí.</p><button className="search-button" onClick={() => goTo('repositories')}>Explorar repositorios <ArrowUpRight size={16} /></button></div>}</section>}

        {authOpen && <AuthDialog mode={authMode} setMode={setAuthMode} onClose={() => { setAuthOpen(false); setAuthError(''); }} onSubmit={submitAuth} error={authError} busy={authBusy} githubUrl={api.auth.githubUrl} />}
      <footer className="footer"><div className="footer-brand"><div className="footer-logo"><Terminal size={16} /></div><strong>DevRadar</strong><span>Encuentra tu próxima idea.</span></div><div className="footer-note">Datos obtenidos de APIs públicas. Los resultados pueden variar según disponibilidad y límites de cada servicio.</div><div className="footer-copy">© 2026 DevRadar</div></footer>
      </div>
    </main>
  </div>;
}

// Tarjeta reutilizable para mostrar una métrica del panel principal.
function AuthDialog({ mode, setMode, onClose, onSubmit, error, busy, githubUrl }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const submit = (event) => { event.preventDefault(); onSubmit({ name, email, password }); };
  return <div className="auth-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-title">
      <button className="auth-close" onClick={onClose} aria-label="Cerrar"><X size={18} /></button>
      <div className="auth-mark"><RadarLogo /></div>
      <span className="eyebrow">TU ESPACIO DE DESARROLLO</span>
      <h2 id="auth-title">{mode === 'register' ? 'Crea tu cuenta' : 'Qué bueno verte de nuevo'}</h2>
      <p>Guarda repositorios, conserva tus búsquedas y accede a tu espacio desde cualquier dispositivo.</p>
      <a className="github-auth-button" href={githubUrl}><Github size={18} /> Continuar con GitHub</a>
      <div className="auth-separator"><span /> o con tu correo <span /></div>
      <form onSubmit={submit} className="auth-form">
        {mode === 'register' && <label>Nombre<input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tu nombre" required minLength={2} /></label>}
        <label>Correo electrónico<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tu@correo.com" required /></label>
        <label>Contraseña<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 8 caracteres" required minLength={8} /></label>
        {error && <div className="auth-error">{error}</div>}
        <button className="search-button auth-submit" disabled={busy}>{busy ? 'Procesando…' : mode === 'register' ? 'Crear cuenta' : 'Iniciar sesión'}</button>
      </form>
      <div className="auth-switch">{mode === 'register' ? '¿Ya tienes cuenta?' : '¿Todavía no tienes cuenta?'} <button onClick={() => setMode(mode === 'register' ? 'login' : 'register')}>{mode === 'register' ? 'Inicia sesión' : 'Regístrate'}</button></div>
      <small className="auth-privacy">Tus datos se almacenan en la base de datos de DevRadar. Nunca guardamos tu contraseña en texto plano.</small>
    </section>
  </div>;
}

function StatCard({ icon: Icon, label, value, note, tint }) {
  return <div className="stat-card"><div className={`stat-icon ${tint}`}><Icon size={19} /></div><div className="stat-label">{label}</div><div className="stat-value">{value}</div><div className="stat-note"><span className="note-dot" />{note}</div></div>;
}
// Fila de pregunta con votos, respuestas, etiquetas y enlace a Stack Overflow.
function QuestionRow({ item }) {
  return <a className="question-row" href={item.url} target="_blank" rel="noreferrer"><div className="question-metrics"><strong>{item.score}</strong><span>votos</span><strong className={item.answered ? 'answered' : ''}>{item.answers}</strong><span>respuestas</span></div><div className="question-content"><h3>{decodeHtml(item.title)}</h3><div className="tag-list">{item.tags.slice(0, 4).map((tag) => <span key={tag}>{tag}</span>)}</div></div><ExternalLink size={15} className="row-external" /></a>;
}
// Fila de noticia con puntaje, autor, comentarios y enlace a la publicación original.
function NewsRow({ item }) {
  const published = item.time ? new Date(item.time * 1000).toLocaleDateString('es-PE', { day: '2-digit', month: 'short' }) : 'Reciente';
  return <a className="news-row" href={item.url} target="_blank" rel="noreferrer"><div className="news-score"><ArrowUpRight size={15} /><strong>{item.score}</strong></div><div className="news-copy"><h3>{item.title}</h3><p>por {item.author} <span>·</span> {item.comments} comentarios <span>·</span> <Clock3 size={12} /> {published}</p></div><ExternalLink size={14} className="row-external" /></a>;
}
function LoadMoreButton({ onClick, loading }) {
  return <div className="load-more-wrap"><button className="load-more-button" onClick={onClick} disabled={loading}>{loading ? <><span className="button-spinner" /> Cargando resultados...</> : <>Cargar más resultados <ChevronDown size={16} /></>}</button><span>Los resultados adicionales se consultan directamente a la API.</span></div>;
}
// Componentes auxiliares para estados de error y resultados vacíos.
function ErrorMessage({ message, onRetry }) { return <div className="error-box"><p>{message}</p><button onClick={onRetry}>Intentar de nuevo</button><small>Comprueba que el backend esté ejecutándose y vuelve a intentar.</small></div>; }
function EmptyMessage({ text }) { return <div className="empty-message">{text}</div>; }
function decodeHtml(text) { const element = document.createElement('textarea'); element.innerHTML = text; return element.value; }
function RadarLogo() { return <svg viewBox="0 0 40 40" width="28" height="28" fill="none" aria-hidden="true"><circle cx="20" cy="20" r="14" stroke="currentColor" strokeWidth="1.7" opacity=".55"/><circle cx="20" cy="20" r="8" stroke="currentColor" strokeWidth="1.7" opacity=".75"/><path d="M20 20L31 9M20 20H6M20 20V34" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/><circle cx="20" cy="20" r="3" fill="currentColor"/><circle cx="31" cy="9" r="2.4" fill="#e5b45d"/></svg>; }
