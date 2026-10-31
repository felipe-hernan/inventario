/* Clientes: fiado, estado de cuenta y cobros. */
(function () {
  const est = App.estado.clientes = { busqueda: '', soloDeudores: false };

  App.vistas.clientes = function () {
    const deudores = Logica.deudores();
    const total = deudores.reduce((s, d) => s + d.saldo, 0);
    UI.vista().innerHTML = `
      <div class="titulo-fila">
        <h1>Clientes</h1>
        <button type="button" class="boton" data-accion="cliente-nuevo">Nuevo cliente</button>
      </div>
      <p class="resumen-linea">${deudores.length
        ? `Te deben <strong>${Formato.plata(total)}</strong> entre ${deudores.length} ${deudores.length === 1 ? 'cliente' : 'clientes'}.`
        : 'Nadie tiene deuda pendiente.'}</p>
      <div class="herramientas">
        <label class="campo campo-buscar"><span class="solo-lector">Buscar clientes</span>
          <input type="search" placeholder="Buscar por nombre o teléfono" data-input="clientes-buscar" value="${esc(est.busqueda)}">
        </label>
        <label class="opcion"><input type="checkbox" data-cambio="clientes-deudores" ${est.soloDeudores ? 'checked' : ''}> Solo los que deben</label>
      </div>
      <div class="tabla-envoltura">
        <table class="tabla">
          <thead><tr><th scope="col">Cliente</th><th scope="col" class="num">Debe</th><th scope="col" class="num">Límite</th><th scope="col"><span class="solo-lector">Acciones</span></th></tr></thead>
          <tbody id="tbody-clientes">${filas()}</tbody>
        </table>
      </div>`;
  };

  function filas() {
    const t = normalizar(est.busqueda);
    let lista = Logica.clientesActivos().map(c => ({ cliente: c, saldo: Logica.saldoCliente(c.id) }));
    if (t) lista = lista.filter(x => normalizar(x.cliente.nombre).includes(t) || x.cliente.telefono.includes(est.busqueda.trim()));
    if (est.soloDeudores) lista = lista.filter(x => x.saldo > 0);
    lista.sort((a, b) => b.saldo - a.saldo || a.cliente.nombre.localeCompare(b.cliente.nombre, 'es'));
    if (!lista.length) {
      return `<tr><td colspan="4" class="vacio">${Logica.clientesActivos().length ? 'Ningún cliente coincide.' : 'Todavía no hay clientes. Cargá el primero con «Nuevo cliente», o directamente al fiar una venta.'}</td></tr>`;
    }
    return lista.map(({ cliente: c, saldo }) => `<tr>
      <td><button type="button" class="enlace" data-accion="cliente-cuenta" data-id="${c.id}">${esc(c.nombre)}</button>
        ${c.telefono ? `<span class="sub">${esc(c.telefono)}</span>` : ''}</td>
      <td class="num ${saldo > 0 ? 'texto-rojo negrita' : ''}">${Formato.plata(saldo)}</td>
      <td class="num">${c.limite_credito != null ? Formato.plata(c.limite_credito) : '<span class="sub">Sin límite</span>'}</td>
      <td class="num"><button type="button" class="boton boton-sec boton-chico" data-accion="cliente-cuenta" data-id="${c.id}">Ver cuenta</button></td>
    </tr>`).join('');
  }

  // ---------- Estado de cuenta ----------
  function abrirCuenta(id, { mostrarPago = false } = {}) {
    const c = DB.buscar('clientes', id);
    const saldo = Logica.saldoCliente(id);
    const movimientos = Logica.estadoCuenta(id);
    const caja = Logica.cajaAbierta();
    UI.abrirDialogo(`
      <div class="dlg-cuerpo">
        ${UI.cabecera(esc(c.nombre), [c.telefono, c.limite_credito != null ? `Límite ${Formato.plata(c.limite_credito)}` : 'Sin límite de fiado'].filter(Boolean).map(esc).join('. '))}
        <div class="saldo-cliente ${saldo > 0 ? 'debe' : ''}">
          <span>${saldo > 0 ? 'Debe' : 'Está al día'}</span>
          <strong>${Formato.plata(saldo)}</strong>
        </div>
        <div class="fila-botones no-imprimir">
          ${saldo > 0 ? '<button type="button" class="boton" data-accion="cliente-mostrar-pago">Registrar pago</button>' : ''}
          ${saldo > 0 ? `<a class="boton boton-sec" href="${linkWhatsApp(c, saldo, movimientos)}" target="_blank" rel="noopener">Enviar por WhatsApp</a>` : ''}
          <button type="button" class="boton boton-sec" data-accion="cliente-editar" data-id="${c.id}">Editar datos</button>
        </div>
        <form class="panel-gris" data-enviar="cliente-pago" data-id="${c.id}" ${mostrarPago ? '' : 'hidden'} novalidate>
          ${caja ? `
            <div class="grilla-form">
              <label class="campo">Monto que paga
                <input name="monto" type="number" min="1" max="${saldo}" step="1" inputmode="numeric" value="${saldo}">
              </label>
              <label class="campo">Cómo paga
                <select name="medio">${MEDIOS_PAGO.filter(m => m.id !== 'cuenta').map(m => `<option value="${m.id}">${m.nombre}</option>`).join('')}</select>
              </label>
            </div>
            <p class="error" id="pago-error" role="alert"></p>
            <button type="submit" class="boton">Confirmar pago</button>`
          : `<p>Para registrar un cobro, primero abrí la caja.</p>
            <button type="button" class="boton" data-accion="caja-abrir-dialogo">Abrir caja</button>`}
        </form>
        <h3>Movimientos</h3>
        ${movimientos.length ? `<div class="tabla-envoltura"><table class="tabla tabla-chica">
          <thead><tr><th scope="col">Fecha</th><th scope="col">Detalle</th><th scope="col" class="num">Compra</th><th scope="col" class="num">Pago</th><th scope="col" class="num">Saldo</th></tr></thead>
          <tbody>${movimientos.map(m => `<tr>
            <td>${Formato.fechaHora(m.fecha_hora)}</td><td>${esc(m.detalle)}</td>
            <td class="num">${m.tipo === 'compra' ? Formato.plata(m.monto) : ''}</td>
            <td class="num texto-verde">${m.tipo === 'pago' ? Formato.plata(m.monto) : ''}</td>
            <td class="num negrita">${Formato.plata(m.saldo)}</td></tr>`).join('')}</tbody>
        </table></div>` : '<p class="vacio">Todavía no compró fiado.</p>'}
      </div>`, { ancho: 'grande' });
    if (mostrarPago) UI.enfocar($('#dlg [name=monto]'), true);
  }

  function linkWhatsApp(c, saldo, movimientos) {
    const ultimos = movimientos.slice(0, 5).map(m =>
      `${Formato.fechaCorta(m.fecha_hora)}: ${m.tipo === 'compra' ? 'compra' : 'pago'} ${Formato.plata(m.monto)}`).join('\n');
    const texto = `Hola ${c.nombre}, te paso tu cuenta del almacén.\nSaldo: ${Formato.plata(saldo)}\n\nÚltimos movimientos:\n${ultimos}`;
    let tel = (c.telefono || '').replace(/\D/g, '');
    if (tel && !tel.startsWith('54')) tel = '549' + tel.replace(/^0/, '');
    return `https://wa.me/${tel}?text=${encodeURIComponent(texto)}`;
  }

  // ---------- Alta y edición ----------
  function formCliente(id = null) {
    const c = id ? DB.buscar('clientes', id) : null;
    const saldo = c ? Logica.saldoCliente(c.id) : 0;
    UI.abrirDialogo(`
      <form class="dlg-cuerpo" data-enviar="cliente-guardar" data-id="${id || ''}" novalidate>
        ${UI.cabecera(c ? 'Editar cliente' : 'Nuevo cliente')}
        <p class="error" id="dlg-error" role="alert"></p>
        <label class="campo">Nombre
          <input name="nombre" value="${esc(c?.nombre)}" autocomplete="off" data-foco>
        </label>
        <label class="campo">Teléfono <span class="opcional">(opcional)</span>
          <input name="telefono" type="tel" value="${esc(c?.telefono)}" inputmode="tel" autocomplete="off">
          <span class="ayuda">Con característica, por ejemplo 381 5550101. Sirve para mandarle la cuenta por WhatsApp.</span>
        </label>
        <label class="campo">Límite de fiado <span class="opcional">(opcional)</span>
          <input name="limite" type="number" min="0" step="1" inputmode="numeric" value="${c?.limite_credito ?? ''}">
          <span class="ayuda">Si la deuda pasa este monto, el sistema te avisa antes de fiar. Dejalo vacío para no poner límite.</span>
        </label>
        <div class="dlg-pie">
          ${c ? `<button type="button" class="boton boton-peligro" data-accion="cliente-baja" data-id="${c.id}" ${saldo > 0 ? 'disabled title="Tiene deuda pendiente"' : ''}>Dar de baja</button>` : ''}
          <span class="espacio"></span>
          <button type="button" class="boton boton-sec" data-accion="dlg-cerrar">Cancelar</button>
          <button type="submit" class="boton">Guardar</button>
        </div>
      </form>`, { ancho: 'chico' });
  }

  // ---------- Acciones ----------
  App.entradas['clientes-buscar'] = el => { est.busqueda = el.value; $('#tbody-clientes').innerHTML = filas(); };
  App.cambios['clientes-deudores'] = el => { est.soloDeudores = el.checked; $('#tbody-clientes').innerHTML = filas(); };
  App.acciones['cliente-nuevo'] = () => formCliente();
  App.acciones['cliente-editar'] = el => formCliente(+el.dataset.id);
  App.acciones['cliente-cuenta'] = el => abrirCuenta(+el.dataset.id);
  App.acciones['cliente-mostrar-pago'] = () => {
    const form = $('#dlg [data-enviar=cliente-pago]');
    form.hidden = false;
    UI.enfocar(form.elements.monto, true);
  };

  App.envios['cliente-guardar'] = form => {
    const f = form.elements;
    const id = form.dataset.id ? +form.dataset.id : null;
    try {
      const c = Logica.guardarCliente({ nombre: f.nombre.value, telefono: f.telefono.value, limite_credito: enteroONulo(f.limite.value) }, id);
      UI.avisar(id ? 'Cliente actualizado' : 'Cliente guardado');
      UI.render();
      abrirCuenta(c.id);
    } catch (e) {
      $('#dlg-error').textContent = e.message;
    }
  };

  App.envios['cliente-pago'] = form => {
    const id = +form.dataset.id;
    try {
      const pago = Logica.registrarPago(id, { monto: num(form.elements.monto.value), medio_pago: form.elements.medio.value });
      UI.avisar(`Pago de ${Formato.plata(pago.monto)} registrado`);
      UI.render();
      abrirCuenta(id);
    } catch (e) {
      $('#pago-error').textContent = e.message;
    }
  };

  App.acciones['cliente-baja'] = el => {
    const c = DB.buscar('clientes', +el.dataset.id);
    if (!confirm(`¿Dar de baja a ${c.nombre}? Su historial se conserva.`)) return;
    try {
      Logica.cambiarActivoCliente(c.id, false);
      UI.cerrarDialogo();
      UI.avisar('Cliente dado de baja');
      UI.render();
    } catch (e) {
      $('#dlg-error').textContent = e.message;
    }
  };
})();
