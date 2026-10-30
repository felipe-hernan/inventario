/* Informes: ventas de un período, por medio de pago, por categoría y por producto. */
(function () {
  const est = App.estado.informe = { desde: Fechas.hoy(), hasta: Fechas.hoy() };

  function rangos() {
    const hoy = Fechas.hoy();
    return [
      { texto: 'Hoy', desde: hoy, hasta: hoy },
      { texto: 'Ayer', desde: Fechas.sumarDias(hoy, -1), hasta: Fechas.sumarDias(hoy, -1) },
      { texto: 'Últimos 7 días', desde: Fechas.sumarDias(hoy, -6), hasta: hoy },
      { texto: 'Este mes', desde: Fechas.inicioDeMes(hoy), hasta: hoy }
    ];
  }

  App.vistas.informes = function () {
    const inf = Logica.informe(est.desde, est.hasta);
    const unDia = est.desde === est.hasta;
    const maxCat = Math.max(1, ...inf.porCategoria.map(c => c.vendido));
    const cifra = (etiqueta, valor) => `<div class="col-6 col-lg-3"><div class="card shadow-sm h-100"><div class="card-body">
      <div class="small text-body-secondary">${etiqueta}</div><div class="fs-3 fw-bold">${valor}</div></div></div></div>`;

    UI.vista().innerHTML = `
      ${H.tituloPagina('Informes')}
      <div class="d-flex flex-wrap justify-content-between align-items-end gap-3 mb-4">
        <div class="btn-group flex-wrap" role="group" aria-label="Períodos rápidos">
          ${rangos().map(r => `<button type="button" class="btn ${r.desde === est.desde && r.hasta === est.hasta ? 'btn-primary' : 'btn-outline-primary'}"
            data-accion="informe-rango" data-desde="${r.desde}" data-hasta="${r.hasta}">${r.texto}</button>`).join('')}
        </div>
        <div class="d-flex gap-2">
          <div><label class="form-label small mb-1" for="inf-desde">Desde</label><input id="inf-desde" type="date" class="form-control" value="${est.desde}" max="${Fechas.hoy()}" data-cambio="informe-desde"></div>
          <div><label class="form-label small mb-1" for="inf-hasta">Hasta</label><input id="inf-hasta" type="date" class="form-control" value="${est.hasta}" max="${Fechas.hoy()}" data-cambio="informe-hasta"></div>
        </div>
      </div>
      <div class="row g-3 mb-2">
        ${cifra('Ventas', inf.cantidad)}${cifra('Vendido', Formato.plata(inf.total))}${cifra('Ganancia', Formato.plata(inf.ganancia))}${cifra('Ticket promedio', Formato.plata(inf.ticketPromedio))}
      </div>
      <p class="small text-body-secondary">Costo de lo vendido: ${Formato.plata(inf.costo)}. Cobros de fiado en el período: ${Formato.plata(inf.cobrosTotal)}.</p>
      ${inf.cantidad ? `
        <div class="row g-3 mb-4">
          <div class="col-lg-6"><section class="card shadow-sm h-100"><div class="card-body">
            <h2 class="h6"><i class="bi bi-credit-card"></i> Por medio de pago</h2>
            <ul class="list-group list-group-flush cuentas">${inf.porMedio.map(m => `<li class="list-group-item"><span>${m.medio.nombre}${m.cantidad ? ` <span class="badge rounded-pill text-bg-light border">${m.cantidad}</span>` : ''}</span><span>${Formato.plata(m.total)}</span></li>`).join('')}</ul>
          </div></section></div>
          <div class="col-lg-6"><section class="card shadow-sm h-100"><div class="card-body">
            <h2 class="h6"><i class="bi bi-folder2"></i> Por categoría</h2>
            ${inf.porCategoria.map(c => `<div class="mb-2">
              <div class="d-flex justify-content-between small"><span>${esc(c.nombre)}</span><span class="fw-semibold">${Formato.plata(c.vendido)}</span></div>
              <div class="progress" role="progressbar" aria-label="${esc(c.nombre)}" aria-valuenow="${Math.round(c.vendido / maxCat * 100)}" aria-valuemin="0" aria-valuemax="100" style="height:.5rem">
                <div class="progress-bar" style="width:${Math.round(c.vendido / maxCat * 100)}%"></div></div>
            </div>`).join('')}
          </div></section></div>
        </div>
        <h2 class="h5">Por producto</h2>
        <div class="card shadow-sm mb-4"><div class="table-responsive"><table class="table table-hover align-middle mb-0">
          <thead><tr><th>Producto</th><th class="num">Cantidad</th><th class="num">Vendido</th><th class="num">Ganancia</th></tr></thead>
          <tbody>${inf.porProducto.map(x => `<tr><td>${esc(x.producto.nombre)}</td><td class="num">${Formato.cantidad(x.producto, x.cantidad)}</td>
            <td class="num">${Formato.plata(x.vendido)}</td><td class="num">${Formato.plata(x.ganancia)}</td></tr>`).join('')}</tbody>
        </table></div></div>
        <h2 class="h5">Ventas</h2>
        <div class="card shadow-sm"><div class="table-responsive"><table class="table table-hover align-middle mb-0">
          <thead><tr><th>N.º</th><th>${unDia ? 'Hora' : 'Fecha'}</th><th>Detalle</th><th>Pago</th><th>Atendió</th><th class="num">Total</th></tr></thead>
          <tbody>${inf.ventas.slice().reverse().map(v => {
            const cliente = v.cliente_id ? DB.buscar('clientes', v.cliente_id) : null;
            return `<tr><td>${v.id}</td><td class="text-nowrap">${unDia ? Formato.hora(v.fecha_hora) : Formato.fechaHora(v.fecha_hora)}</td>
              <td class="small">${esc(Logica.detalleTexto(v.id))}</td>
              <td>${Formato.medio(v.medio_pago)}${cliente ? `<span class="sub">${esc(cliente.nombre)}</span>` : ''}</td>
              <td>${esc(Logica.nombreUsuario(v.usuario_id)) || '—'}</td>
              <td class="num">${Formato.plata(v.total)}</td></tr>`;
          }).join('')}</tbody>
        </table></div></div>` : '<div class="alert alert-light border">No hay ventas en este período.</div>'}`;
  };

  App.acciones['informe-rango'] = el => { est.desde = el.dataset.desde; est.hasta = el.dataset.hasta; App.vistas.informes(); };
  App.cambios['informe-desde'] = el => { if (!el.value) return; est.desde = el.value; if (est.hasta < est.desde) est.hasta = est.desde; App.vistas.informes(); };
  App.cambios['informe-hasta'] = el => { if (!el.value) return; est.hasta = el.value; if (est.desde > est.hasta) est.desde = est.hasta; App.vistas.informes(); };
})();
