# Sistema para almacén: versión con Bootstrap 5

Es la misma demo del sistema (ventas, caja, fiado, stock con vencimientos, informes, usuarios), con toda la parte visual hecha con **Bootstrap 5.3** y **Bootstrap Icons**. Sirve para comparar con la versión de CSS propio antes de elegir el estilo de la versión definitiva en ASP.NET MVC.

Usuarios de prueba: `admin` / `admin123` y `laura` / `laura123`.

## Qué cambia y qué no

- **No cambia:** `js/db.js` y `js/logica.js` son exactamente los mismos. Todas las reglas de negocio son idénticas.
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

## Estructura (pensada para pasar a ASP.NET MVC)

```
index.html                         Equivale a _Layout.cshtml
lib/bootstrap/dist/                Igual que wwwroot/lib/bootstrap en una plantilla de ASP.NET
lib/bootstrap-icons/font/          Íconos
css/tema.css                       Equivale a wwwroot/css/site.css
js/db.js, js/logica.js             En MVC pasan al servidor (modelos, servicios y controladores)
js/ui.js                           Piezas compartidas (en Razor serían partial views o tag helpers)
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
