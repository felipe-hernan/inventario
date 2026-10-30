/*
 * Piezas compartidas por todas las pantallas, usando componentes de Bootstrap 5.
 * Cada pantalla (js/vistas/*.js) registra en App sus vistas, acciones y eventos.
 */
const App = { vistas: {}, acciones: {}, entradas: {}, cambios: {}, envios: {}, estado: {} };

const $ = (sel, raiz = document) => raiz.querySelector(sel);
const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = v => (v === '' || v == null ? NaN : Number(v));
const enteroONulo = v => (String(v ?? '').trim() === '' ? null : Number(v));

// Sesión del usuario. En la demo se guarda en el navegador; con servidor sería una cookie de autenticación.
const Sesion = {
  CLAVE: 'sistema-stock-sesion',
  _memoria: null,
  usuario() {
    let id = null;
    try { id = Number(localStorage.getItem(Sesion.CLAVE)) || null; } catch (e) { id = Sesion._memoria; }
    const u = id ? DB.buscar('usuarios', id) : null;
    return u && u.activo ? u : null;
  },
  iniciar(u) {
    Sesion._memoria = u.id;
    try { localStorage.setItem(Sesion.CLAVE, String(u.id)); } catch (e) { /* sin localStorage */ }
  },
  cerrar() {
    Sesion._memoria = null;
    try { localStorage.removeItem(Sesion.CLAVE); } catch (e) { /* sin localStorage */ }
  }
};

// Fragmentos de HTML repetidos (equivalentes a los partials de Razor).
const H = {
  campo(etiqueta, control, ayuda = '', clase = '') {
    return `<label class="d-block mb-3 ${clase}"><span class="form-label d-block fw-semibold">${etiqueta}</span>${control}${ayuda ? `<span class="form-text d-block">${ayuda}</span>` : ''}</label>`;
  },
  check(atributos, texto, ayuda = '', tipo = 'checkbox', clase = '') {
    return `<label class="form-check ${clase}"><input class="form-check-input" type="${tipo}" ${atributos}>
      <span class="form-check-label">${texto}${ayuda ? `<span class="form-text d-block mt-0">${ayuda}</span>` : ''}</span></label>`;
  },
  error(id = 'dlg-error') {
    return `<div class="alert alert-danger py-2 small" id="${id}" role="alert"></div>`;
  },
  cifra(etiqueta, valor, clase = '') {
    return `<div class="col"><div class="text-body-secondary small">${etiqueta}</div><div class="fs-3 fw-bold ${clase}">${valor}</div></div>`;
  },
  vacio(texto) {
    return `<p class="text-body-secondary fst-italic mb-0">${texto}</p>`;
  },
  tituloPagina(texto, botones = '') {
    return `<div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-4">
      <h1 class="h3 mb-0">${texto}</h1>${botones ? `<div class="d-flex flex-wrap gap-2">${botones}</div>` : ''}</div>`;
  }
};

const UI = {
  esTactil: window.matchMedia('(pointer: coarse)').matches,
  usuario: null,

  vista() { return $('#vista'); },
  esAdmin() { return !!UI.usuario && UI.usuario.rol === 'admin'; },
  puedeVer(vista) { return !!UI.usuario && PERMISOS[UI.usuario.rol].includes(vista); },
  vistaActual() {
    const v = location.hash.slice(1);
    return App.vistas[v] ? v : 'inicio';
  },

  render() {
    UI.usuario = Sesion.usuario();
    Logica.usuarioActualId = UI.usuario ? UI.usuario.id : null;
    document.body.classList.toggle('sin-sesion', !UI.usuario);
    if (!UI.usuario) { App.vistas.login(); return; }

    let v = UI.vistaActual();
    if (!UI.puedeVer(v)) { v = 'inicio'; history.replaceState(null, '', '#inicio'); }
    $$('.menu [data-vista]').forEach(a => {
      a.hidden = !UI.puedeVer(a.dataset.vista);
      a.classList.toggle('active', a.dataset.vista === v);
      if (a.dataset.vista === v) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    UI.renderUsuario();
    UI.renderEstadoCaja();
    UI.actualizarInsignia();
    App.vistas[v]();
  },

  navegar(v) {
    if (location.hash.slice(1) === v) UI.render();
    else location.hash = v;
  },

  enfocar(el, seleccionar = false) {
    if (!el || UI.esTactil) return;
    el.focus();
    if (seleccionar && el.select) el.select();
  },

  avisar(texto) {
    const el = $('#aviso-flotante');
    $('.toast-body', el).textContent = texto;
    bootstrap.Toast.getOrCreateInstance(el, { delay: 3500 }).show();
  },

  fechaLarga(d) {
    const t = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }).format(d);
    return t.charAt(0).toUpperCase() + t.slice(1);
  },

  // ---------- Modal único ----------
  // contenido: { titulo, subtitulo, cuerpo, pie, enviar (nombre del formulario), atributos }
  abrirDialogo({ titulo, subtitulo = '', cuerpo, pie = '', enviar = null, atributos = '' }, { ancho = 'normal' } = {}) {
    const modal = $('#dlg');
    const dialogo = $('.modal-dialog', modal);
    dialogo.className = `modal-dialog modal-dialog-centered modal-dialog-scrollable ${{ chico: '', normal: 'modal-lg', grande: 'modal-xl' }[ancho]}`;
    const etiqueta = enviar ? 'form' : 'div';
    $('.modal-content', modal).innerHTML = `
      <${etiqueta} class="modal-form" ${enviar ? `data-enviar="${enviar}" novalidate` : ''} ${atributos}>
        <div class="modal-header">
          <div><h2 class="modal-title h5" id="dlg-titulo">${titulo}</h2>${subtitulo ? `<div class="small text-body-secondary">${subtitulo}</div>` : ''}</div>
          <button type="button" class="btn-close no-imprimir" data-bs-dismiss="modal" aria-label="Cerrar"></button>
        </div>
        <div class="modal-body">${cuerpo}</div>
        ${pie ? `<div class="modal-footer no-imprimir">${pie}</div>` : ''}
      </${etiqueta}>`;
    const instancia = bootstrap.Modal.getOrCreateInstance(modal);
    if (modal.classList.contains('show')) UI._enfocarModal();
    else instancia.show();
  },
  _enfocarModal() {
    const modal = $('#dlg');
    UI.enfocar(modal.querySelector('[data-foco]') || modal.querySelector('.modal-body input:not([type=hidden]):not([disabled]):not([type=checkbox]):not([type=radio]), .modal-body select'));
  },
  cerrarDialogo() {
    const instancia = bootstrap.Modal.getInstance($('#dlg'));
    if (instancia) instancia.hide();
  },
  pie(textoOk, { izquierda = '', cancelar = 'Cancelar', claseOk = 'btn-primary' } = {}) {
    return `${izquierda ? `<div class="me-auto">${izquierda}</div>` : ''}
      <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">${cancelar}</button>
      <button type="submit" class="btn ${claseOk}">${textoOk}</button>`;
  },

  // ---------- Piezas repetidas ----------
  etiquetaStock(p) {
    if (!p.activo) return '<span class="badge rounded-pill text-bg-secondary">De baja</span>';
    if (!p.controla_stock) return '<span class="badge rounded-pill text-bg-light border">Sin control</span>';
    const stock = Logica.stockVigente(p.id);
    if (stock === 0) return '<span class="badge rounded-pill text-bg-danger">Sin stock</span>';
    if (stock <= p.stock_minimo) return '<span class="badge rounded-pill text-bg-warning">Poco stock</span>';
    return '<span class="badge rounded-pill text-bg-success">Normal</span>';
  },

  textoStock(p, restar = 0) {
    if (!p.controla_stock) return 'Sin control de stock';
    const stock = Logica.stockVigente(p.id) - restar;
    return stock > 0 ? `Hay ${Formato.cantidad(p, stock)}` : 'Sin stock';
  },

  listaProductos(productos, accion, { restarCarrito = null, deshabilitarSinStock = false } = {}) {
    if (!productos.length) return H.vacio('No hay productos que coincidan. Probá con otra palabra o con el código.');
    return `<div class="list-group">${productos.slice(0, 8).map(p => {
      const restar = restarCarrito ? restarCarrito(p.id) : 0;
      const sinStock = p.controla_stock && Logica.stockVigente(p.id) - restar <= 0;
      return `<button type="button" class="list-group-item list-group-item-action resultado" data-accion="${accion}" data-id="${p.id}" ${deshabilitarSinStock && sinStock ? 'disabled' : ''}>
        <div class="d-flex justify-content-between align-items-center gap-2">
          <span class="fw-semibold">${esc(p.nombre)}</span>
          <span class="badge rounded-pill ${sinStock ? 'text-bg-danger' : 'text-bg-light border'}">${UI.textoStock(p, restar)}</span>
        </div>
        <div class="small text-body-secondary">${Formato.plata(p.precio_venta)} ${Formato.porUnidad(p)}</div>
      </button>`;
    }).join('')}</div>`;
  },

  opcionesCategorias(seleccionada, { conTodas = false, conNueva = false } = {}) {
    return `${conTodas ? '<option value="">Todas las categorías</option>' : '<option value="">Sin categoría</option>'}
      ${Logica.categorias().map(c => `<option value="${c.id}" ${c.id === seleccionada ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')}
      ${conNueva ? '<option value="__nueva">+ Nueva categoría…</option>' : ''}`;
  },

  renderUsuario() {
    const u = UI.usuario;
    $('#usuario-actual').innerHTML = `
      <div class="d-flex align-items-center gap-2 border-top border-secondary-subtle pt-3">
        <button type="button" class="btn btn-link text-reset text-decoration-none d-flex align-items-center gap-2 p-1 flex-grow-1 text-start overflow-hidden" data-accion="mi-cuenta" title="Mi cuenta">
          <span class="avatar" aria-hidden="true">${esc(u.nombre.charAt(0).toUpperCase())}</span>
          <span class="lh-sm text-truncate"><span class="d-block fw-semibold text-truncate">${esc(u.nombre)}</span><span class="small opacity-75">${ROLES[u.rol]}</span></span>
        </button>
        <button type="button" class="btn btn-sm btn-outline-light text-nowrap" data-accion="sesion-salir"><i class="bi bi-box-arrow-right"></i> Salir</button>
      </div>`;
    $('.nota-demo').hidden = !UI.esAdmin();
  },

  renderEstadoCaja() {
    const caja = Logica.cajaAbierta();
    $('#estado-caja').innerHTML = caja
      ? `<a href="#caja" class="estado-caja abierta"><span class="punto"></span>Caja abierta desde las ${Formato.hora(caja.fecha_apertura)}</a>`
      : '<a href="#caja" class="estado-caja cerrada"><span class="punto"></span>Caja cerrada</a>';
  },

  // ---------- Notificaciones (dropdown de Bootstrap) ----------
  actualizarInsignia() {
    const total = Logica.notificaciones().length;
    const nuevas = Logica.notificacionesNuevas().length;
    $$('.boton-notif').forEach(boton => {
      const insignia = $('.insignia', boton);
      insignia.hidden = nuevas === 0;
      insignia.textContent = nuevas > 9 ? '9+' : String(nuevas);
      boton.setAttribute('aria-label', `Notificaciones: ${total}${nuevas ? `, ${nuevas} ${nuevas === 1 ? 'nueva' : 'nuevas'}` : ''}`);
    });
  },

  renderNotificaciones(menu) {
    const lista = Logica.notificaciones();
    const nuevas = new Set(Logica.notificacionesNuevas(lista).map(n => n.clave));
    const tono = { caja: 'warning', vencido: 'danger', 'por-vencer': 'warning', stock: 'primary', limite: 'info' };
    const icono = { caja: 'cash-stack', vencido: 'x-octagon', 'por-vencer': 'hourglass-split', stock: 'box-seam', limite: 'person-exclamation' };
    menu.setAttribute('data-bs-theme', document.documentElement.dataset.bsTheme);
    menu.innerHTML = `
      <div class="d-flex justify-content-between align-items-baseline px-3 py-2 border-bottom">
        <h2 class="h6 mb-0">Notificaciones</h2>
        <span class="small text-body-secondary">${lista.length ? `${lista.length} ${lista.length === 1 ? 'aviso' : 'avisos'}` : ''}</span>
      </div>
      ${lista.length ? `<div class="list-group list-group-flush notif-lista">${lista.map(n => `
        <button type="button" class="list-group-item list-group-item-action d-flex gap-3 py-2 notif" data-accion="notif-ir"
          data-tipo="${n.tipo}" data-producto="${n.productoId || ''}" data-cliente="${n.clienteId || ''}">
          <i class="bi bi-${icono[n.tipo]} text-${tono[n.tipo]} fs-5 mt-1"></i>
          <span class="flex-grow-1 min-w-0">
            <span class="d-flex align-items-center gap-2 small fw-bold text-uppercase text-${tono[n.tipo]}">${n.etiqueta}${nuevas.has(n.clave) ? '<span class="badge rounded-pill text-bg-warning">Nueva</span>' : ''}</span>
            <span class="d-block fw-semibold">${esc(n.titulo)}</span>
            <span class="d-block small text-body-secondary">${esc(n.detalle)}</span>
          </span>
        </button>`).join('')}</div>`
      : '<p class="text-center text-body-secondary py-4 mb-0"><i class="bi bi-check2-circle fs-3 d-block mb-1"></i>Todo en orden. No hay avisos.</p>'}`;
    Logica.marcarNotificacionesVistas(lista);
    UI.actualizarInsignia();
  },

  cerrarNotificaciones() {
    $$('.boton-notif').forEach(b => { const d = bootstrap.Dropdown.getInstance(b); if (d) d.hide(); });
  },

  abrirCajaDialogo() {
    const anterior = Logica.ultimaCajaCerrada();
    UI.abrirDialogo({
      titulo: 'Abrir caja', subtitulo: 'Contá el efectivo con el que arrancás el turno.', enviar: 'caja-abrir',
      cuerpo: `${H.error()}
        ${H.campo('Efectivo en la caja al empezar', `<div class="input-group"><span class="input-group-text">$</span>
          <input class="form-control form-control-lg" name="inicial" type="number" min="0" step="1" inputmode="numeric" value="${anterior ? anterior.efectivo_contado : 0}" data-foco></div>`,
          anterior ? `En el último cierre se contaron ${Formato.plata(anterior.efectivo_contado)}.` : '')}`,
      pie: UI.pie('Abrir caja')
    }, { ancho: 'chico' });
  }
};

App.acciones['caja-abrir-dialogo'] = () => UI.abrirCajaDialogo();
App.envios['caja-abrir'] = form => {
  try {
    Logica.abrirCaja(num(form.elements.inicial.value));
    UI.cerrarDialogo();
    UI.avisar('Caja abierta');
    UI.render();
  } catch (e) {
    $('#dlg-error').textContent = e.message;
  }
};

// Cada notificación lleva a la pantalla donde se resuelve.
App.acciones['notif-ir'] = el => {
  UI.cerrarNotificaciones();
  const { tipo, producto, cliente } = el.dataset;
  if (tipo === 'caja') return UI.navegar('caja');
  if (tipo === 'limite') return App.acciones['cliente-cuenta']({ dataset: { id: cliente } });
  if (tipo === 'stock') {
    App.estado.reponerId = +producto;
    App.estado.mercTab = 'ingresar';
    return UI.navegar('mercaderia');
  }
  App.estado.mercTab = 'inventario';
  App.estado.inventarioBusqueda = DB.buscar('productos', +producto).nombre;
  UI.navegar('mercaderia');
};
