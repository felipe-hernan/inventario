/* Productos: catálogo, categorías e importación desde planilla. */
(function () {
  const est = App.estado.productos = { busqueda: '', categoria: null, bajas: false, form: null, importacion: null };
  const opcional = '<span class="fw-normal text-body-secondary">(opcional)</span>';

  App.vistas.productos = function () {
    UI.vista().innerHTML = `
      ${H.tituloPagina('Productos', `
        <button type="button" class="btn btn-outline-secondary" data-accion="categorias-abrir"><i class="bi bi-folder2"></i> Categorías</button>
        <button type="button" class="btn btn-outline-secondary" data-accion="importar-abrir"><i class="bi bi-file-earmark-spreadsheet"></i> Importar planilla</button>
        <button type="button" class="btn btn-primary" data-accion="producto-nuevo"><i class="bi bi-plus-lg"></i> Nuevo producto</button>`)}
      <div class="row g-2 align-items-center mb-3">
        <div class="col-md">
          <div class="input-group"><span class="input-group-text"><i class="bi bi-search"></i></span>
            <input type="search" class="form-control" placeholder="Buscar por nombre o código" aria-label="Buscar productos" data-input="productos-buscar" value="${esc(est.busqueda)}"></div>
        </div>
        <div class="col-md-3">
          <select class="form-select" aria-label="Filtrar por categoría" data-cambio="productos-categoria">${UI.opcionesCategorias(est.categoria, { conTodas: true })}</select>
        </div>
        <div class="col-md-auto">
          <div class="form-check form-switch mb-0">
            <input class="form-check-input" type="checkbox" role="switch" id="ver-bajas" data-cambio="productos-bajas" ${est.bajas ? 'checked' : ''}>
            <label class="form-check-label" for="ver-bajas">Mostrar dados de baja</label>
          </div>
        </div>
      </div>
      <div class="card shadow-sm"><div class="table-responsive">
        <table class="table table-hover align-middle mb-0">
          <thead><tr><th>Producto</th><th class="num">Precio</th><th class="num">Stock</th><th class="num">Mínimo</th><th>Estado</th></tr></thead>
          <tbody id="tbody-productos">${filas()}</tbody>
        </table>
      </div></div>`;
  };

  function filas() {
    const lista = Logica.buscarProductos(est.busqueda, { incluirBajas: est.bajas, categoriaId: est.categoria });
    if (!lista.length) return `<tr><td colspan="5" class="text-body-secondary fst-italic">${DB.todos('productos').length ? 'No hay productos que coincidan.' : 'Todavía no hay productos.'}</td></tr>`;
    return lista.map(p => {
      const vencido = p.controla_stock ? Logica.stockVencido(p.id) : 0;
      return `<tr class="${p.activo ? '' : 'text-body-secondary'}">
        <td><a href="#" class="fw-semibold" data-accion="producto-editar" data-id="${p.id}">${esc(p.nombre)}</a>
          <span class="sub">${esc([Logica.nombreCategoria(p.categoria_id), p.codigo].filter(Boolean).join(' · '))}</span></td>
        <td class="num">${Formato.plata(p.precio_venta)}<span class="sub">${Formato.porUnidad(p)}</span>
          ${p.precio_mayorista ? `<span class="sub"><i class="bi bi-boxes"></i> ${Formato.plata(p.precio_mayorista)}</span>` : ''}</td>
        <td class="num">${p.controla_stock ? Formato.cantidad(p, Logica.stockVigente(p.id)) : '—'}
          ${vencido ? `<span class="sub text-danger">+ ${Formato.cantidad(p, vencido)} vencidas</span>` : ''}</td>
        <td class="num">${p.controla_stock ? Formato.cantidad(p, p.stock_minimo) : '—'}</td>
        <td>${UI.etiquetaStock(p)}</td>
      </tr>`;
    }).join('');
  }

  // ---------- Formulario de producto ----------
  function abrirProducto(id = null, alGuardar = null) {
    const p = id ? DB.buscar('productos', id) : null;
    const lotes = p ? Logica.lotesDe(p.id) : [];
    const tipo = p ? p.tipo_medida : 'unidad';
    const controla = p ? p.controla_stock : true;
    const bloqueado = lotes.length > 0;
    est.form = { id, alGuardar, minimoTocado: !!p, confirmarDuplicado: false };
    const uPrecio = tipo === 'peso' ? 'por kg' : 'por unidad';
    const uStock = tipo === 'peso' ? 'gramos' : 'unidades';
    const plata = (name, valor, extra = '') => `<div class="input-group"><span class="input-group-text">$</span>
      <input class="form-control" name="${name}" type="number" min="1" step="1" inputmode="numeric" value="${valor ?? ''}" ${extra}></div>`;
    const hoy = Fechas.hoy();
    const estadoLote = l => {
      const dias = Fechas.diasEntre(hoy, l.fecha_vencimiento);
      if (l.cantidad_actual === 0) return '<span class="badge text-bg-secondary">Agotado</span>';
      if (dias < 0) return '<span class="badge text-bg-danger">Vencido</span>';
      if (dias <= DB.data.config.diasAviso) return '<span class="badge text-bg-warning">Por vencer</span>';
      return '<span class="badge text-bg-success">Vigente</span>';
    };

    UI.abrirDialogo({
      titulo: p ? 'Editar producto' : 'Nuevo producto', enviar: 'producto',
      cuerpo: `${H.error()}
        <div class="row gx-3">
          <div class="col-12">${H.campo('Nombre', `<input class="form-control" name="nombre" value="${esc(p?.nombre)}" autocomplete="off" data-foco>`)}</div>
          <div class="col-md-6">${H.campo(`Código de barras ${opcional}`, `<input class="form-control" name="codigo" value="${esc(p?.codigo)}" inputmode="numeric" autocomplete="off">`)}</div>
          <div class="col-md-6">${H.campo('Categoría', `<select class="form-select" name="categoria_id" data-cambio="pf-categoria">${UI.opcionesCategorias(p?.categoria_id || null, { conNueva: true })}</select>`)}</div>
          <div class="col-12" data-bloque="categoria-nueva" hidden>${H.campo('Nombre de la categoría nueva', '<input class="form-control" name="categoria_nueva" autocomplete="off">')}</div>
          <div class="col-12 mb-3">
            <span class="form-label d-block fw-semibold">Se vende</span>
            ${['unidad', 'peso'].map(v => `<div class="form-check form-check-inline">
              <input class="form-check-input" type="radio" name="tipo_medida" id="tm-${v}" value="${v}" data-cambio="pf-tipo" ${tipo === v ? 'checked' : ''} ${bloqueado ? 'disabled' : ''}>
              <label class="form-check-label" for="tm-${v}">${v === 'unidad' ? 'Por unidad' : 'Por peso (stock en gramos, precio por kg)'}</label></div>`).join('')}
            ${bloqueado ? '<div class="form-text">No se puede cambiar porque el producto ya tiene mercadería cargada.</div>' : ''}
          </div>
          <div class="col-md-4">${H.campo(`Costo <span data-unidad-precio>${uPrecio}</span>`, plata('costo', p?.costo, 'data-input="pf-costo"'))}</div>
          <div class="col-md-4">${H.campo('Ganancia', `<div class="input-group"><input class="form-control" name="porcentaje" type="number" min="0" step="0.1" inputmode="decimal" value="${p ? p.porcentaje : 30}" data-input="pf-pct"><span class="input-group-text">%</span></div>`)}</div>
          <div class="col-md-4">${H.campo(`Precio de venta <span data-unidad-precio>${uPrecio}</span>`, plata('precio_venta', p?.precio_venta, 'data-input="pf-precio"'))}</div>
          <div class="col-12"><p class="form-text mt-n2 mb-3">El precio se calcula con el costo y el porcentaje. Si lo cambiás a mano, se ajusta el porcentaje.</p></div>
          <div class="col-12 mb-3">
            <div class="accordion" id="acc-mayor">
              <div class="accordion-item">
                <h3 class="accordion-header"><button class="accordion-button ${p?.precio_mayorista ? '' : 'collapsed'}" type="button" data-bs-toggle="collapse" data-bs-target="#mayor" aria-expanded="${!!p?.precio_mayorista}">
                  <i class="bi bi-boxes me-2"></i> Precio por mayor&nbsp;${opcional}</button></h3>
                <div id="mayor" class="accordion-collapse collapse ${p?.precio_mayorista ? 'show' : ''}"><div class="accordion-body">
                  <div class="row g-3">
                    <div class="col-md-6">${H.campo(`Precio por mayor <span data-unidad-precio>${uPrecio}</span>`, plata('precio_mayorista', p?.precio_mayorista, 'data-input="pf-mayor"'), '', 'mb-0')}</div>
                    <div class="col-md-6">${H.campo(`A partir de (<span data-unidad-stock>${uStock}</span>)`, `<input class="form-control" name="cantidad_mayorista" type="number" min="2" step="1" inputmode="numeric" value="${p?.cantidad_mayorista ?? ''}">`, '', 'mb-0')}</div>
                  </div>
                  <div class="form-text" id="pf-mayor-ayuda">Cuando en una venta se lleve esa cantidad o más, se cobra este precio automáticamente.</div>
                </div></div>
              </div>
            </div>
          </div>
          <div class="col-12 mb-3">
            <div class="form-check form-switch">
              <input class="form-check-input" type="checkbox" role="switch" id="pf-controla" name="controla" data-cambio="pf-controla" ${controla ? 'checked' : ''}>
              <label class="form-check-label" for="pf-controla"><strong>Controlar stock y vencimientos</strong>
                <span class="form-text d-block mt-0">Desmarcalo para cosas como recargas o servicios: se venden sin descontar stock.</span></label>
            </div>
          </div>
          <div class="col-md-6" data-solo-stock ${controla ? '' : 'hidden'}>${H.campo(`Stock mínimo en <span data-unidad-stock>${uStock}</span>`,
            `<input class="form-control" name="stock_minimo" type="number" min="0" step="1" inputmode="numeric" value="${p ? p.stock_minimo : Logica.MINIMO_SUGERIDO[tipo]}" data-input="pf-minimo">`,
            'No es el stock que hay: es el límite para el aviso de «Poco stock».')}</div>
        </div>
        ${p ? (lotes.length ? `
          <h3 class="h6 mt-2">Lotes</h3>
          <div class="table-responsive"><table class="table table-sm align-middle">
            <thead><tr><th>Lote</th><th>Vence</th><th class="num">Entró</th><th class="num">Queda</th><th class="num">Costo</th><th>Estado</th></tr></thead>
            <tbody>${lotes.slice().reverse().map(l => `<tr><td>${l.id}</td><td>${Formato.fecha(l.fecha_vencimiento)}</td>
              <td class="num">${Formato.cantidad(p, l.cantidad_inicial)}</td><td class="num">${Formato.cantidad(p, l.cantidad_actual)}</td>
              <td class="num">${Formato.plata(l.costo)}</td><td>${estadoLote(l)}</td></tr>`).join('')}</tbody>
          </table></div>` : '') : `
          <fieldset class="card card-body bg-body-tertiary" data-solo-stock ${controla ? '' : 'hidden'}>
            <legend class="h6 mb-1">Stock inicial ${opcional}</legend>
            <p class="form-text mt-0">Si ya tenés este producto en el almacén, cargalo acá y se crea su primer lote.</p>
            <div class="row g-3">
              <div class="col-md-6">${H.campo(`Cantidad en <span data-unidad-stock>${uStock}</span>`, '<input class="form-control" name="ini_cantidad" type="number" min="1" step="1" inputmode="numeric">', '', 'mb-0')}</div>
              <div class="col-md-6">${H.campo('Vence el', `<input class="form-control" name="ini_vencimiento" type="date" min="${hoy}">`, '', 'mb-0')}</div>
            </div>
          </fieldset>`}`,
      pie: UI.pie('Guardar producto', {
        izquierda: p ? `<button type="button" class="btn btn-outline-danger" data-accion="producto-baja" data-id="${p.id}">${p.activo ? 'Dar de baja' : 'Reactivar'}</button>` : ''
      })
    }, { ancho: 'normal' });
  }
  App.abrirProducto = abrirProducto;

  function recalcularPrecio(form) {
    const f = form.elements, costo = num(f.costo.value), pct = num(f.porcentaje.value);
    if (costo > 0 && pct >= 0) f.precio_venta.value = Logica.precioDesdePorcentaje(costo, pct);
  }
  App.entradas['pf-costo'] = el => recalcularPrecio(el.form);
  App.entradas['pf-pct'] = el => recalcularPrecio(el.form);
  App.entradas['pf-precio'] = el => {
    const f = el.form.elements, costo = num(f.costo.value), precio = num(f.precio_venta.value);
    if (costo > 0 && precio > 0) f.porcentaje.value = Logica.porcentajeDesdePrecio(costo, precio);
  };
  App.entradas['pf-mayor'] = el => {
    const f = el.form.elements, costo = num(f.costo.value), may = num(f.precio_mayorista.value);
    $('#pf-mayor-ayuda').textContent = costo > 0 && may > 0
      ? `Ganancia por mayor: ${Formato.numero(Logica.porcentajeDesdePrecio(costo, may))} %. Se cobra automáticamente al llegar a esa cantidad.`
      : 'Cuando en una venta se lleve esa cantidad o más, se cobra este precio automáticamente.';
  };
  App.entradas['pf-minimo'] = () => { est.form.minimoTocado = true; };
  App.cambios['pf-tipo'] = el => {
    const peso = el.value === 'peso';
    $$('#dlg [data-unidad-precio]').forEach(s => { s.textContent = peso ? 'por kg' : 'por unidad'; });
    $$('#dlg [data-unidad-stock]').forEach(s => { s.textContent = peso ? 'gramos' : 'unidades'; });
    if (!est.form.minimoTocado) el.form.elements.stock_minimo.value = Logica.MINIMO_SUGERIDO[el.value];
  };
  App.cambios['pf-controla'] = el => { $$('#dlg [data-solo-stock]').forEach(b => { b.hidden = !el.checked; }); };
  App.cambios['pf-categoria'] = el => {
    const nueva = $('#dlg [data-bloque=categoria-nueva]');
    nueva.hidden = el.value !== '__nueva';
    if (!nueva.hidden) el.form.elements.categoria_nueva.focus();
  };

  App.envios.producto = form => {
    const f = form.elements, err = $('#dlg-error');
    const { id, alGuardar } = est.form;
    const existente = id ? DB.buscar('productos', id) : null;
    const marcado = form.querySelector('[name=tipo_medida]:checked');
    const controla = f.controla.checked;
    let categoriaId = f.categoria_id.value ? +f.categoria_id.value : null;
    if (f.categoria_id.value === '__nueva') {
      try {
        const cat = Logica.guardarCategoria(f.categoria_nueva.value);
        f.categoria_id.insertAdjacentHTML('beforeend', `<option value="${cat.id}">${esc(cat.nombre)}</option>`);
        f.categoria_id.value = String(cat.id);
        $('#dlg [data-bloque=categoria-nueva]').hidden = true;
        categoriaId = cat.id;
      } catch (e) { err.textContent = e.message; return; }
    }
    const datos = {
      nombre: f.nombre.value, codigo: f.codigo.value, categoria_id: categoriaId,
      tipo_medida: marcado ? marcado.value : existente?.tipo_medida, controla_stock: controla,
      costo: num(f.costo.value), precio_venta: num(f.precio_venta.value),
      precio_mayorista: enteroONulo(f.precio_mayorista.value), cantidad_mayorista: enteroONulo(f.cantidad_mayorista.value),
      stock_minimo: controla ? num(f.stock_minimo.value) : 0
    };
    if (!id && controla) {
      const cantidad = num(f.ini_cantidad.value), vence = f.ini_vencimiento.value;
      if (f.ini_cantidad.value !== '' || vence) {
        if (!(cantidad > 0) || !vence) { err.textContent = 'Para cargar stock inicial completá la cantidad y el vencimiento.'; return; }
        datos.stockInicial = { cantidad, costo: datos.costo, fecha_vencimiento: vence };
      }
    }
    if (!est.form.confirmarDuplicado && datos.nombre.trim() && Logica.nombreDuplicado(datos.nombre, id)) {
      est.form.confirmarDuplicado = true;
      err.textContent = `Ya existe un producto llamado «${datos.nombre.trim()}». Si es otro distinto, tocá «Guardar producto» de nuevo.`;
      return;
    }
    try {
      const p = Logica.guardarProducto(datos, id);
      UI.cerrarDialogo();
      UI.avisar(id ? 'Cambios guardados' : 'Producto guardado');
      if (alGuardar) alGuardar(p); else UI.render();
    } catch (e) { err.textContent = e.message; est.form.confirmarDuplicado = false; }
  };

  App.acciones['producto-nuevo'] = () => abrirProducto();
  App.acciones['producto-editar'] = el => abrirProducto(+el.dataset.id);
  App.acciones['producto-baja'] = el => {
    const p = DB.buscar('productos', +el.dataset.id);
    if (!confirm(p.activo ? `¿Dar de baja «${p.nombre}»? Deja de aparecer en ventas y avisos, pero su historial se conserva.` : `¿Reactivar «${p.nombre}»?`)) return;
    Logica.cambiarActivo(p.id, !p.activo);
    UI.cerrarDialogo();
    UI.avisar(p.activo ? 'Producto reactivado' : 'Producto dado de baja');
    UI.render();
  };
  App.entradas['productos-buscar'] = el => { est.busqueda = el.value; $('#tbody-productos').innerHTML = filas(); };
  App.cambios['productos-categoria'] = el => { est.categoria = el.value ? +el.value : null; $('#tbody-productos').innerHTML = filas(); };
  App.cambios['productos-bajas'] = el => { est.bajas = el.checked; $('#tbody-productos').innerHTML = filas(); };

  // ---------- Categorías ----------
  function abrirCategorias() {
    const cats = Logica.categorias();
    UI.abrirDialogo({
      titulo: 'Categorías', subtitulo: 'Agrupan los productos en los informes de ventas.',
      cuerpo: `${H.error()}
        ${cats.length ? `<ul class="list-group mb-3">${cats.map(c => `<li class="list-group-item">
          <form class="d-flex align-items-center gap-2" data-enviar="categoria-guardar" data-id="${c.id}" novalidate>
            <input class="form-control form-control-sm" name="nombre" value="${esc(c.nombre)}" aria-label="Nombre de la categoría" autocomplete="off">
            <span class="badge text-bg-light border text-nowrap">${Logica.productosEnCategoria(c.id)} prod.</span>
            <button type="submit" class="btn btn-sm btn-outline-secondary" title="Guardar"><i class="bi bi-check-lg"></i></button>
            <button type="button" class="btn btn-sm btn-outline-danger" data-accion="categoria-borrar" data-id="${c.id}" aria-label="Borrar ${esc(c.nombre)}"><i class="bi bi-trash"></i></button>
          </form></li>`).join('')}</ul>` : H.vacio('Todavía no hay categorías.')}
        <form class="input-group" data-enviar="categoria-guardar" novalidate>
          <input class="form-control" name="nombre" placeholder="Nueva categoría" aria-label="Nueva categoría" autocomplete="off" data-foco>
          <button type="submit" class="btn btn-primary"><i class="bi bi-plus-lg"></i> Agregar</button>
        </form>`
    }, { ancho: 'chico' });
  }
  App.acciones['categorias-abrir'] = () => abrirCategorias();
  App.envios['categoria-guardar'] = form => {
    try {
      Logica.guardarCategoria(form.elements.nombre.value, form.dataset.id ? +form.dataset.id : null);
      UI.avisar('Categoría guardada');
      UI.render();
      abrirCategorias();
    } catch (e) { $('#dlg-error').textContent = e.message; }
  };
  App.acciones['categoria-borrar'] = el => {
    const id = +el.dataset.id, c = DB.buscar('categorias', id), n = Logica.productosEnCategoria(id);
    if (!confirm(`¿Borrar «${c.nombre}»?${n ? ` ${n} ${n === 1 ? 'producto queda' : 'productos quedan'} sin categoría.` : ''}`)) return;
    Logica.borrarCategoria(id);
    if (est.categoria === id) est.categoria = null;
    UI.render();
    abrirCategorias();
  };

  // ---------- Importar planilla ----------
  function abrirImportar() {
    const imp = est.importacion;
    let cuerpo, pie = '';
    if (!imp) {
      cuerpo = `
        <ol class="mb-3">
          <li>Exportá los productos de tu sistema anterior a Excel, o armá una planilla con la plantilla de ejemplo.</li>
          <li>Guardala como <strong>CSV</strong> (en Excel: Guardar como → CSV).</li>
          <li>Subila acá. Antes de importar vas a ver qué filas están bien y cuáles tienen errores.</li>
        </ol>
        <p class="small text-body-secondary">Columnas que se reconocen: nombre, código, categoría, tipo (unidad o peso), costo, precio (o ganancia), mínimo, stock y vencimiento. Obligatorias: nombre, costo y precio.</p>
        <div class="d-flex flex-wrap gap-2">
          <button type="button" class="btn btn-outline-secondary" data-accion="importar-plantilla"><i class="bi bi-download"></i> Descargar plantilla de ejemplo</button>
          <label class="btn btn-primary mb-0"><i class="bi bi-upload"></i> Elegir archivo CSV
            <input type="file" accept=".csv,.txt,text/csv" class="visually-hidden" data-cambio="importar-archivo"></label>
        </div>`;
    } else if (imp.error) {
      cuerpo = `<div class="alert alert-danger">${esc(imp.error)}</div>`;
      pie = '<button type="button" class="btn btn-outline-secondary" data-accion="importar-otro">Elegir otro archivo</button>';
    } else {
      const conError = imp.filas.length - imp.validas.length;
      cuerpo = `
        <p><strong>${imp.validas.length}</strong> ${imp.validas.length === 1 ? 'producto listo' : 'productos listos'} para importar${conError ? `. <span class="text-danger">${conError} con errores se van a omitir.</span>` : '.'}</p>
        <div class="table-responsive tabla-alta"><table class="table table-sm align-middle">
          <thead class="sticky-top"><tr><th>Fila</th><th>Producto</th><th class="num">Precio</th><th class="num">Stock</th><th>Estado</th></tr></thead>
          <tbody>${imp.filas.slice(0, 200).map(f => `<tr class="${f.errores.length ? 'table-danger' : ''}">
            <td>${f.fila}</td><td>${esc(f.datos.nombre || '(sin nombre)')}<span class="sub">${esc(f.datos.categoria)}</span></td>
            <td class="num">${f.datos.precio_venta > 0 ? Formato.plata(f.datos.precio_venta) : '—'}</td>
            <td class="num">${f.datos.stock ? Formato.cantidad(f.datos, f.datos.stock) : '—'}</td>
            <td class="small">${f.errores.length ? `<span class="text-danger">${esc(f.errores.join('. '))}</span>`
              : f.avisos.length ? `<span class="text-warning-emphasis">${esc(f.avisos.join('. '))}</span>` : '<i class="bi bi-check-circle text-success"></i> Bien'}</td>
          </tr>`).join('')}</tbody>
        </table></div>`;
      pie = `<button type="button" class="btn btn-outline-secondary me-auto" data-accion="importar-otro">Elegir otro archivo</button>
        <button type="button" class="btn btn-primary" data-accion="importar-confirmar" ${imp.validas.length ? '' : 'disabled'}>Importar ${imp.validas.length} productos</button>`;
    }
    UI.abrirDialogo({ titulo: 'Importar productos desde una planilla', cuerpo, pie }, { ancho: 'normal' });
  }
  App.acciones['importar-abrir'] = () => { est.importacion = null; abrirImportar(); };
  App.acciones['importar-otro'] = () => { est.importacion = null; abrirImportar(); };
  App.acciones['importar-plantilla'] = () => {
    const blob = new Blob(['\uFEFF' + Logica.plantillaCSV()], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'plantilla-productos.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  App.cambios['importar-archivo'] = el => {
    const archivo = el.files[0];
    if (!archivo) return;
    const leer = cod => new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsText(archivo, cod); });
    leer('utf-8').then(t => (t.includes('\uFFFD') ? leer('windows-1252') : t))
      .then(t => { est.importacion = Logica.analizarImportacion(t); abrirImportar(); });
  };
  App.acciones['importar-confirmar'] = () => {
    try {
      const n = Logica.importarProductos(est.importacion.validas);
      est.importacion = null;
      UI.cerrarDialogo();
      UI.avisar(`${n} productos importados`);
      UI.render();
    } catch (e) { est.importacion = { error: e.message }; abrirImportar(); }
  };
})();
