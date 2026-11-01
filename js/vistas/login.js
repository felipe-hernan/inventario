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
            <p class="text-center mt-3 mb-1"><button type="button" class="btn btn-link btn-sm" data-accion="recuperar-abrir">¿Olvidaste tu contraseña?</button></p>
            <p class="small text-body-secondary text-center mb-0">¿No tenés usuario? Pedíselo al administrador del negocio.</p>
          </form>
        </div>
        <aside class="login-demo rounded-3 p-3 small" style="width: min(24rem, 100%)" aria-label="Usuarios de prueba">
          <div class="fw-bold mb-1">Usuarios de prueba</div>
          <div>Administrador: <code>admin</code> / <code>admin123</code></div>
          <div>Vendedora: <code>laura</code> / <code>laura123</code></div>
          <div>Soporte técnico: <code>soporte</code> / <code>soporte123</code> (el administrador tiene que habilitarlo)</div>
          <div class="mt-1">Código de recuperación de <code>admin</code>: <code>RECU-PERA-2026</code></div>
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

  // ---------- ¿Olvidaste tu contraseña? ----------
  App.acciones['recuperar-abrir'] = () => {
    UI.abrirDialogo({
      titulo: 'Recuperar contraseña', enviar: 'recuperar',
      cuerpo: `<p class="small"><strong>Administradores:</strong> usá el código de recuperación que guardaste al crear tu contraseña.<br>
          <strong>Vendedores:</strong> pedile al administrador que te cargue una contraseña provisoria.</p>
        ${H.error()}
        ${H.campo('Usuario', '<input class="form-control" name="usuario" autocomplete="username" autocapitalize="none" spellcheck="false" data-foco>')}
        ${H.campo('Código de recuperación', '<input class="form-control font-monospace text-uppercase" name="codigo" placeholder="XXXX-XXXX-XXXX" autocomplete="off" spellcheck="false">')}
        ${H.campo('Contraseña nueva', '<input class="form-control" name="nueva" type="password" autocomplete="new-password">', 'Al menos 6 caracteres.')}
        ${H.campo('Repetí la contraseña nueva', '<input class="form-control" name="repetir" type="password" autocomplete="new-password">')}
        <p class="small text-body-secondary mb-0">¿Tampoco tenés el código? Si hay otro administrador, puede cargarte una contraseña provisoria. Si no, contactá al soporte técnico.</p>`,
      pie: UI.pie('Cambiar contraseña')
    }, { ancho: 'chico' });
  };
  App.envios.recuperar = form => {
    const f = form.elements, err = $('#dlg-error');
    const espera = Math.ceil((est.bloqueadoHasta - Date.now()) / 1000);
    if (espera > 0) { err.textContent = `Demasiados intentos. Esperá ${espera} segundos.`; return; }
    if (f.nueva.value !== f.repetir.value) { err.textContent = 'Las contraseñas nuevas no coinciden.'; return; }
    try {
      const r = Logica.recuperarConCodigo(f.usuario.value, f.codigo.value, f.nueva.value);
      est.intentos = 0;
      Sesion.iniciar(r.usuario);
      location.hash = 'inicio';
      UI.render();
      UI.mostrarCodigo(r.codigo, 'Listo, tu contraseña se cambió. El código que usaste ya no sirve: este es el nuevo.');
    } catch (e) {
      est.intentos += 1;
      if (est.intentos >= 5) { est.bloqueadoHasta = Date.now() + 30000; est.intentos = 0; err.textContent = 'Demasiados intentos. Esperá 30 segundos.'; }
      else err.textContent = e.message;
    }
  };

  // ---------- Cambio obligatorio de la contraseña provisoria ----------
  App.vistas.cambioClave = function () {
    const u = UI.usuario;
    UI.vista().innerHTML = `
      <div class="login d-flex flex-column align-items-center justify-content-center gap-3 px-3 py-5" data-bs-theme="light">
        <div class="card shadow-lg border-0" style="width: min(26rem, 100%)">
          <form class="card-body p-4" data-enviar="cambio-clave" novalidate>
            <div class="marca-login mb-4"><div class="fs-4 fw-bold">Almacén</div><div class="small text-body-secondary">Control de stock</div></div>
            <h1 class="h4">Hola, ${esc(u.nombre)}</h1>
            <p class="text-body-secondary">Estás usando una contraseña provisoria. Elegí una nueva: solo vos la vas a conocer, nadie más puede verla.</p>
            ${H.error('cambio-error')}
            ${H.campo('Contraseña nueva', '<input class="form-control" name="nueva" type="password" autocomplete="new-password">', 'Al menos 6 caracteres.')}
            ${H.campo('Repetí la contraseña nueva', '<input class="form-control" name="repetir" type="password" autocomplete="new-password">')}
            <button type="submit" class="btn btn-primary btn-lg w-100">Guardar y entrar</button>
            <p class="text-center mt-3 mb-0"><button type="button" class="btn btn-link btn-sm" data-accion="sesion-salir">Salir</button></p>
          </form>
        </div>
      </div>`;
    const campo = $('[name=nueva]');
    if (campo) campo.focus();
  };
  App.envios['cambio-clave'] = form => {
    const f = form.elements, err = $('#cambio-error');
    if (f.nueva.value !== f.repetir.value) { err.textContent = 'Las contraseñas no coinciden.'; return; }
    try {
      const r = Logica.cambiarClaveObligatoria(f.nueva.value);
      UI.render();
      if (r.codigo) UI.mostrarCodigo(r.codigo, 'Como sos administrador, te generamos un código para recuperar tu contraseña si alguna vez la olvidás.');
      else UI.avisar('Contraseña actualizada');
    } catch (e) { err.textContent = e.message; }
  };

  App.acciones['codigo-nuevo'] = () => {
    if (!confirm('Se va a generar un código nuevo y el anterior deja de servir. ¿Seguir?')) return;
    try { UI.mostrarCodigo(Logica.generarCodigoRecuperacion(), 'Este es tu código de recuperación nuevo. El anterior ya no sirve.'); }
    catch (e) { UI.avisar(e.message); }
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
        ${H.campo('Repetí la contraseña nueva', '<input class="form-control" name="repetir" type="password" autocomplete="new-password">')}
        ${u.rol === 'admin' ? `<hr><h3 class="h6">Código de recuperación</h3>
          <p class="small text-body-secondary">Sirve para recuperar tu contraseña si la olvidás. Si lo perdiste, generá uno nuevo y guardalo.</p>
          <button type="button" class="btn btn-outline-secondary btn-sm" data-accion="codigo-nuevo"><i class="bi bi-key"></i> Generar código nuevo</button>` : ''}`,
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
