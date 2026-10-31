/* Caja: turno abierto, entradas y salidas de efectivo, cierre con arqueo e historial. */
(function () {
  App.vistas.caja = function () {
    const caja = Logica.cajaAbierta();
    const cerradas = DB.todos('cajas').filter(c => c.estado === 'cerrada').sort((a, b) => b.id - a.id);
    UI.vista().innerHTML = `
      <h1>Caja</h1>
      ${caja ? cajaAbierta(caja) : `
        <section class="panel panel-centrado">
          <h2>La caja está cerrada</h2>
          <p>Abrila al empezar el turno con el efectivo que tenés. Al cerrarla, el sistema te dice cuánto debería haber.</p>
          <button type="button" class="boton boton-grande" data-accion="caja-abrir-dialogo">Abrir caja</button>
        </section>`}
      <section class="seccion" aria-labelledby="t-cierres">
        <h2 id="t-cierres">Cierres anteriores</h2>
        ${cerradas.length ? `<div class="tabla-envoltura"><table class="tabla">
          <thead><tr><th scope="col">Turno</th><th scope="col" class="num">Vendido</th><th scope="col" class="num">Debía haber</th>
            <th scope="col" class="num">Se contó</th><th scope="col" class="num">Diferencia</th><th scope="col"><span class="solo-lector">Acciones</span></th></tr></thead>
          <tbody>${cerradas.slice(0, 30).map(c => {
            const r = Logica.resumenCaja(c);
            return `<tr>
              <td>${Formato.fecha(c.fecha_apertura)}<span class="sub">${Formato.hora(c.fecha_apertura)} a ${Formato.hora(c.fecha_cierre)}${c.usuario_cierre_id ? `, cerró ${esc(Logica.nombreUsuario(c.usuario_cierre_id))}` : ''}</span></td>
              <td class="num">${Formato.plata(r.total)}</td>
              <td class="num">${Formato.plata(c.efectivo_esperado)}</td>
              <td class="num">${Formato.plata(c.efectivo_contado)}</td>
              <td class="num">${textoDiferencia(c.diferencia)}</td>
              <td class="num"><button type="button" class="boton boton-sec boton-chico" data-accion="corte-ver" data-id="${c.id}">Ver</button></td>
            </tr>`;
          }).join('')}</tbody>
        </table></div>` : '<p class="vacio">Todavía no se cerró ninguna caja.</p>'}
      </section>`;
  };

  function textoDiferencia(d) {
    if (d === 0) return '<span class="texto-verde">Justo</span>';
    return d > 0 ? `<span class="texto-ambar">Sobran ${Formato.plata(d)}</span>` : `<span class="texto-rojo">Faltan ${Formato.plata(-d)}</span>`;
  }

  // Resumen reutilizable: se usa en la caja abierta y en el detalle de un cierre.
  function resumenHTML(r) {
    const c = r.caja;
    const linea = (texto, monto, signo = '+') => `<li><span>${texto}</span><span>${signo} ${Formato.plata(monto)}</span></li>`;
    return `
      <div class="resumen-caja">
        <section class="panel">
          <h2>Efectivo</h2>
          <ul class="cuentas">
            ${linea('Dinero inicial', c.dinero_inicial, '')}
            ${linea('Ventas en efectivo', r.ventasEfectivo)}
            ${linea('Cobros de fiado en efectivo', r.cobrosEfectivo)}
            ${linea('Entradas', r.entradas)}
            ${linea('Salidas', r.salidas, '−')}
            <li class="cuentas-total"><span>Debería haber</span><span>${Formato.plata(r.efectivoEsperado)}</span></li>
            ${c.estado === 'cerrada' ? `
              <li><span>Se contó</span><span>${Formato.plata(c.efectivo_contado)}</span></li>
              <li><span>Diferencia</span><span>${textoDiferencia(c.diferencia)}</span></li>` : ''}
          </ul>
          ${c.observacion ? `<p class="ayuda">Nota: ${esc(c.observacion)}</p>` : ''}
        </section>
        <section class="panel">
          <h2>Ventas del turno</h2>
          <ul class="cuentas">
            ${r.porMedio.map(m => `<li><span>${m.medio.nombre}${m.cantidad ? ` <span class="sub-inline">(${m.cantidad})</span>` : ''}</span><span>${Formato.plata(m.total)}</span></li>`).join('')}
            <li class="cuentas-total"><span>Total vendido</span><span>${Formato.plata(r.total)}</span></li>
            ${UI.esAdmin() ? `<li><span>Ganancia</span><span>${Formato.plata(r.ganancia)}</span></li>` : ''}
            ${r.cobrosTotal ? `<li><span>Cobros de fiado (todos los medios)</span><span>${Formato.plata(r.cobrosTotal)}</span></li>` : ''}
          </ul>
        </section>
        <section class="panel">
          <h2>Por categoría</h2>
          ${r.porCategoria.length ? `<ul class="cuentas">${r.porCategoria.map(x => `<li><span>${esc(x.nombre)}</span><span>${Formato.plata(x.vendido)}</span></li>`).join('')}</ul>`
            : '<p class="vacio">Sin ventas.</p>'}
        </section>
      </div>
      ${r.movimientos.length ? `
        <h3>Entradas y salidas</h3>
        <div class="tabla-envoltura"><table class="tabla tabla-chica">
          <thead><tr><th scope="col">Hora</th><th scope="col">Motivo</th><th scope="col">Detalle</th><th scope="col" class="num">Monto</th></tr></thead>
          <tbody>${r.movimientos.map(m => `<tr><td>${Formato.hora(m.fecha_hora)}</td><td>${MOTIVOS_CAJA[m.tipo][m.motivo]}</td>
            <td>${esc(m.descripcion) || '—'}</td>
            <td class="num ${m.tipo === 'entrada' ? 'texto-verde' : 'texto-rojo'}">${m.tipo === 'entrada' ? '+' : '−'} ${Formato.plata(m.monto)}</td></tr>`).join('')}</tbody>
        </table></div>` : ''}`;
  }

  function cajaAbierta(caja) {
    const r = Logica.resumenCaja(caja);
    return `
      <section class="caja-cabecera">
        <div>
          <p class="ayuda">Abierta el ${Formato.fecha(caja.fecha_apertura)} a las ${Formato.hora(caja.fecha_apertura)}${caja.usuario_apertura_id ? ` por ${esc(Logica.nombreUsuario(caja.usuario_apertura_id))}` : ''}</p>
          <p class="caja-esperado"><span>Efectivo que debería haber</span><strong>${Formato.plata(r.efectivoEsperado)}</strong></p>
        </div>
        <div class="fila-botones">
          <button type="button" class="boton boton-sec" data-accion="mov-abrir" data-tipo="entrada">Entrada de efectivo</button>
          <button type="button" class="boton boton-sec" data-accion="mov-abrir" data-tipo="salida">Salida de efectivo</button>
          <button type="button" class="boton" data-accion="caja-cerrar-dialogo">Cerrar caja</button>
        </div>
      </section>
      ${resumenHTML(r)}`;
  }

  // ---------- Entradas y salidas ----------
  App.acciones['mov-abrir'] = el => {
    const tipo = el.dataset.tipo;
    UI.abrirDialogo(`
      <form class="dlg-cuerpo" data-enviar="movimiento" data-tipo="${tipo}" novalidate>
        ${UI.cabecera(tipo === 'entrada' ? 'Entrada de efectivo' : 'Salida de efectivo',
          tipo === 'entrada' ? 'Plata que se agrega a la caja sin ser una venta.' : 'Plata que sale de la caja: pagos, retiros o gastos.')}
        <p class="error" id="dlg-error" role="alert"></p>
        <div class="grilla-form">
          <label class="campo">Monto
            <input name="monto" type="number" min="1" step="1" inputmode="numeric" data-foco>
          </label>
          <label class="campo">Motivo
            <select name="motivo">${Object.entries(MOTIVOS_CAJA[tipo]).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
          </label>
        </div>
        <label class="campo">Detalle <span class="opcional">(opcional)</span>
          <input name="descripcion" placeholder="${tipo === 'entrada' ? 'Por ejemplo: cambio del banco' : 'Por ejemplo: proveedor de bebidas'}" autocomplete="off">
        </label>
        <div class="dlg-pie">
          <span class="espacio"></span>
          <button type="button" class="boton boton-sec" data-accion="dlg-cerrar">Cancelar</button>
          <button type="submit" class="boton">Registrar</button>
        </div>
      </form>`, { ancho: 'chico' });
  };

  App.envios.movimiento = form => {
    const f = form.elements;
    try {
      Logica.registrarMovimiento({ tipo: form.dataset.tipo, motivo: f.motivo.value, monto: num(f.monto.value), descripcion: f.descripcion.value });
      UI.cerrarDialogo();
      UI.avisar(form.dataset.tipo === 'entrada' ? 'Entrada registrada' : 'Salida registrada');
      UI.render();
    } catch (e) {
      $('#dlg-error').textContent = e.message;
    }
  };

  // ---------- Cierre ----------
  App.acciones['caja-cerrar-dialogo'] = () => {
    const r = Logica.resumenCaja(Logica.cajaAbierta());
    UI.abrirDialogo(`
      <form class="dlg-cuerpo" data-enviar="caja-cerrar" data-esperado="${r.efectivoEsperado}" novalidate>
        ${UI.cabecera('Cerrar caja', 'Contá los billetes y las monedas que hay en la caja.')}
        <p class="caja-esperado"><span>Debería haber</span><strong>${Formato.plata(r.efectivoEsperado)}</strong></p>
        <p class="error" id="dlg-error" role="alert"></p>
        <label class="campo">Efectivo contado
          <input name="contado" type="number" min="0" step="1" inputmode="numeric" data-input="cierre-contado" data-foco>
        </label>
        <p class="diferencia" id="cierre-diferencia" aria-live="polite"></p>
        <label class="campo">Nota <span class="opcional">(opcional)</span>
          <input name="observacion" placeholder="Por ejemplo: faltó cambio, se pagó un flete" autocomplete="off">
        </label>
        <div class="dlg-pie">
          <span class="espacio"></span>
          <button type="button" class="boton boton-sec" data-accion="dlg-cerrar">Cancelar</button>
          <button type="submit" class="boton">Cerrar caja</button>
        </div>
      </form>`, { ancho: 'chico' });
  };

  App.entradas['cierre-contado'] = el => {
    const contado = num(el.value);
    const esperado = +el.form.dataset.esperado;
    $('#cierre-diferencia').innerHTML = contado >= 0 ? textoDiferencia(contado - esperado) : '';
  };

  App.envios['caja-cerrar'] = form => {
    try {
      const caja = Logica.cerrarCaja(num(form.elements.contado.value), form.elements.observacion.value);
      UI.avisar('Caja cerrada');
      UI.render();
      verCorte(caja.id);
    } catch (e) {
      $('#dlg-error').textContent = e.message;
    }
  };

  // ---------- Detalle de un cierre ----------
  function verCorte(id) {
    const c = DB.buscar('cajas', id);
    UI.abrirDialogo(`
      <div class="dlg-cuerpo">
        ${UI.cabecera(`Cierre de caja del ${Formato.fecha(c.fecha_apertura)}`, `De ${Formato.hora(c.fecha_apertura)} a ${Formato.hora(c.fecha_cierre)}${c.fecha_cierre.slice(0, 10) !== c.fecha_apertura.slice(0, 10) ? ` del ${Formato.fecha(c.fecha_cierre)}` : ''}. Abrió ${esc(Logica.nombreUsuario(c.usuario_apertura_id)) || '—'}, cerró ${esc(Logica.nombreUsuario(c.usuario_cierre_id)) || '—'}.`)}
        ${resumenHTML(Logica.resumenCaja(c))}
        <div class="dlg-pie no-imprimir">
          <span class="espacio"></span>
          <button type="button" class="boton boton-sec" data-accion="imprimir">Imprimir</button>
          <button type="button" class="boton" data-accion="dlg-cerrar">Listo</button>
        </div>
      </div>`, { ancho: 'grande' });
  }

  App.acciones['corte-ver'] = el => verCorte(+el.dataset.id);
  App.acciones.imprimir = () => window.print();
})();
