/* Configuración (solo administrador): datos del ticket, impresora, lector y balanza. */
(function () {
  const est = App.estado.config = { prueba: null };

  App.vistas.configuracion = function () {
    const n = Logica.config('negocio');
    const t = Logica.config('ticket');
    const b = Logica.config('balanza');
    const tr = Logica.config('transferencias');
    const medios = Logica.mediosPago();
    const opcional = '<span class="fw-normal text-body-secondary">(opcional)</span>';
    UI.vista().innerHTML = `
      ${H.tituloPagina('Configuración')}
      <div class="row g-4">
        <div class="col-xl-6">
          <section class="card shadow-sm h-100"><div class="card-body">
            <h2 class="h5"><i class="bi bi-wallet2"></i> Medios de pago</h2>
            <p class="small text-body-secondary">Cada cuenta o posnet es un medio aparte. Aparecen en este orden al cobrar. Un medio que ya tiene cobros no se borra: se desactiva.</p>
            ${H.error('cfg-medios-error')}
            <ul class="list-group mb-3">${medios.map((m, i) => `<li class="list-group-item d-flex align-items-center gap-2 ${m.activo ? '' : 'text-body-secondary'}">
              <div class="btn-group-vertical btn-group-sm">
                <button type="button" class="btn btn-link p-0" data-accion="medio-mover" data-id="${m.id}" data-dir="-1" ${i === 0 ? 'disabled' : ''} aria-label="Subir"><i class="bi bi-chevron-up"></i></button>
                <button type="button" class="btn btn-link p-0" data-accion="medio-mover" data-id="${m.id}" data-dir="1" ${i === medios.length - 1 ? 'disabled' : ''} aria-label="Bajar"><i class="bi bi-chevron-down"></i></button>
              </div>
              <div class="flex-grow-1 min-w-0"><div class="fw-semibold text-truncate">${esc(m.nombre)}</div><div class="small text-body-secondary">${TIPOS_PAGO[m.tipo]}${m.activo ? '' : ' · desactivado'}</div></div>
              <div class="form-check form-switch mb-0" title="Activo"><input class="form-check-input" type="checkbox" role="switch" aria-label="Activo" data-cambio="medio-activo" data-id="${m.id}" ${m.activo ? 'checked' : ''}></div>
              <button type="button" class="btn btn-sm btn-outline-secondary" data-accion="medio-editar" data-id="${m.id}" aria-label="Editar ${esc(m.nombre)}"><i class="bi bi-pencil"></i></button>
              ${Logica.medioUsado(m.id) ? '' : `<button type="button" class="btn btn-sm btn-outline-danger" data-accion="medio-borrar" data-id="${m.id}" aria-label="Borrar ${esc(m.nombre)}"><i class="bi bi-trash"></i></button>`}
            </li>`).join('')}</ul>
            <button type="button" class="btn btn-primary" data-accion="medio-nuevo"><i class="bi bi-plus-lg"></i> Agregar medio de pago</button>
          </div></section>
        </div>

        <div class="col-xl-6">
          <form class="card shadow-sm h-100" data-enviar="cfg-transferencias" novalidate><div class="card-body">
            <h2 class="h5"><i class="bi bi-shield-check"></i> Transferencias</h2>
            <p class="small text-body-secondary">Para evitar transferencias falsas: se verifican en la cuenta del negocio, no en el celular del cliente.</p>
            ${H.error('cfg-transf-error')}
            <span class="form-label d-block fw-semibold">¿Cuándo se verifican?</span>
            ${H.check(`name="modo" value="antes" ${tr.modo === 'antes' ? 'checked' : ''}`, '<strong>Antes de confirmar la venta</strong> (recomendado)', 'El vendedor no puede cobrar una transferencia sin marcarla como acreditada. El administrador sí puede dejarla pendiente.', 'radio', 'mb-2')}
            ${H.check(`name="modo" value="libre" ${tr.modo === 'libre' ? 'checked' : ''}`, '<strong>Antes o después</strong>', 'Si hay cola, se puede cobrar y verificarla más tarde en «Transferencias». El riesgo corre por cuenta del negocio.', 'radio', 'mb-3')}
            <div class="form-check form-switch mb-3">
              <input class="form-check-input" type="checkbox" role="switch" id="vend-verifica" name="vendedorVerifica" ${tr.vendedorVerifica ? 'checked' : ''}>
              <label class="form-check-label" for="vend-verifica">El vendedor puede verificar transferencias<span class="form-text d-block mt-0">Desactivalo si el vendedor no tiene acceso a la app de las cuentas. Rechazar siempre es del administrador.</span></label>
            </div>
            <div style="max-width: 16rem">${H.campo('Avisar cuando una transferencia lleve sin verificar', `<div class="input-group"><input class="form-control" name="minutosAviso" type="number" min="1" max="240" value="${tr.minutosAviso}"><span class="input-group-text">minutos</span></div>`)}</div>
            <button type="submit" class="btn btn-primary">Guardar</button>
          </div></form>
        </div>

        <div class="col-xl-6">
          <form class="card shadow-sm h-100" data-enviar="cfg-negocio" novalidate><div class="card-body">
            <h2 class="h5"><i class="bi bi-shop"></i> Datos del negocio</h2>
            <p class="small text-body-secondary">Salen en el encabezado y el pie del ticket.</p>
            ${H.error('cfg-negocio-error')}
            ${H.campo('Nombre del negocio', `<input class="form-control" name="nombre" value="${esc(n.nombre)}" autocomplete="off">`)}
            ${H.campo(`Dirección ${opcional}`, `<input class="form-control" name="direccion" value="${esc(n.direccion)}" autocomplete="off">`)}
            <div class="row g-3">
              <div class="col-sm-6">${H.campo(`Teléfono ${opcional}`, `<input class="form-control" name="telefono" value="${esc(n.telefono)}" autocomplete="off">`)}</div>
              <div class="col-sm-6">${H.campo(`CUIT ${opcional}`, `<input class="form-control" name="cuit" value="${esc(n.cuit)}" autocomplete="off" inputmode="numeric">`)}</div>
            </div>
            ${H.campo(`Mensaje al pie ${opcional}`, `<input class="form-control" name="pie" value="${esc(n.pie)}" autocomplete="off">`)}
            <button type="submit" class="btn btn-primary">Guardar datos</button>
          </div></form>
        </div>

        <div class="col-xl-6">
          <form class="card shadow-sm h-100" data-enviar="cfg-ticket" novalidate><div class="card-body">
            <h2 class="h5"><i class="bi bi-printer"></i> Impresora de tickets</h2>
            <p class="small text-body-secondary">Ticketera térmica de 58 u 80 mm instalada en la computadora con su driver.</p>
            ${H.error('cfg-ticket-error')}
            <span class="form-label d-block fw-semibold">Ancho del papel</span>
            <div class="btn-group mb-3" role="group" aria-label="Ancho del papel">
              ${[58, 80].map(a => `<input type="radio" class="btn-check" name="ancho" id="ancho-${a}" value="${a}" ${t.ancho === a ? 'checked' : ''}>
                <label class="btn btn-outline-primary" for="ancho-${a}">${a} mm</label>`).join('')}
            </div>
            <div class="row g-3">
              <div class="col-sm-7">${H.campo('Al confirmar una venta', `<select class="form-select" name="alVender">
                <option value="preguntar" ${t.alVender === 'preguntar' ? 'selected' : ''}>Preguntar si imprimir</option>
                <option value="siempre" ${t.alVender === 'siempre' ? 'selected' : ''}>Imprimir siempre</option>
                <option value="nunca" ${t.alVender === 'nunca' ? 'selected' : ''}>No imprimir</option></select>`)}</div>
              <div class="col-sm-5">${H.campo('Copias', `<select class="form-select" name="copias">
                <option value="1" ${t.copias === 1 ? 'selected' : ''}>1</option>
                <option value="2" ${t.copias === 2 ? 'selected' : ''}>2</option></select>`)}</div>
            </div>
            <div class="d-flex flex-wrap gap-2 mb-3">
              <button type="submit" class="btn btn-primary">Guardar</button>
              <button type="button" class="btn btn-outline-secondary" data-accion="cfg-prueba-impresora"><i class="bi bi-printer"></i> Imprimir ticket de prueba</button>
            </div>
            <details class="small">
              <summary class="fw-semibold">Cómo dejar la impresora lista</summary>
              <ol class="mt-2 mb-0 ps-3">
                <li>Instalá el driver de la impresora y dejala como <strong>impresora predeterminada</strong> de Windows.</li>
                <li>En las preferencias del driver, elegí el papel de rollo (por ejemplo «80 x 297 mm» o «Recibo») y, si tiene cajón de dinero, activá «abrir cajón al imprimir».</li>
                <li>Imprimí el ticket de prueba. En el diálogo del navegador, elegí la ticketera, <strong>Márgenes: ninguno</strong> y desmarcá <strong>Encabezados y pies de página</strong>.</li>
                <li>Para que imprima sin mostrar el diálogo, se puede abrir Chrome con la opción <code>--kiosk-printing</code> en el acceso directo de la caja.</li>
              </ol>
            </details>
          </div></form>
        </div>

        <div class="col-xl-6">
          <section class="card shadow-sm h-100"><div class="card-body">
            <h2 class="h5"><i class="bi bi-upc-scan"></i> Lector de código de barras</h2>
            <p class="small text-body-secondary">Los lectores USB funcionan como un teclado: escriben el código y apretan Enter. No necesitan driver ni configuración en el sistema.</p>
            ${H.campo('Probá el lector', `<div class="input-group"><span class="input-group-text"><i class="bi bi-upc"></i></span>
              <input class="form-control" id="cfg-prueba-lector" placeholder="Hacé clic acá y escaneá cualquier producto" data-enter="cfg-probar-lector" autocomplete="off"></div>`,
              'También podés escanear sin hacer clic en ningún campo: el sistema detecta la lectura igual.')}
            <div id="cfg-resultado-lector">${resultadoPrueba()}</div>
            <details class="small">
              <summary class="fw-semibold">Si no funciona</summary>
              <ul class="mt-2 mb-0 ps-3">
                <li>Abrí el Bloc de notas y escaneá: si no aparece el código, el lector no está en «modo teclado (HID)». Se configura escaneando un código del manual del lector.</li>
                <li>Si el código aparece pero no pasa a la línea siguiente, falta activar el sufijo <strong>Enter (CR)</strong>, también desde el manual.</li>
                <li>Si aparecen letras o símbolos raros, el lector está en otro idioma de teclado: configuralo en «Español (Latinoamérica)» o usá solo números.</li>
              </ul>
            </details>
          </div></section>
        </div>

        <div class="col-xl-6">
          <form class="card shadow-sm h-100" data-enviar="cfg-balanza" novalidate><div class="card-body">
            <h2 class="h5"><i class="bi bi-speedometer"></i> Balanza con etiquetas</h2>
            <p class="small text-body-secondary">Las etiquetadoras (Systel, Kretz y otras) imprimen un código EAN-13 que empieza con 2 y trae el código del producto (PLU) y el peso o el importe. Al escanear esa etiqueta, el producto entra al ticket con su peso.</p>
            ${H.error('cfg-balanza-error')}
            <div class="form-check form-switch mb-3">
              <input class="form-check-input" type="checkbox" role="switch" id="bal-activa" name="activa" ${b.activa ? 'checked' : ''} data-cambio="cfg-balanza-vista">
              <label class="form-check-label" for="bal-activa">Leer etiquetas de balanza</label>
            </div>
            <div class="row g-3">
              <div class="col-4">${H.campo('Prefijo', `<input class="form-control" name="prefijo" value="${esc(b.prefijo)}" inputmode="numeric" maxlength="2" data-input="cfg-balanza-vista">`)}</div>
              <div class="col-4">${H.campo('Dígitos de PLU', `<select class="form-select" name="digitosPlu" data-cambio="cfg-balanza-vista">${[4, 5, 6].map(d => `<option ${b.digitosPlu === d ? 'selected' : ''}>${d}</option>`).join('')}</select>`)}</div>
              <div class="col-4">${H.campo('La etiqueta trae', `<select class="form-select" name="valor" data-cambio="cfg-balanza-vista">
                <option value="peso" ${b.valor === 'peso' ? 'selected' : ''}>Peso (g)</option>
                <option value="importe" ${b.valor === 'importe' ? 'selected' : ''}>Importe ($)</option></select>`)}</div>
            </div>
            <div class="alert alert-light border small" id="cfg-balanza-ejemplo">${ejemploBalanza(b)}</div>
            <p class="small text-body-secondary">El PLU de cada producto se carga en el campo <strong>Código de barras</strong> del producto (que tiene que venderse por peso). Configurá la balanza con el mismo formato.</p>
            <button type="submit" class="btn btn-primary">Guardar</button>
          </div></form>
        </div>
      </div>`;
  };

  // Ejemplo de etiqueta con el formato elegido, para comparar con lo que imprime la balanza.
  function ejemploBalanza(b) {
    const largoValor = 12 - b.prefijo.length - b.digitosPlu;
    if (!/^2\d?$/.test(b.prefijo) || largoValor < 4 || largoValor > 6) return '<span class="text-danger">Revisá el prefijo y los dígitos: no forman un código de 13 dígitos válido.</span>';
    const pesable = Logica.productosActivos().find(p => p.tipo_medida === 'peso' && p.codigo && /^\d+$/.test(p.codigo));
    const plu = String(pesable ? Number(pesable.codigo) : 101).padStart(b.digitosPlu, '0').slice(-b.digitosPlu);
    const valor = b.valor === 'peso' ? 350 : Math.round(350 * (pesable ? pesable.precio_venta : 10000) / 1000);
    const doce = b.prefijo + plu + String(valor).padStart(largoValor, '0');
    const codigo = doce + Logica.digitoControlEAN(doce);
    return `<div class="mb-1">Formato: <code>${b.prefijo} ${'P'.repeat(b.digitosPlu)} ${(b.valor === 'peso' ? 'G' : 'I').repeat(largoValor)} C</code></div>
      <div>Ejemplo: <code class="user-select-all">${codigo}</code> = ${pesable ? esc(pesable.nombre) : 'PLU ' + plu}, ${b.valor === 'peso' ? `${valor} g` : `${Formato.plata(valor)} (350 g)`}.
      ${pesable && b.activa ? 'Escribilo en el buscador de Vender y apretá Enter para simular el escaneo.' : ''}</div>`;
  }

  function resultadoPrueba() {
    const r = est.prueba;
    if (!r) return '';
    if (r.error) return `<div class="alert alert-warning small"><i class="bi bi-exclamation-triangle"></i> Leído: <code>${esc(r.codigo || '')}</code>. ${esc(r.error)}</div>`;
    return `<div class="alert alert-success small"><i class="bi bi-check-circle"></i> Leído: <code>${esc(r.codigo)}</code>.
      ${r.balanza ? `Etiqueta de balanza: <strong>${esc(r.producto.nombre)}</strong>, ${esc(r.detalle)}.` : `Producto: <strong>${esc(r.producto.nombre)}</strong>, ${Formato.plata(r.producto.precio_venta)} ${Formato.porUnidad(r.producto)}.`}</div>`;
  }

  App.probarLector = codigo => {
    est.prueba = Logica.interpretarCodigo(codigo);
    if (!est.prueba.codigo) est.prueba.codigo = codigo;
    $('#cfg-resultado-lector').innerHTML = resultadoPrueba();
  };
  App.acciones['cfg-probar-lector'] = el => { App.probarLector(el.value); el.value = ''; };
  App.acciones['cfg-prueba-impresora'] = () => Impresora.ticketPrueba();

  const guardar = (seccion, datos, idError, mensaje) => {
    try {
      Logica.guardarConfig(seccion, datos);
      UI.avisar(mensaje);
      App.vistas.configuracion();
    } catch (e) { $(`#${idError}`).textContent = e.message; }
  };
  App.envios['cfg-negocio'] = form => {
    const f = form.elements;
    guardar('negocio', { nombre: f.nombre.value, direccion: f.direccion.value, telefono: f.telefono.value, cuit: f.cuit.value, pie: f.pie.value }, 'cfg-negocio-error', 'Datos del negocio guardados');
  };
  App.envios['cfg-ticket'] = form => {
    const f = form.elements;
    guardar('ticket', { ancho: Number(f.ancho.value), alVender: f.alVender.value, copias: Number(f.copias.value) }, 'cfg-ticket-error', 'Impresora configurada');
  };
  App.envios['cfg-transferencias'] = form => {
    const f = form.elements;
    guardar('transferencias', { modo: f.modo.value, vendedorVerifica: f.vendedorVerifica.checked, minutosAviso: Number(f.minutosAviso.value) }, 'cfg-transf-error', 'Reglas de transferencias guardadas');
  };

  // ---------- Medios de pago ----------
  function formMedio(id = null) {
    const m = id ? DB.buscar('medios_pago', id) : null;
    const usado = m && Logica.medioUsado(m.id);
    UI.abrirDialogo({
      titulo: m ? 'Editar medio de pago' : 'Nuevo medio de pago', enviar: 'medio-guardar', atributos: `data-id="${id || ''}"`,
      cuerpo: `${H.error()}
        ${H.campo('Nombre', `<input class="form-control" name="nombre" value="${esc(m?.nombre)}" placeholder="Por ejemplo: Transferencia Banco Galicia" autocomplete="off" data-foco>`, 'Es lo que ve el cajero y lo que sale en el ticket.')}
        ${H.campo('Tipo', `<select class="form-select" name="tipo" ${usado ? 'disabled' : ''}>${Object.entries(TIPOS_PAGO).map(([k, v]) => `<option value="${k}" ${(m ? m.tipo : 'transferencia') === k ? 'selected' : ''}>${v}</option>`).join('')}</select>`,
          usado ? 'No se puede cambiar porque ya tiene cobros.' : 'Define cómo se comporta: el efectivo suma a la caja, las transferencias piden número de operación y verificación, el fiado suma a la deuda del cliente.')}`,
      pie: UI.pie('Guardar')
    }, { ancho: 'chico' });
  }
  App.acciones['medio-nuevo'] = () => formMedio();
  App.acciones['medio-editar'] = el => formMedio(+el.dataset.id);
  App.envios['medio-guardar'] = form => {
    const id = form.dataset.id ? +form.dataset.id : null;
    const existente = id ? DB.buscar('medios_pago', id) : null;
    try {
      Logica.guardarMedio({ nombre: form.elements.nombre.value, tipo: form.elements.tipo.disabled ? existente.tipo : form.elements.tipo.value }, id);
      UI.cerrarDialogo();
      UI.avisar('Medio de pago guardado');
      App.vistas.configuracion();
    } catch (e) { $('#dlg-error').textContent = e.message; }
  };
  App.acciones['medio-mover'] = el => { Logica.moverMedio(+el.dataset.id, +el.dataset.dir); App.vistas.configuracion(); };
  App.cambios['medio-activo'] = el => {
    try { Logica.cambiarActivoMedio(+el.dataset.id, el.checked); App.vistas.configuracion(); }
    catch (e) { el.checked = !el.checked; $('#cfg-medios-error').textContent = e.message; }
  };
  App.acciones['medio-borrar'] = el => {
    const m = DB.buscar('medios_pago', +el.dataset.id);
    if (!confirm(`¿Borrar «${m.nombre}»?`)) return;
    try { Logica.borrarMedio(m.id); App.vistas.configuracion(); }
    catch (e) { $('#cfg-medios-error').textContent = e.message; }
  };

  App.envios['cfg-balanza'] = form => {
    const f = form.elements;
    guardar('balanza', { activa: f.activa.checked, prefijo: f.prefijo.value.trim(), digitosPlu: Number(f.digitosPlu.value), valor: f.valor.value }, 'cfg-balanza-error', 'Balanza configurada');
  };
  const vistaBalanza = el => {
    const f = el.form.elements;
    $('#cfg-balanza-ejemplo').innerHTML = ejemploBalanza({ activa: f.activa.checked, prefijo: f.prefijo.value.trim(), digitosPlu: Number(f.digitosPlu.value), valor: f.valor.value });
  };
  App.cambios['cfg-balanza-vista'] = vistaBalanza;
  App.entradas['cfg-balanza-vista'] = vistaBalanza;
})();
