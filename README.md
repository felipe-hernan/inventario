# Sistema para almacén: versión con Bootstrap 5

Es la misma demo del sistema (ventas, caja, fiado, stock con vencimientos, informes, usuarios), con toda la parte visual hecha con **Bootstrap 5.3** y **Bootstrap Icons**. Sirve para comparar con la versión de CSS propio antes de elegir el estilo de la versión definitiva en ASP.NET MVC.

Usuarios de prueba: `admin` / `admin123` y `laura` / `laura123`.

## Qué cambia y qué no

- **No cambia:** las reglas de negocio son las mismas. `js/logica.js` solo suma la configuración, la lectura de etiquetas de balanza y los datos del ticket.
- **Cambia:** todo el HTML de las pantallas usa componentes de Bootstrap.

| Pieza | Componente de Bootstrap |
|---|---|
| Barra lateral que en el celular se vuelve menú deslizable | `offcanvas-lg` |
| Barra superior en el celular | `navbar` |
| Formularios emergentes (cobro, producto, cliente, caja…) | `modal` |
| Campana de notificaciones | `dropdown` |
| Avisos flotantes | `toast` |
| Pestañas de Mercadería | `nav-tabs` |
| Medios de pago | `btn-check` (radios con forma de botón) |
| Precio por mayor | `accordion` |
| Ventas por categoría | `progress` |
| Tarjetas, tablas, insignias, alertas, interruptores | `card`, `table`, `badge`, `alert`, `form-switch` |
| Modo oscuro | color modes de Bootstrap 5.3 (`data-bs-theme`) |

`css/tema.css` solo cambia los colores a los de la marca (verde y mostaza) y agrega las piezas propias que Bootstrap no trae: el ticket con borde de papel, el estado de la caja y el centrado en monitores anchos. **Si se quita ese archivo, se ve el Bootstrap original.**

## Lector de código de barras, ticketera y balanza

Se configura en **Configuración** (solo administrador).

**Lector.** Cualquier lector USB en modo teclado (HID) que termine con Enter: Honeywell Voyager 1200g, Zebra LS2208, Zebra DS2208 (lee QR) o genéricos como Gadnic y Netmak. No necesita driver.
- En **Vender**, cada escaneo agrega el producto al ticket. Si se escanea desde otra pantalla con la caja abierta, el sistema va solo a Vender.
- Si el código no existe, el administrador puede crear el producto con ese código en un toque.
- En **Mercadería** el escaneo elige el producto a ingresar, y en **Productos** abre su ficha.
- El sistema distingue un escaneo de alguien tipeando por la velocidad de las teclas.

**Ticketera.** Cualquier impresora térmica de 58 u 80 mm con su driver instalado: Xprinter XP-80T, Gadnic IMPTER54, Epson TM-T20II o TM-T88V, Star TSP143III.
- El ticket se arma con el ancho del papel y se imprime por el diálogo del navegador.
- Al vender, puede imprimir siempre, preguntar o no imprimir.
- Se puede reimprimir el último ticket desde Vender, cualquier venta desde Informes y el cierre de caja desde Caja.
- Para imprimir sin el diálogo, abrir Chrome con `--kiosk-printing`.
- El ticket dice «Comprobante no válido como factura»: la factura electrónica con CAE de ARCA es otro tema, que se resuelve aparte.

**Balanza etiquetadora** (Systel, Kretz y otras). Lee el EAN-13 de peso variable: prefijo (20) + PLU + peso en gramos o importe + dígito de control.
- El PLU se carga en el campo Código del producto por peso.
- En los datos de ejemplo, el queso tiene el PLU `00101`: la etiqueta `2000101003502` equivale a 350 g de queso.

## Estructura (pensada para pasar a ASP.NET MVC)

```
index.html                         Equivale a _Layout.cshtml
lib/bootstrap/dist/                Igual que wwwroot/lib/bootstrap en una plantilla de ASP.NET
lib/bootstrap-icons/font/          Íconos
css/tema.css                       Equivale a wwwroot/css/site.css
js/db.js, js/logica.js             En MVC pasan al servidor (modelos, servicios y controladores)
js/ui.js                           Piezas compartidas (en Razor serían partial views o tag helpers)
js/hardware.js                     Lector de código de barras e impresora de tickets
js/vistas/*.js                     Una pantalla por archivo (en MVC, una vista .cshtml por acción)
docs/modelo.sql                    Modelo de base de datos
```

## Publicarla junto a la otra versión

Para comparar las dos desde el mismo link, subí esta carpeta dentro del repositorio como `bootstrap/`:

- Versión de CSS propio: `https://TU-USUARIO.github.io/TU-REPO/`
- Versión con Bootstrap: `https://TU-USUARIO.github.io/TU-REPO/bootstrap/`

Las dos guardan los datos en el mismo navegador con la misma clave, así que comparten productos, ventas y usuarios.

## Licencias

Bootstrap y Bootstrap Icons tienen licencia MIT (ver `lib/*/LICENSE`).
