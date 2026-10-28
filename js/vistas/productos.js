/* Productos: catálogo, categorías e importación desde planilla. */
(function () {
  const est = App.estado.productos = { busqueda: '', categoria: null, bajas: false, form: null, importacion: null };

  App.vistas.productos = function () {
    UI.vista().innerHTML = `
      <div class="titulo-fila">
        <h1>Productos</h1>
        <div class="fila-botones">
          <button type="button" class="boton boton-sec" data-accion="categorias-abrir">Categorías</button>
          <button type="button" class="boton boton-sec" data-accion="importar-abrir">Importar planilla</button>
          <button type="button" class="boton" data-accion="producto-nuevo">Nuevo producto</button>
        </div>
      </div>
      <div class="herramientas">
        <label class="campo campo-buscar"><span class="solo-lector">Buscar productos</span>
          <input type="search" placeholder="Buscar por nombre o código" data-input="productos-buscar" value="${esc(est.busqueda)}">
        </label>
        <label class="campo campo-filtro"><span class="solo-lector">Filtrar por categoría</span>
          <select data-cambio="productos-categoria">${UI.opcionesCategorias(est.categoria, { conTodas: true })}</select>
        </label>
        <label class="opcion"><input type="checkbox" data-cambio="productos-bajas" ${est.bajas ? 'checked' : ''}> Mostrar dados de baja</label>
      </div>
      <div class="tabla-envoltura">
        <table class="tabla">
          <thead><tr>
            <th scope="col">Producto</th><th scope="col" class="num">Precio</th>
            <th scope="col" class="num">Stock</th><th scope="col" class="num">Mínimo</th><th scope="col">Estado</th>
          </tr></thead>
          <tbody id="tbody-productos">${filas()}</tbody>
        </table>
      </div>`;
  };

  function filas() {
    const lista = Logica.buscarProductos(est.busqueda, { incluirBajas: est.bajas, categoriaId: est.categoria });
    if (!lista.length) {
      return `<tr><td colspan="5" class="vacio">${DB.todos('productos').length
        ? 'No hay productos que coincidan.'
        : 'Todavía no hay productos. Cargá el primero o importá una planilla.'}</td></tr>`;
    }
    return lista.map(p => {
      const vencido = p.controla_stock ? Logica.stockVencido(p.id) : 0;
      return `<tr class="${p.activo ? '' : 'fila-baja'}">
        <td><button type="button" class="enlace" data-accion="producto-editar" data-id="${p.id}">${esc(p.nombre)}</button>
          <span class="sub">${esc([Logica.nombreCategoria(p.categoria_id), p.codigo].filter(Boolean).join(', '))}</span></td>
        <td class="num">${Formato.plata(p.precio_venta)}<span class="sub">${Formato.porUnidad(p)}</span>
          ${p.precio_mayorista ? `<span class="sub">x mayor ${Formato.plata(p.precio_mayorista)}</span>` : ''}</td>
        <td class="num">${p.controla_stock ? Formato.cantidad(p, Logica.stockVigente(p.id)) : '—'}
          ${vencido ? `<span class="sub texto-rojo">+ ${Formato.cantidad(p, vencido)} vencidas</span>` : ''}</td>
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
    const unidadPrecio = tipo === 'peso' ? 'por kg' : 'por unidad';
    const unidadStock = tipo === 'peso' ? 'gramos' : 'unidades';
    const radio = (valor, texto) => `<label class="opcion"><input type="radio" name="tipo_medida" value="${valor}"
      data-cambio="pf-tipo" ${tipo === valor ? 'checked' : ''} ${bloqueado ? 'disabled' : ''}> ${texto}</label>`;

    const hoy = Fechas.hoy();
    const filaLote = l => {
      const dias = Fechas.diasEntre(hoy, l.fecha_vencimiento);
      let e = '<span class="etiqueta etiqueta-verde">Vigente</span>';
      if (l.cantidad_actual === 0) e = '<span class="etiqueta etiqueta-gris">Agotado</span>';
      else if (dias < 0) e = '<span class="etiqueta etiqueta-rojo">Vencido</span>';
      else if (dias <= DB.data.config.diasAviso) e = '<span class="etiqueta etiqueta-ambar">Por vencer</span>';
      return `<tr><td>${l.id}</td><td>${Formato.fecha(l.fecha_vencimiento)}</td>
        <td class="num">${Formato.cantidad(p, l.cantidad_inicial)}</td><td class="num">${Formato.cantidad(p, l.cantidad_actual)}</td>
        <td class="num">${Formato.plata(l.costo)}</td><td>${e}</td></tr>`;
    };

    UI.abrirDialogo(`
      <form class="dlg-cuerpo" data-enviar="producto" novalidate>
        ${UI.cabecera(p ? 'Editar producto' : 'Nuevo producto')}
        <p class="error" id="dlg-error" role="alert"></p>
        <div class="grilla-form">
          <label class="campo ancho">Nombre
            <input name="nombre" value="${esc(p?.nombre)}" autocomplete="off" data-foco>
          </label>
          <label class="campo">Código de barras <span class="opcional">(opcional)</span>
            <input name="codigo" value="${esc(p?.codigo)}" inputmode="numeric" autocomplete="off">
          </label>
          <label class="campo">Categoría
            <select name="categoria_id" data-cambio="pf-categoria">${UI.opcionesCategorias(p?.categoria_id || null, { conNueva: true })}</select>
          </label>
          <label class="campo ancho" data-bloque="categoria-nueva" hidden>Nombre de la categoría nueva
            <input name="categoria_nueva" autocomplete="off">
          </label>
          <fieldset class="campo ancho">
            <legend>Se vende</legend>
            <div class="opciones">${radio('unidad', 'Por unidad')}${radio('peso', 'Por peso (stock en gramos, precio por kg)')}</div>
            ${bloqueado ? '<p class="ayuda">No se puede cambiar porque el producto ya tiene mercadería cargada.</p>' : ''}
          </fieldset>
          <label class="campo">Costo <span data-unidad-precio>${unidadPrecio}</span>
            <input name="costo" type="number" min="1" step="1" inputmode="numeric" value="${p ? p.costo : ''}" data-input="pf-costo">
          </label>
          <label class="campo">Ganancia (%)
            <input name="porcentaje" type="number" min="0" step="0.1" inputmode="decimal" value="${p ? p.porcentaje : 30}" data-input="pf-pct">
          </label>
          <label class="campo ancho">Precio de venta <span data-unidad-precio>${unidadPrecio}</span>
            <input name="precio_venta" type="number" min="1" step="1" inputmode="numeric" value="${p ? p.precio_venta : ''}" data-input="pf-precio">
            <span class="ayuda">Se calcula con el costo y el porcentaje. Si lo cambiás a mano, se ajusta el porcentaje.</span>
          </label>
          <details class="ancho desplegable" ${p?.precio_mayorista ? 'open' : ''}>
            <summary>Precio por mayor <span class="opcional">(opcional)</span></summary>
            <div class="grilla-form">
              <label class="campo">Precio por mayor <span data-unidad-precio>${unidadPrecio}</span>
                <input name="precio_mayorista" type="number" min="1" step="1" inputmode="numeric" value="${p?.precio_mayorista ?? ''}" data-input="pf-mayor">
              </label>
              <label class="campo">A partir de (<span data-unidad-stock>${unidadStock}</span>)
                <input name="cantidad_mayorista" type="number" min="2" step="1" inputmode="numeric" value="${p?.cantidad_mayorista ?? ''}">
              </label>
            </div>
            <p class="ayuda" id="pf-mayor-ayuda">Cuando en una venta se lleve esa cantidad o más, se cobra este precio automáticamente.</p>
          </details>
          <label class="opcion ancho caja-opcion">
            <input type="checkbox" name="controla" data-cambio="pf-controla" ${controla ? 'checked' : ''}>
            <span><strong>Controlar stock y vencimientos</strong><br>
            <span class="ayuda">Desmarcalo para cosas como recargas o servicios: se venden sin descontar stock.</span></span>
          </label>
          <label class="campo ancho" data-solo-stock ${controla ? '' : 'hidden'}>Stock mínimo en <span data-unidad-stock>${unidadStock}</span>
            <input name="stock_minimo" type="number" min="0" step="1" inputmode="numeric"
              value="${p ? p.stock_minimo : Logica.MINIMO_SUGERIDO[tipo]}" data-input="pf-minimo">
            <span class="ayuda">No es el stock que hay: es el límite. Con esta cantidad o menos, aparece en «Poco stock».</span>
          </label>
        </div>
        ${p ? (lotes.length ? `
          <h3>Lotes</h3>
          <div class="tabla-envoltura"><table class="tabla tabla-chica">
            <thead><tr><th scope="col">Lote</th><th scope="col">Vence</th><th scope="col" class="num">Entró</th>
              <th scope="col" class="num">Queda</th><th scope="col" class="num">Costo</th><th scope="col">Estado</th></tr></thead>
            <tbody>${lotes.slice().reverse().map(filaLote).join('')}</tbody>
          </table></div>` : '') : `
          <fieldset class="panel-gris" data-solo-stock ${controla ? '' : 'hidden'}>
            <legend>Stock inicial <span class="opcional">(opcional)</span></legend>
            <p class="ayuda">Si ya tenés este producto en el almacén, cargalo acá y se crea su primer lote.</p>
            <div class="grilla-form">
              <label class="campo">Cantidad en <span data-unidad-stock>${unidadStock}</span>
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
      </form>`, { ancho: 'grande' });
  }
  App.abrirProducto = abrirProducto; // lo usa también la pantalla de mercadería

  function recalcularPrecio(form) {
    const f = form.elements;
    const costo = num(f.costo.value), pct = num(f.porcentaje.value);
    if (costo > 0 && pct >= 0) f.precio_venta.value = Logica.precioDesdePorcentaje(costo, pct);
  }

  App.entradas['pf-costo'] = el => recalcularPrecio(el.form);
  App.entradas['pf-pct'] = el => recalcularPrecio(el.form);
  App.entradas['pf-precio'] = el => {
    const f = el.form.elements;
    const costo = num(f.costo.value), precio = num(f.precio_venta.value);
    if (costo > 0 && precio > 0) f.porcentaje.value = Logica.porcentajeDesdePrecio(costo, precio);
  };
  App.entradas['pf-mayor'] = el => {
    const f = el.form.elements;
    const costo = num(f.costo.value), may = num(f.precio_mayorista.value);
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
  App.cambios['pf-controla'] = el => {
    $$('#dlg [data-solo-stock]').forEach(b => { b.hidden = !el.checked; });
  };
  App.cambios['pf-categoria'] = el => {
    const nueva = $('#dlg [data-bloque=categoria-nueva]');
    nueva.hidden = el.value !== '__nueva';
    if (!nueva.hidden) el.form.elements.categoria_nueva.focus();
  };

  App.envios.producto = form => {
    const f = form.elements;
    const err = $('#dlg-error');
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
      nombre: f.nombre.value,
      codigo: f.codigo.value,
      categoria_id: categoriaId,
      tipo_medida: marcado ? marcado.value : existente?.tipo_medida,
      controla_stock: controla,
      costo: num(f.costo.value),
      precio_venta: num(f.precio_venta.value),
      precio_mayorista: enteroONulo(f.precio_mayorista.value),
      cantidad_mayorista: enteroONulo(f.cantidad_mayorista.value),
      stock_minimo: controla ? num(f.stock_minimo.value) : 0
    };
    if (!id && controla) {
      const cantidad = num(f.ini_cantidad.value);
      const vence = f.ini_vencimiento.value;
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
    } catch (e) {
      err.textContent = e.message;
      est.form.confirmarDuplicado = false;
    }
  };

  App.acciones['producto-nuevo'] = () => abrirProducto();
  App.acciones['producto-editar'] = el => abrirProducto(+el.dataset.id);
  App.acciones['producto-baja'] = el => {
    const p = DB.buscar('productos', +el.dataset.id);
    const pregunta = p.activo
      ? `¿Dar de baja «${p.nombre}»? Deja de aparecer en ventas y avisos, pero su historial se conserva.`
      : `¿Reactivar «${p.nombre}»?`;
    if (!confirm(pregunta)) return;
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
    UI.abrirDialogo(`
      <div class="dlg-cuerpo">
        ${UI.cabecera('Categorías', 'Agrupan los productos en los informes de ventas.')}
        <p class="error" id="dlg-error" role="alert"></p>
        ${cats.length ? `<ul class="lista-editable">${cats.map(c => `<li>
          <form data-enviar="categoria-guardar" data-id="${c.id}" class="fila-categoria" novalidate>
            <label class="solo-lector" for="cat-${c.id}">Nombre</label>
            <input id="cat-${c.id}" name="nombre" value="${esc(c.nombre)}" autocomplete="off">
            <span class="sub">${Logica.productosEnCategoria(c.id)} prod.</span>
            <button type="submit" class="boton boton-sec boton-chico">Guardar</button>
            <button type="button" class="boton-icono" data-accion="categoria-borrar" data-id="${c.id}" aria-label="Borrar ${esc(c.nombre)}">×</button>
          </form></li>`).join('')}</ul>` : '<p class="vacio">Todavía no hay categorías.</p>'}
        <form data-enviar="categoria-guardar" class="fila-categoria nueva" novalidate>
          <label class="solo-lector" for="cat-nueva">Nueva categoría</label>
          <input id="cat-nueva" name="nombre" placeholder="Nueva categoría" autocomplete="off" data-foco>
          <button type="submit" class="boton boton-chico">Agregar</button>
        </form>
      </div>`, { ancho: 'chico' });
  }

  App.acciones['categorias-abrir'] = () => abrirCategorias();
  App.envios['categoria-guardar'] = form => {
    try {
      Logica.guardarCategoria(form.elements.nombre.value, form.dataset.id ? +form.dataset.id : null);
      UI.avisar('Categoría guardada');
      UI.render();
      abrirCategorias();
    } catch (e) {
      $('#dlg-error').textContent = e.message;
    }
  };
  App.acciones['categoria-borrar'] = el => {
    const id = +el.dataset.id;
    const c = DB.buscar('categorias', id);
    const n = Logica.productosEnCategoria(id);
    if (!confirm(`¿Borrar «${c.nombre}»?${n ? ` ${n} ${n === 1 ? 'producto queda' : 'productos quedan'} sin categoría.` : ''}`)) return;
    Logica.borrarCategoria(id);
    if (est.categoria === id) est.categoria = null;
    UI.render();
    abrirCategorias();
  };

  // ---------- Importar planilla ----------
  function abrirImportar() {
    const imp = est.importacion;
    let cuerpo;
    if (!imp) {
      cuerpo = `
        <ol class="pasos-lista">
          <li>Exportá los productos de tu sistema anterior a Excel, o armá una planilla con la plantilla de ejemplo.</li>
          <li>Guardala como <strong>CSV</strong> (en Excel: Guardar como → CSV delimitado por comas o punto y coma).</li>
          <li>Subila acá. Antes de importar vas a ver qué filas están bien y cuáles tienen errores.</li>
        </ol>
        <p class="ayuda">Columnas que se reconocen: nombre, código, categoría, tipo (unidad o peso), costo, precio (o ganancia), mínimo, stock y vencimiento. Las obligatorias son nombre, costo y precio.</p>
        <div class="fila-botones">
          <button type="button" class="boton boton-sec" data-accion="importar-plantilla">Descargar plantilla de ejemplo</button>
          <label class="boton">Elegir archivo CSV
            <input type="file" accept=".csv,.txt,text/csv" class="solo-lector" data-cambio="importar-archivo">
          </label>
        </div>`;
    } else if (imp.error) {
      cuerpo = `<p class="error">${esc(imp.error)}</p>
        <button type="button" class="boton boton-sec" data-accion="importar-otro">Elegir otro archivo</button>`;
    } else {
      const conError = imp.filas.length - imp.validas.length;
      cuerpo = `
        <p class="resumen-linea"><strong>${imp.validas.length}</strong> ${imp.validas.length === 1 ? 'producto listo' : 'productos listos'} para importar${conError ? `. <span class="texto-rojo">${conError} con errores se van a omitir.</span>` : '.'}</p>
        <div class="tabla-envoltura tabla-alta"><table class="tabla tabla-chica">
          <thead><tr><th scope="col">Fila</th><th scope="col">Producto</th><th scope="col" class="num">Precio</th><th scope="col" class="num">Stock</th><th scope="col">Estado</th></tr></thead>
          <tbody>${imp.filas.slice(0, 200).map(f => `<tr class="${f.errores.length ? 'fila-error' : ''}">
            <td>${f.fila}</td><td>${esc(f.datos.nombre || '(sin nombre)')}<span class="sub">${esc(f.datos.categoria)}</span></td>
            <td class="num">${f.datos.precio_venta > 0 ? Formato.plata(f.datos.precio_venta) : '—'}</td>
            <td class="num">${f.datos.stock ? Formato.cantidad(f.datos, f.datos.stock) : '—'}</td>
            <td>${f.errores.length ? `<span class="texto-rojo">${esc(f.errores.join('. '))}</span>`
              : f.avisos.length ? `<span class="texto-ambar">${esc(f.avisos.join('. '))}</span>` : 'Bien'}</td>
          </tr>`).join('')}</tbody>
        </table></div>
        <div class="dlg-pie">
          <button type="button" class="boton boton-sec" data-accion="importar-otro">Elegir otro archivo</button>
          <span class="espacio"></span>
          <button type="button" class="boton" data-accion="importar-confirmar" ${imp.validas.length ? '' : 'disabled'}>Importar ${imp.validas.length} productos</button>
        </div>`;
    }
    UI.abrirDialogo(`<div class="dlg-cuerpo">${UI.cabecera('Importar productos desde una planilla')}${cuerpo}</div>`, { ancho: 'grande' });
  }

  App.acciones['importar-abrir'] = () => { est.importacion = null; abrirImportar(); };
  App.acciones['importar-otro'] = () => { est.importacion = null; abrirImportar(); };
  App.acciones['importar-plantilla'] = () => {
    const blob = new Blob(['\uFEFF' + Logica.plantillaCSV()], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'plantilla-productos.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  App.cambios['importar-archivo'] = el => {
    const archivo = el.files[0];
    if (!archivo) return;
    const leer = codificacion => new Promise(res => {
      const r = new FileReader();
      r.onload = () => res(r.result);
      r.readAsText(archivo, codificacion);
    });
    // Excel en Windows suele guardar en Windows-1252: si aparecen caracteres rotos, se relee así.
    leer('utf-8')
      .then(texto => (texto.includes('\uFFFD') ? leer('windows-1252') : texto))
      .then(texto => { est.importacion = Logica.analizarImportacion(texto); abrirImportar(); });
  };
  App.acciones['importar-confirmar'] = () => {
    try {
      const n = Logica.importarProductos(est.importacion.validas);
      est.importacion = null;
      UI.cerrarDialogo();
      UI.avisar(`${n} productos importados`);
      UI.render();
    } catch (e) {
      est.importacion = { error: e.message };
      abrirImportar();
    }
  };
})();
