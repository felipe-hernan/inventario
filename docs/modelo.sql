-- =====================================================================
-- Sistema de stock para almacén: modelo de base de datos (versión 3, con usuarios)
-- Pensado para PostgreSQL. Montos en pesos enteros.
-- Productos por peso: stock y cantidades en gramos, precios por kilo.
-- =====================================================================

-- ---------- Usuarios ----------

-- No hay registro público: los usuarios los crea el administrador.
CREATE TABLE usuarios (
  id          SERIAL PRIMARY KEY,
  nombre      VARCHAR(100) NOT NULL,
  usuario     VARCHAR(20) NOT NULL UNIQUE,           -- en minúsculas, sin espacios
  clave_hash  VARCHAR(100) NOT NULL,                 -- en el servidor: bcrypt o Argon2, nunca la contraseña
  rol         VARCHAR(10) NOT NULL CHECK (rol IN ('admin', 'vendedor')),
  activo      BOOLEAN NOT NULL DEFAULT TRUE,
  fecha_alta  DATE NOT NULL DEFAULT CURRENT_DATE
);

-- ---------- Catálogo ----------

CREATE TABLE categorias (
  id      SERIAL PRIMARY KEY,
  nombre  VARCHAR(60) NOT NULL UNIQUE
);

CREATE TABLE productos (
  id                  SERIAL PRIMARY KEY,
  nombre              VARCHAR(120) NOT NULL,
  codigo              VARCHAR(30) UNIQUE,                 -- código de barras, opcional
  categoria_id        INT REFERENCES categorias(id) ON DELETE SET NULL,
  tipo_medida         VARCHAR(10) NOT NULL CHECK (tipo_medida IN ('unidad', 'peso')),
  controla_stock      BOOLEAN NOT NULL DEFAULT TRUE,      -- FALSE: recargas, servicios (sin lotes)
  costo               INT NOT NULL CHECK (costo > 0),
  porcentaje          NUMERIC(6,1) NOT NULL,              -- se recalcula desde costo y precio
  precio_venta        INT NOT NULL CHECK (precio_venta > 0),
  precio_mayorista    INT CHECK (precio_mayorista > 0),   -- opcional, va junto con cantidad_mayorista
  cantidad_mayorista  INT CHECK (cantidad_mayorista >= 2),
  stock_minimo        INT NOT NULL DEFAULT 0 CHECK (stock_minimo >= 0),  -- límite para el aviso, no es el stock
  activo              BOOLEAN NOT NULL DEFAULT TRUE,      -- baja lógica
  CHECK ((precio_mayorista IS NULL) = (cantidad_mayorista IS NULL)),
  CHECK (precio_mayorista IS NULL OR precio_mayorista < precio_venta)
);

-- ---------- Stock ----------

-- Cada ingreso de mercadería es un lote. El stock de un producto es la suma de cantidad_actual.
CREATE TABLE lotes (
  id                 SERIAL PRIMARY KEY,
  producto_id        INT NOT NULL REFERENCES productos(id) ON DELETE RESTRICT,
  cantidad_inicial   INT NOT NULL CHECK (cantidad_inicial > 0),
  cantidad_actual    INT NOT NULL CHECK (cantidad_actual >= 0),
  costo              INT NOT NULL CHECK (costo > 0),
  fecha_vencimiento  DATE NOT NULL,
  fecha_ingreso      DATE NOT NULL DEFAULT CURRENT_DATE,
  usuario_id         INT REFERENCES usuarios(id)          -- quién cargó la mercadería
);
CREATE INDEX ix_lotes_producto ON lotes(producto_id);
CREATE INDEX ix_lotes_vencimiento ON lotes(fecha_vencimiento);

-- Mercadería que sale sin venderse.
CREATE TABLE ajustes_stock (
  id        SERIAL PRIMARY KEY,
  lote_id   INT NOT NULL REFERENCES lotes(id) ON DELETE RESTRICT,
  cantidad  INT NOT NULL CHECK (cantidad > 0),
  motivo    VARCHAR(20) NOT NULL CHECK (motivo IN ('vencido', 'roto', 'perdida', 'consumo', 'conteo')),
  fecha     DATE NOT NULL DEFAULT CURRENT_DATE,
  usuario_id INT REFERENCES usuarios(id)
);

-- ---------- Clientes y fiado ----------

CREATE TABLE clientes (
  id              SERIAL PRIMARY KEY,
  nombre          VARCHAR(100) NOT NULL,
  telefono        VARCHAR(30),
  limite_credito  INT CHECK (limite_credito >= 0),   -- NULL = sin límite
  activo          BOOLEAN NOT NULL DEFAULT TRUE,
  fecha_alta      DATE NOT NULL DEFAULT CURRENT_DATE
);
-- El saldo no se guarda: compras fiadas (ventas con medio 'cuenta') menos pagos_clientes.

-- ---------- Caja ----------

-- Un turno de caja. Solo puede haber una abierta a la vez.
CREATE TABLE cajas (
  id                 SERIAL PRIMARY KEY,
  fecha_apertura     TIMESTAMP NOT NULL DEFAULT NOW(),
  fecha_cierre       TIMESTAMP,
  dinero_inicial     INT NOT NULL CHECK (dinero_inicial >= 0),
  usuario_apertura_id INT REFERENCES usuarios(id),
  usuario_cierre_id   INT REFERENCES usuarios(id),
  efectivo_esperado  INT,   -- se calcula y se guarda al cerrar
  efectivo_contado   INT,   -- lo que contó el encargado
  diferencia         INT,   -- contado - esperado (negativo = faltante)
  observacion        VARCHAR(200),
  estado             VARCHAR(10) NOT NULL CHECK (estado IN ('abierta', 'cerrada'))
);
CREATE UNIQUE INDEX ux_una_caja_abierta ON cajas(estado) WHERE estado = 'abierta';

-- Efectivo que entra o sale de la caja sin ser una venta.
CREATE TABLE movimientos_caja (
  id           SERIAL PRIMARY KEY,
  caja_id      INT NOT NULL REFERENCES cajas(id) ON DELETE RESTRICT,
  fecha_hora   TIMESTAMP NOT NULL DEFAULT NOW(),
  tipo         VARCHAR(10) NOT NULL CHECK (tipo IN ('entrada', 'salida')),
  motivo       VARCHAR(20) NOT NULL CHECK (motivo IN ('cambio', 'otro_ingreso', 'pago_proveedor', 'retiro', 'gasto', 'otra_salida')),
  monto        INT NOT NULL CHECK (monto > 0),
  descripcion  VARCHAR(200),
  usuario_id   INT REFERENCES usuarios(id)
);

CREATE TABLE pagos_clientes (
  id          SERIAL PRIMARY KEY,
  cliente_id  INT NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
  caja_id     INT NOT NULL REFERENCES cajas(id) ON DELETE RESTRICT,
  fecha_hora  TIMESTAMP NOT NULL DEFAULT NOW(),
  monto       INT NOT NULL CHECK (monto > 0),
  medio_pago  VARCHAR(15) NOT NULL CHECK (medio_pago IN ('efectivo', 'debito', 'credito', 'transferencia')),
  nota        VARCHAR(200),
  usuario_id  INT REFERENCES usuarios(id)
);

-- ---------- Ventas ----------

CREATE TABLE ventas (
  id          SERIAL PRIMARY KEY,
  caja_id     INT NOT NULL REFERENCES cajas(id) ON DELETE RESTRICT,
  usuario_id  INT REFERENCES usuarios(id),          -- quién atendió
  fecha_hora  TIMESTAMP NOT NULL DEFAULT NOW(),
  medio_pago  VARCHAR(15) NOT NULL CHECK (medio_pago IN ('efectivo', 'debito', 'credito', 'transferencia', 'cuenta')),
  cliente_id  INT REFERENCES clientes(id) ON DELETE RESTRICT,
  total       INT NOT NULL,
  ganancia    INT NOT NULL,
  CHECK (medio_pago <> 'cuenta' OR cliente_id IS NOT NULL)   -- fiar exige cliente
);
CREATE INDEX ix_ventas_fecha ON ventas(fecha_hora);
CREATE INDEX ix_ventas_cliente ON ventas(cliente_id);

-- Renglones del ticket, con precio y costo del momento de la venta.
CREATE TABLE detalle_venta (
  id               SERIAL PRIMARY KEY,
  venta_id         INT NOT NULL REFERENCES ventas(id) ON DELETE RESTRICT,
  producto_id      INT NOT NULL REFERENCES productos(id) ON DELETE RESTRICT,
  cantidad         INT NOT NULL CHECK (cantidad > 0),
  precio_unitario  INT NOT NULL,     -- por unidad o por kg
  costo_unitario   INT NOT NULL,     -- promedio de los lotes usados
  es_mayorista     BOOLEAN NOT NULL DEFAULT FALSE
);

-- De qué lote salió cada renglón (FEFO). Productos sin control de stock no tienen filas acá.
CREATE TABLE detalle_venta_lote (
  id                SERIAL PRIMARY KEY,
  detalle_venta_id  INT NOT NULL REFERENCES detalle_venta(id) ON DELETE RESTRICT,
  lote_id           INT NOT NULL REFERENCES lotes(id) ON DELETE RESTRICT,
  cantidad          INT NOT NULL CHECK (cantidad > 0)
);

-- ---------- Configuración ----------

CREATE TABLE configuracion (
  clave  VARCHAR(40) PRIMARY KEY,
  valor  VARCHAR(200) NOT NULL
);
INSERT INTO configuracion VALUES
  ('dias_aviso_vencimiento', '7'),
  -- Datos que salen en el ticket
  ('negocio_nombre', 'Almacén'), ('negocio_direccion', ''), ('negocio_telefono', ''), ('negocio_cuit', ''),
  ('negocio_pie', '¡Gracias por su compra!'),
  -- Impresora de tickets: ancho del papel (58 u 80), qué hacer al vender (preguntar, siempre, nunca) y copias
  ('ticket_ancho', '80'), ('ticket_al_vender', 'preguntar'), ('ticket_copias', '1'),
  -- Balanza etiquetadora: EAN-13 de peso variable = prefijo + PLU + peso o importe + dígito de control
  ('balanza_activa', 'false'), ('balanza_prefijo', '20'), ('balanza_digitos_plu', '5'), ('balanza_valor', 'peso');
-- En productos por peso que se venden con etiqueta de balanza, productos.codigo guarda el PLU.
