/*
 * Interfaz de la demo. Arma cada pantalla y responde a lo que hace el usuario.
 * Toda regla de negocio vive en logica.js.
 */
(function () {
  const $ = (sel, raiz = document) => raiz.querySelector(sel);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = v => (v === '' || v == null ? NaN : Number(v));
  const vista = () => $('#vista');
  const esTactil = window.matchMedia('(pointer: coarse)').matches;
  const enfocar = (el, seleccionar = false) => {
    if (!el || esTactil) return;
    el.focus();
    if (seleccionar) el.select();
  };
  const dlgProducto = () => $('#dlg-producto');

  const estado = {
    carrito: [],
    ventaSel: null,
    ventaBusqueda: '',
    ingreso: nuevoIngreso(),
    productosBusqueda: '',
    mostrarBajas: false,
    informeFecha: Fechas.hoy(),
    form: null
  };

  function nuevoIngreso(producto = null) {
    return {
      producto_id: producto ? producto.id : null,
      lineas: [nuevaLinea(producto ? producto.costo : '')],
      actualizarPrecio: true,
      busqueda: ''
    };
  }
  function nuevaLinea(costo = '') {
    return { cantidad: '', costo: String(costo), vencimiento: '' };
  }

  // ---------- Navegación ----------
  const vistas = { inicio: renderInicio, vender: renderVender, productos: renderProductos, ingreso: renderIngreso, informe: renderInforme };

  function vistaActual() {
    const v = location.hash.slice(1);
    return vistas[v] ? v : 'inicio';
  }

  function render() {
    const v = vistaActual();
    document.querySelectorAll('[data-vista]').forEach(a => {
      if (a.dataset.vista === v) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    vistas[v]();
  }

  function navegar(v) {
    if (location.hash.slice(1) === v) render();
    else location.hash = v;
  }

  // ---------- Menú sándwich (celular) ----------
  const barra = $('.barra');
  const botonMenu = $('.boton-menu');
  function menuAbierto(abrir) {
    barra.classList.toggle('abierta', abrir);
    botonMenu.setAttribute('aria-expanded', String(abrir));
    botonMenu.setAttribute('aria-label', abrir ? 'Cerrar menú' : 'Abrir menú');
  }
  botonMenu.addEventListener('click', () => menuAbierto(!barra.classList.contains('abierta')));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && barra.classList.contains('abierta')) {
      menuAbierto(false);
      botonMenu.focus();
    }
  });
  document.addEventListener('click', e => {
    if (barra.classList.contains('abierta') && !barra.contains(e.target)) menuAbierto(false);
  });
  barra.addEventListener('click', e => {
    if (e.target.closest('.menu a, [data-accion=datos-abrir]')) menuAbierto(false);
  });

  window.addEventListener('hashchange', () => {
    menuAbierto(false);
    render();
    window.scrollTo(0, 0);
    vista().focus({ preventScroll: true });
  });

  // ---------- Utilidades de interfaz ----------
  let temporizador;
  function avisar(texto) {
    const el = $('#aviso-flotante');
    el.textContent = texto;
    el.classList.add('visible');
    clearTimeout(temporizador);
    temporizador = setTimeout(() => el.classList.remove('visible'), 3200);
  }

  function fechaLarga(d) {
    const t = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long' }).format(d);
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  function enCarrito(productoId) {
    const r = estado.carrito.find(x => x.producto_id === productoId);
    return r ? r.cantidad : 0;
  }

  function etiquetaEstado(p) {
    if (!p.activo) return '<span class="etiqueta etiqueta-baja">De baja</span>';
    const stock = Logica.stockVigente(p.id);
    if (stock === 0) return '<span class="etiqueta etiqueta-sin">Sin stock</span>';
    if (stock <= p.stock_minimo) return '<span class="etiqueta etiqueta-poco">Poco stock</span>';
    return '<span class="etiqueta etiqueta-ok">Normal</span>';
  }

  function listaProductos(productos, accion, { deshabilitarSinStock = false, restarCarrito = false } = {}) {
    if (!productos.length) return '<p class="vacio">No hay productos que coincidan. Probá con otra palabra o con el código.</p>';
    return `<ul class="resultados">${productos.slice(0, 8).map(p => {
      const stock = Logica.stockVigente(p.id) - (restarCarrito ? enCarrito(p.id) : 0);
      const sinStock = stock <= 0;
      return `<li><button type="button" class="resultado" data-accion="${accion}" data-id="${p.id}"
        ${deshabilitarSinStock && sinStock ? 'disabled' : ''}>
        <span class="resultado-nombre">${esc(p.nombre)}</span>
        <span class="resultado-dato">${Formato.plata(p.precio_venta)} ${Formato.porUnidad(p)}</span>
        <span class="resultado-dato ${sinStock ? 'texto-rojo' : ''}">${sinStock ? 'Sin stock' : `Hay ${Formato.cantidad(p, stock)}`}</span>
      </button></li>`;
    }).join('')}</ul>`;
  }

  // ---------- Inicio ----------
  function renderInicio() {
    const a = Logica.avisos();
    const hoy = Logica.informe(Fechas.hoy());
    const dias = DB.data.config.diasAviso;
    const sinProductos = !DB.todos('productos').length;

    const itemLote = x => `<li>
      <span class="aviso-nombre">${esc(x.producto.nombre)}</span>
      <span class="aviso-dato">${Formato.cantidad(x.producto, x.lote.cantidad_actual)} del lote ${x.lote.id}, ${Formato.vence(x.dias)} (${Formato.fechaCorta(x.lote.fecha_vencimiento)})</span>
    </li>`;
    const itemStock = x => `<li>
      <span class="aviso-nombre">${esc(x.producto.nombre)}</span>
      <span class="aviso-dato">Quedan ${Formato.cantidad(x.producto, x.stock)}, el mínimo es ${Formato.cantidad(x.producto, x.producto.stock_minimo)}</span>
      <button type="button" class="boton-texto" data-accion="reponer" data-id="${x.producto.id}">Ingresar mercadería</button>
    </li>`;
    const bloque = (tono, titulo, items, ayuda, vacio) => `
      <section class="aviso aviso-${tono}" aria-label="${titulo}">
        <h2>${titulo} <span class="cuenta">${items.length}</span></h2>
        <p class="ayuda">${ayuda}</p>
        ${items.length ? `<ul class="aviso-lista">${items.join('')}</ul>` : `<p class="vacio">${vacio}</p>`}
      </section>`;

    vista().innerHTML = `
      <h1>${esc(fechaLarga(new Date()))}</h1>
      ${sinProductos ? `<div class="bienvenida">
        <p>Todavía no hay productos cargados. Empezá por dar de alta los productos que vende el almacén.</p>
        <a class="boton" href="#productos">Cargar productos</a>
      </div>` : ''}
      <section class="hoy" aria-labelledby="t-hoy">
        <div class="hoy-cabecera">
          <h2 id="t-hoy">Caja de hoy</h2>
          <a class="boton-texto" href="#informe">Ver el informe del día</a>
        </div>
        <dl class="cifras">
          <div><dt>Ventas</dt><dd>${hoy.cantidad}</dd></div>
          <div><dt>Vendido</dt><dd>${Formato.plata(hoy.total)}</dd></div>
          <div><dt>Ganancia</dt><dd>${Formato.plata(hoy.ganancia)}</dd></div>
        </dl>
        <a class="boton boton-grande" href="#vender">Nueva venta</a>
      </section>
      <div class="avisos">
        ${bloque('rojo', 'Vencidos', a.vencidos.map(itemLote), 'No se pueden vender. Hay que sacarlos de la góndola.', 'No hay mercadería vencida.')}
        ${bloque('ambar', 'Por vencer', a.porVencer.map(itemLote),
          `Vencen en los próximos <label class="dias-aviso"><span class="solo-lector">Días de anticipación</span><input type="number" min="1" max="90" value="${dias}" data-cambio="dias-aviso"></label> días.`,
          'Nada vence en ese plazo.')}
        ${bloque('verde', 'Poco stock', a.pocoStock.map(itemStock), 'Llegaron a su stock mínimo o están por debajo.', 'Todos los productos están por encima de su mínimo.')}
      </div>`;
  }

  // ---------- Vender ----------
  function renderVender() {
    const sel = estado.ventaSel ? DB.buscar('productos', estado.ventaSel) : null;
    vista().innerHTML = `
      <h1>Vender</h1>
      <div class="vender">
        <section class="panel" aria-labelledby="t-agregar">
          <h2 id="t-agregar">Agregar producto</h2>
          ${sel ? panelElegido(sel) : `
            <label class="campo">Buscar por nombre o código
              <input type="search" id="venta-buscar" data-input="venta-buscar" data-enter="venta-primero"
                autocomplete="off" value="${esc(estado.ventaBusqueda)}">
            </label>
            <div id="venta-resultados">${resultadosVenta()}</div>`}
        </section>
        ${ticketHTML()}
      </div>`;
    enfocar(sel ? $('#venta-cantidad') : $('#venta-buscar'), !!sel);
  }

  function resultadosVenta() {
    return listaProductos(Logica.buscarProductos(estado.ventaBusqueda), 'venta-elegir',
      { deshabilitarSinStock: true, restarCarrito: true });
  }

  function panelElegido(p) {
    const disponible = Logica.stockVigente(p.id) - enCarrito(p.id);
    const prox = Logica.proximoVencimiento(p.id);
    const esPeso = p.tipo_medida === 'peso';
    return `<div class="elegido">
      <p class="elegido-nombre">${esc(p.nombre)}</p>
      <p class="elegido-precio">${Formato.plata(p.precio_venta)} <span>${Formato.porUnidad(p)}</span></p>
      <p class="ayuda">Disponible: ${Formato.cantidad(p, disponible)}${prox ? `. Próximo vencimiento: ${Formato.fecha(prox)}` : ''}</p>
      <label class="campo">Cantidad ${esPeso ? 'en gramos' : 'en unidades'}
        <input type="number" id="venta-cantidad" min="1" step="1" inputmode="numeric"
          value="${esPeso ? '' : 1}" data-input="venta-cantidad" data-enter="venta-agregar">
      </label>
      ${esPeso ? `<div class="atajos" aria-label="Cantidades rápidas">
        ${[100, 250, 500, 1000].map(g => `<button type="button" class="atajo" data-accion="venta-atajo" data-g="${g}">${g === 1000 ? '1 kg' : g + ' g'}</button>`).join('')}
      </div>` : ''}
      <p class="subtotal" id="venta-subtotal" aria-live="polite">${esPeso ? '' : `Subtotal: ${Formato.plata(p.precio_venta)}`}</p>
      <p class="error" id="venta-error" role="alert"></p>
      <div class="fila-botones">
        <button type="button" class="boton" data-accion="venta-agregar">Agregar al ticket</button>
        <button type="button" class="boton boton-sec" data-accion="venta-cambiar">Elegir otro producto</button>
      </div>
    </div>`;
  }

  function ticketHTML() {
    const filas = estado.carrito.map((r, i) => {
      const p = DB.buscar('productos', r.producto_id);
      const sub = Logica.subtotal(p, p.precio_venta, r.cantidad);
      return `<li class="renglon">
        <span class="renglon-nombre">${esc(p.nombre)}</span>
        <span class="renglon-detalle">${Formato.cantidad(p, r.cantidad)} × ${Formato.plata(p.precio_venta)}${p.tipo_medida === 'peso' ? '/kg' : ''}</span>
        <span class="renglon-sub">${Formato.plata(sub)}</span>
        <button type="button" class="boton-icono" data-accion="venta-quitar" data-i="${i}" aria-label="Quitar ${esc(p.nombre)}">×</button>
      </li>`;
    });
    const total = estado.carrito.reduce((s, r) => {
      const p = DB.buscar('productos', r.producto_id);
      return s + Logica.subtotal(p, p.precio_venta, r.cantidad);
    }, 0);
    const ahora = Fechas.ahora();
    return `<aside class="ticket-envoltura" aria-labelledby="t-ticket">
      <div class="ticket">
        <h2 id="t-ticket">Ticket</h2>
        <p class="ticket-fecha">${Formato.fecha(ahora)} ${Formato.hora(ahora)}</p>
        ${filas.length ? `<ul class="renglones">${filas.join('')}</ul>` : '<p class="ticket-vacio">Todavía no agregaste productos.</p>'}
        <p class="ticket-total"><span>Total</span><strong>${Formato.plata(total)}</strong></p>
        <p class="error" id="ticket-error" role="alert"></p>
        <button type="button" class="boton boton-grande boton-ancho" data-accion="venta-confirmar" ${filas.length ? '' : 'disabled'}>Confirmar venta</button>
        ${filas.length ? '<button type="button" class="boton-texto boton-ancho" data-accion="venta-vaciar">Vaciar ticket</button>' : ''}
      </div>
    </aside>`;
  }

  function errorVenta(texto) {
    const el = $('#venta-error');
    if (el) el.textContent = texto;
  }

  // ---------- Productos ----------
  function renderProductos() {
    vista().innerHTML = `
      <div class="titulo-fila">
        <h1>Productos</h1>
        <button type="button" class="boton" data-accion="producto-nuevo">Nuevo producto</button>
      </div>
      <div class="herramientas">
        <label class="campo campo-buscar"><span class="solo-lector">Buscar productos</span>
          <input type="search" placeholder="Buscar por nombre, código o categoría" data-input="productos-buscar" value="${esc(estado.productosBusqueda)}">
        </label>
        <label class="opcion"><input type="checkbox" data-cambio="productos-bajas" ${estado.mostrarBajas ? 'checked' : ''}> Mostrar dados de baja</label>
      </div>
      <div class="tabla-envoltura">
        <table class="tabla">
          <thead><tr>
            <th scope="col">Producto</th><th scope="col">Se vende</th><th scope="col" class="num">Precio</th>
            <th scope="col" class="num">Stock</th><th scope="col" class="num">Mínimo</th><th scope="col">Estado</th>
          </tr></thead>
          <tbody id="tbody-productos">${filasProductos()}</tbody>
        </table>
      </div>`;
  }

  function filasProductos() {
    const lista = Logica.buscarProductos(estado.productosBusqueda, estado.mostrarBajas);
    if (!lista.length) {
      return `<tr><td colspan="6" class="vacio">${DB.todos('productos').length
        ? 'No hay productos que coincidan con la búsqueda.'
        : 'Todavía no hay productos. Tocá «Nuevo producto» para cargar el primero.'}</td></tr>`;
    }
    return lista.map(p => {
      const vencido = Logica.stockVencido(p.id);
      return `<tr class="${p.activo ? '' : 'fila-baja'}">
        <td><button type="button" class="enlace" data-accion="producto-editar" data-id="${p.id}">${esc(p.nombre)}</button>
          ${p.codigo || p.categoria ? `<span class="sub">${esc([p.categoria, p.codigo].filter(Boolean).join(', '))}</span>` : ''}</td>
        <td>${p.tipo_medida === 'peso' ? 'Por peso' : 'Por unidad'}</td>
        <td class="num">${Formato.plata(p.precio_venta)}<span class="sub">${Formato.porUnidad(p)}</span></td>
        <td class="num">${Formato.cantidad(p, Logica.stockVigente(p.id))}${vencido ? `<span class="sub texto-rojo">+ ${Formato.cantidad(p, vencido)} vencidas</span>` : ''}</td>
        <td class="num">${Formato.cantidad(p, p.stock_minimo)}</td>
        <td>${etiquetaEstado(p)}</td>
      </tr>`;
    }).join('');
  }

  function abrirProducto(id = null, alGuardar = null) {
    const p = id ? DB.buscar('productos', id) : null;
    const lotes = p ? Logica.lotesDe(p.id) : [];
    const tipo = p ? p.tipo_medida : 'unidad';
    const bloqueado = lotes.length > 0;
    estado.form = { id, alGuardar, minimoTocado: !!p, confirmarDuplicado: false };

    const radio = (valor, texto) => `<label class="opcion"><input type="radio" name="tipo_medida" value="${valor}"
      data-cambio="pf-tipo" ${tipo === valor ? 'checked' : ''} ${bloqueado ? 'disabled' : ''}> ${texto}</label>`;

    const hoy = Fechas.hoy();
    const filaLote = l => {
      const dias = Fechas.diasEntre(hoy, l.fecha_vencimiento);
      let est = '<span class="etiqueta etiqueta-ok">Vigente</span>';
      if (l.cantidad_actual === 0) est = '<span class="etiqueta etiqueta-baja">Agotado</span>';
      else if (dias < 0) est = '<span class="etiqueta etiqueta-sin">Vencido</span>';
      else if (dias <= DB.data.config.diasAviso) est = '<span class="etiqueta etiqueta-poco">Por vencer</span>';
      return `<tr><td>${l.id}</td><td>${Formato.fecha(l.fecha_vencimiento)}</td><td>${Formato.fecha(l.fecha_ingreso)}</td>
        <td class="num">${Formato.cantidad(p, l.cantidad_inicial)}</td><td class="num">${Formato.cantidad(p, l.cantidad_actual)}</td>
        <td class="num">${Formato.plata(l.costo)}</td><td>${est}</td></tr>`;
    };

    dlgProducto().innerHTML = `
      <form class="dlg-cuerpo" data-enviar="producto" novalidate>
        <div class="dlg-cabecera">
          <h2 id="dlg-producto-titulo">${p ? 'Editar producto' : 'Nuevo producto'}</h2>
          <button type="button" class="boton-icono" data-accion="dlg-cerrar" aria-label="Cerrar">×</button>
        </div>
        <p class="error" id="pf-error" role="alert"></p>
        <div class="grilla-form">
          <label class="campo ancho">Nombre
            <input name="nombre" value="${esc(p?.nombre)}" autocomplete="off" required>
          </label>
          <label class="campo">Código <span class="opcional">(opcional)</span>
            <input name="codigo" value="${esc(p?.codigo)}" inputmode="numeric" autocomplete="off">
          </label>
          <label class="campo">Categoría <span class="opcional">(opcional)</span>
            <input name="categoria" value="${esc(p?.categoria)}" autocomplete="off">
          </label>
          <fieldset class="campo ancho">
            <legend>Se vende</legend>
            <div class="opciones">${radio('unidad', 'Por unidad')}${radio('peso', 'Por peso (stock en gramos, precio por kg)')}</div>
            ${bloqueado ? '<p class="ayuda">No se puede cambiar porque el producto ya tiene mercadería cargada.</p>' : ''}
          </fieldset>
          <label class="campo">Costo <span data-unidad-precio>${tipo === 'peso' ? 'por kg' : 'por unidad'}</span>
            <input name="costo" type="number" min="1" step="1" inputmode="numeric" value="${p ? p.costo : ''}" data-input="pf-costo">
          </label>
          <label class="campo">Ganancia (%)
            <input name="porcentaje" type="number" min="0" step="0.1" inputmode="decimal" value="${p ? p.porcentaje : 30}" data-input="pf-pct">
          </label>
          <label class="campo ancho">Precio de venta <span data-unidad-precio>${tipo === 'peso' ? 'por kg' : 'por unidad'}</span>
            <input name="precio_venta" type="number" min="1" step="1" inputmode="numeric" value="${p ? p.precio_venta : ''}" data-input="pf-precio">
            <span class="ayuda">Se calcula solo con el costo y el porcentaje. Si lo cambiás a mano, se ajusta el porcentaje.</span>
          </label>
          <label class="campo ancho">Stock mínimo en <span data-unidad-stock>${tipo === 'peso' ? 'gramos' : 'unidades'}</span>
            <input name="stock_minimo" type="number" min="0" step="1" inputmode="numeric"
              value="${p ? p.stock_minimo : Logica.MINIMO_SUGERIDO[tipo]}" data-input="pf-minimo">
            <span class="ayuda">No es el stock que hay: es el límite. Cuando queden esta cantidad o menos, aparece en «Poco stock».</span>
          </label>
        </div>
        ${p ? `
          <h3>Lotes de este producto</h3>
          ${lotes.length ? `<div class="tabla-envoltura"><table class="tabla tabla-chica">
            <thead><tr><th scope="col">Lote</th><th scope="col">Vence</th><th scope="col">Ingresó</th><th scope="col" class="num">Entró</th>
              <th scope="col" class="num">Queda</th><th scope="col" class="num">Costo</th><th scope="col">Estado</th></tr></thead>
            <tbody>${lotes.slice().reverse().map(filaLote).join('')}</tbody>
          </table></div>` : '<p class="vacio">Este producto todavía no tiene mercadería cargada.</p>'}
        ` : `
          <fieldset class="stock-inicial">
            <legend>Stock inicial <span class="opcional">(opcional)</span></legend>
            <p class="ayuda">Si ya tenés este producto en el almacén, cargalo acá y se crea su primer lote.</p>
            <div class="grilla-form">
              <label class="campo">Cantidad en <span data-unidad-stock>${tipo === 'peso' ? 'gramos' : 'unidades'}</span>
                <input name="ini_cantidad" type="number" min="1" step="1" inputmode="numeric">
              </label>
              <label class="campo">Vence el
                <input name="ini_vencimiento" type="date" min="${Fechas.hoy()}">
              </label>
            </div>
          </fieldset>`}
        <div class="dlg-pie">
          ${p ? `<button type="button" class="boton boton-peligro" data-accion="producto-baja" data-id="${p.id}">${p.activo ? 'Dar de baja' : 'Reactivar'}</button>` : ''}
          <span class="espacio"></span>
          <button type="button" class="boton boton-sec" data-accion="dlg-cerrar">Cancelar</button>
          <button type="submit" class="boton">Guardar producto</button>
        </div>
      </form>`;
    dlgProducto().showModal();
    enfocar($('[name=nombre]', dlgProducto()));
  }

  // ---------- Ingresar mercadería ----------
  function renderIngreso() {
    const ing = estado.ingreso;
    const p = ing.producto_id ? DB.buscar('productos', ing.producto_id) : null;
    const ultimos = DB.todos('lotes').slice().sort((a, b) => b.id - a.id).slice(0, 8);

    vista().innerHTML = `
      <h1>Ingresar mercadería</h1>
      <div class="pasos">
        <section class="panel" aria-labelledby="t-paso1">
          <h2 id="t-paso1"><span class="paso">1</span> Producto</h2>
          ${p ? `<div class="elegido elegido-fila">
              <div>
                <p class="elegido-nombre">${esc(p.nombre)}</p>
                <p class="ayuda">Stock actual: ${Formato.cantidad(p, Logica.stockVigente(p.id))}. Costo: ${Formato.plata(p.costo)} ${Formato.porUnidad(p)}. Precio de venta: ${Formato.plata(p.precio_venta)} (${Formato.numero(p.porcentaje)} %).</p>
              </div>
              <button type="button" class="boton boton-sec" data-accion="ingreso-cambiar">Cambiar</button>
            </div>` : `
            <label class="campo">Buscar por nombre o código
              <input type="search" id="ingreso-buscar" data-input="ingreso-buscar" data-enter="ingreso-primero"
                autocomplete="off" value="${esc(ing.busqueda)}">
            </label>
            <div id="ingreso-resultados">${listaProductos(Logica.buscarProductos(ing.busqueda), 'ingreso-elegir')}</div>
            <p class="ayuda">¿No está en la lista? <button type="button" class="boton-texto" data-accion="ingreso-nuevo">Crear producto nuevo</button></p>`}
        </section>

        ${p ? `<section class="panel" aria-labelledby="t-paso2">
          <h2 id="t-paso2"><span class="paso">2</span> Lo que llegó</h2>
          <p class="ayuda">Cada línea se guarda como un lote. Si en la misma entrega vienen paquetes con distinto vencimiento, cargalos en líneas separadas.</p>
          <div class="lineas">
            ${ing.lineas.map((l, i) => `<div class="linea">
              <label class="campo">Cantidad en ${p.tipo_medida === 'peso' ? 'gramos' : 'unidades'}
                <input type="number" min="1" step="1" inputmode="numeric" value="${esc(l.cantidad)}" data-input="ingreso-linea" data-i="${i}" data-campo="cantidad">
              </label>
              <label class="campo">Costo ${Formato.porUnidad(p)}
                <input type="number" min="1" step="1" inputmode="numeric" value="${esc(l.costo)}" data-input="ingreso-linea" data-i="${i}" data-campo="costo">
              </label>
              <label class="campo">Vence el
                <input type="date" min="${Fechas.hoy()}" value="${esc(l.vencimiento)}" data-input="ingreso-linea" data-i="${i}" data-campo="vencimiento">
              </label>
              ${ing.lineas.length > 1 ? `<button type="button" class="boton-icono" data-accion="ingreso-quitar-linea" data-i="${i}" aria-label="Quitar línea ${i + 1}">×</button>` : '<span></span>'}
            </div>`).join('')}
          </div>
          <button type="button" class="boton-texto" data-accion="ingreso-linea">Agregar otra línea con otro vencimiento</button>
          <div id="aviso-costo">${avisoCosto(p)}</div>
          <p class="error" id="ingreso-error" role="alert"></p>
          <button type="button" class="boton" data-accion="ingreso-guardar">Guardar ingreso</button>
        </section>` : ''}
      </div>

      <section aria-labelledby="t-ultimos" class="seccion">
        <h2 id="t-ultimos">Últimos ingresos</h2>
        ${ultimos.length ? `<div class="tabla-envoltura"><table class="tabla">
          <thead><tr><th scope="col">Lote</th><th scope="col">Ingresó</th><th scope="col">Producto</th>
            <th scope="col" class="num">Entró</th><th scope="col" class="num">Costo</th><th scope="col">Vence</th></tr></thead>
          <tbody>${ultimos.map(l => {
            const pr = DB.buscar('productos', l.producto_id);
            return `<tr><td>${l.id}</td><td>${Formato.fecha(l.fecha_ingreso)}</td><td>${esc(pr.nombre)}</td>
              <td class="num">${Formato.cantidad(pr, l.cantidad_inicial)}</td><td class="num">${Formato.plata(l.costo)}</td>
              <td>${Formato.fecha(l.fecha_vencimiento)}</td></tr>`;
          }).join('')}</tbody>
        </table></div>` : '<p class="vacio">Todavía no se ingresó mercadería.</p>'}
      </section>`;

    enfocar(p ? $('[data-campo=cantidad]') : $('#ingreso-buscar'));
  }

  function avisoCosto(p) {
    const ultima = estado.ingreso.lineas[estado.ingreso.lineas.length - 1];
    const costo = Math.round(num(ultima.costo));
    if (!(costo > 0) || costo === p.costo) return '';
    const nuevoPrecio = Logica.precioDesdePorcentaje(costo, p.porcentaje);
    const nuevoMargen = Logica.porcentajeDesdePrecio(costo, p.precio_venta);
    const subio = costo > p.costo;
    return `<div class="aviso-cambio">
      <p>El costo ${subio ? 'subió' : 'bajó'} de ${Formato.plata(p.costo)} a ${Formato.plata(costo)} ${Formato.porUnidad(p)}.</p>
      <label class="opcion"><input type="checkbox" data-cambio="ingreso-actualizar" ${estado.ingreso.actualizarPrecio ? 'checked' : ''}>
        Actualizar el precio de venta a ${Formato.plata(nuevoPrecio)} (mantiene el ${Formato.numero(p.porcentaje)} %)</label>
      ${estado.ingreso.actualizarPrecio ? '' : `<p class="ayuda">El precio queda en ${Formato.plata(p.precio_venta)} y el margen pasa a ${Formato.numero(nuevoMargen)} %.</p>`}
    </div>`;
  }

  function seleccionarParaIngreso(id) {
    estado.ingreso = nuevoIngreso(DB.buscar('productos', id));
  }

  // ---------- Informe ----------
  function renderInforme() {
    const f = estado.informeFecha;
    const inf = Logica.informe(f);
    const detalleVenta = v => (inf.renglones.get(v.id) || [])
      .map(r => `${esc(r.producto.nombre)} (${Formato.cantidad(r.producto, r.cantidad)})`).join(', ');

    vista().innerHTML = `
      <div class="titulo-fila">
        <h1>Informe de ventas</h1>
        <label class="campo campo-fecha">Día
          <input type="date" value="${f}" max="${Fechas.hoy()}" data-cambio="informe-fecha">
        </label>
      </div>
      <p class="ayuda">${f === Fechas.hoy() ? 'Hoy, ' : ''}${esc(fechaLarga(Fechas.aDate(f)).toLowerCase())}</p>
      <dl class="cifras cifras-cuatro">
        <div><dt>Ventas</dt><dd>${inf.cantidad}</dd></div>
        <div><dt>Vendido</dt><dd>${Formato.plata(inf.total)}</dd></div>
        <div><dt>Costo de lo vendido</dt><dd>${Formato.plata(inf.costo)}</dd></div>
        <div><dt>Ganancia</dt><dd>${Formato.plata(inf.ganancia)}</dd></div>
      </dl>
      ${inf.cantidad ? `
        <section class="seccion" aria-labelledby="t-por-producto">
          <h2 id="t-por-producto">Por producto</h2>
          <div class="tabla-envoltura"><table class="tabla">
            <thead><tr><th scope="col">Producto</th><th scope="col" class="num">Cantidad</th><th scope="col" class="num">Vendido</th><th scope="col" class="num">Ganancia</th></tr></thead>
            <tbody>${inf.porProducto.map(x => `<tr><td>${esc(x.producto.nombre)}</td>
              <td class="num">${Formato.cantidad(x.producto, x.cantidad)}</td><td class="num">${Formato.plata(x.vendido)}</td>
              <td class="num">${Formato.plata(x.ganancia)}</td></tr>`).join('')}</tbody>
          </table></div>
        </section>
        <section class="seccion" aria-labelledby="t-ventas-dia">
          <h2 id="t-ventas-dia">Ventas del día</h2>
          <div class="tabla-envoltura"><table class="tabla">
            <thead><tr><th scope="col">N.º</th><th scope="col">Hora</th><th scope="col">Detalle</th><th scope="col" class="num">Total</th><th scope="col" class="num">Ganancia</th></tr></thead>
            <tbody>${inf.ventas.map(v => `<tr><td>${v.id}</td><td>${Formato.hora(v.fecha_hora)}</td><td>${detalleVenta(v)}</td>
              <td class="num">${Formato.plata(v.total)}</td><td class="num">${Formato.plata(v.ganancia)}</td></tr>`).join('')}</tbody>
          </table></div>
        </section>` : `<p class="vacio">No hay ventas registradas ese día.</p>`}`;
  }

  // ---------- Acciones ----------
  const acciones = {
    'dlg-cerrar': el => el.closest('dialog').close(),

    'datos-abrir': () => $('#dlg-datos').showModal(),
    'datos-ejemplo': () => {
      if (!confirm('Se borra todo lo que cargaste y vuelven los datos de ejemplo. ¿Seguir?')) return;
      DB.reiniciar(true); reiniciarEstado(); $('#dlg-datos').close(); avisar('Datos de ejemplo cargados'); render();
    },
    'datos-vacio': () => {
      if (!confirm('Se borra todo y el sistema queda sin productos ni ventas. ¿Seguir?')) return;
      DB.reiniciar(false); reiniciarEstado(); $('#dlg-datos').close(); avisar('Sistema vacío'); navegar('inicio');
    },

    'reponer': el => { seleccionarParaIngreso(+el.dataset.id); navegar('ingreso'); },

    // Vender
    'venta-elegir': el => { estado.ventaSel = +el.dataset.id; estado.ventaBusqueda = ''; renderVender(); },
    'venta-primero': () => {
      const b = $('#venta-resultados .resultado:not([disabled])');
      if (b) b.click();
    },
    'venta-cambiar': () => { estado.ventaSel = null; renderVender(); },
    'venta-atajo': el => {
      const input = $('#venta-cantidad');
      input.value = el.dataset.g;
      entradas['venta-cantidad'](input);
      input.focus();
    },
    'venta-agregar': () => {
      const p = DB.buscar('productos', estado.ventaSel);
      const c = num($('#venta-cantidad').value);
      if (!Number.isInteger(c) || c <= 0) return errorVenta(`Ingresá una cantidad entera mayor a 0${p.tipo_medida === 'peso' ? ', en gramos' : ''}.`);
      const disponible = Logica.stockVigente(p.id) - enCarrito(p.id);
      if (c > disponible) {
        if (disponible > 0) return errorVenta(`Solo hay ${Formato.cantidad(p, disponible)} disponibles.`);
        return errorVenta(Logica.stockVencido(p.id) ? 'Solo quedan unidades vencidas de este producto.' : 'No queda stock de este producto.');
      }
      const existente = estado.carrito.find(r => r.producto_id === p.id);
      if (existente) existente.cantidad += c;
      else estado.carrito.push({ producto_id: p.id, cantidad: c });
      estado.ventaSel = null;
      renderVender();
    },
    'venta-quitar': el => { estado.carrito.splice(+el.dataset.i, 1); renderVender(); },
    'venta-vaciar': () => { estado.carrito = []; renderVender(); },
    'venta-confirmar': () => {
      try {
        const v = Logica.registrarVenta(estado.carrito.map(r => ({ ...r })));
        estado.carrito = [];
        estado.ventaSel = null;
        avisar(`Venta registrada por ${Formato.plata(v.total)}`);
        renderVender();
      } catch (e) {
        $('#ticket-error').textContent = e.message;
      }
    },

    // Productos
    'producto-nuevo': () => abrirProducto(),
    'producto-editar': el => abrirProducto(+el.dataset.id),
    'producto-baja': el => {
      const p = DB.buscar('productos', +el.dataset.id);
      const pregunta = p.activo
        ? `¿Dar de baja «${p.nombre}»? Deja de aparecer en ventas y avisos, pero su historial de ventas se conserva.`
        : `¿Reactivar «${p.nombre}»?`;
      if (!confirm(pregunta)) return;
      Logica.cambiarActivo(p.id, !p.activo);
      dlgProducto().close();
      avisar(p.activo ? 'Producto reactivado' : 'Producto dado de baja');
      render();
    },

    // Ingreso
    'ingreso-elegir': el => { seleccionarParaIngreso(+el.dataset.id); renderIngreso(); },
    'ingreso-primero': () => {
      const b = $('#ingreso-resultados .resultado');
      if (b) b.click();
    },
    'ingreso-cambiar': () => { estado.ingreso = nuevoIngreso(); renderIngreso(); },
    'ingreso-nuevo': () => abrirProducto(null, p => {
      seleccionarParaIngreso(p.id);
      navegar('ingreso');
    }),
    'ingreso-linea': () => {
      const p = DB.buscar('productos', estado.ingreso.producto_id);
      const ultima = estado.ingreso.lineas[estado.ingreso.lineas.length - 1];
      estado.ingreso.lineas.push(nuevaLinea(ultima.costo || p.costo));
      renderIngreso();
      const campos = document.querySelectorAll('[data-campo=cantidad]');
      campos[campos.length - 1].focus();
    },
    'ingreso-quitar-linea': el => { estado.ingreso.lineas.splice(+el.dataset.i, 1); renderIngreso(); },
    'ingreso-guardar': () => {
      const ing = estado.ingreso;
      const p = DB.buscar('productos', ing.producto_id);
      const error = $('#ingreso-error');
      const lineas = ing.lineas.map(l => ({ cantidad: num(l.cantidad), costo: num(l.costo), fecha_vencimiento: l.vencimiento }));
      try {
        const lotes = Logica.ingresarMercaderia(p.id, lineas, { actualizarPrecio: ing.actualizarPrecio });
        const total = lotes.reduce((s, l) => s + l.cantidad_inicial, 0);
        avisar(`Ingreso guardado: ${Formato.cantidad(p, total)} de ${p.nombre}`);
        estado.ingreso = nuevoIngreso();
        renderIngreso();
      } catch (e) {
        error.textContent = e.message;
      }
    }
  };

  const entradas = {
    'venta-buscar': el => {
      estado.ventaBusqueda = el.value;
      $('#venta-resultados').innerHTML = resultadosVenta();
    },
    'venta-cantidad': el => {
      const p = DB.buscar('productos', estado.ventaSel);
      const c = num(el.value);
      errorVenta('');
      $('#venta-subtotal').textContent = c > 0 ? `Subtotal: ${Formato.plata(Logica.subtotal(p, p.precio_venta, c))}` : '';
    },
    'productos-buscar': el => {
      estado.productosBusqueda = el.value;
      $('#tbody-productos').innerHTML = filasProductos();
    },
    'ingreso-buscar': el => {
      estado.ingreso.busqueda = el.value;
      $('#ingreso-resultados').innerHTML = listaProductos(Logica.buscarProductos(el.value), 'ingreso-elegir');
    },
    'ingreso-linea': el => {
      estado.ingreso.lineas[+el.dataset.i][el.dataset.campo] = el.value;
      $('#ingreso-error').textContent = '';
      if (el.dataset.campo === 'costo') {
        $('#aviso-costo').innerHTML = avisoCosto(DB.buscar('productos', estado.ingreso.producto_id));
      }
    },
    // Formulario de producto: precio y porcentaje siempre coherentes
    'pf-costo': el => recalcularPrecio(el.form),
    'pf-pct': el => recalcularPrecio(el.form),
    'pf-precio': el => {
      const f = el.form.elements;
      const costo = num(f.costo.value), precio = num(f.precio_venta.value);
      if (costo > 0 && precio > 0) f.porcentaje.value = Logica.porcentajeDesdePrecio(costo, precio);
    },
    'pf-minimo': () => { estado.form.minimoTocado = true; }
  };

  function recalcularPrecio(form) {
    const f = form.elements;
    const costo = num(f.costo.value), pct = num(f.porcentaje.value);
    if (costo > 0 && pct >= 0) f.precio_venta.value = Logica.precioDesdePorcentaje(costo, pct);
  }

  const cambios = {
    'dias-aviso': el => {
      const n = num(el.value);
      if (!Number.isInteger(n) || n < 1 || n > 90) { el.value = DB.data.config.diasAviso; return; }
      DB.data.config.diasAviso = n;
      DB.guardar();
      renderInicio();
      $('[data-cambio=dias-aviso]').focus();
    },
    'productos-bajas': el => {
      estado.mostrarBajas = el.checked;
      $('#tbody-productos').innerHTML = filasProductos();
    },
    'ingreso-actualizar': el => {
      estado.ingreso.actualizarPrecio = el.checked;
      $('#aviso-costo').innerHTML = avisoCosto(DB.buscar('productos', estado.ingreso.producto_id));
      $('[data-cambio=ingreso-actualizar]').focus();
    },
    'informe-fecha': el => {
      if (!el.value) return;
      estado.informeFecha = el.value;
      renderInforme();
      $('[data-cambio=informe-fecha]').focus();
    },
    'pf-tipo': el => {
      const tipo = el.value;
      const dlg = dlgProducto();
      dlg.querySelectorAll('[data-unidad-precio]').forEach(s => { s.textContent = tipo === 'peso' ? 'por kg' : 'por unidad'; });
      dlg.querySelectorAll('[data-unidad-stock]').forEach(s => { s.textContent = tipo === 'peso' ? 'gramos' : 'unidades'; });
      if (!estado.form.minimoTocado) el.form.elements.stock_minimo.value = Logica.MINIMO_SUGERIDO[tipo];
    }
  };

  const envios = {
    producto: form => {
      const f = form.elements;
      const error = $('#pf-error');
      const { id, alGuardar } = estado.form;
      const existente = id ? DB.buscar('productos', id) : null;
      const marcado = form.querySelector('[name=tipo_medida]:checked');
      const datos = {
        nombre: f.nombre.value,
        codigo: f.codigo.value,
        categoria: f.categoria.value,
        tipo_medida: marcado ? marcado.value : existente?.tipo_medida,
        costo: num(f.costo.value),
        precio_venta: num(f.precio_venta.value),
        stock_minimo: num(f.stock_minimo.value)
      };

      if (!id) {
        const cantidad = num(f.ini_cantidad.value);
        const vence = f.ini_vencimiento.value;
        if (f.ini_cantidad.value !== '' || vence) {
          if (!(cantidad > 0) || !vence) {
            error.textContent = 'Para cargar stock inicial completá la cantidad y la fecha de vencimiento.';
            return;
          }
          datos.stockInicial = { cantidad, costo: datos.costo, fecha_vencimiento: vence };
        }
      }

      if (!estado.form.confirmarDuplicado && datos.nombre.trim() && Logica.nombreDuplicado(datos.nombre, id)) {
        estado.form.confirmarDuplicado = true;
        error.textContent = `Ya existe un producto llamado «${datos.nombre.trim()}». Si es un producto distinto, tocá «Guardar producto» otra vez. Si es el mismo, cancelá y usá el que ya existe.`;
        return;
      }

      try {
        const p = Logica.guardarProducto(datos, id);
        dlgProducto().close();
        avisar(id ? 'Cambios guardados' : 'Producto guardado');
        if (alGuardar) alGuardar(p);
        else render();
      } catch (e) {
        error.textContent = e.message;
        estado.form.confirmarDuplicado = false;
      }
    }
  };

  function reiniciarEstado() {
    estado.carrito = [];
    estado.ventaSel = null;
    estado.ventaBusqueda = '';
    estado.ingreso = nuevoIngreso();
    estado.productosBusqueda = '';
    estado.informeFecha = Fechas.hoy();
  }

  // ---------- Eventos (delegados) ----------
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-accion]');
    if (!el || el.disabled) return;
    const fn = acciones[el.dataset.accion];
    if (fn) { e.preventDefault(); fn(el, e); }
  });
  document.addEventListener('input', e => {
    const el = e.target.closest('[data-input]');
    if (el && entradas[el.dataset.input]) entradas[el.dataset.input](el, e);
  });
  document.addEventListener('change', e => {
    const el = e.target.closest('[data-cambio]');
    if (el && cambios[el.dataset.cambio]) cambios[el.dataset.cambio](el, e);
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const el = e.target.closest('[data-enter]');
    if (el && acciones[el.dataset.enter]) { e.preventDefault(); acciones[el.dataset.enter](el, e); }
  });
  document.addEventListener('submit', e => {
    const form = e.target;
    if (form.dataset.enviar && envios[form.dataset.enviar]) {
      e.preventDefault();
      envios[form.dataset.enviar](form, e);
    }
  });
  // Cerrar el diálogo tocando afuera
  document.querySelectorAll('dialog').forEach(d => d.addEventListener('click', e => { if (e.target === d) d.close(); }));

  // ---------- Inicio ----------
  DB.cargar();
  render();
})();
