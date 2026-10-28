/*
 * Reglas de negocio del sistema. No toca la pantalla: solo lee y escribe en DB.
 * Cada función que modifica datos lo hace dentro de una transacción.
 */

// ================= Constantes =================
const MEDIOS_PAGO = [
  { id: 'efectivo', nombre: 'Efectivo' },
  { id: 'debito', nombre: 'Débito' },
  { id: 'credito', nombre: 'Crédito' },
  { id: 'transferencia', nombre: 'Transferencia o QR' },
  { id: 'cuenta', nombre: 'Fiado' }
];

const MOTIVOS_AJUSTE = {
  vencido: 'Vencido',
  roto: 'Roto o en mal estado',
  perdida: 'Pérdida o robo',
  consumo: 'Consumo propio',
  conteo: 'Diferencia al contar'
};

const MOTIVOS_CAJA = {
  entrada: { cambio: 'Cambio para la caja', otro_ingreso: 'Otro ingreso' },
  salida: { pago_proveedor: 'Pago a proveedor', retiro: 'Retiro del dueño', gasto: 'Gasto del local', otra_salida: 'Otra salida' }
};

// ================= Fechas y formato =================
const Fechas = {
  iso(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },
  hoy() { return Fechas.iso(new Date()); },
  ahora() {
    const d = new Date();
    return `${Fechas.iso(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  },
  aDate(iso) {
    const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
    return new Date(y, m - 1, d);
  },
  sumarDias(iso, n) {
    const d = Fechas.aDate(iso);
    d.setDate(d.getDate() + n);
    return Fechas.iso(d);
  },
  diasEntre(desde, hasta) {
    return Math.round((Fechas.aDate(hasta) - Fechas.aDate(desde)) / 86400000);
  },
  inicioDeMes(iso) { return iso.slice(0, 8) + '01'; }
};

const Formato = {
  _plata: new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }),
  _num: new Intl.NumberFormat('es-AR', { maximumFractionDigits: 1 }),
  plata(n) { return Formato._plata.format(n); },
  numero(n) { return Formato._num.format(n); },
  cantidad(p, n) { return p.tipo_medida === 'peso' ? `${Formato.numero(n)} g` : `${Formato.numero(n)} u`; },
  porUnidad(p) { return p.tipo_medida === 'peso' ? 'por kg' : 'por unidad'; },
  fecha(iso) { const [y, m, d] = iso.slice(0, 10).split('-'); return `${d}/${m}/${y}`; },
  fechaCorta(iso) { const [, m, d] = iso.slice(0, 10).split('-'); return `${d}/${m}`; },
  hora(fh) { return fh.slice(11, 16); },
  fechaHora(fh) { return `${Formato.fechaCorta(fh)} ${Formato.hora(fh)}`; },
  medio(id) { return (MEDIOS_PAGO.find(m => m.id === id) || {}).nombre || id; },
  vence(dias) {
    if (dias === 0) return 'vence hoy';
    if (dias === 1) return 'vence mañana';
    if (dias > 1) return `vence en ${dias} días`;
    if (dias === -1) return 'venció ayer';
    return `venció hace ${-dias} días`;
  }
};

function normalizar(texto) {
  return String(texto || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

function error(mensaje, codigo) {
  const e = new Error(mensaje);
  if (codigo) e.codigo = codigo;
  return e;
}

// ================= Lógica =================
const Logica = {
  MINIMO_SUGERIDO: { unidad: 5, peso: 500 },

  // ---------- Precios ----------
  factor(p) { return p.tipo_medida === 'peso' ? 1000 : 1; },
  precioDesdePorcentaje(costo, porcentaje) { return Math.round(costo * (1 + porcentaje / 100)); },
  porcentajeDesdePrecio(costo, precio) { return costo > 0 ? Math.round((precio / costo - 1) * 1000) / 10 : 0; },
  subtotal(p, precio, cantidad) { return Math.round(precio * cantidad / Logica.factor(p)); },

  // Devuelve el precio que corresponde según la cantidad (precio por mayor si aplica).
  precioPara(p, cantidad) {
    if (p.precio_mayorista && p.cantidad_mayorista && cantidad >= p.cantidad_mayorista) {
      return { precio: p.precio_mayorista, mayorista: true };
    }
    return { precio: p.precio_venta, mayorista: false };
  },

  // ---------- Categorías ----------
  categorias() {
    return DB.todos('categorias').slice().sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  },
  nombreCategoria(id) {
    const c = id ? DB.buscar('categorias', id) : null;
    return c ? c.nombre : 'Sin categoría';
  },
  guardarCategoria(nombre, id = null) {
    const limpio = String(nombre || '').trim();
    if (!limpio) throw error('Escribí el nombre de la categoría.');
    if (DB.todos('categorias').some(c => c.id !== id && normalizar(c.nombre) === normalizar(limpio))) {
      throw error(`Ya existe la categoría «${limpio}».`);
    }
    return DB.transaccion(() => {
      if (id) {
        const c = DB.buscar('categorias', id);
        c.nombre = limpio;
        return c;
      }
      return DB.insertar('categorias', { nombre: limpio });
    });
  },
  productosEnCategoria(id) {
    return DB.todos('productos').filter(p => p.categoria_id === id).length;
  },
  borrarCategoria(id) {
    return DB.transaccion(() => {
      DB.todos('productos').forEach(p => { if (p.categoria_id === id) p.categoria_id = null; });
      DB.borrar('categorias', id);
    });
  },
  _categoriaPorNombre(nombre) {
    const limpio = String(nombre || '').trim();
    if (!limpio) return null;
    const existente = DB.todos('categorias').find(c => normalizar(c.nombre) === normalizar(limpio));
    return existente || DB.insertar('categorias', { nombre: limpio });
  },

  // ---------- Productos ----------
  productosActivos() {
    return DB.todos('productos').filter(p => p.activo).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  },
  buscarProductos(texto, { incluirBajas = false, categoriaId = null, soloConStock = false } = {}) {
    const t = normalizar(texto);
    let lista = (incluirBajas ? DB.todos('productos').slice() : Logica.productosActivos())
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    if (categoriaId) lista = lista.filter(p => p.categoria_id === categoriaId);
    if (soloConStock) lista = lista.filter(p => p.controla_stock);
    if (!t) return lista;
    const codigo = String(texto).trim();
    const exactos = lista.filter(p => p.codigo && p.codigo === codigo);
    const resto = lista.filter(p => !exactos.includes(p) && (
      normalizar(p.nombre).includes(t) ||
      normalizar(Logica.nombreCategoria(p.categoria_id)).includes(t) ||
      (p.codigo && p.codigo.startsWith(codigo))));
    return [...exactos, ...resto];
  },
  productoPorCodigo(codigo) {
    const c = String(codigo || '').trim();
    return c ? Logica.productosActivos().find(p => p.codigo === c) || null : null;
  },
  nombreDuplicado(nombre, id = null) {
    const n = normalizar(nombre);
    return DB.todos('productos').some(p => p.id !== id && normalizar(p.nombre) === n);
  },

  guardarProducto(datos, id = null) {
    const nombre = (datos.nombre || '').trim();
    const codigo = (datos.codigo || '').trim() || null;
    const controla = datos.controla_stock !== false;
    if (!nombre) throw error('Ingresá el nombre del producto.');
    if (!['unidad', 'peso'].includes(datos.tipo_medida)) throw error('Elegí si se vende por unidad o por peso.');
    if (!(datos.costo > 0)) throw error('El costo tiene que ser mayor a 0.');
    if (!(datos.precio_venta > 0)) throw error('El precio de venta tiene que ser mayor a 0.');
    if (controla && (!Number.isInteger(datos.stock_minimo) || datos.stock_minimo < 0)) {
      throw error('El stock mínimo tiene que ser un número entero, 0 o más.');
    }
    if (codigo && DB.todos('productos').some(p => p.codigo === codigo && p.id !== id)) {
      throw error(`Ya existe un producto con el código ${codigo}.`);
    }
    if (datos.categoria_id && !DB.buscar('categorias', datos.categoria_id)) throw error('La categoría elegida no existe.');

    // Precio por mayor: los dos campos van juntos.
    let precioMay = null, cantMay = null;
    if (datos.precio_mayorista || datos.cantidad_mayorista) {
      precioMay = Math.round(datos.precio_mayorista);
      cantMay = datos.cantidad_mayorista;
      if (!(precioMay > 0)) throw error('Completá el precio por mayor o dejá los dos campos vacíos.');
      if (precioMay >= Math.round(datos.precio_venta)) throw error('El precio por mayor tiene que ser menor al precio de venta.');
      if (!Number.isInteger(cantMay) || cantMay < 2) throw error('La cantidad para precio por mayor tiene que ser un número entero desde 2.');
    }

    const existente = id ? DB.buscar('productos', id) : null;
    if (existente) {
      const lotes = Logica.lotesDe(id);
      if (existente.tipo_medida !== datos.tipo_medida && lotes.length) {
        throw error('No se puede cambiar la forma de venta de un producto que ya tiene mercadería cargada.');
      }
      if (existente.controla_stock && !controla && lotes.some(l => l.cantidad_actual > 0)) {
        throw error('Este producto todavía tiene stock. Dalo de baja con un ajuste antes de dejar de controlarlo.');
      }
    }

    const costo = Math.round(datos.costo);
    const precio = Math.round(datos.precio_venta);
    const fila = {
      nombre, codigo,
      categoria_id: datos.categoria_id || null,
      tipo_medida: datos.tipo_medida,
      controla_stock: controla,
      costo,
      porcentaje: Logica.porcentajeDesdePrecio(costo, precio),
      precio_venta: precio,
      precio_mayorista: precioMay,
      cantidad_mayorista: cantMay,
      stock_minimo: controla ? datos.stock_minimo : 0
    };

    return DB.transaccion(() => {
      if (existente) return Object.assign(existente, fila);
      const p = DB.insertar('productos', { ...fila, activo: true });
      if (controla && datos.stockInicial) Logica._crearLote(p, datos.stockInicial, Fechas.hoy());
      return p;
    });
  },

  cambiarActivo(id, activo) {
    return DB.transaccion(() => Object.assign(DB.buscar('productos', id), { activo }));
  },

  // ---------- Lotes y stock ----------
  lotesDe(productoId) {
    return DB.todos('lotes').filter(l => l.producto_id === productoId)
      .sort((a, b) => a.fecha_vencimiento.localeCompare(b.fecha_vencimiento) || a.id - b.id);
  },
  lotesVigentes(productoId, fecha = Fechas.hoy()) {
    return Logica.lotesDe(productoId).filter(l => l.cantidad_actual > 0 && l.fecha_vencimiento >= fecha);
  },
  lotesVencidos(productoId, fecha = Fechas.hoy()) {
    return Logica.lotesDe(productoId).filter(l => l.cantidad_actual > 0 && l.fecha_vencimiento < fecha);
  },
  stockVigente(productoId, fecha) {
    return Logica.lotesVigentes(productoId, fecha).reduce((s, l) => s + l.cantidad_actual, 0);
  },
  stockVencido(productoId, fecha) {
    return Logica.lotesVencidos(productoId, fecha).reduce((s, l) => s + l.cantidad_actual, 0);
  },
  proximoVencimiento(productoId) {
    const l = Logica.lotesVigentes(productoId)[0];
    return l ? l.fecha_vencimiento : null;
  },

  _crearLote(p, linea, fechaIngreso) {
    const cantidad = linea.cantidad;
    const costo = Math.round(linea.costo);
    const vence = linea.fecha_vencimiento;
    if (!p.controla_stock) throw error(`${p.nombre} no lleva control de stock.`);
    if (!Number.isInteger(cantidad) || cantidad <= 0) {
      throw error(`La cantidad tiene que ser un número entero mayor a 0 (${p.tipo_medida === 'peso' ? 'en gramos' : 'en unidades'}).`);
    }
    if (!(costo > 0)) throw error('El costo de la mercadería tiene que ser mayor a 0.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(vence || '')) throw error('Completá la fecha de vencimiento.');
    if (vence < fechaIngreso) throw error(`La fecha de vencimiento ${Formato.fecha(vence)} ya pasó.`);
    return DB.insertar('lotes', {
      producto_id: p.id, cantidad_inicial: cantidad, cantidad_actual: cantidad,
      costo, fecha_vencimiento: vence, fecha_ingreso: fechaIngreso
    });
  },

  costoDeLineas(p, lineas) {
    return lineas.reduce((s, l) => s + (l.cantidad > 0 && l.costo > 0 ? Math.round(l.cantidad * l.costo / Logica.factor(p)) : 0), 0);
  },

  // Cada línea crea un lote. Opcionalmente registra el pago al proveedor con efectivo de la caja.
  ingresarMercaderia(productoId, lineas, { actualizarPrecio = true, pagoCaja = null } = {}) {
    return DB.transaccion(() => {
      const p = DB.buscar('productos', productoId);
      if (!p || !p.activo) throw error('Elegí un producto activo.');
      if (!lineas.length) throw error('Cargá al menos una línea.');
      const hoy = Fechas.hoy();
      const lotes = lineas.map(l => Logica._crearLote(p, l, hoy));

      const costoNuevo = Math.round(lineas[lineas.length - 1].costo);
      if (costoNuevo !== p.costo) {
        p.costo = costoNuevo;
        if (actualizarPrecio) p.precio_venta = Logica.precioDesdePorcentaje(p.costo, p.porcentaje);
        else p.porcentaje = Logica.porcentajeDesdePrecio(p.costo, p.precio_venta);
      }
      if (pagoCaja != null) {
        Logica.registrarMovimiento({ tipo: 'salida', motivo: 'pago_proveedor', monto: pagoCaja, descripcion: `Mercadería: ${p.nombre}` });
      }
      return lotes;
    });
  },

  ajustarLote(loteId, cantidad, motivo, fecha = Fechas.hoy()) {
    return DB.transaccion(() => {
      const lote = DB.buscar('lotes', loteId);
      if (!lote) throw error('El lote no existe.');
      const p = DB.buscar('productos', lote.producto_id);
      if (!MOTIVOS_AJUSTE[motivo]) throw error('Elegí el motivo del ajuste.');
      if (!Number.isInteger(cantidad) || cantidad <= 0) throw error('La cantidad tiene que ser un número entero mayor a 0.');
      if (cantidad > lote.cantidad_actual) throw error(`En ese lote quedan ${Formato.cantidad(p, lote.cantidad_actual)}.`);
      lote.cantidad_actual -= cantidad;
      return DB.insertar('ajustes_stock', { lote_id: lote.id, cantidad, motivo, fecha });
    });
  },

  // ---------- Caja ----------
  cajaAbierta() {
    return DB.todos('cajas').find(c => c.estado === 'abierta') || null;
  },
  ultimaCajaCerrada() {
    return DB.todos('cajas').filter(c => c.estado === 'cerrada').sort((a, b) => b.id - a.id)[0] || null;
  },
  abrirCaja(dineroInicial, fechaHora = Fechas.ahora()) {
    if (Logica.cajaAbierta()) throw error('Ya hay una caja abierta.');
    if (!Number.isInteger(dineroInicial) || dineroInicial < 0) throw error('El dinero inicial tiene que ser 0 o más, sin centavos.');
    return DB.transaccion(() => DB.insertar('cajas', {
      fecha_apertura: fechaHora, fecha_cierre: null, dinero_inicial: dineroInicial,
      efectivo_esperado: null, efectivo_contado: null, diferencia: null, observacion: '', estado: 'abierta'
    }));
  },
  registrarMovimiento({ tipo, motivo, monto, descripcion = '' }, fechaHora = Fechas.ahora()) {
    const caja = Logica.cajaAbierta();
    if (!caja) throw error('Abrí la caja para registrar movimientos de efectivo.');
    if (!MOTIVOS_CAJA[tipo] || !MOTIVOS_CAJA[tipo][motivo]) throw error('Elegí el motivo.');
    if (!Number.isInteger(monto) || monto <= 0) throw error('El monto tiene que ser mayor a 0, sin centavos.');
    if (tipo === 'salida') {
      const hay = Logica.resumenCaja(caja).efectivoEsperado;
      if (monto > hay) throw error(`En la caja debería haber ${Formato.plata(hay)}. No alcanza para sacar ${Formato.plata(monto)}.`);
    }
    return DB.transaccion(() => DB.insertar('movimientos_caja', {
      caja_id: caja.id, fecha_hora: fechaHora, tipo, motivo, monto, descripcion: String(descripcion).trim()
    }));
  },
  cerrarCaja(contado, observacion = '', fechaHora = Fechas.ahora()) {
    const caja = Logica.cajaAbierta();
    if (!caja) throw error('No hay una caja abierta.');
    if (!Number.isInteger(contado) || contado < 0) throw error('Ingresá cuánto efectivo contaste, sin centavos.');
    const esperado = Logica.resumenCaja(caja).efectivoEsperado;
    return DB.transaccion(() => Object.assign(caja, {
      fecha_cierre: fechaHora, efectivo_esperado: esperado, efectivo_contado: contado,
      diferencia: contado - esperado, observacion: String(observacion).trim(), estado: 'cerrada'
    }));
  },
  resumenCaja(caja) {
    const ventas = DB.todos('ventas').filter(v => v.caja_id === caja.id);
    const agregado = Logica._agregarVentas(ventas);
    const cobros = DB.todos('pagos_clientes').filter(p => p.caja_id === caja.id);
    const movimientos = DB.todos('movimientos_caja').filter(m => m.caja_id === caja.id)
      .sort((a, b) => a.fecha_hora.localeCompare(b.fecha_hora));
    const suma = lista => lista.reduce((s, x) => s + x.monto, 0);
    const ventasEfectivo = agregado.porMedio.find(m => m.medio.id === 'efectivo').total;
    const cobrosEfectivo = suma(cobros.filter(c => c.medio_pago === 'efectivo'));
    const entradas = suma(movimientos.filter(m => m.tipo === 'entrada'));
    const salidas = suma(movimientos.filter(m => m.tipo === 'salida'));
    return {
      caja, ...agregado, cobros, cobrosEfectivo, cobrosTotal: suma(cobros),
      movimientos, entradas, salidas, ventasEfectivo,
      efectivoEsperado: caja.dinero_inicial + ventasEfectivo + cobrosEfectivo + entradas - salidas
    };
  },

  // ---------- Clientes y fiado ----------
  clientesActivos() {
    return DB.todos('clientes').filter(c => c.activo).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  },
  guardarCliente(datos, id = null) {
    const nombre = (datos.nombre || '').trim();
    if (!nombre) throw error('Ingresá el nombre del cliente.');
    const limite = datos.limite_credito;
    if (limite != null && (!Number.isInteger(limite) || limite < 0)) throw error('El límite tiene que ser un número entero, o quedar vacío.');
    const fila = { nombre, telefono: (datos.telefono || '').trim(), limite_credito: limite ?? null };
    return DB.transaccion(() => {
      if (id) return Object.assign(DB.buscar('clientes', id), fila);
      return DB.insertar('clientes', { ...fila, activo: true, fecha_alta: Fechas.hoy() });
    });
  },
  cambiarActivoCliente(id, activo) {
    if (!activo && Logica.saldoCliente(id) > 0) throw error('No se puede dar de baja: todavía tiene deuda.');
    return DB.transaccion(() => Object.assign(DB.buscar('clientes', id), { activo }));
  },
  saldoCliente(id) {
    const compras = DB.todos('ventas').filter(v => v.cliente_id === id && v.medio_pago === 'cuenta').reduce((s, v) => s + v.total, 0);
    const pagos = DB.todos('pagos_clientes').filter(p => p.cliente_id === id).reduce((s, p) => s + p.monto, 0);
    return compras - pagos;
  },
  estadoCuenta(id) {
    const compras = DB.todos('ventas').filter(v => v.cliente_id === id && v.medio_pago === 'cuenta').map(v => ({
      fecha_hora: v.fecha_hora, tipo: 'compra', monto: v.total,
      detalle: `Compra N.º ${v.id}: ${Logica.detalleTexto(v.id)}`
    }));
    const pagos = DB.todos('pagos_clientes').filter(p => p.cliente_id === id).map(p => ({
      fecha_hora: p.fecha_hora, tipo: 'pago', monto: p.monto,
      detalle: `Pago en ${Formato.medio(p.medio_pago).toLowerCase()}${p.nota ? ` (${p.nota})` : ''}`
    }));
    let saldo = 0;
    return [...compras, ...pagos]
      .sort((a, b) => a.fecha_hora.localeCompare(b.fecha_hora) || (a.tipo === 'compra' ? -1 : 1))
      .map(m => { saldo += m.tipo === 'compra' ? m.monto : -m.monto; return { ...m, saldo }; })
      .reverse();
  },
  deudores() {
    return Logica.clientesActivos().map(c => ({ cliente: c, saldo: Logica.saldoCliente(c.id) }))
      .filter(x => x.saldo > 0).sort((a, b) => b.saldo - a.saldo);
  },
  registrarPago(clienteId, { monto, medio_pago = 'efectivo', nota = '' }, fechaHora = Fechas.ahora()) {
    const caja = Logica.cajaAbierta();
    if (!caja) throw error('Abrí la caja para registrar cobros.');
    const c = DB.buscar('clientes', clienteId);
    if (!c) throw error('El cliente no existe.');
    if (!MEDIOS_PAGO.some(m => m.id === medio_pago) || medio_pago === 'cuenta') throw error('Elegí cómo pagó.');
    if (!Number.isInteger(monto) || monto <= 0) throw error('El monto tiene que ser mayor a 0, sin centavos.');
    const saldo = Logica.saldoCliente(clienteId);
    if (monto > saldo) throw error(`${c.nombre} debe ${Formato.plata(saldo)}. No puede pagar más que eso.`);
    return DB.transaccion(() => DB.insertar('pagos_clientes', {
      cliente_id: clienteId, caja_id: caja.id, fecha_hora: fechaHora, monto, medio_pago, nota: String(nota).trim()
    }));
  },

  // ---------- Ventas ----------
  // items: [{ producto_id, cantidad }]
  // opciones: { medio_pago, cliente_id, forzarLimite, fechaHora }
  registrarVenta(items, { medio_pago = 'efectivo', cliente_id = null, forzarLimite = false, fechaHora = Fechas.ahora() } = {}) {
    const caja = Logica.cajaAbierta();
    if (!caja) throw error('Abrí la caja antes de vender.');
    if (!MEDIOS_PAGO.some(m => m.id === medio_pago)) throw error('Elegí el medio de pago.');
    const cliente = cliente_id ? DB.buscar('clientes', cliente_id) : null;
    if (medio_pago === 'cuenta' && (!cliente || !cliente.activo)) throw error('Para fiar, elegí el cliente.');

    const fecha = fechaHora.slice(0, 10);
    const agrupado = new Map();
    items.forEach(it => agrupado.set(it.producto_id, (agrupado.get(it.producto_id) || 0) + it.cantidad));
    if (!agrupado.size) throw error('Agregá al menos un producto.');

    return DB.transaccion(() => {
      const venta = DB.insertar('ventas', {
        caja_id: caja.id, fecha_hora: fechaHora, medio_pago,
        cliente_id: cliente ? cliente.id : null, total: 0, ganancia: 0
      });

      for (const [productoId, cantidad] of agrupado) {
        const p = DB.buscar('productos', productoId);
        if (!p || !p.activo) throw error('Uno de los productos ya no está disponible.');
        if (!Number.isInteger(cantidad) || cantidad <= 0) throw error(`Cantidad inválida para ${p.nombre}.`);
        const { precio, mayorista } = Logica.precioPara(p, cantidad);

        let costoAcumulado = 0;
        const tomas = [];
        if (p.controla_stock) {
          const lotes = Logica.lotesVigentes(productoId, fecha);
          const disponible = lotes.reduce((s, l) => s + l.cantidad_actual, 0);
          if (disponible < cantidad) {
            if (disponible === 0 && Logica.stockVencido(productoId, fecha) > 0) throw error(`De ${p.nombre} solo quedan unidades vencidas.`);
            throw error(`No alcanza el stock de ${p.nombre}: hay ${Formato.cantidad(p, disponible)}.`);
          }
          let restante = cantidad;
          for (const lote of lotes) {
            if (restante === 0) break;
            const tomar = Math.min(restante, lote.cantidad_actual);
            lote.cantidad_actual -= tomar;
            costoAcumulado += tomar * lote.costo;
            tomas.push({ lote_id: lote.id, cantidad: tomar });
            restante -= tomar;
          }
        } else {
          costoAcumulado = cantidad * p.costo; // sin lotes: se usa el costo del producto
        }

        const subtotal = Logica.subtotal(p, precio, cantidad);
        const detalle = DB.insertar('detalle_venta', {
          venta_id: venta.id, producto_id: productoId, cantidad,
          precio_unitario: precio, costo_unitario: Math.round(costoAcumulado / cantidad), es_mayorista: mayorista
        });
        tomas.forEach(t => DB.insertar('detalle_venta_lote', { detalle_venta_id: detalle.id, ...t }));
        venta.total += subtotal;
        venta.ganancia += subtotal - Math.round(costoAcumulado / Logica.factor(p));
      }

      if (medio_pago === 'cuenta' && cliente.limite_credito != null && !forzarLimite) {
        const saldoNuevo = Logica.saldoCliente(cliente.id); // ya incluye esta venta
        if (saldoNuevo > cliente.limite_credito) {
          throw error(`Con esta compra ${cliente.nombre} debería ${Formato.plata(saldoNuevo)} y su límite es ${Formato.plata(cliente.limite_credito)}.`, 'LIMITE');
        }
      }
      return venta;
    });
  },

  detalleTexto(ventaId) {
    return DB.todos('detalle_venta').filter(d => d.venta_id === ventaId).map(d => {
      const p = DB.buscar('productos', d.producto_id);
      return `${p.nombre} (${Formato.cantidad(p, d.cantidad)})`;
    }).join(', ');
  },

  // Agrupa una lista de ventas: totales, por medio de pago, por categoría y por producto.
  _agregarVentas(ventas) {
    const ids = new Set(ventas.map(v => v.id));
    const porProducto = new Map();
    const porCategoria = new Map();
    DB.todos('detalle_venta').filter(d => ids.has(d.venta_id)).forEach(d => {
      const p = DB.buscar('productos', d.producto_id);
      const vendido = Logica.subtotal(p, d.precio_unitario, d.cantidad);
      const ganancia = vendido - Math.round(d.costo_unitario * d.cantidad / Logica.factor(p));
      const fp = porProducto.get(p.id) || { producto: p, cantidad: 0, vendido: 0, ganancia: 0 };
      fp.cantidad += d.cantidad; fp.vendido += vendido; fp.ganancia += ganancia;
      porProducto.set(p.id, fp);
      const catId = p.categoria_id || 0;
      const fc = porCategoria.get(catId) || { nombre: Logica.nombreCategoria(p.categoria_id), vendido: 0, ganancia: 0 };
      fc.vendido += vendido; fc.ganancia += ganancia;
      porCategoria.set(catId, fc);
    });
    const total = ventas.reduce((s, v) => s + v.total, 0);
    const ganancia = ventas.reduce((s, v) => s + v.ganancia, 0);
    return {
      ventas: ventas.slice().sort((a, b) => a.fecha_hora.localeCompare(b.fecha_hora)),
      cantidad: ventas.length, total, ganancia, costo: total - ganancia,
      porMedio: MEDIOS_PAGO.map(m => {
        const de = ventas.filter(v => v.medio_pago === m.id);
        return { medio: m, cantidad: de.length, total: de.reduce((s, v) => s + v.total, 0) };
      }),
      porCategoria: [...porCategoria.values()].sort((a, b) => b.vendido - a.vendido),
      porProducto: [...porProducto.values()].sort((a, b) => b.vendido - a.vendido)
    };
  },

  // ---------- Informes ----------
  informe(desde, hasta) {
    const enRango = fh => fh.slice(0, 10) >= desde && fh.slice(0, 10) <= hasta;
    const agregado = Logica._agregarVentas(DB.todos('ventas').filter(v => enRango(v.fecha_hora)));
    const cobros = DB.todos('pagos_clientes').filter(p => enRango(p.fecha_hora));
    return {
      ...agregado,
      ticketPromedio: agregado.cantidad ? Math.round(agregado.total / agregado.cantidad) : 0,
      cobrosTotal: cobros.reduce((s, p) => s + p.monto, 0)
    };
  },

  inventario() {
    const hoy = Fechas.hoy();
    const filas = Logica.productosActivos().filter(p => p.controla_stock).map(p => {
      const valorDe = lotes => lotes.reduce((s, l) => s + Math.round(l.cantidad_actual * l.costo / Logica.factor(p)), 0);
      const vigentes = Logica.lotesVigentes(p.id, hoy);
      const vencidos = Logica.lotesVencidos(p.id, hoy);
      return {
        producto: p,
        stock: vigentes.reduce((s, l) => s + l.cantidad_actual, 0),
        vencido: vencidos.reduce((s, l) => s + l.cantidad_actual, 0),
        valor: valorDe(vigentes),
        valorVencido: valorDe(vencidos),
        proximo: vigentes[0] ? vigentes[0].fecha_vencimiento : null
      };
    });
    return {
      filas,
      valorTotal: filas.reduce((s, f) => s + f.valor, 0),
      valorVencido: filas.reduce((s, f) => s + f.valorVencido, 0),
      conStock: filas.filter(f => f.stock > 0).length
    };
  },

  movimientosProducto(productoId) {
    const p = DB.buscar('productos', productoId);
    const lotes = Logica.lotesDe(productoId);
    const idsLotes = new Set(lotes.map(l => l.id));
    const movs = lotes.map(l => ({
      fecha: l.fecha_ingreso, tipo: 'Ingreso', cantidad: l.cantidad_inicial,
      detalle: `Lote ${l.id}, vence ${Formato.fecha(l.fecha_vencimiento)}`
    }));
    DB.todos('ajustes_stock').filter(a => idsLotes.has(a.lote_id)).forEach(a => movs.push({
      fecha: a.fecha, tipo: 'Ajuste', cantidad: -a.cantidad, detalle: `${MOTIVOS_AJUSTE[a.motivo]}, lote ${a.lote_id}`
    }));
    DB.todos('detalle_venta').filter(d => d.producto_id === productoId).forEach(d => {
      const v = DB.buscar('ventas', d.venta_id);
      const desdeLotes = DB.todos('detalle_venta_lote').filter(x => x.detalle_venta_id === d.id);
      movs.push({
        fecha: v.fecha_hora, tipo: 'Venta', cantidad: -d.cantidad,
        detalle: `Venta N.º ${v.id}${desdeLotes.length ? `, lote ${desdeLotes.map(x => x.lote_id).join(' y ')}` : ''}`
      });
    });
    return { producto: p, movimientos: movs.sort((a, b) => b.fecha.localeCompare(a.fecha)) };
  },

  // ---------- Avisos ----------
  avisos(dias = DB.data.config.diasAviso) {
    const hoy = Fechas.hoy();
    const limite = Fechas.sumarDias(hoy, dias);
    const activos = new Map(Logica.productosActivos().filter(p => p.controla_stock).map(p => [p.id, p]));
    const conStock = DB.todos('lotes')
      .filter(l => l.cantidad_actual > 0 && activos.has(l.producto_id))
      .map(l => ({ lote: l, producto: activos.get(l.producto_id), dias: Fechas.diasEntre(hoy, l.fecha_vencimiento) }))
      .sort((a, b) => a.dias - b.dias);
    return {
      vencidos: conStock.filter(x => x.dias < 0),
      porVencer: conStock.filter(x => x.lote.fecha_vencimiento >= hoy && x.lote.fecha_vencimiento <= limite),
      pocoStock: [...activos.values()]
        .map(p => ({ producto: p, stock: Logica.stockVigente(p.id) }))
        .filter(x => x.stock <= x.producto.stock_minimo)
        .sort((a, b) => a.stock / Math.max(a.producto.stock_minimo, 1) - b.stock / Math.max(b.producto.stock_minimo, 1))
    };
  },

  // ---------- Importar productos desde CSV ----------
  COLUMNAS_IMPORTACION: {
    nombre: ['nombre', 'descripcion', 'producto'],
    codigo: ['codigo', 'codigo de barras', 'cod'],
    categoria: ['categoria', 'departamento', 'rubro'],
    tipo: ['tipo', 'se vende', 'medida'],
    costo: ['costo', 'precio costo', 'precio de costo'],
    precio: ['precio', 'precio venta', 'precio de venta'],
    ganancia: ['ganancia', 'porcentaje', 'margen'],
    minimo: ['minimo', 'stock minimo'],
    stock: ['stock', 'cantidad', 'cantidad actual', 'existencia'],
    vencimiento: ['vencimiento', 'vence', 'fecha de vencimiento']
  },

  plantillaCSV() {
    return [
      'nombre;codigo;categoria;tipo;costo;precio;minimo;stock;vencimiento',
      'Arroz largo fino 1 kg;7790010000017;Almacén;unidad;1200;1600;5;20;30/06/2027',
      'Salame milán;;Fiambrería;peso;14000;19500;300;1500;15/12/2026'
    ].join('\n');
  },

  _leerCSV(texto) {
    const lineas = texto.replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.trim());
    if (!lineas.length) return [];
    const sep = (lineas[0].match(/;/g) || []).length >= (lineas[0].match(/,/g) || []).length ? ';' : ',';
    return lineas.map(linea => {
      const celdas = [];
      let actual = '', comillas = false;
      for (let i = 0; i < linea.length; i++) {
        const c = linea[i];
        if (c === '"' && comillas && linea[i + 1] === '"') { actual += '"'; i++; }
        else if (c === '"') comillas = !comillas;
        else if (c === sep && !comillas) { celdas.push(actual.trim()); actual = ''; }
        else actual += c;
      }
      celdas.push(actual.trim());
      return celdas;
    });
  },

  _numeroImportado(texto) {
    let t = String(texto || '').replace(/[$\s]/g, '');
    if (!t) return null;
    if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
    const n = Number(t);
    return Number.isFinite(n) ? n : NaN;
  },

  _fechaImportada(texto) {
    const t = String(texto || '').trim();
    let m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return t;
    m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (!m) return null;
    const y = m[3].length === 2 ? '20' + m[3] : m[3];
    return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  },

  analizarImportacion(texto) {
    const filas = Logica._leerCSV(texto);
    if (filas.length < 2) return { error: 'El archivo no tiene filas para importar. La primera fila tiene que ser la de los títulos.' };
    const titulos = filas[0].map(normalizar);
    const col = {};
    Object.entries(Logica.COLUMNAS_IMPORTACION).forEach(([clave, nombres]) => {
      const i = titulos.findIndex(t => nombres.includes(t));
      if (i >= 0) col[clave] = i;
    });
    const faltan = ['nombre', 'costo'].filter(c => col[c] == null);
    if (col.precio == null && col.ganancia == null) faltan.push('precio (o ganancia)');
    if (faltan.length) return { error: `Faltan columnas: ${faltan.join(', ')}.` };

    const hoy = Fechas.hoy();
    const codigosArchivo = new Set();
    const resultado = filas.slice(1).map((celdas, i) => {
      const v = clave => (col[clave] != null ? celdas[col[clave]] || '' : '');
      const errores = [], avisos = [];
      const nombre = v('nombre').trim();
      const codigo = v('codigo').replace(/\s/g, '');
      const tipoTexto = normalizar(v('tipo'));
      const tipo = /peso|granel|kg|gramo/.test(tipoTexto) ? 'peso' : 'unidad';
      const costo = Logica._numeroImportado(v('costo'));
      let precio = Logica._numeroImportado(v('precio'));
      const ganancia = Logica._numeroImportado(v('ganancia'));
      const minimo = Logica._numeroImportado(v('minimo'));
      const stock = Logica._numeroImportado(v('stock'));
      let vencimiento = v('vencimiento') ? Logica._fechaImportada(v('vencimiento')) : null;

      if (!nombre) errores.push('Falta el nombre');
      if (!(costo > 0)) errores.push('Costo inválido');
      if (!(precio > 0) && ganancia >= 0 && costo > 0) precio = Logica.precioDesdePorcentaje(costo, ganancia);
      if (!(precio > 0)) errores.push('Precio inválido');
      if (codigo) {
        if (DB.todos('productos').some(p => p.codigo === codigo)) errores.push('El código ya existe en el sistema');
        else if (codigosArchivo.has(codigo)) errores.push('Código repetido en el archivo');
        codigosArchivo.add(codigo);
      }
      if (!codigo && nombre && Logica.nombreDuplicado(nombre)) avisos.push('Ya hay un producto con ese nombre');
      if (stock != null && (!Number.isInteger(stock) || stock < 0)) errores.push('Stock inválido (sin decimales; en gramos si es por peso)');
      if (v('vencimiento') && !vencimiento) errores.push('Fecha de vencimiento inválida');
      if (vencimiento && vencimiento < hoy) errores.push('El vencimiento ya pasó');
      if (stock > 0 && !vencimiento) {
        vencimiento = Fechas.sumarDias(hoy, 365);
        avisos.push('Sin vencimiento: se carga a un año, corregilo después');
      }
      return {
        fila: i + 2, errores, avisos,
        datos: {
          nombre, codigo, categoria: v('categoria').trim(), tipo_medida: tipo,
          costo: Math.round(costo), precio_venta: Math.round(precio),
          stock_minimo: Number.isInteger(minimo) && minimo >= 0 ? minimo : Logica.MINIMO_SUGERIDO[tipo],
          stock: stock > 0 ? stock : 0, vencimiento
        }
      };
    });
    return { filas: resultado, validas: resultado.filter(f => !f.errores.length) };
  },

  importarProductos(filasValidas) {
    return DB.transaccion(() => {
      const hoy = Fechas.hoy();
      filasValidas.forEach(({ datos: d }) => {
        const cat = Logica._categoriaPorNombre(d.categoria);
        const p = DB.insertar('productos', {
          nombre: d.nombre, codigo: d.codigo || null, categoria_id: cat ? cat.id : null,
          tipo_medida: d.tipo_medida, controla_stock: true, costo: d.costo,
          porcentaje: Logica.porcentajeDesdePrecio(d.costo, d.precio_venta), precio_venta: d.precio_venta,
          precio_mayorista: null, cantidad_mayorista: null, stock_minimo: d.stock_minimo, activo: true
        });
        if (d.stock > 0) Logica._crearLote(p, { cantidad: d.stock, costo: d.costo, fecha_vencimiento: d.vencimiento }, hoy);
      });
      return filasValidas.length;
    });
  }
};

// ================= Datos de ejemplo =================
// Las fechas se calculan desde hoy para que siempre haya avisos para ver.
// Todo pasa por las mismas funciones que usa la pantalla, así los datos quedan coherentes.
function cargarEjemplo() {
  const hoy = Fechas.hoy();
  const dia = n => Fechas.sumarDias(hoy, n);
  const momento = (n, hora) => `${dia(n)}T${hora}`;

  const cat = {};
  ['Almacén', 'Bebidas', 'Fiambrería', 'Lácteos', 'Panificados', 'Servicios'].forEach(n => { cat[n] = DB.insertar('categorias', { nombre: n }); });

  const producto = (nombre, codigo, categoria, tipo, costo, precio, minimo, extra = {}) => DB.insertar('productos', {
    nombre, codigo, categoria_id: cat[categoria].id, tipo_medida: tipo, controla_stock: true, costo,
    porcentaje: Logica.porcentajeDesdePrecio(costo, precio), precio_venta: precio,
    precio_mayorista: null, cantidad_mayorista: null, stock_minimo: minimo, activo: true, ...extra
  });
  const lote = (p, cantidad, vence, ingreso) => DB.insertar('lotes', {
    producto_id: p.id, cantidad_inicial: cantidad, cantidad_actual: cantidad,
    costo: p.costo, fecha_vencimiento: dia(vence), fecha_ingreso: dia(ingreso)
  });

  const leche = producto('Leche entera 1 L', '7790001000011', 'Lácteos', 'unidad', 1000, 1300, 6);
  const queso = producto('Queso cremoso', null, 'Fiambrería', 'peso', 8000, 11200, 500);
  const yerba = producto('Yerba mate 1 kg', '7790002000028', 'Almacén', 'unidad', 3500, 4400, 4);
  const fideos = producto('Fideos tirabuzón 500 g', '7790003000035', 'Almacén', 'unidad', 900, 1220, 5);
  const pan = producto('Pan lactal', '7790004000042', 'Panificados', 'unidad', 1800, 2340, 3);
  const galletitas = producto('Galletitas de agua', '7790005000059', 'Almacén', 'unidad', 1100, 1450, 4);
  const gaseosa = producto('Gaseosa cola 2,25 L', '7790006000066', 'Bebidas', 'unidad', 1900, 2600, 6,
    { precio_mayorista: 2300, cantidad_mayorista: 6 });
  const recarga = producto('Recarga de celular $1.000', null, 'Servicios', 'unidad', 950, 1000, 0,
    { controla_stock: false });

  lote(leche, 12, 3, -12);
  lote(leche, 12, 19, -2);
  lote(queso, 2000, 6, -8);
  lote(yerba, 10, 180, -30);
  lote(fideos, 20, 300, -30);
  lote(pan, 8, -1, -6);
  lote(pan, 6, 4, -1);
  lote(galletitas, 6, 60, -10);
  lote(gaseosa, 24, 90, -6);

  const marta = DB.insertar('clientes', { nombre: 'Marta Gómez', telefono: '3815550101', limite_credito: 50000, activo: true, fecha_alta: dia(-40) });
  const raul = DB.insertar('clientes', { nombre: 'Raúl Díaz', telefono: '3815550202', limite_credito: 30000, activo: true, fecha_alta: dia(-20) });
  DB.insertar('clientes', { nombre: 'Sofía Ledesma', telefono: '', limite_credito: null, activo: true, fecha_alta: dia(-10) });

  const vender = (n, hora, items, medio_pago = 'efectivo', cliente = null) => Logica.registrarVenta(
    items.map(([p, cantidad]) => ({ producto_id: p.id, cantidad })),
    { medio_pago, cliente_id: cliente ? cliente.id : null, fechaHora: momento(n, hora), forzarLimite: true }
  );
  const cerrar = (n, faltante = 0) => {
    const esperado = Logica.resumenCaja(Logica.cajaAbierta()).efectivoEsperado;
    Logica.cerrarCaja(esperado - faltante, faltante ? 'Faltó plata, revisar vueltos' : '', momento(n, '21:00'));
  };

  // Hace 5 días
  Logica.abrirCaja(20000, momento(-5, '08:00'));
  vender(-5, '09:40', [[leche, 5], [yerba, 3], [fideos, 3], [galletitas, 4]]);
  cerrar(-5);

  // Hace 3 días
  Logica.abrirCaja(20000, momento(-3, '08:00'));
  vender(-3, '10:10', [[leche, 4], [pan, 6]]);
  vender(-3, '18:15', [[queso, 500]], 'cuenta', marta);
  Logica.registrarMovimiento({ tipo: 'salida', motivo: 'pago_proveedor', monto: 9000, descripcion: 'Panadería' }, momento(-3, '11:00'));
  cerrar(-3, 500);

  // Ayer
  Logica.abrirCaja(20000, momento(-1, '08:00'));
  vender(-1, '11:20', [[yerba, 2], [fideos, 2], [gaseosa, 6]], 'debito');
  vender(-1, '19:05', [[queso, 300], [galletitas, 2]], 'cuenta', raul);
  cerrar(-1);

  // Hoy: la caja queda abierta
  Logica.abrirCaja(20000, momento(0, '08:00'));
  vender(0, '09:30', [[leche, 2], [queso, 300], [recarga, 1]]);
  vender(0, '10:05', [[yerba, 1]], 'transferencia');
  Logica.registrarPago(marta.id, { monto: 3000, medio_pago: 'efectivo' }, momento(0, '10:30'));
}
