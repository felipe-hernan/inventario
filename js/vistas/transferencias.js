/* Transferencias: verificar en la cuenta del negocio, rechazar y resolver las que no llegaron. */
(function () {
  const est = App.estado.transf = { estado: 'pendiente', medioId: null, rango: 'hoy', texto: '' };

  function rango() {
    const hoy = Fechas.hoy();
    return { hoy: [hoy, hoy], semana: [Fechas.sumarDias(hoy, -6), hoy], todas: [null, null] }[est.rango];
  }

  App.vistas.transferencias = function () {
    const [desde, hasta] = rango();
    const base = Logica.transferencias({ medioId: est.medioId, desde, hasta });
    const cuenta = e => base.filter(f => f.pago.estado_verificacion === e).length;
    const cuentas = Logica.mediosPago().filter(m => m.tipo === 'transferencia');
    const cfg = Logica.config('transferencias');
    const tab = (id, texto, n) => `<li class="nav-item"><button type="button" class="nav-link ${est.estado === id ? 'active' : ''}" data-accion="transf-estado" data-estado="${id || ''}">
      ${texto}${n != null ? ` <span class="badge rounded-pill ${id === 'pendiente' && n ? 'text-bg-warning' : 'text-bg-light border'}">${n}</span>` : ''}</button></li>`;

    UI.vista().innerHTML = `
      ${H.tituloPagina('Transferencias')}
      <div class="alert alert-light border small">
        <i class="bi bi-shield-check"></i> Verificá siempre en la <strong>app del banco o de Mercado Pago del negocio</strong>, nunca en el celular del cliente.
        ${Logica.puedeVerificar() ? '' : 'Tu usuario puede ver las transferencias, pero no verificarlas.'}
        ${UI.esAdmin() ? '' : 'Rechazar una transferencia es tarea del administrador.'}
      </div>
      <ul class="nav nav-pills mb-3 gap-1">
        ${tab('pendiente', 'Pendientes', cuenta('pendiente'))}${tab('verificada', 'Verificadas', cuenta('verificada'))}
        ${tab('rechazada', 'Rechazadas', cuenta('rechazada'))}${tab('', 'Todas', null)}
      </ul>
      <div class="row g-2 align-items-center mb-3">
        <div class="col-md">
          <div class="input-group"><span class="input-group-text"><i class="bi bi-search"></i></span>
            <input type="search" class="form-control" placeholder="Buscar por N.º de operación, monto o titular" aria-label="Buscar transferencias" data-input="transf-buscar" value="${esc(est.texto)}"></div>
        </div>
        <div class="col-6 col-md-3">
          <select class="form-select" aria-label="Cuenta" data-cambio="transf-cuenta"><option value="">Todas las cuentas</option>
            ${cuentas.map(m => `<option value="${m.id}" ${est.medioId === m.id ? 'selected' : ''}>${esc(m.nombre)}</option>`).join('')}</select>
        </div>
        <div class="col-6 col-md-auto">
          <select class="form-select" aria-label="Período" data-cambio="transf-rango">
            <option value="hoy" ${est.rango === 'hoy' ? 'selected' : ''}>Hoy</option>
            <option value="semana" ${est.rango === 'semana' ? 'selected' : ''}>Últimos 7 días</option>
            <option value="todas" ${est.rango === 'todas' ? 'selected' : ''}>Todas</option></select>
        </div>
      </div>
      <div class="row g-3 mb-3">${Logica.totalesTransferencias(base).map(t => `
        <div class="col-md-6 col-xxl-3"><div class="card shadow-sm h-100"><div class="card-body py-2">
          <div class="fw-semibold">${esc(t.medio.nombre)}</div>
          <div class="d-flex flex-wrap gap-3 small">
            <span class="text-success"><i class="bi bi-check-circle"></i> ${Formato.plata(t.verificada)}</span>
            <span class="text-warning-emphasis"><i class="bi bi-hourglass-split"></i> ${Formato.plata(t.pendiente)}</span>
            ${t.rechazada ? `<span class="text-danger"><i class="bi bi-x-circle"></i> ${Formato.plata(t.rechazada)}</span>` : ''}
          </div>
        </div></div></div>`).join('') || `<div class="col-12">${H.vacio('No hay transferencias en este período.')}</div>`}
      </div>
      <p class="small text-body-secondary">Al final del día, compará el total verificado de cada cuenta con lo que muestra su app.</p>
      <div class="card shadow-sm"><div class="table-responsive">
        <table class="table table-hover align-middle mb-0">
          <thead><tr><th>Hora</th><th>Origen</th><th>Cuenta</th><th>N.º de operación</th><th class="num">Monto</th><th>Estado</th><th></th></tr></thead>
          <tbody id="tbody-transf">${filas(cfg)}</tbody>
        </table>
      </div></div>`;
  };

  function filas(cfg = Logica.config('transferencias')) {
    const [desde, hasta] = rango();
    const lista = Logica.transferencias({ estado: est.estado || null, medioId: est.medioId, desde, hasta, texto: est.texto });
    if (!lista.length) return '<tr><td colspan="7" class="text-body-secondary fst-italic">No hay transferencias que coincidan.</td></tr>';
    return lista.map(f => {
      const p = f.pago;
      let estado;
      if (p.estado_verificacion === 'pendiente') {
        const m = f.minutosPendiente;
        const color = m >= 30 ? 'danger' : m >= cfg.minutosAviso ? 'warning' : 'success';
        estado = `<span class="badge text-bg-${color}">Pendiente · ${m < 60 ? `${m} min` : `${Math.floor(m / 60)} h`}</span>`;
      } else if (p.estado_verificacion === 'verificada') {
        estado = `<span class="badge text-bg-success">Verificada</span><span class="sub">${esc(Logica.nombreUsuario(p.verificado_por))}, ${Formato.hora(p.verificado_en)}</span>`;
      } else {
        estado = `<span class="badge text-bg-danger">Rechazada</span><span class="sub">${esc(p.motivo_rechazo)}</span>
          ${f.origen === 'venta' ? (p.resuelto_con ? '<span class="sub text-success">Resuelta</span>' : '<span class="sub text-danger fw-semibold">Sin resolver</span>') : ''}`;
      }
      const acciones = [];
      if (p.estado_verificacion === 'pendiente' && Logica.puedeVerificar()) {
        acciones.push(`<button type="button" class="btn btn-success" data-accion="transf-verificar" data-origen="${f.origen}" data-id="${p.id}"><i class="bi bi-check-lg"></i> Verificar</button>`);
      }
      if (UI.esAdmin() && p.estado_verificacion !== 'rechazada') {
        acciones.push(`<button type="button" class="btn btn-outline-danger" data-accion="transf-rechazar" data-origen="${f.origen}" data-id="${p.id}">${p.estado_verificacion === 'verificada' ? 'Revertir' : 'Rechazar'}</button>`);
      }
      if (f.origen === 'venta' && p.estado_verificacion === 'rechazada' && !p.resuelto_con) {
        acciones.push(`<button type="button" class="btn btn-primary" data-accion="transf-resolver" data-id="${p.id}">Resolver</button>`);
      }
      acciones.push(`<button type="button" class="btn btn-outline-secondary" data-accion="transf-detalle" data-origen="${f.origen}" data-id="${p.id}" aria-label="Ver detalle"><i class="bi bi-three-dots"></i></button>`);
      return `<tr>
        <td class="text-nowrap">${est.rango === 'hoy' ? Formato.hora(p.fecha_hora) : Formato.fechaHora(p.fecha_hora)}<span class="sub">${esc(f.cajero)}</span></td>
        <td>${esc(f.referencia)}${p.titular ? `<span class="sub">Titular: ${esc(p.titular)}</span>` : ''}</td>
        <td>${esc(f.medio.nombre)}</td>
        <td><code>${esc(p.numero_operacion)}</code>${p.autorizado_por ? `<span class="sub text-warning-emphasis" title="${esc(p.motivo_autorizacion)}">N.º repetido autorizado</span>` : ''}</td>
        <td class="num fw-semibold">${Formato.plata(p.monto)}</td>
        <td>${estado}</td>
        <td class="text-end"><div class="btn-group btn-group-sm">${acciones.join('')}</div></td>
      </tr>`;
    }).join('');
  }

  const redibujar = () => App.vistas.transferencias();
  App.acciones['transf-estado'] = el => { est.estado = el.dataset.estado || ''; redibujar(); };
  App.cambios['transf-cuenta'] = el => { est.medioId = el.value ? +el.value : null; redibujar(); };
  App.cambios['transf-rango'] = el => { est.rango = el.value; redibujar(); };
  App.entradas['transf-buscar'] = el => { est.texto = el.value; $('#tbody-transf').innerHTML = filas(); };
  App.filtrarTransferencias = (estado = 'pendiente') => { est.estado = estado; est.rango = 'todas'; est.texto = ''; est.medioId = null; };

  App.acciones['transf-verificar'] = el => {
    try {
      const p = Logica.verificarPago(el.dataset.origen, +el.dataset.id);
      UI.avisar(`Transferencia de ${Formato.plata(p.monto)} verificada`);
      UI.render();
    } catch (e) { UI.avisar(e.message); }
  };

  App.acciones['transf-rechazar'] = el => {
    const tabla = el.dataset.origen === 'cobro' ? 'pagos_clientes' : 'pagos_venta';
    const p = DB.buscar(tabla, +el.dataset.id);
    const revertir = p.estado_verificacion === 'verificada';
    UI.abrirDialogo({
      titulo: revertir ? 'Revertir verificación' : 'Rechazar transferencia',
      subtitulo: `${Formato.plata(p.monto)}, operación ${esc(p.numero_operacion)}`,
      enviar: 'transf-rechazo', atributos: `data-origen="${el.dataset.origen}" data-id="${p.id}"`,
      cuerpo: `<p>${revertir ? 'La transferencia figura como verificada. Revertila solo si confirmaste que la plata no está, por ejemplo por un contracargo.'
          : 'Rechazala si confirmaste en la cuenta del negocio que la plata no llegó.'}
        ${el.dataset.origen === 'venta' ? 'Después vas a poder resolver la venta: cobrarla con otro medio o pasarla a la cuenta del cliente.' : 'La deuda del cliente vuelve a quedar como estaba.'}</p>
        ${H.error()}
        ${H.campo('Motivo', `<select class="form-select mb-2" data-cambio="transf-motivo"><option>No se acreditó en la cuenta</option><option>Comprobante falso o editado</option><option>Comprobante repetido</option><option>Monto distinto al informado</option><option value="">Otro…</option></select>
          <input class="form-control" name="motivo" value="No se acreditó en la cuenta" data-foco>`)}`,
      pie: UI.pie(revertir ? 'Revertir' : 'Rechazar', { claseOk: 'btn-danger' })
    }, { ancho: 'chico' });
  };
  App.cambios['transf-motivo'] = el => { const m = el.form.elements.motivo; m.value = el.value; if (!el.value) m.focus(); };
  App.envios['transf-rechazo'] = form => {
    try {
      Logica.rechazarPago(form.dataset.origen, +form.dataset.id, form.elements.motivo.value);
      UI.cerrarDialogo();
      UI.avisar('Transferencia rechazada');
      UI.render();
    } catch (e) { $('#dlg-error').textContent = e.message; }
  };

  // Resolver una venta cuyo pago por transferencia fue rechazado
  App.acciones['transf-resolver'] = el => {
    const p = DB.buscar('pagos_venta', +el.dataset.id);
    const medios = Logica.mediosPago({ soloActivos: true }).filter(m => m.tipo !== 'transferencia');
    UI.abrirDialogo({
      titulo: 'Resolver pago rechazado', subtitulo: `Venta N.º ${p.venta_id}: falta cobrar ${Formato.plata(p.monto)}`,
      enviar: 'transf-resolucion', atributos: `data-id="${p.id}"`,
      cuerpo: `${H.error()}
        ${H.campo('¿Cómo se resuelve?', `<select class="form-select" name="medio" data-cambio="resolver-medio">${medios.map(m => `<option value="${m.id}" data-tipo="${m.tipo}">${m.tipo === 'cuenta' ? 'Pasarlo a la cuenta de un cliente (fiado)' : `Cobrarlo en ${esc(m.nombre)}`}</option>`).join('')}</select>`)}
        <div data-bloque="resolver-cliente" hidden>${H.campo('Cliente', `<select class="form-select" name="cliente"><option value="">Elegí un cliente</option>
          ${Logica.clientesActivos().map(c => `<option value="${c.id}">${esc(c.nombre)}</option>`).join('')}</select>`)}</div>
        <p class="small text-body-secondary mb-0">El pago rechazado queda en el historial. Se agrega un pago nuevo por ${Formato.plata(p.monto)}${Logica.cajaAbierta() ? ' en la caja abierta' : ''}.</p>`,
      pie: UI.pie('Resolver')
    }, { ancho: 'chico' });
    App.cambios['resolver-medio']($('#dlg [name=medio]'));
  };
  App.cambios['resolver-medio'] = el => {
    $('#dlg [data-bloque=resolver-cliente]').hidden = el.selectedOptions[0].dataset.tipo !== 'cuenta';
  };
  App.envios['transf-resolucion'] = form => {
    const f = form.elements;
    try {
      Logica.resolverRechazo(+form.dataset.id, { medio_pago_id: +f.medio.value, cliente_id: f.cliente.value ? +f.cliente.value : null });
      UI.cerrarDialogo();
      UI.avisar('Venta resuelta');
      UI.render();
    } catch (e) { $('#dlg-error').textContent = e.message; }
  };

  // Detalle con el historial de cambios de estado
  App.acciones['transf-detalle'] = el => {
    const origen = el.dataset.origen;
    const p = DB.buscar(origen === 'cobro' ? 'pagos_clientes' : 'pagos_venta', +el.dataset.id);
    const historial = Logica.historialPago(origen, p.id);
    const fila = (a, b) => `<li class="list-group-item"><span>${a}</span><span>${b}</span></li>`;
    UI.abrirDialogo({
      titulo: 'Detalle de la transferencia', subtitulo: origen === 'venta' ? `Venta N.º ${p.venta_id}` : `Cobro de fiado a ${esc(Logica.nombreCliente(p.cliente_id))}`,
      cuerpo: `<ul class="list-group list-group-flush cuentas mb-3">
          ${fila('Cuenta', esc(Formato.medio(p.medio_pago_id)))}${fila('Monto', Formato.plata(p.monto))}
          ${fila('N.º de operación', `<code>${esc(p.numero_operacion)}</code>`)}${fila('Titular', esc(p.titular) || '—')}
          ${fila('Cobró', `${esc(Logica.nombreUsuario(p.usuario_id))}, ${Formato.fechaHora(p.fecha_hora)}`)}
          ${fila('Estado', ESTADOS_VERIFICACION[p.estado_verificacion])}
          ${p.metodo_verificacion ? fila('Método', p.metodo_verificacion === 'manual' ? 'Manual' : 'Automático') : ''}
          ${p.autorizado_por ? fila('N.º repetido autorizado por', `${esc(Logica.nombreUsuario(p.autorizado_por))}: ${esc(p.motivo_autorizacion)}`) : ''}
        </ul>
        <h3 class="h6">Historial</h3>
        ${historial.length ? `<ul class="list-group">${historial.map(h => `<li class="list-group-item small">
          <strong>${Formato.fechaHora(h.fecha_hora)}</strong>: ${h.estado_anterior ? `${ESTADOS_VERIFICACION[h.estado_anterior]} → ` : ''}${ESTADOS_VERIFICACION[h.estado_nuevo]},
          ${esc(Logica.nombreUsuario(h.usuario_id))}${h.motivo ? `. Motivo: ${esc(h.motivo)}` : ''}</li>`).join('')}</ul>` : H.vacio('Todavía no se verificó.')}`
    }, { ancho: 'chico' });
  };
})();
