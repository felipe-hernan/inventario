/* Ingreso al sistema. No hay registro: los usuarios los crea el administrador. */
(function () {
  const est = { intentos: 0, bloqueadoHasta: 0 };

  App.vistas.login = function () {
    UI.vista().innerHTML = `
      <div class="login">
        <form class="login-tarjeta" data-enviar="login" novalidate>
          <div class="login-marca">
            <span class="marca-nombre">Almacén</span>
            <span class="marca-sub">Control de stock</span>
          </div>
          <h1>Ingresar</h1>
          <p class="error" id="login-error" role="alert"></p>
          <label class="campo">Usuario
            <input name="usuario" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" data-foco>
          </label>
          <label class="campo">Contraseña
            <input name="clave" type="password" autocomplete="current-password">
          </label>
          <label class="opcion"><input type="checkbox" data-cambio="login-ver"> Mostrar contraseña</label>
          <button type="submit" class="boton boton-grande boton-ancho">Ingresar</button>
          <p class="ayuda login-ayuda">¿No tenés usuario o te olvidaste la contraseña? Pedíselo al administrador del sistema.</p>
        </form>
        <aside class="login-demo" aria-label="Usuarios de prueba">
          <p><strong>Usuarios de prueba</strong></p>
          <p>Administrador: <code>admin</code> / <code>admin123</code></p>
          <p>Vendedora: <code>laura</code> / <code>laura123</code></p>
        </aside>
      </div>`;
    const usuario = $('[name=usuario]');
    if (usuario) usuario.focus();
  };

  App.cambios['login-ver'] = el => {
    el.form.elements.clave.type = el.checked ? 'text' : 'password';
  };

  App.envios.login = form => {
    const err = $('#login-error');
    const espera = Math.ceil((est.bloqueadoHasta - Date.now()) / 1000);
    if (espera > 0) { err.textContent = `Demasiados intentos. Esperá ${espera} segundos.`; return; }
    try {
      const u = Logica.validarLogin(form.elements.usuario.value, form.elements.clave.value);
      est.intentos = 0;
      Sesion.iniciar(u);
      location.hash = 'inicio';
      UI.render();
      UI.avisar(`Hola, ${u.nombre}`);
    } catch (e) {
      est.intentos += 1;
      if (est.intentos >= 5) {
        est.bloqueadoHasta = Date.now() + 30000;
        est.intentos = 0;
        err.textContent = 'Demasiados intentos. Esperá 30 segundos.';
      } else {
        err.textContent = e.message;
      }
      form.elements.clave.value = '';
      form.elements.clave.focus();
    }
  };

  App.acciones['sesion-salir'] = () => {
    const carrito = App.estado.venta && App.estado.venta.carrito.length;
    if (carrito && !confirm('Hay un ticket sin cobrar. Si salís, se descarta. ¿Salir igual?')) return;
    if (App.estado.venta) { App.estado.venta.carrito = []; App.estado.venta.sel = null; }
    UI.cerrarDialogo();
    Sesion.cerrar();
    history.replaceState(null, '', '#inicio');
    UI.render();
  };

  // Mi cuenta: cada usuario puede cambiar su propia contraseña.
  App.acciones['mi-cuenta'] = () => {
    const u = UI.usuario;
    UI.abrirDialogo(`
      <form class="dlg-cuerpo" data-enviar="mi-clave" novalidate>
        ${UI.cabecera('Mi cuenta', `${esc(u.nombre)}, usuario «${esc(u.usuario)}», ${ROLES[u.rol].toLowerCase()}`)}
        <p class="error" id="dlg-error" role="alert"></p>
        <h3 class="sin-margen">Cambiar contraseña</h3>
        <label class="campo">Contraseña actual
          <input name="actual" type="password" autocomplete="current-password" data-foco>
        </label>
        <label class="campo">Contraseña nueva
          <input name="nueva" type="password" autocomplete="new-password">
          <span class="ayuda">Al menos 6 caracteres.</span>
        </label>
        <label class="campo">Repetí la contraseña nueva
          <input name="repetir" type="password" autocomplete="new-password">
        </label>
        <div class="dlg-pie">
          <span class="espacio"></span>
          <button type="button" class="boton boton-sec" data-accion="dlg-cerrar">Cancelar</button>
          <button type="submit" class="boton">Cambiar contraseña</button>
        </div>
      </form>`, { ancho: 'chico' });
  };

  App.envios['mi-clave'] = form => {
    const f = form.elements;
    const err = $('#dlg-error');
    if (f.nueva.value !== f.repetir.value) { err.textContent = 'Las contraseñas nuevas no coinciden.'; return; }
    try {
      Logica.cambiarClavePropia(f.actual.value, f.nueva.value);
      UI.cerrarDialogo();
      UI.avisar('Contraseña actualizada');
    } catch (e) {
      err.textContent = e.message;
    }
  };
})();
