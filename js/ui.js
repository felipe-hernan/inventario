/*
 * Piezas compartidas por todas las pantallas.
 * Cada pantalla (js/vistas/*.js) registra en App sus vistas, acciones y eventos.
 */
const App = {
  vistas: {},     // nombre -> función que dibuja la pantalla
  acciones: {},   // data-accion="..." (clic) y data-enter="..." (Enter)
  entradas: {},   // data-input="..." (mientras se escribe)
  cambios: {},    // data-cambio="..." (al cambiar un campo)
  envios: {},     // data-enviar="..." (formularios)
  estado: {}      // estado de cada pantalla
};

const $ = (sel, raiz = document) => raiz.querySelector(sel);
const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = v => (v === '' || v == null ? NaN : Number(v));
const enteroONulo = v => (String(v ?? '').trim() === '' ? null : Number(v));

const UI = {
  esTactil: window.matchMedia('(pointer: coarse)').matches,

  vista() { return $('#vista'); },

  vistaActual() {
    const v = location.hash.slice(1);
    return App.vistas[v] ? v : 'inicio';
  },

  render() {
    const v = UI.vistaActual();
    $$('[data-vista]').forEach(a => {
      if (a.dataset.vista === v) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
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

  // ---------- Mensajes ----------
  _temporizador: null,
  avisar(texto) {
    const el = $('#aviso-flotante');
    el.textContent = texto;
    el.classList.add('visible');
    clearTimeout(UI._temporizador);
    UI._temporizador = setTimeout(() => el.classList.remove('visible'), 3500);
  },

  fechaLarga(d) {
    const t = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }).format(d);
    return t.charAt(0).toUpperCase() + t.slice(1);
  },

  // ---------- Diálogo único ----------
  abrirDialogo(html, { ancho = 'normal' } = {}) {
    const dlg = $('#dlg');
    dlg.className = `dlg-${ancho}`;
    dlg.innerHTML = html;
    if (!dlg.open) dlg.showModal();
    UI.enfocar(dlg.querySelector('[data-foco]') || dlg.querySelector('input:not([type=hidden]):not([disabled]), select, textarea'));
  },
  cerrarDialogo() {
    const dlg = $('#dlg');
    if (dlg.open) dlg.close();
  },
  cabecera(titulo, subtitulo = '') {
    return `<div class="dlg-cabecera">
      <div><h2 id="dlg-titulo">${titulo}</h2>${subtitulo ? `<p class="ayuda">${subtitulo}</p>` : ''}</div>
      <button type="button" class="boton-icono no-imprimir" data-accion="dlg-cerrar" aria-label="Cerrar">×</button>
    </div>`;
  },

  // ---------- Piezas repetidas ----------
  etiquetaStock(p) {
    if (!p.activo) return '<span class="etiqueta etiqueta-gris">De baja</span>';
    if (!p.controla_stock) return '<span class="etiqueta etiqueta-gris">Sin control</span>';
    const stock = Logica.stockVigente(p.id);
    if (stock === 0) return '<span class="etiqueta etiqueta-rojo">Sin stock</span>';
    if (stock <= p.stock_minimo) return '<span class="etiqueta etiqueta-ambar">Poco stock</span>';
    return '<span class="etiqueta etiqueta-verde">Normal</span>';
  },

  textoStock(p, restar = 0) {
    if (!p.controla_stock) return 'Sin control de stock';
    const stock = Logica.stockVigente(p.id) - restar;
    return stock > 0 ? `Hay ${Formato.cantidad(p, stock)}` : 'Sin stock';
  },

  listaProductos(productos, accion, { restarCarrito = null, deshabilitarSinStock = false } = {}) {
    if (!productos.length) return '<p class="vacio">No hay productos que coincidan. Probá con otra palabra o con el código.</p>';
    return `<ul class="resultados">${productos.slice(0, 8).map(p => {
      const restar = restarCarrito ? restarCarrito(p.id) : 0;
      const sinStock = p.controla_stock && Logica.stockVigente(p.id) - restar <= 0;
      return `<li><button type="button" class="resultado" data-accion="${accion}" data-id="${p.id}" ${deshabilitarSinStock && sinStock ? 'disabled' : ''}>
        <span class="resultado-nombre">${esc(p.nombre)}</span>
        <span class="resultado-dato">${Formato.plata(p.precio_venta)} ${Formato.porUnidad(p)}</span>
        <span class="resultado-dato ${sinStock ? 'texto-rojo' : ''}">${UI.textoStock(p, restar)}</span>
      </button></li>`;
    }).join('')}</ul>`;
  },

  opcionesCategorias(seleccionada, { conTodas = false, conNueva = false } = {}) {
    return `${conTodas ? '<option value="">Todas las categorías</option>' : '<option value="">Sin categoría</option>'}
      ${Logica.categorias().map(c => `<option value="${c.id}" ${c.id === seleccionada ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')}
      ${conNueva ? '<option value="__nueva">+ Nueva categoría…</option>' : ''}`;
  },

  // Barra lateral: muestra si la caja está abierta.
  renderEstadoCaja() {
    const el = $('#estado-caja');
    if (!el) return;
    const caja = Logica.cajaAbierta();
    el.innerHTML = caja
      ? `<a href="#caja" class="estado-caja abierta"><span class="punto"></span>Caja abierta desde las ${Formato.hora(caja.fecha_apertura)}</a>`
      : '<a href="#caja" class="estado-caja cerrada"><span class="punto"></span>Caja cerrada</a>';
  },

  // ---------- Notificaciones ----------
  actualizarInsignia() {
    const boton = $('.boton-notif');
    if (!boton) return;
    const total = Logica.notificaciones().length;
    const nuevas = Logica.notificacionesNuevas().length;
    const insignia = $('.insignia', boton);
    insignia.hidden = nuevas === 0;
    insignia.textContent = nuevas > 9 ? '9+' : String(nuevas);
    boton.setAttribute('aria-label', `Notificaciones: ${total}${nuevas ? `, ${nuevas} ${nuevas === 1 ? 'nueva' : 'nuevas'}` : ''}`);
  },

  panelNotifAbierto() {
    return !$('#panel-notif').hidden;
  },

  abrirNotificaciones(abrir) {
    const panel = $('#panel-notif');
    const boton = $('.boton-notif');
    if (!abrir) {
      panel.hidden = true;
      boton.setAttribute('aria-expanded', 'false');
      return;
    }
    const lista = Logica.notificaciones();
    const nuevas = new Set(Logica.notificacionesNuevas(lista).map(n => n.clave));
    panel.innerHTML = `
      <div class="notif-cabecera">
        <h2>Notificaciones</h2>
        <span class="sub-inline">${lista.length ? `${lista.length} ${lista.length === 1 ? 'aviso' : 'avisos'}` : ''}</span>
      </div>
      ${lista.length ? `<ul class="notif-lista">${lista.map(n => `<li>
        <button type="button" class="notif notif-${n.tipo} ${nuevas.has(n.clave) ? 'nueva' : ''}" data-accion="notif-ir"
          data-tipo="${n.tipo}" data-producto="${n.productoId || ''}" data-cliente="${n.clienteId || ''}">
          <span class="notif-etiqueta">${n.etiqueta}${nuevas.has(n.clave) ? ' <span class="notif-punto" aria-label="nueva"></span>' : ''}</span>
          <span class="notif-titulo">${esc(n.titulo)}</span>
          <span class="notif-detalle">${esc(n.detalle)}</span>
        </button>
      </li>`).join('')}</ul>`
      : '<p class="notif-vacio">Todo en orden. No hay avisos.</p>'}`;
    panel.hidden = false;
    boton.setAttribute('aria-expanded', 'true');
    Logica.marcarNotificacionesVistas(lista);
    UI.actualizarInsignia();
  },

  // Formulario de apertura de caja (se usa desde Inicio, Vender y Caja).
  abrirCajaDialogo() {
    const anterior = Logica.ultimaCajaCerrada();
    const sugerido = anterior ? anterior.efectivo_contado : 0;
    UI.abrirDialogo(`
      <form class="dlg-cuerpo" data-enviar="caja-abrir" novalidate>
        ${UI.cabecera('Abrir caja', 'Contá el efectivo con el que arrancás el turno.')}
        <p class="error" id="dlg-error" role="alert"></p>
        <label class="campo">Efectivo en la caja al empezar
          <input name="inicial" type="number" min="0" step="1" inputmode="numeric" value="${sugerido}" data-foco>
          ${anterior ? `<span class="ayuda">En el último cierre se contaron ${Formato.plata(anterior.efectivo_contado)}.</span>` : ''}
        </label>
        <div class="dlg-pie">
          <span class="espacio"></span>
          <button type="button" class="boton boton-sec" data-accion="dlg-cerrar">Cancelar</button>
          <button type="submit" class="boton">Abrir caja</button>
        </div>
      </form>`, { ancho: 'chico' });
  }
};

App.acciones['dlg-cerrar'] = () => UI.cerrarDialogo();

// Cada notificación lleva a la pantalla donde se resuelve.
App.acciones['notif-ir'] = el => {
  UI.abrirNotificaciones(false);
  const { tipo, producto, cliente } = el.dataset;
  if (tipo === 'caja') return UI.navegar('caja');
  if (tipo === 'limite') return App.acciones['cliente-cuenta']({ dataset: { id: cliente } });
  if (tipo === 'stock') {
    App.estado.reponerId = +producto;
    App.estado.mercTab = 'ingresar';
    return UI.navegar('mercaderia');
  }
  // Vencidos y por vencer: inventario filtrado por ese producto, desde donde se ajusta.
  App.estado.mercTab = 'inventario';
  App.estado.inventarioBusqueda = DB.buscar('productos', +producto).nombre;
  UI.navegar('mercaderia');
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
