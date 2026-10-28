/* Mercadería: ingresar lotes, ver el inventario valorizado, ajustar y ver movimientos. */
(function () {
  const est = App.estado;
  est.mercTab = 'ingresar';
  est.ingreso = nuevoIngreso();
  est.inventarioBusqueda = '';

  function nuevoIngreso(p = null) {
    return {
      producto_id: p ? p.id : null,
      lineas: [{ cantidad: '', costo: p ? String(p.costo) : '', vencimiento: '' }],
      actualizarPrecio: true, busqueda: '',
      pagarCaja: false, montoPago: '', montoTocado: false
    };
  }

  App.vistas.mercaderia = function () {
    if (est.reponerId) {
      est.ingreso = nuevoIngreso(DB.buscar('productos', est.reponerId));
      est.reponerId = null;
    }
    UI.vista().innerHTML = `
      <h1>Mercadería</h1>
      <div class="pestanas" role="tablist" aria-label="Secciones de mercadería">
        <button type="button" role="tab" aria-selected="${est.mercTab === 'ingresar'}" data-accion="merc-tab" data-tab="ingresar">Ingresar</button>
        <button type="button" role="tab" aria-selected="${est.mercTab === 'inventario'}" data-accion="merc-tab" data-tab="inventario">Inventario</button>
      </div>
      <div id="merc-contenido">${est.mercTab === 'ingresar' ? ingresar() : inventario()}</div>`;
    if (est.mercTab === 'ingresar') {
      UI.enfocar(est.ingreso.producto_id ? $('[data-campo=cantidad]') : $('#ingreso-buscar'));
    }
  };

  // ---------- Ingresar ----------
  function ingresar() {
    const ing = est.ingreso;
    const p = ing.producto_id ? DB.buscar('productos', ing.producto_id) : null;
    const ultimos = DB.todos('lotes').slice().sort((a, b) => b.id - a.id).slice(0, 6);
    return `
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
            <label class="campo">Escaneá o buscá por nombre
              <input type="search" id="ingreso-buscar" data-input="ingreso-buscar" data-enter="ingreso-enter" autocomplete="off" value="${esc(ing.busqueda)}">
            </label>
            <div id="ingreso-resultados">${UI.listaProductos(Logica.buscarProductos(ing.busqueda, { soloConStock: true }), 'ingreso-elegir')}</div>
            <p class="ayuda">¿No está en la lista? <button type="button" class="boton-texto" data-accion="ingreso-nuevo">Crear producto nuevo</button></p>`}
        </section>
        ${p ? lineas(p) : ''}
      </div>
      <section class="seccion" aria-labelledby="t-ultimos">
        <h2 id="t-ultimos">Últimos ingresos</h2>
        ${ultimos.length ? `<div class="tabla-envoltura"><table class="tabla">
          <thead><tr><th scope="col">Ingresó</th><th scope="col">Producto</th><th scope="col" class="num">Cantidad</th><th scope="col" class="num">Costo</th><th scope="col">Vence</th></tr></thead>
          <tbody>${ultimos.map(l => {
            const pr = DB.buscar('productos', l.producto_id);
            return `<tr><td>${Formato.fecha(l.fecha_ingreso)}</td><td>${esc(pr.nombre)}</td>
              <td class="num">${Formato.cantidad(pr, l.cantidad_inicial)}</td><td class="num">${Formato.plata(l.costo)}</td>
              <td>${Formato.fecha(l.fecha_vencimiento)}</td></tr>`;
          }).join('')}</tbody>
        </table></div>` : '<p class="vacio">Todavía no se ingresó mercadería.</p>'}
      </section>`;
  }

  function lineas(p) {
    const ing = est.ingreso;
    const caja = Logica.cajaAbierta();
    return `<section class="panel" aria-labelledby="t-paso2">
      <h2 id="t-paso2"><span class="paso">2</span> Lo que llegó</h2>
      <p class="ayuda">Cada línea es un lote. Si vienen paquetes con distinto vencimiento, cargalos en líneas separadas.</p>
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
          ${ing.lineas.length > 1 ? `<button type="button" class="boton-icono" data-accion="ingreso-quitar" data-i="${i}" aria-label="Quitar línea ${i + 1}">×</button>` : '<span></span>'}
        </div>`).join('')}
      </div>
      <button type="button" class="boton-texto" data-accion="ingreso-linea-mas">Agregar otra línea con otro vencimiento</button>
      <div id="aviso-costo">${avisoCosto(p)}</div>
      <div class="panel-gris">
        ${caja ? `
          <label class="opcion"><input type="checkbox" data-cambio="ingreso-pagar" ${ing.pagarCaja ? 'checked' : ''}>
            Lo pagué con efectivo de la caja</label>
          <label class="campo campo-angosto" data-bloque="pago" ${ing.pagarCaja ? '' : 'hidden'}>Monto pagado
            <input type="number" min="1" step="1" inputmode="numeric" value="${esc(montoPago(p))}" data-input="ingreso-monto">
            <span class="ayuda">Se registra como salida de caja: pago a proveedor.</span>
          </label>`
        : '<p class="ayuda">Si pagaste esta mercadería con efectivo de la caja, abrí la caja para registrarlo junto con el ingreso.</p>'}
      </div>
      <p class="error" id="ingreso-error" role="alert"></p>
      <button type="button" class="boton" data-accion="ingreso-guardar">Guardar ingreso</button>
    </section>`;
  }

  function lineasNumericas() {
    return est.ingreso.lineas.map(l => ({ cantidad: num(l.cantidad), costo: num(l.costo), fecha_vencimiento: l.vencimiento }));
  }
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
    return `<div class="aviso-cambio">
      <p>El costo ${costo > p.costo ? 'subió' : 'bajó'} de ${Formato.plata(p.costo)} a ${Formato.plata(costo)} ${Formato.porUnidad(p)}.</p>
      <label class="opcion"><input type="checkbox" data-cambio="ingreso-actualizar" ${est.ingreso.actualizarPrecio ? 'checked' : ''}>
        Actualizar el precio de venta a ${Formato.plata(nuevoPrecio)} (mantiene el ${Formato.numero(p.porcentaje)} %)</label>
      ${est.ingreso.actualizarPrecio ? '' : `<p class="ayuda">El precio queda en ${Formato.plata(p.precio_venta)} y la ganancia pasa a ${Formato.numero(margen)} %.</p>`}
    </div>`;
  }

  function redibujar() { App.vistas.mercaderia(); }

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
    UI.enfocar($('[data-cambio=ingreso-actualizar]'));
  };
  App.cambios['ingreso-pagar'] = el => {
    est.ingreso.pagarCaja = el.checked;
    $('[data-bloque=pago]').hidden = !el.checked;
  };
  App.entradas['ingreso-monto'] = el => { est.ingreso.montoPago = el.value; est.ingreso.montoTocado = true; };

  App.acciones['ingreso-guardar'] = () => {
    const ing = est.ingreso;
    const p = DB.buscar('productos', ing.producto_id);
    const pagoCaja = ing.pagarCaja && Logica.cajaAbierta() ? num(montoPago(p)) : null;
    try {
      const lotes = Logica.ingresarMercaderia(p.id, lineasNumericas(), { actualizarPrecio: ing.actualizarPrecio, pagoCaja });
      const total = lotes.reduce((s, l) => s + l.cantidad_inicial, 0);
      UI.avisar(`Ingreso guardado: ${Formato.cantidad(p, total)} de ${p.nombre}${pagoCaja ? `. Salieron ${Formato.plata(pagoCaja)} de la caja` : ''}`);
      est.ingreso = nuevoIngreso();
      UI.render();
    } catch (e) {
      $('#ingreso-error').textContent = e.message;
    }
  };

  // ---------- Inventario ----------
  function inventario() {
    const inv = Logica.inventario();
    return `
      <dl class="cifras cifras-panel">
        <div><dt>Valor de la mercadería</dt><dd>${Formato.plata(inv.valorTotal)}</dd></div>
        <div><dt>Productos con stock</dt><dd>${inv.conStock}</dd></div>
        <div><dt>Vencido sin sacar</dt><dd class="${inv.valorVencido ? 'texto-rojo' : ''}">${Formato.plata(inv.valorVencido)}</dd></div>
      </dl>
      <p class="ayuda">El valor se calcula con el costo de cada lote. No incluye lo vencido.</p>
      <div class="herramientas">
        <label class="campo campo-buscar"><span class="solo-lector">Buscar en el inventario</span>
          <input type="search" placeholder="Buscar producto" data-input="inventario-buscar" value="${esc(est.inventarioBusqueda)}">
        </label>
      </div>
      <div class="tabla-envoltura">
        <table class="tabla">
          <thead><tr><th scope="col">Producto</th><th scope="col" class="num">Stock</th><th scope="col">Próximo vencimiento</th>
            <th scope="col" class="num">Valor</th><th scope="col"><span class="solo-lector">Acciones</span></th></tr></thead>
          <tbody id="tbody-inventario">${filasInventario(inv)}</tbody>
        </table>
      </div>`;
  }

  function filasInventario(inv = Logica.inventario()) {
    const t = normalizar(est.inventarioBusqueda);
    const filas = inv.filas.filter(f => !t || normalizar(f.producto.nombre).includes(t));
    if (!filas.length) return '<tr><td colspan="5" class="vacio">No hay productos que coincidan.</td></tr>';
    return filas.map(f => `<tr>
      <td>${esc(f.producto.nombre)}<span class="sub">${esc(Logica.nombreCategoria(f.producto.categoria_id))}</span></td>
      <td class="num">${Formato.cantidad(f.producto, f.stock)}${f.vencido ? `<span class="sub texto-rojo">+ ${Formato.cantidad(f.producto, f.vencido)} vencidas</span>` : ''}</td>
      <td>${f.proximo ? Formato.fecha(f.proximo) : '—'}</td>
      <td class="num">${Formato.plata(f.valor)}</td>
      <td class="num acciones-fila">
        <button type="button" class="boton boton-sec boton-chico" data-accion="ajuste-abrir" data-id="${f.producto.id}" ${f.stock + f.vencido ? '' : 'disabled'}>Ajustar</button>
        <button type="button" class="boton boton-sec boton-chico" data-accion="movimientos-abrir" data-id="${f.producto.id}">Movimientos</button>
      </td>
    </tr>`).join('');
  }

  App.entradas['inventario-buscar'] = el => { est.inventarioBusqueda = el.value; $('#tbody-inventario').innerHTML = filasInventario(); };

  App.acciones['ajuste-abrir'] = el => {
    const p = DB.buscar('productos', +el.dataset.id);
    const lotes = Logica.lotesDe(p.id).filter(l => l.cantidad_actual > 0);
    const hoy = Fechas.hoy();
    UI.abrirDialogo(`
      <form class="dlg-cuerpo" data-enviar="ajuste" novalidate>
        ${UI.cabecera('Sacar del stock', esc(p.nombre))}
        <p class="ayuda">Para mercadería que sale sin venderse: vencida, rota, perdida o consumida en el local.</p>
        <p class="error" id="dlg-error" role="alert"></p>
        <label class="campo">Lote
          <select name="lote">${lotes.map(l => `<option value="${l.id}">Lote ${l.id}: quedan ${Formato.cantidad(p, l.cantidad_actual)}, ${l.fecha_vencimiento < hoy ? 'VENCIDO el' : 'vence'} ${Formato.fecha(l.fecha_vencimiento)}</option>`).join('')}</select>
        </label>
        <div class="grilla-form">
          <label class="campo">Cantidad en ${p.tipo_medida === 'peso' ? 'gramos' : 'unidades'}
            <input name="cantidad" type="number" min="1" step="1" inputmode="numeric" data-foco>
          </label>
          <label class="campo">Motivo
            <select name="motivo">${Object.entries(MOTIVOS_AJUSTE).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
          </label>
        </div>
        <div class="dlg-pie">
          <span class="espacio"></span>
          <button type="button" class="boton boton-sec" data-accion="dlg-cerrar">Cancelar</button>
          <button type="submit" class="boton boton-peligro-lleno">Sacar del stock</button>
        </div>
      </form>`, { ancho: 'chico' });
  };

  App.envios.ajuste = form => {
    const f = form.elements;
    try {
      Logica.ajustarLote(+f.lote.value, num(f.cantidad.value), f.motivo.value);
      UI.cerrarDialogo();
      UI.avisar('Ajuste registrado');
      UI.render();
    } catch (e) {
      $('#dlg-error').textContent = e.message;
    }
  };

  App.acciones['movimientos-abrir'] = el => {
    const { producto: p, movimientos } = Logica.movimientosProducto(+el.dataset.id);
    UI.abrirDialogo(`
      <div class="dlg-cuerpo">
        ${UI.cabecera('Movimientos', `${esc(p.nombre)}. Stock actual: ${Formato.cantidad(p, Logica.stockVigente(p.id))}`)}
        ${movimientos.length ? `<div class="tabla-envoltura tabla-alta"><table class="tabla tabla-chica">
          <thead><tr><th scope="col">Fecha</th><th scope="col">Movimiento</th><th scope="col" class="num">Cantidad</th><th scope="col">Detalle</th></tr></thead>
          <tbody>${movimientos.map(m => `<tr>
            <td>${m.fecha.length > 10 ? Formato.fechaHora(m.fecha) : Formato.fecha(m.fecha)}</td>
            <td>${m.tipo}</td>
            <td class="num ${m.cantidad > 0 ? 'texto-verde' : ''}">${m.cantidad > 0 ? '+' : '−'}${Formato.cantidad(p, Math.abs(m.cantidad))}</td>
            <td>${esc(m.detalle)}</td></tr>`).join('')}</tbody>
        </table></div>` : '<p class="vacio">Sin movimientos.</p>'}
      </div>`, { ancho: 'grande' });
  };
})();
