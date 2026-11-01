-- =====================================================================
-- Sistema de stock para almacén: modelo de base de datos (versión 5, con soporte técnico y auditoría)
-- Pensado para PostgreSQL. Montos en pesos enteros.
-- Productos por peso: stock y cantidades en gramos, precios por kilo.
-- =====================================================================

-- ---------- Usuarios ----------

-- No hay registro público: los usuarios los crea el administrador.
CREATE TABLE usuarios (
  id                        SERIAL PRIMARY KEY,
  nombre                    VARCHAR(100) NOT NULL,
  usuario                   VARCHAR(20) NOT NULL UNIQUE,      -- en minúsculas, sin espacios
  clave_hash                VARCHAR(100) NOT NULL,            -- bcrypt o Argon2: nunca la contraseña
  rol                       VARCHAR(10) NOT NULL CHECK (rol IN ('admin', 'vendedor', 'soporte')),
  activo                    BOOLEAN NOT NULL DEFAULT TRUE,
  protegido                 BOOLEAN NOT NULL DEFAULT FALSE,   -- el usuario de soporte: no se puede eliminar
  acceso_hasta              TIMESTAMP,                        -- soporte: habilitado hasta esta hora (lo define el admin)
  debe_cambiar_clave        BOOLEAN NOT NULL DEFAULT TRUE,    -- contraseña provisoria: se cambia al ingresar
  codigo_recuperacion_hash  VARCHAR(100),                     -- admins: código de un solo uso, guardado como hash
  email                     VARCHAR(150) UNIQUE,              -- obligatorio para admin y soporte; opcional para vendedores
  email_verificado_en       TIMESTAMP,                        -- a futuro: se completa al confirmar el link de verificación
  fecha_alta                DATE NOT NULL DEFAULT CURRENT_DATE
);
CREATE UNIQUE INDEX ux_un_solo_soporte ON usuarios(rol) WHERE rol = 'soporte';
ALTER TABLE usuarios ADD CONSTRAINT ck_email_obligatorio CHECK (rol NOT IN ('admin', 'soporte') OR email IS NOT NULL);

-- Quién hizo qué con usuarios y accesos: altas, reseteos, cambios de rol, soporte, recuperaciones.
CREATE TABLE auditoria (
  id              SERIAL PRIMARY KEY,
  fecha_hora      TIMESTAMP NOT NULL DEFAULT NOW(),
  usuario_id      INT REFERENCES usuarios(id) ON DELETE SET NULL,  -- NULL = comando del servidor
  usuario_nombre  VARCHAR(100) NOT NULL,                           -- se guarda por si el usuario se elimina
  accion          VARCHAR(100) NOT NULL,
  detalle         VARCHAR(300)
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

-- (se crea después de medios_pago, ver más abajo)

-- ---------- Ventas ----------

-- ---------- Medios de pago (catálogo que configura el administrador) ----------

-- Cada cuenta o posnet es un medio aparte. El tipo define el comportamiento y es fijo.
CREATE TABLE medios_pago (
  id      SERIAL PRIMARY KEY,
  nombre  VARCHAR(60) NOT NULL UNIQUE,                 -- «Transferencia Banco Nación», «Débito Payway»…
  tipo    VARCHAR(15) NOT NULL CHECK (tipo IN ('efectivo', 'debito', 'credito', 'transferencia', 'cuenta')),
  activo  BOOLEAN NOT NULL DEFAULT TRUE,               -- se desactiva en lugar de borrarse si ya tiene cobros
  orden   INT NOT NULL                                 -- orden en la pantalla de cobro
);
CREATE UNIQUE INDEX ux_un_solo_fiado ON medios_pago(tipo) WHERE tipo = 'cuenta';

CREATE TABLE ventas (
  id          SERIAL PRIMARY KEY,
  caja_id     INT NOT NULL REFERENCES cajas(id) ON DELETE RESTRICT,
  usuario_id  INT REFERENCES usuarios(id),          -- quién atendió
  fecha_hora  TIMESTAMP NOT NULL DEFAULT NOW(),     -- la pone el servidor
  cliente_id  INT REFERENCES clientes(id) ON DELETE RESTRICT,  -- si una parte se fió
  total       INT NOT NULL,
  ganancia    INT NOT NULL
  -- El medio de pago ya no está acá: una venta puede tener varios pagos (pagos_venta).
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

-- ---------- Pagos ----------

-- Cada pago de una venta. Una venta puede tener varios (pago mixto); la suma da el total.
-- Los campos opcionales se usan según el tipo del medio.
CREATE TABLE pagos_venta (
  id                   SERIAL PRIMARY KEY,
  venta_id             INT NOT NULL REFERENCES ventas(id) ON DELETE RESTRICT,
  caja_id              INT REFERENCES cajas(id),             -- turno en el que entró la plata
  medio_pago_id        INT NOT NULL REFERENCES medios_pago(id),
  monto                INT NOT NULL CHECK (monto > 0),
  fecha_hora           TIMESTAMP NOT NULL DEFAULT NOW(),
  usuario_id           INT REFERENCES usuarios(id),
  -- efectivo
  recibido             INT,                                  -- «paga con»
  vuelto               INT,
  -- débito y crédito (nunca el número completo de la tarjeta)
  cupon                VARCHAR(20),
  cuotas               INT CHECK (cuotas BETWEEN 1 AND 24),
  -- fiado
  cliente_id           INT REFERENCES clientes(id),
  -- transferencia
  numero_operacion     VARCHAR(40),
  titular              VARCHAR(100),
  estado_verificacion  VARCHAR(12) CHECK (estado_verificacion IN ('pendiente', 'verificada', 'rechazada')),
  metodo_verificacion  VARCHAR(12) CHECK (metodo_verificacion IN ('manual', 'automatico')),  -- automático: futuro, con Mercado Pago
  verificado_por       INT REFERENCES usuarios(id),
  verificado_en        TIMESTAMP,                            -- la pone el servidor
  motivo_rechazo       VARCHAR(200),
  autorizado_por       INT REFERENCES usuarios(id),          -- si el admin autorizó un número de operación repetido
  motivo_autorizacion  VARCHAR(200),
  resuelto_con         INT REFERENCES pagos_venta(id),       -- pago que reemplazó a uno rechazado
  CHECK (recibido IS NULL OR recibido >= monto),
  CHECK (estado_verificacion IS NULL OR numero_operacion IS NOT NULL),
  CHECK (estado_verificacion <> 'pendiente' OR (metodo_verificacion IS NULL AND verificado_por IS NULL AND verificado_en IS NULL)),
  CHECK (estado_verificacion NOT IN ('verificada', 'rechazada') OR (metodo_verificacion IS NOT NULL AND verificado_en IS NOT NULL)),
  CHECK (metodo_verificacion <> 'manual' OR verificado_por IS NOT NULL),
  CHECK (estado_verificacion <> 'rechazada' OR motivo_rechazo IS NOT NULL)
);
CREATE INDEX ix_pagos_venta_venta ON pagos_venta(venta_id);
CREATE INDEX ix_pagos_venta_pendientes ON pagos_venta(estado_verificacion) WHERE estado_verificacion = 'pendiente';
-- El número de operación no se repite en la misma cuenta. Si el administrador autoriza un repetido,
-- se valida en el servidor (por eso no es un índice UNIQUE estricto).

-- Cobros de deudas de fiado: mismos datos de medio y verificación.
CREATE TABLE pagos_clientes (
  id                   SERIAL PRIMARY KEY,
  cliente_id           INT NOT NULL REFERENCES clientes(id) ON DELETE RESTRICT,
  caja_id              INT NOT NULL REFERENCES cajas(id) ON DELETE RESTRICT,
  medio_pago_id        INT NOT NULL REFERENCES medios_pago(id),
  fecha_hora           TIMESTAMP NOT NULL DEFAULT NOW(),
  monto                INT NOT NULL CHECK (monto > 0),
  usuario_id           INT REFERENCES usuarios(id),
  recibido             INT, vuelto INT, cupon VARCHAR(20), cuotas INT,
  numero_operacion     VARCHAR(40), titular VARCHAR(100),
  estado_verificacion  VARCHAR(12) CHECK (estado_verificacion IN ('pendiente', 'verificada', 'rechazada')),
  metodo_verificacion  VARCHAR(12), verificado_por INT REFERENCES usuarios(id), verificado_en TIMESTAMP,
  motivo_rechazo       VARCHAR(200), autorizado_por INT REFERENCES usuarios(id), motivo_autorizacion VARCHAR(200)
);

-- Historial de cada cambio de estado de una transferencia (quién, cuándo y por qué).
CREATE TABLE verificaciones_pago (
  id               SERIAL PRIMARY KEY,
  origen           VARCHAR(10) NOT NULL CHECK (origen IN ('venta', 'cobro')),  -- pagos_venta o pagos_clientes
  pago_id          INT NOT NULL,
  estado_anterior  VARCHAR(12),
  estado_nuevo     VARCHAR(12) NOT NULL,
  metodo           VARCHAR(12) NOT NULL,
  usuario_id       INT REFERENCES usuarios(id),
  fecha_hora       TIMESTAMP NOT NULL DEFAULT NOW(),
  motivo           VARCHAR(200)
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
  ('balanza_activa', 'false'), ('balanza_prefijo', '20'), ('balanza_digitos_plu', '5'), ('balanza_valor', 'peso'),
  -- Transferencias: verificar antes de confirmar ('antes') o permitir después ('libre'); si el vendedor puede verificar; aviso en minutos
  ('transferencias_modo', 'antes'), ('transferencias_vendedor_verifica', 'true'), ('transferencias_minutos_aviso', '10');
-- En productos por peso que se venden con etiqueta de balanza, productos.codigo guarda el PLU.
