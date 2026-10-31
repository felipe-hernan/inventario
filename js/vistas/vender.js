/* Vender: buscar o escanear, armar el ticket y cobrar eligiendo el medio de pago. */
(function () {
  const est = App.estado.venta = { carrito: [], sel: null, busqueda: '', aviso: '' };

  const enCarrito = id => (est.carrito.find(r => r.producto_id === id) || {}).cantidad || 0;

  function totalCarrito() {
    return est.carrito.reduce((s, r) => {
      const p = DB.buscar('productos', r.producto_id);
      return s + Logica.subtotal(p, Logica.precioPara(p, r.cantidad).precio, r.cantidad);
    }, 0);
  }

  // Devuelve un mensaje de error, o null si se agregó.
  function agregar(p, cantidad) {
    if (!Number.isInteger(cantidad) || cantidad <= 0) {
      return `Ingresá una cantidad entera mayor a 0${p.tipo_medida === 'peso' ? ', en gramos' : ''}.`;
    }
    if (p.controla_stock) {
      const disponible = Logica.stockVigente(p.id) - enCarrito(p.id);
      if (cantidad > disponible) {
        if (disponible > 0) return `Solo hay ${Formato.cantidad(p, disponible)} disponibles.`;
        return Logica.stockVencido(p.id) ? 'Solo quedan unidades vencidas de este producto.' : 'No queda stock de este producto.';
      }
    }
    const fila = est.carrito.find(r => r.producto_id === p.id);
    if (fila) fila.cantidad += cantidad;
    else est.carrito.push({ producto_id: p.id, cantidad });
    return null;
  }

  App.vistas.vender = function () {
    if (!Logica.cajaAbierta()) {
      UI.vista().innerHTML = `
        <h1>Vender</h1>
        <section class="panel panel-centrado">
          <h2>La caja está cerrada</h2>
          <p>Para vender, primero abrí la caja con el efectivo que tenés. Así cada venta queda en el cierre del turno.</p>
          <button type="button" class="boton boton-grande" data-accion="caja-abrir-dialogo">Abrir caja</button>
        </section>`;
      return;
    }
    const sel = est.sel ? DB.buscar('productos', est.sel) : null;
    UI.vista().innerHTML = `
      <h1>Vender</h1>
      <div class="vender">
        <section class="panel" aria-labelledby="t-agregar">
          <h2 id="t-agregar">Agregar producto</h2>
          ${sel ? panelElegido(sel) : `
            <label class="campo">Escaneá o buscá por nombre
              <input type="search" id="venta-buscar" data-input="venta-buscar" data-enter="venta-enter"
                autocomplete="off" value="${esc(est.busqueda)}">
            </label>
            <p class="confirmacion" id="venta-aviso" aria-live="polite">${esc(est.aviso)}</p>
            <div id="venta-resultados">${resultados()}</div>`}
        </section>
        ${ticket()}
      </div>`;
    est.aviso = '';
    UI.enfocar(sel ? $('#venta-cantidad') : $('#venta-buscar'), !!sel);
  };

  function resultados() {
    return UI.listaProductos(Logica.buscarProductos(est.busqueda), 'venta-elegir',
      { restarCarrito: enCarrito, deshabilitarSinStock: true });
  }

  function panelElegido(p) {
    const esPeso = p.tipo_medida === 'peso';
    const prox = p.controla_stock ? Logica.proximoVencimiento(p.id) : null;
    return `<div class="elegido">
      <p class="elegido-nombre">${esc(p.nombre)}</p>
      <p class="elegido-precio">${Formato.plata(p.precio_venta)} <span>${Formato.porUnidad(p)}</span></p>
      ${p.precio_mayorista ? `<p class="etiqueta etiqueta-azul">Por mayor: ${Formato.plata(p.precio_mayorista)} desde ${Formato.cantidad(p, p.cantidad_mayorista)}</p>` : ''}
      <p class="ayuda">${UI.textoStock(p, enCarrito(p.id))}${prox ? `. Próximo vencimiento: ${Formato.fecha(prox)}` : ''}</p>
      <label class="campo campo-angosto">Cantidad ${esPeso ? 'en gramos' : 'en unidades'}
        <input type="number" id="venta-cantidad" min="1" step="1" inputmode="numeric"
          value="${esPeso ? '' : 1}" data-input="venta-cantidad" data-enter="venta-agregar">
      </label>
      ${esPeso ? `<div class="atajos" aria-label="Cantidades rápidas">
        ${[100, 250, 500, 1000].map(g => `<button type="button" class="atajo" data-accion="venta-atajo" data-g="${g}">${g === 1000 ? '1 kg' : g + ' g'}</button>`).join('')}
      </div>` : ''}
      <p class="subtotal" id="venta-subtotal" aria-live="polite">${esPeso ? '' : textoSubtotal(p, 1)}</p>
      <p class="error" id="venta-error" role="alert"></p>
      <div class="fila-botones">
        <button type="button" class="boton" data-accion="venta-agregar">Agregar al ticket</button>
        <button type="button" class="boton boton-sec" data-accion="venta-cambiar">Elegir otro</button>
      </div>
    </div>`;
  }

  function textoSubtotal(p, cantidad) {
    const total = enCarrito(p.id) + cantidad;
    const { precio, mayorista } = Logica.precioPara(p, total);
    return `Subtotal: ${Formato.plata(Logica.subtotal(p, precio, cantidad))}${mayorista ? ' (precio por mayor)' : ''}`;
  }

  function ticket() {
    const filas = est.carrito.map((r, i) => {
      const p = DB.buscar('productos', r.producto_id);
      const { precio, mayorista } = Logica.precioPara(p, r.cantidad);
      return `<li class="renglon">
        <span class="renglon-nombre">${esc(p.nombre)}${mayorista ? ' <span class="marca-mayor">x mayor</span>' : ''}</span>
        <span class="renglon-detalle">${Formato.cantidad(p, r.cantidad)} × ${Formato.plata(precio)}${p.tipo_medida === 'peso' ? '/kg' : ''}</span>
        <span class="renglon-sub">${Formato.plata(Logica.subtotal(p, precio, r.cantidad))}</span>
        <button type="button" class="boton-icono" data-accion="venta-quitar" data-i="${i}" aria-label="Quitar ${esc(p.nombre)}">×</button>
      </li>`;
    });
    const ahora = Fechas.ahora();
    return `<aside class="ticket-envoltura" aria-labelledby="t-ticket">
      <div class="ticket">
        <h2 id="t-ticket">TICKET</h2>
        <p class="ticket-fecha">${Formato.fecha(ahora)} ${Formato.hora(ahora)}</p>
        ${filas.length ? `<ul class="renglones">${filas.join('')}</ul>` : '<p class="ticket-vacio">Todavía no agregaste productos.</p>'}
        <p class="ticket-total"><span>Total</span><strong>${Formato.plata(totalCarrito())}</strong></p>
        <button type="button" class="boton boton-grande boton-ancho" data-accion="venta-cobrar" ${filas.length ? '' : 'disabled'}>Cobrar</button>
        ${filas.length ? '<button type="button" class="boton-texto boton-ancho" data-accion="venta-vaciar">Vaciar ticket</button>' : ''}
      </div>
    </aside>`;
  }

  function error(texto) {
    const el = $('#venta-error');
    if (el) el.textContent = texto;
  }

  // ---------- Acciones ----------
  App.entradas['venta-buscar'] = el => {
    est.busqueda = el.value;
    $('#venta-aviso').textContent = '';
    $('#venta-resultados').innerHTML = resultados();
  };

  // Enter en el buscador: si es un código exacto (lector de barras) se agrega directo.
  App.acciones['venta-enter'] = el => {
    const p = Logica.productoPorCodigo(el.value);
    if (p && p.tipo_medida === 'unidad') {
      const problema = agregar(p, 1);
      est.busqueda = '';
      est.aviso = problema ? `${p.nombre}: ${problema}` : `Agregado: ${p.nombre}`;
      App.vistas.vender();
      return;
    }
    if (p) { est.sel = p.id; est.busqueda = ''; App.vistas.vender(); return; }
    const primero = $('#venta-resultados .resultado:not([disabled])');
    if (primero) primero.click();
  };

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
    const total = totalCarrito();
    const clientes = Logica.clientesActivos();
    UI.abrirDialogo(`
      <form class="dlg-cuerpo" data-enviar="cobro" novalidate>
        ${UI.cabecera('Cobrar')}
        <p class="cobro-total">${Formato.plata(total)}</p>
        <fieldset class="campo">
          <legend>¿Cómo paga?</legend>
          <div class="medios">
            ${MEDIOS_PAGO.map((m, i) => `<label class="medio">
              <input type="radio" name="medio" value="${m.id}" ${i === 0 ? 'checked' : ''} data-cambio="cobro-medio">
              <span>${m.nombre}</span>
            </label>`).join('')}
          </div>
        </fieldset>
        <div data-bloque="efectivo">
          <label class="campo campo-angosto">Paga con <span class="opcional">(opcional)</span>
            <input name="paga_con" type="number" min="0" step="1" inputmode="numeric" data-input="cobro-paga" data-foco>
          </label>
          <p class="vuelto" id="cobro-vuelto" aria-live="polite"></p>
        </div>
        <div data-bloque="cuenta" hidden>
          <label class="campo">Cliente
            <select name="cliente" data-cambio="cobro-cliente">
              <option value="">Elegí un cliente</option>
              ${clientes.map(c => `<option value="${c.id}">${esc(c.nombre)}</option>`).join('')}
              <option value="__nuevo">+ Cliente nuevo…</option>
            </select>
          </label>
          <label class="campo" data-bloque="cliente-nuevo" hidden>Nombre del cliente nuevo
            <input name="cliente_nuevo" autocomplete="off">
          </label>
          <p class="ayuda" id="cobro-cliente-info"></p>
        </div>
        <p class="error" id="dlg-error" role="alert"></p>
        <div class="dlg-pie">
          <span class="espacio"></span>
          <button type="button" class="boton boton-sec" data-accion="dlg-cerrar">Volver</button>
          <button type="submit" class="boton">Confirmar venta</button>
        </div>
      </form>`, { ancho: 'chico' });
  };

  App.cambios['cobro-medio'] = el => {
    const form = el.form;
    $('[data-bloque=efectivo]', form).hidden = el.value !== 'efectivo';
    $('[data-bloque=cuenta]', form).hidden = el.value !== 'cuenta';
    $('#dlg-error').textContent = '';
  };

  App.entradas['cobro-paga'] = el => {
    const paga = num(el.value);
    const total = totalCarrito();
    const vuelto = $('#cobro-vuelto');
    if (!(paga > 0)) vuelto.textContent = '';
    else if (paga < total) vuelto.textContent = `Faltan ${Formato.plata(total - paga)}`;
    else vuelto.textContent = `Vuelto: ${Formato.plata(paga - total)}`;
  };

  App.cambios['cobro-cliente'] = el => {
    const form = el.form;
    const info = $('#cobro-cliente-info');
    $('[data-bloque=cliente-nuevo]', form).hidden = el.value !== '__nuevo';
    if (el.value === '__nuevo') { info.textContent = ''; form.elements.cliente_nuevo.focus(); return; }
    if (!el.value) { info.textContent = ''; return; }
    const c = DB.buscar('clientes', +el.value);
    const saldo = Logica.saldoCliente(c.id);
    const despues = saldo + totalCarrito();
    info.textContent = `Debe ${Formato.plata(saldo)}. Con esta compra quedaría en ${Formato.plata(despues)}`
      + (c.limite_credito != null ? ` (límite ${Formato.plata(c.limite_credito)}).` : '.');
    info.classList.toggle('texto-rojo', c.limite_credito != null && despues > c.limite_credito);
  };

  App.envios.cobro = (form, e, forzarLimite = false) => {
    const f = form.elements;
    const medio = f.medio.value;
    const err = $('#dlg-error');
    let clienteId = null;
    if (medio === 'cuenta') {
      if (f.cliente.value === '__nuevo') {
        try {
          const nuevo = Logica.guardarCliente({ nombre: f.cliente_nuevo.value });
          clienteId = nuevo.id;
          // Si la venta falla, el cliente ya queda elegido y no se crea dos veces.
          f.cliente.insertAdjacentHTML('beforeend', `<option value="${nuevo.id}">${esc(nuevo.nombre)}</option>`);
          f.cliente.value = String(nuevo.id);
          $('[data-bloque=cliente-nuevo]', form).hidden = true;
        } catch (x) { err.textContent = x.message; return; }
      } else {
        clienteId = f.cliente.value ? +f.cliente.value : null;
      }
    }
    const pagaCon = num(f.paga_con.value);
    try {
      const v = Logica.registrarVenta(est.carrito.map(r => ({ ...r })), { medio_pago: medio, cliente_id: clienteId, forzarLimite });
      est.carrito = [];
      est.sel = null;
      UI.cerrarDialogo();
      const vuelto = medio === 'efectivo' && pagaCon >= v.total ? `. Vuelto: ${Formato.plata(pagaCon - v.total)}` : '';
      UI.avisar(`Venta de ${Formato.plata(v.total)} registrada${vuelto}`);
      UI.render();
    } catch (x) {
      if (x.codigo === 'LIMITE' && confirm(`${x.message}\n\n¿Fiar igual?`)) {
        App.envios.cobro(form, e, true);
        return;
      }
      err.textContent = x.message;
    }
  };
})();
