/* Usuarios: solo el administrador los crea, edita y desactiva. */
(function () {
  App.vistas.usuarios = function () {
    const lista = Logica.usuarios();
    UI.vista().innerHTML = `
      <div class="titulo-fila">
        <h1>Usuarios</h1>
        <button type="button" class="boton" data-accion="usuario-nuevo">Nuevo usuario</button>
      </div>
      <p class="ayuda">Las personas no pueden crearse una cuenta: el administrador carga cada usuario y le pasa su contraseña.
        El <strong>administrador</strong> ve todo el sistema. El <strong>vendedor</strong> vende, cobra fiado, ingresa mercadería y maneja la caja,
        pero no ve productos, informes ni ganancias.</p>
      <div class="tabla-envoltura">
        <table class="tabla">
          <thead><tr><th scope="col">Nombre</th><th scope="col">Usuario</th><th scope="col">Rol</th><th scope="col">Estado</th><th scope="col"><span class="solo-lector">Acciones</span></th></tr></thead>
          <tbody>${lista.map(u => `<tr class="${u.activo ? '' : 'fila-baja'}">
            <td>${esc(u.nombre)}${u.id === UI.usuario.id ? ' <span class="sub-inline">(vos)</span>' : ''}</td>
            <td><code>${esc(u.usuario)}</code></td>
            <td>${ROLES[u.rol]}</td>
            <td>${u.activo ? '<span class="etiqueta etiqueta-verde">Activo</span>' : '<span class="etiqueta etiqueta-gris">Desactivado</span>'}</td>
            <td class="num"><button type="button" class="boton boton-sec boton-chico" data-accion="usuario-editar" data-id="${u.id}">Editar</button></td>
          </tr>`).join('')}</tbody>
        </table>
      </div>`;
  };

  function formUsuario(id = null) {
    const u = id ? DB.buscar('usuarios', id) : null;
    UI.abrirDialogo(`
      <form class="dlg-cuerpo" data-enviar="usuario-guardar" data-id="${id || ''}" novalidate>
        ${UI.cabecera(u ? 'Editar usuario' : 'Nuevo usuario')}
        <p class="error" id="dlg-error" role="alert"></p>
        <label class="campo">Nombre de la persona
          <input name="nombre" value="${esc(u?.nombre)}" autocomplete="off" data-foco>
        </label>
        <label class="campo">Usuario para ingresar
          <input name="usuario" value="${esc(u?.usuario)}" autocomplete="off" autocapitalize="none" spellcheck="false">
          <span class="ayuda">Entre 3 y 20 letras o números, sin espacios. Por ejemplo: laura, juan.p</span>
        </label>
        <label class="campo">Rol
          <select name="rol">${Object.entries(ROLES).map(([k, v]) => `<option value="${k}" ${(u ? u.rol : 'vendedor') === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
        </label>
        <label class="campo">${u ? 'Contraseña nueva <span class="opcional">(dejala vacía para no cambiarla)</span>' : 'Contraseña'}
          <input name="clave" type="text" autocomplete="off" spellcheck="false">
          <span class="ayuda">Al menos 6 caracteres. Pasásela a la persona; después la puede cambiar desde «Mi cuenta».</span>
        </label>
        ${u ? `<label class="opcion caja-opcion"><input type="checkbox" name="activo" ${u.activo ? 'checked' : ''}>
          <span><strong>Usuario activo</strong><br><span class="ayuda">Si lo desactivás, no puede ingresar. Sus ventas quedan registradas.</span></span></label>` : ''}
        <div class="dlg-pie">
          <span class="espacio"></span>
          <button type="button" class="boton boton-sec" data-accion="dlg-cerrar">Cancelar</button>
          <button type="submit" class="boton">Guardar</button>
        </div>
      </form>`, { ancho: 'chico' });
  }

  App.acciones['usuario-nuevo'] = () => formUsuario();
  App.acciones['usuario-editar'] = el => formUsuario(+el.dataset.id);
  App.envios['usuario-guardar'] = form => {
    const f = form.elements;
    const id = form.dataset.id ? +form.dataset.id : null;
    try {
      Logica.guardarUsuario({
        nombre: f.nombre.value, usuario: f.usuario.value, rol: f.rol.value,
        clave: f.clave.value, activo: f.activo ? f.activo.checked : true
      }, id);
      UI.cerrarDialogo();
      UI.avisar(id ? 'Usuario actualizado' : 'Usuario creado');
      UI.render();
    } catch (e) {
      $('#dlg-error').textContent = e.message;
    }
  };
})();
