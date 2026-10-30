/* Inicio: estado de la caja, avisos de stock y fiado pendiente. */
(function () {
  App.vistas.inicio = function () {
    const a = Logica.avisos();
    const caja = Logica.cajaAbierta();
    const hoy = Logica.informe(Fechas.hoy(), Fechas.hoy());
    const deudores = Logica.deudores();
    const totalFiado = deudores.reduce((s, d) => s + d.saldo, 0);

    const item = (titulo, detalle, boton = '') => `<li class="list-group-item px-0">
      <div class="fw-semibold">${titulo}</div><div class="small text-body-secondary">${detalle}</div>${boton}</li>`;
    const lote = (x, conBaja) => item(esc(x.producto.nombre),
      `${Formato.cantidad(x.producto, x.lote.cantidad_actual)} del lote ${x.lote.id}, ${Formato.vence(x.dias)} (${Formato.fechaCorta(x.lote.fecha_vencimiento)})`,
      conBaja ? `<button type="button" class="btn btn-link btn-sm p-0" data-accion="baja-vencido" data-lote="${x.lote.id}">Sacar del stock</button>` : '');
    const tarjeta = (color, icono, titulo, cuenta, ayuda, items, vacio) => `
      <div class="col-md-6">
        <section class="card shadow-sm h-100 aviso aviso-${color}" aria-label="${titulo}">
          <div class="card-body">
            <h2 class="h6 d-flex align-items-center gap-2 mb-1"><i class="bi bi-${icono} text-${color}"></i> ${titulo}
              <span class="badge rounded-pill text-bg-${color}">${cuenta}</span></h2>
            <p class="small text-body-secondary mb-2">${ayuda}</p>
            ${items.length ? `<ul class="list-group list-group-flush">${items.join('')}</ul>` : H.vacio(vacio)}
          </div>
        </section>
      </div>`;

    UI.vista().innerHTML = `
      <h1 class="h3 mb-4">${esc(UI.fechaLarga(new Date()))}</h1>
      ${DB.todos('productos').length ? '' : `<div class="alert alert-info d-flex flex-wrap justify-content-between align-items-center gap-2">
        <span><i class="bi bi-info-circle"></i> Todavía no hay productos. Cargalos de a uno o importalos desde una planilla.</span>
        ${UI.esAdmin() ? '<a class="btn btn-primary btn-sm" href="#productos">Ir a productos</a>' : ''}</div>`}

      <section class="card shadow-sm mb-4" aria-labelledby="t-hoy">
        <div class="card-body">
          <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
            <h2 class="h5 mb-0" id="t-hoy"><i class="bi bi-${caja ? 'unlock' : 'lock'}"></i> ${caja ? `Caja abierta desde las ${Formato.hora(caja.fecha_apertura)}` : 'La caja está cerrada'}</h2>
            ${caja ? '<a href="#caja" class="small">Ver la caja</a>' : ''}
          </div>
          ${caja ? `
            <div class="row g-3 align-items-end">
              <div class="col-12 col-md">
                <div class="row row-cols-2 row-cols-sm-4 g-3">
                  ${H.cifra('Ventas de hoy', hoy.cantidad)}
                  ${H.cifra('Vendido', Formato.plata(hoy.total))}
                  ${UI.esAdmin() ? H.cifra('Ganancia', Formato.plata(hoy.ganancia)) : ''}
                  ${H.cifra('Efectivo en caja', Formato.plata(Logica.resumenCaja(caja).efectivoEsperado))}
                </div>
              </div>
              <div class="col-12 col-md-auto"><a class="btn btn-primary btn-lg w-100" href="#vender"><i class="bi bi-cart-plus"></i> Nueva venta</a></div>
            </div>`
          : `<p class="text-body-secondary">Abrila con el efectivo que tenés para empezar a vender.</p>
            <button type="button" class="btn btn-primary btn-lg" data-accion="caja-abrir-dialogo"><i class="bi bi-unlock"></i> Abrir caja</button>`}
        </div>
      </section>

      <div class="row g-3">
        ${tarjeta('danger', 'x-octagon', 'Vencidos', a.vencidos.length, 'No se pueden vender. Sacalos de la góndola y del stock.',
          a.vencidos.map(x => lote(x, true)), 'No hay mercadería vencida.')}
        ${tarjeta('warning', 'hourglass-split', 'Por vencer', a.porVencer.length,
          `Vencen en los próximos <input type="number" class="form-control form-control-sm d-inline-block text-center mx-1" style="width:4.5rem" min="1" max="90" value="${DB.data.config.diasAviso}" data-cambio="dias-aviso" aria-label="Días de anticipación"> días.`,
          a.porVencer.map(x => lote(x, false)), 'Nada vence en ese plazo.')}
        ${tarjeta('primary', 'box-seam', 'Poco stock', a.pocoStock.length, 'Llegaron a su stock mínimo o están por debajo.',
          a.pocoStock.map(x => item(esc(x.producto.nombre),
            `Quedan ${Formato.cantidad(x.producto, x.stock)}, el mínimo es ${Formato.cantidad(x.producto, x.producto.stock_minimo)}`,
            `<button type="button" class="btn btn-link btn-sm p-0" data-accion="reponer" data-id="${x.producto.id}">Ingresar mercadería</button>`)),
          'Todos los productos están por encima de su mínimo.')}
        ${tarjeta('info', 'journal-text', 'Fiado a cobrar', Formato.plata(totalFiado),
          deudores.length ? `${deudores.length} ${deudores.length === 1 ? 'cliente debe' : 'clientes deben'}.` : 'Nadie debe nada.',
          deudores.slice(0, 5).map(d => item(esc(d.cliente.nombre), `Debe ${Formato.plata(d.saldo)}`,
            `<button type="button" class="btn btn-link btn-sm p-0" data-accion="cliente-cuenta" data-id="${d.cliente.id}">Ver cuenta</button>`)),
          'No hay cuentas pendientes.')}
      </div>`;
  };

  App.acciones.reponer = el => {
    App.estado.reponerId = +el.dataset.id;
    App.estado.mercTab = 'ingresar';
    UI.navegar('mercaderia');
  };

  App.acciones['baja-vencido'] = el => {
    const lote = DB.buscar('lotes', +el.dataset.lote);
    const p = DB.buscar('productos', lote.producto_id);
    if (!confirm(`¿Sacar del stock ${Formato.cantidad(p, lote.cantidad_actual)} de ${p.nombre} (lote ${lote.id}) por vencido?`)) return;
    Logica.ajustarLote(lote.id, lote.cantidad_actual, 'vencido');
    UI.avisar('Lote dado de baja por vencido');
    UI.render();
  };

  App.cambios['dias-aviso'] = el => {
    const n = num(el.value);
    if (!Number.isInteger(n) || n < 1 || n > 90) { el.value = DB.data.config.diasAviso; return; }
    DB.data.config.diasAviso = n;
    DB.guardar();
    UI.render();
  };
})();
