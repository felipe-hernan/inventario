/* Inicio: estado de la caja, avisos de stock y fiado pendiente. */
(function () {
  App.vistas.inicio = function () {
    const a = Logica.avisos();
    const caja = Logica.cajaAbierta();
    const hoy = Logica.informe(Fechas.hoy(), Fechas.hoy());
    const deudores = Logica.deudores();
    const totalFiado = deudores.reduce((s, d) => s + d.saldo, 0);
    const sinProductos = !DB.todos('productos').length;

    const itemLote = (x, conBaja) => `<li>
      <span class="aviso-nombre">${esc(x.producto.nombre)}</span>
      <span class="aviso-dato">${Formato.cantidad(x.producto, x.lote.cantidad_actual)} del lote ${x.lote.id}, ${Formato.vence(x.dias)} (${Formato.fechaCorta(x.lote.fecha_vencimiento)})</span>
      ${conBaja ? `<button type="button" class="boton-texto" data-accion="baja-vencido" data-lote="${x.lote.id}">Sacar del stock</button>` : ''}
    </li>`;
    const itemStock = x => `<li>
      <span class="aviso-nombre">${esc(x.producto.nombre)}</span>
      <span class="aviso-dato">Quedan ${Formato.cantidad(x.producto, x.stock)}, el mínimo es ${Formato.cantidad(x.producto, x.producto.stock_minimo)}</span>
      <button type="button" class="boton-texto" data-accion="reponer" data-id="${x.producto.id}">Ingresar mercadería</button>
    </li>`;
    const itemDeudor = d => `<li>
      <span class="aviso-nombre">${esc(d.cliente.nombre)}</span>
      <span class="aviso-dato">Debe ${Formato.plata(d.saldo)}</span>
      <button type="button" class="boton-texto" data-accion="cliente-cuenta" data-id="${d.cliente.id}">Ver cuenta</button>
    </li>`;
    const bloque = (tono, titulo, cuenta, ayuda, items, vacio) => `
      <section class="aviso aviso-${tono}" aria-label="${titulo}">
        <h2>${titulo} <span class="cuenta">${cuenta}</span></h2>
        <p class="ayuda">${ayuda}</p>
        ${items.length ? `<ul class="aviso-lista">${items.join('')}</ul>` : `<p class="vacio">${vacio}</p>`}
      </section>`;

    UI.vista().innerHTML = `
      <h1>${esc(UI.fechaLarga(new Date()))}</h1>
      ${sinProductos ? `<div class="bienvenida">
        <p>Todavía no hay productos. Cargalos de a uno o importalos desde una planilla.</p>
        <a class="boton" href="#productos">Ir a productos</a>
      </div>` : ''}

      <section class="hoy" aria-labelledby="t-hoy">
        <div class="hoy-cabecera">
          <h2 id="t-hoy">${caja ? `Caja abierta desde las ${Formato.hora(caja.fecha_apertura)}` : 'La caja está cerrada'}</h2>
          ${caja ? '<a class="boton-texto" href="#caja">Ver la caja</a>' : ''}
        </div>
        ${caja ? `
          <dl class="cifras">
            <div><dt>Ventas de hoy</dt><dd>${hoy.cantidad}</dd></div>
            <div><dt>Vendido</dt><dd>${Formato.plata(hoy.total)}</dd></div>
            ${UI.esAdmin() ? `<div><dt>Ganancia</dt><dd>${Formato.plata(hoy.ganancia)}</dd></div>` : ''}
            <div><dt>Efectivo en caja</dt><dd>${Formato.plata(Logica.resumenCaja(caja).efectivoEsperado)}</dd></div>
          </dl>
          <a class="boton boton-grande" href="#vender">Nueva venta</a>`
        : `<p class="ayuda">Abrila con el efectivo que tenés para empezar a vender.</p>
          <button type="button" class="boton boton-grande" data-accion="caja-abrir-dialogo">Abrir caja</button>`}
      </section>

      <div class="avisos">
        ${bloque('rojo', 'Vencidos', a.vencidos.length, 'No se pueden vender. Sacalos de la góndola y del stock.',
          a.vencidos.map(x => itemLote(x, true)), 'No hay mercadería vencida.')}
        ${bloque('ambar', 'Por vencer', a.porVencer.length,
          `Vencen en los próximos <label class="dias-aviso"><span class="solo-lector">Días de anticipación</span><input type="number" min="1" max="90" value="${DB.data.config.diasAviso}" data-cambio="dias-aviso"></label> días.`,
          a.porVencer.map(x => itemLote(x, false)), 'Nada vence en ese plazo.')}
        ${bloque('oscuro', 'Poco stock', a.pocoStock.length, 'Llegaron a su stock mínimo o están por debajo.',
          a.pocoStock.map(itemStock), 'Todos los productos están por encima de su mínimo.')}
        ${bloque('azul', 'Fiado a cobrar', Formato.plata(totalFiado), deudores.length ? `${deudores.length} ${deudores.length === 1 ? 'cliente debe' : 'clientes deben'}.` : 'Nadie debe nada.',
          deudores.slice(0, 5).map(itemDeudor), 'No hay cuentas pendientes.')}
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
    UI.enfocar($('[data-cambio=dias-aviso]'));
  };
})();
