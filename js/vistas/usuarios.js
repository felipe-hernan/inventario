/* Usuarios: alta, contraseñas provisorias, acceso de soporte técnico y auditoría. */
(function () {
  App.vistas.usuarios = function () {
    const esAdmin = UI.esAdmin();
    const soporte = Logica.usuarioSoporte();
    const vigente = Logica.accesoSoporteVigente(soporte);
    UI.vista().innerHTML = `
      ${H.tituloPagina('Usuarios', '<button type="button" class="btn btn-primary" data-accion="usuario-nuevo"><i class="bi bi-person-plus"></i> Nuevo usuario</button>')}
      ${UI.usuario.rol === 'soporte' ? `<div class="alert alert-info"><i class="bi bi-tools"></i>
        Estás con acceso de soporte técnico hasta el ${Formato.fecha(UI.usuario.acceso_hasta)} a las ${Formato.hora(UI.usuario.acceso_hasta)}.
        Todo lo que hagas queda registrado y lo ve el administrador.</div>` : ''}
      <div class="alert alert-light border small">
        Nadie puede crearse una cuenta: el administrador carga cada usuario con una <strong>contraseña provisoria</strong>,
        y la persona la cambia al ingresar por primera vez. Nadie, ni el administrador ni el soporte, puede ver las contraseñas: solo cargar una provisoria nueva.
        Un usuario con operaciones registradas no se elimina, se desactiva. Siempre tiene que quedar al menos un administrador activo.
      </div>

      ${esAdmin && soporte ? `
      <section class="card shadow-sm mb-4 ${vigente ? 'border-warning' : ''}"><div class="card-body d-flex flex-wrap justify-content-between align-items-center gap-3">
        <div>
          <h2 class="h6 mb-1"><i class="bi bi-tools"></i> Acceso de soporte técnico</h2>
          <div class="small text-body-secondary">Para que el desarrollador del sistema pueda entrar a resolver un problema. Solo ve Usuarios y Configuración: no ve ventas, caja, clientes ni informes.</div>
          <div class="mt-2">${vigente
            ? `<span class="badge text-bg-warning">Habilitado</span> hasta el ${Formato.fecha(soporte.acceso_hasta)} a las ${Formato.hora(soporte.acceso_hasta)}`
            : '<span class="badge text-bg-secondary">Deshabilitado</span> No puede ingresar.'}</div>
        </div>
        ${vigente
          ? '<button type="button" class="btn btn-outline-danger" data-accion="soporte-deshabilitar"><i class="bi bi-lock"></i> Deshabilitar ahora</button>'
          : `<button type="button" class="btn btn-outline-primary" data-accion="soporte-habilitar"><i class="bi bi-unlock"></i> Habilitar por ${HORAS_SOPORTE} horas</button>`}
      </div></section>` : ''}

      <div class="card shadow-sm mb-4"><div class="table-responsive">
        <table class="table table-hover align-middle mb-0">
          <thead><tr><th>Nombre</th><th>Usuario</th><th>Rol</th><th>Estado</th><th></th></tr></thead>
          <tbody>${Logica.usuarios().map(u => `<tr class="${u.activo ? '' : 'text-body-secondary'}">
            <td>${esc(u.nombre)}${u.id === UI.usuario.id ? ' <span class="badge text-bg-light border">vos</span>' : ''}
              ${u.protegido ? ' <span class="badge text-bg-light border" title="No se puede eliminar"><i class="bi bi-shield-lock"></i> Protegido</span>' : ''}
              <span class="sub">${u.email ? `<i class="bi bi-envelope"></i> ${esc(u.email)}` : (ROLES_CON_EMAIL.includes(u.rol) ? '<span class="text-danger"><i class="bi bi-exclamation-circle"></i> Falta el correo</span>' : 'Sin correo')}</span></td>
            <td><code>${esc(u.usuario)}</code></td>
            <td><i class="bi bi-${{ admin: 'shield-lock', vendedor: 'person', soporte: 'tools' }[u.rol]}"></i> ${ROLES[u.rol]}</td>
            <td>${estadoUsuario(u)}</td>
            <td class="text-end">${u.protegido ? '' : `<button type="button" class="btn btn-sm btn-outline-secondary" data-accion="usuario-editar" data-id="${u.id}"><i class="bi bi-pencil"></i> Editar</button>`}</td>
          </tr>`).join('')}</tbody>
        </table>
      </div></div>

      ${esAdmin ? `
      <section>
        <h2 class="h5"><i class="bi bi-journal-text"></i> Actividad de usuarios y accesos</h2>
        <p class="small text-body-secondary">Altas, contraseñas reseteadas, cambios de rol, accesos de soporte y recuperaciones de contraseña.</p>
        <div class="card shadow-sm"><div class="table-responsive">
          <table class="table table-sm align-middle mb-0">
            <thead><tr><th>Fecha</th><th>Quién</th><th>Qué hizo</th></tr></thead>
            <tbody>${Logica.auditoria(30).map(a => `<tr>
              <td class="text-nowrap">${Formato.fechaHora(a.fecha_hora)}</td>
              <td>${esc(a.usuario_nombre)}</td>
              <td>${esc(a.accion)}${a.detalle ? `<span class="sub">${esc(a.detalle)}</span>` : ''}</td></tr>`).join('')
              || '<tr><td colspan="3" class="text-body-secondary fst-italic">Todavía no hay actividad registrada.</td></tr>'}</tbody>
          </table>
        </div></div>
      </section>` : ''}`;
  };

  function estadoUsuario(u) {
    if (u.rol === 'soporte') {
      return Logica.accesoSoporteVigente(u)
        ? `<span class="badge rounded-pill text-bg-warning">Habilitado hasta ${Formato.hora(u.acceso_hasta)}</span>`
        : '<span class="badge rounded-pill text-bg-secondary">Deshabilitado</span>';
    }
    if (!u.activo) return '<span class="badge rounded-pill text-bg-secondary">Desactivado</span>';
    if (u.debe_cambiar_clave) return '<span class="badge rounded-pill text-bg-info">Contraseña provisoria</span>';
    return '<span class="badge rounded-pill text-bg-success">Activo</span>';
  }

  function formUsuario(id = null) {
    const u = id ? DB.buscar('usuarios', id) : null;
    const propio = u && u.id === UI.usuario.id;
    const roles = Object.entries(ROLES).filter(([k]) => k !== 'soporte');
    UI.abrirDialogo({
      titulo: u ? 'Editar usuario' : 'Nuevo usuario', enviar: 'usuario-guardar', atributos: `data-id="${id || ''}"`,
      cuerpo: `${H.error()}
        ${H.campo('Nombre de la persona', `<input class="form-control" name="nombre" value="${esc(u?.nombre)}" autocomplete="off" data-foco>`)}
        ${H.campo('Usuario para ingresar', `<input class="form-control" name="usuario" value="${esc(u?.usuario)}" autocomplete="off" autocapitalize="none" spellcheck="false">`,
          'Entre 3 y 20 letras o números, sin espacios. Por ejemplo: laura, juan.p')}
        ${H.campo('Rol', `<select class="form-select" name="rol" data-cambio="u-rol">${roles.map(([k, v]) => `<option value="${k}" ${(u ? u.rol : 'vendedor') === k ? 'selected' : ''}>${v}</option>`).join('')}</select>`)}
        ${H.campo(`Correo electrónico <span class="fw-normal text-body-secondary" id="u-email-nota">${etiquetaEmail(u ? u.rol : 'vendedor')}</span>`,
          `<input class="form-control" name="email" type="email" value="${esc(u?.email)}" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="nombre@ejemplo.com">`,
          'Más adelante se va a usar para recuperar la contraseña y para la verificación en dos pasos.')}
        ${propio ? '<p class="small text-body-secondary">Tu propia contraseña se cambia desde «Mi cuenta», abajo en la barra lateral.</p><input type="hidden" name="clave" value="">'
          : H.campo(u ? 'Resetear contraseña <span class="fw-normal text-body-secondary">(opcional)</span>' : 'Contraseña provisoria',
            '<input class="form-control" name="clave" type="text" autocomplete="off" spellcheck="false">',
            u ? 'Si la persona olvidó su contraseña, cargá una provisoria. Al ingresar la va a tener que cambiar, y vos no vas a conocer la definitiva.'
              : 'Al menos 6 caracteres. Pasásela a la persona: al ingresar la va a tener que cambiar, y vos no vas a conocer la definitiva.')}
        ${u && !propio ? `<div class="form-check form-switch">
          <input class="form-check-input" type="checkbox" role="switch" id="u-activo" name="activo" ${u.activo ? 'checked' : ''}>
          <label class="form-check-label" for="u-activo"><strong>Usuario activo</strong><span class="form-text d-block mt-0">Si lo desactivás, no puede ingresar. Sus operaciones quedan registradas.</span></label></div>` : ''}`,
      pie: UI.pie('Guardar', {
        izquierda: u && !propio && UI.esAdmin()
          ? `<button type="button" class="btn btn-outline-danger" data-accion="usuario-borrar" data-id="${u.id}"><i class="bi bi-trash"></i> Eliminar</button>` : ''
      })
    }, { ancho: 'chico' });
  }

  function etiquetaEmail(rol) { return ROLES_CON_EMAIL.includes(rol) ? '(obligatorio para administradores)' : '(opcional)'; }
  App.cambios['u-rol'] = el => { $('#u-email-nota').textContent = etiquetaEmail(el.value); };

  App.acciones['usuario-nuevo'] = () => formUsuario();
  App.acciones['usuario-editar'] = el => formUsuario(+el.dataset.id);
  App.envios['usuario-guardar'] = form => {
    const f = form.elements;
    const id = form.dataset.id ? +form.dataset.id : null;
    try {
      const u = Logica.guardarUsuario({ nombre: f.nombre.value, usuario: f.usuario.value, rol: f.rol.value, email: f.email.value, clave: f.clave.value, activo: f.activo ? f.activo.checked : true }, id);
      UI.cerrarDialogo();
      UI.avisar(!id ? `Usuario creado. Pasale la contraseña provisoria a ${u.nombre}.` : f.clave.value ? `Contraseña provisoria cargada para ${u.nombre}.` : 'Usuario actualizado');
      UI.render();
    } catch (e) {
      $('#dlg-error').textContent = e.message;
    }
  };

  App.acciones['soporte-habilitar'] = () => {
    if (!confirm(`¿Habilitar el acceso de soporte técnico por ${HORAS_SOPORTE} horas?\n\nVa a poder crear usuarios, cargar contraseñas provisorias y cambiar la configuración. No va a ver ventas, caja, clientes ni informes. Todo lo que haga queda registrado.`)) return;
    try { Logica.habilitarSoporte(); UI.avisar('Acceso de soporte habilitado'); UI.render(); } catch (e) { UI.avisar(e.message); }
  };
  App.acciones['soporte-deshabilitar'] = () => {
    try { Logica.deshabilitarSoporte(); UI.avisar('Acceso de soporte deshabilitado'); UI.render(); } catch (e) { UI.avisar(e.message); }
  };

  App.acciones['usuario-borrar'] = el => {
    const u = DB.buscar('usuarios', +el.dataset.id);
    const motivo = Logica.motivoNoBorrarUsuario(u.id);
    // Si es el último administrador, tampoco se puede desactivar: solo se avisa
    if (motivo && motivo.startsWith('es el único administrador')) {
      alert(`${u.nombre} no se puede eliminar ni desactivar porque ${motivo}. Primero creá o activá otro administrador.`);
      return;
    }
    if (motivo) {
      if (!u.activo) { alert(`${u.nombre} no se puede eliminar porque ${motivo}. Ya está desactivado, así que no puede ingresar.`); return; }
      if (!confirm(`${u.nombre} no se puede eliminar porque ${motivo}: se perdería quién hizo cada una.\n\n¿Desactivarlo? No va a poder ingresar y su historial se conserva.`)) return;
      try {
        Logica.guardarUsuario({ nombre: u.nombre, usuario: u.usuario, rol: u.rol, email: u.email, activo: false }, u.id);
        UI.cerrarDialogo(); UI.avisar('Usuario desactivado'); UI.render();
      } catch (e) { $('#dlg-error').textContent = e.message; }
      return;
    }
    if (!confirm(`¿Eliminar a ${u.nombre} (usuario «${u.usuario}», ${ROLES[u.rol].toLowerCase()}) definitivamente?`)) return;
    try {
      Logica.borrarUsuario(u.id);
      UI.cerrarDialogo(); UI.avisar('Usuario eliminado'); UI.render();
    } catch (e) { $('#dlg-error').textContent = e.message; }
  };
})();
