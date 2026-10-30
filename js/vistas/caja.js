/* Caja: turno abierto, entradas y salidas de efectivo, cierre con arqueo e historial. */
(function () {
  const diferencia = d => d === 0 ? '<span class="text-success fw-semibold">Justo</span>'
    : d > 0 ? `<span class="text-warning-emphasis fw-semibold">Sobran ${Formato.plata(d)}</span>` : `<span class="text-danger fw-semibold">Faltan ${Formato.plata(-d)}</span>`;

  App.vistas.caja = function () {
    const caja = Logica.cajaAbierta();
    const cerradas = DB.todos('cajas').filter(c => c.estado === 'cerrada').sort((a, b) => b.id - a.id);
    UI.vista().innerHTML = `
      ${H.tituloPagina('Caja')}
      ${caja ? cajaAbierta(caja) : `
        <div class="card shadow-sm text-center mx-auto mb-4" style="max-width: 34rem"><div class="card-body p-5">
          <i class="bi bi-lock fs-1 text-body-secondary"></i>
          <h2 class="h5 mt-2">La caja está cerrada</h2>
          <p class="text-body-secondary">Abrila al empezar el turno con el efectivo que tenés. Al cerrarla, el sistema te dice cuánto debería haber.</p>
          <button type="button" class="btn btn-primary btn-lg" data-accion="caja-abrir-dialogo"><i class="bi bi-unlock"></i> Abrir caja</button>
        </div></div>`}
      <section class="mt-4">
        <h2 class="h5">Cierres anteriores</h2>
        ${cerradas.length ? `<div class="card shadow-sm"><div class="table-responsive"><table class="table table-hover align-middle mb-0">
          <thead><tr><th>Turno</th><th class="num">Vendido</th><th class="num">Debía haber</th><th class="num">Se contó</th><th class="num">Diferencia</th><th></th></tr></thead>
          <tbody>${cerradas.slice(0, 30).map(c => `<tr>
            <td>${Formato.fecha(c.fecha_apertura)}<span class="sub">${Formato.hora(c.fecha_apertura)} a ${Formato.hora(c.fecha_cierre)}${c.usuario_cierre_id ? `, cerró ${esc(Logica.nombreUsuario(c.usuario_cierre_id))}` : ''}</span></td>
            <td class="num">${Formato.plata(Logica.resumenCaja(c).total)}</td>
            <td class="num">${Formato.plata(c.efectivo_esperado)}</td>
            <td class="num">${Formato.plata(c.efectivo_contado)}</td>
            <td class="num">${diferencia(c.diferencia)}</td>
            <td class="text-end"><button type="button" class="btn btn-sm btn-outline-secondary" data-accion="corte-ver" data-id="${c.id}">Ver</button></td>
          </tr>`).join('')}</tbody>
        </table></div></div>` : H.vacio('Todavía no se cerró ninguna caja.')}
      </section>`;
  };

  function resumenHTML(r) {
    const c = r.caja;
    const linea = (texto, monto, signo = '+', clase = '') => `<li class="list-group-item ${clase}"><span>${texto}</span><span>${signo} ${Formato.plata(monto)}</span></li>`;
    return `
      <div class="row g-3">
        <div class="col-md-6 col-xl-4"><section class="card shadow-sm h-100"><div class="card-body">
          <h2 class="h6"><i class="bi bi-cash"></i> Efectivo</h2>
          <ul class="list-group list-group-flush cuentas">
            ${linea('Dinero inicial', c.dinero_inicial, '')}
            ${linea('Ventas en efectivo', r.ventasEfectivo)}
            ${linea('Cobros de fiado en efectivo', r.cobrosEfectivo)}
            ${linea('Entradas', r.entradas)}
            ${linea('Salidas', r.salidas, '−')}
            <li class="list-group-item total"><span>Debería haber</span><span>${Formato.plata(r.efectivoEsperado)}</span></li>
            ${c.estado === 'cerrada' ? `<li class="list-group-item"><span>Se contó</span><span>${Formato.plata(c.efectivo_contado)}</span></li>
              <li class="list-group-item"><span>Diferencia</span><span>${diferencia(c.diferencia)}</span></li>` : ''}
          </ul>
          ${c.observacion ? `<p class="small text-body-secondary mt-2 mb-0">Nota: ${esc(c.observacion)}</p>` : ''}
        </div></section></div>
        <div class="col-md-6 col-xl-4"><section class="card shadow-sm h-100"><div class="card-body">
          <h2 class="h6"><i class="bi bi-credit-card"></i> Ventas del turno</h2>
          <ul class="list-group list-group-flush cuentas">
            ${r.porMedio.map(m => `<li class="list-group-item"><span>${m.medio.nombre}${m.cantidad ? ` <span class="badge rounded-pill text-bg-light border">${m.cantidad}</span>` : ''}</span><span>${Formato.plata(m.total)}</span></li>`).join('')}
            <li class="list-group-item total"><span>Total vendido</span><span>${Formato.plata(r.total)}</span></li>
            ${UI.esAdmin() ? `<li class="list-group-item"><span>Ganancia</span><span>${Formato.plata(r.ganancia)}</span></li>` : ''}
            ${r.cobrosTotal ? `<li class="list-group-item"><span>Cobros de fiado</span><span>${Formato.plata(r.cobrosTotal)}</span></li>` : ''}
          </ul>
        </div></section></div>
        <div class="col-md-12 col-xl-4"><section class="card shadow-sm h-100"><div class="card-body">
          <h2 class="h6"><i class="bi bi-folder2"></i> Por categoría</h2>
          ${r.porCategoria.length ? `<ul class="list-group list-group-flush cuentas">${r.porCategoria.map(x => `<li class="list-group-item"><span>${esc(x.nombre)}</span><span>${Formato.plata(x.vendido)}</span></li>`).join('')}</ul>` : H.vacio('Sin ventas.')}
        </div></section></div>
      </div>
      ${r.movimientos.length ? `
        <h3 class="h6 mt-4">Entradas y salidas</h3>
        <div class="card shadow-sm"><div class="table-responsive"><table class="table table-sm align-middle mb-0">
          <thead><tr><th>Hora</th><th>Motivo</th><th>Detalle</th><th>Registró</th><th class="num">Monto</th></tr></thead>
          <tbody>${r.movimientos.map(m => `<tr><td>${Formato.hora(m.fecha_hora)}</td><td>${MOTIVOS_CAJA[m.tipo][m.motivo]}</td>
            <td>${esc(m.descripcion) || '—'}</td><td>${esc(Logica.nombreUsuario(m.usuario_id)) || '—'}</td>
            <td class="num fw-semibold ${m.tipo === 'entrada' ? 'text-success' : 'text-danger'}">${m.tipo === 'entrada' ? '+' : '−'} ${Formato.plata(m.monto)}</td></tr>`).join('')}</tbody>
        </table></div></div>` : ''}`;
  }

  function cajaAbierta(caja) {
    const r = Logica.resumenCaja(caja);
    return `
      <section class="card shadow-sm mb-3"><div class="card-body d-flex flex-wrap justify-content-between align-items-end gap-3">
        <div>
          <div class="small text-body-secondary">Abierta el ${Formato.fecha(caja.fecha_apertura)} a las ${Formato.hora(caja.fecha_apertura)}${caja.usuario_apertura_id ? ` por ${esc(Logica.nombreUsuario(caja.usuario_apertura_id))}` : ''}</div>
          <div class="text-body-secondary">Efectivo que debería haber</div>
          <div class="display-6 fw-bold">${Formato.plata(r.efectivoEsperado)}</div>
        </div>
        <div class="d-flex flex-wrap gap-2">
          <button type="button" class="btn btn-outline-success" data-accion="mov-abrir" data-tipo="entrada"><i class="bi bi-plus-circle"></i> Entrada de efectivo</button>
          <button type="button" class="btn btn-outline-danger" data-accion="mov-abrir" data-tipo="salida"><i class="bi bi-dash-circle"></i> Salida de efectivo</button>
          <button type="button" class="btn btn-primary" data-accion="caja-cerrar-dialogo"><i class="bi bi-lock"></i> Cerrar caja</button>
        </div>
      </div></section>
      ${resumenHTML(r)}`;
  }

  App.acciones['mov-abrir'] = el => {
    const tipo = el.dataset.tipo;
    UI.abrirDialogo({
      titulo: tipo === 'entrada' ? 'Entrada de efectivo' : 'Salida de efectivo',
      subtitulo: tipo === 'entrada' ? 'Plata que se agrega a la caja sin ser una venta.' : 'Plata que sale de la caja: pagos, retiros o gastos.',
      enviar: 'movimiento', atributos: `data-tipo="${tipo}"`,
      cuerpo: `${H.error()}
        <div class="row g-3">
          <div class="col-sm-6">${H.campo('Monto', '<div class="input-group"><span class="input-group-text">$</span><input class="form-control" name="monto" type="number" min="1" step="1" inputmode="numeric" data-foco></div>')}</div>
          <div class="col-sm-6">${H.campo('Motivo', `<select class="form-select" name="motivo">${Object.entries(MOTIVOS_CAJA[tipo]).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>`)}</div>
        </div>
        ${H.campo('Detalle <span class="fw-normal text-body-secondary">(opcional)</span>', `<input class="form-control" name="descripcion" placeholder="${tipo === 'entrada' ? 'Por ejemplo: cambio del banco' : 'Por ejemplo: proveedor de bebidas'}" autocomplete="off">`)}`,
      pie: UI.pie('Registrar', { claseOk: tipo === 'entrada' ? 'btn-success' : 'btn-danger' })
    }, { ancho: 'chico' });
  };
  App.envios.movimiento = form => {
    const f = form.elements;
    try {
      Logica.registrarMovimiento({ tipo: form.dataset.tipo, motivo: f.motivo.value, monto: num(f.monto.value), descripcion: f.descripcion.value });
      UI.cerrarDialogo();
      UI.avisar(form.dataset.tipo === 'entrada' ? 'Entrada registrada' : 'Salida registrada');
      UI.render();
    } catch (e) { $('#dlg-error').textContent = e.message; }
  };

  App.acciones['caja-cerrar-dialogo'] = () => {
    const r = Logica.resumenCaja(Logica.cajaAbierta());
    UI.abrirDialogo({
      titulo: 'Cerrar caja', subtitulo: 'Contá los billetes y las monedas que hay en la caja.', enviar: 'caja-cerrar',
      atributos: `data-esperado="${r.efectivoEsperado}"`,
      cuerpo: `<div class="text-center mb-3"><div class="text-body-secondary">Debería haber</div><div class="display-6 fw-bold">${Formato.plata(r.efectivoEsperado)}</div></div>
        ${H.error()}
        ${H.campo('Efectivo contado', '<div class="input-group input-group-lg"><span class="input-group-text">$</span><input class="form-control" name="contado" type="number" min="0" step="1" inputmode="numeric" data-input="cierre-contado" data-foco></div>')}
        <p class="fs-5" id="cierre-diferencia" aria-live="polite"></p>
        ${H.campo('Nota <span class="fw-normal text-body-secondary">(opcional)</span>', '<input class="form-control" name="observacion" placeholder="Por ejemplo: faltó cambio, se pagó un flete" autocomplete="off">')}`,
      pie: UI.pie('<i class="bi bi-lock"></i> Cerrar caja')
    }, { ancho: 'chico' });
  };
  App.entradas['cierre-contado'] = el => {
    const contado = num(el.value);
    $('#cierre-diferencia').innerHTML = contado >= 0 ? diferencia(contado - +el.form.dataset.esperado) : '';
  };
  App.envios['caja-cerrar'] = form => {
    try {
      const caja = Logica.cerrarCaja(num(form.elements.contado.value), form.elements.observacion.value);
      UI.avisar('Caja cerrada');
      UI.render();
      verCorte(caja.id);
    } catch (e) { $('#dlg-error').textContent = e.message; }
  };

  function verCorte(id) {
    const c = DB.buscar('cajas', id);
    UI.abrirDialogo({
      titulo: `Cierre de caja del ${Formato.fecha(c.fecha_apertura)}`,
      subtitulo: `De ${Formato.hora(c.fecha_apertura)} a ${Formato.hora(c.fecha_cierre)}${c.fecha_cierre.slice(0, 10) !== c.fecha_apertura.slice(0, 10) ? ` del ${Formato.fecha(c.fecha_cierre)}` : ''}. Abrió ${esc(Logica.nombreUsuario(c.usuario_apertura_id)) || '—'}, cerró ${esc(Logica.nombreUsuario(c.usuario_cierre_id)) || '—'}.`,
      cuerpo: resumenHTML(Logica.resumenCaja(c)),
      pie: `<button type="button" class="btn btn-outline-secondary" data-accion="imprimir"><i class="bi bi-printer"></i> Imprimir</button>
        <button type="button" class="btn btn-primary" data-bs-dismiss="modal">Listo</button>`
    }, { ancho: 'grande' });
  }
  App.acciones['corte-ver'] = el => verCorte(+el.dataset.id);
  App.acciones.imprimir = () => window.print();
})();
