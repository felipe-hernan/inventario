# Sistema para almacén (demo)

Demo de un sistema de gestión para almacén de barrio: ventas con lector de código de barras, caja con cierre y arqueo, fiado con estado de cuenta, stock por lotes con vencimientos e informes.

Es una página estática (HTML, CSS y JavaScript sin dependencias), lista para GitHub Pages.

## Qué incluye

| Pantalla | Qué hace |
|---|---|
| **Inicio** | Estado de la caja y los avisos: vencidos (con botón para sacarlos del stock), por vencer, poco stock y fiado a cobrar. |
| **Vender** | Escanear o buscar productos, armar el ticket y cobrar con efectivo (calcula el vuelto), débito, crédito, transferencia o fiado. Aplica el precio por mayor solo. Descuenta stock por FEFO y no vende vencidos. |
| **Clientes** | Fiado: saldo de cada cliente, estado de cuenta, cobros, límite de crédito y envío de la cuenta por WhatsApp. |
| **Productos** | Alta y edición con categoría, precio por mayor y la opción de no controlar stock (recargas, servicios). Administración de categorías e importación desde planilla CSV. |
| **Mercadería** | Ingreso de lotes con vencimiento, con opción de registrar el pago al proveedor desde la caja. Inventario valorizado, ajustes de stock e historial de movimientos de cada producto. |
| **Caja** | Apertura con dinero inicial, entradas y salidas de efectivo, cierre con arqueo (debería haber contra lo que se contó) e historial de cierres imprimibles. |
| **Informes** | Ventas por período: totales, ganancia, ticket promedio, por medio de pago, por categoría y por producto. |

La demo arranca con datos de ejemplo cuyas fechas se calculan desde el día en que se abre. Desde «Datos de la demo» se puede volver a ellos o empezar vacío.

## Publicar en GitHub Pages

1. Subir todo el contenido de esta carpeta a la raíz del repositorio, respetando las carpetas `css`, `js`, `js/vistas` y `docs`.
2. En **Settings → Pages**, elegir **Deploy from a branch**, la rama `main` y la carpeta `/ (root)`.
3. Esperar el tilde verde en la pestaña **Actions**. La página queda en `https://TU-USUARIO.github.io/NOMBRE-DEL-REPO/`.

Cada vez que se cambie un CSS o JS, hay que subir el número `?v=` en `index.html` para que los navegadores no usen la versión guardada.

## Estructura

```
index.html              Estructura y menú
css/estilos.css         Estilos (modo oscuro, celular e impresión)
js/db.js                Capa de datos: las tablas, guardadas en el navegador
js/logica.js            Reglas de negocio: caja, fiado, FEFO, precios, informes, importación
js/ui.js                Piezas compartidas de la interfaz
js/vistas/*.js          Una pantalla por archivo
js/app.js               Arranque y menú del celular
docs/modelo.sql         Modelo de base de datos para la versión con servidor
```

## Modelo de datos

Once tablas, descritas en `docs/modelo.sql`:

- **Catálogo:** `categorias`, `productos`.
- **Stock:** `lotes` (cada ingreso, con su vencimiento) y `ajustes_stock` (lo que sale sin venderse).
- **Fiado:** `clientes` y `pagos_clientes`. El saldo no se guarda: se calcula con las compras fiadas menos los pagos.
- **Caja:** `cajas` (cada turno, con su arqueo) y `movimientos_caja` (entradas y salidas de efectivo).
- **Ventas:** `ventas` (con medio de pago, caja y cliente), `detalle_venta` (renglones con el precio y costo del momento) y `detalle_venta_lote` (de qué lote salió cada cosa).

## Limitaciones de la demo

- Los datos viven en el navegador: cada dispositivo tiene los suyos y se pierden si se borra el historial.
- No hay usuarios ni contraseñas, ni anulación de ventas.
- Quedan para más adelante los kits o combos y las promociones.

## Pasar a la versión con servidor

`logica.js` se traslada al backend (por ejemplo, ASP.NET con Entity Framework) y `db.js` se reemplaza por llamadas a la API. Las pantallas casi no cambian.
