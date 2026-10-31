/* Informes: ventas de un período, por medio de pago, por categoría y por producto. */
(function () {
  const est = App.estado.informe = { desde: Fechas.hoy(), hasta: Fechas.hoy() };

  function rangos() {
    const hoy = Fechas.hoy();
    return [
      { id: 'hoy', texto: 'Hoy', desde: hoy, hasta: hoy },
      { id: 'ayer', texto: 'Ayer', desde: Fechas.sumarDias(hoy, -1), hasta: Fechas.sumarDias(hoy, -1) },
      { id: 'semana', texto: 'Últimos 7 días', desde: Fechas.sumarDias(hoy, -6), hasta: hoy },
      { id: 'mes', texto: 'Este mes', desde: Fechas.inicioDeMes(hoy), hasta: hoy }
    ];
  }

  App.vistas.informes = function () {
    const inf = Logica.informe(est.desde, est.hasta);
    const unDia = est.desde === est.hasta;
    const maxCat = Math.max(1, ...inf.porCategoria.map(c => c.vendido));

    UI.vista().innerHTML = `
      <h1>Informes</h1>
      <div class="filtro-fechas">
        <div class="pastillas" role="group" aria-label="Períodos rápidos">
          ${rangos().map(r => `<button type="button" class="pastilla" data-accion="informe-rango" data-desde="${r.desde}" data-hasta="${r.hasta}"
            aria-pressed="${r.desde === est.desde && r.hasta === est.hasta}">${r.texto}</button>`).join('')}
        </div>
        <div class="fechas">
          <label class="campo">Desde<input type="date" value="${est.desde}" max="${Fechas.hoy()}" data-cambio="informe-desde"></label>
          <label class="campo">Hasta<input type="date" value="${est.hasta}" max="${Fechas.hoy()}" data-cambio="informe-hasta"></label>
        </div>
      </div>

      <dl class="cifras cifras-panel">
        <div><dt>Ventas</dt><dd>${inf.cantidad}</dd></div>
        <div><dt>Vendido</dt><dd>${Formato.plata(inf.total)}</dd></div>
        <div><dt>Ganancia</dt><dd>${Formato.plata(inf.ganancia)}</dd></div>
        <div><dt>Ticket promedio</dt><dd>${Formato.plata(inf.ticketPromedio)}</dd></div>
      </dl>
      <p class="ayuda">Costo de lo vendido: ${Formato.plata(inf.costo)}. Cobros de fiado en el período: ${Formato.plata(inf.cobrosTotal)}.</p>

      ${inf.cantidad ? `
      <div class="informe-grilla">
        <section class="panel" aria-labelledby="t-medios">
          <h2 id="t-medios">Por medio de pago</h2>
          <ul class="cuentas">${inf.porMedio.map(m => `<li><span>${m.medio.nombre}${m.cantidad ? ` <span class="sub-inline">(${m.cantidad})</span>` : ''}</span><span>${Formato.plata(m.total)}</span></li>`).join('')}</ul>
        </section>
        <section class="panel" aria-labelledby="t-categorias">
          <h2 id="t-categorias">Por categoría</h2>
          <ul class="barras">${inf.porCategoria.map(c => `<li>
            <div class="barra-texto"><span>${esc(c.nombre)}</span><span>${Formato.plata(c.vendido)}</span></div>
            <div class="barra-fondo"><div class="barra-relleno" style="width:${Math.round(c.vendido / maxCat * 100)}%"></div></div>
          </li>`).join('')}</ul>
        </section>
      </div>

      <section class="seccion" aria-labelledby="t-productos">
        <h2 id="t-productos">Por producto</h2>
        <div class="tabla-envoltura"><table class="tabla">
          <thead><tr><th scope="col">Producto</th><th scope="col" class="num">Cantidad</th><th scope="col" class="num">Vendido</th><th scope="col" class="num">Ganancia</th></tr></thead>
          <tbody>${inf.porProducto.map(x => `<tr><td>${esc(x.producto.nombre)}</td>
            <td class="num">${Formato.cantidad(x.producto, x.cantidad)}</td><td class="num">${Formato.plata(x.vendido)}</td>
            <td class="num">${Formato.plata(x.ganancia)}</td></tr>`).join('')}</tbody>
        </table></div>
      </section>

      <section class="seccion" aria-labelledby="t-ventas">
        <h2 id="t-ventas">Ventas</h2>
        <div class="tabla-envoltura"><table class="tabla">
          <thead><tr><th scope="col">N.º</th><th scope="col">${unDia ? 'Hora' : 'Fecha'}</th><th scope="col">Detalle</th><th scope="col">Pago</th><th scope="col">Atendió</th><th scope="col" class="num">Total</th></tr></thead>
          <tbody>${inf.ventas.slice().reverse().map(v => {
            const cliente = v.cliente_id ? DB.buscar('clientes', v.cliente_id) : null;
            return `<tr><td>${v.id}</td><td>${unDia ? Formato.hora(v.fecha_hora) : Formato.fechaHora(v.fecha_hora)}</td>
              <td>${esc(Logica.detalleTexto(v.id))}</td>
              <td>${Formato.medio(v.medio_pago)}${cliente ? `<span class="sub">${esc(cliente.nombre)}</span>` : ''}</td>
              <td>${esc(Logica.nombreUsuario(v.usuario_id)) || '—'}</td>
              <td class="num">${Formato.plata(v.total)}</td></tr>`;
          }).join('')}</tbody>
        </table></div>
      </section>` : '<p class="vacio">No hay ventas en este período.</p>'}`;
  };

  App.acciones['informe-rango'] = el => { est.desde = el.dataset.desde; est.hasta = el.dataset.hasta; App.vistas.informes(); };
  App.cambios['informe-desde'] = el => {
    if (!el.value) return;
    est.desde = el.value;
    if (est.hasta < est.desde) est.hasta = est.desde;
    App.vistas.informes();
  };
  App.cambios['informe-hasta'] = el => {
    if (!el.value) return;
    est.hasta = el.value;
    if (est.desde > est.hasta) est.desde = est.hasta;
    App.vistas.informes();
  };
})();
