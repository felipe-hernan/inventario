# Sistema de stock para almacén (demo)

Versión de prueba de un sistema de control de stock: productos, ingreso de mercadería por lotes con vencimiento, ventas con descuento automático de stock, avisos e informe diario.

Es una página estática (HTML, CSS y JavaScript sin dependencias), así que se puede publicar directo en GitHub Pages.

## Qué se puede probar

- **Inicio:** caja del día y avisos de vencidos, por vencer y poco stock. Los días de anticipación del aviso se pueden cambiar.
- **Vender:** buscar productos, agregarlos al ticket (por unidad o por gramos) y confirmar. El stock se descuenta del lote que vence primero y no se venden lotes vencidos.
- **Productos:** alta y edición. El precio de venta se calcula con el costo y el porcentaje; si se edita a mano, se recalcula el porcentaje. Permite cargar stock inicial y dar de baja.
- **Ingresar mercadería:** cada línea crea un lote. Si el costo cambió, ofrece actualizar el precio manteniendo el porcentaje.
- **Informe de ventas:** cantidad de ventas, total, costo, ganancia y detalle por producto, para cualquier día.

La demo arranca con datos de ejemplo cuyas fechas se calculan a partir del día en que se abre, así siempre hay avisos para ver. Desde «Datos de la demo» se puede volver a los datos de ejemplo o empezar vacío.

## Publicar en GitHub Pages

1. Crear un repositorio nuevo en GitHub (por ejemplo, `stock-almacen`).
2. Subir todo el contenido de esta carpeta a la raíz del repositorio (con «Add file → Upload files» o con git).
3. En el repositorio, ir a **Settings → Pages**.
4. En **Build and deployment**, elegir **Deploy from a branch**, la rama `main` y la carpeta `/ (root)`. Guardar.
5. Esperar uno o dos minutos. La página queda en `https://TU-USUARIO.github.io/stock-almacen/`.

Para probarla en la computadora sin publicarla, alcanza con abrir `index.html` en el navegador.

## Estructura

```
index.html        Estructura de la página
css/estilos.css   Estilos (incluye modo oscuro y versión para celular)
js/db.js          Capa de datos: simula las tablas y las guarda en el navegador
js/logica.js      Reglas de negocio: precios, lotes, FEFO, avisos, informe
js/app.js         Pantallas y eventos
```

Las tablas de `db.js` son las mismas del modelo de datos: `productos`, `lotes`, `ventas`, `detalle_venta`, `detalle_venta_lote` y `ajustes_stock` (esta última queda preparada para la versión completa).

## Limitaciones de la demo

- **Los datos viven en el navegador (localStorage).** Cada persona y cada dispositivo ven sus propios datos, y se pierden si se borra el historial del navegador. No sirve para uso real del almacén.
- **No hay usuarios ni contraseñas.**
- **Montos en pesos enteros.** El precio de los productos por peso es por kilo y el stock se cuenta en gramos.

## Pasar a la versión completa

Para usarlo de verdad hace falta un backend con base de datos (por ejemplo, ASP.NET con Entity Framework y SQL Server o PostgreSQL). La idea es que `logica.js` se traslade al servidor y `db.js` se reemplace por llamadas a la API: las pantallas de `app.js` casi no cambian.
