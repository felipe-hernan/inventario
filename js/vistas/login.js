/* Ingreso al sistema. No hay registro: los usuarios los crea el administrador. */
(function () {
  const est = { intentos: 0, bloqueadoHasta: 0 };

  App.vistas.login = function () {
    UI.vista().innerHTML = `
      <div class="login d-flex flex-column align-items-center justify-content-center gap-3 px-3 py-5" data-bs-theme="light">
        <div class="card shadow-lg border-0" style="width: min(24rem, 100%)">
          <form class="card-body p-4" data-enviar="login" novalidate>
            <div class="marca-login mb-4">
              <div class="fs-4 fw-bold">Almacén</div>
              <div class="small text-body-secondary">Control de stock</div>
            </div>
            <h1 class="h4 mb-3">Ingresar</h1>
            ${H.error('login-error')}
            ${H.campo('Usuario', `<div class="input-group"><span class="input-group-text"><i class="bi bi-person"></i></span>
              <input class="form-control" name="usuario" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false"></div>`)}
            ${H.campo('Contraseña', `<div class="input-group"><span class="input-group-text"><i class="bi bi-lock"></i></span>
              <input class="form-control" name="clave" type="password" autocomplete="current-password"></div>`)}
            ${H.check('data-cambio="login-ver"', 'Mostrar contraseña', '', 'checkbox', 'mb-3')}
            <button type="submit" class="btn btn-primary btn-lg w-100">Ingresar</button>
            <p class="small text-body-secondary text-center mt-3 mb-0">¿No tenés usuario o te olvidaste la contraseña? Pedíselo al administrador del sistema.</p>
          </form>
        </div>
        <aside class="login-demo rounded-3 p-3 small" style="width: min(24rem, 100%)" aria-label="Usuarios de prueba">
          <div class="fw-bold mb-1">Usuarios de prueba</div>
          <div>Administrador: <code>admin</code> / <code>admin123</code></div>
          <div>Vendedora: <code>laura</code> / <code>laura123</code></div>
        </aside>
      </div>`;
    const usuario = $('[name=usuario]');
    if (usuario) usuario.focus();
  };

  App.cambios['login-ver'] = el => { el.form.elements.clave.type = el.checked ? 'text' : 'password'; };

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
    const barra = bootstrap.Offcanvas.getInstance($('#barra'));
    if (barra) barra.hide();
    UI.cerrarDialogo();
    Sesion.cerrar();
    history.replaceState(null, '', '#inicio');
    UI.render();
  };

  App.acciones['mi-cuenta'] = () => {
    const u = UI.usuario;
    const barra = bootstrap.Offcanvas.getInstance($('#barra'));
    if (barra) barra.hide();
    UI.abrirDialogo({
      titulo: 'Mi cuenta', subtitulo: `${esc(u.nombre)}, usuario «${esc(u.usuario)}», ${ROLES[u.rol].toLowerCase()}`, enviar: 'mi-clave',
      cuerpo: `${H.error()}
        <h3 class="h6 mb-3">Cambiar contraseña</h3>
        ${H.campo('Contraseña actual', '<input class="form-control" name="actual" type="password" autocomplete="current-password" data-foco>')}
        ${H.campo('Contraseña nueva', '<input class="form-control" name="nueva" type="password" autocomplete="new-password">', 'Al menos 6 caracteres.')}
        ${H.campo('Repetí la contraseña nueva', '<input class="form-control" name="repetir" type="password" autocomplete="new-password">')}`,
      pie: UI.pie('Cambiar contraseña')
    }, { ancho: 'chico' });
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
