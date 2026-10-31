/*
 * Lector de código de barras e impresora de tickets.
 *
 * LECTOR: los lectores USB que se usan en comercios (Honeywell, Zebra, Gadnic, Netmak…) funcionan
 * en "modo teclado" (HID): escriben el código muy rápido y apretan Enter. No necesitan driver.
 * Si el foco está en un buscador, el código entra ahí. Si no, este módulo detecta la ráfaga
 * de teclas y la trata como un escaneo.
 *
 * IMPRESORA: las ticketeras térmicas de 58 u 80 mm (Xprinter, Gadnic, Epson…) se instalan con su
 * driver en Windows. La página arma el ticket con el ancho del papel y lo manda a imprimir
 * por el diálogo del navegador, igual que hacen la mayoría de los sistemas web de punto de venta.
 */

const Lector = {
  MAX_ENTRE_TECLAS: 50,  // ms: una persona no tipea tan rápido; un lector sí
  MIN_LARGO: 4,
  _buffer: '',
  _inicio: 0,
  _ultima: 0,

  iniciar(alEscanear) {
    document.addEventListener('keydown', e => {
      const ahora = performance.now();
      const enCampo = e.target.closest('input, textarea, select, [contenteditable]');
      if (e.key === 'Enter') {
        const largo = Lector._buffer.length;
        const promedio = largo ? (ahora - Lector._inicio) / largo : Infinity;
        if (!enCampo && largo >= Lector.MIN_LARGO && promedio < Lector.MAX_ENTRE_TECLAS) {
          e.preventDefault();
          alEscanear(Lector._buffer);
        }
        Lector._buffer = '';
        return;
      }
      if (enCampo) { Lector._buffer = ''; return; }
      if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        if (ahora - Lector._ultima > Lector.MAX_ENTRE_TECLAS * 2) { Lector._buffer = ''; Lector._inicio = ahora; }
        Lector._buffer += e.key;
        Lector._ultima = ahora;
      }
    });
  }
};

const Impresora = {
  _css(ancho) {
    const util = ancho === 58 ? 48 : 72; // mm imprimibles reales de cada rollo
    return `
      @page { margin: 0; }
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; background: #fff; color: #000; }
      body { font-family: "Courier New", Courier, monospace; font-size: ${ancho === 58 ? 11 : 12.5}px; line-height: 1.3; }
      .t { width: ${util}mm; margin: 0 auto; padding: 2mm 0 8mm; }
      .c { text-align: center; } .b { font-weight: bold; } .g { font-size: 1.3em; } .ch { font-size: .85em; }
      .sep { border-top: 1px dashed #000; margin: 2mm 0; }
      .fila { display: flex; justify-content: space-between; gap: 2mm; }
      .fila > span:last-child { white-space: nowrap; text-align: right; }
      .item { margin-bottom: 1mm; }
      .regla { border: 2px solid #000; border-top: 0; border-bottom: 0; text-align: center; margin: 1mm 0; }
      .salto { break-after: page; page-break-after: always; }
    `;
  },

  // Imprime por un iframe oculto, así no se imprime la pantalla del sistema.
  _imprimir(cuerpo, titulo = 'Ticket') {
    const { ancho, copias } = Logica.config('ticket');
    const paginas = Array.from({ length: copias }, (_, i) => `<div class="t ${i < copias - 1 ? 'salto' : ''}">${cuerpo}</div>`).join('');
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument;
    doc.open();
    doc.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${titulo}</title><style>${Impresora._css(ancho)}</style></head><body>${paginas}</body></html>`);
    doc.close();
    const quitar = () => setTimeout(() => iframe.remove(), 500);
    iframe.contentWindow.addEventListener('afterprint', quitar);
    setTimeout(() => {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      setTimeout(() => { if (iframe.isConnected) iframe.remove(); }, 60000);
    }, 150);
  },

  _encabezado(n) {
    return `
      <div class="c b g">${esc(n.nombre)}</div>
      ${n.direccion ? `<div class="c">${esc(n.direccion)}</div>` : ''}
      ${n.telefono ? `<div class="c">Tel. ${esc(n.telefono)}</div>` : ''}
      ${n.cuit ? `<div class="c">CUIT ${esc(n.cuit)}</div>` : ''}
      <div class="sep"></div>`;
  },

  ticketVenta(ventaId, { pagaCon = null } = {}) {
    const d = Logica.datosTicket(ventaId);
    const v = d.venta;
    const fila = (a, b, clase = '') => `<div class="fila ${clase}"><span>${a}</span><span>${b}</span></div>`;
    const cuerpo = `
      ${Impresora._encabezado(d.negocio)}
      ${fila(`Ticket N.º ${String(v.id).padStart(6, '0')}`, `${Formato.fecha(v.fecha_hora)} ${Formato.hora(v.fecha_hora)}`)}
      ${d.atendio ? `<div>Atendió: ${esc(d.atendio)}</div>` : ''}
      <div class="sep"></div>
      ${d.renglones.map(r => `<div class="item"><div class="b">${esc(r.nombre)}</div>
        ${fila(`${esc(r.detalle)}${r.mayorista ? ' (x mayor)' : ''}`, Formato.plata(r.subtotal))}</div>`).join('')}
      <div class="sep"></div>
      ${fila('TOTAL', Formato.plata(v.total), 'b g')}
      ${fila('Pago', Formato.medio(v.medio_pago))}
      ${v.medio_pago === 'efectivo' && pagaCon >= v.total ? `${fila('Paga con', Formato.plata(pagaCon))}${fila('Vuelto', Formato.plata(pagaCon - v.total), 'b')}` : ''}
      ${d.cliente ? `<div class="sep"></div><div>Cliente: ${esc(d.cliente.nombre)}</div>${fila('Saldo de su cuenta', Formato.plata(d.saldoCliente), 'b')}` : ''}
      <div class="sep"></div>
      ${d.negocio.pie ? `<div class="c">${esc(d.negocio.pie)}</div>` : ''}
      <div class="c ch">Comprobante no válido como factura</div>`;
    Impresora._imprimir(cuerpo, `Ticket ${v.id}`);
  },

  ticketCierre(cajaId) {
    const c = DB.buscar('cajas', cajaId);
    const r = Logica.resumenCaja(c);
    const fila = (a, b, clase = '') => `<div class="fila ${clase}"><span>${a}</span><span>${b}</span></div>`;
    const dif = c.diferencia === 0 ? 'Justo' : c.diferencia > 0 ? `Sobran ${Formato.plata(c.diferencia)}` : `Faltan ${Formato.plata(-c.diferencia)}`;
    const cuerpo = `
      ${Impresora._encabezado(Logica.config('negocio'))}
      <div class="c b g">CIERRE DE CAJA</div>
      ${fila('Apertura', `${Formato.fecha(c.fecha_apertura)} ${Formato.hora(c.fecha_apertura)}`)}
      ${fila('Cierre', `${Formato.fecha(c.fecha_cierre)} ${Formato.hora(c.fecha_cierre)}`)}
      ${fila('Abrió', esc(Logica.nombreUsuario(c.usuario_apertura_id)) || '-')}
      ${fila('Cerró', esc(Logica.nombreUsuario(c.usuario_cierre_id)) || '-')}
      <div class="sep"></div>
      <div class="b">EFECTIVO</div>
      ${fila('Dinero inicial', Formato.plata(c.dinero_inicial))}
      ${fila('+ Ventas en efectivo', Formato.plata(r.ventasEfectivo))}
      ${fila('+ Cobros de fiado', Formato.plata(r.cobrosEfectivo))}
      ${fila('+ Entradas', Formato.plata(r.entradas))}
      ${fila('- Salidas', Formato.plata(r.salidas))}
      ${fila('Debía haber', Formato.plata(c.efectivo_esperado), 'b')}
      ${fila('Se contó', Formato.plata(c.efectivo_contado))}
      ${fila('Diferencia', dif, 'b')}
      <div class="sep"></div>
      <div class="b">VENTAS (${r.cantidad})</div>
      ${r.porMedio.map(m => fila(m.medio.nombre, Formato.plata(m.total))).join('')}
      ${fila('TOTAL VENDIDO', Formato.plata(r.total), 'b')}
      ${c.observacion ? `<div class="sep"></div><div>Nota: ${esc(c.observacion)}</div>` : ''}`;
    Impresora._imprimir(cuerpo, `Cierre ${c.id}`);
  },

  ticketPrueba() {
    const { ancho } = Logica.config('ticket');
    const cuerpo = `
      ${Impresora._encabezado(Logica.config('negocio'))}
      <div class="c b g">PRUEBA DE IMPRESIÓN</div>
      <div class="c">Papel de ${ancho} mm</div>
      <div class="sep"></div>
      <div class="regla">&lt;&lt; ${ancho === 58 ? 48 : 72} mm imprimibles &gt;&gt;</div>
      <div class="fila"><span>Producto de prueba</span><span>${Formato.plata(1234)}</span></div>
      <div class="fila b g"><span>TOTAL</span><span>${Formato.plata(1234)}</span></div>
      <div class="sep"></div>
      <div class="c">Si se ven los dos bordes de la barra y los montos quedan a la derecha, la impresora está bien configurada.</div>`;
    Impresora._imprimir(cuerpo, 'Prueba');
  }
};
