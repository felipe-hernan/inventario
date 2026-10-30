/* Clientes: fiado, estado de cuenta y cobros. */
(function () {
  const est = App.estado.clientes = { busqueda: '', soloDeudores: false };

  App.vistas.clientes = function () {
    const deudores = Logica.deudores();
    const total = deudores.reduce((s, d) => s + d.saldo, 0);
    UI.vista().innerHTML = `
      ${H.tituloPagina('Clientes', '<button type="button" class="btn btn-primary" data-accion="cliente-nuevo"><i class="bi bi-person-plus"></i> Nuevo cliente</button>')}
      <div class="alert ${deudores.length ? 'alert-info' : 'alert-success'} py-2">
        ${deudores.length ? `<i class="bi bi-journal-text"></i> Te deben <strong>${Formato.plata(total)}</strong> entre ${deudores.length} ${deudores.length === 1 ? 'cliente' : 'clientes'}.`
          : '<i class="bi bi-check2-circle"></i> Nadie tiene deuda pendiente.'}
      </div>
      <div class="row g-2 align-items-center mb-3">
        <div class="col-md">
          <div class="input-group"><span class="input-group-text"><i class="bi bi-search"></i></span>
            <input type="search" class="form-control" placeholder="Buscar por nombre o teléfono" aria-label="Buscar clientes" data-input="clientes-buscar" value="${esc(est.busqueda)}"></div>
        </div>
        <div class="col-md-auto">
          <div class="form-check form-switch mb-0">
            <input class="form-check-input" type="checkbox" role="switch" id="solo-deudores" data-cambio="clientes-deudores" ${est.soloDeudores ? 'checked' : ''}>
            <label class="form-check-label" for="solo-deudores">Solo los que deben</label>
          </div>
        </div>
      </div>
      <div class="card shadow-sm"><div class="table-responsive">
        <table class="table table-hover align-middle mb-0">
          <thead><tr><th>Cliente</th><th class="num">Debe</th><th class="num">Límite</th><th></th></tr></thead>
          <tbody id="tbody-clientes">${filas()}</tbody>
        </table>
      </div></div>`;
  };

  function filas() {
    const t = normalizar(est.busqueda);
    let lista = Logica.clientesActivos().map(c => ({ cliente: c, saldo: Logica.saldoCliente(c.id) }));
    if (t) lista = lista.filter(x => normalizar(x.cliente.nombre).includes(t) || x.cliente.telefono.includes(est.busqueda.trim()));
    if (est.soloDeudores) lista = lista.filter(x => x.saldo > 0);
    lista.sort((a, b) => b.saldo - a.saldo || a.cliente.nombre.localeCompare(b.cliente.nombre, 'es'));
    if (!lista.length) return `<tr><td colspan="4" class="text-body-secondary fst-italic">${Logica.clientesActivos().length ? 'Ningún cliente coincide.' : 'Todavía no hay clientes.'}</td></tr>`;
    return lista.map(({ cliente: c, saldo }) => `<tr>
      <td><a href="#" class="fw-semibold" data-accion="cliente-cuenta" data-id="${c.id}">${esc(c.nombre)}</a>${c.telefono ? `<span class="sub">${esc(c.telefono)}</span>` : ''}</td>
      <td class="num ${saldo > 0 ? 'text-danger fw-bold' : ''}">${Formato.plata(saldo)}</td>
      <td class="num">${c.limite_credito != null ? Formato.plata(c.limite_credito) : '<span class="text-body-secondary">Sin límite</span>'}</td>
      <td class="text-end"><button type="button" class="btn btn-sm btn-outline-secondary" data-accion="cliente-cuenta" data-id="${c.id}">Ver cuenta</button></td>
    </tr>`).join('');
  }

  function abrirCuenta(id, { mostrarPago = false } = {}) {
    const c = DB.buscar('clientes', id);
    const saldo = Logica.saldoCliente(id);
    const movimientos = Logica.estadoCuenta(id);
    const caja = Logica.cajaAbierta();
    UI.abrirDialogo({
      titulo: esc(c.nombre),
      subtitulo: [c.telefono, c.limite_credito != null ? `Límite ${Formato.plata(c.limite_credito)}` : 'Sin límite de fiado'].filter(Boolean).map(esc).join('. '),
      cuerpo: `
        <div class="alert ${saldo > 0 ? 'alert-danger' : 'alert-success'} d-flex justify-content-between align-items-baseline">
          <span>${saldo > 0 ? 'Debe' : 'Está al día'}</span><strong class="fs-3">${Formato.plata(saldo)}</strong>
        </div>
        <div class="d-flex flex-wrap gap-2 mb-3 no-imprimir">
          ${saldo > 0 ? `<button type="button" class="btn btn-primary" data-bs-toggle="collapse" data-bs-target="#form-pago" aria-expanded="${mostrarPago}"><i class="bi bi-cash"></i> Registrar pago</button>
            <a class="btn btn-success" href="${linkWhatsApp(c, saldo, movimientos)}" target="_blank" rel="noopener"><i class="bi bi-whatsapp"></i> Enviar por WhatsApp</a>` : ''}
          <button type="button" class="btn btn-outline-secondary" data-accion="cliente-editar" data-id="${c.id}"><i class="bi bi-pencil"></i> Editar datos</button>
        </div>
        <div class="collapse ${mostrarPago ? 'show' : ''}" id="form-pago">
          <form class="card card-body bg-body-tertiary mb-3" data-enviar="cliente-pago" data-id="${c.id}" novalidate>
            ${caja ? `<div class="row g-3">
                <div class="col-sm-6">${H.campo('Monto que paga', `<div class="input-group"><span class="input-group-text">$</span><input class="form-control" name="monto" type="number" min="1" max="${saldo}" step="1" inputmode="numeric" value="${saldo}"></div>`)}</div>
                <div class="col-sm-6">${H.campo('Cómo paga', `<select class="form-select" name="medio">${MEDIOS_PAGO.filter(m => m.id !== 'cuenta').map(m => `<option value="${m.id}">${m.nombre}</option>`).join('')}</select>`)}</div>
              </div>
              ${H.error('pago-error')}
              <div><button type="submit" class="btn btn-primary">Confirmar pago</button></div>`
            : `<p>Para registrar un cobro, primero abrí la caja.</p><div><button type="button" class="btn btn-primary" data-accion="caja-abrir-dialogo">Abrir caja</button></div>`}
          </form>
        </div>
        <h3 class="h6">Movimientos</h3>
        ${movimientos.length ? `<div class="table-responsive"><table class="table table-sm align-middle">
          <thead><tr><th>Fecha</th><th>Detalle</th><th class="num">Compra</th><th class="num">Pago</th><th class="num">Saldo</th></tr></thead>
          <tbody>${movimientos.map(m => `<tr>
            <td class="text-nowrap">${Formato.fechaHora(m.fecha_hora)}</td><td>${esc(m.detalle)}</td>
            <td class="num">${m.tipo === 'compra' ? Formato.plata(m.monto) : ''}</td>
            <td class="num text-success fw-semibold">${m.tipo === 'pago' ? Formato.plata(m.monto) : ''}</td>
            <td class="num fw-bold">${Formato.plata(m.saldo)}</td></tr>`).join('')}</tbody>
        </table></div>` : H.vacio('Todavía no compró fiado.')}`
    }, { ancho: 'normal' });
  }

  function linkWhatsApp(c, saldo, movimientos) {
    const ultimos = movimientos.slice(0, 5).map(m => `${Formato.fechaCorta(m.fecha_hora)}: ${m.tipo === 'compra' ? 'compra' : 'pago'} ${Formato.plata(m.monto)}`).join('\n');
    const texto = `Hola ${c.nombre}, te paso tu cuenta del almacén.\nSaldo: ${Formato.plata(saldo)}\n\nÚltimos movimientos:\n${ultimos}`;
    let tel = (c.telefono || '').replace(/\D/g, '');
    if (tel && !tel.startsWith('54')) tel = '549' + tel.replace(/^0/, '');
    return `https://wa.me/${tel}?text=${encodeURIComponent(texto)}`;
  }

  function formCliente(id = null) {
    const c = id ? DB.buscar('clientes', id) : null;
    const saldo = c ? Logica.saldoCliente(c.id) : 0;
    UI.abrirDialogo({
      titulo: c ? 'Editar cliente' : 'Nuevo cliente', enviar: 'cliente-guardar', atributos: `data-id="${id || ''}"`,
      cuerpo: `${H.error()}
        ${H.campo('Nombre', `<input class="form-control" name="nombre" value="${esc(c?.nombre)}" autocomplete="off" data-foco>`)}
        ${H.campo('Teléfono <span class="fw-normal text-body-secondary">(opcional)</span>', `<input class="form-control" name="telefono" type="tel" value="${esc(c?.telefono)}" inputmode="tel" autocomplete="off">`,
          'Con característica, por ejemplo 381 5550101. Sirve para mandarle la cuenta por WhatsApp.')}
        ${H.campo('Límite de fiado <span class="fw-normal text-body-secondary">(opcional)</span>', `<div class="input-group"><span class="input-group-text">$</span><input class="form-control" name="limite" type="number" min="0" step="1" inputmode="numeric" value="${c?.limite_credito ?? ''}"></div>`,
          'Si la deuda pasa este monto, el sistema avisa antes de fiar. Dejalo vacío para no poner límite.')}`,
      pie: UI.pie('Guardar', {
        izquierda: c ? `<button type="button" class="btn btn-outline-danger" data-accion="cliente-baja" data-id="${c.id}" ${saldo > 0 ? 'disabled title="Tiene deuda pendiente"' : ''}>Dar de baja</button>` : ''
      })
    }, { ancho: 'chico' });
  }

  App.entradas['clientes-buscar'] = el => { est.busqueda = el.value; $('#tbody-clientes').innerHTML = filas(); };
  App.cambios['clientes-deudores'] = el => { est.soloDeudores = el.checked; $('#tbody-clientes').innerHTML = filas(); };
  App.acciones['cliente-nuevo'] = () => formCliente();
  App.acciones['cliente-editar'] = el => formCliente(+el.dataset.id);
  App.acciones['cliente-cuenta'] = el => abrirCuenta(+el.dataset.id);

  App.envios['cliente-guardar'] = form => {
    const f = form.elements, id = form.dataset.id ? +form.dataset.id : null;
    try {
      const c = Logica.guardarCliente({ nombre: f.nombre.value, telefono: f.telefono.value, limite_credito: enteroONulo(f.limite.value) }, id);
      UI.avisar(id ? 'Cliente actualizado' : 'Cliente guardado');
      UI.render();
      abrirCuenta(c.id);
    } catch (e) { $('#dlg-error').textContent = e.message; }
  };
  App.envios['cliente-pago'] = form => {
    const id = +form.dataset.id;
    try {
      const pago = Logica.registrarPago(id, { monto: num(form.elements.monto.value), medio_pago: form.elements.medio.value });
      UI.avisar(`Pago de ${Formato.plata(pago.monto)} registrado`);
      UI.render();
      abrirCuenta(id);
    } catch (e) { $('#pago-error').textContent = e.message; }
  };
  App.acciones['cliente-baja'] = el => {
    const c = DB.buscar('clientes', +el.dataset.id);
    if (!confirm(`¿Dar de baja a ${c.nombre}? Su historial se conserva.`)) return;
    try {
      Logica.cambiarActivoCliente(c.id, false);
      UI.cerrarDialogo();
      UI.avisar('Cliente dado de baja');
      UI.render();
    } catch (e) { $('#dlg-error').textContent = e.message; }
  };
})();
