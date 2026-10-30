/* Mercadería: ingresar lotes, inventario valorizado, ajustes y movimientos. */
(function () {
  const est = App.estado;
  est.mercTab = 'ingresar';
  est.inventarioBusqueda = '';

  function nuevoIngreso(p = null) {
    return { producto_id: p ? p.id : null, lineas: [{ cantidad: '', costo: p ? String(p.costo) : '', vencimiento: '' }],
      actualizarPrecio: true, busqueda: '', pagarCaja: false, montoPago: '', montoTocado: false };
  }
  est.ingreso = nuevoIngreso();

  App.vistas.mercaderia = function () {
    if (est.reponerId) { est.ingreso = nuevoIngreso(DB.buscar('productos', est.reponerId)); est.reponerId = null; }
    const tab = (id, icono, texto) => `<li class="nav-item" role="presentation">
      <button type="button" class="nav-link ${est.mercTab === id ? 'active' : ''}" role="tab" aria-selected="${est.mercTab === id}" data-accion="merc-tab" data-tab="${id}"><i class="bi bi-${icono}"></i> ${texto}</button></li>`;
    UI.vista().innerHTML = `
      ${H.tituloPagina('Mercadería')}
      <ul class="nav nav-tabs mb-4" role="tablist">${tab('ingresar', 'box-arrow-in-down', 'Ingresar')}${tab('inventario', 'clipboard-data', 'Inventario')}</ul>
      ${est.mercTab === 'ingresar' ? ingresar() : inventario()}`;
    if (est.mercTab === 'ingresar') UI.enfocar(est.ingreso.producto_id ? $('[data-campo=cantidad]') : $('#ingreso-buscar'));
  };

  // ---------- Ingresar ----------
  function ingresar() {
    const ing = est.ingreso;
    const p = ing.producto_id ? DB.buscar('productos', ing.producto_id) : null;
    const ultimos = DB.todos('lotes').slice().sort((a, b) => b.id - a.id).slice(0, 6);
    return `
      <div class="row g-4">
        <div class="col-12">
          <section class="card shadow-sm"><div class="card-body">
            <h2 class="h5"><span class="badge rounded-pill text-bg-primary me-1">1</span> Producto</h2>
            ${p ? `<div class="d-flex flex-wrap justify-content-between align-items-start gap-2">
                <div><div class="fs-5 fw-bold">${esc(p.nombre)}</div>
                  <div class="small text-body-secondary">Stock actual: ${Formato.cantidad(p, Logica.stockVigente(p.id))}. Costo: ${Formato.plata(p.costo)} ${Formato.porUnidad(p)}. Precio de venta: ${Formato.plata(p.precio_venta)} (${Formato.numero(p.porcentaje)} %).</div></div>
                <button type="button" class="btn btn-outline-secondary" data-accion="ingreso-cambiar">Cambiar</button>
              </div>` : `
              <div class="input-group mb-2"><span class="input-group-text"><i class="bi bi-upc-scan"></i></span>
                <input type="search" class="form-control" id="ingreso-buscar" placeholder="Escaneá o buscá por nombre" aria-label="Escaneá o buscá por nombre"
                  data-input="ingreso-buscar" data-enter="ingreso-enter" autocomplete="off" value="${esc(ing.busqueda)}"></div>
              <div id="ingreso-resultados">${UI.listaProductos(Logica.buscarProductos(ing.busqueda, { soloConStock: true }), 'ingreso-elegir')}</div>
              ${UI.esAdmin() ? '<p class="small mt-2 mb-0">¿No está en la lista? <button type="button" class="btn btn-link btn-sm p-0 align-baseline" data-accion="ingreso-nuevo">Crear producto nuevo</button></p>' : ''}`}
          </div></section>
        </div>
        ${p ? `<div class="col-12">${lineas(p)}</div>` : ''}
      </div>
      <section class="mt-4">
        <h2 class="h5">Últimos ingresos</h2>
        ${ultimos.length ? `<div class="card shadow-sm"><div class="table-responsive"><table class="table table-hover align-middle mb-0">
          <thead><tr><th>Ingresó</th><th>Producto</th><th class="num">Cantidad</th><th class="num">Costo</th><th>Vence</th></tr></thead>
          <tbody>${ultimos.map(l => { const pr = DB.buscar('productos', l.producto_id); return `<tr><td>${Formato.fecha(l.fecha_ingreso)}</td><td>${esc(pr.nombre)}</td>
            <td class="num">${Formato.cantidad(pr, l.cantidad_inicial)}</td><td class="num">${Formato.plata(l.costo)}</td><td>${Formato.fecha(l.fecha_vencimiento)}</td></tr>`; }).join('')}</tbody>
        </table></div></div>` : H.vacio('Todavía no se ingresó mercadería.')}
      </section>`;
  }

  function lineas(p) {
    const ing = est.ingreso, caja = Logica.cajaAbierta();
    return `<section class="card shadow-sm"><div class="card-body">
      <h2 class="h5"><span class="badge rounded-pill text-bg-primary me-1">2</span> Lo que llegó</h2>
      <p class="small text-body-secondary">Cada línea es un lote. Si vienen paquetes con distinto vencimiento, cargalos en líneas separadas.</p>
      ${ing.lineas.map((l, i) => `<div class="row g-2 align-items-end">
        <div class="col-6 col-md">${H.campo(`Cantidad en ${p.tipo_medida === 'peso' ? 'gramos' : 'unidades'}`,
          `<input class="form-control" type="number" min="1" step="1" inputmode="numeric" value="${esc(l.cantidad)}" data-input="ingreso-linea" data-i="${i}" data-campo="cantidad">`)}</div>
        <div class="col-6 col-md">${H.campo(`Costo ${Formato.porUnidad(p)}`,
          `<div class="input-group"><span class="input-group-text">$</span><input class="form-control" type="number" min="1" step="1" inputmode="numeric" value="${esc(l.costo)}" data-input="ingreso-linea" data-i="${i}" data-campo="costo"></div>`)}</div>
        <div class="col-10 col-md">${H.campo('Vence el', `<input class="form-control" type="date" min="${Fechas.hoy()}" value="${esc(l.vencimiento)}" data-input="ingreso-linea" data-i="${i}" data-campo="vencimiento">`)}</div>
        <div class="col-2 col-md-auto mb-3">${ing.lineas.length > 1 ? `<button type="button" class="btn btn-outline-secondary" data-accion="ingreso-quitar" data-i="${i}" aria-label="Quitar línea ${i + 1}"><i class="bi bi-x-lg"></i></button>` : ''}</div>
      </div>`).join('')}
      <button type="button" class="btn btn-link btn-sm p-0 mb-3" data-accion="ingreso-linea-mas"><i class="bi bi-plus-circle"></i> Agregar otra línea con otro vencimiento</button>
      <div id="aviso-costo">${avisoCosto(p)}</div>
      <div class="card card-body bg-body-tertiary border-0 mb-3">
        ${caja ? `
          <div class="form-check form-switch mb-0">
            <input class="form-check-input" type="checkbox" role="switch" id="pagar-caja" data-cambio="ingreso-pagar" ${ing.pagarCaja ? 'checked' : ''}>
            <label class="form-check-label" for="pagar-caja">Lo pagué con efectivo de la caja</label>
          </div>
          <div data-bloque="pago" class="mt-3" style="max-width: 16rem" ${ing.pagarCaja ? '' : 'hidden'}>
            ${H.campo('Monto pagado', `<div class="input-group"><span class="input-group-text">$</span><input class="form-control" type="number" min="1" step="1" inputmode="numeric" value="${esc(montoPago(p))}" data-input="ingreso-monto"></div>`,
              'Se registra como salida de caja: pago a proveedor.', 'mb-0')}
          </div>`
        : '<p class="small text-body-secondary mb-0"><i class="bi bi-info-circle"></i> Si pagaste esta mercadería con efectivo de la caja, abrí la caja para registrarlo junto con el ingreso.</p>'}
      </div>
      ${H.error('ingreso-error')}
      <button type="button" class="btn btn-primary" data-accion="ingreso-guardar"><i class="bi bi-check-lg"></i> Guardar ingreso</button>
    </div></section>`;
  }

  const lineasNumericas = () => est.ingreso.lineas.map(l => ({ cantidad: num(l.cantidad), costo: num(l.costo), fecha_vencimiento: l.vencimiento }));
  function montoPago(p) {
    if (est.ingreso.montoTocado) return est.ingreso.montoPago;
    const total = Logica.costoDeLineas(p, lineasNumericas());
    return total > 0 ? String(total) : '';
  }
  function avisoCosto(p) {
    const ultima = est.ingreso.lineas[est.ingreso.lineas.length - 1];
    const costo = Math.round(num(ultima.costo));
    if (!(costo > 0) || costo === p.costo) return '';
    const nuevoPrecio = Logica.precioDesdePorcentaje(costo, p.porcentaje);
    const margen = Logica.porcentajeDesdePrecio(costo, p.precio_venta);
    return `<div class="alert alert-warning">
      <p class="mb-2"><i class="bi bi-exclamation-triangle"></i> El costo ${costo > p.costo ? 'subió' : 'bajó'} de ${Formato.plata(p.costo)} a ${Formato.plata(costo)} ${Formato.porUnidad(p)}.</p>
      ${H.check(`data-cambio="ingreso-actualizar" ${est.ingreso.actualizarPrecio ? 'checked' : ''}`,
        `Actualizar el precio de venta a ${Formato.plata(nuevoPrecio)} (mantiene el ${Formato.numero(p.porcentaje)} %)`, '', 'checkbox', 'mb-0')}
      ${est.ingreso.actualizarPrecio ? '' : `<div class="small mt-2">El precio queda en ${Formato.plata(p.precio_venta)} y la ganancia pasa a ${Formato.numero(margen)} %.</div>`}
    </div>`;
  }

  const redibujar = () => App.vistas.mercaderia();
  App.acciones['merc-tab'] = el => { est.mercTab = el.dataset.tab; redibujar(); };
  App.entradas['ingreso-buscar'] = el => {
    est.ingreso.busqueda = el.value;
    $('#ingreso-resultados').innerHTML = UI.listaProductos(Logica.buscarProductos(el.value, { soloConStock: true }), 'ingreso-elegir');
  };
  App.acciones['ingreso-enter'] = el => {
    const exacto = Logica.productoPorCodigo(el.value);
    if (exacto && exacto.controla_stock) { est.ingreso = nuevoIngreso(exacto); redibujar(); return; }
    const primero = $('#ingreso-resultados .resultado');
    if (primero) primero.click();
  };
  App.acciones['ingreso-elegir'] = el => { est.ingreso = nuevoIngreso(DB.buscar('productos', +el.dataset.id)); redibujar(); };
  App.acciones['ingreso-cambiar'] = () => { est.ingreso = nuevoIngreso(); redibujar(); };
  App.acciones['ingreso-nuevo'] = () => App.abrirProducto(null, p => {
    est.mercTab = 'ingresar';
    est.ingreso = p.controla_stock ? nuevoIngreso(p) : nuevoIngreso();
    UI.navegar('mercaderia');
  });
  App.acciones['ingreso-linea-mas'] = () => {
    const ultima = est.ingreso.lineas[est.ingreso.lineas.length - 1];
    est.ingreso.lineas.push({ cantidad: '', costo: ultima.costo, vencimiento: '' });
    redibujar();
    const campos = $$('[data-campo=cantidad]');
    campos[campos.length - 1].focus();
  };
  App.acciones['ingreso-quitar'] = el => { est.ingreso.lineas.splice(+el.dataset.i, 1); redibujar(); };
  App.entradas['ingreso-linea'] = el => {
    est.ingreso.lineas[+el.dataset.i][el.dataset.campo] = el.value;
    $('#ingreso-error').textContent = '';
    const p = DB.buscar('productos', est.ingreso.producto_id);
    if (el.dataset.campo === 'costo') $('#aviso-costo').innerHTML = avisoCosto(p);
    const monto = $('[data-input=ingreso-monto]');
    if (monto && !est.ingreso.montoTocado) monto.value = montoPago(p);
  };
  App.cambios['ingreso-actualizar'] = el => {
    est.ingreso.actualizarPrecio = el.checked;
    $('#aviso-costo').innerHTML = avisoCosto(DB.buscar('productos', est.ingreso.producto_id));
  };
  App.cambios['ingreso-pagar'] = el => { est.ingreso.pagarCaja = el.checked; $('[data-bloque=pago]').hidden = !el.checked; };
  App.entradas['ingreso-monto'] = el => { est.ingreso.montoPago = el.value; est.ingreso.montoTocado = true; };
  App.acciones['ingreso-guardar'] = () => {
    const ing = est.ingreso, p = DB.buscar('productos', ing.producto_id);
    const pagoCaja = ing.pagarCaja && Logica.cajaAbierta() ? num(montoPago(p)) : null;
    try {
      const lotes = Logica.ingresarMercaderia(p.id, lineasNumericas(), { actualizarPrecio: ing.actualizarPrecio, pagoCaja });
      const total = lotes.reduce((s, l) => s + l.cantidad_inicial, 0);
      UI.avisar(`Ingreso guardado: ${Formato.cantidad(p, total)} de ${p.nombre}${pagoCaja ? `. Salieron ${Formato.plata(pagoCaja)} de la caja` : ''}`);
      est.ingreso = nuevoIngreso();
      UI.render();
    } catch (e) { $('#ingreso-error').textContent = e.message; }
  };

  // ---------- Inventario ----------
  function inventario() {
    const inv = Logica.inventario();
    return `
      <div class="row g-3 mb-2">
        <div class="col-md-4"><div class="card shadow-sm h-100"><div class="card-body"><div class="small text-body-secondary">Valor de la mercadería</div><div class="fs-3 fw-bold">${Formato.plata(inv.valorTotal)}</div></div></div></div>
        <div class="col-md-4"><div class="card shadow-sm h-100"><div class="card-body"><div class="small text-body-secondary">Productos con stock</div><div class="fs-3 fw-bold">${inv.conStock}</div></div></div></div>
        <div class="col-md-4"><div class="card shadow-sm h-100 ${inv.valorVencido ? 'border-danger' : ''}"><div class="card-body"><div class="small text-body-secondary">Vencido sin sacar</div><div class="fs-3 fw-bold ${inv.valorVencido ? 'text-danger' : ''}">${Formato.plata(inv.valorVencido)}</div></div></div></div>
      </div>
      <p class="small text-body-secondary">El valor se calcula con el costo de cada lote. No incluye lo vencido.</p>
      <div class="input-group mb-3"><span class="input-group-text"><i class="bi bi-search"></i></span>
        <input type="search" class="form-control" placeholder="Buscar producto" aria-label="Buscar en el inventario" data-input="inventario-buscar" value="${esc(est.inventarioBusqueda)}"></div>
      <div class="card shadow-sm"><div class="table-responsive">
        <table class="table table-hover align-middle mb-0">
          <thead><tr><th>Producto</th><th class="num">Stock</th><th>Próximo vencimiento</th><th class="num">Valor</th><th></th></tr></thead>
          <tbody id="tbody-inventario">${filasInventario(inv)}</tbody>
        </table>
      </div></div>`;
  }
  function filasInventario(inv = Logica.inventario()) {
    const t = normalizar(est.inventarioBusqueda);
    const filas = inv.filas.filter(f => !t || normalizar(f.producto.nombre).includes(t));
    if (!filas.length) return '<tr><td colspan="5" class="text-body-secondary fst-italic">No hay productos que coincidan.</td></tr>';
    return filas.map(f => `<tr>
      <td>${esc(f.producto.nombre)}<span class="sub">${esc(Logica.nombreCategoria(f.producto.categoria_id))}</span></td>
      <td class="num">${Formato.cantidad(f.producto, f.stock)}${f.vencido ? `<span class="sub text-danger">+ ${Formato.cantidad(f.producto, f.vencido)} vencidas</span>` : ''}</td>
      <td>${f.proximo ? Formato.fecha(f.proximo) : '—'}</td>
      <td class="num">${Formato.plata(f.valor)}</td>
      <td class="text-end text-nowrap">
        <div class="btn-group btn-group-sm">
          <button type="button" class="btn btn-outline-secondary" data-accion="ajuste-abrir" data-id="${f.producto.id}" ${f.stock + f.vencido ? '' : 'disabled'}><i class="bi bi-dash-circle"></i> Ajustar</button>
          <button type="button" class="btn btn-outline-secondary" data-accion="movimientos-abrir" data-id="${f.producto.id}"><i class="bi bi-clock-history"></i> Movimientos</button>
        </div>
      </td></tr>`).join('');
  }
  App.entradas['inventario-buscar'] = el => { est.inventarioBusqueda = el.value; $('#tbody-inventario').innerHTML = filasInventario(); };

  App.acciones['ajuste-abrir'] = el => {
    const p = DB.buscar('productos', +el.dataset.id);
    const lotes = Logica.lotesDe(p.id).filter(l => l.cantidad_actual > 0);
    const hoy = Fechas.hoy();
    UI.abrirDialogo({
      titulo: 'Sacar del stock', subtitulo: esc(p.nombre), enviar: 'ajuste',
      cuerpo: `<p class="small text-body-secondary">Para mercadería que sale sin venderse: vencida, rota, perdida o consumida en el local.</p>
        ${H.error()}
        ${H.campo('Lote', `<select class="form-select" name="lote">${lotes.map(l => `<option value="${l.id}">Lote ${l.id}: quedan ${Formato.cantidad(p, l.cantidad_actual)}, ${l.fecha_vencimiento < hoy ? 'VENCIDO el' : 'vence'} ${Formato.fecha(l.fecha_vencimiento)}</option>`).join('')}</select>`)}
        <div class="row g-3">
          <div class="col-sm-6">${H.campo(`Cantidad en ${p.tipo_medida === 'peso' ? 'gramos' : 'unidades'}`, '<input class="form-control" name="cantidad" type="number" min="1" step="1" inputmode="numeric" data-foco>')}</div>
          <div class="col-sm-6">${H.campo('Motivo', `<select class="form-select" name="motivo">${Object.entries(MOTIVOS_AJUSTE).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>`)}</div>
        </div>`,
      pie: UI.pie('Sacar del stock', { claseOk: 'btn-danger' })
    }, { ancho: 'chico' });
  };
  App.envios.ajuste = form => {
    const f = form.elements;
    try {
      Logica.ajustarLote(+f.lote.value, num(f.cantidad.value), f.motivo.value);
      UI.cerrarDialogo();
      UI.avisar('Ajuste registrado');
      UI.render();
    } catch (e) { $('#dlg-error').textContent = e.message; }
  };

  App.acciones['movimientos-abrir'] = el => {
    const { producto: p, movimientos } = Logica.movimientosProducto(+el.dataset.id);
    const color = { Ingreso: 'success', Venta: 'primary', Ajuste: 'danger' };
    UI.abrirDialogo({
      titulo: 'Movimientos', subtitulo: `${esc(p.nombre)}. Stock actual: ${Formato.cantidad(p, Logica.stockVigente(p.id))}`,
      cuerpo: movimientos.length ? `<div class="table-responsive"><table class="table table-sm align-middle">
          <thead><tr><th>Fecha</th><th>Movimiento</th><th class="num">Cantidad</th><th>Detalle</th></tr></thead>
          <tbody>${movimientos.map(m => `<tr>
            <td class="text-nowrap">${m.fecha.length > 10 ? Formato.fechaHora(m.fecha) : Formato.fecha(m.fecha)}</td>
            <td><span class="badge text-bg-${color[m.tipo]}">${m.tipo}</span></td>
            <td class="num ${m.cantidad > 0 ? 'text-success fw-semibold' : ''}">${m.cantidad > 0 ? '+' : '−'}${Formato.cantidad(p, Math.abs(m.cantidad))}</td>
            <td class="small">${esc(m.detalle)}</td></tr>`).join('')}</tbody>
        </table></div>` : H.vacio('Sin movimientos.')
    }, { ancho: 'normal' });
  };
})();
