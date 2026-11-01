/*
 * Reglas de negocio del sistema. No toca la pantalla: solo lee y escribe en DB.
 * Cada función que modifica datos lo hace dentro de una transacción.
 */

// ================= Constantes =================
// Tipos de pago: son fijos porque cada uno tiene su comportamiento.
// Los medios concretos (cada cuenta, cada posnet) se cargan en la tabla medios_pago.
const TIPOS_PAGO = {
  efectivo: 'Efectivo',
  debito: 'Débito',
  credito: 'Crédito',
  transferencia: 'Transferencia o QR',
  cuenta: 'Fiado'
};

const ESTADOS_VERIFICACION = { pendiente: 'Pendiente', verificada: 'Verificada', rechazada: 'Rechazada' };

const ROLES = {
  admin: 'Administrador',
  vendedor: 'Vendedor',
  soporte: 'Soporte técnico'   // usuario del desarrollador: protegido, limitado y habilitado por tiempo
};

// Pantallas que puede abrir cada rol. El administrador ve todo.
const PERMISOS = {
  admin: ['inicio', 'vender', 'clientes', 'productos', 'mercaderia', 'caja', 'transferencias', 'informes', 'usuarios', 'configuracion'],
  vendedor: ['inicio', 'vender', 'clientes', 'mercaderia', 'caja', 'transferencias'],
  soporte: ['usuarios', 'configuracion']   // no ve ventas, caja, clientes ni informes
};

const HORAS_SOPORTE = 24;

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
  medio(id) { const m = DB.buscar('medios_pago', id); return m ? m.nombre : '—'; },
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

// Hash simple para no guardar la contraseña a la vista en la demo.
// En la versión con servidor se reemplaza por bcrypt o similar, calculado en el servidor.
function hashClave(clave, usuario) {
  const texto = `${normalizar(usuario)}:${clave}:almacen`;
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < texto.length; i++) {
    const c = texto.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}

// Código aleatorio legible (sin letras que se confunden, como O/0 o I/1), en grupos de 4.
function generarCodigo(grupos = 3) {
  const letras = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const n = grupos * 4;
  const azar = new Uint32Array(n);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(azar);
  else for (let i = 0; i < n; i++) azar[i] = Math.floor(Math.random() * 4294967296);
  const texto = Array.from(azar, x => letras[x % letras.length]).join('');
  return texto.match(/.{4}/g).join('-');
}
// Correo: obligatorio para administradores y soporte (recuperación y verificación en dos pasos, a futuro).
const ROLES_CON_EMAIL = ['admin', 'soporte'];
const emailValido = e => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);

const normalizarCodigo = c => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

function error(mensaje, codigo) {
  const e = new Error(mensaje);
  if (codigo) e.codigo = codigo;
  return e;
}

// ================= Lógica =================
const Logica = {
  MINIMO_SUGERIDO: { unidad: 5, peso: 500 },
  usuarioActualId: null, // lo define la sesión; queda guardado en cada operación

  // ---------- Usuarios ----------
  usuarios() {
    return DB.todos('usuarios').slice().sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  },
  nombreUsuario(id) {
    const u = id ? DB.buscar('usuarios', id) : null;
    return u ? u.nombre : '';
  },
  validarLogin(usuario, clave) {
    const nombre = normalizar(usuario);
    const u = DB.todos('usuarios').find(x => x.usuario === nombre);
    // Mismo mensaje en los dos casos, para no revelar qué usuarios existen.
    if (!u || u.clave_hash !== hashClave(clave, nombre)) throw error('Usuario o contraseña incorrectos.');
    if (!u.activo) throw error('Este usuario está desactivado. Consultá con el administrador.');
    if (u.rol === 'soporte' && !Logica.accesoSoporteVigente(u)) {
      throw error('El acceso de soporte está deshabilitado. El administrador del negocio tiene que habilitarlo desde Usuarios.');
    }
    if (u.rol === 'soporte') Logica._auditar('Ingreso de soporte técnico', '', u);
    return u;
  },

  // ---------- Auditoría: quién hizo qué con usuarios y accesos ----------
  _auditar(accion, detalle = '', usuario = null) {
    const u = usuario || DB.buscar('usuarios', Logica.usuarioActualId);
    DB.insertar('auditoria', {
      fecha_hora: Fechas.ahora(), usuario_id: u ? u.id : null,
      usuario_nombre: u ? u.nombre : 'Sistema (servidor)', accion, detalle
    });
  },
  auditoria(limite = 30) {
    return DB.todos('auditoria').slice().sort((a, b) => b.id - a.id).slice(0, limite);
  },

  // ---------- Soporte técnico ----------
  usuarioSoporte() { return DB.todos('usuarios').find(u => u.rol === 'soporte') || null; },
  accesoSoporteVigente(u = Logica.usuarioSoporte()) {
    return !!u && !!u.acceso_hasta && u.acceso_hasta > Fechas.ahora();
  },
  habilitarSoporte(horas = HORAS_SOPORTE) {
    if (!Logica.esAdminActual()) throw error('Solo el administrador puede habilitar el acceso de soporte.');
    const u = Logica.usuarioSoporte();
    if (!u) throw error('No hay usuario de soporte.');
    const hasta = new Date(Date.now() + horas * 3600000);
    const iso = `${Fechas.iso(hasta)}T${String(hasta.getHours()).padStart(2, '0')}:${String(hasta.getMinutes()).padStart(2, '0')}`;
    return DB.transaccion(() => {
      u.acceso_hasta = iso;
      Logica._auditar('Habilitó el acceso de soporte', `Hasta el ${Formato.fecha(iso)} a las ${Formato.hora(iso)}`);
      return u;
    });
  },
  deshabilitarSoporte() {
    if (!Logica.esAdminActual()) throw error('Solo el administrador puede deshabilitar el acceso de soporte.');
    const u = Logica.usuarioSoporte();
    return DB.transaccion(() => { u.acceso_hasta = null; Logica._auditar('Deshabilitó el acceso de soporte'); return u; });
  },
  // Pueden crear usuarios y resetear contraseñas el administrador y el soporte (con acceso vigente).
  puedeGestionarUsuarios() {
    const u = DB.buscar('usuarios', Logica.usuarioActualId);
    return !!u && (u.rol === 'admin' || (u.rol === 'soporte' && Logica.accesoSoporteVigente(u)));
  },

  // ---------- Contraseñas ----------
  // Al ingresar con una contraseña provisoria hay que cambiarla. Si es administrador y no tiene
  // código de recuperación, se le genera uno y se devuelve para mostrarlo una sola vez.
  cambiarClaveObligatoria(nueva) {
    const u = DB.buscar('usuarios', Logica.usuarioActualId);
    Logica._validarClave(nueva);
    if (u.clave_hash === hashClave(nueva, u.usuario)) throw error('La contraseña nueva tiene que ser distinta de la provisoria.');
    return DB.transaccion(() => {
      u.clave_hash = hashClave(nueva, u.usuario);
      u.debe_cambiar_clave = false;
      Logica._auditar('Cambió su contraseña provisoria');
      const codigo = u.rol === 'admin' && !u.codigo_recuperacion_hash ? Logica._nuevoCodigo(u) : null;
      return { usuario: u, codigo };
    });
  },
  _nuevoCodigo(u) {
    const codigo = generarCodigo();
    u.codigo_recuperacion_hash = hashClave(normalizarCodigo(codigo), 'recuperacion:' + u.usuario);
    return codigo;
  },
  // El administrador genera un código nuevo (el anterior deja de servir).
  generarCodigoRecuperacion() {
    const u = DB.buscar('usuarios', Logica.usuarioActualId);
    if (!u || u.rol !== 'admin') throw error('El código de recuperación es solo para administradores.');
    return DB.transaccion(() => { const c = Logica._nuevoCodigo(u); Logica._auditar('Generó un código de recuperación nuevo'); return c; });
  },
  // «¿Olvidaste tu contraseña?»: el administrador usa su código guardado. Se gasta y se genera otro.
  recuperarConCodigo(usuario, codigo, nueva) {
    const nombre = normalizar(usuario);
    const u = DB.todos('usuarios').find(x => x.usuario === nombre);
    const valido = u && u.activo && u.rol === 'admin' && u.codigo_recuperacion_hash &&
      u.codigo_recuperacion_hash === hashClave(normalizarCodigo(codigo), 'recuperacion:' + nombre);
    if (!valido) throw error('El usuario o el código de recuperación no son correctos.');
    Logica._validarClave(nueva);
    return DB.transaccion(() => {
      u.clave_hash = hashClave(nueva, u.usuario);
      u.debe_cambiar_clave = false;
      const nuevoCodigo = Logica._nuevoCodigo(u);
      Logica._auditar('Recuperó su contraseña con el código de recuperación', '', u);
      return { usuario: u, codigo: nuevoCodigo };
    });
  },
  // Simula el comando de emergencia del servidor (en la versión real: dotnet AlmacenApp.dll reset-admin).
  // No pide permisos porque solo lo puede ejecutar quien tiene acceso al servidor.
  resetEmergencia(usuario, provisoria) {
    const u = DB.todos('usuarios').find(x => x.usuario === normalizar(usuario));
    if (!u) throw error('No existe ese usuario.');
    Logica._validarClave(provisoria);
    return DB.transaccion(() => {
      Object.assign(u, { clave_hash: hashClave(provisoria, u.usuario), debe_cambiar_clave: true, activo: true });
      DB.insertar('auditoria', { fecha_hora: Fechas.ahora(), usuario_id: null, usuario_nombre: 'Sistema (servidor)',
        accion: 'Reseteo de emergencia de contraseña', detalle: `Usuario «${u.usuario}». Hecho desde el servidor.` });
      return `Contraseña provisoria cargada para «${u.usuario}». Tiene que cambiarla al ingresar.`;
    });
  },
  _validarClave(clave) {
    if (String(clave || '').length < 6) throw error('La contraseña tiene que tener al menos 6 caracteres.');
  },
  // datos.clave, si viene, es una contraseña PROVISORIA: la persona la cambia al ingresar.
  guardarUsuario(datos, id = null) {
    if (!Logica.puedeGestionarUsuarios()) throw error('No tenés permiso para administrar usuarios.');
    if (datos.rol === 'soporte') throw error('El usuario de soporte es único y ya existe.');
    const nombre = (datos.nombre || '').trim();
    const usuario = normalizar(datos.usuario);
    if (!nombre) throw error('Ingresá el nombre de la persona.');
    if (!/^[a-z0-9._-]{3,20}$/.test(usuario)) throw error('El usuario tiene que tener entre 3 y 20 letras o números, sin espacios ni acentos.');
    if (!ROLES[datos.rol]) throw error('Elegí el rol.');
    if (DB.todos('usuarios').some(u => u.id !== id && u.usuario === usuario)) throw error(`Ya existe el usuario «${usuario}».`);
    const email = String(datos.email || '').trim().toLowerCase();
    if (!email && ROLES_CON_EMAIL.includes(datos.rol)) throw error('El correo electrónico es obligatorio para los administradores.');
    if (email && !emailValido(email)) throw error('El correo electrónico no es válido. Revisalo: por ejemplo, nombre@gmail.com');
    if (email && DB.todos('usuarios').some(u => u.id !== id && u.email === email)) throw error(`El correo ${email} ya lo usa otro usuario.`);
    const existente = id ? DB.buscar('usuarios', id) : null;
    if (existente && existente.protegido) throw error('El usuario de soporte no se modifica desde acá: se habilita o deshabilita desde «Acceso de soporte».');
    const activo = datos.activo !== false;
    if (existente) {
      const quedaSinAdmin = existente.rol === 'admin' && (datos.rol !== 'admin' || !activo) &&
        !DB.todos('usuarios').some(u => u.id !== id && u.rol === 'admin' && u.activo);
      if (quedaSinAdmin) throw error('Tiene que quedar al menos un administrador activo.');
      if (id === Logica.usuarioActualId && !activo) throw error('No podés desactivar tu propio usuario.');
    }
    if (!existente || datos.clave) Logica._validarClave(datos.clave);
    return DB.transaccion(() => {
      const fila = { nombre, usuario, rol: datos.rol, activo, email: email || null };
      if (datos.clave) {
        fila.clave_hash = hashClave(datos.clave, usuario);
        fila.debe_cambiar_clave = id !== Logica.usuarioActualId; // la propia contraseña se cambia desde «Mi cuenta»
      } else if (existente && existente.usuario !== usuario) {
        throw error('Si cambiás el nombre de usuario, cargá también una contraseña provisoria.');
      }
      if (existente) {
        if (datos.clave) Logica._auditar('Reseteó una contraseña', `Usuario «${existente.usuario}» (${existente.nombre})`);
        if (existente.rol !== datos.rol) Logica._auditar('Cambió el rol de un usuario', `«${existente.usuario}»: ${ROLES[existente.rol]} → ${ROLES[datos.rol]}`);
        if (existente.activo !== activo) Logica._auditar(activo ? 'Activó un usuario' : 'Desactivó un usuario', `«${existente.usuario}»`);
        if ((existente.email || null) !== (email || null)) Logica._auditar('Cambió el correo de un usuario', `«${existente.usuario}»: ${existente.email || 'sin correo'} → ${email || 'sin correo'}`);
        return Object.assign(existente, fila);
      }
      const nuevo = DB.insertar('usuarios', { ...fila, protegido: false, acceso_hasta: null, codigo_recuperacion_hash: null, email_verificado_en: null, fecha_alta: Fechas.hoy() });
      Logica._auditar('Creó un usuario', `«${usuario}» (${nombre}), ${ROLES[datos.rol].toLowerCase()}`);
      return nuevo;
    });
  },
  // Cuántas operaciones registró un usuario: si tiene alguna, no se borra (se desactiva).
  usosUsuario(id) {
    const cuenta = (tabla, campos) => DB.todos(tabla).filter(f => campos.some(c => f[c] === id)).length;
    return cuenta('ventas', ['usuario_id']) + cuenta('cajas', ['usuario_apertura_id', 'usuario_cierre_id']) +
      cuenta('pagos_venta', ['usuario_id', 'verificado_por', 'autorizado_por']) +
      cuenta('pagos_clientes', ['usuario_id', 'verificado_por', 'autorizado_por']) +
      cuenta('movimientos_caja', ['usuario_id']) + cuenta('lotes', ['usuario_id']) +
      cuenta('ajustes_stock', ['usuario_id']) + cuenta('verificaciones_pago', ['usuario_id']);
  },
  motivoNoBorrarUsuario(id) {
    const u = DB.buscar('usuarios', id);
    if (!u) return 'el usuario no existe';
    if (u.protegido) return 'es el usuario de soporte técnico, que está protegido';
    if (id === Logica.usuarioActualId) return 'es tu propio usuario';
    // Nunca puede quedar el sistema sin un administrador activo: nadie podría crear usuarios ni configurar
    if (u.rol === 'admin' && !DB.todos('usuarios').some(x => x.id !== id && x.rol === 'admin' && x.activo)) {
      return 'es el único administrador activo y el sistema quedaría sin nadie que lo administre';
    }
    const usos = Logica.usosUsuario(id);
    if (usos) return `tiene ${usos} ${usos === 1 ? 'operación registrada' : 'operaciones registradas'} (ventas, cajas, cobros…)`;
    return null;
  },
  borrarUsuario(id) {
    if (!Logica.esAdminActual()) throw error('Solo el administrador puede eliminar usuarios.');
    const motivo = Logica.motivoNoBorrarUsuario(id);
    if (motivo) throw error(`No se puede eliminar porque ${motivo}. Podés desactivarlo.`);
    const u = DB.buscar('usuarios', id);
    return DB.transaccion(() => { DB.borrar('usuarios', id); Logica._auditar('Eliminó un usuario', `«${u.usuario}» (${u.nombre})`); });
  },

  cambiarClavePropia(actual, nueva) {
    const u = DB.buscar('usuarios', Logica.usuarioActualId);
    if (!u || u.clave_hash !== hashClave(actual, u.usuario)) throw error('La contraseña actual no es correcta.');
    Logica._validarClave(nueva);
    return DB.transaccion(() => { u.clave_hash = hashClave(nueva, u.usuario); Logica._auditar('Cambió su contraseña'); return u; });
  },

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

  // Un producto se puede eliminar solo si nunca se vendió ni se ajustó. Si no, se da de baja.
  motivoNoBorrarProducto(id) {
    const ventas = new Set(DB.todos('detalle_venta').filter(d => d.producto_id === id).map(d => d.venta_id)).size;
    if (ventas) return `tiene ${ventas} ${ventas === 1 ? 'venta registrada' : 'ventas registradas'}`;
    const lotes = new Set(Logica.lotesDe(id).map(l => l.id));
    if (DB.todos('ajustes_stock').some(a => lotes.has(a.lote_id))) return 'tiene ajustes de stock registrados';
    return null;
  },
  borrarProducto(id) {
    if (!Logica.esAdminActual()) throw error('Solo el administrador puede eliminar productos.');
    const motivo = Logica.motivoNoBorrarProducto(id);
    if (motivo) throw error(`No se puede eliminar porque ${motivo}. Podés darlo de baja.`);
    return DB.transaccion(() => {
      Logica.lotesDe(id).forEach(l => DB.borrar('lotes', l.id)); // el stock cargado por error se va con el producto
      DB.borrar('productos', id);
    });
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
      costo, fecha_vencimiento: vence, fecha_ingreso: fechaIngreso, usuario_id: Logica.usuarioActualId
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
      return DB.insertar('ajustes_stock', { lote_id: lote.id, cantidad, motivo, fecha, usuario_id: Logica.usuarioActualId });
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
      usuario_apertura_id: Logica.usuarioActualId, usuario_cierre_id: null,
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
      caja_id: caja.id, fecha_hora: fechaHora, tipo, motivo, monto, descripcion: String(descripcion).trim(),
      usuario_id: Logica.usuarioActualId
    }));
  },
  cerrarCaja(contado, observacion = '', fechaHora = Fechas.ahora()) {
    const caja = Logica.cajaAbierta();
    if (!caja) throw error('No hay una caja abierta.');
    if (!Number.isInteger(contado) || contado < 0) throw error('Ingresá cuánto efectivo contaste, sin centavos.');
    const esperado = Logica.resumenCaja(caja).efectivoEsperado;
    return DB.transaccion(() => Object.assign(caja, {
      fecha_cierre: fechaHora, efectivo_esperado: esperado, efectivo_contado: contado,
      diferencia: contado - esperado, observacion: String(observacion).trim(), estado: 'cerrada',
      usuario_cierre_id: Logica.usuarioActualId
    }));
  },
  // El efectivo esperado se calcula con los PAGOS en efectivo del turno (no con las ventas),
  // así una venta mixta solo suma al arqueo la parte que se pagó en efectivo.
  resumenCaja(caja) {
    const ventas = DB.todos('ventas').filter(v => v.caja_id === caja.id);
    const agregado = Logica._agregarVentas(ventas);
    const pagos = DB.todos('pagos_venta').filter(p => p.caja_id === caja.id);
    const cobros = DB.todos('pagos_clientes').filter(p => p.caja_id === caja.id);
    const movimientos = DB.todos('movimientos_caja').filter(m => m.caja_id === caja.id)
      .sort((a, b) => a.fecha_hora.localeCompare(b.fecha_hora));
    const suma = lista => lista.reduce((s, x) => s + x.monto, 0);
    const esEfectivo = p => Logica.tipoDe(p.medio_pago_id) === 'efectivo';
    const ventasEfectivo = suma(pagos.filter(esEfectivo));
    const cobrosValidos = cobros.filter(c => c.estado_verificacion !== 'rechazada');
    const cobrosEfectivo = suma(cobrosValidos.filter(esEfectivo));
    const entradas = suma(movimientos.filter(m => m.tipo === 'entrada'));
    const salidas = suma(movimientos.filter(m => m.tipo === 'salida'));
    const transferencias = [...pagos, ...cobros].filter(p => Logica.tipoDe(p.medio_pago_id) === 'transferencia');
    const pendientes = transferencias.filter(p => p.estado_verificacion === 'pendiente');
    return {
      caja, ...agregado, porMedio: Logica._porMedio(pagos, cobros), cobros: cobrosValidos,
      cobrosEfectivo, cobrosTotal: suma(cobrosValidos),
      movimientos, entradas, salidas, ventasEfectivo,
      transferenciasPendientes: { cantidad: pendientes.length, total: suma(pendientes) },
      efectivoEsperado: caja.dinero_inicial + ventasEfectivo + cobrosEfectivo + entradas - salidas
    };
  },

  // ---------- Medios de pago (catálogo configurable) ----------
  mediosPago({ soloActivos = false } = {}) {
    return DB.todos('medios_pago').filter(m => !soloActivos || m.activo).sort((a, b) => a.orden - b.orden);
  },
  tipoDe(medioId) {
    const m = DB.buscar('medios_pago', medioId);
    return m ? m.tipo : null;
  },
  medioUsado(id) {
    return DB.todos('pagos_venta').some(p => p.medio_pago_id === id) || DB.todos('pagos_clientes').some(p => p.medio_pago_id === id);
  },
  guardarMedio({ nombre, tipo }, id = null) {
    const limpio = String(nombre || '').trim();
    if (!limpio) throw error('Escribí el nombre del medio de pago.');
    if (!TIPOS_PAGO[tipo]) throw error('Elegí el tipo.');
    if (DB.todos('medios_pago').some(m => m.id !== id && normalizar(m.nombre) === normalizar(limpio))) throw error(`Ya existe «${limpio}».`);
    const existente = id ? DB.buscar('medios_pago', id) : null;
    if (existente && existente.tipo !== tipo && Logica.medioUsado(id)) throw error('No se puede cambiar el tipo de un medio que ya se usó. Creá uno nuevo.');
    if (tipo === 'cuenta' && DB.todos('medios_pago').some(m => m.id !== id && m.tipo === 'cuenta')) throw error('El fiado es uno solo: ya existe.');
    return DB.transaccion(() => {
      if (existente) return Object.assign(existente, { nombre: limpio, tipo });
      const orden = Math.max(0, ...DB.todos('medios_pago').map(m => m.orden)) + 1;
      return DB.insertar('medios_pago', { nombre: limpio, tipo, activo: true, orden });
    });
  },
  cambiarActivoMedio(id, activo) {
    const m = DB.buscar('medios_pago', id);
    if (!activo && m.tipo === 'efectivo' && !DB.todos('medios_pago').some(x => x.id !== id && x.tipo === 'efectivo' && x.activo)) {
      throw error('Tiene que quedar un medio de efectivo activo: la caja depende de él.');
    }
    return DB.transaccion(() => Object.assign(m, { activo }));
  },
  moverMedio(id, direccion) {
    const lista = Logica.mediosPago();
    const i = lista.findIndex(m => m.id === id);
    const j = i + direccion;
    if (i < 0 || j < 0 || j >= lista.length) return;
    return DB.transaccion(() => { const o = lista[i].orden; lista[i].orden = lista[j].orden; lista[j].orden = o; });
  },
  borrarMedio(id) {
    if (!Logica.esAdminActual()) throw error('Solo el administrador puede eliminar medios de pago.');
    if (Logica.medioUsado(id)) throw error('Ese medio ya tiene cobros registrados: desactivalo en lugar de borrarlo.');
    const m = DB.buscar('medios_pago', id);
    if (m.tipo === 'efectivo' && !DB.todos('medios_pago').some(x => x.id !== id && x.tipo === 'efectivo' && x.activo)) {
      throw error('Tiene que quedar un medio de efectivo activo.');
    }
    return DB.transaccion(() => DB.borrar('medios_pago', id));
  },

  // ---------- Pagos y verificación de transferencias ----------
  puedeVerificar() {
    const u = DB.buscar('usuarios', Logica.usuarioActualId);
    return !!u && (u.rol === 'admin' || Logica.config('transferencias').vendedorVerifica);
  },
  esAdminActual() {
    const u = DB.buscar('usuarios', Logica.usuarioActualId);
    return !!u && u.rol === 'admin';
  },
  pagosDeVenta(ventaId) {
    return DB.todos('pagos_venta').filter(p => p.venta_id === ventaId).sort((a, b) => a.id - b.id);
  },
  // pagada / pendiente (alguna transferencia sin verificar) / problema (algún pago rechazado sin resolver)
  estadoVenta(ventaId) {
    const pagos = Logica.pagosDeVenta(ventaId);
    if (pagos.some(p => p.estado_verificacion === 'rechazada' && !p.resuelto_con)) return 'problema';
    if (pagos.some(p => p.estado_verificacion === 'pendiente')) return 'pendiente';
    return 'pagada';
  },
  textoPagos(ventaId) {
    return Logica.pagosDeVenta(ventaId).map(p => `${Formato.medio(p.medio_pago_id)} ${Formato.plata(p.monto)}${p.estado_verificacion && p.estado_verificacion !== 'verificada' ? ` (${ESTADOS_VERIFICACION[p.estado_verificacion].toLowerCase()})` : ''}`).join(' + ');
  },

  // Busca si un número de operación ya se usó en esa cuenta (en ventas o en cobros de fiado).
  _operacionUsada(medioId, numero) {
    const n = String(numero).trim();
    const enVenta = DB.todos('pagos_venta').find(p => p.medio_pago_id === medioId && p.numero_operacion === n);
    if (enVenta) return `la venta N.º ${enVenta.venta_id}`;
    const enCobro = DB.todos('pagos_clientes').find(p => p.medio_pago_id === medioId && p.numero_operacion === n);
    if (enCobro) return `un cobro a ${Logica.nombreCliente(enCobro.cliente_id)}`;
    return null;
  },
  nombreCliente(id) { const c = id ? DB.buscar('clientes', id) : null; return c ? c.nombre : ''; },

  // Arma los campos de un pago según su tipo. p: { medio_pago_id, monto, recibido, cupon, cuotas,
  // numero_operacion, titular, acreditada, autorizarRepetida, motivoAutorizacion, cliente_id }
  _armarPago(p, fechaHora) {
    const medio = DB.buscar('medios_pago', p.medio_pago_id);
    if (!medio || !medio.activo) throw error('Elegí un medio de pago activo.');
    if (!Number.isInteger(p.monto) || p.monto <= 0) throw error(`El monto de ${medio.nombre} tiene que ser mayor a 0, sin centavos.`);
    const fila = {
      medio_pago_id: medio.id, monto: p.monto, recibido: null, vuelto: null, cupon: null, cuotas: null,
      numero_operacion: null, titular: null, cliente_id: null,
      estado_verificacion: null, metodo_verificacion: null, verificado_por: null, verificado_en: null,
      motivo_rechazo: null, autorizado_por: null, motivo_autorizacion: null, resuelto_con: null
    };
    if (medio.tipo === 'efectivo' && p.recibido != null && !Number.isNaN(p.recibido)) {
      if (!Number.isInteger(p.recibido) || p.recibido < p.monto) throw error(`Con cuánto paga tiene que ser al menos ${Formato.plata(p.monto)}.`);
      fila.recibido = p.recibido;
      fila.vuelto = p.recibido - p.monto;
    }
    if (medio.tipo === 'debito' || medio.tipo === 'credito') {
      fila.cupon = String(p.cupon || '').trim() || null;
      if (medio.tipo === 'credito') {
        fila.cuotas = p.cuotas || 1;
        if (!Number.isInteger(fila.cuotas) || fila.cuotas < 1 || fila.cuotas > 24) throw error('Las cuotas tienen que ser entre 1 y 24.');
      }
    }
    if (medio.tipo === 'transferencia') {
      const numero = String(p.numero_operacion || '').trim();
      if (!numero) throw error(`Cargá el número de operación de ${medio.nombre}.`);
      const usada = Logica._operacionUsada(medio.id, numero);
      if (usada) {
        if (!p.autorizarRepetida) throw error(`El número de operación ${numero} ya se usó en ${usada}.`, 'OPERACION_REPETIDA');
        if (!Logica.esAdminActual()) throw error('Solo el administrador puede autorizar un número de operación repetido.');
        if (!String(p.motivoAutorizacion || '').trim()) throw error('Escribí por qué se autoriza el número repetido.');
        fila.autorizado_por = Logica.usuarioActualId;
        fila.motivo_autorizacion = String(p.motivoAutorizacion).trim();
      }
      const t = Logica.config('transferencias');
      if (p.acreditada && !Logica.puedeVerificar()) throw error('No tenés permiso para verificar transferencias. Pedíselo al administrador.');
      if (!p.acreditada && t.modo === 'antes' && !Logica.esAdminActual()) {
        throw error('Antes de confirmar, verificá en la cuenta del negocio que la transferencia esté acreditada y marcalo.');
      }
      fila.numero_operacion = numero;
      fila.titular = String(p.titular || '').trim() || null;
      Object.assign(fila, p.acreditada
        ? { estado_verificacion: 'verificada', metodo_verificacion: 'manual', verificado_por: Logica.usuarioActualId, verificado_en: fechaHora }
        : { estado_verificacion: 'pendiente' });
    }
    if (medio.tipo === 'cuenta') {
      const c = p.cliente_id ? DB.buscar('clientes', p.cliente_id) : null;
      if (!c || !c.activo) throw error('Para fiar, elegí el cliente.');
      fila.cliente_id = c.id;
    }
    return fila;
  },
  _historial(origen, pago, anterior, nuevo, fechaHora, motivo = null) {
    DB.insertar('verificaciones_pago', {
      origen, pago_id: pago.id, estado_anterior: anterior, estado_nuevo: nuevo, metodo: 'manual',
      usuario_id: Logica.usuarioActualId, fecha_hora: fechaHora, motivo
    });
  },
  _tablaDe(origen) { return origen === 'cobro' ? 'pagos_clientes' : 'pagos_venta'; },

  verificarPago(origen, id, fechaHora = Fechas.ahora()) {
    if (!Logica.puedeVerificar()) throw error('No tenés permiso para verificar transferencias.');
    return DB.transaccion(() => {
      const p = DB.buscar(Logica._tablaDe(origen), id);
      if (!p || p.estado_verificacion !== 'pendiente') throw error('Esa transferencia ya no está pendiente.');
      Object.assign(p, { estado_verificacion: 'verificada', metodo_verificacion: 'manual', verificado_por: Logica.usuarioActualId, verificado_en: fechaHora });
      Logica._historial(origen, p, 'pendiente', 'verificada', fechaHora);
      return p;
    });
  },
  // Rechazar (o revertir una verificada) es solo del administrador, y siempre con motivo.
  rechazarPago(origen, id, motivo, fechaHora = Fechas.ahora()) {
    if (!Logica.esAdminActual()) throw error('Solo el administrador puede rechazar transferencias.');
    const m = String(motivo || '').trim();
    if (!m) throw error('Escribí el motivo del rechazo.');
    return DB.transaccion(() => {
      const p = DB.buscar(Logica._tablaDe(origen), id);
      if (!p || !['pendiente', 'verificada'].includes(p.estado_verificacion)) throw error('Esa transferencia ya fue rechazada.');
      const anterior = p.estado_verificacion;
      Object.assign(p, { estado_verificacion: 'rechazada', metodo_verificacion: 'manual', verificado_por: Logica.usuarioActualId, verificado_en: fechaHora, motivo_rechazo: m });
      Logica._historial(origen, p, anterior, 'rechazada', fechaHora, m);
      return p;
    });
  },
  // Un pago de venta rechazado se resuelve con un pago nuevo por el mismo monto (otro medio o fiado).
  resolverRechazo(pagoId, datos, fechaHora = Fechas.ahora()) {
    const rechazado = DB.buscar('pagos_venta', pagoId);
    if (!rechazado || rechazado.estado_verificacion !== 'rechazada' || rechazado.resuelto_con) throw error('Ese pago no está pendiente de resolver.');
    const medio = DB.buscar('medios_pago', datos.medio_pago_id);
    if (!medio) throw error('Elegí cómo se resuelve.');
    const caja = Logica.cajaAbierta();
    if (!caja && medio.tipo !== 'cuenta') throw error('Abrí la caja para cobrar.');
    return DB.transaccion(() => {
      const fila = Logica._armarPago({ ...datos, monto: rechazado.monto }, fechaHora);
      const nuevo = DB.insertar('pagos_venta', { ...fila, venta_id: rechazado.venta_id, caja_id: caja ? caja.id : null, fecha_hora: fechaHora, usuario_id: Logica.usuarioActualId });
      rechazado.resuelto_con = nuevo.id;
      if (medio.tipo === 'cuenta') DB.buscar('ventas', rechazado.venta_id).cliente_id = fila.cliente_id;
      return nuevo;
    });
  },

  // Lista unificada de transferencias (de ventas y de cobros de fiado) para la pantalla de verificación.
  transferencias({ estado = null, medioId = null, desde = null, hasta = null, texto = '' } = {}) {
    const ahora = Fechas.ahora();
    const minutos = fh => Math.max(0, Math.round((new Date(ahora) - new Date(fh)) / 60000));
    const filas = [
      ...DB.todos('pagos_venta').map(p => ({ origen: 'venta', pago: p, referencia: `Venta N.º ${p.venta_id}` })),
      ...DB.todos('pagos_clientes').map(p => ({ origen: 'cobro', pago: p, referencia: `Cobro de fiado: ${Logica.nombreCliente(p.cliente_id)}` }))
    ].filter(f => Logica.tipoDe(f.pago.medio_pago_id) === 'transferencia')
      .map(f => ({ ...f, medio: DB.buscar('medios_pago', f.pago.medio_pago_id), cajero: Logica.nombreUsuario(f.pago.usuario_id),
        minutosPendiente: f.pago.estado_verificacion === 'pendiente' ? minutos(f.pago.fecha_hora) : null }));
    const t = normalizar(texto);
    return filas.filter(f =>
      (!estado || f.pago.estado_verificacion === estado) &&
      (!medioId || f.pago.medio_pago_id === medioId) &&
      (!desde || f.pago.fecha_hora.slice(0, 10) >= desde) &&
      (!hasta || f.pago.fecha_hora.slice(0, 10) <= hasta) &&
      (!t || normalizar(f.pago.numero_operacion).includes(t) || String(f.pago.monto) === t.replace(/\D/g, '') ||
        normalizar(f.pago.titular).includes(t) || normalizar(f.referencia).includes(t))
    ).sort((a, b) => b.pago.fecha_hora.localeCompare(a.pago.fecha_hora));
  },
  totalesTransferencias(filas) {
    const porCuenta = new Map();
    filas.forEach(f => {
      const t = porCuenta.get(f.medio.id) || { medio: f.medio, verificada: 0, pendiente: 0, rechazada: 0 };
      t[f.pago.estado_verificacion] += f.pago.monto;
      porCuenta.set(f.medio.id, t);
    });
    return [...porCuenta.values()];
  },
  historialPago(origen, id) {
    return DB.todos('verificaciones_pago').filter(h => h.origen === origen && h.pago_id === id).sort((a, b) => a.id - b.id);
  },

  // Totales por medio de pago: pagos de ventas y cobros de fiado, con transferencias separadas por estado.
  _porMedio(pagos, cobros) {
    return Logica.mediosPago().map(m => {
      const de = lista => lista.filter(p => p.medio_pago_id === m.id);
      const dato = lista => {
        const validos = lista.filter(p => p.estado_verificacion !== 'rechazada');
        return {
          cantidad: validos.length,
          total: validos.reduce((s, p) => s + p.monto, 0),
          verificado: lista.filter(p => p.estado_verificacion === 'verificada').reduce((s, p) => s + p.monto, 0),
          pendiente: lista.filter(p => p.estado_verificacion === 'pendiente').reduce((s, p) => s + p.monto, 0),
          rechazado: lista.filter(p => p.estado_verificacion === 'rechazada').reduce((s, p) => s + p.monto, 0)
        };
      };
      return { medio: m, ventas: dato(de(pagos)), cobros: dato(de(cobros)) };
    }).filter(x => x.medio.activo || x.ventas.cantidad || x.cobros.cantidad || x.ventas.rechazado || x.cobros.rechazado);
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
  // Deuda = lo fiado (pagos de tipo fiado) menos lo que pagó (sin contar transferencias rechazadas).
  saldoCliente(id) {
    const compras = DB.todos('pagos_venta').filter(p => p.cliente_id === id && Logica.tipoDe(p.medio_pago_id) === 'cuenta').reduce((s, p) => s + p.monto, 0);
    const pagos = DB.todos('pagos_clientes').filter(p => p.cliente_id === id && p.estado_verificacion !== 'rechazada').reduce((s, p) => s + p.monto, 0);
    return compras - pagos;
  },
  estadoCuenta(id) {
    const compras = DB.todos('pagos_venta').filter(p => p.cliente_id === id && Logica.tipoDe(p.medio_pago_id) === 'cuenta').map(p => {
      const v = DB.buscar('ventas', p.venta_id);
      return { fecha_hora: p.fecha_hora, tipo: 'compra', monto: p.monto,
        detalle: `Compra N.º ${v.id}${p.monto !== v.total ? ` (fiado ${Formato.plata(p.monto)} de ${Formato.plata(v.total)})` : ''}: ${Logica.detalleTexto(v.id)}` };
    });
    const pagos = DB.todos('pagos_clientes').filter(p => p.cliente_id === id).map(p => ({
      fecha_hora: p.fecha_hora, tipo: p.estado_verificacion === 'rechazada' ? 'rechazado' : 'pago', monto: p.monto, estado: p.estado_verificacion,
      detalle: `Pago en ${Formato.medio(p.medio_pago_id).toLowerCase()}${p.numero_operacion ? `, operación ${p.numero_operacion}` : ''}${p.estado_verificacion === 'pendiente' ? ' (transferencia sin verificar)' : ''}${p.estado_verificacion === 'rechazada' ? ` (RECHAZADA: ${p.motivo_rechazo})` : ''}`
    }));
    let saldo = 0;
    return [...compras, ...pagos]
      .sort((a, b) => a.fecha_hora.localeCompare(b.fecha_hora) || (a.tipo === 'compra' ? -1 : 1))
      .map(m => { if (m.tipo === 'compra') saldo += m.monto; else if (m.tipo === 'pago') saldo -= m.monto; return { ...m, saldo }; })
      .reverse();
  },
  deudores() {
    return Logica.clientesActivos().map(c => ({ cliente: c, saldo: Logica.saldoCliente(c.id) }))
      .filter(x => x.saldo > 0).sort((a, b) => b.saldo - a.saldo);
  },
  // Cobro de una deuda de fiado. datos: { monto, medio_pago_id, numero_operacion, titular, acreditada, ... }
  registrarPago(clienteId, datos, fechaHora = Fechas.ahora()) {
    const caja = Logica.cajaAbierta();
    if (!caja) throw error('Abrí la caja para registrar cobros.');
    const c = DB.buscar('clientes', clienteId);
    if (!c) throw error('El cliente no existe.');
    if (Logica.tipoDe(datos.medio_pago_id) === 'cuenta') throw error('Elegí cómo pagó.');
    const saldo = Logica.saldoCliente(clienteId);
    if (datos.monto > saldo) throw error(`${c.nombre} debe ${Formato.plata(saldo)}. No puede pagar más que eso.`);
    return DB.transaccion(() => {
      const fila = Logica._armarPago(datos, fechaHora);
      const pago = DB.insertar('pagos_clientes', { ...fila, cliente_id: clienteId, caja_id: caja.id, fecha_hora: fechaHora, usuario_id: Logica.usuarioActualId });
      if (pago.estado_verificacion === 'verificada') Logica._historial('cobro', pago, null, 'verificada', fechaHora);
      return pago;
    });
  },

  // ---------- Ventas ----------
  // items: [{ producto_id, cantidad }]
  // opciones: { pagos: [ver _armarPago], forzarLimite, fechaHora }. La suma de los pagos tiene que dar el total.
  registrarVenta(items, { pagos = [], forzarLimite = false, fechaHora = Fechas.ahora() } = {}) {
    const caja = Logica.cajaAbierta();
    if (!caja) throw error('Abrí la caja antes de vender.');
    if (!pagos.length) throw error('Agregá al menos un pago.');

    const fecha = fechaHora.slice(0, 10);
    const agrupado = new Map();
    items.forEach(it => agrupado.set(it.producto_id, (agrupado.get(it.producto_id) || 0) + it.cantidad));
    if (!agrupado.size) throw error('Agregá al menos un producto.');

    return DB.transaccion(() => {
      const venta = DB.insertar('ventas', {
        caja_id: caja.id, usuario_id: Logica.usuarioActualId, fecha_hora: fechaHora,
        cliente_id: null, total: 0, ganancia: 0
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

      // Pagos: tienen que cubrir exactamente el total
      const suma = pagos.reduce((s, p) => s + (p.monto || 0), 0);
      if (suma !== venta.total) {
        throw error(`Los pagos suman ${Formato.plata(suma)} y el total es ${Formato.plata(venta.total)}.`, 'PAGOS_NO_CIERRAN');
      }
      const filas = pagos.map(p => Logica._armarPago(p, fechaHora));
      const clientes = [...new Set(filas.filter(f => f.cliente_id).map(f => f.cliente_id))];
      if (clientes.length > 1) throw error('Una venta solo puede fiarse a un cliente.');
      filas.forEach(f => {
        const pago = DB.insertar('pagos_venta', { ...f, venta_id: venta.id, caja_id: caja.id, fecha_hora: fechaHora, usuario_id: Logica.usuarioActualId });
        if (pago.estado_verificacion === 'verificada') Logica._historial('venta', pago, null, 'verificada', fechaHora);
      });
      if (clientes.length) {
        const cliente = DB.buscar('clientes', clientes[0]);
        venta.cliente_id = cliente.id;
        const saldoNuevo = Logica.saldoCliente(cliente.id); // ya incluye esta venta
        if (cliente.limite_credito != null && !forzarLimite && saldoNuevo > cliente.limite_credito) {
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
      porCategoria: [...porCategoria.values()].sort((a, b) => b.vendido - a.vendido),
      porProducto: [...porProducto.values()].sort((a, b) => b.vendido - a.vendido)
    };
  },

  // ---------- Informes ----------
  informe(desde, hasta) {
    const enRango = fh => fh.slice(0, 10) >= desde && fh.slice(0, 10) <= hasta;
    const ventas = DB.todos('ventas').filter(v => enRango(v.fecha_hora));
    const agregado = Logica._agregarVentas(ventas);
    const ids = new Set(ventas.map(v => v.id));
    const pagos = DB.todos('pagos_venta').filter(p => ids.has(p.venta_id));
    const cobros = DB.todos('pagos_clientes').filter(p => enRango(p.fecha_hora));
    return {
      ...agregado,
      porMedio: Logica._porMedio(pagos, cobros),
      ticketPromedio: agregado.cantidad ? Math.round(agregado.total / agregado.cantidad) : 0,
      cobrosTotal: cobros.filter(p => p.estado_verificacion !== 'rechazada').reduce((s, p) => s + p.monto, 0)
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

  // ---------- Notificaciones ----------
  // Cada aviso tiene una clave estable para saber si ya se vio.
  notificaciones() {
    const hoy = Fechas.hoy();
    const lista = [];
    const caja = Logica.cajaAbierta();
    if (caja && caja.fecha_apertura.slice(0, 10) < hoy) {
      lista.push({
        clave: `caja-${caja.id}`, tipo: 'caja', etiqueta: 'Caja',
        titulo: `La caja sigue abierta desde el ${Formato.fecha(caja.fecha_apertura)}`,
        detalle: 'Cerrala para tener el arqueo de ese día.'
      });
    }
    const a = Logica.avisos();
    a.vencidos.forEach(x => lista.push({
      clave: `vencido-${x.lote.id}`, tipo: 'vencido', etiqueta: 'Vencido', productoId: x.producto.id,
      titulo: x.producto.nombre,
      detalle: `${Formato.cantidad(x.producto, x.lote.cantidad_actual)} del lote ${x.lote.id}, ${Formato.vence(x.dias)}`
    }));
    a.porVencer.forEach(x => lista.push({
      clave: `por-vencer-${x.lote.id}`, tipo: 'por-vencer', etiqueta: 'Por vencer', productoId: x.producto.id,
      titulo: x.producto.nombre,
      detalle: `${Formato.cantidad(x.producto, x.lote.cantidad_actual)} del lote ${x.lote.id}, ${Formato.vence(x.dias)}`
    }));
    a.pocoStock.forEach(x => lista.push({
      clave: `stock-${x.producto.id}-${x.stock}`, tipo: 'stock', etiqueta: x.stock ? 'Poco stock' : 'Sin stock', productoId: x.producto.id,
      titulo: x.producto.nombre,
      detalle: x.stock ? `Quedan ${Formato.cantidad(x.producto, x.stock)}, el mínimo es ${Formato.cantidad(x.producto, x.producto.stock_minimo)}` : 'No queda stock para vender'
    }));
    Logica.deudores()
      .filter(d => d.cliente.limite_credito != null && d.saldo > d.cliente.limite_credito)
      .forEach(d => lista.push({
        clave: `limite-${d.cliente.id}-${d.saldo}`, tipo: 'limite', etiqueta: 'Fiado', clienteId: d.cliente.id,
        titulo: d.cliente.nombre,
        detalle: `Debe ${Formato.plata(d.saldo)} y su límite es ${Formato.plata(d.cliente.limite_credito)}`
      }));
    // Transferencias que llevan más del tiempo configurado sin verificar
    const { minutosAviso } = Logica.config('transferencias');
    const hace = m => (m < 60 ? `hace ${m} min` : `hace ${Math.floor(m / 60)} h ${m % 60} min`);
    Logica.transferencias({ estado: 'pendiente' }).filter(f => f.minutosPendiente >= minutosAviso).forEach(f => lista.push({
      clave: `transf-${f.origen}-${f.pago.id}`, tipo: 'transferencia', etiqueta: 'Transferencia sin verificar',
      titulo: `${Formato.plata(f.pago.monto)} en ${f.medio.nombre}`,
      detalle: `${f.referencia}, operación ${f.pago.numero_operacion}, ${hace(f.minutosPendiente)}`
    }));
    // Ventas con una transferencia rechazada que todavía no se resolvió
    DB.todos('ventas').filter(v => Logica.estadoVenta(v.id) === 'problema').forEach(v => lista.push({
      clave: `problema-${v.id}`, tipo: 'problema', etiqueta: 'Pago rechazado',
      titulo: `Venta N.º ${v.id}`, detalle: 'Tiene una transferencia rechazada sin resolver.'
    }));
    return lista;
  },

  notificacionesNuevas(lista = Logica.notificaciones()) {
    const vistas = new Set(DB.data.config.notifVistas || []);
    return lista.filter(n => !vistas.has(n.clave));
  },

  marcarNotificacionesVistas(lista = Logica.notificaciones()) {
    // Solo se guardan las claves vigentes, así la lista no crece para siempre.
    DB.data.config.notifVistas = lista.map(n => n.clave);
    DB.guardar();
  },

  // ---------- Configuración del negocio, la impresora y la balanza ----------
  CONFIG_INICIAL: {
    negocio: { nombre: 'Almacén', direccion: '', telefono: '', cuit: '', pie: '¡Gracias por su compra!' },
    ticket: { ancho: 80, alVender: 'preguntar', copias: 1 },
    balanza: { activa: false, prefijo: '20', digitosPlu: 5, valor: 'peso' },
    transferencias: { modo: 'antes', vendedorVerifica: true, minutosAviso: 10 }
  },
  config(seccion) {
    const guardada = (DB.data.config && DB.data.config[seccion]) || {};
    return { ...Logica.CONFIG_INICIAL[seccion], ...guardada };
  },
  guardarConfig(seccion, datos) {
    const c = { ...Logica.config(seccion), ...datos };
    if (seccion === 'negocio') {
      c.nombre = String(c.nombre || '').trim();
      if (!c.nombre) throw error('Ingresá el nombre del negocio.');
      ['direccion', 'telefono', 'cuit', 'pie'].forEach(k => { c[k] = String(c[k] || '').trim(); });
    }
    if (seccion === 'ticket') {
      if (![58, 80].includes(c.ancho)) throw error('Elegí el ancho del papel.');
      if (!['preguntar', 'siempre', 'nunca'].includes(c.alVender)) throw error('Elegí qué hacer al vender.');
      if (![1, 2].includes(c.copias)) throw error('Las copias pueden ser 1 o 2.');
    }
    if (seccion === 'balanza') {
      if (!/^2\d?$/.test(c.prefijo)) throw error('El prefijo de balanza es 2 o dos dígitos que empiezan con 2 (por ejemplo 20).');
      const valor = 12 - c.prefijo.length - c.digitosPlu;
      if (!Number.isInteger(c.digitosPlu) || c.digitosPlu < 4 || c.digitosPlu > 6 || valor < 4 || valor > 6) {
        throw error('Con ese prefijo, el código de producto (PLU) tiene que tener entre 4 y 6 dígitos y dejar lugar para el peso o el importe.');
      }
      if (!['peso', 'importe'].includes(c.valor)) throw error('Elegí si la etiqueta trae el peso o el importe.');
    }
    if (seccion === 'transferencias') {
      if (!['antes', 'libre'].includes(c.modo)) throw error('Elegí cuándo se verifican las transferencias.');
      if (!Number.isInteger(c.minutosAviso) || c.minutosAviso < 1 || c.minutosAviso > 240) throw error('El aviso tiene que ser entre 1 y 240 minutos.');
      c.vendedorVerifica = !!c.vendedorVerifica;
    }
    return DB.transaccion(() => { DB.data.config[seccion] = c; return c; });
  },

  // ---------- Códigos de barras ----------
  digitoControlEAN(doceDigitos) {
    const suma = doceDigitos.split('').reduce((s, d, i) => s + Number(d) * (i % 2 ? 3 : 1), 0);
    return String((10 - (suma % 10)) % 10);
  },
  ean13Valido(codigo) {
    return /^\d{13}$/.test(codigo) && Logica.digitoControlEAN(codigo.slice(0, 12)) === codigo[12];
  },

  // Interpreta lo que manda el lector: un código de producto o una etiqueta de balanza (EAN-13 de peso variable).
  // Devuelve { producto, cantidad (o null), balanza, detalle } o { error }.
  interpretarCodigo(texto) {
    const codigo = String(texto || '').replace(/\s/g, '');
    if (!codigo) return { error: 'Código vacío.' };
    const exacto = Logica.productoPorCodigo(codigo);
    if (exacto) return { producto: exacto, cantidad: null, balanza: false, codigo };

    const b = Logica.config('balanza');
    if (b.activa && /^\d{13}$/.test(codigo) && codigo.startsWith(b.prefijo)) {
      if (!Logica.ean13Valido(codigo)) return { error: 'La etiqueta de balanza no se leyó bien (dígito de control incorrecto). Volvé a escanearla.', codigo };
      const plu = codigo.slice(b.prefijo.length, b.prefijo.length + b.digitosPlu);
      const valor = Number(codigo.slice(b.prefijo.length + b.digitosPlu, 12));
      const producto = Logica.productosActivos().find(p => p.codigo && p.tipo_medida === 'peso' && Number(p.codigo) === Number(plu));
      if (!producto) return { error: `La etiqueta es del PLU ${plu}, pero no hay un producto por peso con ese código.`, codigo, plu };
      // Peso en gramos, o importe en pesos que se convierte a gramos con el precio por kilo
      const cantidad = b.valor === 'peso' ? valor : Math.round(valor * 1000 / producto.precio_venta);
      if (!(cantidad > 0)) return { error: 'La etiqueta de balanza trae peso o importe en cero.', codigo };
      return { producto, cantidad, balanza: true, codigo,
        detalle: b.valor === 'peso' ? `${Formato.numero(valor)} g` : `${Formato.plata(valor)} (${Formato.numero(cantidad)} g)` };
    }
    return { error: `No hay ningún producto con el código ${codigo}.`, codigo, desconocido: true };
  },

  // Datos ya calculados para imprimir el ticket de una venta.
  datosTicket(ventaId) {
    const v = DB.buscar('ventas', ventaId);
    const renglones = DB.todos('detalle_venta').filter(d => d.venta_id === ventaId).map(d => {
      const p = DB.buscar('productos', d.producto_id);
      return { nombre: p.nombre, detalle: `${Formato.cantidad(p, d.cantidad)} x ${Formato.plata(d.precio_unitario)}${p.tipo_medida === 'peso' ? '/kg' : ''}`,
        subtotal: Logica.subtotal(p, d.precio_unitario, d.cantidad), mayorista: d.es_mayorista };
    });
    const cliente = v.cliente_id ? DB.buscar('clientes', v.cliente_id) : null;
    // En el ticket solo van los pagos válidos: un pago rechazado ya fue reemplazado por otro
    const pagos = Logica.pagosDeVenta(ventaId).filter(p => p.estado_verificacion !== 'rechazada').map(p => ({
      nombre: Formato.medio(p.medio_pago_id), tipo: Logica.tipoDe(p.medio_pago_id), monto: p.monto,
      recibido: p.recibido, vuelto: p.vuelto, cuotas: p.cuotas, estado: p.estado_verificacion
    }));
    return { venta: v, renglones, pagos, cliente, saldoCliente: cliente ? Logica.saldoCliente(cliente.id) : null,
      atendio: Logica.nombreUsuario(v.usuario_id), negocio: Logica.config('negocio') };
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

  const usuarioBase = { activo: true, protegido: false, acceso_hasta: null, debe_cambiar_clave: false, codigo_recuperacion_hash: null, email: null, email_verificado_en: null };
  // Código de recuperación del administrador de ejemplo: RECU-PERA-2026 (en la realidad se genera al azar y se imprime)
  const admin = DB.insertar('usuarios', { ...usuarioBase, nombre: 'Administrador', usuario: 'admin', clave_hash: hashClave('admin123', 'admin'), rol: 'admin', fecha_alta: dia(-60), email: 'admin@ejemplo.com',
    codigo_recuperacion_hash: hashClave(normalizarCodigo('RECU-PERA-2026'), 'recuperacion:admin') });
  const laura = DB.insertar('usuarios', { ...usuarioBase, nombre: 'Laura', usuario: 'laura', clave_hash: hashClave('laura123', 'laura'), rol: 'vendedor', fecha_alta: dia(-30) });
  // Usuario del desarrollador: protegido (no se borra) y deshabilitado hasta que el administrador lo habilite
  DB.insertar('usuarios', { ...usuarioBase, nombre: 'Soporte técnico', usuario: 'soporte', clave_hash: hashClave('soporte123', 'soporte'), rol: 'soporte', protegido: true, fecha_alta: dia(-60), email: 'soporte@ejemplo.com' });
  Logica.usuarioActualId = admin.id;

  // Medios de pago del negocio: cada cuenta y cada posnet es un medio aparte
  const medio = (nombre, tipo, orden) => DB.insertar('medios_pago', { nombre, tipo, activo: true, orden });
  const mEfectivo = medio('Efectivo', 'efectivo', 1);
  const mDebito = medio('Débito Payway', 'debito', 2);
  medio('Crédito Payway', 'credito', 3);
  const mNacion = medio('Transferencia Banco Nación', 'transferencia', 4);
  const mMP = medio('Transferencia Mercado Pago', 'transferencia', 5);
  const mFiado = medio('Fiado', 'cuenta', 6);
  // Mientras se cargan los ejemplos se permiten transferencias pendientes; al final queda la regla recomendada
  DB.data.config.transferencias = { ...Logica.CONFIG_INICIAL.transferencias, modo: 'libre' };

  const cat = {};
  ['Almacén', 'Bebidas', 'Fiambrería', 'Lácteos', 'Panificados', 'Servicios'].forEach(n => { cat[n] = DB.insertar('categorias', { nombre: n }); });

  const producto = (nombre, codigo, categoria, tipo, costo, precio, minimo, extra = {}) => DB.insertar('productos', {
    nombre, codigo, categoria_id: cat[categoria].id, tipo_medida: tipo, controla_stock: true, costo,
    porcentaje: Logica.porcentajeDesdePrecio(costo, precio), precio_venta: precio,
    precio_mayorista: null, cantidad_mayorista: null, stock_minimo: minimo, activo: true, ...extra
  });
  const lote = (p, cantidad, vence, ingreso) => DB.insertar('lotes', {
    producto_id: p.id, cantidad_inicial: cantidad, cantidad_actual: cantidad,
    costo: p.costo, fecha_vencimiento: dia(vence), fecha_ingreso: dia(ingreso), usuario_id: admin.id
  });

  const leche = producto('Leche entera 1 L', '7790001000011', 'Lácteos', 'unidad', 1000, 1300, 6);
  const queso = producto('Queso cremoso', '00101', 'Fiambrería', 'peso', 8000, 11200, 500); // 00101 = PLU de la balanza
  DB.data.config.balanza = { ...Logica.CONFIG_INICIAL.balanza, activa: true };
  DB.data.config.negocio = { ...Logica.CONFIG_INICIAL.negocio, nombre: 'Almacén Don Pepe', direccion: 'Av. Siempreviva 742', telefono: '381 555-0100' };
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

  // pagos: función que recibe el total y devuelve la lista de pagos
  const totalDe = items => items.reduce((s, [p, c]) => s + Logica.subtotal(p, Logica.precioPara(p, c).precio, c), 0);
  const vender = (n, hora, items, pagos = t => [{ medio_pago_id: mEfectivo.id, monto: t }]) => Logica.registrarVenta(
    items.map(([p, cantidad]) => ({ producto_id: p.id, cantidad })),
    { pagos: pagos(totalDe(items)), fechaHora: momento(n, hora), forzarLimite: true }
  );
  const fiado = cliente => t => [{ medio_pago_id: mFiado.id, monto: t, cliente_id: cliente.id }];
  const cerrar = (n, faltante = 0) => {
    const esperado = Logica.resumenCaja(Logica.cajaAbierta()).efectivoEsperado;
    Logica.cerrarCaja(esperado - faltante, faltante ? 'Faltó plata, revisar vueltos' : '', momento(n, '21:00'));
  };

  // Hace 5 días
  Logica.abrirCaja(20000, momento(-5, '08:00'));
  vender(-5, '09:40', [[leche, 5], [yerba, 3], [fideos, 3], [galletitas, 4]]);
  cerrar(-5);

  // Hace 3 días: atiende Laura
  Logica.usuarioActualId = laura.id;
  Logica.abrirCaja(20000, momento(-3, '08:00'));
  vender(-3, '10:10', [[leche, 4], [pan, 6]]);
  vender(-3, '18:15', [[queso, 500]], fiado(marta));
  Logica.registrarMovimiento({ tipo: 'salida', motivo: 'pago_proveedor', monto: 9000, descripcion: 'Panadería' }, momento(-3, '11:00'));
  cerrar(-3, 500);

  // Ayer
  Logica.usuarioActualId = admin.id;
  Logica.abrirCaja(20000, momento(-1, '08:00'));
  vender(-1, '11:20', [[yerba, 2], [fideos, 2], [gaseosa, 6]], t => [{ medio_pago_id: mDebito.id, monto: t, cupon: '000231' }]);
  vender(-1, '16:40', [[fideos, 1]], t => [{ medio_pago_id: mMP.id, monto: t, numero_operacion: '1029384756', titular: 'Ana Ruiz', acreditada: true }]);
  vender(-1, '19:05', [[queso, 300], [galletitas, 2]], fiado(raul));
  // Una transferencia que nunca llegó: queda rechazada y sin resolver
  const falsa = vender(-1, '20:10', [[recarga, 1]], t => [{ medio_pago_id: mNacion.id, monto: t, numero_operacion: '33445566', titular: 'Sin datos' }]);
  Logica.rechazarPago('venta', Logica.pagosDeVenta(falsa.id)[0].id, 'No se acreditó en la cuenta', momento(-1, '20:45'));
  cerrar(-1);

  // Hoy: la caja queda abierta
  Logica.abrirCaja(20000, momento(0, '08:00'));
  vender(0, '09:30', [[leche, 2], [queso, 300], [recarga, 1]]);
  // Pago mixto: una parte por transferencia (todavía sin verificar) y el resto en efectivo
  Logica.usuarioActualId = laura.id;
  vender(0, '10:05', [[yerba, 1], [pan, 1]], t => [
    { medio_pago_id: mNacion.id, monto: 5000, numero_operacion: '48291037', titular: 'Juan Pérez' },
    { medio_pago_id: mEfectivo.id, monto: t - 5000, recibido: 2000 }
  ]);
  Logica.registrarPago(marta.id, { monto: 3000, medio_pago_id: mEfectivo.id }, momento(0, '10:30'));
  Logica.registrarPago(raul.id, { monto: 2000, medio_pago_id: mMP.id, numero_operacion: '5566778899', titular: 'Raúl Díaz' }, momento(0, '10:45'));
  DB.data.config.transferencias = { ...Logica.CONFIG_INICIAL.transferencias };
  Logica.usuarioActualId = null;
}
