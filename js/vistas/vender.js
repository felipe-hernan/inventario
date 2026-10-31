/* Vender: buscar o escanear, armar el ticket y cobrar eligiendo el medio de pago. */
(function () {
  const est = App.estado.venta = { carrito: [], sel: null, busqueda: '', aviso: null, ultima: null };
  const enCarrito = id => (est.carrito.find(r => r.producto_id === id) || {}).cantidad || 0;

  function totalCarrito() {
    return est.carrito.reduce((s, r) => {
      const p = DB.buscar('productos', r.producto_id);
      return s + Logica.subtotal(p, Logica.precioPara(p, r.cantidad).precio, r.cantidad);
    }, 0);
  }

  function agregar(p, cantidad) {
    if (!Number.isInteger(cantidad) || cantidad <= 0) return `Ingresá una cantidad entera mayor a 0${p.tipo_medida === 'peso' ? ', en gramos' : ''}.`;
    if (p.controla_stock) {
      const disponible = Logica.stockVigente(p.id) - enCarrito(p.id);
      if (cantidad > disponible) {
        if (disponible > 0) return `Solo hay ${Formato.cantidad(p, disponible)} disponibles.`;
        return Logica.stockVencido(p.id) ? 'Solo quedan unidades vencidas de este producto.' : 'No queda stock de este producto.';
      }
    }
    const fila = est.carrito.find(r => r.producto_id === p.id);
    if (fila) fila.cantidad += cantidad; else est.carrito.push({ producto_id: p.id, cantidad });
    return null;
  }

  App.vistas.vender = function () {
    if (!Logica.cajaAbierta()) {
      UI.vista().innerHTML = `
        ${H.tituloPagina('Vender')}
        <div class="card shadow-sm text-center mx-auto" style="max-width: 34rem"><div class="card-body p-5">
          <i class="bi bi-lock fs-1 text-body-secondary"></i>
          <h2 class="h5 mt-2">La caja está cerrada</h2>
          <p class="text-body-secondary">Para vender, primero abrí la caja con el efectivo que tenés. Así cada venta queda en el cierre del turno.</p>
          <button type="button" class="btn btn-primary btn-lg" data-accion="caja-abrir-dialogo"><i class="bi bi-unlock"></i> Abrir caja</button>
        </div></div>`;
      return;
    }
    const sel = est.sel ? DB.buscar('productos', est.sel) : null;
    UI.vista().innerHTML = `
      ${H.tituloPagina('Vender')}
      <div class="row g-4 align-items-start">
        <div class="col-lg-7">
          <section class="card shadow-sm" aria-labelledby="t-agregar"><div class="card-body">
            <h2 class="h5" id="t-agregar">Agregar producto</h2>
            ${sel ? panelElegido(sel) : `
              <div class="input-group input-group-lg mb-2">
                <span class="input-group-text"><i class="bi bi-upc-scan"></i></span>
                <input type="search" class="form-control" id="venta-buscar" placeholder="Escaneá o buscá por nombre" aria-label="Escaneá o buscá por nombre"
                  data-input="venta-buscar" data-enter="venta-enter" autocomplete="off" value="${esc(est.busqueda)}">
              </div>
              <div id="venta-aviso" aria-live="polite">${avisoHTML()}</div>
              <div id="venta-resultados">${resultados()}</div>`}
          </div></section>
        </div>
        <div class="col-lg-5">${ticket()}</div>
      </div>`;
    est.aviso = null;
    UI.enfocar(sel ? $('#venta-cantidad') : $('#venta-buscar'), !!sel);
  };

  function avisoHTML() {
    const a = est.aviso;
    if (!a) return '';
    return `<div class="small fw-semibold mb-2 ${a.tipo === 'error' ? 'text-danger' : 'text-success'}">
      <i class="bi bi-${a.tipo === 'error' ? 'exclamation-circle' : 'check-circle'}"></i> ${esc(a.texto)}
      ${a.codigo && UI.esAdmin() ? `<button type="button" class="btn btn-link btn-sm p-0 align-baseline ms-1" data-accion="venta-crear-codigo" data-codigo="${esc(a.codigo)}">Crear producto con este código</button>` : ''}</div>`;
  }

  // Lo que llega del lector (o de Enter en el buscador con un código): producto, etiqueta de balanza o desconocido.
  function procesarCodigo(codigo) {
    const r = Logica.interpretarCodigo(codigo);
    est.busqueda = '';
    if (r.error) {
      est.aviso = { tipo: 'error', texto: r.error, codigo: r.desconocido ? r.codigo : null };
    } else if (r.cantidad) {
      const problema = agregar(r.producto, r.cantidad);
      est.aviso = problema ? { tipo: 'error', texto: `${r.producto.nombre}: ${problema}` } : { tipo: 'ok', texto: `Agregado: ${r.producto.nombre}, ${r.detalle}` };
    } else if (r.producto.tipo_medida === 'unidad') {
      const problema = agregar(r.producto, 1);
      est.aviso = problema ? { tipo: 'error', texto: `${r.producto.nombre}: ${problema}` } : { tipo: 'ok', texto: `Agregado: ${r.producto.nombre}` };
    } else {
      est.sel = r.producto.id; // por peso sin etiqueta: se pide la cantidad
    }
    App.vistas.vender();
  }
  App.escanearEnVenta = codigo => { est.sel = null; procesarCodigo(codigo); };

  function resultados() {
    return UI.listaProductos(Logica.buscarProductos(est.busqueda), 'venta-elegir', { restarCarrito: enCarrito, deshabilitarSinStock: true });
  }

  function panelElegido(p) {
    const esPeso = p.tipo_medida === 'peso';
    const prox = p.controla_stock ? Logica.proximoVencimiento(p.id) : null;
    return `
      <div class="fs-5 fw-bold">${esc(p.nombre)}</div>
      <div class="fs-5">${Formato.plata(p.precio_venta)} <span class="text-body-secondary fs-6">${Formato.porUnidad(p)}</span></div>
      ${p.precio_mayorista ? `<span class="badge text-bg-info my-1"><i class="bi bi-boxes"></i> Por mayor: ${Formato.plata(p.precio_mayorista)} desde ${Formato.cantidad(p, p.cantidad_mayorista)}</span>` : ''}
      <p class="small text-body-secondary mt-1">${UI.textoStock(p, enCarrito(p.id))}${prox ? `. Próximo vencimiento: ${Formato.fecha(prox)}` : ''}</p>
      <div style="max-width: 16rem">
        ${H.campo(`Cantidad ${esPeso ? 'en gramos' : 'en unidades'}`,
          `<input type="number" class="form-control form-control-lg" id="venta-cantidad" min="1" step="1" inputmode="numeric" value="${esPeso ? '' : 1}" data-input="venta-cantidad" data-enter="venta-agregar">`)}
      </div>
      ${esPeso ? `<div class="d-flex flex-wrap gap-2 mb-3" aria-label="Cantidades rápidas">
        ${[100, 250, 500, 1000].map(g => `<button type="button" class="btn btn-sm btn-outline-secondary rounded-pill" data-accion="venta-atajo" data-g="${g}">${g === 1000 ? '1 kg' : g + ' g'}</button>`).join('')}
      </div>` : ''}
      <p class="fw-bold" id="venta-subtotal" aria-live="polite">${esPeso ? '' : textoSubtotal(p, 1)}</p>
      ${H.error('venta-error')}
      <div class="d-flex flex-wrap gap-2">
        <button type="button" class="btn btn-primary" data-accion="venta-agregar"><i class="bi bi-plus-lg"></i> Agregar al ticket</button>
        <button type="button" class="btn btn-outline-secondary" data-accion="venta-cambiar">Elegir otro</button>
      </div>`;
  }

  function textoSubtotal(p, cantidad) {
    const { precio, mayorista } = Logica.precioPara(p, enCarrito(p.id) + cantidad);
    return `Subtotal: ${Formato.plata(Logica.subtotal(p, precio, cantidad))}${mayorista ? ' (precio por mayor)' : ''}`;
  }

  function ticket() {
    const filas = est.carrito.map((r, i) => {
      const p = DB.buscar('productos', r.producto_id);
      const { precio, mayorista } = Logica.precioPara(p, r.cantidad);
      return `<li class="renglon">
        <span class="renglon-nombre">${esc(p.nombre)}${mayorista ? ' <span class="badge text-bg-info">x mayor</span>' : ''}</span>
        <span class="renglon-detalle">${Formato.cantidad(p, r.cantidad)} × ${Formato.plata(precio)}${p.tipo_medida === 'peso' ? '/kg' : ''}</span>
        <span class="renglon-sub">${Formato.plata(Logica.subtotal(p, precio, r.cantidad))}</span>
        <button type="button" class="btn btn-sm btn-link text-body-secondary" data-accion="venta-quitar" data-i="${i}" aria-label="Quitar ${esc(p.nombre)}"><i class="bi bi-x-lg"></i></button>
      </li>`;
    });
    const ahora = Fechas.ahora();
    return `<aside class="ticket-envoltura" aria-labelledby="t-ticket"><div class="ticket">
      <h2 id="t-ticket">TICKET</h2>
      <p class="ticket-fecha">${Formato.fecha(ahora)} ${Formato.hora(ahora)}</p>
      ${filas.length ? `<ul class="list-unstyled mb-0">${filas.join('')}</ul>` : '<p class="text-center text-body-secondary py-4 mb-0">Todavía no agregaste productos.</p>'}
      <p class="ticket-total"><span>Total</span><strong>${Formato.plata(totalCarrito())}</strong></p>
      <button type="button" class="btn btn-primary btn-lg w-100" data-accion="venta-cobrar" ${filas.length ? '' : 'disabled'}><i class="bi bi-cash-coin"></i> Cobrar</button>
      ${filas.length ? '<button type="button" class="btn btn-link w-100 mt-1" data-accion="venta-vaciar">Vaciar ticket</button>' : ''}
      ${!filas.length && est.ultima ? `<button type="button" class="btn btn-outline-secondary w-100 mt-2" data-accion="venta-reimprimir"><i class="bi bi-printer"></i> Reimprimir el último ticket (N.º ${est.ultima.id})</button>` : ''}
    </div></aside>`;
  }

  const error = texto => { const el = $('#venta-error'); if (el) el.textContent = texto; };

  App.entradas['venta-buscar'] = el => {
    est.busqueda = el.value;
    $('#venta-aviso').innerHTML = '';
    $('#venta-resultados').innerHTML = resultados();
  };
  // Enter en el buscador: si es un código (lector o tipeado) se procesa; si es texto, se elige el primer resultado.
  App.acciones['venta-enter'] = el => {
    const texto = el.value.trim();
    const r = Logica.interpretarCodigo(texto);
    if (r.producto || (r.error && /^\d{6,}$/.test(texto))) { procesarCodigo(texto); return; }
    const primero = $('#venta-resultados .resultado:not([disabled])');
    if (primero) primero.click();
  };
  App.acciones['venta-crear-codigo'] = el => App.abrirProducto(null, () => UI.navegar('vender'), { codigo: el.dataset.codigo });
  App.acciones['venta-reimprimir'] = () => { if (est.ultima) Impresora.ticketVenta(est.ultima.id, { pagaCon: est.ultima.pagaCon }); };
  App.acciones['venta-elegir'] = el => { est.sel = +el.dataset.id; est.busqueda = ''; App.vistas.vender(); };
  App.acciones['venta-cambiar'] = () => { est.sel = null; App.vistas.vender(); };
  App.acciones['venta-atajo'] = el => {
    const input = $('#venta-cantidad');
    input.value = el.dataset.g;
    App.entradas['venta-cantidad'](input);
    input.focus();
  };
  App.entradas['venta-cantidad'] = el => {
    const p = DB.buscar('productos', est.sel);
    const c = num(el.value);
    error('');
    $('#venta-subtotal').textContent = c > 0 ? textoSubtotal(p, c) : '';
  };
  App.acciones['venta-agregar'] = () => {
    const p = DB.buscar('productos', est.sel);
    const problema = agregar(p, num($('#venta-cantidad').value));
    if (problema) return error(problema);
    est.sel = null;
    App.vistas.vender();
  };
  App.acciones['venta-quitar'] = el => { est.carrito.splice(+el.dataset.i, 1); App.vistas.vender(); };
  App.acciones['venta-vaciar'] = () => { est.carrito = []; App.vistas.vender(); };

  // ---------- Cobro ----------
  App.acciones['venta-cobrar'] = () => {
    if (!est.carrito.length) return;
    const clientes = Logica.clientesActivos();
    UI.abrirDialogo({
      titulo: 'Cobrar', enviar: 'cobro',
      cuerpo: `
        <p class="cobro-total mb-3">${Formato.plata(totalCarrito())}</p>
        <fieldset class="mb-3">
          <legend class="form-label fw-semibold fs-6">¿Cómo paga?</legend>
          <div class="medios">
            ${MEDIOS_PAGO.map((m, i) => `<input type="radio" class="btn-check" name="medio" id="medio-${m.id}" value="${m.id}" ${i === 0 ? 'checked' : ''} data-cambio="cobro-medio">
              <label class="btn btn-outline-primary" for="medio-${m.id}">${m.nombre}</label>`).join('')}
          </div>
        </fieldset>
        <div data-bloque="efectivo">
          <div style="max-width: 16rem">${H.campo('Paga con <span class="fw-normal text-body-secondary">(opcional)</span>',
            '<div class="input-group"><span class="input-group-text">$</span><input class="form-control" name="paga_con" type="number" min="0" step="1" inputmode="numeric" data-input="cobro-paga" data-foco></div>')}</div>
          <p class="fs-4 fw-bold" id="cobro-vuelto" aria-live="polite"></p>
        </div>
        <div data-bloque="cuenta" hidden>
          ${H.campo('Cliente', `<select class="form-select" name="cliente" data-cambio="cobro-cliente">
            <option value="">Elegí un cliente</option>
            ${clientes.map(c => `<option value="${c.id}">${esc(c.nombre)}</option>`).join('')}
            <option value="__nuevo">+ Cliente nuevo…</option></select>`)}
          <div data-bloque="cliente-nuevo" hidden>${H.campo('Nombre del cliente nuevo', '<input class="form-control" name="cliente_nuevo" autocomplete="off">')}</div>
          <p class="small" id="cobro-cliente-info"></p>
        </div>
        ${H.error()}`,
      pie: UI.pie('<i class="bi bi-check-lg"></i> Confirmar venta', { cancelar: 'Volver' })
    }, { ancho: 'chico' });
  };

  App.cambios['cobro-medio'] = el => {
    const form = el.form;
    $('[data-bloque=efectivo]', form).hidden = el.value !== 'efectivo';
    $('[data-bloque=cuenta]', form).hidden = el.value !== 'cuenta';
    $('#dlg-error').textContent = '';
  };
  App.entradas['cobro-paga'] = el => {
    const paga = num(el.value), total = totalCarrito(), vuelto = $('#cobro-vuelto');
    vuelto.className = 'fs-4 fw-bold';
    if (!(paga > 0)) vuelto.textContent = '';
    else if (paga < total) { vuelto.textContent = `Faltan ${Formato.plata(total - paga)}`; vuelto.classList.add('text-danger'); }
    else { vuelto.textContent = `Vuelto: ${Formato.plata(paga - total)}`; vuelto.classList.add('text-success'); }
  };
  App.cambios['cobro-cliente'] = el => {
    const form = el.form, info = $('#cobro-cliente-info');
    $('[data-bloque=cliente-nuevo]', form).hidden = el.value !== '__nuevo';
    info.className = 'small';
    if (el.value === '__nuevo') { info.textContent = ''; form.elements.cliente_nuevo.focus(); return; }
    if (!el.value) { info.textContent = ''; return; }
    const c = DB.buscar('clientes', +el.value);
    const saldo = Logica.saldoCliente(c.id), despues = saldo + totalCarrito();
    info.textContent = `Debe ${Formato.plata(saldo)}. Con esta compra quedaría en ${Formato.plata(despues)}`
      + (c.limite_credito != null ? ` (límite ${Formato.plata(c.limite_credito)}).` : '.');
    if (c.limite_credito != null && despues > c.limite_credito) info.classList.add('text-danger', 'fw-semibold');
  };

  // Después de cobrar: según la configuración, imprime solo, pregunta o solo avisa.
  function ventaRegistrada(v, pagaCon) {
    const { alVender } = Logica.config('ticket');
    const vuelto = pagaCon ? pagaCon - v.total : null;
    if (alVender === 'siempre') Impresora.ticketVenta(v.id, { pagaCon });
    if (alVender !== 'preguntar') {
      UI.cerrarDialogo();
      UI.avisar(`Venta de ${Formato.plata(v.total)} registrada${vuelto != null ? `. Vuelto: ${Formato.plata(vuelto)}` : ''}`);
      return;
    }
    UI.abrirDialogo({
      titulo: 'Venta registrada',
      cuerpo: `<div class="text-center py-2">
          <i class="bi bi-check-circle-fill text-success" style="font-size:3rem"></i>
          <div class="fs-5 mt-2">Total ${Formato.plata(v.total)} <span class="text-body-secondary">· ${Formato.medio(v.medio_pago)}</span></div>
          ${vuelto != null ? `<div class="display-6 fw-bold mt-2">Vuelto ${Formato.plata(vuelto)}</div>` : ''}
        </div>`,
      pie: `<button type="button" class="btn btn-outline-secondary" data-accion="venta-imprimir-y-cerrar" data-id="${v.id}"><i class="bi bi-printer"></i> Imprimir ticket</button>
        <button type="button" class="btn btn-primary" data-bs-dismiss="modal" data-foco>Listo</button>`
    }, { ancho: 'chico' });
  }
  App.acciones['venta-imprimir-y-cerrar'] = el => {
    Impresora.ticketVenta(+el.dataset.id, { pagaCon: est.ultima && est.ultima.id === +el.dataset.id ? est.ultima.pagaCon : null });
    UI.cerrarDialogo();
  };

  App.envios.cobro = (form, e, forzarLimite = false) => {
    const f = form.elements, medio = f.medio.value, err = $('#dlg-error');
    let clienteId = null;
    if (medio === 'cuenta') {
      if (f.cliente.value === '__nuevo') {
        try {
          const nuevo = Logica.guardarCliente({ nombre: f.cliente_nuevo.value });
          clienteId = nuevo.id;
          f.cliente.insertAdjacentHTML('beforeend', `<option value="${nuevo.id}">${esc(nuevo.nombre)}</option>`);
          f.cliente.value = String(nuevo.id);
          $('[data-bloque=cliente-nuevo]', form).hidden = true;
        } catch (x) { err.textContent = x.message; return; }
      } else clienteId = f.cliente.value ? +f.cliente.value : null;
    }
    const pagaCon = num(f.paga_con.value);
    try {
      const v = Logica.registrarVenta(est.carrito.map(r => ({ ...r })), { medio_pago: medio, cliente_id: clienteId, forzarLimite });
      est.carrito = [];
      est.sel = null;
      est.ultima = { id: v.id, pagaCon: medio === 'efectivo' && pagaCon >= v.total ? pagaCon : null };
      UI.render();
      ventaRegistrada(v, est.ultima.pagaCon);
    } catch (x) {
      if (x.codigo === 'LIMITE' && confirm(`${x.message}\n\n¿Fiar igual?`)) { App.envios.cobro(form, e, true); return; }
      err.textContent = x.message;
    }
  };
})();
