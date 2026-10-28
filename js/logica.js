/*
 * Reglas de negocio del sistema de stock.
 * No toca la pantalla: solo lee y escribe en DB.
 */

const Fechas = {
  iso(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${dd}`;
  },
  hoy() {
    return Fechas.iso(new Date());
  },
  ahora() {
    const d = new Date();
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${Fechas.iso(d)}T${h}:${min}`;
  },
  aDate(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  },
  sumarDias(iso, n) {
    const d = Fechas.aDate(iso);
    d.setDate(d.getDate() + n);
    return Fechas.iso(d);
  },
  diasEntre(desde, hasta) {
    return Math.round((Fechas.aDate(hasta) - Fechas.aDate(desde)) / 86400000);
  }
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
  hora(fechaHora) { return fechaHora.slice(11, 16); },
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

const Logica = {
  MINIMO_SUGERIDO: { unidad: 5, peso: 500 },

  // ---------- Precios ----------
  factor(p) {
    return p.tipo_medida === 'peso' ? 1000 : 1; // precio por kg, stock en gramos
  },
  precioDesdePorcentaje(costo, porcentaje) {
    return Math.round(costo * (1 + porcentaje / 100));
  },
  porcentajeDesdePrecio(costo, precio) {
    return costo > 0 ? Math.round((precio / costo - 1) * 1000) / 10 : 0;
  },
  subtotal(p, precio, cantidad) {
    return Math.round(precio * cantidad / Logica.factor(p));
  },

  // ---------- Productos ----------
  productosActivos() {
    return DB.todos('productos').filter(p => p.activo)
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  },

  buscarProductos(texto, incluirBajas = false) {
    const t = normalizar(texto);
    const lista = (incluirBajas ? DB.todos('productos').slice() : Logica.productosActivos())
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    if (!t) return lista;
    const exacto = lista.filter(p => p.codigo && p.codigo === texto.trim());
    const porNombre = lista.filter(p => !exacto.includes(p) &&
      (normalizar(p.nombre).includes(t) || normalizar(p.categoria).includes(t) ||
       (p.codigo && p.codigo.startsWith(texto.trim()))));
    return [...exacto, ...porNombre];
  },

  nombreDuplicado(nombre, id = null) {
    const n = normalizar(nombre);
    return DB.todos('productos').some(p => p.id !== id && normalizar(p.nombre) === n);
  },

  guardarProducto(datos, id = null) {
    const nombre = (datos.nombre || '').trim();
    const codigo = (datos.codigo || '').trim() || null;
    if (!nombre) throw new Error('Ingresá el nombre del producto.');
    if (!['unidad', 'peso'].includes(datos.tipo_medida)) throw new Error('Elegí si se vende por unidad o por peso.');
    if (!(datos.costo > 0)) throw new Error('El costo tiene que ser mayor a 0.');
    if (!(datos.precio_venta > 0)) throw new Error('El precio de venta tiene que ser mayor a 0.');
    if (!Number.isInteger(datos.stock_minimo) || datos.stock_minimo < 0) {
      throw new Error('El stock mínimo tiene que ser un número entero, 0 o más.');
    }
    if (codigo && DB.todos('productos').some(p => p.codigo === codigo && p.id !== id)) {
      throw new Error(`Ya existe un producto con el código ${codigo}.`);
    }
    const existente = id ? DB.buscar('productos', id) : null;
    if (existente && existente.tipo_medida !== datos.tipo_medida && Logica.lotesDe(id).length) {
      throw new Error('No se puede cambiar la forma de venta de un producto que ya tiene stock cargado.');
    }

    // El servidor (acá, la lógica) recalcula el porcentaje para que siempre coincida con el precio.
    const costo = Math.round(datos.costo);
    const precio = Math.round(datos.precio_venta);
    const fila = {
      nombre,
      codigo,
      categoria: (datos.categoria || '').trim(),
      tipo_medida: datos.tipo_medida,
      costo,
      porcentaje: Logica.porcentajeDesdePrecio(costo, precio),
      precio_venta: precio,
      stock_minimo: datos.stock_minimo
    };

    return DB.transaccion(() => {
      if (existente) {
        Object.assign(existente, fila);
        return existente;
      }
      const p = DB.insertar('productos', { ...fila, activo: true });
      if (datos.stockInicial) Logica._crearLote(p, datos.stockInicial, Fechas.hoy());
      return p;
    });
  },

  cambiarActivo(id, activo) {
    return DB.transaccion(() => {
      const p = DB.buscar('productos', id);
      p.activo = activo;
      return p;
    });
  },

  // ---------- Lotes y stock ----------
  lotesDe(productoId) {
    return DB.todos('lotes').filter(l => l.producto_id === productoId)
      .sort((a, b) => a.fecha_vencimiento.localeCompare(b.fecha_vencimiento) || a.id - b.id);
  },

  // Lotes que se pueden vender en una fecha: con cantidad y sin vencer, ordenados por vencimiento (FEFO).
  lotesVigentes(productoId, fecha = Fechas.hoy()) {
    return Logica.lotesDe(productoId).filter(l => l.cantidad_actual > 0 && l.fecha_vencimiento >= fecha);
  },

  stockVigente(productoId, fecha = Fechas.hoy()) {
    return Logica.lotesVigentes(productoId, fecha).reduce((s, l) => s + l.cantidad_actual, 0);
  },

  stockVencido(productoId, fecha = Fechas.hoy()) {
    return Logica.lotesDe(productoId)
      .filter(l => l.cantidad_actual > 0 && l.fecha_vencimiento < fecha)
      .reduce((s, l) => s + l.cantidad_actual, 0);
  },

  proximoVencimiento(productoId) {
    const lote = Logica.lotesVigentes(productoId)[0];
    return lote ? lote.fecha_vencimiento : null;
  },

  _crearLote(p, linea, fechaIngreso) {
    const cantidad = linea.cantidad;
    const costo = Math.round(linea.costo);
    const vence = linea.fecha_vencimiento;
    if (!Number.isInteger(cantidad) || cantidad <= 0) {
      throw new Error(`La cantidad tiene que ser un número entero mayor a 0 (${p.tipo_medida === 'peso' ? 'en gramos' : 'en unidades'}).`);
    }
    if (!(costo > 0)) throw new Error('El costo de la mercadería tiene que ser mayor a 0.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(vence || '')) throw new Error('Completá la fecha de vencimiento.');
    if (vence < fechaIngreso) throw new Error(`La fecha de vencimiento ${Formato.fecha(vence)} ya pasó.`);
    return DB.insertar('lotes', {
      producto_id: p.id,
      cantidad_inicial: cantidad,
      cantidad_actual: cantidad,
      costo,
      fecha_vencimiento: vence,
      fecha_ingreso: fechaIngreso
    });
  },

  // Cada línea crea un lote. Si el costo cambió, se actualiza el producto:
  // con actualizarPrecio se mantiene el porcentaje; si no, se mantiene el precio y baja (o sube) el margen.
  ingresarMercaderia(productoId, lineas, { actualizarPrecio = true } = {}) {
    return DB.transaccion(() => {
      const p = DB.buscar('productos', productoId);
      if (!p || !p.activo) throw new Error('Elegí un producto activo.');
      if (!lineas.length) throw new Error('Cargá al menos una línea.');
      const hoy = Fechas.hoy();
      const lotes = lineas.map(l => Logica._crearLote(p, l, hoy));
      const costoNuevo = Math.round(lineas[lineas.length - 1].costo);
      if (costoNuevo !== p.costo) {
        p.costo = costoNuevo;
        if (actualizarPrecio) p.precio_venta = Logica.precioDesdePorcentaje(p.costo, p.porcentaje);
        else p.porcentaje = Logica.porcentajeDesdePrecio(p.costo, p.precio_venta);
      }
      return lotes;
    });
  },

  // ---------- Ventas ----------
  // items: [{ producto_id, cantidad }]. Descuenta por FEFO, sin tocar lotes vencidos.
  registrarVenta(items, fechaHora = Fechas.ahora()) {
    const fecha = fechaHora.slice(0, 10);
    const agrupado = new Map();
    items.forEach(it => agrupado.set(it.producto_id, (agrupado.get(it.producto_id) || 0) + it.cantidad));
    if (!agrupado.size) throw new Error('Agregá al menos un producto a la venta.');

    return DB.transaccion(() => {
      const venta = DB.insertar('ventas', { fecha_hora: fechaHora, total: 0, ganancia: 0 });

      for (const [productoId, cantidad] of agrupado) {
        const p = DB.buscar('productos', productoId);
        if (!p || !p.activo) throw new Error('Uno de los productos ya no está disponible.');
        if (!Number.isInteger(cantidad) || cantidad <= 0) throw new Error(`Cantidad inválida para ${p.nombre}.`);

        const lotes = Logica.lotesVigentes(productoId, fecha);
        const disponible = lotes.reduce((s, l) => s + l.cantidad_actual, 0);
        if (disponible < cantidad) {
          if (disponible === 0 && Logica.stockVencido(productoId, fecha) > 0) {
            throw new Error(`De ${p.nombre} solo quedan unidades vencidas.`);
          }
          throw new Error(`No alcanza el stock de ${p.nombre}: hay ${Formato.cantidad(p, disponible)}.`);
        }

        let restante = cantidad;
        let costoAcumulado = 0;
        const tomas = [];
        for (const lote of lotes) {
          if (restante === 0) break;
          const tomar = Math.min(restante, lote.cantidad_actual);
          lote.cantidad_actual -= tomar;
          costoAcumulado += tomar * lote.costo;
          tomas.push({ lote_id: lote.id, cantidad: tomar });
          restante -= tomar;
        }

        const subtotal = Logica.subtotal(p, p.precio_venta, cantidad);
        const costoRenglon = Math.round(costoAcumulado / Logica.factor(p));
        const detalle = DB.insertar('detalle_venta', {
          venta_id: venta.id,
          producto_id: productoId,
          cantidad,
          precio_unitario: p.precio_venta,
          costo_unitario: Math.round(costoAcumulado / cantidad) // promedio de los lotes usados
        });
        tomas.forEach(t => DB.insertar('detalle_venta_lote', { detalle_venta_id: detalle.id, ...t }));

        venta.total += subtotal;
        venta.ganancia += subtotal - costoRenglon;
      }
      return venta;
    });
  },

  // ---------- Avisos ----------
  avisos(dias = DB.data.config.diasAviso) {
    const hoy = Fechas.hoy();
    const limite = Fechas.sumarDias(hoy, dias);
    const activos = new Map(Logica.productosActivos().map(p => [p.id, p]));
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

  // ---------- Informe ----------
  informe(fecha) {
    const ventas = DB.todos('ventas').filter(v => v.fecha_hora.slice(0, 10) === fecha)
      .sort((a, b) => a.fecha_hora.localeCompare(b.fecha_hora));
    const ids = new Set(ventas.map(v => v.id));
    const detalles = DB.todos('detalle_venta').filter(d => ids.has(d.venta_id));

    const porProducto = new Map();
    const renglones = new Map();
    detalles.forEach(d => {
      const p = DB.buscar('productos', d.producto_id);
      const vendido = Logica.subtotal(p, d.precio_unitario, d.cantidad);
      const costo = Math.round(d.costo_unitario * d.cantidad / Logica.factor(p));
      const fila = porProducto.get(p.id) || { producto: p, cantidad: 0, vendido: 0, ganancia: 0 };
      fila.cantidad += d.cantidad;
      fila.vendido += vendido;
      fila.ganancia += vendido - costo;
      porProducto.set(p.id, fila);
      if (!renglones.has(d.venta_id)) renglones.set(d.venta_id, []);
      renglones.get(d.venta_id).push({ producto: p, cantidad: d.cantidad });
    });

    const total = ventas.reduce((s, v) => s + v.total, 0);
    const ganancia = ventas.reduce((s, v) => s + v.ganancia, 0);
    return {
      ventas,
      cantidad: ventas.length,
      total,
      ganancia,
      costo: total - ganancia,
      porProducto: [...porProducto.values()].sort((a, b) => b.vendido - a.vendido),
      renglones
    };
  }
};

// ---------- Datos de ejemplo ----------
// Las fechas se arman en relación a hoy, así los avisos siempre muestran algo.
// Las ventas pasan por registrarVenta, así los lotes quedan coherentes con lo vendido.
function cargarEjemplo() {
  const hoy = Fechas.hoy();
  const dia = n => Fechas.sumarDias(hoy, n);

  const producto = (nombre, codigo, categoria, tipo, costo, precio, minimo) => DB.insertar('productos', {
    nombre, codigo, categoria, tipo_medida: tipo, costo,
    porcentaje: Logica.porcentajeDesdePrecio(costo, precio),
    precio_venta: precio, stock_minimo: minimo, activo: true
  });
  const lote = (p, cantidad, vence, ingreso) => DB.insertar('lotes', {
    producto_id: p.id, cantidad_inicial: cantidad, cantidad_actual: cantidad,
    costo: p.costo, fecha_vencimiento: dia(vence), fecha_ingreso: dia(ingreso)
  });
  const venta = (d, hora, items) => Logica.registrarVenta(
    items.map(([p, cantidad]) => ({ producto_id: p.id, cantidad })), `${dia(d)}T${hora}`
  );

  const leche = producto('Leche entera 1 L', '7790001000011', 'Lácteos', 'unidad', 1000, 1300, 6);
  const queso = producto('Queso cremoso', '', 'Fiambrería', 'peso', 8000, 11200, 500);
  const yerba = producto('Yerba mate 1 kg', '7790002000028', 'Almacén', 'unidad', 3500, 4400, 4);
  const fideos = producto('Fideos tirabuzón 500 g', '7790003000035', 'Almacén', 'unidad', 900, 1220, 5);
  const pan = producto('Pan lactal', '7790004000042', 'Panificados', 'unidad', 1800, 2340, 3);
  const galletitas = producto('Galletitas de agua', '7790005000059', 'Almacén', 'unidad', 1100, 1450, 4);

  lote(leche, 12, 3, -12);
  lote(leche, 12, 19, -2);
  lote(queso, 2000, 6, -8);
  lote(yerba, 10, 180, -30);
  lote(fideos, 20, 300, -30);
  lote(pan, 8, -1, -6);
  lote(pan, 6, 4, -1);
  lote(galletitas, 6, 60, -10);

  venta(-5, '09:40', [[leche, 5], [yerba, 3], [fideos, 3], [galletitas, 4]]);
  venta(-3, '18:15', [[leche, 4], [queso, 500], [pan, 6]]);
  venta(-1, '11:20', [[yerba, 2], [queso, 300], [fideos, 2], [galletitas, 2]]);
  venta(0, '09:30', [[leche, 2], [queso, 300]]);
  venta(0, '10:05', [[yerba, 1]]);
}
