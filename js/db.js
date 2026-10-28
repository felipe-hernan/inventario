/*
 * Capa de datos de la demo.
 * Simula las tablas de la base de datos y las guarda en el navegador (localStorage).
 * Cuando el sistema tenga un backend real, este es el archivo que se reemplaza
 * por llamadas a la API. Ver docs/modelo.sql para la estructura de cada tabla.
 */
const DB = {
  CLAVE: 'sistema-stock-demo-v2',
  TABLAS: [
    'categorias', 'productos', 'lotes', 'ajustes_stock',
    'clientes', 'pagos_clientes',
    'cajas', 'movimientos_caja',
    'ventas', 'detalle_venta', 'detalle_venta_lote'
  ],
  data: null,

  vacio() {
    const data = { secuencias: {}, config: { diasAviso: 7 } };
    this.TABLAS.forEach(t => { data[t] = []; data.secuencias[t] = 0; });
    return data;
  },

  cargar() {
    try {
      localStorage.removeItem('sistema-stock-demo-v1'); // datos de la versión anterior de la demo
      const guardado = localStorage.getItem(this.CLAVE);
      this.data = guardado ? JSON.parse(guardado) : null;
    } catch (e) {
      this.data = null;
    }
    if (!this.data || !this.TABLAS.every(t => Array.isArray(this.data[t]))) {
      this.reiniciar(true);
    }
  },

  guardar() {
    try {
      localStorage.setItem(this.CLAVE, JSON.stringify(this.data));
    } catch (e) {
      // Sin localStorage la demo sigue funcionando en memoria.
    }
  },

  reiniciar(conEjemplo) {
    this.data = this.vacio();
    if (conEjemplo && typeof cargarEjemplo === 'function') cargarEjemplo();
    this.guardar();
  },

  todos(tabla) {
    return this.data[tabla];
  },

  buscar(tabla, id) {
    return this.data[tabla].find(f => f.id === id) || null;
  },

  insertar(tabla, fila) {
    this.data.secuencias[tabla] += 1;
    const nueva = { id: this.data.secuencias[tabla], ...fila };
    this.data[tabla].push(nueva);
    return nueva;
  },

  borrar(tabla, id) {
    this.data[tabla] = this.data[tabla].filter(f => f.id !== id);
  },

  // Varios cambios como una sola operación: si algo falla, se deshace todo.
  transaccion(fn) {
    const copia = JSON.stringify(this.data);
    try {
      const resultado = fn();
      this.guardar();
      return resultado;
    } catch (e) {
      this.data = JSON.parse(copia);
      throw e;
    }
  }
};
