/* Usuarios: solo el administrador los crea, edita y desactiva. */
(function () {
  App.vistas.usuarios = function () {
    UI.vista().innerHTML = `
      ${H.tituloPagina('Usuarios', '<button type="button" class="btn btn-primary" data-accion="usuario-nuevo"><i class="bi bi-person-plus"></i> Nuevo usuario</button>')}
      <div class="alert alert-light border small">
        Las personas no pueden crearse una cuenta: el administrador carga cada usuario y le pasa su contraseña.
        El <strong>administrador</strong> ve todo el sistema. El <strong>vendedor</strong> vende, cobra fiado, ingresa mercadería y maneja la caja,
        pero no ve productos, informes ni ganancias.
      </div>
      <div class="card shadow-sm"><div class="table-responsive">
        <table class="table table-hover align-middle mb-0">
          <thead><tr><th>Nombre</th><th>Usuario</th><th>Rol</th><th>Estado</th><th></th></tr></thead>
          <tbody>${Logica.usuarios().map(u => `<tr class="${u.activo ? '' : 'text-body-secondary'}">
            <td>${esc(u.nombre)}${u.id === UI.usuario.id ? ' <span class="badge text-bg-light border">vos</span>' : ''}</td>
            <td><code>${esc(u.usuario)}</code></td>
            <td><i class="bi bi-${u.rol === 'admin' ? 'shield-lock' : 'person'}"></i> ${ROLES[u.rol]}</td>
            <td>${u.activo ? '<span class="badge rounded-pill text-bg-success">Activo</span>' : '<span class="badge rounded-pill text-bg-secondary">Desactivado</span>'}</td>
            <td class="text-end"><button type="button" class="btn btn-sm btn-outline-secondary" data-accion="usuario-editar" data-id="${u.id}"><i class="bi bi-pencil"></i> Editar</button></td>
          </tr>`).join('')}</tbody>
        </table>
      </div></div>`;
  };

  function formUsuario(id = null) {
    const u = id ? DB.buscar('usuarios', id) : null;
    UI.abrirDialogo({
      titulo: u ? 'Editar usuario' : 'Nuevo usuario', enviar: 'usuario-guardar', atributos: `data-id="${id || ''}"`,
      cuerpo: `${H.error()}
        ${H.campo('Nombre de la persona', `<input class="form-control" name="nombre" value="${esc(u?.nombre)}" autocomplete="off" data-foco>`)}
        ${H.campo('Usuario para ingresar', `<input class="form-control" name="usuario" value="${esc(u?.usuario)}" autocomplete="off" autocapitalize="none" spellcheck="false">`,
          'Entre 3 y 20 letras o números, sin espacios. Por ejemplo: laura, juan.p')}
        ${H.campo('Rol', `<select class="form-select" name="rol">${Object.entries(ROLES).map(([k, v]) => `<option value="${k}" ${(u ? u.rol : 'vendedor') === k ? 'selected' : ''}>${v}</option>`).join('')}</select>`)}
        ${H.campo(u ? 'Contraseña nueva <span class="fw-normal text-body-secondary">(dejala vacía para no cambiarla)</span>' : 'Contraseña',
          '<input class="form-control" name="clave" type="text" autocomplete="off" spellcheck="false">',
          'Al menos 6 caracteres. Pasásela a la persona; después la puede cambiar desde «Mi cuenta».')}
        ${u ? `<div class="form-check form-switch">${''}<input class="form-check-input" type="checkbox" role="switch" id="u-activo" name="activo" ${u.activo ? 'checked' : ''}>
          <label class="form-check-label" for="u-activo"><strong>Usuario activo</strong><span class="form-text d-block mt-0">Si lo desactivás, no puede ingresar. Sus ventas quedan registradas.</span></label></div>` : ''}`,
      pie: UI.pie('Guardar')
    }, { ancho: 'chico' });
  }

  App.acciones['usuario-nuevo'] = () => formUsuario();
  App.acciones['usuario-editar'] = el => formUsuario(+el.dataset.id);
  App.envios['usuario-guardar'] = form => {
    const f = form.elements;
    const id = form.dataset.id ? +form.dataset.id : null;
    try {
      Logica.guardarUsuario({ nombre: f.nombre.value, usuario: f.usuario.value, rol: f.rol.value, clave: f.clave.value, activo: f.activo ? f.activo.checked : true }, id);
      UI.cerrarDialogo();
      UI.avisar(id ? 'Usuario actualizado' : 'Usuario creado');
      UI.render();
    } catch (e) {
      $('#dlg-error').textContent = e.message;
    }
  };
})();
